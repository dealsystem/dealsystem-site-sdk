// `dealsystem sync` — Schnappschuss holen (`.dealsystem/content.json` für dev und Build), Stand im CRM mit
// dealsystem.config.ts abgleichen, `src/dealsystem.d.ts` anlegen, falls sie fehlt, AGENTS.md-Block erneuern,
// fehlende Agenten-Dateien (Skills, Cursor-Regel) aus dem installierten SDK anlegen (`project/agentFiles.ts`).
// Typen erzeugt sync nicht: das SDK leitet sie aus `typeof site` ab.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CliError, EXIT } from '../api/errors.js';
import { runCheck } from '../check/run.js';
import { AGENTS_BLOCK_SOURCE, SDK_PACKAGE } from '../check/sdk.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { agentFilesNote, restoreAgentFiles } from '../project/agentFiles.js';
import { updateAgentsMd } from '../project/agentsBlock.js';
import { readSiteConfig, SITE_CONFIG_FILE } from '../project/siteConfig.js';
import {
	canonicalJson,
	codeSlotKeys,
	compareSnapshot,
	CONTENT_FILE,
	GLOBAL_TYPES_CONTENT,
	GLOBAL_TYPES_FILE,
} from '../project/snapshot.js';
import { SVELTE_CONFIG_TEMPLATE, VITE_CONFIG_TEMPLATE } from '../project/svelteConfig.js';
import { createUploadFileSet } from '../project/uploadFiles.js';

/** Schreibt nur, wenn sich der Inhalt ändert. `true` = geändert. */
function writeIfChanged(path: string, content: string): boolean {
	if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	return true;
}

function ensureGitignore(ctx: CommandContext): void {
	const path = ctx.path('.gitignore');
	const current = ctx.readProjectFile('.gitignore');
	if (current !== null && /^\/?\.dealsystem\/?$/m.test(current)) return;
	// Die lokale Kopie der Inhalte gehört nicht ins Git (und geht nie in den Upload).
	writeFileSync(path, current === null ? '.dealsystem/\n' : `${current.replace(/\s*$/, '')}\n.dealsystem/\n`);
}

/** Stellt svelte.config.js und vite.config.ts aus dem Starter wieder her, wenn ihre Regeln scheitern. */
async function fixConfig(ctx: CommandContext): Promise<string[]> {
	const targets = [
		{ file: 'svelte.config.js', rules: ['STR-001', 'SEC-005', 'STR-008'], content: SVELTE_CONFIG_TEMPLATE },
		{ file: 'vite.config.ts', rules: ['STR-009'], content: VITE_CONFIG_TEMPLATE },
	];
	const result = await runCheck({ source: createUploadFileSet(ctx.projectDir) });
	const failing = new Set(result.errors.map((f) => f.rule));
	const fixed: string[] = [];
	for (const t of targets) {
		if (!t.rules.some((r) => failing.has(r))) continue;
		const target = ctx.path(t.file);
		if (existsSync(target)) copyFileSync(target, `${target}.bak`);
		writeFileSync(target, t.content);
		fixed.push(t.file);
	}
	return fixed;
}

function updateAgents(ctx: CommandContext): 'updated' | 'unchanged' | 'skipped' {
	const block = ctx.readProjectFile(AGENTS_BLOCK_SOURCE);
	const pkgText = ctx.readProjectFile(`node_modules/${SDK_PACKAGE}/package.json`);
	if (block === null || pkgText === null) return 'skipped';
	let version: string;
	try {
		version = String((JSON.parse(pkgText) as { version?: unknown }).version ?? '');
	} catch {
		return 'skipped';
	}
	if (!version) return 'skipped';
	const next = updateAgentsMd(ctx.readProjectFile('AGENTS.md'), version, block);
	return writeIfChanged(ctx.path('AGENTS.md'), next) ? 'updated' : 'unchanged';
}

export async function syncCommand(ctx: CommandContext): Promise<CommandResult> {
	const config = readSiteConfig(ctx.readProjectFile(SITE_CONFIG_FILE));
	if (!config.data) {
		const p = config.problems[0];
		throw new CliError(
			'invalid_config',
			p?.message ?? `${SITE_CONFIG_FILE} ist ungültig.`,
			p?.fix ?? 'Führe `npx dealsystem init` aus.',
			EXIT.failed,
		);
	}

	let snapshot: unknown = null;
	const contentPath = ctx.path(CONTENT_FILE);
	const offline = ctx.flag('offline');
	if (offline) {
		if (existsSync(contentPath)) snapshot = JSON.parse(readFileSync(contentPath, 'utf8')) as unknown;
	} else {
		const siteId = ctx.siteId();
		ctx.progress('Hole Inhalte aus dem CRM …');
		snapshot = await ctx.api().getContent(siteId);
		writeIfChanged(contentPath, canonicalJson(snapshot));
		ensureGitignore(ctx);
	}

	const fixedConfig = ctx.flag('fix-config') ? await fixConfig(ctx) : [];
	const typesCreated = !existsSync(ctx.path(GLOBAL_TYPES_FILE));
	if (typesCreated) writeIfChanged(ctx.path(GLOBAL_TYPES_FILE), GLOBAL_TYPES_CONTENT);
	const drift =
		snapshot === null
			? []
			: compareSnapshot(snapshot, config.data, codeSlotKeys(createUploadFileSet(ctx.projectDir)));
	const agentsMd = updateAgents(ctx);
	const agentFiles = restoreAgentFiles(ctx.projectDir);
	const agentFilesLine = agentFilesNote(agentFiles);

	const notes = [
		offline
			? snapshot === null
				? `Offline: ${CONTENT_FILE} fehlt, kein Abgleich mit dem CRM.`
				: `Offline: Abgleich mit der vorhandenen ${CONTENT_FILE}.`
			: `Inhalte gespeichert in ${CONTENT_FILE}.`,
		...drift.map((d) => `${SITE_CONFIG_FILE} – ${d.message} – ${d.fix}`),
		...(typesCreated ? [`${GLOBAL_TYPES_FILE} angelegt.`] : []),
		agentsMd === 'skipped'
			? 'AGENTS.md: kein Block im installierten SDK gefunden, übersprungen.'
			: `AGENTS.md: ${agentsMd === 'updated' ? 'aktualisiert' : 'unverändert'}.`,
		...(agentFilesLine ? [agentFilesLine] : []),
		...fixedConfig.map((f) => `${f} wiederhergestellt (alte Fassung: ${f}.bak).`),
		drift.length ? `${drift.length} Abweichung(en) zwischen CRM und Code.` : 'CRM und Code passen zusammen.',
	];
	return {
		exitCode: EXIT.ok,
		data: {
			contentFile: offline ? null : CONTENT_FILE,
			drift,
			typesFileCreated: typesCreated,
			agentsMd,
			agentFiles,
			fixedConfig,
		},
		text: notes.join('\n'),
	};
}
