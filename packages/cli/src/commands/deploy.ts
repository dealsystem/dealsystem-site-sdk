// `dealsystem deploy` — check → packen → Upload anfordern → hochladen → abschließen → auf Prüfung und Build
// warten → Vorschau-URL. Live geht nur mit `--publish` und Bestätigung; dazu auch `publish` und `rollback`.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT } from '../api/errors.js';
import {
	SETTLED_VERSION_STATUSES,
	type CheckFinding,
	type Version,
	type VersionSummary,
} from '../api/types.js';
import { getRule } from '../check/catalog.js';
import { checkResultToJson, formatCheckText, formatLocation } from '../check/format.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { createTarGz } from '../project/tar.js';
import { selectUploadFiles, UPLOAD_MAX_BYTES } from '../project/uploadFiles.js';
import { runLocalCheck } from './check.js';

const POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_SEC = 600;

export interface PackedSource {
	tarball: Buffer;
	sha256: string;
	bytes: number;
	files: string[];
	excluded: string[];
}

export function packProject(projectDir: string): PackedSource {
	const selection = selectUploadFiles(projectDir);
	const entries = selection.files.map((f) => ({
		path: f.path,
		data: readFileSync(join(projectDir, ...f.path.split('/'))),
	}));
	const tarball = createTarGz(entries);
	return {
		tarball,
		sha256: createHash('sha256').update(tarball).digest('hex'),
		bytes: tarball.byteLength,
		files: selection.files.map((f) => f.path),
		excluded: selection.excluded,
	};
}

function serverFindingLine(f: CheckFinding): string {
	const fix = f.fix ?? getRule(f.rule)?.fix ?? '';
	return `${formatLocation(f)} – ${f.message}${fix ? ` – ${fix}` : ''} [${f.rule}]`;
}

async function waitForVersion(ctx: CommandContext, siteId: string, versionId: string): Promise<Version> {
	const timeoutSec = Number(ctx.str('timeout') ?? DEFAULT_TIMEOUT_SEC);
	const deadline =
		ctx.io.now().getTime() +
		(Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : DEFAULT_TIMEOUT_SEC) * 1000;
	let last = '';
	for (;;) {
		const version = await ctx.api().getVersion(siteId, versionId);
		if (version.status !== last) {
			ctx.progress(`Version ${version.number}: ${version.status}`);
			last = version.status;
		}
		if (SETTLED_VERSION_STATUSES.has(version.status)) return version;
		if (ctx.io.now().getTime() >= deadline) {
			throw new CliError(
				'timeout',
				`Version ${version.number} ist nach ${timeoutSec} Sekunden noch nicht fertig (${version.status}).`,
				'Prüfe später mit `npx dealsystem status`. Die Version wird weiter gebaut.',
				EXIT.failed,
				{ versionId, status: version.status },
			);
		}
		await ctx.io.sleep(POLL_INTERVAL_MS);
	}
}

function versionData(v: Version): Record<string, unknown> {
	return {
		versionId: v.id,
		number: v.number,
		status: v.status,
		previewUrl: v.previewUrl,
		checkResult: v.checkResult,
		// Fremder Text aus dem Build (B10): getrennt und gekürzt.
		untrustedLog: v.logExcerpt ? v.logExcerpt.slice(-4000) : null,
	};
}

async function release(
	ctx: CommandContext,
	siteId: string,
	version: { id: string; number: number },
	retry: string,
): Promise<CommandResult> {
	const site = await ctx.api().getWebsite(siteId);
	const host = site.primaryHost ?? site.defaultHost ?? site.slug;
	await ctx.confirm(`Version ${version.number} auf ${host} live schalten?`, retry, {
		versionId: version.id,
		number: version.number,
		host,
	});
	const result = await ctx.api().publish(siteId, version.id);
	return {
		exitCode: EXIT.ok,
		data: {
			published: true,
			changed: result.changed,
			versionId: result.liveVersionId,
			number: version.number,
			url: result.url ?? `https://${host}`,
		},
		text: result.changed
			? `Version ${version.number} ist live: ${result.url ?? `https://${host}`} (wirkt nach etwa 15 Sekunden).`
			: `Version ${version.number} war schon live: ${result.url ?? `https://${host}`}.`,
	};
}

export async function deployCommand(ctx: CommandContext): Promise<CommandResult> {
	const siteId = ctx.siteId();

	ctx.progress('Prüfe das Projekt …');
	const check = await runLocalCheck(ctx);
	if (!check.passed) {
		return {
			exitCode: EXIT.failed,
			data: { stage: 'check', check: checkResultToJson(check) },
			text: `${formatCheckText(check)}\nNichts hochgeladen. Behebe die Fehler und führe \`npx dealsystem deploy\` erneut aus.`,
		};
	}

	const packed = packProject(ctx.projectDir);
	if (packed.bytes > UPLOAD_MAX_BYTES) {
		throw new CliError(
			'upload_too_large',
			`Das Projekt ist gepackt ${(packed.bytes / 1024 / 1024).toFixed(1)} MB groß (erlaubt 50 MB).`,
			'Verkleinere Bilder in `static/` und `src/` oder lege Videos im CRM ab.',
			EXIT.failed,
		);
	}
	ctx.progress(`Gepackt: ${packed.files.length} Dateien, ${Math.ceil(packed.bytes / 1024)} KB.`);

	const api = ctx.api();
	const message = ctx.str('message');
	const upload = await api.prepareUpload(siteId, {
		sha256: packed.sha256,
		bytes: packed.bytes,
		...(message ? { message: message.slice(0, 200) } : {}),
	});
	ctx.progress('Lade hoch …');
	await api.uploadSource(upload, packed.tarball);
	let version = await api.completeUpload(siteId, upload.versionId);
	const base = {
		sha256: packed.sha256,
		bytes: packed.bytes,
		files: packed.files.length,
		excludedFiles: packed.excluded,
		warnings: checkResultToJson(check).warnings,
	};

	if (ctx.flag('no-wait')) {
		return {
			exitCode: EXIT.ok,
			data: { ...base, ...versionData(version) },
			text: `Version ${version.number} hochgeladen und in der Warteschlange. Stand prüfen: \`npx dealsystem status\`.`,
		};
	}

	ctx.progress('Warte auf Prüfung und Build …');
	version = await waitForVersion(ctx, siteId, upload.versionId);
	const data = { ...base, ...versionData(version) };

	if (version.status === 'rejected') {
		const findings = [...(version.checkResult?.errors ?? []), ...(version.checkResult?.warnings ?? [])];
		const lines = findings.length
			? findings.map(serverFindingLine)
			: ['Der Build ist fehlgeschlagen. Führe lokal `npm run build` aus und behebe den ersten Fehler.'];
		return {
			exitCode: EXIT.failed,
			data,
			text: [`Version ${version.number} wurde abgelehnt:`, ...lines].join('\n'),
		};
	}
	if (version.status !== 'ready') {
		throw new CliError(
			'build_failed',
			`Version ${version.number} ist ${version.status === 'failed' ? 'an einem Fehler bei DealSystem gescheitert' : version.status}.`,
			'Das liegt nicht an deinem Code. Führe `npx dealsystem deploy` später erneut aus.',
			EXIT.failed,
			data,
		);
	}

	const preview = `Vorschau von Version ${version.number}: ${version.previewUrl ?? '(keine Vorschau-Adresse gemeldet)'}`;
	if (!ctx.flag('publish')) {
		return {
			exitCode: EXIT.ok,
			data: { ...data, published: false },
			text: `${preview}\nNoch nicht live. Wenn der Nutzer zufrieden ist: \`npx dealsystem publish --version ${version.id}\`.`,
		};
	}
	ctx.progress(preview);
	try {
		const released = await release(ctx, siteId, version, `npx dealsystem publish --version ${version.id}`);
		return {
			...released,
			data: { ...data, ...(released.data as object) },
			text: `${preview}\n${released.text}`,
		};
	} catch (e) {
		if (e instanceof CliError && e.data && typeof e.data === 'object') {
			throw new CliError(e.code, e.message, e.fix, e.exitCode, {
				...data,
				published: false,
				...(e.data as object),
			});
		}
		throw e;
	}
}

async function findVersion(
	ctx: CommandContext,
	siteId: string,
	wanted: string | undefined,
): Promise<VersionSummary> {
	const versions = await ctx.api().listVersions(siteId, 50);
	if (wanted) {
		const v = versions.find((x) => x.id === wanted || String(x.number) === wanted);
		if (v) return v;
		const direct = await ctx
			.api()
			.getVersion(siteId, wanted)
			.catch(() => null);
		if (direct) return direct;
		throw new CliError(
			'version_not_found',
			`Die Version \`${wanted}\` gibt es nicht.`,
			'Zeige die Versionen mit `npx dealsystem status`.',
			EXIT.usage,
		);
	}
	const latest = versions
		.filter((v) => v.status === 'ready' && v.trigger === 'upload')
		.sort((a, b) => b.number - a.number)[0];
	if (!latest) {
		throw new CliError(
			'no_ready_version',
			'Es gibt keine fertig gebaute Version.',
			'Lade zuerst eine hoch: `npx dealsystem deploy`.',
			EXIT.usage,
		);
	}
	return latest;
}

export async function publishCommand(ctx: CommandContext): Promise<CommandResult> {
	const siteId = ctx.siteId();
	const version = await findVersion(ctx, siteId, ctx.str('version'));
	if (version.status !== 'ready') {
		throw new CliError(
			'version_not_ready',
			`Version ${version.number} ist ${version.status}, nicht ready.`,
			'Nur fertig gebaute Versionen können live gehen. Prüfe mit `npx dealsystem status`.',
			EXIT.usage,
		);
	}
	return release(ctx, siteId, version, `npx dealsystem publish --version ${version.id}`);
}

export async function rollbackCommand(ctx: CommandContext): Promise<CommandResult> {
	const siteId = ctx.siteId();
	const wanted = ctx.str('version');
	const target = wanted ? await findVersion(ctx, siteId, wanted) : null;
	const site = await ctx.api().getWebsite(siteId);
	const host = site.primaryHost ?? site.defaultHost ?? site.slug;
	const label = target ? `Version ${target.number}` : 'die vorige Version';
	await ctx.confirm(
		`${host} auf ${label} zurücksetzen?`,
		`npx dealsystem rollback${target ? ` --version ${target.id}` : ''}`,
		{ host, versionId: target?.id ?? null },
	);
	const result = await ctx.api().rollback(siteId, target?.id);
	return {
		exitCode: EXIT.ok,
		data: { rolledBack: true, liveVersionId: result.liveVersionId, url: result.url ?? `https://${host}` },
		text: `${host} zeigt jetzt ${label} (wirkt nach etwa 15 Sekunden).`,
	};
}
