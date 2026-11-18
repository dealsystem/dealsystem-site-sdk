// Agenten-Dateien (Skills unter `.claude/`, Cursor-Regel unter `.cursor/`) aus dem installierten SDK ins
// Projekt legen. `deploy` lädt Punkt-Ordner nie hoch, nach `pull` fehlen sie also; `sync` stellt sie wieder her.
//
// Quelle: `node_modules/@dealsystem/site/agent-files/` mit `manifest.json` (erzeugt von
// scripts/build-agent-docs.mjs aus dem Starter). Regeln:
// - Fehlt eine Datei, wird sie angelegt.
// - Gleicht eine vorhandene Datei byte-genau einer früher ausgelieferten Fassung (`previous`), wird sie erneuert.
// - Alles andere hat der Kunde geändert und bleibt unberührt.
// - Ziele nur unter `.claude/` und `.cursor/`, kein `..`, keine Links im Pfad: das Manifest liegt in
//   `node_modules` und gilt nicht als vertrauenswürdig.

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { AGENT_FILES_SOURCE } from '../check/sdk.js';

export interface AgentFilesResult {
	/** `null`, wenn das installierte SDK keine Agenten-Dateien mitbringt (älter oder nicht installiert). */
	skipped: 'no_sdk' | 'invalid_manifest' | null;
	/** Neu angelegt. */
	restored: string[];
	/** Unveränderte frühere Fassung durch die neue ersetzt. */
	updated: string[];
	/** Vom Kunden geändert oder kein normaler Ordner/keine normale Datei: unberührt. */
	kept: string[];
	/** Eintrag im Manifest abgelehnt (Pfad unzulässig, Inhalt passt nicht zur Prüfsumme). */
	rejected: string[];
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const SHA = /^[0-9a-f]{64}$/;

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** `.claude/…` oder `.cursor/…`, nur harmlose Segmente (kein `.`, `..`, keine Trenner, keine Laufwerke). */
export function isAllowedAgentTarget(target: string): boolean {
	const parts = target.split('/');
	if (parts.length < 2 || (parts[0] !== '.claude' && parts[0] !== '.cursor')) return false;
	return parts.slice(1).every((p) => SEGMENT.test(p));
}

interface Entry {
	target: string;
	source: string;
	sha256: string;
	previous: string[];
}

function parseManifest(text: string): Entry[] | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	const files = (raw as { files?: unknown })?.files;
	if (!Array.isArray(files)) return null;
	const out: Entry[] = [];
	for (const f of files) {
		const o = f as Record<string, unknown>;
		if (typeof o?.target !== 'string' || typeof o.source !== 'string' || typeof o.sha256 !== 'string')
			return null;
		const previous = Array.isArray(o.previous)
			? o.previous.filter((h): h is string => typeof h === 'string')
			: [];
		out.push({ target: o.target, source: o.source, sha256: o.sha256, previous });
	}
	return out;
}

const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);

/** Kein Link zwischen Projektordner und Ziel: sonst landete die Datei außerhalb des Projekts. */
function linkFreeParents(projectDir: string, target: string): boolean {
	let current = projectDir;
	for (const part of target.split('/').slice(0, -1)) {
		current = join(current, part);
		if (!existsSync(current) && !isDanglingLink(current)) return true;
		const st = lstatSync(current);
		if (st.isSymbolicLink() || !st.isDirectory()) return false;
	}
	return true;
}

function isDanglingLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

export function restoreAgentFiles(projectDir: string): AgentFilesResult {
	const result: AgentFilesResult = { skipped: null, restored: [], updated: [], kept: [], rejected: [] };
	const sdkDir = join(projectDir, AGENT_FILES_SOURCE);
	let manifestText: string;
	let sdkRoot: string;
	try {
		sdkRoot = realpathSync(sdkDir);
		manifestText = readFileSync(join(sdkRoot, 'manifest.json'), 'utf8');
	} catch {
		return { ...result, skipped: 'no_sdk' };
	}
	const entries = parseManifest(manifestText);
	if (!entries) return { ...result, skipped: 'invalid_manifest' };

	for (const e of entries) {
		// Quelle = Ziel ohne den Punkt am Anfang; so kann das Manifest keine fremde Datei unterschieben.
		if (!isAllowedAgentTarget(e.target) || e.source !== e.target.slice(1) || !SHA.test(e.sha256)) {
			result.rejected.push(e.target);
			continue;
		}
		let content: Buffer;
		try {
			const sourcePath = realpathSync(join(sdkRoot, ...e.source.split('/')));
			if (!inside(sdkRoot, sourcePath)) throw new Error('außerhalb');
			content = readFileSync(sourcePath);
		} catch {
			result.rejected.push(e.target);
			continue;
		}
		if (sha256(content) !== e.sha256) {
			result.rejected.push(e.target);
			continue;
		}
		if (!linkFreeParents(projectDir, e.target)) {
			result.kept.push(e.target);
			continue;
		}
		const targetPath = join(projectDir, ...e.target.split('/'));
		let existing: ReturnType<typeof lstatSync> | null;
		try {
			existing = lstatSync(targetPath);
		} catch {
			existing = null;
		}
		if (!existing) {
			mkdirSync(dirname(targetPath), { recursive: true });
			// `wx`: entsteht die Datei zwischendurch, wird nichts überschrieben.
			writeFileSync(targetPath, content, { flag: 'wx' });
			result.restored.push(e.target);
			continue;
		}
		if (!existing.isFile()) {
			result.kept.push(e.target);
			continue;
		}
		const current = sha256(readFileSync(targetPath));
		if (current === e.sha256) continue;
		if (e.previous.includes(current)) {
			writeFileSync(targetPath, content);
			result.updated.push(e.target);
		} else {
			result.kept.push(e.target);
		}
	}
	return result;
}

/** Zeile für die Ausgabe von `sync`; `null`, wenn nichts zu sagen ist. */
export function agentFilesNote(r: AgentFilesResult): string | null {
	if (r.skipped === 'no_sdk') return 'Agenten-Dateien: das installierte SDK bringt keine mit, übersprungen.';
	if (r.skipped === 'invalid_manifest') return 'Agenten-Dateien: Verzeichnis im SDK unlesbar, übersprungen.';
	const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
	const parts = [
		r.restored.length && `${n(r.restored.length, 'Agenten-Datei', 'Agenten-Dateien')} wiederhergestellt`,
		r.updated.length && `${n(r.updated.length, 'Agenten-Datei', 'Agenten-Dateien')} aktualisiert`,
		r.kept.length && `${n(r.kept.length, 'geänderte Agenten-Datei', 'geänderte Agenten-Dateien')} behalten`,
		r.rejected.length && `${n(r.rejected.length, 'Eintrag', 'Einträge')} im SDK abgelehnt`,
	].filter(Boolean);
	return parts.length ? `${parts.join(', ')}.` : null;
}
