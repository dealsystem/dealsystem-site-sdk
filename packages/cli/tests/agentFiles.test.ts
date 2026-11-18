// Agenten-Dateien aus dem installierten SDK wiederherstellen (`project/agentFiles.ts`): nach `pull` fehlende
// Skills anlegen, geänderte Dateien behalten, unveränderte alte Fassungen erneuern, und nichts außerhalb von
// `.claude/` und `.cursor/` des Projekts schreiben — auch nicht mit einem bösartigen Manifest.

import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentFilesNote, isAllowedAgentTarget, restoreAgentFiles } from '../src/project/agentFiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHIPPED = join(ROOT, 'packages/site/agent-files');
const TEMPLATE = join(ROOT, 'packages/create/template');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

let base: string;
let project: string;
let sdk: string;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'ds-agentfiles-'));
	project = join(base, 'projekt');
	sdk = join(project, 'node_modules/@dealsystem/site/agent-files');
	mkdirSync(project);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

function installShipped(): { target: string; sha256: string }[] {
	cpSync(SHIPPED, sdk, { recursive: true });
	return (
		JSON.parse(readFileSync(join(sdk, 'manifest.json'), 'utf8')) as {
			files: { target: string; sha256: string }[];
		}
	).files;
}

/** Eigenes Manifest mit Dateien `{ target, content, previous?, source? }`. */
function installCustom(files: { target: string; content: string; previous?: string[]; source?: string }[]) {
	mkdirSync(sdk, { recursive: true });
	const entries = files.map((f) => {
		const source = f.source ?? f.target.slice(1);
		if (!source.includes('..') && !source.startsWith('/')) {
			mkdirSync(dirname(join(sdk, source)), { recursive: true });
			writeFileSync(join(sdk, source), f.content);
		}
		return { target: f.target, source, sha256: sha(f.content), previous: f.previous ?? [] };
	});
	writeFileSync(join(sdk, 'manifest.json'), JSON.stringify({ manifestVersion: 1, files: entries }));
}

/** Alle Dateien unter `dir`, relativ. */
function listFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile())
		.map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
		.sort();
}

describe('Agenten-Dateien wiederherstellen', () => {
	it('leerer Ordner nach `pull`: legt alle Skills und die Cursor-Regel byte-gleich zum Starter an', () => {
		const manifest = installShipped();
		const r = restoreAgentFiles(project);
		expect(r.skipped).toBeNull();
		expect(r.restored.sort()).toEqual(manifest.map((f) => f.target).sort());
		expect(r.restored).toContain('.cursor/rules/dealsystem.mdc');
		expect(r.restored.some((t) => t.startsWith('.claude/skills/'))).toBe(true);
		for (const t of r.restored) {
			expect(readFileSync(join(project, t)), t).toEqual(readFileSync(join(TEMPLATE, t)));
		}
		expect(agentFilesNote(r)).toBe(`${manifest.length} Agenten-Dateien wiederhergestellt.`);
		// Zweiter Lauf: alles da, nichts zu sagen.
		const again = restoreAgentFiles(project);
		expect([again.restored, again.updated, again.kept]).toEqual([[], [], []]);
		expect(agentFilesNote(again)).toBeNull();
	});

	it('vom Kunden geänderte Datei bleibt unberührt, fehlende kommen dazu', () => {
		installShipped();
		const target = join(project, '.claude/skills/neue-seite/SKILL.md');
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, 'Meine eigene Fassung\n');
		const r = restoreAgentFiles(project);
		expect(readFileSync(target, 'utf8')).toBe('Meine eigene Fassung\n');
		expect(r.kept).toEqual(['.claude/skills/neue-seite/SKILL.md']);
		expect(r.restored).not.toContain('.claude/skills/neue-seite/SKILL.md');
		expect(agentFilesNote(r)).toContain('1 geänderte Agenten-Datei behalten');
	});

	it('unveränderte frühere Fassung wird erneuert, eine andere nicht', () => {
		const alt = 'Fassung 1\n';
		installCustom([
			{ target: '.claude/skills/a/SKILL.md', content: 'Fassung 2\n', previous: [sha(alt)] },
			{ target: '.claude/skills/b/SKILL.md', content: 'Fassung 2\n', previous: [sha(alt)] },
		]);
		mkdirSync(join(project, '.claude/skills/a'), { recursive: true });
		mkdirSync(join(project, '.claude/skills/b'), { recursive: true });
		writeFileSync(join(project, '.claude/skills/a/SKILL.md'), alt);
		writeFileSync(join(project, '.claude/skills/b/SKILL.md'), 'Fassung 1, vom Kunden ergänzt\n');
		const r = restoreAgentFiles(project);
		expect(r.updated).toEqual(['.claude/skills/a/SKILL.md']);
		expect(r.kept).toEqual(['.claude/skills/b/SKILL.md']);
		expect(readFileSync(join(project, '.claude/skills/a/SKILL.md'), 'utf8')).toBe('Fassung 2\n');
		expect(readFileSync(join(project, '.claude/skills/b/SKILL.md'), 'utf8')).toBe(
			'Fassung 1, vom Kunden ergänzt\n',
		);
	});

	it('ohne Agenten-Dateien im SDK (älteres SDK, nicht installiert): übersprungen, nichts geschrieben', () => {
		const r = restoreAgentFiles(project);
		expect(r.skipped).toBe('no_sdk');
		expect(listFiles(project)).toEqual([]);
	});

	it('kaputtes Manifest: übersprungen', () => {
		mkdirSync(sdk, { recursive: true });
		writeFileSync(join(sdk, 'manifest.json'), '{ kein json');
		expect(restoreAgentFiles(project).skipped).toBe('invalid_manifest');
	});
});

describe('Agenten-Dateien: Pfadsicherheit', () => {
	it.each([
		'../ausserhalb.md',
		'/tmp/absolut.md',
		'.claude/../../ausserhalb.md',
		'.claude/./x.md',
		'.git/hooks/pre-commit',
		'src/routes/+page.svelte',
		'.claude',
		'.claude\\..\\x.md',
		'C:/x.md',
	])('lehnt Ziel %j ab', (target) => {
		expect(isAllowedAgentTarget(target)).toBe(false);
	});

	it('bösartiges Manifest: unzulässige Ziele und fremde Quellen werden abgelehnt, nichts landet außerhalb', () => {
		installCustom([
			{ target: '../ausserhalb.md', content: 'x', source: 'claude/x.md' },
			{ target: '.git/hooks/pre-commit', content: '#!/bin/sh\n', source: 'git/hooks/pre-commit' },
			// Quelle zeigt aus dem SDK heraus
			{ target: '.claude/skills/p/SKILL.md', content: 'x', source: '../../../../../etc/hostname' },
			// Quelle passt nicht zum Ziel
			{ target: '.claude/skills/q/SKILL.md', content: 'x', source: 'cursor/rules/dealsystem.mdc' },
			{ target: '.claude/skills/ok/SKILL.md', content: 'gut\n' },
		]);
		const r = restoreAgentFiles(project);
		expect(r.restored).toEqual(['.claude/skills/ok/SKILL.md']);
		expect(r.rejected).toHaveLength(4);
		expect(existsSync(join(base, 'ausserhalb.md'))).toBe(false);
		expect(existsSync(join(project, '.git'))).toBe(false);
		expect(listFiles(project).filter((f) => !f.startsWith('node_modules'))).toEqual([
			'.claude/skills/ok/SKILL.md',
		]);
	});

	it('Quelldatei als Link aus dem SDK heraus → abgelehnt', () => {
		installCustom([{ target: '.claude/skills/l/SKILL.md', content: 'geheim\n' }]);
		const secret = join(base, 'geheim.md');
		writeFileSync(secret, 'geheim\n');
		rmSync(join(sdk, 'claude/skills/l/SKILL.md'));
		symlinkSync(secret, join(sdk, 'claude/skills/l/SKILL.md'));
		const r = restoreAgentFiles(project);
		expect(r.rejected).toEqual(['.claude/skills/l/SKILL.md']);
		expect(existsSync(join(project, '.claude/skills/l/SKILL.md'))).toBe(false);
	});

	it('Inhalt passt nicht zur Prüfsumme → abgelehnt', () => {
		installCustom([{ target: '.claude/skills/s/SKILL.md', content: 'original\n' }]);
		writeFileSync(join(sdk, 'claude/skills/s/SKILL.md'), 'manipuliert\n');
		const r = restoreAgentFiles(project);
		expect(r.rejected).toEqual(['.claude/skills/s/SKILL.md']);
		expect(existsSync(join(project, '.claude'))).toBe(false);
	});

	it('`.claude` im Projekt ist ein Link nach außen → nichts wird dorthin geschrieben', () => {
		installCustom([{ target: '.claude/skills/x/SKILL.md', content: 'x\n' }]);
		const outside = join(base, 'fremd');
		mkdirSync(outside);
		symlinkSync(outside, join(project, '.claude'));
		const r = restoreAgentFiles(project);
		expect(r.restored).toEqual([]);
		expect(r.kept).toEqual(['.claude/skills/x/SKILL.md']);
		expect(listFiles(outside)).toEqual([]);
	});

	it('Zieldatei ist ein Link → bleibt, das Ziel des Links wird nicht überschrieben', () => {
		installCustom([{ target: '.cursor/rules/dealsystem.mdc', content: 'neu\n', previous: [sha('alt\n')] }]);
		const outside = join(base, 'fremd.mdc');
		writeFileSync(outside, 'alt\n');
		mkdirSync(join(project, '.cursor/rules'), { recursive: true });
		symlinkSync(outside, join(project, '.cursor/rules/dealsystem.mdc'));
		const r = restoreAgentFiles(project);
		expect(r.kept).toEqual(['.cursor/rules/dealsystem.mdc']);
		expect(readFileSync(outside, 'utf8')).toBe('alt\n');
	});
});
