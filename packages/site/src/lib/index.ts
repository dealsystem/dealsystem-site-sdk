// Öffentliche Schnittstelle von @dealsystem/site: Komponenten und was eine
// Seite im Browser braucht. Lade-Helfer für den Build: `@dealsystem/site/content`.
// Konfiguration: `@dealsystem/site/config`. Vite-Plugin: `@dealsystem/site/vite`.

export { default as CollectionList, type CollectionListProps } from './components/CollectionList.svelte';
export { default as ConsentGate, type ConsentGateProps } from './components/ConsentGate.svelte';
export { default as CookieBanner, type CookieBannerProps } from './components/CookieBanner.svelte';
export { default as Datenschutz, type DatenschutzProps } from './components/Datenschutz.svelte';
export { default as Impressum, type ImpressumProps } from './components/Impressum.svelte';
export { default as Link, type LinkProps } from './components/Link.svelte';
export { default as LeadForm, type LeadFormProps } from './components/LeadForm.svelte';
export { default as MediaImage, type MediaImageProps } from './components/MediaImage.svelte';
export { default as MediaVideo, type MediaVideoProps } from './components/MediaVideo.svelte';
export { default as RichText, type RichTextProps } from './components/RichText.svelte';
export { default as SiteFooterLegal, type SiteFooterLegalProps } from './components/SiteFooterLegal.svelte';
export { default as Text, type TextElement, type TextProps } from './components/Text.svelte';
export { default as Tracking } from './components/Tracking.svelte';

export { consent, type ConsentCategory } from './consent/consent.svelte.js';
export { loadCollection, loadEntry, type LoadedCollection } from './client/collections.js';
export type { SiteApiError, SiteApiErrorKind, SiteApiResult } from './client/siteApi.js';

export type {
	CollectionEntry,
	CollectionKey,
	ContentSlotLinkValue,
	EnhancedPicture,
	EntryData,
	EntryMedia,
	FunnelKey,
	MediaRef,
	MediaVariant,
	SafeHtml,
	SlotKey,
} from './types.js';

export { SDK_VERSION } from './version.js';
