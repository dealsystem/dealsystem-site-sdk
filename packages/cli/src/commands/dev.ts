// `dealsystem dev` — startet den Vite-Dev-Server des Projekts. Die Site-API für den Schlüssel `dev` beantwortet
// das Vite-Plugin `dealsystem(site)` selbst (Sammlungen aus `.dealsystem/content.json`). Die CLI setzt davor nur
// eine Middleware: Probe-Einsendungen (`…/leads`) gehen an `/api/v1/websites/{id}/dev/leads` (im Core immer
// `dryRun`), und `/_ds/media/*` wird an die Seite im Netz durchgereicht, damit CMS-Bilder lokal erscheinen.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CliError, EXIT } from '../api/errors.js';
import type { FetchLike } from '../api/http.js';
import type { DeployApi } from '../api/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { canonicalJson, CONTENT_FILE } from '../project/snapshot.js';

const MAX_BODY_BYTES = 64 * 1024;
const LEADS_PATH = /^\/api\/site\/v1\/s\/[^/]+\/leads\/?$/;
const MEDIA_PREFIX = '/_ds/media/';

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export interface DevMiddlewareOptions {
	api: DeployApi;
	siteId: string;
	/** Herkunft der Medien, z. B. `https://kunde.de`. `null`: Medien lokal nicht verfügbar. */
	mediaOrigin: string | null;
	fetch: FetchLike;
	log?: (message: string) => void;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(body));
}

function apiError(res: ServerResponse, status: number, code: string, message: string): void {
	sendJson(res, status, { error: code, message, status, code });
}

async function readBody(req: IncomingMessage): Promise<string | null> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req as AsyncIterable<Buffer>) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) return null;
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

/** Middleware vor dem Vite-Plugin des SDK. Alles andere geht unverändert weiter (`next()`). */
export function createDevMiddleware(options: DevMiddlewareOptions): Middleware {
	const log = options.log ?? (() => {});
	return (req, res, next) => {
		const path = new URL(req.url ?? '/', 'http://localhost').pathname;
		if (req.method === 'POST' && LEADS_PATH.test(path)) {
			void (async () => {
				const raw = await readBody(req);
				let body: unknown;
				try {
					body = raw === null ? undefined : (JSON.parse(raw || '{}') as unknown);
				} catch {
					body = undefined;
				}
				if (body === undefined) return apiError(res, 400, 'invalid_body', 'Ungültiger JSON-Body');
				const result = await options.api.devLead(options.siteId, body);
				log(`[dealsystem] Probe-Einsendung an das CRM geprüft, nicht gespeichert (Status ${result.status}).`);
				sendJson(res, result.status, result.body);
			})().catch((e: unknown) => apiError(res, 502, 'dev_proxy_error', (e as Error).message));
			return;
		}
		if ((req.method === 'GET' || req.method === 'HEAD') && path.startsWith(MEDIA_PREFIX)) {
			if (!options.mediaOrigin)
				return apiError(res, 404, 'media_unavailable', 'Keine Seiten-Adresse für Medien bekannt.');
			void (async () => {
				const upstream = await options.fetch(`${options.mediaOrigin}${req.url ?? path}`, {
					method: req.method,
				});
				res.statusCode = upstream.status;
				for (const h of ['content-type', 'cache-control', 'etag', 'content-length']) {
					const v = upstream.headers.get(h);
					if (v) res.setHeader(h, v);
				}
				res.end(req.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer()));
			})().catch((e: unknown) => apiError(res, 502, 'media_proxy_error', (e as Error).message));
			return;
		}
		next();
	};
}

/** Vite-Plugin, das die Middleware **vor** die des SDK-Plugins stellt (beide `enforce: 'pre'`). */
export function devProxyPlugin(middleware: Middleware): {
	name: string;
	enforce: 'pre';
	configureServer(server: { middlewares: { stack: { route: string; handle: Middleware }[] } }): void;
} {
	return {
		name: 'dealsystem-cli-dev',
		enforce: 'pre',
		configureServer(server) {
			// Das SDK-Plugin registriert seine Site-API früher in derselben Phase; vorne einhängen.
			server.middlewares.stack.unshift({ route: '', handle: middleware });
		},
	};
}

interface ViteModule {
	createServer(config: Record<string, unknown>): Promise<{
		listen(): Promise<unknown>;
		printUrls(): void;
		close(): Promise<void>;
	}>;
}

/** Lädt Vite aus dem Projekt (nicht aus der CLI), damit Version und Plugins des Projekts gelten. */
async function loadProjectVite(projectDir: string): Promise<ViteModule> {
	try {
		const require = createRequire(join(projectDir, 'package.json'));
		const pkgPath = require.resolve('vite/package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
			exports?: unknown;
			module?: string;
			main?: string;
		};
		const root = (pkg.exports as Record<string, unknown> | undefined)?.['.'];
		const pick = (v: unknown): string | undefined =>
			typeof v === 'string'
				? v
				: v && typeof v === 'object'
					? pick((v as Record<string, unknown>).import ?? (v as Record<string, unknown>).default)
					: undefined;
		const entry = pick(root) ?? pkg.module ?? pkg.main ?? 'index.js';
		return (await import(pathToFileURL(join(dirname(pkgPath), entry)).href)) as ViteModule;
	} catch (e) {
		throw new CliError(
			'vite_missing',
			`Vite ist im Projekt nicht installiert (${(e as Error).message}).`,
			'Führe `npm install` im Projektordner aus.',
			EXIT.usage,
		);
	}
}

function mediaOriginFrom(snapshot: unknown): string | null {
	const host = (snapshot as { site?: { primaryHost?: unknown } } | null)?.site?.primaryHost;
	return typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

export async function devCommand(ctx: CommandContext): Promise<CommandResult> {
	const siteId = ctx.siteId();
	const api = ctx.api();
	const contentFile = ctx.path(CONTENT_FILE);
	let snapshot: unknown;
	if (existsSync(contentFile)) {
		snapshot = JSON.parse(readFileSync(contentFile, 'utf8')) as unknown;
	} else {
		ctx.progress('Hole Inhalte aus dem CRM …');
		snapshot = await api.getContent(siteId);
		mkdirSync(dirname(contentFile), { recursive: true });
		writeFileSync(contentFile, canonicalJson(snapshot));
	}
	const mediaOrigin = ctx.str('media-origin') ?? mediaOriginFrom(snapshot);
	const middleware = createDevMiddleware({
		api,
		siteId,
		mediaOrigin,
		fetch: ctx.io.fetch,
		log: (m) => ctx.progress(m),
	});

	const vite = await loadProjectVite(ctx.projectDir);
	process.env.DEALSYSTEM_CONTENT_FILE = contentFile;
	const port = ctx.str('port');
	const server = await vite.createServer({
		root: ctx.projectDir,
		plugins: [devProxyPlugin(middleware)],
		...(port ? { server: { port: Number(port), strictPort: true } } : {}),
	});
	await server.listen();
	server.printUrls();
	ctx.progress('Formulare gehen als Probe an das CRM und werden nicht gespeichert. Beenden mit Strg+C.');
	await new Promise<void>((resolve) => {
		process.once('SIGINT', () => resolve());
		process.once('SIGTERM', () => resolve());
	});
	await server.close();
	return { exitCode: EXIT.ok, data: { mediaOrigin }, text: 'Dev-Server beendet.' };
}
