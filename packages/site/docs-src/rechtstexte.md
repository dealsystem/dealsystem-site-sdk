# Impressum, Datenschutz und Einwilligung

## Wer die Texte schreibt

Impressum und Datenschutzerklärung schreibt und verantwortet **der Kunde**. Er trägt sie im CRM unter
Eigene Website → Rechtliches ein. DealSystem liefert keine vorformulierten Rechtstexte, und du schreibst auch
keine: nicht als Vorschlag, nicht als Platzhalter, nicht im Code. Frag der Kunde danach, verweise ihn auf
seinen Anwalt oder einen Generator seiner Wahl; den fertigen Text fügt er im CRM ein.

Für den Teil „Hosting“ bietet das CRM an derselben Stelle einen sachlichen Baustein „Hosting durch
DealSystem“ an (wer die Seite ausliefert, wo, welche Zugriffsdaten dabei anfallen). Der Kunde kann ihn mit
einem Klick in seinen Datenschutztext übernehmen. Maßgeblich ist der Wortlaut im CRM.

Ebenso gibt es dort den Baustein „Wiedererkennung von Besuchen (DealSystem)“ in Sie- und Du-Form. Fehlt er im
Datenschutztext, zeigt das CRM einen Hinweis mit „Übernehmen“; veröffentlichen lässt sich die Seite trotzdem.
Sag dem Kunden, dass er ihn dort übernehmen kann. Du schreibst ihn nicht in den Code.

## Was die Seite braucht

- `src/routes/impressum/+page.svelte` mit `<Impressum />`
- `src/routes/datenschutz/+page.svelte` mit `<Datenschutz />`
- im Layout `<SiteFooterLegal />` (Links zu beiden Seiten und „Cookie-Einstellungen“) und `<CookieBanner />`

Der Starter enthält das alles. Entferne nichts davon (`PRV-004`, `PRV-005`).

`<Impressum />` und `<Datenschutz />` geben genau den Text aus dem CRM aus. Überschriften im Text des
Kunden ordnen sie von selbst unter die Überschrift der Seite ein.

## Wenn ein Text fehlt

Solange der Kunde einen Text nicht eingetragen hat, zeigt die Vorschau an seiner Stelle einen Hinweis, wo er
einzutragen ist. Veröffentlichen lässt sich die Seite dann nicht: `npx dealsystem publish` meldet, welche
Angaben fehlen. Pflicht sind Impressum, Datenschutzerklärung, Firmenname und E-Mail-Adresse. Die
Telefonnummer ist freiwillig.

Sag dem Kunden in einem Satz, was fehlt und wo er es einträgt. Nach dem Eintragen: `npx dealsystem sync`,
neu hochladen, die neue Vorschau zeigen und **erneut fragen**, ob die Seite veröffentlicht werden soll.
Jede neue Vorschau braucht ein neues ausdrückliches Ja; die frühere Zustimmung galt dem Stand ohne die
Texte.

## Firmendaten auf der Seite

Firmenname, Adresse, E-Mail und Telefon aus dem CRM liefert `getSite()` (siehe `inhalte.md`). Im Starter
stehen sie auf jeder Seite als `data.site` bereit:

```svelte
<script lang="ts">
	let { data } = $props();
</script>

{#if data.site.address}<p>{data.site.address}</p>{/if}
{#if data.site.phone}<p><a href="tel:{data.site.phone.replace(/[^+0-9]/g, '')}">{data.site.phone}</a></p>{/if}
{#if data.site.email}<p><a href="mailto:{data.site.email}">{data.site.email}</a></p>{/if}
```

Das Formular zeigt sie von selbst als Ausweichkontakt, wenn das Senden scheitert. Schreibe Adresse,
Telefonnummer und E-Mail-Adresse nie fest in den Code, auch wenn der Kunde sie dir im Gespräch nennt
(`CNT-002`): Ändert er sie im CRM, soll die Seite folgen. Bitte ihn stattdessen, sie im CRM unter
Eigene Website → Rechtliches einzutragen. Ein Feld, das dort leer ist, lässt du auf der Seite weg.

## Einwilligung

- Vor der Entscheidung des Besuchers lädt die Seite nichts von fremden Servern und speichert nur seine Wahl.
- „Alle ablehnen“ und „Alle akzeptieren“ sind gleich gestaltet. Ändere das nicht.
- Tracking: nur `<ConsentGate category="marketing"><Tracking /></ConsentGate>`. Keine eigenen Pixel-Snippets.
- Karte: `<MapEmbed lat={…} lon={…} title="…" />` (OpenStreetMap). Sie fragt selbst nach der Zustimmung.
- Andere fremde Dienste (YouTube, Vimeo, Google Maps, Widgets, Chat) stehen unter `external` in
  `dealsystem.config.ts` und kommen über `<Embed>` oder `<ExternalScript>` auf die Seite (`extern.md`). Der
  Hinweis nennt sie je Zweck mit Anbieter und Datenschutz-Link. Der Kunde muss sie in seiner
  Datenschutzerklärung aufführen; sag ihm das, den Text schreibst du nicht.
- Der Hinweis erscheint auf **jeder** Seite: `<SiteHead>` meldet Seitenaufrufe an DealSystem, und mit Zustimmung
  zu „Marketing“ erkennt DealSystem wiederkehrende Besuche und ordnet sie einer Anfrage zu. „Cookie-Einstellungen“
  steht deshalb immer im Fußbereich. Dazu fragt er nach den Zwecken, die die Seite sonst braucht: Tracking-Kennungen
  im CRM, Dienste unter `external`, `<ConsentGate>`, `<MapEmbed>`, Videos anderer Anbieter.
- Fest vorgeben lassen sich die Zwecke mit `<CookieBanner categories={['marketing']} />`.
- Duzt die Seite ihre Besucher, schreib `<CookieBanner anrede="du" />`; sonst siezt der Hinweis. Einzelne Texte
  ersetzt `texts={{ title: '…' }}`. Ablehnen bleibt dabei so deutlich wie Akzeptieren.
- **Eigenes Banner** (Cookiebot, Usercentrics …) nur, wenn der Kunde es ausdrücklich will. Dann in
  `dealsystem.config.ts` `consent: { banner: 'own' }`. Das SDK zeigt keinen eigenen Hinweis und keine
  „Cookie-Einstellungen“ mehr; das eigene Banner muss den Widerruf anbieten. Bis es meldet, gilt nichts als
  erlaubt. Es meldet die Wahl bei jedem Laden und bei jeder Änderung mit `setConsent()`, z. B. Cookiebot:

  ```ts
  import { setConsent } from '@dealsystem/site';

  window.addEventListener('CookiebotOnConsentReady', () => {
  	const c = window.Cookiebot.consent;
  	setConsent({ statistics: c.statistics, marketing: c.marketing, media: c.marketing });
  });
  ```

  Usercentrics: im Admin einen Dienst „DealSystem“ und ein Fenster-Ereignis („Window Event“, z. B. `ucEvent`)
  anlegen; dann
  `window.addEventListener('ucEvent', (e) => { if (e.detail?.event === 'consent_status') setConsent({ marketing: e.detail.DealSystem === true }); })`.
  Beides sind Beispiele; maßgeblich ist die Doku des Anbieters. Welche Kategorie des fremden Banners zu welchem
  Zweck gehört, legt der Kunde fest; frag ihn.

- **Kampagnen und Seitenaufrufe erfasst das SDK selbst** (`<SiteHead>`, `<LeadForm>`). Bau nichts davon nach:
  kein eigenes Auslesen von `utm_*`, `gclid` oder `fbclid`, kein eigener Speicher, keine eigenen Pixel-Ereignisse.
  - Ohne Einwilligung: nur der aktuelle Besuch (UTM, fremder Referrer, Einstiegsseite, eigene URL-Parameter), nur
    im Arbeitsspeicher. Er geht mit der Anfrage ins CRM. Seitenaufrufe zählt das CRM anonym.
  - Mit Einwilligung „Marketing“ zusätzlich im Browser (`localStorage` `ds-attr`): erster und letzter Besuch,
    Klick-IDs (`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `_fbp`, 90 Tage) und eine Besuchs-ID (13 Monate).
    Ein Widerruf löscht das wieder.
  - Nach einer angenommenen Anfrage meldet das SDK `Lead` an das Meta Pixel und `generate_lead` an Google, mit
    derselben Ereignis-ID wie die serverseitige Meldung des CRM (`lead-<submissionId>`); so zählt sie einmal.
  - Eigene URL-Parameter (z. B. `?partner=…`) liest `getCampaignParam('partner')` (`komponenten.md`).
- Das Formular schützt eine Rechenaufgabe im Hintergrund (ALTCHA) vor Missbrauch. Sie kommt von
  DealSystem selbst, setzt kein Cookie und braucht keine Einwilligung.
