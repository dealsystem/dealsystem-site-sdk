<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# Regeln von `dealsystem check` (Regelsatz 3)

`npx dealsystem check` prüft den Quelltext, `npx dealsystem check --output build` nach `npm run build`
zusätzlich die fertige Seite. Dieselben Regeln laufen beim Hochladen noch einmal auf dem Server; dort
entscheidet sich, ob die Seite angenommen wird. Ein Fehler verhindert das Hochladen, eine Warnung nicht.
Jede Meldung nennt Datei, Zeile und die Korrektur. Behebe die Ursache; schalte keine Regel ab.

| Regel | Art | Prüft an | Was geprüft wird | So behebst du es |
|---|---|---|---|---|
| `STR-001` | Fehler | Quelltext | `@sveltejs/adapter-static` in svelte.config.js | Setze in svelte.config.js den Adapter `@sveltejs/adapter-static`: `import adapter from "@sveltejs/adapter-static"` und `kit: { adapter: adapter() }`. |
| `STR-002` | Fehler | Quelltext | kein Server-Code: keine `+server.ts` (außer sitemap.xml/robots.txt), keine `hooks.server.ts`, keine Form-Actions | Lösche die Datei. Formulare gehen über `<LeadForm>`, Daten über `getCollection()`. |
| `STR-003` | Fehler | Quelltext | `+page.server.ts`/`+layout.server.ts` nur mit `prerender = true`; Lade-Helfer nur dort | Ergänze `export const prerender = true` in der Datei oder in `src/routes/+layout.ts`. |
| `STR-004` | Fehler | Quelltext | dynamische Routen exportieren `entries()` | Exportiere in `+page.server.ts` der Route `export const entries = () => collectionEntries('<key>')`. |
| `STR-005` | Fehler | Quelltext | `dealsystem.config.ts` gültig, `siteId` gesetzt | Führe `npx dealsystem init` aus. |
| `STR-008` | Fehler | Quelltext | `kit.prerender` in svelte.config.js: `handleHttpError` aus `@dealsystem/site/config` und `handleUnseenRoutes: 'ignore'` | Ergänze in svelte.config.js `import { handleHttpError } from '@dealsystem/site/config'` und `kit: { prerender: { handleHttpError, handleUnseenRoutes: 'ignore' } }`, oder führe `npx dealsystem sync --fix-config` aus. |
| `STR-009` | Fehler | Quelltext | Vite-Plugin `dealsystem(site)` vor `sveltekit()` in vite.config.ts | Schreibe in vite.config.ts `plugins: [dealsystem(site), sveltekit()]` mit `import { dealsystem } from '@dealsystem/site/vite'` und `import site from './dealsystem.config.ts'`. |
| `STR-006` | Fehler | Quelltext | `@dealsystem/site` im unterstützten Versionsbereich | Aktualisiere mit `npm install @dealsystem/site@latest` und führe `npx dealsystem sync` aus. |
| `STR-007` | Fehler | Quelltext | `package-lock.json` vorhanden und passend zu package.json | Führe `npm install` aus und lade das Lockfile mit hoch. |
| `DEP-001` | Fehler | Quelltext | direkte Abhängigkeiten stehen auf der Positiv-Liste | Entferne das Paket mit `npm uninstall <name>`. Freigegebene Pakete: `npx dealsystem check --allowed`. |
| `DEP-002` | Fehler | Quelltext | Pakete kommen nur aus der npm-Registry (kein Git, keine URL, kein `file:`) | Installiere die veröffentlichte Version aus der npm-Registry: `npm install <name>@latest`. |
| `SEC-001` | Fehler | Quelltext + fertige Seite | kein Zugangsschlüssel in Quelle oder Ausgabe | Entferne den Schlüssel und erneuere ihn beim Anbieter. Diese Seite braucht keine Secrets. |
| `SEC-002` | Fehler | Quelltext | kein `$env/static/private`, `$env/dynamic/private`, keine `.env` im Upload | Private Umgebungsvariablen gibt es auf einer statischen Seite nicht. Entferne den Import. |
| `SEC-003` | Fehler | Quelltext | kein `{@html}` außerhalb der SDK-Komponenten | Ersetze `{@html …}` durch `<RichText>` oder gib den Text normal aus. |
| `SEC-004` | Fehler | Quelltext | kein eigener Aufruf von `/api/site/`, `/api/v1/`, `/api/internal/` | Sprich die DealSystem-API nicht direkt an. Nutze `<LeadForm>`, `getCollection()` oder `<CollectionList>`. |
| `SEC-005` | Fehler | Quelltext | `kit.csp: dealsystemCsp()` (oder die feste Liste bis SDK 0.1); `external` in dealsystem.config.ts gültig: nur `https://host`, Platzhalter nicht in `script`/`frame`, kein `unsafe-eval` | Schreibe in svelte.config.js `csp: dealsystemCsp()` (`npx dealsystem sync --fix-config`) und trage fremde Hosts unter `external` in dealsystem.config.ts ein (extern.md). |
| `SEC-006` | Fehler | Quelltext | kein `eval`, `new Function`, WebAssembly, kein Inline-Event-Handler als Zeichenkette, kein `<script>` ohne `src` | Entferne den Fund; die Seite läuft mit einer strengen Content-Security-Policy. Eigenen Code legst du als Datei in `static/scripts/` ab und lädst ihn mit `<ExternalScript>` (extern.md). |
| `SEC-007` | Fehler | Quelltext | eigenes `<form>` nur ohne `action` (oder `method="dialog"`), kein `formaction` | Lass `action` weg und sende mit `createLeadClient()`, oder nimm `<LeadForm funnel="…" />` mit dem Formular unter `funnels` in dealsystem.config.ts. |
| `SEC-008` | Fehler | Quelltext + fertige Seite | fremde Rahmen und Skripte nur über `<Embed>`/`<ExternalScript>` mit Eintrag unter `external`; CSP der fertigen Seite = erwartete CSP | Trage den Dienst unter `external` in dealsystem.config.ts ein und binde ihn mit `<Embed>` (Video, Karte, Termin) oder `<ExternalScript>` (Skript) ein. Anleitung: extern.md. Lockere nicht die Regeln in svelte.config.js. |
| `SEC-009` | Fehler | Quelltext + fertige Seite | kein Passwortfeld (`<input type="password">`) | Entferne das Passwortfeld. Eine Seite auf DealSystem hat keine Anmeldung. |
| `SEC-010` | Fehler | Build | deklarierte fremde Hosts sind nicht als gefährlich gemeldet (Prüfung durch DealSystem beim Hochladen) | Entferne den Dienst aus `external` in dealsystem.config.ts und aus der Seite. Ein gemeldeter Host schadet den Besuchern. |
| `SEC-011` | Fehler | fertige Seite | `<ExternalScript>` nur auf Seiten mit eigener Domain, solange `dealsystem.site` nicht auf der Public Suffix List steht (nur Build-Host) | Verbinde eine eigene Domain (Eigene Website → Domains) oder nimm `<ExternalScript>` heraus. Videos über `<Embed>` und `<Tracking />` gehen auch ohne. |
| `PRV-001` | Fehler | Quelltext + fertige Seite | keine externen Skripte, Styles, Iframes, Schriften, Bilder vor der Einwilligung (außerhalb `<Embed>`, `<ExternalScript>`, `<ConsentGate>`) | Lege die Datei lokal ab (Ordner `static/` oder Import). Fremde Dienste bindest du mit `<Embed>` oder `<ExternalScript>` ein (extern.md). |
| `PRV-002` | Fehler | Quelltext + fertige Seite | keine Google-Fonts- oder CDN-Schrift-URLs | Schriften müssen lokal liegen. Installiere `@fontsource/<name>` und importiere sie in `src/routes/+layout.svelte`. |
| `PRV-003` | Fehler | Quelltext | Tracking über `<Tracking>` oder als Datei in `static/`, geladen von `<ExternalScript>` mit Kategorie `statistics`/`marketing` | Google Tag und Meta Pixel: Kennung im CRM eintragen und `<ConsentGate category="marketing"><Tracking /></ConsentGate>`. Andere Snippets als Datei unter `static/scripts/` mit `<ExternalScript>` laden (extern.md). |
| `PRV-004` | Fehler | Quelltext + fertige Seite | Routen `/impressum` und `/datenschutz` mit `<Impressum>` bzw. `<Datenschutz>` | Lege `src/routes/impressum/+page.svelte` mit `<Impressum />` und `src/routes/datenschutz/+page.svelte` mit `<Datenschutz />` an. |
| `PRV-005` | Fehler | Quelltext + fertige Seite | jede Seite verlinkt Impressum und Datenschutz und enthält den Cookie-Hinweis | Füge `<SiteFooterLegal />` und `<CookieBanner />` in `src/routes/+layout.svelte` ein. |
| `PRV-006` | Warnung | Quelltext | kein eigener Zugriff auf `document.cookie`, `localStorage`, `sessionStorage` | Wenn das Speichern nicht technisch nötig ist, gehört es hinter `<ConsentGate>`. |
| `PRV-008` | Warnung | Quelltext | eigener fremder Dienst unter `external` nennt `provider`, `purpose` und `privacyUrl` | Ergänze Anbieter mit Sitz, Zweck und Datenschutz-Link: Der Cookie-Hinweis zeigt sie dem Besucher. |
| `A11Y-001` | Fehler | Quelltext + fertige Seite | `<html lang>` gesetzt | Setze `<html lang="de">` in `src/app.html`. |
| `A11Y-002` | Fehler | Quelltext + fertige Seite | jedes Bild hat `alt`; `<img>` nur über `<MediaImage>` | Ersetze `<img>` durch `<MediaImage>` und beschreibe das Bild in `alt`. Rein dekorativ: `alt="" decorative`. |
| `A11Y-003` | Fehler | fertige Seite | genau eine `<h1>` je Seite, keine übersprungene Überschriften-Ebene | Nutze genau eine `<h1>` je Seite und danach jeweils die nächste Ebene. |
| `A11Y-004` | Fehler | fertige Seite | Formularfelder haben eine verknüpfte Beschriftung | Nutze `<LeadForm>` oder ergänze `<label for="…">`. |
| `A11Y-005` | Fehler | fertige Seite | Links und Schaltflächen haben einen zugänglichen Namen; kein „hier klicken“ als einziger Text | Ergänze sichtbaren, beschreibenden Text oder `aria-label`. |
| `A11Y-006` | Fehler | Quelltext | Farbpaare der Design-Tokens erreichen 4,5:1 | Wähle für `--color-on-<name>` oder `--color-<name>` einen Farbton mit mindestens 4,5:1 Kontrast. |
| `A11Y-007` | Fehler | Quelltext | kein `outline: none` ohne Ersatz, kein `tabindex` > 0, kein `user-scalable=no` | Entferne den Fund; Tastaturnutzer brauchen den sichtbaren Fokus. |
| `A11Y-008` | Fehler | fertige Seite | `<title>` und `meta description` je Seite, Titel eindeutig | Ergänze `<svelte:head><title>…</title><meta name="description" content="…" /></svelte:head>`. |
| `A11Y-009` | Fehler | Quelltext + fertige Seite | Videos über `<MediaVideo>` mit `title`; kein Autoplay mit Ton | Nutze `<MediaVideo media={…} title="…" />`. |
| `QUA-001` | Fehler | fertige Seite | Ausgabe ≤ 200 MB, ≤ 10 000 Dateien, Einzeldatei ≤ 25 MB | Verkleinere Bilder oder lege Videos im CRM ab. |
| `QUA-002` | Warnung | fertige Seite | JavaScript je Seite ≤ 300 KB (gzip) | Entferne ungenutzte Pakete und große Bibliotheken. |
| `QUA-003` | Fehler | fertige Seite | keine toten internen Links, `404.html` vorhanden | Korrigiere den Link oder lege die Zielseite an. |
| `QUA-004` | Fehler | fertige Seite | `sitemap.xml` und `robots.txt` vorhanden | Stelle `src/routes/sitemap.xml/+server.ts` und `src/routes/robots.txt/+server.ts` aus dem Starter wieder her (mit `export const prerender = true`). |
| `QUA-005` | Fehler | Quelltext | jedes Formular hat ein Feld mit `standardField` `email` oder `phone` | Ergänze im Formular ein Feld `{ name: 'email', type: 'email', standardField: 'email', required: true }`. |
| `QUA-006` | Fehler | Quelltext | Schlüssel-Formate (Slots, Formulare, Sammlungen), kein Slot-Schlüssel mit zwei Typen | Formular- und Sammlungs-Schlüssel: Kleinbuchstaben, Ziffern und Bindestriche, z. B. `kontakt`. Slot-Schlüssel: zwei bis fünf Teile mit Punkten, der erste ohne Bindestrich, z. B. `ueberuns.team.titel` für die Seite „Über uns“. |
| `QUA-007` | Warnung | Quelltext | AGENTS.md-Block passt zur installierten SDK-Version | Führe `npx dealsystem sync` aus, damit die Agenten-Anleitung zur SDK-Version passt. |
| `CNT-001` | Warnung | Quelltext | Überschriften und längere Texte als Content-Slot statt fest im Code | Lege den Text als Slot an, damit er im CRM änderbar ist: `<Text key="seite.bereich.name" default="…" />` (Überschrift: `as="h2"`, mehrzeilig: `multiline`, mit Formatierung: `<RichText>`). |
| `CNT-002` | Warnung | Quelltext | Adresse, Telefonnummer und E-Mail-Adresse kommen aus dem CRM, nicht aus dem Code | Nimm die Angabe aus dem CRM: `getSite()` aus `@dealsystem/site/content` liefert `company`, `address`, `email` und `phone` (im Starter als `data.site` auf jeder Seite). Gib sie mit `{data.site.address}` aus. Ändert der Kunde sie im CRM, folgt die Seite. |
| `CNT-003` | Warnung | Quelltext | kein `\n` im `default` von `<Text>`/`<RichText>`: im Attribut ist es kein Zeilenumbruch | Setz den Text in geschweifte Klammern, dann ist `\n` ein echter Zeilenumbruch: `default={'1. Erster Schritt\n2. Zweiter Schritt'}`. Leerzeile (`\n\n`) = neuer Absatz. Bei `<Text>` zusätzlich `multiline`. Beispiele: komponenten.md, `<Text>` und `<RichText>`. |
| `CNT-004` | Warnung | Quelltext | Titel und Beschreibung über `<Seo>`, Favicon und `noindex` über `<SiteHead>`, damit „Google und Teilen“ im CRM wirkt | Ersetze `<title>` und `<meta name="description">` in `<svelte:head>` durch `<Seo title="…" description="…" />` (Import aus `@dealsystem/site`). Ins Haupt-Layout gehört `<SiteHead favicon="/favicon.svg" />`, der Favicon-Link nicht nach `src/app.html`. |
| `BLD-001` | Fehler | Build | `npm ci` oder `vite build` scheitert | Führe lokal `npm run build` aus und behebe den ersten Fehler. |
| `BLD-002` | Fehler | Build | Zeit- oder Speichergrenze des Builds überschritten | Der Build darf höchstens 5 Minuten und 2 GB brauchen. Entferne große Abhängigkeiten oder Seiten mit sehr vielen Einträgen. |
| `BLD-003` | Fehler | Build | Archiv oder Ausgabe ungültig (Symlinks, `..` im Pfad, Gerätedateien, Größengrenze) | Entferne Symlinks und Dateien außerhalb des Projekts und verkleinere große Dateien. Lade nur mit `npx dealsystem deploy` hoch; es packt ausschließlich die erlaubten Dateien. |

## Freigegebene Pakete

In `package.json` dürfen nur diese Pakete stehen (`DEP-001`). Aktuelle Liste: `npx dealsystem check --allowed`.

- `@dealsystem/site` – DealSystem-SDK
- `dealsystem` – DealSystem-CLI
- `@sveltejs/kit` – SvelteKit
- `@sveltejs/adapter-static` – statischer Build
- `@sveltejs/vite-plugin-svelte` – Svelte für Vite
- `@sveltejs/enhanced-img` – Bilder in WebP/AVIF mit srcset
- `svelte` – Svelte
- `vite` – Build
- `typescript` – Typen
- `tslib` – Typen
- `svelte-check` – Typprüfung
- `@types/node` – Typen
- `tailwindcss` – CSS
- `@tailwindcss/vite` – CSS
- `@tailwindcss/typography` – CSS
- `@tailwindcss/forms` – CSS
- `postcss` – CSS
- `autoprefixer` – CSS
- `sass` – CSS
- `clsx` – CSS-Klassen
- `tailwind-merge` – CSS-Klassen
- `@fontsource/*` – lokale Schriften
- `@fontsource-variable/*` – lokale Schriften
- `@lucide/svelte` – Icons
- `lucide-svelte` – Icons
- `@iconify/svelte` – Icons (nur mit lokal gebündelten Icons)
- `embla-carousel` – Karussell
- `embla-carousel-svelte` – Karussell
- `date-fns` – Datumsformat
- `prettier` – Formatierung
- `prettier-plugin-svelte` – Formatierung
- `prettier-plugin-tailwindcss` – Formatierung
- `eslint` – Linter
- `@eslint/js` – Linter
- `eslint-plugin-svelte` – Linter
- `typescript-eslint` – Linter
- `globals` – Linter
