# Impressum, Datenschutz und Einwilligung

## Wer die Texte schreibt

Impressum und Datenschutzerklärung schreibt und verantwortet **der Kunde**. Er trägt sie im CRM unter
Website → Einstellungen ein. DealSystem liefert keine vorformulierten Rechtstexte, und du schreibst auch
keine: nicht als Vorschlag, nicht als Platzhalter, nicht im Code. Frag der Kunde danach, verweise ihn auf
seinen Anwalt oder einen Generator seiner Wahl; den fertigen Text fügt er im CRM ein.

Für den Teil „Hosting“ bietet das CRM an derselben Stelle einen sachlichen Baustein „Hosting durch
DealSystem“ an (wer die Seite ausliefert, wo, welche Zugriffsdaten dabei anfallen). Der Kunde kann ihn mit
einem Klick in seinen Datenschutztext übernehmen. Maßgeblich ist der Wortlaut im CRM.

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
neu hochladen.

## Firmendaten auf der Seite

Firmenname, Adresse, E-Mail und Telefon aus dem CRM liefert `getSite()` (siehe `inhalte.md`). Das Formular
zeigt sie von selbst als Ausweichkontakt, wenn das Senden scheitert. Schreibe solche Angaben nie fest in den
Code: Ändert der Kunde sie im CRM, soll die Seite folgen.

## Einwilligung

- Vor der Entscheidung des Besuchers lädt die Seite nichts von fremden Servern und speichert nur seine Wahl.
- „Alle ablehnen“ und „Alle akzeptieren“ sind gleich gestaltet. Ändere das nicht.
- Tracking: nur `<ConsentGate category="marketing"><Tracking /></ConsentGate>`. Keine eigenen Pixel-Snippets.
- Karten, Videos und andere fremde Inhalte: `<ConsentGate category="media">` mit `fallback`.
- Nutzt die Seite nur manche Zwecke, nenne sie: `<CookieBanner categories={['marketing']} />`.
- Das Formular schützt eine Rechenaufgabe im Hintergrund (ALTCHA) vor Missbrauch. Sie kommt von
  DealSystem selbst, setzt kein Cookie und braucht keine Einwilligung.
