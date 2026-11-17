import type { CollectionEntry, CollectionKey, RawCollectionEntry } from '../types.js';
import { siteApi, type SiteApiResult } from './siteApi.js';

// Richtext-Felder liefert die Site-API schon als bereinigtes HTML.
function toEntry<K extends string>(raw: RawCollectionEntry): CollectionEntry<K> {
	return raw as unknown as CollectionEntry<K>;
}

/** Ergebnis von `loadCollection`. */
export interface LoadedCollection<K extends string> {
	entries: CollectionEntry<K>[];
	/** Gesamtzahl der veröffentlichten Einträge, `null` wenn unbekannt. */
	total: number | null;
}

/**
 * Lädt Einträge einer Sammlung **im Browser** über die Site-API, z. B. für
 * „Mehr laden“. Wirft nie: das Ergebnis ist `{ ok: true, data }` oder
 * `{ ok: false, error }`. Ohne `limit` kommen 20 Einträge, höchstens 100 je
 * Abruf; `total` nennt die Gesamtzahl, weitere holt `offset`. Inhalte, die Suchmaschinen sehen sollen, lädt
 * stattdessen `getCollection()` aus `@dealsystem/site/content` beim Build.
 *
 * @example
 * const result = await loadCollection('angebote', { limit: 12, offset: 12 });
 * if (result.ok) angebote.push(...result.data.entries);
 * else meldung = result.error.message;
 */
export async function loadCollection<K extends CollectionKey>(
	key: K,
	query: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' } = {},
): Promise<SiteApiResult<LoadedCollection<K>>> {
	const result = await siteApi().getCollection(key, query);
	if (!result.ok) return result;
	return {
		ok: true,
		data: { entries: result.data.entries.map((e) => toEntry<K>(e)), total: result.data.total },
	};
}

/**
 * Lädt einen Eintrag **im Browser** über die Site-API. Wirft nie; ein
 * unbekannter Slug ergibt `{ ok: false, error: { kind: 'not_found' } }`.
 *
 * @example
 * const result = await loadEntry('angebote', 'altbau-leipzig');
 * if (result.ok) angebot = result.data;
 */
export async function loadEntry<K extends CollectionKey>(
	key: K,
	slug: string,
): Promise<SiteApiResult<CollectionEntry<K>>> {
	const result = await siteApi().getEntry(key, slug);
	if (!result.ok) return result;
	return { ok: true, data: toEntry<K>(result.data) };
}
