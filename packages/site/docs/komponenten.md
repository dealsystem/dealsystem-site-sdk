<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# Bausteine von @dealsystem/site 0.1.0

Alle Bausteine kommen aus einem Import: `import { … } from '@dealsystem/site'`.
Pflichtangaben sind im Typ ohne `?` notiert; fehlt eine, meldet `npm run check` einen Fehler.

## Text

Ein kurzer Text (Überschrift, Satz, Beschriftung), den der Kunde im CRM ändern
kann.
Angezeigt wird der Text aus dem CRM, sonst `default`.

`key` und `default` müssen feste Zeichenketten sein (keine Variablen): der
Build liest sie aus dem Quelltext und meldet sie ans CRM.

`key` hat zwei bis fünf Teile mit Punkten. Der erste Teil, meist die Seite,
besteht nur aus Kleinbuchstaben und Ziffern, ohne Bindestrich: für die Seite
`/ueber-uns` also `ueberuns.team.titel`, nicht `ueber-uns.team.titel`. Die
weiteren Teile dürfen Bindestriche haben (`start.ueber-uns`). Das gilt für alle
Schlüssel von `<Text>`, `<RichText>`, `<Link>` und `<MediaImage>`.

```svelte
<Text key="start.hero.titel" default="Wir kaufen Ihr Haus" as="h1" label="Überschrift" group="Startseite" />
```

Mehrere Zeilen: `multiline` und den Text in geschweiften Klammern, dann ist
`\n` ein Zeilenumbruch. In `default="…"` wäre `\n` kein Umbruch, sondern
stünde wörtlich auf der Seite (`dealsystem check` warnt, CNT-003).

```svelte
<Text key="kontakt.zeiten" multiline default={'Mo bis Fr 9 bis 18 Uhr\nSa nach Vereinbarung'} />
```

Eigenschaften:

```ts
/** HTML-Elemente, die `<Text>` ausgeben kann. */
export type TextElement =
  | 'span'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'strong'
  | 'em'
  | 'small'
  | 'div'
  | 'li'
  | 'blockquote'
  | 'figcaption'
  | 'dt'
  | 'dd';

export interface TextProps {
  /** Eindeutiger Schlüssel, z. B. `start.hero.titel`: Teile mit Punkten, der erste ohne Bindestrich (`ueberuns.team.titel`). */
  key: string;
  /** Text, solange im CRM nichts anderes eingetragen ist. */
  default: string;
  /** HTML-Element. Standard `span`. Je Seite genau eine `h1`. */
  as?: TextElement;
  /** Mehrzeiliger Text: Zeilenumbrüche bleiben erhalten. */
  multiline?: boolean;
  /** Beschriftung im CRM, z. B. „Überschrift“. */
  label?: string;
  /** Gruppe im CRM, z. B. „Startseite“. */
  group?: string;
  /** Hinweis für den Kunden im CRM. */
  help?: string;
  /** Höchstlänge im CRM. */
  maxLength?: number;
  /** Der Kunde darf den Text im CRM nicht leeren. */
  required?: boolean;
  /** Frühere Schlüssel dieses Textes, damit Änderungen des Kunden beim Umbenennen bleiben. */
  aliases?: readonly string[];
  class?: string;
  id?: string;
}
```

## RichText

Formatierter Text: Absätze, Überschriften, Listen, Links. Das ist die einzige
Stelle, an der HTML aus dem CRM ausgegeben wird. `{@html}` schreibt die Seite nie.

Als Text, den der Kunde im CRM ändern kann (`key` und `default` als feste
Zeichenketten):

```svelte
<RichText key="start.ueber-uns" default="Wir sind **seit 2010** in Leipzig tätig." />
```

Liste oder mehrere Absätze: den Text in geschweifte Klammern, dann ist `\n`
ein Zeilenumbruch und `\n\n` ein neuer Absatz. In `default="…"` stünde `\n`
wörtlich auf der Seite (`dealsystem check` warnt, CNT-003).

```svelte
<RichText
	key="ankauf.ablauf"
	default={'1. Sie schicken uns die Eckdaten.\n2. Wir prüfen und melden uns.\n3. Sie erhalten ein Angebot.\n\nDer Ablauf ist für Sie kostenlos.'}
/>
```

Für ein Richtext-Feld eines CMS-Eintrags:

```svelte
<RichText content={angebot.data.beschreibung} />
```

Eigenschaften:

```ts
export type RichTextProps = { class?: string } & (
  | {
      /** Eindeutiger Schlüssel, z. B. `start.ueber-uns`. */
      key: string;
      /** Markdown, solange im CRM nichts anderes eingetragen ist. */
      default: string;
      /** Beschriftung im CRM. */
      label?: string;
      /** Gruppe im CRM. */
      group?: string;
      /** Hinweis für den Kunden im CRM. */
      help?: string;
      /** Der Kunde darf den Text im CRM nicht leeren. */
      required?: boolean;
      /** Frühere Schlüssel dieses Textes. */
      aliases?: readonly string[];
      content?: undefined;
    }
  | {
      /** Richtext-Feld eines Eintrags aus `getCollection()`, `getEntry()` oder `loadCollection()`. */
      content: SafeHtml | null | undefined;
      key?: undefined;
    }
);
```

## Link

Ein Link, dessen Ziel und Beschriftung der Kunde im CRM ändern kann. Gedacht
z. B. für die wichtigste Schaltfläche der Startseite; für gewöhnliche Links
reicht `<a href>`.

`key` und `default` müssen fest im Quelltext stehen (keine Variablen).

```svelte
<Link key="start.hero.knopf" default={{ href: '/kontakt', label: 'Kontakt aufnehmen' }} label="Schaltfläche" group="Startseite" />
```

Eigenschaften:

```ts
export interface LinkProps {
  /** Eindeutiger Schlüssel, z. B. `start.hero.knopf`. */
  key: string;
  /** Ziel und Beschriftung, solange im CRM nichts anderes eingetragen ist. */
  default: ContentSlotLinkValue;
  /** Beschriftung im CRM. */
  label?: string;
  /** Gruppe im CRM. */
  group?: string;
  /** Hinweis für den Kunden im CRM. */
  help?: string;
  /** Frühere Schlüssel dieses Links. */
  aliases?: readonly string[];
  class?: string;
}
```

## MediaImage

Ein Bild, immer mit Alternativtext. `<img>` wird auf der Seite nie direkt
geschrieben, immer `<MediaImage>`.
`alt` beschreibt, was auf dem Bild zu sehen ist. Nur bei reinem Schmuck:
`alt="" decorative`.

Lokales Bild (`width` und `height` sind die echten Maße der Datei):

```svelte
<script lang="ts">
	import { MediaImage } from '@dealsystem/site';
	import heroBild from '$lib/bilder/hero.jpg';
</script>

<MediaImage src={heroBild} alt="Sanierter Altbau in Leipzig" width={1600} height={1067} sizes="100vw" priority />
```

Bild aus dem CMS (der Alternativtext kommt aus dem CMS):

```svelte
<MediaImage media={angebot.media.bilder[0]} sizes="(min-width: 800px) 50vw, 100vw" />
```

Bild, das der Kunde selbst austauschen kann (Porträt, Team, Titelbild): mit
`key` und `default`. Nach dem Hochladen tauscht er es im CRM unter Eigene
Website → Inhalte. `key`, `label`, `group` und `help` müssen feste
Zeichenketten in Anführungszeichen sein; mit einer Variablen scheitern Build
und `dealsystem check` (QUA-006). `default` ist das Bild aus dem Projekt:
ein Import (wie unten) oder ein Pfad unter `static/` (`default="/bilder/haus.jpg"`).
Dann zeigt das CRM es als Vorschau; bei `?enhanced` oder einer Variablen nicht.

```svelte
<script lang="ts">
	import { MediaImage } from '@dealsystem/site';
	import portrait from '$lib/bilder/inhaber.jpg';
</script>

<MediaImage
	key="team.inhaber.foto"
	default={portrait}
	width={1200}
	height={1500}
	alt="Porträt des Inhabers vor dem Büro"
	label="Foto des Inhabers"
	group="Über uns"
	help="Hochformat, am besten mit Gesicht in der Mitte."
	sizes="(min-width: 60rem) 33vw, 100vw"
/>
```

Eigenschaften:

```ts
/** Ein leerer Alternativtext ist nur zusammen mit `decorative` erlaubt. */
type DescribingAlt<A extends string> = A extends ''
  ? 'Fehler: alt darf nicht leer sein. Beschreibe das Bild, oder setze alt="" zusammen mit decorative.'
  : A;

type AltProps<A extends string> =
  | {
      /** Beschreibt das Bild für Menschen, die es nicht sehen. */
      alt: DescribingAlt<A>;
      decorative?: false;
    }
  | {
      alt: '';
      /** Reiner Schmuck: Vorleseprogramme überspringen das Bild. */
      decorative: true;
    };

interface CommonProps {
  /** Anzeigebreite für die Auswahl der Bildgröße, z. B. `(min-width: 800px) 50vw, 100vw`. Standard `100vw`. */
  sizes?: string;
  /** Für das wichtigste Bild im sichtbaren Bereich: wird sofort geladen. */
  priority?: boolean;
  class?: string;
}

export type MediaImageProps<A extends string = string> = CommonProps &
  (
    | ({
        /** Lokales Bild: Import mit `?enhanced` oder Pfad aus `static/`. */
        src: EnhancedPicture | string;
        /** Breite in Pixeln. Nur nötig, wenn `src` ein Pfad ist. */
        width?: number;
        /** Höhe in Pixeln. Nur nötig, wenn `src` ein Pfad ist. */
        height?: number;
        key?: undefined;
        media?: undefined;
      } & AltProps<A>)
    | ({
        /** Schlüssel des Bild-Slots, z. B. `start.hero.bild`. */
        key: string;
        /** Bild, solange im CRM kein anderes gewählt ist. */
        default: EnhancedPicture | string;
        width?: number;
        height?: number;
        /** Beschriftung im CRM. */
        label?: string;
        /** Gruppe im CRM. */
        group?: string;
        /** Hinweis für den Kunden im CRM. */
        help?: string;
        /** Frühere Schlüssel dieses Bildes. */
        aliases?: readonly string[];
        src?: undefined;
        media?: undefined;
      } & AltProps<A>)
    | {
        /** Bild aus einem CMS-Eintrag. Fehlt es, wird nichts ausgegeben. */
        media: MediaRef | null | undefined;
        /** Ersetzt den Alternativtext aus dem CMS. */
        alt?: string;
        decorative?: boolean;
        src?: undefined;
        key?: undefined;
      }
  );
```

## MediaVideo

Ein Video aus dem CMS, mit Bedienelementen und ohne automatischen Start.
`title` benennt das Video für Vorleseprogramme. Kommt das Video von einem
anderen Anbieter, wird es erst nach der Einwilligung „Externe Inhalte“ geladen.

```svelte
<MediaVideo media={angebot.media.video[0]} title="Rundgang durch die Wohnung" />
```

Eigenschaften:

```ts
export interface MediaVideoProps {
  /** Video aus einem CMS-Eintrag. Fehlt es, wird nichts ausgegeben. */
  media: MediaRef | null | undefined;
  /** Kurzer Name des Videos, z. B. „Rundgang“. */
  title: string;
  class?: string;
}
```

## LeadForm

Ein Formular aus `dealsystem.config.ts`. Die Felder, Beschriftungen,
Fehlermeldungen, der Spam-Schutz und der Versand an das CRM sind eingebaut.
Schreibe kein eigenes `<form>` und kein eigenes `fetch`.

```svelte
<LeadForm funnel="kontakt" submitLabel="Anfrage senden" successMessage="Danke, wir melden uns." />
```

Neue Felder trägst du in `dealsystem.config.ts` unter `funnels.<schlüssel>.fields` ein.
Farben und Rundungen steuerst du mit CSS-Variablen, z. B. `--ds-color-primary`.

Eigenschaften:

```ts
export interface LeadFormProps {
  /** Schlüssel des Formulars aus `dealsystem.config.ts`, z. B. `kontakt`. */
  funnel: FunnelKey;
  /** Text der Schaltfläche. Standard „Absenden“. */
  submitLabel?: string;
  /** Text nach erfolgreichem Versand. */
  successMessage?: string;
  /** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
  privacyHref?: string;
  /** Eigene Anzeige nach erfolgreichem Versand, statt `successMessage`. */
  success?: Snippet;
  /** Wird nach erfolgreichem Versand aufgerufen, z. B. für eine Weiterleitung. */
  onsuccess?: () => void;
  class?: string;
}

type AutoFill =
  'given-name' | 'family-name' | 'email' | 'tel' | 'address-line1' | 'postal-code' | 'address-level2';
```

## CollectionList

Liste der Einträge einer Sammlung. Das Snippet `item` bestimmt, wie ein
Eintrag aussieht.

Empfohlen: Einträge beim Build laden und übergeben. Dann stehen sie im
fertigen HTML und Suchmaschinen sehen sie.

```svelte
<script lang="ts">
	import { CollectionList, MediaImage } from '@dealsystem/site';
	let { data } = $props(); // aus +page.server.ts: { angebote: await getCollection('angebote') }
</script>

<CollectionList collection="angebote" entries={data.angebote} limit={12}>
	{#snippet item(angebot)}
		<a href="/angebote/{angebot.slug}">
			<MediaImage media={angebot.media.bilder[0]} sizes="33vw" />
			{angebot.data.titel}
		</a>
	{/snippet}
</CollectionList>
```

Ohne `entries` lädt die Liste die Einträge erst im Browser über die Site-API:
ohne `limit` die neuesten 20, mit `limit` bis zu 100.

Eigenschaften:

```ts
export interface CollectionListProps<K extends CollectionKey> {
  /** Schlüssel der Sammlung aus `dealsystem.config.ts`. */
  collection: K;
  /** Einträge aus `getCollection()`. Ohne Angabe wird im Browser geladen. */
  entries?: CollectionEntry<K>[];
  /** Höchstzahl der angezeigten Einträge. */
  limit?: number;
  /** Darstellung eines Eintrags. */
  item: Snippet<[CollectionEntry<K>]>;
  /** Anzeige, wenn es keine Einträge gibt. */
  empty?: Snippet;
  class?: string;
}
```

## MapEmbed

Eine Karte von OpenStreetMap mit einer Markierung, z. B. für die Anfahrt. Das
ist die eine freigegebene Karte: Andere Kartendienste lassen sich auf der Seite
nicht einbetten. Die Karte lädt erst, wenn der Besucher zustimmt; vorher steht
dort ein Hinweis mit der Schaltfläche „Karte anzeigen“. Der Link „Karte in
OpenStreetMap öffnen“ funktioniert immer.

`lat` und `lon` sind die Koordinaten des Ortes als Dezimalzahlen. Kennst du sie
nicht, frag den Kunden danach oder verlinke stattdessen die Adresse; rate sie nie.

```svelte
<MapEmbed lat={53.8676} lon={10.6866} title="Unser Büro in der Lübecker Altstadt" />
```

Eigenschaften:

```ts
export interface MapEmbedProps {
  /** Breitengrad des Ortes, z. B. `53.8676`. */
  lat: number;
  /** Längengrad des Ortes, z. B. `10.6866`. */
  lon: number;
  /** Was die Karte zeigt, z. B. „Unser Büro in der Lübecker Altstadt“. Für Vorleseprogramme. */
  title: string;
  /** Zoomstufe von 3 (Kontinent) bis 18 (Hausnummer). Standard 16. */
  zoom?: number;
  class?: string;
}
```

## CookieBanner

Hinweis zur Einwilligung. Gehört einmal in `src/routes/+layout.svelte`.
Er erscheint nur, wenn die Seite etwas nutzt, das eine Einwilligung braucht:
Tracking mit Kennung aus dem CRM, `<ConsentGate>`, `<MapEmbed>` oder ein Video
eines anderen Anbieters. Sonst bleibt er unsichtbar, und es wird nichts gespeichert.
„Alle ablehnen“ und „Alle akzeptieren“ sind gleich gestaltet. Die Wahl wird im
Browser gespeichert; ändern lässt sie sich über „Cookie-Einstellungen“ in
`<SiteFooterLegal />`.

```svelte
<CookieBanner />
```

Gefragt wird nach den Zwecken, die die Seite gerade braucht. Fest vorgeben lassen sie sich so:

```svelte
<CookieBanner categories={['marketing']} />
```

Eigenschaften:

```ts
export interface CookieBannerProps {
  /** Zwecke, nach denen gefragt wird. Standard: die, die Bausteine auf der Seite brauchen. */
  categories?: readonly ConsentCategory[];
  /** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
  privacyHref?: string;
}
```

## ConsentGate

Zeigt seinen Inhalt erst, wenn der Besucher dem Zweck zugestimmt hat. Vorher
wird der Inhalt gar nicht erzeugt, auch nicht beim Build.

Wichtig: `<ConsentGate>` allein macht einen fremden Dienst nicht erlaubt. Die
Sicherheitsregeln der Seite (CSP in `svelte.config.js`) lassen nur wenige
Anbieter zu; alles andere blockiert der Browser auch nach der Zustimmung, und
`npx dealsystem check` meldet es (`SEC-008`). Freigegeben sind:

- Tracking über `<Tracking />` (Google Tag, Meta Pixel)
- die Karte über `<MapEmbed />` (OpenStreetMap; fragt selbst nach der Zustimmung)

Jeden anderen fremden Inhalt (Google Maps, YouTube, Bewertungs-Widgets) ersetzt
du durch einen gewöhnlichen Link zum Anbieter und sagst dem Kunden, dass sich
dieser Dienst hier nicht einbetten lässt.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```

Eigener Inhalt, der erst nach der Zustimmung erscheinen soll, mit Ersatz davor:

```svelte
<ConsentGate category="media">
	<iframe title="Anfahrt" src="https://www.openstreetmap.org/export/embed.html?bbox=…"></iframe>
	{#snippet fallback({ accept })}
		<p>Die Karte kommt von OpenStreetMap. Beim Laden werden Daten dorthin übertragen.</p>
		<button type="button" onclick={accept}>Karte anzeigen</button>
	{/snippet}
</ConsentGate>
```

Eigenschaften:

```ts
export interface ConsentGateProps {
  /** Zweck: `statistics`, `marketing` oder `media`. */
  category: ConsentCategory;
  /** Inhalt, der erst nach der Einwilligung entsteht. */
  children: Snippet;
  /** Ersatz ohne Einwilligung. `accept` stimmt genau diesem Zweck zu. */
  fallback?: Snippet<[{ accept: () => void }]>;
}
```

## Tracking

Bindet Meta Pixel und Google Tag ein. Die IDs stehen im CRM unter
Eigene Website → Einstellungen, nie im Code. Geladen wird erst nach der Einwilligung
„Marketing“. Eigene Pixel-Snippets sind nicht erlaubt.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```


## Impressum

Das Impressum der Seite. Gibt den Text aus, den der Kunde im CRM unter
Eigene Website → Rechtliches eingetragen hat. Der Text steht nie im Code, und die
Komponente erzeugt keinen eigenen. Gehört auf `src/routes/impressum/+page.svelte`.

Fehlt der Text noch, zeigt die Vorschau einen Hinweis, wo er einzutragen ist.
Live schalten lässt sich die Seite erst mit Text.

```svelte
<svelte:head>
	<title>Impressum</title>
	<meta name="description" content="Impressum und Anbieterkennzeichnung." />
</svelte:head>

<Impressum />
```

Eigenschaften:

```ts
export interface ImpressumProps {
  /** Ebene der Überschrift „Impressum“. Standard 1 (die `h1` der Seite). */
  headingLevel?: 1 | 2;
  class?: string;
}
```

## Datenschutz

Die Datenschutzerklärung der Seite. Gibt den Text aus, den der Kunde im CRM
unter Eigene Website → Rechtliches eingetragen hat. Der Text steht nie im Code, und
die Komponente erzeugt keinen eigenen. Gehört auf
`src/routes/datenschutz/+page.svelte`.

Fehlt der Text noch, zeigt die Vorschau einen Hinweis, wo er einzutragen ist.
Live schalten lässt sich die Seite erst mit Text.

```svelte
<svelte:head>
	<title>Datenschutz</title>
	<meta name="description" content="Datenschutzerklärung dieser Website." />
</svelte:head>

<Datenschutz />
```

Eigenschaften:

```ts
export interface DatenschutzProps {
  /** Ebene der Überschrift „Datenschutzerklärung“. Standard 1 (die `h1` der Seite). */
  headingLevel?: 1 | 2;
  class?: string;
}
```

## SiteFooterLegal

Die Pflicht-Links jeder Seite: Impressum, Datenschutz und „Cookie-Einstellungen“
(Widerruf der Einwilligung). Gehört in den Footer von `src/routes/+layout.svelte`.
„Cookie-Einstellungen“ erscheint nur, wenn es etwas einzustellen gibt (wie beim
`<CookieBanner />`).

```svelte
<footer>
	<SiteFooterLegal />
</footer>
```

Eigenschaften:

```ts
export interface SiteFooterLegalProps {
  /** Adresse des Impressums. Standard `/impressum`. */
  impressumHref?: string;
  /** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
  datenschutzHref?: string;
  class?: string;
}
```

## Seo

Titel, Beschreibung und Vorschaubild einer Seite: `<title>`, `meta description`,
die Angaben für WhatsApp, Facebook und LinkedIn (`og:*`) und `twitter:card`.
Gehört einmal auf jede Seite, statt `<title>` und `meta description` selbst in
`<svelte:head>` zu schreiben. Sonst stünden die Tags doppelt da, und der Kunde
könnte sie im CRM nicht ändern.

Was gilt, wird je Angabe entschieden: was der Kunde im CRM unter Eigene Website
→ Einstellungen → Google und Teilen für diese Seite eingetragen hat, sonst
`title`/`description`/`image` von hier, sonst seine Vorgabe für alle Seiten,
beim Titel zuletzt der Name der Website. Alles wird als Text ausgegeben, nie als
HTML.

```svelte
<script lang="ts">
	import { Seo } from '@dealsystem/site';
	let { data } = $props();
</script>

<Seo
	title="Kontakt – {data.site.name}"
	description="Schreiben Sie uns. Wir melden uns schnell bei Ihnen zurück."
/>
```

Auf einer Detailseite mit Bild aus dem CMS:

```svelte
<Seo title={angebot.data.titel} description={angebot.data.kurztext} image={angebot.media.bilder[0]} />
```

Eigenschaften:

```ts
export interface SeoProps {
  /** Titel dieser Seite (Tab, Google), solange im CRM keiner eingetragen ist. Je Seite ein eigener. */
  title?: string | null;
  /** Beschreibung für Google und Vorschauen, ein bis zwei Sätze. */
  description?: string | null;
  /** Vorschaubild beim Teilen: Bild aus dem CMS oder Pfad bzw. Import eines Bildes im Projekt. */
  image?: MediaRef | string | null;
  /** Was auf dem Vorschaubild zu sehen ist (nur nötig, wenn `image` ein Pfad ist). */
  imageAlt?: string | null;
}
```

## SiteHead

Angaben im Kopf jeder Seite, die für die ganze Website gelten. Gehört einmal in
`src/routes/+layout.svelte`.

- Favicon: Hat der Kunde im CRM unter Eigene Website → Einstellungen → Google und
  Teilen eins hochgeladen, gelten dessen Größen (32 px im Tab, 180 px für iOS,
  192 und 512 px im Web-Manifest). Sonst das Favicon aus dem Code, das du mit
  `favicon` angibst. Schreib den Favicon-Link nicht zusätzlich in `src/app.html`.
- „Nicht bei Google anzeigen“: Hat der Kunde das eingestellt, steht auf jeder
  Seite `<meta name="robots" content="noindex">`.

- Inhaltsblock: Die Texte und Bilder aus dem CRM (Content-Slots) stehen einmal
  je Seite als `<script type="application/json" id="ds-content">` im Kopf. Der
  Browser liest sie dort, nicht aus dem JS-Bundle. So kann DealSystem einen
  geänderten Text in die fertige Seite schreiben, ohne sie neu zu bauen.

Titel und Beschreibung je Seite setzt `<Seo>`.

```svelte
<SiteHead favicon="/favicon.svg" />
```

Eigenschaften:

```ts
export interface SiteHeadProps {
  /** Favicon aus dem Projekt (Pfad unter `static/`), solange im CRM keins hochgeladen ist. */
  favicon?: string;
}
```

## consent

### consent

Zustand der Einwilligung. Reaktiv: in Markup und `$derived` verwendbar.
Vor der Entscheidung des Besuchers ist nichts erlaubt.

- `consent.has(zweck)` – hat der Besucher diesem Zweck zugestimmt?
- `consent.openSettings()` – den Hinweis erneut öffnen (Widerruf)
- `consent.grant(zweck)` – einem Zweck zustimmen, z. B. über „Karte anzeigen“
- `consent.acceptAll()`, `consent.rejectAll()`, `consent.save([zwecke])`
- `consent.decided` – hat der Besucher schon gewählt?

```ts
<script>
	import { consent } from '@dealsystem/site';
</script>

<button type="button" onclick={() => consent.openSettings()}>Cookie-Einstellungen</button>
{#if consent.has('media')}<p>Karte wird angezeigt.</p>{/if}
```

### ConsentCategory

Zwecke, für die eine Einwilligung nötig ist:
`statistics` (Reichweitenmessung), `marketing` (Werbe-Pixel, Kampagnen),
`media` (eingebettete Inhalte Dritter wie Karten oder Videos).

```ts
type ConsentCategory = 'statistics' | 'marketing' | 'media';
```

## Inhalte im Browser nachladen

### loadCollection()

Lädt Einträge einer Sammlung **im Browser** über die Site-API, z. B. für
„Mehr laden“. Wirft nie: das Ergebnis ist `{ ok: true, data }` oder
`{ ok: false, error }`. Ohne `limit` kommen 20 Einträge, höchstens 100 je
Abruf; `total` nennt die Gesamtzahl, weitere holt `offset`. Inhalte, die Suchmaschinen sehen sollen, lädt
stattdessen `getCollection()` aus `@dealsystem/site/content` beim Build.

```ts
const result = await loadCollection('angebote', { limit: 12, offset: 12 });
if (result.ok) angebote.push(...result.data.entries);
else meldung = result.error.message;
```

```ts
async function loadCollection<K extends CollectionKey>(
	key: K,
	query: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' } = {},
): Promise<SiteApiResult<LoadedCollection<K>>>;
```

### loadEntry()

Lädt einen Eintrag **im Browser** über die Site-API. Wirft nie; ein
unbekannter Slug ergibt `{ ok: false, error: { kind: 'not_found' } }`.

```ts
const result = await loadEntry('angebote', 'altbau-leipzig');
if (result.ok) angebot = result.data;
```

```ts
async function loadEntry<K extends CollectionKey>(
	key: K,
	slug: string,
): Promise<SiteApiResult<CollectionEntry<K>>>;
```
