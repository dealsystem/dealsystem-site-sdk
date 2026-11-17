// Wie `check` die Komponenten von `@dealsystem/site` erkennt. Muss zu packages/site passen
// (Abstimmung mit P1-12). Im Quellcode zählt der Komponentenname, in der Ausgabe ein Marker-Attribut.

export const SDK_PACKAGE = '@dealsystem/site';

export const COMPONENT = {
	leadForm: 'LeadForm',
	text: 'Text',
	richText: 'RichText',
	link: 'Link',
	mediaImage: 'MediaImage',
	mediaVideo: 'MediaVideo',
	collectionList: 'CollectionList',
	map: 'MapEmbed',
	cookieBanner: 'CookieBanner',
	consentGate: 'ConsentGate',
	tracking: 'Tracking',
	impressum: 'Impressum',
	datenschutz: 'Datenschutz',
	siteFooterLegal: 'SiteFooterLegal',
} as const;

/** Marker im gerenderten HTML (Attribute ohne Wert), gesetzt von den SDK-Komponenten. `ConsentGate` rendert
 * beim Build nichts; der Cookie-Hinweis selbst entsteht erst im Browser, im HTML steht nur sein Marker. */
export const MARKER = {
	impressum: 'data-ds-impressum',
	datenschutz: 'data-ds-datenschutz',
	cookieBanner: 'data-ds-cookie-banner',
	footerLegal: 'data-ds-footer-legal',
	leadForm: 'data-ds-lead-form',
	video: 'data-ds-video',
	richText: 'data-ds-richtext',
	image: 'data-ds-image',
	collection: 'data-ds-collection',
	map: 'data-ds-map',
	slot: 'data-ds-slot',
} as const;

/** Build-Helfer aus `@dealsystem/site/content`; laufen nur in `+page.server.ts`/`+layout.server.ts` mit `prerender = true`. */
export const CONTENT_MODULE = '@dealsystem/site/content';
export const CONFIG_MODULE = '@dealsystem/site/config';
export const VITE_MODULE = '@dealsystem/site/vite';

/** AGENTS.md-Block: Marker und Quelle im installierten SDK. */
export const AGENTS_BLOCK_BEGIN = /<!--\s*dealsystem:begin\s+([^\s]+)\s*-->/;
export const AGENTS_BLOCK_END = '<!-- dealsystem:end -->';
export const AGENTS_BLOCK_SOURCE = 'node_modules/@dealsystem/site/docs/agents-block.md';
