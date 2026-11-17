// „Google und Teilen“: welche Angabe auf einer Seite gilt. Reine Funktionen, damit `<Seo>`, `<SiteHead>`,
// das Vite-Plugin und `robots()` dieselbe Regel nutzen.
import type { MediaRef, SeoConfig, SeoFavicon, SiteData } from '../types.js';

/** Adresse des Web-Manifests mit den großen Favicons (192, 512). Das Vite-Plugin legt es an. */
export const WEB_MANIFEST_PATH = '/manifest.webmanifest';

/** Eigene Angaben einer Seite, wie sie `<Seo>` übergeben bekommt. */
export interface OwnSeo {
	title?: string | null;
	description?: string | null;
	image?: MediaRef | string | null;
	imageAlt?: string | null;
}

export interface ResolvedImage {
	url: string;
	alt: string;
	width: number | null;
	height: number | null;
}

export interface ResolvedSeo {
	title: string;
	description: string | null;
	image: ResolvedImage | null;
	/** Vollständige Adresse der Seite, wenn die Adresse der Website bekannt ist. */
	url: string | null;
}

/** Breite, die WhatsApp, Facebook und LinkedIn für große Vorschauen erwarten. */
const PREVIEW_WIDTH = 1200;

const filled = (value: string | null | undefined): string | null =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** `/(gruppe)/kontakt` → `/kontakt`, wie im Manifest. `null` (Fehlerseite) bleibt `null`. */
export function seoRouteKey(routeId: string | null | undefined): string | null {
	if (typeof routeId !== 'string') return null;
	const segments = routeId.split('/').filter((s) => s && !/^\(.*\)$/.test(s));
	return `/${segments.join('/')}`;
}

function absolute(url: string, siteUrl: string): string {
	return siteUrl && url.startsWith('/') && !url.startsWith('//') ? `${siteUrl}${url}` : url;
}

/** Vorschaubild aus einem `MediaRef`: JPEG zuerst, die kleinste Variante ab 1200 px, sonst die größte. */
export function previewImage(media: MediaRef, siteUrl: string, alt?: string | null): ResolvedImage | null {
	if (media.kind !== 'image' || media.variants.length === 0) return null;
	const jpeg = media.variants.filter((v) => v.format === 'jpeg');
	const pool = [...(jpeg.length > 0 ? jpeg : media.variants)].sort((a, b) => a.width - b.width);
	const variant = pool.find((v) => v.width >= PREVIEW_WIDTH) ?? pool.at(-1)!;
	const height =
		media.width && media.height ? Math.round((variant.width * media.height) / media.width) : null;
	return { url: absolute(variant.url, siteUrl), alt: filled(alt) ?? media.alt, width: variant.width, height };
}

function ownImage(own: OwnSeo, siteUrl: string): ResolvedImage | null {
	const image = own.image;
	if (!image) return null;
	if (typeof image === 'string') {
		return filled(image)
			? { url: absolute(image, siteUrl), alt: filled(own.imageAlt) ?? '', width: null, height: null }
			: null;
	}
	return previewImage(image, siteUrl, own.imageAlt);
}

/**
 * Was auf der Seite gilt, je Angabe einzeln: Angabe der Seite im CRM → eigene Angabe der Seite (`<Seo>`) →
 * Vorgabe für alle Seiten im CRM → Name der Website (nur beim Titel).
 */
export function resolveSeo(
	data: Pick<SiteData, 'seo' | 'site'>,
	route: string | null,
	path: string | null,
	own: OwnSeo,
): ResolvedSeo {
	const siteUrl = data.site.url;
	const page = route !== null ? data.seo.pages[route] : undefined;
	const defaults = data.seo.defaults;
	const crmImage = (media: MediaRef | null | undefined) => (media ? previewImage(media, siteUrl) : null);
	return {
		title: filled(page?.title) ?? filled(own.title) ?? filled(defaults.title) ?? filled(data.site.name) ?? '',
		description: filled(page?.description) ?? filled(own.description) ?? filled(defaults.description),
		image: crmImage(page?.image) ?? ownImage(own, siteUrl) ?? crmImage(defaults.image),
		url: siteUrl && path ? `${siteUrl}${path}` : null,
	};
}

/** MIME-Typ eines Favicons aus dem Code, nach der Endung. */
export function iconType(href: string): string | undefined {
	const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(href)?.[1]?.toLowerCase();
	return ext === 'svg'
		? 'image/svg+xml'
		: ext === 'png'
			? 'image/png'
			: ext === 'ico'
				? 'image/x-icon'
				: undefined;
}

/** Favicon-Links aus dem CRM: 32 px im Tab, 180 px für iOS. 192 und 512 stehen im Web-Manifest. */
export function faviconLinks(favicon: SeoFavicon): { icon: string | null; apple: string | null } {
	const bySize = (size: number) => favicon.icons.find((i) => i.size === size)?.url ?? null;
	return { icon: bySize(32) ?? favicon.icons[0]?.url ?? null, apple: bySize(180) };
}

/** Inhalt von `/manifest.webmanifest`, oder `null`, wenn im CRM kein Favicon eingetragen ist. */
export function webManifest(seo: SeoConfig, siteName: string): string | null {
	if (!seo.favicon) return null;
	const icons = seo.favicon.icons
		.filter((i) => i.size >= 192)
		.map((i) => ({ src: i.url, sizes: `${i.size}x${i.size}`, type: i.type }));
	if (icons.length === 0) return null;
	return `${JSON.stringify({ name: siteName || 'Website', icons }, null, '\t')}\n`;
}
