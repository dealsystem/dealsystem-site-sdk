// Öffentliche Typen von @dealsystem/site. Vertrag: Site-API v1 und der
// Inhalts-Schnappschuss des Core. Typen werden kopiert, nicht aus anderen
// DealSystem-Paketen importiert.

// ---------------------------------------------------------------- Formulare

/** Feldtypen eines Formulars. */
export type FieldType =
	'text' | 'email' | 'tel' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date';

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
}

/** Ein Formular in `dealsystem.config.ts`. */
export interface FunnelDef {
	label: string;
	fields: readonly FunnelFieldDef[];
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

/** Inhalt von `dealsystem.config.ts`. */
export interface SiteConfig {
	/** Kennung der Seite im CRM. `npx dealsystem init` trägt sie ein. */
	siteId: string;
	collections?: Readonly<Record<string, CollectionDef>>;
	funnels?: Readonly<Record<string, FunnelDef>>;
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
}
