// Lade-Helfer für den Build. Sie lesen den Inhalts-Schnappschuss aus einer
// Datei und laufen deshalb nur in `+page.server.ts` / `+layout.server.ts` mit
// `export const prerender = true` — nie im Browser.
import { BROWSER } from 'esm-env';
import { getSiteData } from '../internal/siteData.js';
import { CONTENT_FILE_ENV, LOCAL_CONTENT_FILE, LOCAL_MANIFEST_FILE, MANIFEST_FILE_ENV } from '../paths.js';
import { emptySnapshot, normalizeSnapshot } from '../snapshot.js';
import type {
	CollectionEntry,
	CollectionKey,
	ContactProfile,
	ContentSnapshot,
	RawCollectionEntry,
	SiteInfo,
	SlotKey,
	SlotOverride,
} from '../types.js';

export type { CollectionEntry, CollectionKey, LegalProfile, MediaRef, SiteInfo } from '../types.js';

export { CONTENT_FILE_ENV, LOCAL_CONTENT_FILE } from '../paths.js';

let cache: { file: string; mtimeMs: number; snapshot: ContentSnapshot } | null = null;
let warnedMissing = false;

function assertBuildTime(name: string): void {
	if (BROWSER) {
		throw new Error(
			`[dealsystem] ${name}() läuft nur beim Build, nicht im Browser. ` +
				'Rufe es in +page.server.ts auf und ergänze dort `export const prerender = true`.',
		);
	}
}

/**
 * Liest den Schnappschuss. Fehlt die lokale Kopie, baut die Seite mit ihren
 * Standardwerten und leeren Sammlungen. Fehlt die Datei, die der Build-Host
 * nennt, ist das ein Fehler.
 * @internal Benutzt vom Vite-Plugin.
 */
export async function readSnapshot(root: string = process.cwd()): Promise<ContentSnapshot> {
	const { readFile, stat } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const fromEnv = process.env[CONTENT_FILE_ENV];
	const file = resolve(root, fromEnv || LOCAL_CONTENT_FILE);

	let mtimeMs: number;
	try {
		mtimeMs = (await stat(file)).mtimeMs;
	} catch {
		if (fromEnv) {
			throw new Error(`[dealsystem] Der Inhalts-Schnappschuss ${file} (${CONTENT_FILE_ENV}) fehlt.`);
		}
		if (!warnedMissing) {
			warnedMissing = true;
			console.warn(
				`[dealsystem] ${LOCAL_CONTENT_FILE} fehlt. Die Seite zeigt Standardtexte und leere Sammlungen. ` +
					'Hole die Inhalte mit `npx dealsystem sync`.',
			);
		}
		return emptySnapshot();
	}
	if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.snapshot;

	let raw: unknown;
	try {
		raw = JSON.parse(await readFile(file, 'utf8'));
	} catch {
		throw new Error(
			`[dealsystem] ${file} ist kein gültiges JSON. Hole die Inhalte neu mit \`npx dealsystem sync\`.`,
		);
	}
	const snapshot = normalizeSnapshot(raw);
	cache = { file, mtimeMs, snapshot };
	return snapshot;
}

// Richtext-Felder kommen vom Server schon als bereinigtes HTML. Hier wird
// nichts umgewandelt, nur typisiert.
function toEntry<K extends string>(raw: RawCollectionEntry): CollectionEntry<K> {
	return raw as unknown as CollectionEntry<K>;
}

function assertKnown(key: string): void {
	const collection = getSiteData().collections[key];
	if (!collection) {
		const known = Object.keys(getSiteData().collections);
		throw new Error(
			`[dealsystem] Die Sammlung "${key}" steht nicht in dealsystem.config.ts. ` +
				(known.length > 0 ? `Vorhanden: ${known.join(', ')}.` : 'Dort ist noch keine Sammlung eingetragen.'),
		);
	}
}

/** Auswahl und Reihenfolge für `getCollection`. */
export interface CollectionQuery {
	/** Höchstzahl der Einträge. Ohne Angabe alle. */
	limit?: number;
	/** So viele Einträge überspringen. */
	offset?: number;
	/** `newest` (Standard): zuletzt veröffentlichte zuerst. */
	sort?: 'newest' | 'oldest';
}

/**
 * Lädt beim Build die veröffentlichten Einträge einer Sammlung. Richtext-Felder
 * sind bereinigtes HTML vom Server und werden mit `<RichText content={…} />`
 * ausgegeben. Eine Sammlung ohne Einträge ergibt `[]`.
 *
 * @example
 * // src/routes/angebote/+page.server.ts
 * import { getCollection } from '@dealsystem/site/content';
 *
 * export const prerender = true;
 *
 * export async function load() {
 * 	return { angebote: await getCollection('angebote', { limit: 12 }) };
 * }
 */
export async function getCollection<K extends CollectionKey>(
	key: K,
	query: CollectionQuery = {},
): Promise<CollectionEntry<K>[]> {
	assertBuildTime('getCollection');
	assertKnown(key);
	const snapshot = await readSnapshot();
	const entries = [...(snapshot.collections[key]?.entries ?? [])];
	entries.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
	if (query.sort === 'oldest') entries.reverse();
	const offset = Math.max(0, query.offset ?? 0);
	const end = query.limit === undefined ? undefined : offset + Math.max(0, query.limit);
	return entries.slice(offset, end).map((entry) => toEntry<K>(entry));
}

/**
 * Lädt beim Build einen Eintrag über seinen Slug. Gibt `null` zurück, wenn es
 * ihn nicht gibt — die Seite antwortet dann mit `error(404)`.
 *
 * @example
 * // src/routes/angebote/[slug]/+page.server.ts
 * import { error } from '@sveltejs/kit';
 * import { collectionEntries, getEntry } from '@dealsystem/site/content';
 *
 * export const prerender = true;
 * export const entries = collectionEntries('angebote');
 *
 * export async function load({ params }) {
 * 	const angebot = await getEntry('angebote', params.slug);
 * 	if (!angebot) error(404, 'Angebot nicht gefunden');
 * 	return { angebot };
 * }
 */
export async function getEntry<K extends CollectionKey>(
	key: K,
	slug: string,
): Promise<CollectionEntry<K> | null> {
	assertBuildTime('getEntry');
	assertKnown(key);
	const snapshot = await readSnapshot();
	const raw = snapshot.collections[key]?.entries.find((entry) => entry.slug === slug);
	return raw ? toEntry<K>(raw) : null;
}

/**
 * Erzeugt den `entries`-Export einer dynamischen Route, damit SvelteKit jede
 * Detailseite vorrendert.
 *
 * @example
 * // src/routes/angebote/[slug]/+page.server.ts
 * export const entries = collectionEntries('angebote');
 */
export function collectionEntries<K extends CollectionKey>(key: K): () => Promise<{ slug: string }[]> {
	return async () => {
		assertBuildTime('collectionEntries');
		assertKnown(key);
		const snapshot = await readSnapshot();
		return (snapshot.collections[key]?.entries ?? []).map((entry) => ({ slug: entry.slug }));
	};
}

/**
 * Liefert beim Build die im CRM überschriebenen Texte, je Slot-Schlüssel.
 * Für die Ausgabe im Markup ist `<Text>` der einfachere Weg.
 *
 * @example
 * const slots = await getSlots();
 * const titel = slots['start.hero.titel']?.value ?? 'Wir kaufen Ihr Haus';
 */
export async function getSlots(): Promise<Partial<Record<SlotKey, SlotOverride>>> {
	assertBuildTime('getSlots');
	return (await readSnapshot()).slots;
}

/**
 * Liefert beim Build Name und Adresse der Seite und die Firmendaten aus dem
 * CRM (`company`, `address`, `email`, `phone`), z. B. für `<title>` oder
 * strukturierte Daten. Felder, die im CRM leer sind, sind leere Zeichenketten.
 *
 * @example
 * // src/routes/+layout.server.ts
 * import { getSite } from '@dealsystem/site/content';
 *
 * export const prerender = true;
 *
 * export async function load() {
 * 	return { site: await getSite() };
 * }
 */
export async function getSite(): Promise<SiteInfo & ContactProfile & { url: string }> {
	assertBuildTime('getSite');
	const { site, legal } = getSiteData();
	return { ...site, company: legal.company, address: legal.address, email: legal.email, phone: legal.phone };
}

async function readRoutes(): Promise<string[]> {
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const file = resolve(process.cwd(), process.env[MANIFEST_FILE_ENV] || LOCAL_MANIFEST_FILE);
	try {
		const manifest = JSON.parse(await readFile(file, 'utf8')) as { routes?: unknown };
		return Array.isArray(manifest.routes)
			? manifest.routes.filter((r): r is string => typeof r === 'string')
			: [];
	} catch {
		return [];
	}
}

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Erzeugt beim Build die `sitemap.xml` mit allen Seiten, auch den Detailseiten
 * der Sammlungen. Gehört in `src/routes/sitemap.xml/+server.ts` — eine der zwei
 * erlaubten `+server.ts`-Dateien.
 *
 * @example
 * // src/routes/sitemap.xml/+server.ts
 * import { sitemap } from '@dealsystem/site/content';
 *
 * export const prerender = true;
 *
 * export const GET = () => sitemap();
 */
export async function sitemap(): Promise<Response> {
	assertBuildTime('sitemap');
	const site = getSiteData();
	const snapshot = await readSnapshot();
	const paths = new Set<string>();
	for (const route of await readRoutes()) {
		if (!route.includes('[')) {
			paths.add(route);
			continue;
		}
		// Detailseiten: die Route einer Sammlung mit jedem veröffentlichten Slug.
		for (const [key, collection] of Object.entries(site.collections)) {
			if (collection.route.replace(/:slug/g, '[slug]') !== route) continue;
			for (const entry of snapshot.collections[key]?.entries ?? []) {
				paths.add(collection.route.replace(/:slug/g, encodeURIComponent(entry.slug)));
			}
		}
	}
	const urls = [...paths].sort().map((path) => `\t<url><loc>${escapeXml(site.site.url + path)}</loc></url>`);
	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		`${urls.join('\n')}${urls.length > 0 ? '\n' : ''}</urlset>\n`;
	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

/**
 * Erzeugt beim Build die `robots.txt` mit dem Verweis auf die Sitemap. Hat der
 * Kunde im CRM „Nicht bei Google anzeigen“ gewählt, fehlt der Verweis; ein
 * `Disallow` steht trotzdem nicht darin, sonst sähe Google das `noindex` der
 * Seiten nie. Gehört
 * in `src/routes/robots.txt/+server.ts` — eine der zwei erlaubten
 * `+server.ts`-Dateien.
 *
 * @example
 * // src/routes/robots.txt/+server.ts
 * import { robots } from '@dealsystem/site/content';
 *
 * export const prerender = true;
 *
 * export const GET = () => robots();
 */
export function robots(): Response {
	assertBuildTime('robots');
	const { site, seo } = getSiteData();
	const lines = ['User-agent: *', 'Allow: /'];
	if (site.url && !seo.noindex) lines.push('', `Sitemap: ${site.url}/sitemap.xml`);
	return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
