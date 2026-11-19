<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# Bausteine von @dealsystem/site 0.2.6

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
<Text key="start.hero.titel" default="Ihr Meisterbetrieb für Bad und Heizung" as="h1" label="Überschrift" group="Startseite" />
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
	key="leistungen.ablauf"
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
	import heroBild from '$lib/assets/bilder/hero.jpg';
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
	import portrait from '$lib/assets/bilder/inhaber.jpg';
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
  /**
   * Text nach erfolgreichem Versand. Standard „Vielen Dank. Ihre Anfrage ist bei uns angekommen.“; verspricht
   * das Formular eine Datei (`leadmagnet`), kündigt der Standard sie per E-Mail an.
   */
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

## LeadHoneypot

Bot-Falle für ein Formular mit `createLeadClient()`: ein Feld, das Menschen nicht
sehen und nicht erreichen. Füllt ein Programm es aus, nimmt DealSystem die
Anfrage still nicht an. Gehört einmal in die eigene Oberfläche, am besten in
das `<form>`. `<LeadForm>` bringt es schon mit.

```svelte
<LeadHoneypot client={lead} />
```

Eigenschaften:

```ts
export interface LeadHoneypotProps {
  /** Der Client aus `createLeadClient()`. */
  client: Pick<LeadClient, 'setHoneypot'>;
}
```

## Booker

Terminbuchung auf der Seite: Tag wählen, Uhrzeit wählen, Angaben, Bestätigung. Die freien Zeiten,
Buchungsfragen, der Spam-Schutz und die Buchung im CRM sind eingebaut. Kein iframe, kein eigenes `fetch`.

```svelte
<Booker booking="erstgespraech" />
```

Den Schlüssel trägst du in `dealsystem.config.ts` unter `booking` ein. Die Terminart (Dauer, Arbeitszeiten,
Fragen, Reihenfolge) richtet der Kunde im CRM unter Kalender → Buchungsseiten ein; erfinde keine. Steht sie auf „erst Angaben,
dann Termin“ (`contact_first`), fragt der Baustein zuerst Kontaktdaten und Fragen ab und zeigt danach die freien
Zeiten; sonst umgekehrt. Zeiten erscheinen in der Zeitzone des
Besuchers, die des Kalenders steht als Hinweis dabei. Farben und Rundungen wie bei `<LeadForm>` über
CSS-Variablen, z. B. `--ds-color-primary`.

Eigenschaften:

```ts
export interface BookerProps {
  /** Schlüssel aus `booking` in `dealsystem.config.ts`, z. B. `erstgespraech`. */
  booking: BookingKey;
  /** So viele Tage zeigt der erste Abruf, Standard 14 (höchstens 31). „Weitere Termine“ lädt nach. */
  days?: number;
  /** Ebene der Schritt-Überschriften, Standard 2. */
  headingLevel?: 2 | 3 | 4;
  /** Text der Schaltfläche. Standard „Termin buchen“. */
  submitLabel?: string;
  /** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
  privacyHref?: string;
  /**
   * Beschriftungen der Adressfelder, wenn der Termin beim Gast stattfindet (Ort-Art mit Adresse). Standard
   * „Straße und Hausnummer“, „PLZ“, „Ort“.
   */
  addressLabels?: { street?: string; postalCode?: string; city?: string };
  /**
   * Eigene Bezeichnung je Ort-Art statt der aus dem CRM, z. B. `{ attendee_address: 'Bei dir vor Ort' }`, wenn die
   * Seite ihre Besucher duzt.
   */
  locationLabels?: Partial<Record<BookingLocationType, string>>;
  /** Eigene Anzeige nach der Buchung; bekommt Datum und Uhrzeit als Text. */
  success?: Snippet<[{ when: string; dryRun: boolean }]>;
  /** Wird nach der Buchung aufgerufen. */
  onbooked?: (booked: { start: string; end: string | null; dryRun: boolean }) => void;
  class?: string;
}
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

Eine Karte von OpenStreetMap mit einer Markierung, z. B. für die Anfahrt. Sie
braucht keinen Eintrag unter `external`. Google Maps geht über `<Embed>` mit
der Vorlage `google-maps`. Die Karte lädt erst, wenn der Besucher zustimmt; vorher steht
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

## Embed

Bettet einen fremden Dienst ein: YouTube, Vimeo, Google Maps, Calendly oder
einen anderen Anbieter. Vor der Einwilligung steht dort ein Platzhalter mit
Titel, Anbieter und „Video laden“; erst danach lädt der Rahmen. Der Link zum
Anbieter funktioniert immer.

`id` ist ein Schlüssel aus `external` in `dealsystem.config.ts`. Die Adresse
darfst du so kopieren, wie der Kunde sie schickt, z. B.
`https://www.youtube.com/watch?v=…`; das SDK macht daraus die Einbettung
(YouTube ohne Cookies, Vimeo mit `dnt=1`). Vorschaubilder von YouTube lädt der
Platzhalter nicht; für ein Bild davor nimm `poster` mit einem Bild aus
`static/`. Anleitung: `extern.md`.

```svelte
<Embed id="video" src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Rundgang durch das Haus" />
```

```ts
// dealsystem.config.ts
external: { video: { preset: 'youtube' } },
```

Eigenschaften:

```ts
export interface EmbedProps {
  /** Schlüssel aus `external` in `dealsystem.config.ts`, z. B. `video`. */
  id: ExternalKey;
  /** Adresse beim Anbieter, z. B. `https://www.youtube.com/watch?v=…` oder `https://vimeo.com/123456789`. */
  src: string;
  /** Was zu sehen ist, z. B. „Rundgang durch das Haus“. Für Vorleseprogramme und den Platzhalter. */
  title: string;
  /** Seitenverhältnis, z. B. `16 / 9` (Video) oder `4 / 3`. Standard aus der Vorlage. */
  aspect?: string;
  /** Feste Höhe statt Seitenverhältnis, z. B. `700px` (Terminbuchung). */
  height?: string;
  /** Bild im Platzhalter, ein Pfad der eigenen Seite (`/bilder/vorschau.jpg`). Nie ein Bild des Anbieters. */
  poster?: string;
  class?: string;
}
```

## ExternalScript

Lädt ein fremdes Skript (Chat, Tag-Manager, Widget) erst, wenn der Besucher der
Kategorie aus der Deklaration zugestimmt hat. Je Seite höchstens einmal; nach
einem Widerruf lädt die Seite neu, damit das Skript weg ist. Zeigt selbst nichts.

`id` ist ein Schlüssel aus `external` in `dealsystem.config.ts`; `src` muss zu
einem Host unter `script` passen oder ein Pfad der eigenen Seite sein
(`/scripts/gtm.js` aus `static/`). Inline-Code gibt es nicht: Ein Snippet des
Anbieters legst du als Datei unter `static/scripts/` ab. Anleitung: `extern.md`.

```svelte
<ExternalScript id="chat" src="https://js.hs-scripts.com/1234567.js" attrs={{ id: 'hs-script-loader', defer: true }} />
```

```ts
// dealsystem.config.ts
external: {
	chat: {
		category: 'marketing',
		provider: 'HubSpot, Inc., USA',
		purpose: 'Live-Chat mit dem Vertrieb',
		privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
		script: ['https://js.hs-scripts.com'],
		connect: ['https://*.hubspot.com'],
	},
},
```

Eigenschaften:

```ts
export interface ExternalScriptProps {
  /** Schlüssel aus `external` in `dealsystem.config.ts`, z. B. `chat`. */
  id: ExternalKey;
  /** Adresse des Skripts beim Anbieter oder Pfad der eigenen Seite (`/scripts/gtm.js`). */
  src: string;
  /** `async`, `defer`, `id`, `type`, `crossorigin`, `referrerpolicy` und `data-*`. Ohne Angabe: `async`. */
  attrs?: ExternalScriptAttrs;
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

Für fremde Dienste brauchst du `<ConsentGate>` meist nicht: Videos, Karten und
Terminbuchung bindest du mit `<Embed>` ein, fremde Skripte mit
`<ExternalScript>`, Tracking mit `<Tracking />`. Diese Bausteine fragen selbst
nach der Einwilligung. Jeder fremde Host muss unter `external` in
`dealsystem.config.ts` stehen, sonst blockiert ihn der Browser
(`npx dealsystem check` meldet es, `SEC-008`). Anleitung: `extern.md`.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```

Eigener Inhalt, der erst nach der Zustimmung erscheinen soll, mit Ersatz davor:

```svelte
<ConsentGate category="media">
	<Embed id="video" src="https://www.youtube.com/watch?v=…" title="Rundgang" />
	{#snippet fallback({ accept })}
		<p>Hier steht nach Ihrer Zustimmung ein Video von YouTube.</p>
		<button type="button" onclick={accept}>Video anzeigen</button>
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

Außerdem meldet `<SiteHead>` jeden Seitenaufruf für die Statistik im CRM: Pfad,
Einstieg und Kampagne. Die Besuchs-ID geht nur mit Einwilligung „Marketing“ mit.

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

## Zeitfenster

Zeigt seinen Inhalt nur in einem Zeitraum, z. B. eine Anmeldung bis zum Beginn
eines Webinars. `ab` gehört dazu, `bis` nicht mehr. Eine Grenze reicht.

Zeitpunkte immer mit Zeitzone: `+01:00` im Winter, `+02:00` im Sommer (deutsche
Zeit), oder `Z` für UTC. Ohne Zeitzone bricht der Build ab (`QUA-009`).

```svelte
<Zeitfenster bis="2026-12-01T18:00:00+01:00">
	<Text key="start.webinar.anmeldung" default="Jetzt anmelden: Webinar am 1. Dezember" />
</Zeitfenster>
<Zeitfenster ab="2026-12-01T18:00:00+01:00" bis="2026-12-01T19:30:00+01:00">
	<Text key="start.webinar.live" default="Das Webinar läuft gerade" />
</Zeitfenster>
```

So wirkt es: Beim Bauen entscheidet die Uhrzeit des Builds, was im HTML steht.
Im Browser schaltet der Baustein sofort um, wenn eine Grenze erreicht ist.
DealSystem baut die Seite zu jeder Grenze neu, damit auch das HTML (Google,
Vorschauen) nach wenigen Minuten stimmt. Dafür müssen `ab` und `bis` feste
Zeichenketten sein, keine Variablen.

Eigenschaften:

```ts
export interface ZeitfensterProps {
  /** Ab diesem Zeitpunkt sichtbar, mit Zeitzone, z. B. `2026-12-01T18:00:00+01:00`. */
  ab?: string;
  /** Bis zu diesem Zeitpunkt sichtbar (ausschließlich), mit Zeitzone. */
  bis?: string;
  /** Inhalt im Zeitraum. */
  children: Snippet;
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

## Eigene Formular-Oberfläche

Für mehrstufige Funnels, Rechner und Quiz. Vorlage: Skill `funnel-mehrstufig`.

### createLeadClient()

Formular ohne `<LeadForm>`: für eigene Oberflächen wie mehrstufige Funnels. Nimmt den Schlüssel aus
`dealsystem.config.ts`. Kein eigenes `fetch` an DealSystem, das ist verboten (`SEC-004`).

Zeig bei jedem Fehler außer `validation` den Ausweichkontakt `res.fallback` (`QUA-008`) und
setz `<LeadHoneypot client={lead} />` in die Oberfläche (Bot-Falle). Nach Erfolg passt `lead.successMessage`;
verspricht das Formular eine Datei (`leadmagnet`), kündigt dieser Text sie an.

```ts
<script lang="ts">
	import { createLeadClient, LeadHoneypot } from '@dealsystem/site';
	import { onMount } from 'svelte';

	const lead = createLeadClient('bewertung');
	onMount(() => () => lead.destroy());
	let email = $state('');
	let result = $state<Awaited<ReturnType<typeof lead.submit>> | null>(null);

	// Eigenes <form>: Enter sendet, der Browser prüft `required`. Ohne `action`, Absenden nur hier (SEC-007).
	async function senden(event: SubmitEvent) {
		event.preventDefault();
		result = await lead.submit({ email });
	}
</script>

<form onsubmit={senden}>
	<label for="email">E-Mail</label>
	<input id="email" type="email" autocomplete="email" required bind:value={email} onfocus={() => lead.prepare()} />
	<LeadHoneypot client={lead} />
	<button type="submit">Senden</button>
</form>
{#if result && !result.ok}
	<p role="alert">{result.message}</p>
	{#if result.fallback?.phone}<a href="tel:{result.fallback.phone}">{result.fallback.phone}</a>{/if}
{/if}
```

```ts
function createLeadClient<K extends FunnelKey>(
	funnel: K,
	options: LeadClientOptions = {},
): LeadClient<K>;
```

### LeadResult

Ergebnis von `submit()`.

```ts
type LeadResult =
	| {
			ok: true;
			/** `true` in der Vorschau: geprüft, aber nicht gespeichert. Zeig dann einen Hinweis. */
			dryRun: boolean;
			submissionId: string;
	  }
	| {
			ok: false;
			reason: 'validation';
			/** Text für Besucher, auf Deutsch. */
			message: string;
			/** Je abgelehntem Feld ein Text, z. B. `{ email: 'Bitte geben Sie …' }`. */
			fields: Record<string, string>;
			fallback: null;
			/** @internal Fehler der Site-API, wenn der Server abgelehnt hat. */
			error: SiteApiError | null;
	  }
	| {
			ok: false;
			reason: Exclude<LeadFailureReason, 'validation'>;
			message: string;
			fields: Record<string, never>;
			/** Telefon und E-Mail aus dem CRM. Zeig sie, damit der Besucher trotzdem anfragen kann. */
			fallback: LeadFallback;
			retryAfterSeconds: number | null;
			/** @internal */
			error: SiteApiError;
	  };
```

### LeadFailureReason

Warum eine Einsendung nicht angekommen ist.

```ts
type LeadFailureReason =
	/** Angaben fehlen oder passen nicht: `fields` nennt je Feld den Text, `message` den für das ganze Formular. */
	| 'validation'
	/** Die Sicherheitsprüfung (Captcha) ließ sich nicht durchführen. */
	| 'captcha'
	/** Zu viele Anfragen;
```

### LeadFallback

Ausweichkontakt aus den Firmendaten im CRM. Leere Angaben sind `null`. Zeig ihn bei jedem Fehler außer `validation`.

```ts
interface LeadFallback {
	phone: string | null;
	email: string | null;
}
```
### createFunnelState()

Hilfe für mehrstufige Formulare mit `createLeadClient()`: Schritte, Prüfung je Schritt, Fortschritt. Die
Oberfläche baust du selbst; setze beim Schrittwechsel den Fokus auf die Überschrift des neuen Schritts.

```ts
const lead = createLeadClient('bewertung');
const funnel = createFunnelState(lead, [
	{ id: 'objekt', title: 'Um welche Immobilie geht es?', fields: ['objektart', 'wohnflaeche'] },
	{ id: 'kontakt', title: 'Wohin dürfen wir die Einschätzung schicken?', fields: ['firstName', 'email'] },
]);
// <input bind:value={funnel.values.wohnflaeche} />, <button onclick={() => funnel.next()}>Weiter</button>
```

```ts
function createFunnelState<K extends string>(
	client: LeadClient<K>,
	steps: readonly FunnelStep[],
): FunnelState<K>;
```

### FunnelStep

Ein Schritt: eine Überschrift und die Felder, die auf ihm stehen.

```ts
interface FunnelStep {
	/** Eindeutig, z. B. `objekt`. */
	id: string;
	/** Überschrift des Schritts, z. B. „Um welche Immobilie geht es?“. */
	title: string;
	/** Namen der Felder aus `dealsystem.config.ts`, die auf diesem Schritt stehen. Leer = ein Schritt ohne Felder. */
	fields: readonly string[];
}
```

## Eigene Terminbuchung

Ohne `<Booker>`, mit eigener Oberfläche. Ablauf und Regeln: `termine.md`.

### createBookingClient()

Terminbuchung ohne `<Booker>`: für eine eigene Oberfläche. Nimmt den Schlüssel aus `booking` in
`dealsystem.config.ts`. Die Terminart (Dauer, Arbeitszeiten, Fragen) richtet der Kunde im CRM ein; erfinde
keine. Kein eigenes `fetch` an DealSystem (`SEC-004`).

Zeiten kommen und gehen in UTC. Zeig sie in der Zeitzone des Besuchers (`groupSlotsByDay`, `visitorTimeZone`)
und nenne die des Kalenders (`timezone`) als Hinweis. Zeig bei jedem Fehler außer `validation` den
Ausweichkontakt `fallback`; bei `slot_taken` die Zeiten neu laden. Setz `<LeadHoneypot client={termin} />` in
die Oberfläche.

```ts
<script lang="ts">
	import { createBookingClient, groupSlotsByDay, visitorTimeZone, LeadHoneypot } from '@dealsystem/site';
	import { onMount } from 'svelte';

	const termin = createBookingClient('erstgespraech');
	const zone = visitorTimeZone();
	let tage = $state<ReturnType<typeof groupSlotsByDay>>([]);
	let start = $state('');
	let vorname = $state('');
	let email = $state('');
	let ergebnis = $state<Awaited<ReturnType<typeof termin.book>> | null>(null);

	onMount(() => {
		termin.slots().then((r) => (tage = r.ok ? groupSlotsByDay(r.slots, zone) : []));
		return () => termin.destroy();
	});

	async function buchen(event: SubmitEvent) {
		event.preventDefault();
		ergebnis = await termin.book({ start, firstName: vorname, email });
	}
</script>

{#each tage as tag (tag.date)}
	<h3>{tag.long}</h3>
	{#each tag.slots as zeit (zeit.start)}
		<button type="button" aria-pressed={start === zeit.start} onclick={() => ((start = zeit.start), termin.prepare())}>
			{zeit.time}
		</button>
	{/each}
{/each}
<form onsubmit={buchen}>
	<label for="vorname">Vorname</label>
	<input id="vorname" required bind:value={vorname} />
	<label for="email">E-Mail</label>
	<input id="email" type="email" required bind:value={email} />
	<LeadHoneypot client={termin} />
	<button type="submit" disabled={!start}>Termin buchen</button>
</form>
{#if ergebnis && !ergebnis.ok}<p role="alert">{ergebnis.message}</p>{/if}
```

```ts
function createBookingClient<K extends BookingKey>(
	booking: K,
	options: BookingClientOptions = {},
): BookingClient<K>;
```

### BookingInput

Was gebucht werden soll.

```ts
interface BookingInput {
	/** Beginn genau wie `start` aus `slots()` (UTC). */
	start: string;
	firstName: string;
	lastName?: string;
	email: string;
	phone?: string;
	/** Antworten auf die Buchungsfragen (`info.questions[].key`). */
	answers?: Record<string, string | number | boolean | readonly string[] | undefined>;
	/** Gewählte Ort-Art aus `info.locations`; ohne Angabe die erste. */
	locationType?: BookingLocationType;
	/**
	 * Adresse des Gasts. Pflicht, wenn die gewählte Ort-Art `attendeeInput: 'address'` hat (z. B. „Bei Ihnen vor
	 * Ort“, siehe `needsAttendeeAddress`); sonst wird sie nicht mitgeschickt.
	 */
	attendeeAddress?: BookingAttendeeAddress;
}
```

### BookingResult

Ergebnis von `book()`.

```ts
type BookingResult =
	| {
			ok: true;
			/** `true` in der Vorschau: geprüft, nichts gebucht, keine Mail. Zeig dann einen Hinweis. */
			dryRun: boolean;
			/** `true`, wenn derselbe Vorgang schon gebucht war (doppelt abgeschickt). Für Besucher: gebucht. */
			duplicate: boolean;
			/** Beginn und Ende in UTC. */
			start: string;
			end: string | null;
			submissionId: string;
	  }
	| {
			ok: false;
			reason: 'validation';
			message: string;
			/** Je abgelehntem Feld ein Text: `firstName`, `lastName`, `email`, `phone` oder `answers.<key>`. */
			fields: Record<string, string>;
			fallback: null;
			/** @internal */
			error: SiteApiError | null;
	  }
	| BookingFailure;
```

### BookingFailureReason

Warum etwas nicht geklappt hat.

```ts
type BookingFailureReason =
	/** Angaben fehlen oder passen nicht: `fields` nennt je Feld den Text. */
	| 'validation'
	/** Die Zeit ist inzwischen vergeben: freie Zeiten neu laden und eine andere wählen lassen. */
	| 'slot_taken'
	/** Die Angaben passen nicht zu dieser Terminart (Regel im CRM). Ausweichkontakt zeigen. */
	| 'not_qualified'
	/** Die Sicherheitsprüfung (Captcha) ließ sich nicht durchführen. */
	| 'captcha'
	/** Zu viele Anfragen;
```
### groupSlotsByDay()

Freie Termine nach Kalendertag in der Anzeige-Zeitzone, aufsteigend. Ein Termin um 23:30 UTC gehört in Berlin
zum nächsten Tag; ein Tag der Zeitumstellung hat einfach eine Stunde mehr oder weniger.

```ts
function groupSlotsByDay(
	slots: readonly BookingSlot[],
	timeZone: string,
	locale = 'de-DE',
): BookingDay[];
```

### visitorTimeZone()

IANA-Zeitzone des Besuchers, z. B. `Europe/Berlin`. Ohne Angabe des Browsers `Europe/Berlin`.

```ts
function visitorTimeZone(): string;
```

### timeZoneLabel()

Name einer Zeitzone für Besucher, z. B. `Mitteleuropäische Zeit (Berlin)`. Ohne Namen in `Intl` nur die Stadt.

```ts
function timeZoneLabel(timeZone: string, locale = 'de-DE', at: Date = new Date()): string;
```

### formatBookingTime()

Uhrzeit eines Zeitpunkts in einer Zeitzone, z. B. `09:30`.

```ts
function formatBookingTime(instant: Date | string, timeZone: string): string;
```

### formatBookingDate()

Datum eines Zeitpunkts in einer Zeitzone, z. B. `Dienstag, 1. Dezember 2026`.

```ts
function formatBookingDate(instant: Date | string, timeZone: string, locale = 'de-DE'): string;
```

## Kampagnen-Parameter

### getCampaignParam()

Wert eines eigenen URL-Parameters, z. B. `partner` aus `?partner=…`: aus dem aktuellen Besuch, sonst (nur mit
Einwilligung) aus dem zuletzt gespeicherten. `null`, wenn es ihn nicht gibt. Nur im Browser.

Nicht gelesen werden UTM-Parameter, Klick-IDs und Namen, die nach Zugangs- oder Personendaten aussehen
(`email`, `token`, `session` …); höchstens 20 Parameter, Werte bis 500 Zeichen. Mit der Anfrage gehen die
Parameter ohnehin an das CRM (`<LeadForm>`), dafür ist nichts zu tun.

```ts
<script lang="ts">
	import { getCampaignParam } from '@dealsystem/site';
	import { onMount } from 'svelte';
	let partner = $state<string | null>(null);
	onMount(() => (partner = getCampaignParam('partner')));
</script>
```

```ts
function getCampaignParam(name: string): string | null;
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
