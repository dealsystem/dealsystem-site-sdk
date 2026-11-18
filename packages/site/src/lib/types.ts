// Öffentliche Typen von @dealsystem/site. Vertrag: Site-API v1 und der
// Inhalts-Schnappschuss des Core. Typen werden kopiert, nicht aus anderen
// DealSystem-Paketen importiert.

// ---------------------------------------------------------------- Formulare

/** Feldtypen eines Formulars. `hidden` sieht der Besucher nicht; das SDK füllt es beim Absenden (`from`). */
export type FieldType =
	'text' | 'email' | 'tel' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'hidden';

/** UTM-Angaben, aus denen ein verstecktes Feld seinen Wert holen kann. */
export type UtmKey = 'source' | 'medium' | 'campaign' | 'term' | 'content';

/**
 * Woher ein verstecktes Feld (`type: 'hidden'`) seinen Wert nimmt, genau eine Angabe:
 * - `{ query: 'partner' }` – URL-Parameter `?partner=…` (aktueller Besuch, gespeichert nur mit Einwilligung)
 * - `{ utm: 'campaign' }` – UTM-Angabe des Besuchs (`utm_campaign`)
 * - `{ value: 'Bewertungsrechner' }` – fester Text
 *
 * Höchstens 500 Zeichen. Im CRM lässt sich das Feld einem eigenen Feld zuordnen, nie einem Standardfeld.
 */
export type HiddenFieldSource = { query: string } | { utm: UtmKey } | { value: string };

/**
 * Kontakt-Standardfelder im CRM. Namen immer getrennt als `firstName` und
 * `lastName`. Jedes Formular braucht ein Feld mit `email` oder `phone`.
 */
export type StandardFieldKey =
	'firstName' | 'lastName' | 'email' | 'phone' | 'address1' | 'postalCode' | 'city';

/** Ein Feld eines Formulars in `dealsystem.config.ts`. */
export interface FunnelFieldDef {
	/** Technischer Name, z. B. `nachricht`. Nur Buchstaben, Ziffern, `_`. */
	name: string;
	type: FieldType;
	/** Sichtbare Beschriftung. Fehlt sie, wird der Name verwendet. */
	label?: string;
	required?: boolean;
	/** Auswahlwerte für `select` und `multiselect`. */
	options?: readonly string[];
	/** Ordnet das Feld einem Kontaktfeld im CRM zu. */
	standardField?: StandardFieldKey;
	placeholder?: string;
	/** Hilfetext unter dem Feld. */
	help?: string;
	maxLength?: number;
	/** Nur bei `type: 'hidden'`: woher der Wert kommt. */
	from?: HiddenFieldSource;
}

/**
 * Was mit einer Anfrage im CRM passiert, als Vorschlag aus dem Code. Der Kunde kann jede Angabe im CRM ändern;
 * ab dann gilt seine, auch nach dem nächsten Hochladen („Code legt vor, CRM entscheidet“). Namen (Pipeline,
 * Phase, Tags, Lead-Quelle) sucht das CRM im Workspace; was es dort nicht gibt, legt es nicht an, sondern meldet
 * es als Warnung beim Hochladen.
 */
export interface FunnelCrmConfig {
	/** Einen Deal anlegen. */
	createDeal?: boolean;
	/** Pipeline des Deals, Name oder ID, höchstens 100 Zeichen. */
	pipeline?: string;
	/** Phase in der Pipeline, Name oder ID, höchstens 100 Zeichen. */
	stage?: string;
	/**
	 * Name des Deals, höchstens 200 Zeichen. Platzhalter: `{{firstName}}`, `{{lastName}}`, `{{email}}`,
	 * `{{phone}}`, `{{adresse}}`.
	 */
	dealName?: string;
	/** Tags am Kontakt, höchstens 20, je höchstens 50 Zeichen. */
	tags?: readonly string[];
	/** Lead-Quelle, Name oder ID, höchstens 100 Zeichen. */
	leadSource?: string;
	/**
	 * Eingangsbestätigung an den Absender. Betreff höchstens 200, Text höchstens 5 000 Zeichen, nur Klartext,
	 * Platzhalter `{{firstName}}`, `{{lastName}}`, `{{formName}}`. Ohne Betreff oder Text gilt der Standard.
	 */
	confirmation?: { enabled: boolean; subject?: string; body?: string };
}

/** Ein Formular in `dealsystem.config.ts`. */
export interface FunnelDef {
	label: string;
	fields: readonly FunnelFieldDef[];
	/** Vorschlag, was im CRM mit der Anfrage passiert (Deal, Pipeline, Tags, Bestätigung). */
	crm?: FunnelCrmConfig;
}

// --------------------------------------------------------------- Sammlungen

/** Feldtypen eines CMS-Eintrags. */
export type CollectionFieldType =
	| 'text'
	| 'textarea'
	| 'richtext'
	| 'number'
	| 'url'
	| 'date'
	| 'checkbox'
	| 'select'
	| 'multiselect'
	| 'image'
	| 'gallery'
	| 'file';

/** Feldtypen, deren Werte unter `entry.media` statt `entry.data` stehen. */
export type MediaFieldType = 'image' | 'gallery' | 'file';

/** Ein Feld einer Sammlung in `dealsystem.config.ts`. */
export interface CollectionFieldDef {
	name: string;
	type: CollectionFieldType;
	label?: string;
	required?: boolean;
	options?: readonly string[];
	maxItems?: number;
}

/** Eine Sammlung in `dealsystem.config.ts`. */
export interface CollectionDef {
	/** Quelle der Einträge. Bisher nur das CMS. */
	source?: 'cms';
	label: string;
	/** Route eines Eintrags, z. B. `/angebote/:slug`. */
	route: string;
	/** Übersichtsseite, z. B. `/angebote`. */
	indexRoute?: string;
	/** Feld, aus dem das CMS den Slug vorschlägt. Standard: das erste Textfeld. */
	slugFrom?: string;
	fields: readonly CollectionFieldDef[];
}

// ------------------------------------------------------- Fremde Dienste

/**
 * Zweck, für den der Besucher einwilligen muss, bevor ein fremder Dienst lädt. „Notwendig“ gibt es für
 * eigene Deklarationen bewusst nicht: Fremdes lädt immer erst nach der Einwilligung.
 */
export type ExternalCategory = 'statistics' | 'marketing' | 'media';

/** Von DealSystem gepflegte, geprüfte Vorlagen für fremde Dienste. */
export type ExternalPreset = 'youtube' | 'vimeo' | 'google-maps' | 'calendly';

/** CSP-Direktiven, die eine Deklaration öffnen kann: `script` → `script-src` usw. */
export type ExternalDirective = 'script' | 'connect' | 'img' | 'frame' | 'media' | 'style' | 'font';

/** Ein fremder Dienst aus einer Vorlage, z. B. `{ preset: 'youtube' }`. Mehr Angaben braucht es nicht. */
export interface ExternalPresetDef {
	preset: ExternalPreset;
}

/**
 * Ein eigener fremder Dienst (Chat, Tag-Manager, Widget). Jede Host-Liste öffnet genau eine Direktive der
 * Content-Security-Policy. Hosts nur als `https://host.de`, ohne Pfad; `https://*.host.de` nur in
 * `connect`, `img`, `media`, `style` und `font`.
 */
export interface ExternalCustomDef {
	/** Wofür der Besucher einwilligt: `statistics`, `marketing` oder `media`. */
	category: ExternalCategory;
	/** Anbieter mit Sitz, z. B. `HubSpot, Inc., USA`. Steht im Cookie-Hinweis. */
	provider?: string;
	/** Zweck in einem Satz, z. B. `Live-Chat mit dem Vertrieb`. Steht im Cookie-Hinweis. */
	purpose?: string;
	/** Datenschutzerklärung des Anbieters (https). Steht im Cookie-Hinweis. */
	privacyUrl?: string;
	script?: readonly string[];
	connect?: readonly string[];
	img?: readonly string[];
	frame?: readonly string[];
	media?: readonly string[];
	style?: readonly string[];
	font?: readonly string[];
}

/** Ein fremder Dienst in `dealsystem.config.ts` unter `external`. */
export type ExternalDef = ExternalPresetDef | ExternalCustomDef;

/** Hosts je Direktive, immer alle Schlüssel, sortiert. */
export type ExternalHosts = Record<ExternalDirective, string[]>;

/** Ein fremder Dienst nach dem Auflösen der Vorlage: so steht er im Manifest und in den Seitendaten. */
export interface ResolvedExternal {
	id: string;
	preset: ExternalPreset | null;
	category: ExternalCategory;
	provider: string | null;
	purpose: string | null;
	privacyUrl: string | null;
	hosts: ExternalHosts;
}

/**
 * Eine Terminbuchung in `dealsystem.config.ts` (`booking`). Die Terminart selbst (Dauer, Arbeitszeiten, Fragen)
 * richtet der Kunde im CRM unter Termine ein, oder der Agent über die MCP-Werkzeuge; hier steht nur die Zuordnung.
 */
export interface BookingDef {
	/** Bezeichnung auf der Seite und im CRM, z. B. „Erstgespräch“. Ohne Angabe gilt der Name der Terminart. */
	label?: string;
	/**
	 * Kurzname (Slug) der Terminart im CRM, z. B. `erstgespraech`. Wird beim Hochladen zugeordnet, wenn genau eine
	 * aktive Terminart so heißt; sonst wählt der Kunde sie im CRM. Nie erfinden: nur einen Slug, den es gibt.
	 */
	eventType?: string;
}

/** Inhalt von `dealsystem.config.ts`. */
export interface SiteConfig {
	/** Kennung der Seite im CRM. `npx dealsystem init` trägt sie ein. */
	siteId: string;
	collections?: Readonly<Record<string, CollectionDef>>;
	funnels?: Readonly<Record<string, FunnelDef>>;
	/** Fremde Dienste (Videos, Chat, Skripte). Nur was hier steht, lässt die Seite zu. */
	external?: Readonly<Record<string, ExternalDef>>;
	/** Terminbuchungen für `<Booker>` und `createBookingClient`, je Schlüssel. */
	booking?: Readonly<Record<string, BookingDef>>;
}

// ------------------------------------------------- Typen aus der Konfiguration

declare global {
	/**
	 * Verbindet die Typen des SDK mit `dealsystem.config.ts`. Die Datei
	 * `src/dealsystem.d.ts` (vom Starter und von `dealsystem sync`) füllt sie:
	 *
	 * ```ts
	 * import type site from '../dealsystem.config';
	 * declare global {
	 * 	interface DealsystemSiteTypes {
	 * 		config: typeof site;
	 * 		slotKeys: 'start.hero.titel' | 'start.ueber-uns'; // optional
	 * 	}
	 * }
	 * export {};
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface DealsystemSiteTypes {}
}

type Registered = DealsystemSiteTypes extends { config: infer C } ? C : null;

/** Schlüssel der Formulare aus `dealsystem.config.ts`. Ohne Registrierung `string`. */
export type FunnelKey = Registered extends null
	? string
	: Registered extends { funnels: infer F }
		? keyof F & string
		: never;

/** Schlüssel der Terminbuchungen aus `dealsystem.config.ts` (`booking`). Ohne Registrierung `string`. */
export type BookingKey = Registered extends null
	? string
	: Registered extends { booking: infer B }
		? keyof B & string
		: never;

/** Schlüssel der fremden Dienste aus `dealsystem.config.ts` (`external`). Ohne Registrierung `string`. */
export type ExternalKey = Registered extends null
	? string
	: Registered extends { external: infer E }
		? keyof E & string
		: never;

/**
 * Schlüssel der Content-Slots, wenn `src/dealsystem.d.ts` sie unter `slotKeys`
 * einträgt. Sonst `string`. Die Komponenten nehmen jeden gültigen Schlüssel an:
 * ein neuer Slot entsteht an der Stelle, an der er verwendet wird.
 */
export type SlotKey = DealsystemSiteTypes extends { slotKeys: infer K extends string } ? K : string;

/** Schlüssel der Sammlungen aus `dealsystem.config.ts`. Ohne Registrierung `string`. */
export type CollectionKey = Registered extends null
	? string
	: Registered extends { collections: infer C }
		? keyof C & string
		: never;

type RegisteredFunnelFields<K extends string> = Registered extends {
	funnels: Record<K, { fields: infer F extends readonly FunnelFieldDef[] }>;
}
	? F[number]
	: never;

interface FunnelValueMap {
	text: string;
	email: string;
	tel: string;
	textarea: string;
	select: string;
	date: string;
	multiselect: readonly string[];
	checkbox: boolean;
}

/**
 * Werte für `createLeadClient(…).submit()`: je sichtbares Feld des Formulars sein Wert (versteckte Felder füllt
 * das SDK). Ohne Registrierung (`src/dealsystem.d.ts`) jeder Name.
 */
export type LeadValues<K extends string = string> = [RegisteredFunnelFields<K>] extends [never]
	? Record<string, string | boolean | readonly string[] | undefined>
	: {
			[
				F in RegisteredFunnelFields<K> as F['type'] extends 'hidden' ? never : F['name']
			]?: F['type'] extends keyof FunnelValueMap ? FunnelValueMap[F['type']] : never;
		};

type RegisteredFields<K extends string> = Registered extends {
	collections: Record<K, { fields: infer F extends readonly CollectionFieldDef[] }>;
}
	? F[number]
	: never;

declare const safeHtml: unique symbol;

/**
 * HTML, das der DealSystem-Server schon geprüft und bereinigt hat (Richtext
 * aus dem CMS). Eine gewöhnliche Zeichenkette ist kein `SafeHtml`. Ausgabe nur
 * über `<RichText content={…} />`, nie mit `{@html}`.
 */
export type SafeHtml = string & { readonly [safeHtml]: true };

interface FieldValueMap {
	text: string;
	textarea: string;
	richtext: SafeHtml;
	number: number;
	url: string;
	date: string;
	checkbox: boolean;
	select: string;
	multiselect: string[];
}

type DataValue<F extends CollectionFieldDef> = F['type'] extends keyof FieldValueMap
	? F extends { required: true }
		? FieldValueMap[F['type']]
		: FieldValueMap[F['type']] | null
	: never;

/** Werte eines Eintrags (alles außer Bildern und Dateien). */
export type EntryData<K extends string = string> = [RegisteredFields<K>] extends [never]
	? Record<string, unknown>
	: {
			[F in RegisteredFields<K> as F['type'] extends MediaFieldType ? never : F['name']]: DataValue<F>;
		};

/** Bilder, Galerien und Dateien eines Eintrags, je Feld eine Liste. */
export type EntryMedia<K extends string = string> = [RegisteredFields<K>] extends [never]
	? Record<string, MediaRef[]>
	: {
			[F in RegisteredFields<K> as F['type'] extends MediaFieldType ? F['name'] : never]: MediaRef[];
		};

/** Ein veröffentlichter Eintrag einer Sammlung. */
export interface CollectionEntry<K extends string = string> {
	slug: string;
	/** ISO-Zeitstempel der Veröffentlichung. */
	publishedAt: string;
	data: EntryData<K>;
	media: EntryMedia<K>;
}

// -------------------------------------------------------------------- Medien

/** Eine Bildgröße eines Mediums. */
export interface MediaVariant {
	url: string;
	width: number;
	format: 'jpeg' | 'webp' | 'avif';
}

/** Verweis auf ein Medium aus dem CRM. Form laut Site-API v1. */
export interface MediaRef {
	id: string;
	kind: 'image' | 'video' | 'file';
	/** Alternativtext aus dem CMS. Leer heißt: dekorativ. */
	alt: string;
	width: number | null;
	height: number | null;
	variants: MediaVariant[];
	video?: { provider: 'bunny'; playbackUrl: string; posterUrl: string };
	/** Nur bei `kind: 'file'`. */
	url?: string;
}

/**
 * Bild aus `@sveltejs/enhanced-img`:
 * `import hero from './hero.jpg?enhanced'`.
 */
export interface EnhancedPicture {
	sources: Record<string, string>;
	img: { src: string; w: number; h: number };
}

// --------------------------------------------------------------- Content-Slots

/** Typen der Content-Slots. */
export type ContentSlotType = 'text' | 'textarea' | 'richtext' | 'link' | 'image';

/** Wert eines `link`-Slots. */
export interface ContentSlotLinkValue {
	href: string;
	label: string;
	newTab?: boolean;
}

/** Ein Slot, wie ihn der Build im Manifest meldet. */
export interface ContentSlotDef {
	key: string;
	type: ContentSlotType;
	label?: string;
	group?: string;
	/** Route, auf der der Slot vorkommt. */
	route?: string;
	help?: string;
	maxLength?: number;
	required?: boolean;
	/** Frühere Schlüssel dieses Slots. Der Text des Kunden wandert mit. */
	aliases?: string[];
	/** Standardwert aus dem Code. `null`, wenn er sich nicht melden lässt (Bilder). */
	default: string | ContentSlotLinkValue | null;
	/**
	 * Nur Bild-Slots: wo das Standardbild aus dem Code in der fertigen Seite liegt, damit das CRM es zeigen
	 * kann. `null`, wenn sich das nicht sicher sagen lässt (eingebettetes Bild unter 4 KB, `?enhanced`,
	 * Variable, Bild aus einem Paket).
	 */
	defaultImage?: SlotDefaultImage | null;
}

/** Standardbild eines Bild-Slots im Build-Artefakt. */
export interface SlotDefaultImage {
	/** Pfad ab der Wurzel der Seite, z. B. `/_app/immutable/assets/inhaber.Cx7aB2.jpg` oder `/bilder/haus.jpg`. */
	path: string;
	/** Nur, wenn sie fest am Baustein stehen (`width={1200}`). */
	width?: number;
	height?: number;
}

/**
 * Überschreibung eines Slots aus dem CRM. `value` je Typ: Text (`text`,
 * `textarea`), bereinigtes HTML (`richtext`), `{ href, label, newTab? }`
 * (`link`), `MediaRef` (`image`).
 */
export interface SlotOverride {
	type: ContentSlotType;
	value: unknown;
}

// ------------------------------------------------------- Schnappschuss, Manifest

/** Firmendaten der Seite für Ausweichkontakt und strukturierte Daten. Leere Zeichenkette = fehlt. */
export interface ContactProfile {
	company: string;
	/** Optional. */
	address: string;
	email: string;
	/** Optional: nicht jeder Kunde veröffentlicht eine Telefonnummer. */
	phone: string;
}

/**
 * Firmendaten und Rechtstexte aus dem CRM. Die beiden Texte schreibt und
 * verantwortet der Kunde; sie kommen als bereinigtes HTML.
 */
export interface LegalProfile extends ContactProfile {
	/** Text der Seite `/impressum`. */
	imprintHtml: string;
	/** Text der Seite `/datenschutz`. */
	privacyHtml: string;
}

export interface TrackingConfig {
	metaPixelId: string | null;
	googleTagId: string | null;
}

/** Titel, Beschreibung und Vorschaubild aus „Google und Teilen“. `null` = nicht gesetzt. Klartext, nie HTML. */
export interface SeoMeta {
	title: string | null;
	description: string | null;
	image: MediaRef | null;
}

/** Favicon aus dem CRM: fertige PNGs (32, 180, 192, 512), Pfade der eigenen Seite. */
export interface SeoFavicon {
	id: string;
	icons: { url: string; size: number; type: 'image/png' }[];
}

/** „Google und Teilen“ aus dem CRM (`seo` im Schnappschuss). Fehlt der Block, ist alles leer. */
export interface SeoConfig {
	/** Suchmaschinen sollen die Seite nicht aufnehmen. */
	noindex: boolean;
	/** Gilt für Seiten ohne eigene Angabe. */
	defaults: SeoMeta;
	/** Je statische Route (`/kontakt`), nur Seiten mit mindestens einer Angabe. */
	pages: Record<string, SeoMeta>;
	/** `null`: Es gilt das Favicon aus dem Code. */
	favicon: SeoFavicon | null;
}

/** Angaben zur Seite. */
export interface SiteInfo {
	id: string;
	slug: string;
	name: string;
	primaryHost: string;
	locale: string;
}

/** Inhalts-Schnappschuss des Core (`snapshotVersion: 1`), nach dem Normalisieren. */
export interface ContentSnapshot {
	snapshotVersion: 1;
	site: SiteInfo;
	legal: LegalProfile;
	tracking: TrackingConfig;
	funnels: { key: string; active: boolean }[];
	slots: Record<string, SlotOverride>;
	collections: Record<string, { source: string; schemaHash: string; entries: RawCollectionEntry[] }>;
	seo: SeoConfig;
}

/** Eintrag, wie ihn Schnappschuss und Site-API liefern. */
export interface RawCollectionEntry {
	slug: string;
	publishedAt: string;
	data: Record<string, unknown>;
	media: Record<string, MediaRef[]>;
}

/** Was der Build über die Seite meldet (`.dealsystem/manifest.json`). */
export interface SiteManifest {
	manifestVersion: 1;
	sdkVersion: string;
	siteId: string;
	/** Routen aus `src/routes`, in SvelteKit-Schreibweise (`/angebote/[slug]`). */
	routes: string[];
	slots: ContentSlotDef[];
	collections: (CollectionDef & { key: string; source: 'cms' })[];
	funnels: (FunnelDef & { key: string })[];
	/**
	 * „Patchen statt Bauen“: Kann der Core neue Slot-Werte in die fertige Seite
	 * schreiben? `delivery: 'dom'` heißt: Die Texte stehen im Inhaltsblock je
	 * Seite, nicht im JS-Bundle. `blockers` nennt, was ein Patchen verhindert.
	 */
	contentPatch?: {
		/** Fassung des Inhaltsblocks (`contract/ds-content.v1.json`). Unbekannte Fassung: Der Core baut. */
		format: number;
		delivery: 'dom' | 'embedded';
		blockers: string[];
		/** Geprüftes Standard-HTML je Richtext-Slot (zum Zurücksetzen). */
		richtextDefaults: Record<string, string>;
	};
	/**
	 * Grenzen aller `<Zeitfenster>` mit festen Zeitpunkten, die nach dem Build liegen: UTC, ISO 8601 mit
	 * Millisekunden (`2026-12-01T17:00:00.000Z`), aufsteigend, ohne doppelte, höchstens 50. Der Core baut zu
	 * jeder Grenze neu (Grund `schedule`).
	 */
	schedule: string[];
	/** Fremde Dienste mit aufgelöster Vorlage, nach `id` sortiert. Ältere SDKs senden das Feld nicht. */
	external: ResolvedExternal[];
	/** Terminbuchungen aus `booking` (Core: `self_site_bookings`). Ältere SDKs senden das Feld nicht. */
	bookings: (BookingDef & { key: string })[];
}

// ------------------------------------------------------------------- Intern

/**
 * Daten, die das Vite-Plugin in die Seite einbettet. Nur Öffentliches.
 * @internal
 */
export interface SiteData {
	api: { baseUrl: string; siteKey: string };
	site: SiteInfo & { url: string };
	/** Firmendaten ohne die Rechtstexte: die liegen in eigenen Dateien. */
	legal: ContactProfile;
	tracking: TrackingConfig;
	funnels: Record<string, FunnelDef & { active: boolean }>;
	collections: Record<string, { route: string; fields: readonly CollectionFieldDef[] }>;
	slots: Record<string, SlotOverride>;
	/** Fertiges HTML je Richtext-Slot: Text aus dem CRM, sonst der Standardtext aus dem Code. */
	richtext: Record<string, string>;
	/** „Google und Teilen“ aus dem CRM. */
	seo: SeoConfig;
	/** Zeitpunkt des Builds (ms seit 1970, UTC). `<Zeitfenster>` entscheidet damit, was im HTML steht. 0 = unbekannt. */
	builtAt: number;
	/** Fremde Dienste aus `dealsystem.config.ts`, je Schlüssel. */
	external: Record<string, ResolvedExternal>;
	/** Terminbuchungen aus `dealsystem.config.ts`, je Schlüssel. */
	bookings: Record<string, BookingDef>;
}
