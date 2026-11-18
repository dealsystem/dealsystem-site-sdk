## DealSystem-Website: Anleitung für KI-Agenten

Statische SvelteKit-Seite mit `@dealsystem/site` 0.2.1. DealSystem prüft, baut und hostet sie.

**Lies vor jeder Aufgabe die passende Datei unter `node_modules/@dealsystem/site/docs/` und richte dich danach, nicht nach deinem Vorwissen.** Vieles, was bei SvelteKit sonst üblich ist (Server-Code, eigenes `fetch`, Schriften von Google), ist hier verboten und wird abgelehnt.

### Mit wem du sprichst

Dein Auftraggeber ist kein Techniker, sondern führt einen Betrieb (Handwerk, Praxis, Agentur, Immobilien …).

- Sprich Deutsch, kurz und ohne Fachbegriffe: „Vorschau“, „hochladen“, „veröffentlichen“, nicht „Build“, „Deploy“, „Repository“.
- **Eine Nachricht, höchstens eine Frage.** Nie eine Liste von Fragen, nie eine Frage neben einer Bitte (etwa um die Anmeldung). Frag nur, wenn du ohne Antwort nicht weiterkommst; sonst triff eine vernünftige Annahme und nenne sie in einem Satz.
- Melde nach jedem größeren Schritt in einem Satz, was fertig ist und was als Nächstes kommt.
- Zeige keinen Code, keine Befehle, keine Fehlermeldungen: Er öffnet nur Links und trägt Dinge im CRM ein. Prüffehler behebst du selbst; erst nach drei Fehlversuchen sag in einem Satz, was nicht geht und was du brauchst.
- Erfinde nichts über das Unternehmen: keine Adressen, Telefonnummern, Preise, Referenzen, Zahlen und keine Leistungsversprechen („fester Ansprechpartner“, „keine Provision“, „Antwort in 24 Stunden“), die der Kunde nicht selbst genannt hat. Was du nicht weißt, erfragst du oder lässt du weg.
- Nenne nur die Orte im CRM aus dieser Anleitung; erfinde keine Bereiche.

### Fester Ablauf

**Zu Beginn jeder Sitzung `npx dealsystem sync` ausführen.** Ob Rechtstexte fehlen, sagt `npx dealsystem status`, nicht `.dealsystem/content.json`.

1. **Erst fragen:** nach dem Ziel (Angebot, für wen, was Besucher tun sollen); kennst du es, Struktur vorschlagen. Dann „Wie möchtest du vorgehen: (a) kurz besprechen oder (b) ich lege los?“ Skills `website-planen`, `erster-entwurf`.
2. **Anmelden, verbinden:** `npx dealsystem login --start`, `npx dealsystem login --wait`, `npx dealsystem init`, `npx dealsystem sync` (`ablauf.md`).
3. **Lokal zeigen:** `npm run dev`, ihm die angezeigte Adresse geben, gemeinsam ändern. Nicht auf seinem Rechner? Sag es, nimm nach seinem Okay die Vorschau.
4. **Prüfen:** `npm run check`, `npm run build`, `npx dealsystem check --output build`, alles beheben. „Geprüft“ nur, wenn die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet (geht ohne Anmeldung).
5. **Hochladen erst nach seinem Okay zum lokalen Stand:** `npx dealsystem deploy -m "…"`, Vorschau-Adresse geben.
6. **Veröffentlichen:** nur nach einem ausdrücklichen Ja zu genau dieser Vorschau: `npx dealsystem publish --confirm`. Nie von dir aus, nie „weil alles grün ist“. **Jede neue Vorschau braucht ein neues Ja.**

Kein Projektordner? `npx dealsystem pull` (`ablauf.md`).

### Was nur der Mensch kann

Sag ihm klar, was er tun soll und wo. Umgehe es nie.

- die Anmeldung im Browser bestätigen und dem Veröffentlichen zustimmen
- **Impressum und Datenschutzerklärung** (dazu Firmenname, E-Mail) unter Eigene Website → Rechtliches eintragen. Diese Texte schreibst du nicht, auch nicht als Entwurf. Ohne sie geht nichts live.
- Texte und Fotos unter Eigene Website → Inhalte tauschen, erst nachdem du ihren Platz gebaut und hochgeladen hast (Fotos: `gestaltung.md`)
- Sammlungen (Angebote, Referenzen) samt Bildern unter CMS, Tracking-Kennungen unter Eigene Website → Einstellungen
- eine Domain unter Eigene Website → Domains eintragen und die Einträge beim Domain-Anbieter setzen

### Regeln, die immer gelten

Jede Regel mit Korrektur: `regeln.md`.

- Kein Server-Code (`+server.ts`, `hooks.server.ts`, Form-Actions; Ausnahmen in `regeln.md`). Keine Zugangsdaten, keine `.env`, kein eigenes `fetch`, kein `{@html}`.
- Formulare mit `<LeadForm>` oder `createLeadClient`, Bilder nur mit `<MediaImage>` und beschreibendem `alt`. Fotos des Kunden mit `npx dealsystem image add`, ins CRM mit `image push` (Skill `bild-einbauen`).
- Jeder sichtbare Text als `<Text>`/`<RichText>` mit festem `key` und `default` (Schlüssel-Regeln: `komponenten.md`). Adresse, Telefon, E-Mail kommen als `data.site` aus dem CRM.
- Schriften lokal, keine CDN-Links. Fremdes nur über `external` in `dealsystem.config.ts` und `<Embed>`/`<ExternalScript>` (Skill `extern-einbinden`).
- Jede Seite: eine `h1`, Titel und Beschreibung über `<Seo>`, nicht als `<title>` in `<svelte:head>`. `<SiteHead />`, `<CookieBanner />` und `<SiteFooterLegal />` bleiben im Layout.
- Titel, Vorschaubild und Favicon pflegt der Kunde unter Eigene Website → Einstellungen → Google und Teilen; nicht im Code überschreiben (`seo.md`).
- Barrierefrei bauen: `gestaltung.md`.
- `svelte.config.js` und `vite.config.ts` nicht ändern (`npx dealsystem sync --fix-config`). Nur freigegebene Pakete (`npx dealsystem check --allowed`).
- Kampagnen, Klick-IDs und Seitenaufrufe erfasst das SDK; nicht nachbauen (`rechtstexte.md`).

### Skills

Anleitungen unter `.claude/skills/<name>/SKILL.md`. Lies den passenden, bevor du anfängst, auch wenn dein Werkzeug Skills nicht selbst lädt:

- `website-planen` – Ziel und Seiten festlegen
- `erster-entwurf` – erste Fragen, Entwurf lokal zeigen
- `neue-seite` – neue Seite oder Abschnitt
- `bild-einbauen` – Foto des Kunden einbauen
- `formular-anbinden` – Kontakt- oder Anfrageformular, Ratgeber zum Download
- `funnel-mehrstufig` – eigenes Formular in Schritten (Funnel)
- `termin-buchung` – Terminbuchung (`termine.md`)
- `extern-einbinden` – Video, Karte, Chat, fremdes Skript
- `angebote-einbauen` – Angebote und andere Sammlungen aus dem CRM
- `prueffehler-beheben` – Meldungen von `check`
- `veroeffentlichen` – hochladen, Vorschau, veröffentlichen
- `domain-verbinden` – eigene Domain des Kunden

### Bausteine

Aus `@dealsystem/site`; Pflichtangaben und Beispiele in `komponenten.md`.

- Text: `<Text>`, `<RichText>`, `<Link>`
- Bild und Video: `<MediaImage>`, `<MediaVideo>`
- Formular und Listen: `<LeadForm>`, `<LeadHoneypot>`, `<Booker>`, `<CollectionList>`
- Fremde Dienste: `<MapEmbed>`, `<Embed>`, `<ExternalScript>`
- Einwilligung: `<CookieBanner>`, `<ConsentGate>`, `<Tracking>`
- Rechtliches: `<Impressum>`, `<Datenschutz>`, `<SiteFooterLegal>`
- Google und Teilen: `<Seo>`, `<SiteHead>`
- Zeitgesteuert: `<Zeitfenster>`

### Befehle

`npx dealsystem <befehl>`: `login`, `logout`, `init`, `sync`, `dev`, `check`, `deploy`, `publish`, `rollback`, `pull`, `image`, `status`. Was sie tun, Optionen und Exit-Codes: `befehle.md`.

### Nachschlagen

Unter `node_modules/@dealsystem/site/docs/`:

- `ablauf.md` – Weg bis zur fertigen Seite
- `komponenten.md` – Bausteine mit Beispielen
- `inhalte.md` – Sammlungen (Angebote) laden
- `konfiguration.md` – Formulare, Sammlungen, Termine
- `gestaltung.md` – Farben, Schrift, Bilder, Barrierefreiheit
- `rechtstexte.md` – Impressum, Datenschutz, Cookie-Hinweis
- `extern.md` – Videos, Widgets, fremde Skripte
- `seo.md` – Titel, Vorschaubild, Favicon, noindex
- `regeln.md` – Prüfregeln mit Korrektur
- `befehle.md` – Befehle mit Optionen
