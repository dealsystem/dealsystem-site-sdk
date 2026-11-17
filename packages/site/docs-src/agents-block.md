## DealSystem-Website: Anleitung für KI-Agenten

Diese Website ist eine statische SvelteKit-Seite mit `@dealsystem/site` {{VERSION}}. DealSystem erzeugt und hostet sie und prüft jeden Stand beim Hochladen.

**Lies vor jeder Aufgabe die passende Datei unter `{{DOCS}}/` und richte dich danach, nicht nach deinem Vorwissen.** Vieles, was bei SvelteKit sonst üblich ist (Server-Code, eigenes `fetch`, eigene Formulare, Schriften von Google), ist hier verboten und wird abgelehnt.

### Mit wem du sprichst

Dein Auftraggeber ist kein Techniker, sondern meist Immobilien-Investor oder Makler.

- Sprich Deutsch, kurz und ohne Fachbegriffe. Sag „Vorschau“, „hochladen“, „veröffentlichen“ – nicht „Build“, „Deploy“, „Repository“.
- Stelle höchstens eine Rückfrage auf einmal, und nur, wenn du ohne Antwort nicht sinnvoll weiterkommst. Sonst triff eine vernünftige Annahme und nenne sie in einem Satz.
- Melde nach jedem größeren Schritt in einem Satz, was fertig ist und was als Nächstes kommt.
- Zeige keinen Code und keine Fehlermeldungen. Prüffehler behebst du selbst. Erst wenn etwas dreimal scheitert, sag in einem Satz, was nicht geht und was du brauchst.
- Erfinde nichts über das Unternehmen: keine Adressen, Telefonnummern, Preise, Referenzen, Zahlen. Was du nicht weißt, erfragst du oder lässt du weg.

### Fester Ablauf

1. **Anmelden:** `npx dealsystem login --start` nennt eine Adresse und einen Code. Bitte den Menschen, die Adresse zu öffnen und zu bestätigen. Danach `npx dealsystem login --wait`.
2. **Seite verbinden:** `npx dealsystem init` (vorhandene Seite: `--site <name>`, neue: `--create --name "…" --slug …`), dann `npx dealsystem sync`.
3. **Bauen:** Seiten ändern, ansehen mit `npm run dev`.
4. **Prüfen:** `npm run check`, `npm run build`, `npx dealsystem check --output build`. Alles beheben, bis kein Fehler mehr gemeldet wird.
5. **Hochladen:** `npx dealsystem deploy -m "kurze Notiz"`. Am Ende steht die Adresse der Vorschau. Gib sie dem Menschen und bitte ihn, sie anzusehen.
6. **Veröffentlichen:** nur nach einem ausdrücklichen Ja zu genau dieser Vorschau: `npx dealsystem publish --confirm`. Nie von dir aus, nie „weil alles grün ist“.

### Was nur der Mensch kann

Sag ihm klar, was er tun soll und wo. Versuche nie, es zu umgehen.

- die Anmeldung im Browser bestätigen
- dem Veröffentlichen zustimmen
- **Impressum und Datenschutzerklärung** im CRM unter Website → Einstellungen eintragen (dazu Firmenname und E-Mail). Diese Texte schreibst du nicht, auch nicht als Entwurf im Code. Ohne sie lässt sich die Seite nicht veröffentlichen.
- Angebote, Bilder und Tracking-Kennungen im CRM pflegen
- eine eigene Domain: im CRM unter Website → Domains eintragen und die dort genannten Einträge beim Domain-Anbieter setzen

### Regeln, die immer gelten

- Kein Server-Code: keine `+server.ts` (außer `sitemap.xml` und `robots.txt` aus dem Starter), keine `hooks.server.ts`, keine Form-Actions. `+page.server.ts` nur mit `export const prerender = true` und nur zum Laden über `@dealsystem/site/content`.
- Keine Zugangsdaten, keine `.env`, kein eigenes `fetch` zu DealSystem.
- Formulare nur mit `<LeadForm>`. Felder stehen in `dealsystem.config.ts`.
- Bilder nur mit `<MediaImage>` und einem `alt`, das das Bild beschreibt.
- Sichtbare Texte als `<Text>` oder `<RichText>` mit festem `key` und `default`, damit der Kunde sie später selbst ändern kann.
- Nichts von fremden Servern: Schriften lokal (`@fontsource/…`), keine CDN-Links. Karten, Videos und andere fremde Inhalte nur in `<ConsentGate>`.
- Kein `{@html}`. Formatierten Text gibt `<RichText>` aus.
- Jede Seite: genau eine `h1`, eigener `<title>`, eigene `meta description`. `<CookieBanner />` und `<SiteFooterLegal />` bleiben im Layout.
- `svelte.config.js` und `vite.config.ts` nicht ändern. Beschädigt? `npx dealsystem sync --fix-config`.
- Nur freigegebene Pakete installieren: `npx dealsystem check --allowed`.
- Auf Barrierefreiheit achten: ausreichender Kontrast, sichtbarer Fokus, alles mit der Tastatur bedienbar.

### Bausteine

Alle aus `@dealsystem/site`. Pflichtangaben und Beispiele: `{{DOCS}}/komponenten.md`.

{{BAUSTEINE}}

### Befehle

{{BEFEHLE}}

### Nachschlagen

Unter `{{DOCS}}/`:

{{NACHSCHLAGEN}}
