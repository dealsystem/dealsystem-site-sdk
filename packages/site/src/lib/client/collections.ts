import { getSiteData } from '../internal/siteData.js';
import type { CollectionEntry, CollectionKey, RawCollectionEntry } from '../types.js';
import { siteApi, type SiteApiResult } from './siteApi.js';

function toEntry<K extends string>(key: K, raw: RawCollectionEntry): CollectionEntry<K> {
	const fields = getSiteData().collections[key]?.fields ?? [];
	const data: Record<string, unknown> = { ...raw.data };
	for (const field of fields) {
		if (field.type !== 'richtext') continue;
		const value = raw.data[field.name];
		data[field.name] = typeof value === 'string' && value !== '' ? { kind: 'richtext', source: value } : null;
	}
	return { slug: raw.slug, publishedAt: raw.publishedAt, data, media: raw.media } as CollectionEntry<K>;
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
 * `{ ok: false, error }`. Inhalte, die Suchmaschinen sehen sollen, lädt
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
		data: { entries: result.data.entries.map((e) => toEntry(key, e)), total: result.data.total },
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
	return { ok: true, data: toEntry(key, result.data) };
}
