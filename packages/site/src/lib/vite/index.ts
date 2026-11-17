// Vite-Plugin von @dealsystem/site. Es
//  - bettet die öffentlichen Daten der Seite ein (Texte aus dem CRM,
//    Firmendaten, Formulare, Zugang zur Site-API),
//  - sammelt die Content-Slots aus dem Quelltext,
//  - schreibt das Manifest, das der Build ans CRM meldet,
//  - beantwortet in der Entwicklung die Site-API aus der lokalen Kopie.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { validateSiteConfig } from '../config/index.js';
import { CONTENT_FILE_ENV, LOCAL_CONTENT_FILE, readSnapshot } from '../content/index.js';
import { defaultRichtextToHtml, sanitizeRichtextHtml } from '../richtext/server.js';
import { resolveTextSlot } from '../slots.js';
import type { ContentSlotDef, ContentSnapshot, SiteConfig, SiteData, SiteManifest } from '../types.js';
import { SDK_VERSION } from '../version.js';
import { mergeSlots, routeOfFile, scanSlots, type FoundSlot } from './scan.js';

export { scanSlots, mergeSlots, SlotScanError, type FoundSlot } from './scan.js';
export type { SiteManifest } from '../types.js';

/** Umgebungsvariable mit dem Zielpfad des Manifests (setzt der Build-Host). */
export const MANIFEST_FILE_ENV = 'DEALSYSTEM_MANIFEST_FILE';
/** Zielpfad des Manifests ohne Umgebungsvariable. */
export const LOCAL_MANIFEST_FILE = '.dealsystem/manifest.json';
/** Publishable Key in der Entwicklung. Der Dev-Server beantwortet ihn selbst. */
export const DEV_SITE_KEY = 'dev';

const SITE_DATA_MODULE = /[\\/]dealsystem-site-data\.(?:js|ts)(?:\?.*)?$/;
const PACKAGE = '@dealsystem/site';

async function svelteFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && !entry.name.startsWith('.'))
				files.push(...(await svelteFiles(path)));
		} else if (entry.name.endsWith('.svelte')) {
			files.push(path);
		}
	}
	return files.sort();
}

/** Sammelt die Slots aller `.svelte`-Dateien unter `src/`. */
export async function collectSlots(root: string): Promise<{ slots: ContentSlotDef[]; routes: string[] }> {
	const found: FoundSlot[] = [];
	const routes = new Set<string>();
	for (const file of await svelteFiles(resolve(root, 'src'))) {
		const shown = relative(root, file).replace(/\\/g, '/');
		if (/\/\+page(?:@[^.]*)?\.svelte$/.test(shown)) {
			const route = routeOfFile(shown);
			if (route) routes.add(route);
		}
		found.push(...scanSlots(await readFile(file, 'utf8'), shown));
	}
	return { slots: mergeSlots(found), routes: [...routes].sort() };
}

/** Baut das Manifest aus Konfiguration, Slots und Routen. */
export function buildManifest(config: SiteConfig, slots: ContentSlotDef[], routes: string[]): SiteManifest {
	return {
		manifestVersion: 1,
		sdkVersion: SDK_VERSION,
		siteId: config.siteId,
		routes,
		slots,
		collections: Object.entries(config.collections ?? {}).map(([key, collection]) => ({
			...collection,
			key,
			source: 'cms' as const,
		})),
		funnels: Object.entries(config.funnels ?? {}).map(([key, funnel]) => ({ ...funnel, key })),
	};
}

/** Baut die Daten, die in die Seite eingebettet werden. Nur Öffentliches. */
export function buildSiteData(
	config: SiteConfig,
	snapshot: ContentSnapshot,
	slots: readonly ContentSlotDef[],
	env: Record<string, string | undefined>,
): SiteData {
	const active = new Map(snapshot.funnels.map((funnel) => [funnel.key, funnel.active]));
	const richtext: Record<string, string> = {};
	for (const slot of slots) {
		if (slot.type !== 'richtext') continue;
		// Eine Überschreibung aus dem CRM ist schon bereinigtes HTML: sie wird
		// nie als Markdown gelesen, nur noch einmal gegen die Positiv-Liste
		// geprüft. Als Markdown gilt allein der Standardtext aus dem Code.
		const override = resolveTextSlot(snapshot.slots, slot.key, slot.aliases);
		if (override !== null) richtext[slot.key] = sanitizeRichtextHtml(override);
		else if (typeof slot.default === 'string') richtext[slot.key] = defaultRichtextToHtml(slot.default);
	}
	const siteUrl =
		env.PUBLIC_DEALSYSTEM_SITE_URL ||
		(snapshot.site.primaryHost ? `https://${snapshot.site.primaryHost}` : '');
	return {
		api: {
			baseUrl: env.PUBLIC_DEALSYSTEM_API ?? '',
			siteKey: env.PUBLIC_DEALSYSTEM_SITE_KEY || DEV_SITE_KEY,
		},
		site: { ...snapshot.site, id: snapshot.site.id || config.siteId, url: siteUrl.replace(/\/+$/, '') },
		legal: snapshot.legal,
		tracking: snapshot.tracking,
		captcha: snapshot.captcha,
		funnels: Object.fromEntries(
			Object.entries(config.funnels ?? {}).map(([key, funnel]) => [
				key,
				// Ein Formular, das der Core noch nicht kennt (erster Build), ist aktiv.
				{ ...funnel, active: active.get(key) ?? true },
			]),
		),
		collections: Object.fromEntries(
			Object.entries(config.collections ?? {}).map(([key, collection]) => [
				key,
				{ fields: collection.fields },
			]),
		),
		slots: snapshot.slots,
		richtext,
	};
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(body));
}

/**
 * Beantwortet in `vite dev` die Site-API für den Schlüssel `dev`: Sammlungen
 * aus der lokalen Kopie, Formulare als Probelauf ohne Speichern. `dealsystem dev`
 * darf davor eine eigene Middleware für `…/leads` setzen.
 */
function devSiteApi(server: ViteDevServer, config: SiteConfig, root: string): void {
	const prefix = `/api/site/v1/s/${DEV_SITE_KEY}/`;
	server.middlewares.use(async (req, res, next) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (!url.pathname.startsWith(prefix)) return next();
		const [resource, key, slug] = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
		try {
			if (resource === 'leads' && req.method === 'POST') {
				let raw = '';
				for await (const chunk of req) raw += chunk;
				const body = JSON.parse(raw || '{}') as { funnelKey?: string };
				if (!body.funnelKey || !config.funnels?.[body.funnelKey]) {
					return sendJson(res, 404, {
						error: 'Not Found',
						message: 'Formular unbekannt',
						status: 404,
						code: 'funnel_not_found',
					});
				}
				server.config.logger.info(`[dealsystem] Probe-Einsendung „${body.funnelKey}“ (nicht gespeichert)`);
				// Wie ein Vorschau-Host: geprüft, nicht gespeichert.
				res.setHeader('X-Captcha-Mode', 'test');
				return sendJson(res, 200, { data: { accepted: true, dryRun: true } });
			}
			if (resource === 'collections' && req.method === 'GET' && key) {
				const snapshot = await readSnapshot(root);
				const entries = [...(snapshot.collections[key]?.entries ?? [])].sort((a, b) =>
					b.publishedAt.localeCompare(a.publishedAt),
				);
				if (url.searchParams.get('sort') === 'publishedAt') entries.reverse();
				if (slug) {
					const entry = entries.find((e) => e.slug === slug);
					return entry
						? sendJson(res, 200, { data: entry })
						: sendJson(res, 404, {
								error: 'Not Found',
								message: 'Eintrag unbekannt',
								status: 404,
								code: 'entry_not_found',
							});
				}
				const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
				const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 100));
				return sendJson(res, 200, {
					data: entries.slice(offset, offset + limit),
					meta: { total: entries.length, limit, offset },
				});
			}
			return sendJson(res, 404, {
				error: 'Not Found',
				message: 'Unbekannter Pfad',
				status: 404,
				code: 'not_found',
			});
		} catch (error) {
			return sendJson(res, 500, {
				error: 'Internal Error',
				message: String(error),
				status: 500,
				code: 'dev_error',
			});
		}
	});
}

/**
 * Das Vite-Plugin. Gehört in `vite.config.ts` **vor** `sveltekit()` und
 * bekommt die Konfiguration aus `dealsystem.config.ts`.
 *
 * @example
 * // vite.config.ts
 * import { sveltekit } from '@sveltejs/kit/vite';
 * import { dealsystem } from '@dealsystem/site/vite';
 * import { defineConfig } from 'vite';
 * import site from './dealsystem.config';
 *
 * export default defineConfig({
 * 	plugins: [dealsystem(site), sveltekit()],
 * });
 */
export function dealsystem(config: SiteConfig): Plugin {
	const problems = validateSiteConfig(config).filter((p) => p.path !== 'siteId');
	if (problems.length > 0) {
		throw new Error(
			`[dealsystem] dealsystem.config.ts ist ungültig:\n${problems.map((p) => `  - ${p.path}: ${p.message}`).join('\n')}`,
		);
	}

	let root = process.cwd();
	let code: string | null = null;
	const loadedIds = new Set<string>();

	async function refresh(): Promise<SiteManifest> {
		const snapshot = await readSnapshot(root);
		const { slots, routes } = await collectSlots(root);
		code = `export default ${JSON.stringify(buildSiteData(config, snapshot, slots, process.env))};`;
		return buildManifest(config, slots, routes);
	}

	async function writeManifest(manifest: SiteManifest): Promise<void> {
		const file = resolve(root, process.env[MANIFEST_FILE_ENV] || LOCAL_MANIFEST_FILE);
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, `${JSON.stringify(manifest, null, '\t')}\n`);
	}

	return {
		name: 'dealsystem-site',
		enforce: 'pre',

		config() {
			// Das Paket muss durch Vite laufen, sonst greift `load` unten nicht.
			return {
				optimizeDeps: { exclude: [PACKAGE] },
				ssr: { noExternal: [PACKAGE] },
			};
		},

		configResolved(resolved) {
			root = resolved.root;
		},

		async buildStart() {
			await writeManifest(await refresh());
		},

		async load(id) {
			if (!SITE_DATA_MODULE.test(id)) return null;
			loadedIds.add(id);
			if (code === null) await refresh();
			return code;
		},

		configureServer(server) {
			devSiteApi(server, config, root);

			const contentFile = resolve(root, process.env[CONTENT_FILE_ENV] || LOCAL_CONTENT_FILE);
			server.watcher.add(contentFile);

			const onChange = async (file: string) => {
				const isContent = resolve(file) === contentFile;
				const isSource = file.endsWith('.svelte') && !file.includes('node_modules');
				if (!isContent && !isSource) return;
				const before = code;
				try {
					await writeManifest(await refresh());
				} catch (error) {
					server.config.logger.error(error instanceof Error ? error.message : String(error));
					return;
				}
				if (code === before) return;
				for (const environment of Object.values(server.environments)) {
					for (const id of loadedIds) {
						const module = environment.moduleGraph.getModuleById(id);
						if (module) environment.moduleGraph.invalidateModule(module);
					}
				}
				server.hot.send({ type: 'full-reload' });
			};
			server.watcher.on('change', onChange);
			server.watcher.on('add', onChange);
			server.watcher.on('unlink', onChange);
		},
	};
}
