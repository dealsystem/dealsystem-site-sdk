// Vite-Plugin von @dealsystem/site. Es
//  - bettet die öffentlichen Daten der Seite ein (Texte aus dem CRM,
//    Firmendaten, Formulare, Zugang zur Site-API),
//  - sammelt die Content-Slots aus dem Quelltext,
//  - schreibt das Manifest, das der Build ans CRM meldet,
//  - legt `manifest.webmanifest` an, wenn im CRM ein Favicon hochgeladen ist,
//  - beantwortet in der Entwicklung die Site-API aus der lokalen Kopie.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { validateSiteConfig } from '../config/index.js';
import { resolveExternal } from '../external/resolve.js';
import { normalizeLeadmagnet } from '../leadmagnet.js';
import { readSnapshot } from '../content/index.js';
import { CONTENT_FILE_ENV, LOCAL_CONTENT_FILE, LOCAL_MANIFEST_FILE, MANIFEST_FILE_ENV } from '../paths.js';
import { defaultRichtextToHtml, sanitizeRichtextHtml } from '../richtext/server.js';
import { resolveTextSlot } from '../slots.js';
import { WEB_MANIFEST_PATH, webManifest } from '../internal/seo.js';
import type {
	ContentSlotDef,
	ContentSnapshot,
	SiteConfig,
	SiteData,
	SiteManifest,
	SlotDefaultImage,
} from '../types.js';
import { SDK_VERSION } from '../version.js';
import { CONTENT_BLOCK_VERSION, CONTENT_PATCH_LIMITS } from '../contentBlock.js';
import { slotOrder, type OrderInput } from './order.js';
import { mergeSlots, routeOfFile, scanSlots, type FoundSlot } from './scan.js';
import { scheduleFrom } from '../schedule.js';
import { scanZeitfenster } from './zeitfenster.js';

export { scanSlots, mergeSlots, SlotScanError, type FoundSlot } from './scan.js';
export { scanZeitfenster, type FoundGrenze, type FoundZeitfenster } from './zeitfenster.js';
export { parseZeitpunkt, scheduleFrom, SCHEDULE_MAX, zeitpunktFehlerText } from '../schedule.js';
export type { SiteManifest } from '../types.js';

export { LOCAL_MANIFEST_FILE, MANIFEST_FILE_ENV } from '../paths.js';
/** Publishable Key in der Entwicklung. Der Dev-Server beantwortet ihn selbst. */
export const DEV_SITE_KEY = 'dev';

// Platzhalter-Dateien des Pakets, deren Inhalt das Plugin beim Laden ersetzt.
const EMBEDDED_MODULE = /[\\/]dealsystem-(site-data|legal-imprint|legal-privacy)\.(?:js|ts)(?:\?.*)?$/;
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

/** Herkunft des Standardbilds je Bild-Slot (Schlüssel), wie der Scan sie im Quelltext findet. */
export type ImageSources = Map<string, NonNullable<FoundSlot['imageSource']>>;

/** Ergebnis von `collectSlots`. */
export interface CollectedSlots {
	slots: ContentSlotDef[];
	routes: string[];
	imageSources: ImageSources;
	/** `<SiteHead>` steht im Haupt-Layout: jede Seite bekommt den Inhaltsblock. */
	siteHeadInRootLayout: boolean;
	/** Der Code liest Slot-Werte selbst (`getSlots()`, Schnappschuss): sie können überall stehen. */
	readsSlotsInCode: boolean;
	/** Grenzen aller `<Zeitfenster>` mit festem Zeitpunkt (Millisekunden). */
	grenzen: number[];
}

/** `<SiteHead>` aus dem SDK wird in dieser Datei benutzt. */
export function usesSiteHead(code: string): boolean {
	return (
		/import\s*\{[^}]*\bSiteHead\b[^}]*\}\s*from\s*['"]@dealsystem\/site['"]/.test(code) &&
		/<SiteHead\b/.test(code)
	);
}

/** Sammelt die Slots aller `.svelte`-Dateien unter `src/`. */
export async function collectSlots(root: string): Promise<CollectedSlots> {
	const found: FoundSlot[] = [];
	const ordered: OrderInput[] = [];
	const grenzen: number[] = [];
	const routes = new Set<string>();
	let siteHeadInRootLayout = false;
	for (const file of await svelteFiles(resolve(root, 'src'))) {
		const shown = relative(root, file).replace(/\\/g, '/');
		if (/\/\+page(?:@[^.]*)?\.svelte$/.test(shown)) {
			const route = routeOfFile(shown);
			if (route) routes.add(route);
		}
		const code = await readFile(file, 'utf8');
		if (shown === 'src/routes/+layout.svelte' && usesSiteHead(code)) siteHeadInRootLayout = true;
		const fileSlots = scanSlots(code, shown);
		found.push(...fileSlots);
		ordered.push({ file: shown, code, slots: fileSlots });
		for (const fenster of scanZeitfenster(code))
			for (const grenze of fenster.grenzen) if (grenze.ms !== null) grenzen.push(grenze.ms);
	}
	const imageSources: ImageSources = new Map();
	for (const slot of found) {
		if (slot.imageSource && !imageSources.has(slot.key)) imageSources.set(slot.key, slot.imageSource);
	}
	const { positions, firstRoutes } = slotOrder(ordered);
	return {
		// `route` aus dem Code (Slot in einer +page/+layout-Datei) bleibt; Slots in Komponenten einer Seite bekommen
		// die erste Route, in der sie vorkommen. Das CRM gruppiert danach.
		slots: mergeSlots(found).map((slot) => {
			const route = slot.route ?? firstRoutes.get(slot.key);
			return { ...slot, ...(route !== undefined ? { route } : {}), position: positions.get(slot.key)! };
		}),
		routes: [...routes].sort(),
		imageSources,
		siteHeadInRootLayout,
		readsSlotsInCode: await mentionsGetSlots(resolve(root, 'src')),
		grenzen,
	};
}

/**
 * Trägt bei jedem Bild-Slot `defaultImage` ein: den Pfad des Standardbilds in der fertigen Seite, oder `null`,
 * wenn er sich nicht sicher sagen lässt. `static`: die Datei muss unter `static/` liegen. `module`: der Pfad
 * kommt aus dem Client-Build (`assets`: Datei im Projekt → Pfad im Artefakt); ein eingebettetes Bild
 * (Vite: unter 4 KB als `data:`) steht dort nicht und bleibt `null`.
 */
export function withDefaultImages(
	slots: readonly ContentSlotDef[],
	sources: ImageSources,
	staticExists: (path: string) => boolean,
	assets: ReadonlyMap<string, string>,
): ContentSlotDef[] {
	return slots.map((slot) => {
		if (slot.type !== 'image') return slot;
		const source = sources.get(slot.key);
		const path =
			source?.kind === 'static'
				? staticExists(source.path)
					? source.path
					: null
				: source?.kind === 'module'
					? (assets.get(source.path) ?? null)
					: null;
		const defaultImage: SlotDefaultImage | null = path
			? {
					path,
					...(source?.width ? { width: source.width } : {}),
					...(source?.height ? { height: source.height } : {}),
				}
			: null;
		return { ...slot, defaultImage };
	});
}

/**
 * Irgendeine Quelldatei unter `src/` liest Slot-Werte selbst: `getSlots()`, `readSnapshot()` oder den
 * Schnappschuss `.dealsystem/content.json`. Grob, aber auf der sicheren Seite.
 */
const READS_SLOTS = /\bgetSlots\b|\breadSnapshot\b|content\.json\b/;

async function mentionsGetSlots(dir: string): Promise<boolean> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && (await mentionsGetSlots(path)))
				return true;
		} else if (/\.(svelte|[cm]?[jt]s)$/.test(entry.name)) {
			if (READS_SLOTS.test(await readFile(path, 'utf8'))) return true;
		}
	}
	return false;
}

/**
 * Angaben für „Patchen statt Bauen“: Darf der Core neue Slot-Werte in die
 * fertige Seite schreiben, statt neu zu bauen? Und was braucht er dafür?
 */
export function buildContentPatchInfo(
	collected: Pick<CollectedSlots, 'siteHeadInRootLayout' | 'readsSlotsInCode'>,
	slots: readonly ContentSlotDef[],
): NonNullable<SiteManifest['contentPatch']> {
	const blockers: string[] = [];
	if (!collected.siteHeadInRootLayout) blockers.push('site-head-missing');
	if (collected.readsSlotsInCode) blockers.push('get-slots');
	// Standard-HTML der Richtext-Slots: braucht der Core, wenn der Kunde einen Text zurücksetzt.
	let richtextDefaults: Record<string, string> = {};
	let bytes = 0;
	let entries = 0;
	let tooLarge = false;
	const encoder = new TextEncoder();
	for (const slot of slots) {
		if (slot.type !== 'richtext' || typeof slot.default !== 'string') continue;
		const html = defaultRichtextToHtml(slot.default);
		entries += 1;
		bytes += encoder.encode(slot.key).length + encoder.encode(html).length;
		if (
			html.length > CONTENT_PATCH_LIMITS.richtextDefaultMaxLength ||
			entries > CONTENT_PATCH_LIMITS.richtextDefaultsMaxEntries ||
			bytes > CONTENT_PATCH_LIMITS.richtextDefaultsTotalBytes
		) {
			tooLarge = true;
			break;
		}
		richtextDefaults[slot.key] = html;
	}
	// Zu groß für den Build-Bericht: Die Seite baut weiter, nur gepatcht wird sie nicht.
	if (tooLarge) {
		blockers.push('richtext-defaults-too-large');
		richtextDefaults = {};
	}
	return {
		format: CONTENT_BLOCK_VERSION,
		delivery: blockers.includes('site-head-missing') ? 'embedded' : 'dom',
		blockers,
		richtextDefaults,
	};
}

/** Baut das Manifest aus Konfiguration, Slots und Routen. */
export function buildManifest(
	config: SiteConfig,
	slots: ContentSlotDef[],
	routes: string[],
	extras: { contentPatch?: SiteManifest['contentPatch']; schedule?: string[] } = {},
): SiteManifest {
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
		funnels: Object.entries(config.funnels ?? {}).map(([key, funnel]) => ({
			...funnel,
			key,
			// Vertrag mit dem Core (C4): immer gesetzt, `{ label }` getrimmt oder `null`.
			leadmagnet: normalizeLeadmagnet(funnel.leadmagnet),
		})),
		...(extras.contentPatch ? { contentPatch: extras.contentPatch } : {}),
		schedule: extras.schedule ?? [],
		external: resolveExternal(config.external),
		bookings: Object.entries(config.booking ?? {}).map(([key, booking]) => ({ ...booking, key })),
	};
}

/**
 * Quelltext des Moduls `dealsystem-site-data` für den Browser, wenn die Seite
 * den Inhaltsblock trägt: alles außer Slots und Richtext steht im Bundle, die
 * Texte liest der Browser aus `<script id="ds-content">`. Fehlt der Block,
 * gelten die Standardwerte aus dem Code.
 */
export function clientSiteDataModule(data: SiteData): string {
	const base = { ...data, slots: {}, richtext: {} };
	return [
		"import { CONTENT_BLOCK_ID, parseContentBlock } from '../contentBlock.js';",
		`const base = ${JSON.stringify(base)};`,
		"const block = typeof document === 'undefined' ? null : parseContentBlock(document.getElementById(CONTENT_BLOCK_ID)?.textContent);",
		'export default block ? { ...base, slots: block.slots, richtext: block.richtext } : base;',
	].join('\n');
}

/** Baut die Daten, die in die Seite eingebettet werden. Nur Öffentliches. */
export function buildSiteData(
	config: SiteConfig,
	snapshot: ContentSnapshot,
	slots: readonly ContentSlotDef[],
	env: Record<string, string | undefined>,
	builtAt = Date.now(),
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
		legal: {
			company: snapshot.legal.company,
			address: snapshot.legal.address,
			email: snapshot.legal.email,
			phone: snapshot.legal.phone,
		},
		tracking: snapshot.tracking,
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
				{ route: collection.route, fields: collection.fields },
			]),
		),
		slots: snapshot.slots,
		richtext,
		seo: snapshot.seo,
		builtAt,
		external: Object.fromEntries(resolveExternal(config.external).map((entry) => [entry.id, entry])),
		bookings: Object.fromEntries(
			Object.entries(config.booking ?? {}).map(([key, booking]) => [key, { ...booking }]),
		),
		consent: { banner: config.consent?.banner === 'own' ? 'own' : 'dealsystem' },
	};
}

const DEV_CAPTCHA_SECRET = 'dealsystem-dev';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Test-Aufgabe für `vite dev`, in derselben Form wie die des Core (ALTCHA v3,
 * PBKDF2/SHA-256, signiert, an die Seite gebunden), damit das Formular lokal
 * genauso läuft wie später. Der Schlüssel ist öffentlich: geprüft wird die
 * Lösung lokal nicht.
 */
export async function createDevCaptchaChallenge(siteId: string): Promise<unknown> {
	const { createChallenge, pbkdf2 } = await import('altcha/lib');
	return createChallenge({
		algorithm: 'PBKDF2/SHA-256',
		cost: 2000,
		counter: 250 + Math.floor(Math.random() * 501),
		deriveKey: pbkdf2.deriveKey,
		expiresAt: Math.floor(Date.now() / 1000) + 600,
		data: { site: UUID.test(siteId) ? siteId : '00000000-0000-0000-0000-000000000000' },
		hmacSignatureSecret: DEV_CAPTCHA_SECRET,
		hmacKeySignatureSecret: DEV_CAPTCHA_SECRET,
	});
}

/**
 * Freie Probe-Zeiten für `vite dev`: werktags 9 bis 16 Uhr Berliner Zeit im Abstand von 30 Minuten, ab der
 * nächsten vollen Stunde. Zeiten in UTC wie bei der Site-API; die Zeitumstellung erledigt `Intl`.
 */
export function devBookingSlots(
	from: Date,
	to: Date,
	durationMinutes = 30,
): { start: string; end: string }[] {
	const out: { start: string; end: string }[] = [];
	const format = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Berlin',
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	});
	const step = 30 * 60_000;
	let t = Math.ceil(Math.max(from.getTime(), Date.now() + 3_600_000) / step) * step;
	while (t + durationMinutes * 60_000 <= to.getTime() && out.length < 2000) {
		const p = Object.fromEntries(format.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
		const minutes = Number(p.hour) * 60 + Number(p.minute);
		if (
			p.weekday !== 'Sat' &&
			p.weekday !== 'Sun' &&
			minutes >= 9 * 60 &&
			minutes + durationMinutes <= 16 * 60
		) {
			out.push({
				start: new Date(t).toISOString(),
				end: new Date(t + durationMinutes * 60_000).toISOString(),
			});
		}
		t += step;
	}
	return out;
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(body));
}

/**
 * Beantwortet in `vite dev` die Site-API für den Schlüssel `dev`: Sammlungen
 * aus der lokalen Kopie, eine Test-Aufgabe für das Captcha, Formulare als
 * Probelauf ohne Speichern. `dealsystem dev`
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
			if (resource === 'track' && req.method === 'POST') {
				// Seitenaufrufe zählen lokal nicht; wie eine Vorschau: geprüft, nichts gespeichert.
				for await (const _chunk of req) void _chunk;
				return sendJson(res, 200, { data: { accepted: true, dryRun: true } });
			}
			if (resource === 'booking' && key) {
				const booking = config.booking?.[key];
				if (!booking) {
					return sendJson(res, 404, {
						error: 'Not Found',
						message: 'Buchung unbekannt',
						status: 404,
						code: 'booking_unavailable',
					});
				}
				if (!slug && req.method === 'GET') {
					// Probe-Terminart: die echte richtet der Kunde im CRM ein.
					return sendJson(res, 200, {
						data: {
							key,
							label: booking.label ?? 'Probetermin',
							title: booking.label ?? 'Probetermin',
							description: 'Lokale Vorschau: Zeiten und Fragen sind Beispiele.',
							durationMinutes: 30,
							timezone: 'Europe/Berlin',
							locations: [
								{ type: 'phone', label: 'Telefon', attendeeInput: null },
								{ type: 'attendee_address', label: 'Bei Ihnen vor Ort', attendeeInput: 'address' },
							],
							questions: [
								{
									key: 'anliegen',
									label: 'Worum geht es?',
									type: 'textarea',
									required: false,
									options: null,
									placeholder: null,
								},
							],
						},
					});
				}
				if (slug === 'slots' && req.method === 'GET') {
					const from = new Date(url.searchParams.get('from') ?? Date.now());
					const to = new Date(url.searchParams.get('to') ?? from.getTime() + 7 * 86_400_000);
					return sendJson(res, 200, {
						data: {
							timezone: 'Europe/Berlin',
							from: from.toISOString(),
							to: to.toISOString(),
							slots: devBookingSlots(from, to),
						},
					});
				}
				if (slug === 'qualify' && req.method === 'POST') {
					for await (const _chunk of req) void _chunk;
					// Beispieldaten kennen keine Regel: jede Antwort passt.
					return sendJson(res, 200, { data: { qualified: true } });
				}
				if (slug === 'bookings' && req.method === 'POST') {
					let raw = '';
					for await (const chunk of req) raw += chunk;
					const body = JSON.parse(raw || '{}') as { start?: string };
					server.config.logger.info(`[dealsystem] Probe-Buchung „${key}“ (nicht gebucht)`);
					// Wie ein Vorschau-Host: geprüft, nichts gebucht, keine Mail.
					const start = body.start ? new Date(body.start) : new Date();
					return sendJson(res, 200, {
						data: {
							booked: true,
							dryRun: true,
							start: start.toISOString(),
							end: new Date(start.getTime() + 30 * 60_000).toISOString(),
						},
					});
				}
			}
			if (resource === 'captcha' && req.method === 'GET') {
				res.setHeader('Cache-Control', 'no-store');
				res.setHeader('X-Captcha-Mode', 'test');
				return sendJson(res, 200, await createDevCaptchaChallenge(config.siteId));
			}
			if (resource === 'collections' && req.method === 'GET' && key) {
				const notFound = (message: string) =>
					sendJson(res, 404, { error: 'Not Found', message, status: 404, code: 'not_found' });
				if (!config.collections?.[key]) return notFound('Sammlung unbekannt');
				const snapshot = await readSnapshot(root);
				const entries = [...(snapshot.collections[key]?.entries ?? [])].sort((a, b) =>
					b.publishedAt.localeCompare(a.publishedAt),
				);
				if (url.searchParams.get('sort') === 'publishedAt') entries.reverse();
				if (slug) {
					const entry = entries.find((e) => e.slug === slug);
					return entry ? sendJson(res, 200, { data: entry }) : notFound('Eintrag unbekannt');
				}
				// Wie die Site-API: ohne Angabe 20, höchstens 100, Werte werden geklemmt.
				const clamp = (name: string, fallback: number, min: number, max: number) => {
					const value = Number.parseInt(url.searchParams.get(name) ?? '', 10);
					return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
				};
				const limit = clamp('limit', 20, 1, 100);
				const offset = clamp('offset', 0, 0, 10_000);
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
	let code: Record<string, string> | null = null;
	let clientSiteData: string | null = null;
	let snapshot: ContentSnapshot | null = null;
	let scanned: Awaited<ReturnType<typeof collectSlots>> | null = null;
	/**
	 * Zeitpunkt des Builds: entscheidet über `<Zeitfenster>` im HTML und welche Grenzen „künftig“ sind. Einmal je
	 * Build, damit Server- und Client-Teil dieselbe Zeit sehen. In `vite dev` bleibt sie stehen (sonst lüde
	 * jede Änderung die Seite ganz neu); dort schaltet der Baustein nach dem Laden mit der Uhr des Browsers.
	 */
	const builtAt = Date.now();
	/** Datei im Projekt → Pfad im Artefakt, aus dem Client-Build. Bleibt für spätere Builds desselben Laufs. */
	const assets = new Map<string, string>();
	const loadedIds = new Set<string>();

	function currentManifest(): SiteManifest {
		const { slots, routes, imageSources } = scanned!;
		const staticExists = (path: string) => existsSync(resolve(root, 'static', `.${path}`));
		return buildManifest(config, withDefaultImages(slots, imageSources, staticExists, assets), routes, {
			contentPatch: buildContentPatchInfo(scanned!, slots),
			schedule: scheduleFrom(scanned!.grenzen, builtAt),
		});
	}

	async function refresh(): Promise<SiteManifest> {
		snapshot = await readSnapshot(root);
		scanned = await collectSlots(root);
		const { slots } = scanned;
		const module = (value: unknown) => `export default ${JSON.stringify(value)};`;
		const siteData = buildSiteData(config, snapshot, slots, process.env, builtAt);
		const contentPatch = buildContentPatchInfo(scanned, slots);
		// Mit `<SiteHead>` im Haupt-Layout stehen die Texte nur im HTML, nicht im Bundle.
		clientSiteData = contentPatch.delivery === 'dom' ? clientSiteDataModule(siteData) : null;
		code = {
			'site-data': module(siteData),
			// Rechtstexte des Kunden: im Core bereinigt, hier noch einmal gegen die Positiv-Liste geprüft.
			'legal-imprint': module(sanitizeRichtextHtml(snapshot.legal.imprintHtml)),
			'legal-privacy': module(sanitizeRichtextHtml(snapshot.legal.privacyHtml)),
		};
		return currentManifest();
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

		generateBundle(_options, bundle) {
			// Nur in den Teil, der ausgeliefert wird; adapter-static kopiert ihn nach `build/`.
			if (this.environment?.name !== 'client' || !snapshot) return;
			const source = webManifest(snapshot.seo, snapshot.site.name);
			if (source) this.emitFile({ type: 'asset', fileName: WEB_MANIFEST_PATH.slice(1), source });
			// Wo die importierten Bilder im Artefakt liegen. Eingebettete Bilder (data:) erscheinen hier nicht.
			for (const output of Object.values(bundle)) {
				if (output.type !== 'asset') continue;
				const originals = (output as { originalFileNames?: readonly string[] }).originalFileNames ?? [];
				for (const original of originals) {
					const shown = (isAbsolute(original) ? relative(root, original) : original).replace(/\\/g, '/');
					assets.set(shown, `/${output.fileName}`);
				}
			}
		},

		async writeBundle() {
			// Erst jetzt sind die Pfade der Bilder bekannt: Manifest mit `defaultImage` noch einmal schreiben.
			if (this.environment?.name !== 'client' || !scanned) return;
			await writeManifest(currentManifest());
		},

		async load(id, options) {
			const match = EMBEDDED_MODULE.exec(id);
			if (!match) return null;
			loadedIds.add(id);
			if (code === null) await refresh();
			const ssr = options?.ssr ?? this.environment?.name === 'ssr';
			if (match[1] === 'site-data' && !ssr && clientSiteData !== null) return clientSiteData;
			return code![match[1]!] ?? null;
		},

		configureServer(server) {
			devSiteApi(server, config, root);
			server.middlewares.use(WEB_MANIFEST_PATH, async (_req, res, next) => {
				const current = await readSnapshot(root);
				const source = webManifest(current.seo, current.site.name);
				if (!source) return next();
				res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
				res.end(source);
			});

			const contentFile = resolve(root, process.env[CONTENT_FILE_ENV] || LOCAL_CONTENT_FILE);
			server.watcher.add(contentFile);

			const onChange = async (file: string) => {
				const isContent = resolve(file) === contentFile;
				const isSource = file.endsWith('.svelte') && !file.includes('node_modules');
				if (!isContent && !isSource) return;
				const before = JSON.stringify(code) + String(clientSiteData);
				try {
					await writeManifest(await refresh());
				} catch (error) {
					server.config.logger.error(error instanceof Error ? error.message : String(error));
					return;
				}
				if (JSON.stringify(code) + String(clientSiteData) === before) return;
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
