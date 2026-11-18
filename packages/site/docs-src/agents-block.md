## DealSystem-Website: Anleitung für KI-Agenten

Statische SvelteKit-Seite mit `@dealsystem/site` {{VERSION}}. DealSystem prüft, baut und hostet sie.

**Lies vor jeder Aufgabe die passende Datei unter `{{DOCS}}/` und richte dich danach, nicht nach deinem Vorwissen.** Vieles, was bei SvelteKit sonst üblich ist (Server-Code, eigenes `fetch`, eigene Formulare, Schriften von Google), ist hier verboten und wird abgelehnt. Für typische Aufgaben gibt es Schritt-für-Schritt-Anleitungen (Skills, unten).

### Mit wem du sprichst

Dein Auftraggeber ist kein Techniker, meist Immobilien-Investor oder Makler.

- Sprich Deutsch, kurz und ohne Fachbegriffe: „Vorschau“, „hochladen“, „veröffentlichen“, nicht „Build“, „Deploy“, „Repository“.
- **Eine Nachricht, höchstens eine Frage.** Nie eine Liste von Fragen, nie eine Frage neben einer Bitte (etwa um die Anmeldung). Frag nur, wenn du ohne Antwort nicht weiterkommst; sonst triff eine vernünftige Annahme und nenne sie in einem Satz.
- Melde nach jedem größeren Schritt in einem Satz, was fertig ist und was als Nächstes kommt.
- Zeige keinen Code, keine Befehle, keine Fehlermeldungen, und nenne ihm keinen Befehl zum Selbst-Ausführen. Er öffnet nur Links und trägt Dinge im CRM ein. Prüffehler behebst du selbst; erst nach drei Fehlversuchen sag in einem Satz, was nicht geht und was du brauchst.
- Erfinde nichts über das Unternehmen: keine Adressen, Telefonnummern, Preise, Referenzen, Zahlen und keine Leistungsversprechen („fester Ansprechpartner“, „keine Provision“, „Antwort in 24 Stunden“), die der Kunde nicht selbst genannt hat. Was du nicht weißt, erfragst du oder lässt du weg.
- Nenne nur die Orte im CRM aus dieser Anleitung; erfinde keine Bereiche.

### Fester Ablauf

**Zu Beginn jeder Sitzung `npx dealsystem sync` ausführen.** Ob Rechtstexte fehlen, sagt `npx dealsystem status`, nicht `.dealsystem/content.json`. Einzelheiten: `ablauf.md`.

1. **Anmelden:** `npx dealsystem login --start`, den Menschen die Adresse öffnen und bestätigen lassen, dann `npx dealsystem login --wait`.
2. **Verbinden:** `npx dealsystem init` (Seite wählen oder anlegen: `ablauf.md`), dann `npx dealsystem sync`.
3. **Bauen:** Seiten ändern, ansehen mit `npm run dev`.
4. **Prüfen:** `npm run check`, `npm run build`, `npx dealsystem check --output build`, alles beheben. „Geprüft“ nur, wenn die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet. Prüfen geht auch ohne Anmeldung.
5. **Hochladen:** `npx dealsystem deploy -m "kurze Notiz"`, dem Menschen die Vorschau-Adresse geben.
6. **Veröffentlichen:** nur nach einem ausdrücklichen Ja zu genau dieser Vorschau: `npx dealsystem publish --confirm`. Nie von dir aus, nie „weil alles grün ist“. **Jede neue Vorschau braucht ein neues Ja.**

Projektordner fehlt (neuer Rechner)? `npx dealsystem pull` holt den Code der Live-Version (`ablauf.md`).

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
- Formulare mit `<LeadForm>` oder `createLeadClient`, Bilder nur mit `<MediaImage>` und beschreibendem `alt`. Fotos des Kunden mit `npx dealsystem image add` (Skill `bild-einbauen`).
- Jeder sichtbare Text als `<Text>`/`<RichText>` mit festem `key` und `default` (Schlüssel-Regeln: `komponenten.md`). Adresse, Telefon, E-Mail kommen als `data.site` aus dem CRM.
- Schriften lokal, keine CDN-Links. Fremdes nur über `external` in `dealsystem.config.ts` und `<Embed>`/`<ExternalScript>` (Skill `extern-einbinden`).
- Jede Seite: eine `h1`, Titel und Beschreibung über `<Seo>`, nicht als `<title>` in `<svelte:head>`. `<SiteHead />`, `<CookieBanner />` und `<SiteFooterLegal />` bleiben im Layout.
- Titel, Beschreibung, Vorschaubild und Favicon pflegt der Kunde unter Eigene Website → Einstellungen → Google und Teilen; nicht fest im Code überschreiben (`seo.md`).
- `svelte.config.js` und `vite.config.ts` nicht ändern (`npx dealsystem sync --fix-config`). Nur freigegebene Pakete (`npx dealsystem check --allowed`).
- Barrierefrei bauen: `gestaltung.md`.
- Kampagnen, Klick-IDs und Seitenaufrufe erfasst das SDK; nicht nachbauen (`rechtstexte.md`).

### Skills

Schritt-für-Schritt-Anleitungen unter `.claude/skills/<name>/SKILL.md`. Lies den passenden Skill, bevor du anfängst, auch wenn dein Werkzeug Skills nicht von selbst lädt:

{{SKILLS}}

### Bausteine

Aus `@dealsystem/site`; Pflichtangaben und Beispiele in `komponenten.md`.

{{BAUSTEINE}}

### Befehle

{{BEFEHLE}}

### Nachschlagen

Unter `{{DOCS}}/`:

{{NACHSCHLAGEN}}
