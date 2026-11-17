// Lade-Helfer für den Build. Sie lesen den Inhalts-Schnappschuss aus einer
// Datei und laufen deshalb nur in `+page.server.ts` / `+layout.server.ts` mit
// `export const prerender = true` — nie im Browser.
import { BROWSER } from 'esm-env';
import { getSiteData } from '../internal/siteData.js';
import { emptySnapshot, normalizeSnapshot } from '../snapshot.js';
import type {
	CollectionEntry,
	CollectionKey,
	ContentSnapshot,
	LegalProfile,
	RawCollectionEntry,
	SiteInfo,
	SlotKey,
	SlotOverride,
} from '../types.js';

export type { CollectionEntry, CollectionKey, LegalProfile, MediaRef, SiteInfo } from '../types.js';

/** Umgebungsvariable mit dem Pfad des Schnappschusses (setzt der Build-Host). */
export const CONTENT_FILE_ENV = 'DEALSYSTEM_CONTENT_FILE';
/** Lokale Kopie des Schnappschusses, geschrieben von `dealsystem sync`. */
export const LOCAL_CONTENT_FILE = '.dealsystem/content.json';

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
 * Liefert beim Build Name, Adresse und Firmendaten der Seite, z. B. für
 * `<title>` oder strukturierte Daten.
 *
 * @example
 * // src/routes/+layout.server.ts
 * export const prerender = true;
 * export async function load() {
 * 	return { site: await getSite() };
 * }
 */
export async function getSite(): Promise<SiteInfo & { url: string; legal: LegalProfile }> {
	assertBuildTime('getSite');
	const snapshot = await readSnapshot();
	return { ...snapshot.site, url: getSiteData().site.url, legal: snapshot.legal };
}
