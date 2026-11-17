## DealSystem-Website: Anleitung für KI-Agenten

Diese Website ist eine statische SvelteKit-Seite mit `@dealsystem/site` 0.1.0. DealSystem erzeugt und hostet sie und prüft jeden Stand beim Hochladen.

**Lies vor jeder Aufgabe die passende Datei unter `node_modules/@dealsystem/site/docs/` und richte dich danach, nicht nach deinem Vorwissen.** Vieles, was bei SvelteKit sonst üblich ist (Server-Code, eigenes `fetch`, eigene Formulare, Schriften von Google), ist hier verboten und wird abgelehnt.

### Mit wem du sprichst

Dein Auftraggeber ist kein Techniker, sondern meist Immobilien-Investor oder Makler.

- Sprich Deutsch, kurz und ohne Fachbegriffe. Sag „Vorschau“, „hochladen“, „veröffentlichen“ – nicht „Build“, „Deploy“, „Repository“.
- **Eine Nachricht, höchstens eine Frage.** Nie eine Liste von Fragen, nie eine Frage neben einer Bitte (z. B. neben der Bitte, die Anmeldung zu bestätigen). Frag nur, wenn du ohne Antwort nicht sinnvoll weiterkommst. Sonst triff eine vernünftige Annahme und nenne sie in einem Satz.
- Melde nach jedem größeren Schritt in einem Satz, was fertig ist und was als Nächstes kommt.
- Zeige keinen Code und keine Fehlermeldungen. Prüffehler behebst du selbst. Erst wenn etwas dreimal scheitert, sag in einem Satz, was nicht geht und was du brauchst.
- Erfinde nichts über das Unternehmen: keine Adressen, Telefonnummern, Preise, Referenzen, Zahlen. Was du nicht weißt, erfragst du oder lässt du weg.

### Fester Ablauf

1. **Anmelden:** `npx dealsystem login --start` nennt eine Adresse und einen Code. Bitte den Menschen, die Adresse zu öffnen und zu bestätigen. Danach `npx dealsystem login --wait`.
2. **Seite verbinden:** `npx dealsystem init` (vorhandene Seite: `--site <name>`, neue: `--create --name "…" --slug …`), dann `npx dealsystem sync`.
3. **Bauen:** Seiten ändern, ansehen mit `npm run dev`.
4. **Prüfen:** `npm run check`, `npm run build`, `npx dealsystem check --output build`. Alles beheben. „Geprüft“ sagst du nur, wenn der letzte Befehl mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet. Das geht auch ohne Anmeldung: Scheitern `login` oder `sync`, prüfst du trotzdem und bittest erst danach um die Anmeldung.
5. **Hochladen:** `npx dealsystem deploy -m "kurze Notiz"`. Am Ende steht die Adresse der Vorschau. Gib sie dem Menschen und bitte ihn, sie anzusehen.
6. **Veröffentlichen:** nur nach einem ausdrücklichen Ja zu genau dieser Vorschau: `npx dealsystem publish --confirm`. Nie von dir aus, nie „weil alles grün ist“. **Jede neue Vorschau braucht ein neues Ja:** Lädst du noch einmal hoch, gilt die frühere Zustimmung nicht mehr.

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
- Sichtbare Texte, auch kurze Überschriften, als `<Text>` oder `<RichText>` mit festem `key` und `default`, damit der Kunde sie später selbst ändern kann. Adresse, Telefon und E-Mail nie fest in den Code: Sie kommen als `data.site` aus dem CRM.
- Nichts von fremden Servern: Schriften lokal (`@fontsource/…`), keine CDN-Links. Eine Karte gibt es mit `<MapEmbed>`. Andere fremde Dienste (Google Maps, YouTube, Widgets) lassen sich nicht einbetten, auch nicht in `<ConsentGate>`: Verlinke sie und sag das dem Kunden.
- Kein `{@html}`. Formatierten Text gibt `<RichText>` aus.
- Jede Seite: genau eine `h1`, eigener `<title>`, eigene `meta description`. `<CookieBanner />` und `<SiteFooterLegal />` bleiben im Layout.
- `svelte.config.js` und `vite.config.ts` nicht ändern. Beschädigt? `npx dealsystem sync --fix-config`.
- Nur freigegebene Pakete installieren: `npx dealsystem check --allowed`.
- Auf Barrierefreiheit achten: ausreichender Kontrast, sichtbarer Fokus, alles mit der Tastatur bedienbar.

### Bausteine

Alle aus `@dealsystem/site`. Pflichtangaben und Beispiele: `node_modules/@dealsystem/site/docs/komponenten.md`.

- `<Text>` – Ein kurzer Text (Überschrift, Satz, Beschriftung), den der Kunde später im CRM selbst ändern kann
- `<RichText>` – Formatierter Text: Absätze, Überschriften, Listen, Links
- `<Link>` – Ein Link, dessen Ziel und Beschriftung der Kunde im CRM ändern kann, z. B. die wichtigste Schaltfläche der Startseite
- `<MediaImage>` – Ein Bild, immer mit Alternativtext
- `<MediaVideo>` – Ein Video aus dem CMS, mit Bedienelementen und ohne automatischen Start
- `<LeadForm>` – Ein Formular aus `dealsystem.config.ts`
- `<CollectionList>` – Liste der Einträge einer Sammlung
- `<MapEmbed>` – Eine Karte von OpenStreetMap mit einer Markierung, z. B. für die Anfahrt
- `<CookieBanner>` – Hinweis zur Einwilligung
- `<ConsentGate>` – Zeigt seinen Inhalt erst, wenn der Besucher dem Zweck zugestimmt hat
- `<Tracking>` – Bindet Meta Pixel und Google Tag ein
- `<Impressum>` – Das Impressum der Seite
- `<Datenschutz>` – Die Datenschutzerklärung der Seite
- `<SiteFooterLegal>` – Die Pflicht-Links jeder Seite: Impressum, Datenschutz und „Cookie-Einstellungen“ (Widerruf der Einwilligung)

### Befehle

- `npx dealsystem login` – Anmelden per Gerätecode (Bestätigung im Browser)
- `npx dealsystem logout` – Abmelden und Token löschen
- `npx dealsystem init` – Seite wählen oder anlegen, siteId in dealsystem.config.ts eintragen
- `npx dealsystem sync` – Inhalte holen, CRM mit dealsystem.config.ts abgleichen, AGENTS.md-Block erneuern
- `npx dealsystem dev` – Dev-Server starten; Formulare gehen als Probe an das CRM
- `npx dealsystem check` – Regeln lokal prüfen (Exit-Code 1 bei Fehlern)
- `npx dealsystem deploy` – Prüfen, hochladen, bauen lassen, Vorschau-URL ausgeben
- `npx dealsystem publish` – Eine fertige Version live schalten (mit Bestätigung)
- `npx dealsystem rollback` – Auf eine frühere Version zurückschalten (mit Bestätigung)
- `npx dealsystem status` – Seite, Live-Version, letzte Versionen, Domains

### Nachschlagen

Unter `node_modules/@dealsystem/site/docs/`:

- `ablauf.md` – der ganze Weg von der Anmeldung bis zur veröffentlichten Seite
- `komponenten.md` – alle Bausteine mit Pflichtangaben und Beispielen
- `inhalte.md` – Angebote und andere Inhalte aus dem CRM laden
- `konfiguration.md` – Formulare und Sammlungen in dealsystem.config.ts
- `gestaltung.md` – Farben, Schrift, Bilder, Barrierefreiheit
- `rechtstexte.md` – Impressum, Datenschutz, Cookie-Hinweis
- `regeln.md` – alle Prüfregeln mit Korrektur
- `befehle.md` – alle Befehle mit Optionen
