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
	embed: 'Embed',
	externalScript: 'ExternalScript',
	cookieBanner: 'CookieBanner',
	consentGate: 'ConsentGate',
	tracking: 'Tracking',
	impressum: 'Impressum',
	datenschutz: 'Datenschutz',
	siteFooterLegal: 'SiteFooterLegal',
	seo: 'Seo',
	siteHead: 'SiteHead',
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
	/** `<Embed>`: Schlüssel; dazu `data-ds-src` mit der Adresse des Rahmens (lädt nichts). */
	embed: 'data-ds-embed',
	/** `<ExternalScript>`: Schlüssel; dazu `data-ds-src` mit der Adresse des Skripts (lädt nichts). */
	externalScript: 'data-ds-external-script',
	src: 'data-ds-src',
} as const;

/** Build-Helfer aus `@dealsystem/site/content`; laufen nur in `+page.server.ts`/`+layout.server.ts` mit `prerender = true`. */
export const CONTENT_MODULE = '@dealsystem/site/content';
export const CONFIG_MODULE = '@dealsystem/site/config';
export const VITE_MODULE = '@dealsystem/site/vite';
/** `dealsystemCsp()` aus diesem Modul erzeugt `kit.csp` aus `external` in dealsystem.config.ts (Regelsatz 3). */
export const CSP_MODULE = '@dealsystem/site/csp';
export const DEALSYSTEM_CSP_FN = 'dealsystemCsp';
/** Helfer aus `@dealsystem/site/config`, der in `connect-src` die Adresse der Site-API einsetzt. */
export const SITE_API_ORIGIN_FN = 'siteApiOrigin';

/** AGENTS.md-Block: Marker und Quelle im installierten SDK. */
export const AGENTS_BLOCK_BEGIN = /<!--\s*dealsystem:begin\s+([^\s]+)\s*-->/;
export const AGENTS_BLOCK_END = '<!-- dealsystem:end -->';
export const AGENTS_BLOCK_SOURCE = 'node_modules/@dealsystem/site/docs/agents-block.md';
/** Skills und Cursor-Regel des Starters im installierten SDK (`project/agentFiles.ts`). */
export const AGENT_FILES_SOURCE = 'node_modules/@dealsystem/site/agent-files';
