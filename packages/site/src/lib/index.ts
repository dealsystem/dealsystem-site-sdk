// Öffentliche Schnittstelle von @dealsystem/site: Komponenten und was eine
// Seite im Browser braucht. Lade-Helfer für den Build: `@dealsystem/site/content`.
// Konfiguration: `@dealsystem/site/config`. Vite-Plugin: `@dealsystem/site/vite`.

export { default as Booker, type BookerProps } from './components/Booker.svelte';
export { default as CollectionList, type CollectionListProps } from './components/CollectionList.svelte';
export { default as ConsentGate, type ConsentGateProps } from './components/ConsentGate.svelte';
export { default as CookieBanner, type CookieBannerProps } from './components/CookieBanner.svelte';
export { default as Datenschutz, type DatenschutzProps } from './components/Datenschutz.svelte';
export { default as Embed, type EmbedProps } from './components/Embed.svelte';
export { default as ExternalScript, type ExternalScriptProps } from './components/ExternalScript.svelte';
export { default as Impressum, type ImpressumProps } from './components/Impressum.svelte';
export { default as Link, type LinkProps } from './components/Link.svelte';
export { default as LeadForm, type LeadFormProps } from './components/LeadForm.svelte';
export { default as LeadHoneypot, type LeadHoneypotProps } from './components/LeadHoneypot.svelte';
export { default as MapEmbed, type MapEmbedProps } from './components/MapEmbed.svelte';
export { default as MediaImage, type MediaImageProps } from './components/MediaImage.svelte';
export { default as MediaVideo, type MediaVideoProps } from './components/MediaVideo.svelte';
export { default as RichText, type RichTextProps } from './components/RichText.svelte';
export { default as Seo, type SeoProps } from './components/Seo.svelte';
export { default as SiteFooterLegal, type SiteFooterLegalProps } from './components/SiteFooterLegal.svelte';
export { default as SiteHead, type SiteHeadProps } from './components/SiteHead.svelte';
export { default as Text, type TextElement, type TextProps } from './components/Text.svelte';
export { default as Zeitfenster, type ZeitfensterProps } from './components/Zeitfenster.svelte';
export { default as Tracking } from './components/Tracking.svelte';

export { consent, setConsent, type ConsentCategory, type ConsentProvider } from './consent/consent.svelte.js';
export type { Anrede, CookieBannerTexts } from './consent/bannerTexts.js';
export type { FormTexts } from './texts/form.js';
export type { RequestTexts } from './texts/request.js';
export type { EmbedTexts, MapEmbedTexts, MediaVideoTexts } from './texts/embeds.js';
export type { CollectionListTexts } from './texts/list.js';
export type { ExternalScriptAttrs } from './client/externalScript.js';
export { loadCollection, loadEntry, type LoadedCollection } from './client/collections.js';
export { getCampaignParam } from './client/attribution.js';
export {
	createLeadClient,
	type LeadClient,
	type LeadClientStatus,
	type LeadFailureReason,
	type LeadFallback,
	type LeadResult,
} from './client/leadClient.svelte.js';
export {
	createBookingClient,
	type BookingClient,
	type BookingClientStatus,
	type BookingFailure,
	type BookingFailureReason,
	type BookingInfoResult,
	type BookingQualifyResult,
	type BookingInput,
	type BookingResult,
	type BookingSlotsResult,
} from './client/bookingClient.svelte.js';
export {
	formatBookingDate,
	formatBookingTime,
	groupSlotsByDay,
	timeZoneLabel,
	visitorTimeZone,
	type BookingDay,
	type BookingSlotView,
} from './client/bookingTime.js';
export { createFunnelState, type FunnelState, type FunnelStep } from './client/funnelState.svelte.js';
export type {
	BookingFlow,
	BookingQualification,
	BookingInfo,
	BookingLocationType,
	BookingQuestion,
	BookingSlot,
	SiteApiError,
	SiteApiErrorKind,
	SiteApiResult,
} from './client/siteApi.js';

export type {
	BookingKey,
	CollectionEntry,
	CollectionKey,
	ContentSlotLinkValue,
	EnhancedPicture,
	EntryData,
	EntryMedia,
	ExternalKey,
	FunnelKey,
	LeadValues,
	MediaRef,
	MediaVariant,
	SafeHtml,
	SlotKey,
} from './types.js';

export { SDK_VERSION } from './version.js';
