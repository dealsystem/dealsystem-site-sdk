// `dealsystem pull` — Quellcode einer Version aus DealSystem holen, z. B. auf einem neuen Rechner.
//
// Ablauf: Seite wählen (wie `init`), Zielordner prüfen (neu oder leer, sonst Abbruch VOR jedem Download),
// Version wählen (Standard: live), signierte Adresse holen, Paket mit Größengrenze laden, SHA-256 prüfen,
// sicher entpacken (`project/untar.ts`) in einen Temp-Ordner neben dem Ziel, `siteId` eintragen, dann
// umbenennen. Scheitert etwas, bleibt nichts Halbes liegen.
//
// Nicht im Paket, weil `deploy` es nie hochlädt: `node_modules`, `.dealsystem/`, Punkt-Dateien wie
// `.gitignore` und `.claude/`. `.gitignore` und `CLAUDE.md` schreibt `pull` neu wie der Starter; Skills und
// Cursor-Regel legt `sync` nach `npm install` aus dem installierten SDK wieder an.

import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	rmdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { CliError, EXIT } from '../api/errors.js';
import type { SourceDownload, Website } from '../api/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import {
	defaultSiteConfig,
	readSiteConfig,
	SITE_CONFIG_FILE,
	writeSiteIdIntoConfig,
} from '../project/siteConfig.js';
import { extractTarGz, UNTAR_LIMITS, UnsafeArchiveError, type UntarLimits } from '../project/untar.js';
import { UPLOAD_MAX_BYTES } from '../project/uploadFiles.js';
import { selectExistingSite } from './site.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wie `_gitignore` im Starter. */
export const PULL_GITIGNORE = 'node_modules/\nbuild/\n.svelte-kit/\n.dealsystem/\n.env\n.env.*\n.DS_Store\n';
/** Wie im Starter: Claude Code liest damit AGENTS.md. */
export const PULL_CLAUDE_MD = '@AGENTS.md\n';

/** Grenzen; Tests setzen kleinere. */
export const PULL_LIMITS: { maxDownloadBytes: number; untar: UntarLimits } = {
	maxDownloadBytes: UPLOAD_MAX_BYTES,
	untar: UNTAR_LIMITS,
};

function isEmptyDir(path: string): boolean {
	return readdirSync(path).length === 0;
}

/** Zielordner: Argument, sonst `--dir`, sonst `./<slug>`. Er muss fehlen oder leer sein. */
function targetDir(ctx: CommandContext, site: Website): string {
	const arg = ctx.positionals[0];
	const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.slug) ? site.slug : 'website';
	const target = arg
		? isAbsolute(arg)
			? arg
			: resolve(ctx.io.cwd, arg)
		: ctx.str('dir')
			? ctx.projectDir
			: join(ctx.io.cwd, slug);
	if (existsSync(target)) {
		if (!statSync(target).isDirectory()) {
			throw new CliError(
				'target_not_empty',
				`${target} gibt es schon, und es ist kein Ordner.`,
				'Nenne einen neuen Ordner: `npx dealsystem pull <ordner>`.',
				EXIT.usage,
				{ directory: target },
			);
		}
		if (!isEmptyDir(target)) {
			throw new CliError(
				'target_not_empty',
				`Der Ordner ${target} ist nicht leer. \`pull\` schreibt nie über vorhandene Dateien.`,
				'Nenne einen neuen oder leeren Ordner: `npx dealsystem pull <ordner>`.',
				EXIT.usage,
				{ directory: target },
			);
		}
	}
	return target;
}

async function versionId(ctx: CommandContext, site: Website): Promise<string> {
	const wanted = ctx.str('version');
	const api = ctx.api();
	if (wanted) {
		const versions = await api.listVersions(site.id, 50);
		const hit = versions.find((v) => v.id === wanted || String(v.number) === wanted);
		if (hit) return hit.id;
		if (UUID.test(wanted)) return wanted.toLowerCase();
		throw new CliError(
			'version_not_found',
			`Die Version \`${wanted}\` gibt es nicht (unter den letzten 50).`,
			'Zeige die Versionen mit `npx dealsystem status --site <id>` oder nimm ihre ID.',
			EXIT.usage,
		);
	}
	const details = await api.getWebsite(site.id);
	const live = details.liveVersion?.id || details.liveVersionId || site.liveVersionId;
	if (!live) {
		throw new CliError(
			'no_live_version',
			`Die Seite ${site.name} hat noch keine Live-Version.`,
			'Hole eine bestimmte Version mit `npx dealsystem pull --version <nummer>`; die Nummern zeigt `npx dealsystem status --site <id>`.',
			EXIT.usage,
		);
	}
	return live;
}

/** `siteId` in dealsystem.config.ts auf diese Seite setzen. `false`, wenn das nicht ging. */
function linkSite(dir: string, siteId: string): boolean {
	const path = join(dir, SITE_CONFIG_FILE);
	if (!existsSync(path)) {
		writeFileSync(path, defaultSiteConfig(siteId));
		return true;
	}
	const code = readFileSync(path, 'utf8');
	if (readSiteConfig(code).data?.siteId === siteId) return true;
	const next = writeSiteIdIntoConfig(code, siteId);
	if (next === null) return false;
	writeFileSync(path, next);
	return true;
}

function writeIfMissing(path: string, content: string): void {
	if (!existsSync(path)) writeFileSync(path, content);
}

export async function pullCommand(ctx: CommandContext): Promise<CommandResult> {
	if (ctx.positionals.length > 1) {
		throw new CliError(
			'invalid_arguments',
			'`pull` nimmt höchstens einen Ordner.',
			'Aufruf: `npx dealsystem pull [ordner] [--site <id|slug>] [--version <nummer|id>]`.',
			EXIT.usage,
		);
	}
	const site = await selectExistingSite(ctx, 'pull');
	// Vor jedem Download: ein nicht leerer Ordner bricht ab, ohne dass etwas geschrieben wird.
	const target = targetDir(ctx, site);
	const api = ctx.api();
	const source: SourceDownload = await api.getSourceDownload(site.id, await versionId(ctx, site));
	const limits = PULL_LIMITS;
	if (source.bytes > limits.maxDownloadBytes) {
		throw new CliError(
			'download_too_large',
			`Das Quellpaket hat ${source.bytes} Bytes, erlaubt sind ${limits.maxDownloadBytes}.`,
			'Nichts wurde geschrieben. Melde das an DealSystem.',
			EXIT.api,
		);
	}
	ctx.progress(`Lade den Quellcode von Version ${source.codeVersionNumber ?? source.versionNumber} …`);
	// Höchstens die angekündigte Größe: mehr Bytes heißt, es kommt etwas anderes als angekündigt.
	const data = await api.downloadSource(source, Math.min(source.bytes, limits.maxDownloadBytes));
	const sha = createHash('sha256').update(data).digest('hex');
	if (sha !== source.sha256) {
		throw new CliError(
			'checksum_mismatch',
			'Das heruntergeladene Quellpaket passt nicht zur Prüfsumme.',
			'Nichts wurde geschrieben. Führe `npx dealsystem pull` erneut aus.',
			EXIT.api,
		);
	}

	const parent = dirname(target);
	mkdirSync(parent, { recursive: true });
	const staging = mkdtempSync(join(parent, `.${basename(target)}.dealsystem-pull-`));
	const stage = join(staging, 'site');
	let result;
	let siteIdSet: boolean;
	try {
		try {
			result = extractTarGz(data, stage, limits.untar);
		} catch (e) {
			if (e instanceof UnsafeArchiveError) {
				throw new CliError(
					'unsafe_archive',
					`Das Quellpaket wurde nicht entpackt: ${e.message}`,
					'Nichts wurde geschrieben. Nimm eine andere Version (`--version <nummer>`) oder melde das an DealSystem.',
					EXIT.failed,
				);
			}
			throw e;
		}
		siteIdSet = linkSite(stage, site.id);
		writeIfMissing(join(stage, '.gitignore'), PULL_GITIGNORE);
		writeIfMissing(join(stage, 'CLAUDE.md'), PULL_CLAUDE_MD);
		// Erneut prüfen: In der Zwischenzeit kann jemand den Ordner befüllt haben.
		if (existsSync(target)) {
			if (!statSync(target).isDirectory() || !isEmptyDir(target)) {
				throw new CliError(
					'target_not_empty',
					`Der Ordner ${target} ist inzwischen nicht mehr leer.`,
					'Nenne einen neuen Ordner: `npx dealsystem pull <ordner>`.',
					EXIT.usage,
				);
			}
			rmdirSync(target);
		}
		renameSync(stage, target);
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}

	const shown = relative(ctx.io.cwd, target) || '.';
	const cdPath = shown.startsWith('..') || isAbsolute(shown) ? target : shown;
	const fromCode =
		source.trigger === 'content' && source.codeVersionId !== source.versionId
			? ` Version ${source.versionNumber} ist ein Inhalts-Stand; geholt wurde ihr Code aus Version ${source.codeVersionNumber ?? source.codeVersionId}.`
			: '';
	const lines = [
		`Quellcode von ${site.name}, Version ${source.versionNumber}, liegt in ${target} (${result.files} Dateien).${fromCode}`,
		siteIdSet
			? `\`siteId\` steht in ${SITE_CONFIG_FILE}; \`deploy\` lädt in diese Seite hoch.`
			: `Achtung: \`siteId\` ließ sich nicht in ${SITE_CONFIG_FILE} eintragen. Führe im Ordner \`npx dealsystem init --site ${site.id}\` aus.`,
		'Nächste Schritte:',
		`  cd ${cdPath}`,
		'  npm install',
		'  npx dealsystem sync   (holt die Inhalte und legt die Skills für deinen KI-Agenten wieder an)',
		'Danach wie gewohnt ändern, prüfen und mit `npx dealsystem deploy` hochladen.',
	];
	return {
		exitCode: EXIT.ok,
		data: {
			siteId: site.id,
			slug: site.slug,
			directory: target,
			versionId: source.versionId,
			versionNumber: source.versionNumber,
			trigger: source.trigger,
			codeVersionId: source.codeVersionId,
			codeVersionNumber: source.codeVersionNumber,
			files: result.files,
			bytes: result.bytes,
			sha256: source.sha256,
			siteIdSet,
			next: [`cd ${cdPath}`, 'npm install', 'npx dealsystem sync'],
		},
		text: lines.join('\n'),
	};
}
