# Fremde Dienste: Videos, Karten, Terminbuchung, Skripte

Eine Seite lädt von fremden Servern nur, was in `dealsystem.config.ts` unter `external` steht, und nur über
die Bausteine `<Embed>` und `<ExternalScript>`. Beides zusammen ergibt die Sicherheitsregeln der Seite (CSP)
und den Cookie-Hinweis. Vor der Einwilligung des Besuchers lädt nichts davon.

Ohne Eintrag unter `external` gehen weiterhin: `<MapEmbed>` (OpenStreetMap) und `<Tracking />` (Google Tag und
Meta Pixel mit den Kennungen aus dem CRM).

## Grundregeln

- `svelte.config.js` enthält `csp: dealsystemCsp()` und sonst keine Sicherheitsregeln. Hosts trägst du nie
  dort ein, nur unter `external`. Fehlt die Zeile, stellt `npx dealsystem sync --fix-config` sie her.
- Jeder Dienst bekommt einen Schlüssel in Kleinbuchstaben (`video`, `chat`). Denselben Schlüssel nennst du im
  Baustein: `<Embed id="video" …>`. Ein Tippfehler ist ein Typfehler.
- Hosts nur als `https://host.de`, ohne Pfad, ohne Schrägstrich am Ende. Ein Platzhalter `https://*.host.de`
  geht nur in `connect`, `img`, `media`, `style` und `font`, nie in `script` oder `frame`.
- `category` ist `media` (Videos, Karten, Widgets), `marketing` (Werbung, Chat, Tag-Manager) oder `statistics`
  (Reichweitenmessung). „Notwendig“ gibt es nicht: Fremdes lädt immer erst nach der Einwilligung.
- Kein Inline-Code. Ein Snippet des Anbieters (`<script>…</script>`) legst du als Datei unter
  `static/scripts/` ab und lädst sie mit `<ExternalScript src="/scripts/datei.js">`.
- Verboten bleiben `unsafe-eval`, WebAssembly, Passwortfelder und Formulare, die an fremde Adressen schicken.
- Nenne den Dienst dem Kunden: Er muss ihn in seiner Datenschutzerklärung aufführen (Eigene Website →
  Rechtliches). Den Text schreibst du nicht.

## YouTube-Video einbinden

```ts
// dealsystem.config.ts
export default defineSite({
	siteId: '…',
	external: { video: { preset: 'youtube' } },
});
```

```svelte
<Embed id="video" src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Rundgang durch das Haus" />
```

- Die Adresse darfst du so übernehmen, wie der Kunde sie schickt (`watch?v=`, `youtu.be/…`, `shorts/…`,
  auch mit `&t=90`). Das SDK bettet sie ohne Cookies ein (`youtube-nocookie.com`).
- `title` ist Pflicht und beschreibt, was zu sehen ist.
- Vor der Einwilligung steht dort ein Platzhalter mit „Video laden“ und dem Link zum Video. Ein Vorschaubild
  davor nur mit `poster="/bilder/vorschau.jpg"` aus `static/`, nie ein Bild von YouTube.
- Mehrere Videos von YouTube nutzen denselben Eintrag: `<Embed id="video" src="…">` beliebig oft.

## Vimeo, Google Maps, Calendly

Vorlagen (`preset`) gibt es für `youtube`, `vimeo`, `google-maps` und `calendly`. Sie legen Anbieter, Zweck,
Datenschutz-Link und Hosts fest; neben `preset` steht nichts.

```ts
external: {
	rundgang: { preset: 'vimeo' },
	anfahrt: { preset: 'google-maps' },
	termin: { preset: 'calendly' },
},
```

```svelte
<Embed id="rundgang" src="https://vimeo.com/76979871" title="Rundgang" />
<Embed id="anfahrt" src="https://www.google.com/maps/embed?pb=…" title="Anfahrt zum Büro" />
<Embed id="termin" src="https://calendly.com/beispiel/erstgespraech" title="Termin für ein Erstgespräch" />
```

- Google Maps: nur die Adresse aus Google Maps → Teilen → Karte einbetten (`/maps/embed?pb=…`). Ohne sie nimm
  `<MapEmbed>` (OpenStreetMap), der braucht keinen Eintrag.
- Calendly: die Adresse der Buchungsseite. Der Platzhalter ist 700 Pixel hoch; `height="900px"` ändert das.

## Anderer Dienst als Rahmen (Widget)

Ohne Vorlage beschreibst du den Dienst selbst:

```ts
external: {
	bewertungen: {
		category: 'media',
		provider: 'Beispiel GmbH, Deutschland',
		purpose: 'Zeigt Kundenbewertungen.',
		privacyUrl: 'https://beispiel.de/datenschutz',
		frame: ['https://widget.beispiel.de'],
	},
},
```

```svelte
<Embed id="bewertungen" src="https://widget.beispiel.de/firma/123" title="Unsere Bewertungen" />
```

`provider` (mit Sitz), `purpose` und `privacyUrl` erscheinen im Cookie-Hinweis. Kennst du sie nicht sicher,
frag den Kunden; rate sie nicht (`PRV-008`).

## Eigenes Skript einbinden (Chat, Tag-Manager)

```ts
external: {
	chat: {
		category: 'marketing',
		provider: 'HubSpot, Inc., USA',
		purpose: 'Live-Chat mit dem Vertrieb',
		privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
		script: ['https://js.hs-scripts.com'],
		connect: ['https://*.hubspot.com', 'https://*.hs-analytics.net'],
		img: ['https://*.hubspot.com'],
	},
},
```

```svelte
<!-- src/routes/+layout.svelte, damit der Chat auf jeder Seite steht -->
<ExternalScript
	id="chat"
	src="https://js.hs-scripts.com/1234567.js"
	attrs={{ id: 'hs-script-loader', defer: true }}
/>
```

- `script` nennt den Host, von dem das Skript kommt. Was das Skript danach lädt oder wohin es Daten schickt,
  gehört unter `connect`, `img`, `frame`, `style` oder `font`. Die Angaben stehen meist in der Hilfe des
  Anbieters unter „Content Security Policy“. Fehlt ein Host, blockiert der Browser ihn; in der Konsole steht
  dann „Refused to …“ mit dem Host.
- `attrs` kennt `async`, `defer`, `id`, `type`, `crossorigin`, `referrerpolicy` und `data-*`. Ohne Angabe lädt
  das Skript `async`.
- Das Skript lädt einmal je Seite. Widerruft der Besucher, lädt die Seite neu, damit es weg ist.
- Ein Snippet mit Code (z. B. vom Google Tag Manager) legst du als `static/scripts/gtm.js` ab und schreibst
  `<ExternalScript id="tags" src="/scripts/gtm.js" />`. Tracking-Code in einer Datei ist nur so erlaubt und nur
  mit `category: 'marketing'` oder `'statistics'` (`PRV-003`).
- Google Tag und Meta Pixel gehen einfacher über `<Tracking />` und die Kennung im CRM.
- Eigene Skripte laufen nur auf Seiten mit eigener Domain. Unter der Adresse von DealSystem lehnt der Server
  die Version ab (`SEC-011`): Seiten verschiedener Kunden teilen sich diese Adresse. Videos gehen überall.

## Wenn `check` meldet

| Regel     | Bedeutung                                                                                     | Korrektur                                                                                    |
| --------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `SEC-005` | `external` ungültig oder `svelte.config.js` nicht `dealsystemCsp()`                           | Meldung lesen, Host in der Grundform eintragen; `npx dealsystem sync --fix-config`           |
| `SEC-006` | `<script>` ohne `src`, `eval`, WebAssembly                                                    | Code als Datei unter `static/scripts/`, laden mit `<ExternalScript>`                         |
| `SEC-007` | `<form>` mit `action` auf eine andere Adresse, `method="post"`, `target` oder ohne `onsubmit` | `<form onsubmit={senden}>` ohne `action`, senden mit `createLeadClient()`; oder `<LeadForm>` |
| `SEC-008` | Dienst nicht deklariert, Adresse passt nicht zum Host, `<iframe>`/`<script>` ohne Baustein    | Eintrag unter `external`, Baustein statt rohem Element                                       |
| `SEC-009` | Passwortfeld                                                                                  | entfernen                                                                                    |
| `SEC-011` | eigenes Skript ohne eigene Domain                                                             | Domain verbinden oder Skript herausnehmen                                                    |
| `PRV-003` | Tracking-Code in einer Datei, die nicht über `<ExternalScript>` lädt                          | so laden wie oben, Kategorie `marketing`                                                     |
| `PRV-008` | Anbieter, Zweck oder Datenschutz-Link fehlt                                                   | ergänzen, im Zweifel den Kunden fragen                                                       |
