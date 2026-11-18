// Normalisierer für den Inhalts-Schnappschuss und für Antworten der Site-API.
// Lesen ist nachsichtig: Unbekanntes fällt weg, Fehlendes wird zum harmlosen
// Standard. So legt ein neuer Core mit zusätzlichen Feldern keine Seite lahm.
import type {
	ContentSlotType,
	ContentSnapshot,
	LegalProfile,
	MediaRef,
	MediaVariant,
	RawCollectionEntry,
	SeoConfig,
	SeoFavicon,
	SeoMeta,
	SlotOverride,
} from './types.js';

const SLOT_TYPES: readonly ContentSlotType[] = ['text', 'textarea', 'richtext', 'link', 'image'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

function numOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Nur Pfade der eigenen Seite und https-Adressen. Alles andere fällt weg. */
function safeUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	if (/^\/(?!\/)/.test(value) || /^https:\/\//i.test(value)) return value;
	return null;
}

function normalizeVariant(raw: unknown): MediaVariant | null {
	if (!isRecord(raw)) return null;
	const url = safeUrl(raw.url);
	const width = numOrNull(raw.width);
	const format = raw.format;
	if (!url || !width || width <= 0) return null;
	if (format !== 'jpeg' && format !== 'webp' && format !== 'avif') return null;
	return { url, width, format };
}

/** Prüft und bereinigt einen `MediaRef`. Unbrauchbares ergibt `null`. */
export function normalizeMediaRef(raw: unknown): MediaRef | null {
	if (!isRecord(raw)) return null;
	const { kind } = raw;
	if (typeof raw.id !== 'string' || (kind !== 'image' && kind !== 'video' && kind !== 'file')) return null;
	const ref: MediaRef = {
		id: raw.id,
		kind,
		alt: str(raw.alt),
		width: numOrNull(raw.width),
		height: numOrNull(raw.height),
		variants: Array.isArray(raw.variants)
			? raw.variants.map(normalizeVariant).filter((v): v is MediaVariant => v !== null)
			: [],
	};
	if (isRecord(raw.video) && raw.video.provider === 'bunny') {
		const playbackUrl = safeUrl(raw.video.playbackUrl);
		const posterUrl = safeUrl(raw.video.posterUrl);
		if (playbackUrl) ref.video = { provider: 'bunny', playbackUrl, posterUrl: posterUrl ?? '' };
	}
	const url = safeUrl(raw.url);
	if (url) ref.url = url;
	return ref;
}

/** Prüft einen Eintrag aus Schnappschuss oder Site-API. */
export function normalizeEntry(raw: unknown): RawCollectionEntry | null {
	if (!isRecord(raw) || typeof raw.slug !== 'string' || raw.slug === '') return null;
	const media: Record<string, MediaRef[]> = {};
	if (isRecord(raw.media)) {
		for (const [field, refs] of Object.entries(raw.media)) {
			media[field] = Array.isArray(refs)
				? refs.map(normalizeMediaRef).filter((r): r is MediaRef => r !== null)
				: [];
		}
	}
	return {
		slug: raw.slug,
		publishedAt: str(raw.publishedAt),
		data: isRecord(raw.data) ? raw.data : {},
		media,
	};
}

function normalizeLegal(raw: unknown): LegalProfile {
	const r = isRecord(raw) ? raw : {};
	return {
		company: str(r.company),
		address: str(r.address),
		email: str(r.email),
		phone: str(r.phone),
		imprintHtml: str(r.imprintHtml),
		privacyHtml: str(r.privacyHtml),
	};
}

// eslint-disable-next-line no-control-regex -- Steuerzeichen gehören nicht in Titel und Beschreibung
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Klartext für Titel und Beschreibung: Steuerzeichen raus, Leerraum zusammengefasst, leer = `null`. */
function plainText(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
	return text === '' ? null : text;
}

function normalizeSeoMeta(raw: unknown): SeoMeta {
	const r = isRecord(raw) ? raw : {};
	const image = normalizeMediaRef(r.image);
	return {
		title: plainText(r.title, 300),
		description: plainText(r.description, 1000),
		image: image && image.kind === 'image' && image.variants.length > 0 ? image : null,
	};
}

/** Statische Route in SvelteKit-Schreibweise, wie im Manifest: `/`, `/kontakt`, `/ueber-uns/team`. */
const STATIC_ROUTE = /^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/i;

function normalizeFavicon(raw: unknown): SeoFavicon | null {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.icons)) return null;
	const icons: SeoFavicon['icons'] = [];
	for (const icon of raw.icons) {
		if (!isRecord(icon) || icon.type !== 'image/png') continue;
		// Nur Pfade der eigenen Seite: fremde Adressen würde die CSP ohnehin blockieren.
		const url = typeof icon.url === 'string' && /^\/(?!\/)/.test(icon.url) ? icon.url : null;
		const size = icon.size;
		if (!url || typeof size !== 'number' || !Number.isInteger(size) || size <= 0) continue;
		icons.push({ url, size, type: 'image/png' });
	}
	icons.sort((a, b) => a.size - b.size);
	return icons.length > 0 ? { id: raw.id, icons } : null;
}

/** Liest `seo` nachsichtig. Fehlt der Block (älterer Core), ist alles leer. */
export function normalizeSeo(raw: unknown): SeoConfig {
	const r = isRecord(raw) ? raw : {};
	const pages: Record<string, SeoMeta> = {};
	if (isRecord(r.pages)) {
		for (const [route, meta] of Object.entries(r.pages)) {
			if (!STATIC_ROUTE.test(route)) continue;
			const normalized = normalizeSeoMeta(meta);
			if (normalized.title || normalized.description || normalized.image) pages[route] = normalized;
		}
	}
	return {
		noindex: r.noindex === true,
		defaults: normalizeSeoMeta(r.defaults),
		pages,
		favicon: normalizeFavicon(r.favicon),
	};
}

/** Ein leerer Schnappschuss: die Seite zeigt überall ihre Standardwerte. */
export function emptySnapshot(): ContentSnapshot {
	return normalizeSnapshot({});
}

/**
 * Liest einen Schnappschuss nachsichtig ein. Iteriert über die bekannten
 * Felder, nicht über die Eingabe.
 */
export function normalizeSnapshot(raw: unknown): ContentSnapshot {
	const r = isRecord(raw) ? raw : {};
	const site = isRecord(r.site) ? r.site : {};
	const tracking = isRecord(r.tracking) ? r.tracking : {};

	const slots: Record<string, SlotOverride> = {};
	if (isRecord(r.slots)) {
		for (const [key, slot] of Object.entries(r.slots)) {
			if (!isRecord(slot)) continue;
			const type = slot.type as ContentSlotType;
			if (!SLOT_TYPES.includes(type)) continue;
			// Nur eine echte Überschreibung zählt. `source: "default"` (Wert `null`)
			// heißt: es gilt der Standard aus dem aktuellen Code.
			if (slot.source === 'default' || slot.value === null || slot.value === undefined) continue;
			slots[key] = { type, value: slot.value };
		}
	}

	const collections: ContentSnapshot['collections'] = {};
	if (isRecord(r.collections)) {
		for (const [key, collection] of Object.entries(r.collections)) {
			if (!isRecord(collection)) continue;
			collections[key] = {
				source: str(collection.source) || 'cms',
				schemaHash: str(collection.schemaHash),
				entries: Array.isArray(collection.entries)
					? collection.entries.map(normalizeEntry).filter((e): e is RawCollectionEntry => e !== null)
					: [],
			};
		}
	}

	return {
		snapshotVersion: 1,
		site: {
			id: str(site.id),
			slug: str(site.slug),
			name: str(site.name),
			primaryHost: str(site.primaryHost),
			locale: str(site.locale) || 'de',
		},
		legal: normalizeLegal(r.legal),
		tracking: {
			metaPixelId: strOrNull(tracking.metaPixelId),
			googleTagId: strOrNull(tracking.googleTagId),
		},
		funnels: Array.isArray(r.funnels)
			? r.funnels
					.filter(isRecord)
					.filter((f) => typeof f.key === 'string')
					.map((f) => ({ key: f.key as string, active: f.active !== false }))
			: [],
		slots,
		collections,
		seo: normalizeSeo(r.seo),
	};
}
