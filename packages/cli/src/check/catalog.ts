// Regelkatalog von `dealsystem check` (Konzept Abschnitt 7, „Regeln von dealsystem check“).
// Neue Regeln kommen zuerst als Warnung und werden frühestens mit der nächsten Minor-Version zum Fehler,
// sonst scheitert der Inhalts-Rebuild einer unveränderten Seite. `RULE_SET_VERSION` steigt, sobald sich
// das Urteil ändern kann: eine neue oder geänderte Fehler-Regel, ein geänderter Schweregrad. Der Core gibt
// die Version dem Build-Host vor (`SELF_SITE_RULE_SET_VERSION`); weicht sie ab, scheitert jeder Build.
// Eine neue Warnung lässt das Urteil gleich und erhöht die Version deshalb nicht (CNT-003).

import type { RuleMeta } from './types.js';

export const RULE_SET_VERSION = '2';

/** Bereich von `@dealsystem/site`, den dieser Regelkatalog kennt. Der Build-Host gibt seinen eigenen mit. */
export const DEFAULT_SDK_RANGE = '>=0.1.0 <2.0.0';

export const RULES: readonly RuleMeta[] = [
	// ------------------------------------------------------------------ Struktur
	{
		id: 'STR-001',
		severity: 'error',
		stages: ['source'],
		title: '`@sveltejs/adapter-static` in svelte.config.js',
		fix: 'Setze in svelte.config.js den Adapter `@sveltejs/adapter-static`: `import adapter from "@sveltejs/adapter-static"` und `kit: { adapter: adapter() }`.',
	},
	{
		id: 'STR-002',
		severity: 'error',
		stages: ['source'],
		title:
			'kein Server-Code: keine `+server.ts` (außer sitemap.xml/robots.txt), keine `hooks.server.ts`, keine Form-Actions',
		fix: 'Lösche die Datei. Formulare gehen über `<LeadForm>`, Daten über `getCollection()`.',
	},
	{
		id: 'STR-003',
		severity: 'error',
		stages: ['source'],
		title: '`+page.server.ts`/`+layout.server.ts` nur mit `prerender = true`; Lade-Helfer nur dort',
		fix: 'Ergänze `export const prerender = true` in der Datei oder in `src/routes/+layout.ts`.',
	},
	{
		id: 'STR-004',
		severity: 'error',
		stages: ['source'],
		title: 'dynamische Routen exportieren `entries()`',
		fix: "Exportiere in `+page.server.ts` der Route `export const entries = () => collectionEntries('<key>')`.",
	},
	{
		id: 'STR-005',
		severity: 'error',
		stages: ['source'],
		title: '`dealsystem.config.ts` gültig, `siteId` gesetzt',
		fix: 'Führe `npx dealsystem init` aus.',
	},
	{
		id: 'STR-008',
		severity: 'error',
		stages: ['source'],
		title:
			"`kit.prerender` in svelte.config.js: `handleHttpError` aus `@dealsystem/site/config` und `handleUnseenRoutes: 'ignore'`",
		fix: "Ergänze in svelte.config.js `import { handleHttpError } from '@dealsystem/site/config'` und `kit: { prerender: { handleHttpError, handleUnseenRoutes: 'ignore' } }`, oder führe `npx dealsystem sync --fix-config` aus.",
	},
	{
		id: 'STR-009',
		severity: 'error',
		stages: ['source'],
		title: 'Vite-Plugin `dealsystem(site)` vor `sveltekit()` in vite.config.ts',
		fix: "Schreibe in vite.config.ts `plugins: [dealsystem(site), sveltekit()]` mit `import { dealsystem } from '@dealsystem/site/vite'` und `import site from './dealsystem.config.ts'`.",
	},
	{
		id: 'STR-006',
		severity: 'error',
		stages: ['source'],
		title: '`@dealsystem/site` im unterstützten Versionsbereich',
		fix: 'Aktualisiere mit `npm install @dealsystem/site@latest` und führe `npx dealsystem sync` aus.',
	},
	{
		id: 'STR-007',
		severity: 'error',
		stages: ['source'],
		title: '`package-lock.json` vorhanden und passend zu package.json',
		fix: 'Führe `npm install` aus und lade das Lockfile mit hoch.',
	},
	// ------------------------------------------------------------- Abhängigkeiten
	{
		id: 'DEP-001',
		severity: 'error',
		stages: ['source'],
		title: 'direkte Abhängigkeiten stehen auf der Positiv-Liste',
		fix: 'Entferne das Paket mit `npm uninstall <name>`. Freigegebene Pakete: `npx dealsystem check --allowed`.',
	},
	{
		id: 'DEP-002',
		severity: 'error',
		stages: ['source'],
		title: 'Pakete kommen nur aus der npm-Registry (kein Git, keine URL, kein `file:`)',
		fix: 'Installiere die veröffentlichte Version aus der npm-Registry: `npm install <name>@latest`.',
	},
	// -------------------------------------------------------------- Sicherheit
	{
		id: 'SEC-001',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'kein Zugangsschlüssel in Quelle oder Ausgabe',
		fix: 'Entferne den Schlüssel und erneuere ihn beim Anbieter. Diese Seite braucht keine Secrets.',
	},
	{
		id: 'SEC-002',
		severity: 'error',
		stages: ['source'],
		title: 'kein `$env/static/private`, `$env/dynamic/private`, keine `.env` im Upload',
		fix: 'Private Umgebungsvariablen gibt es auf einer statischen Seite nicht. Entferne den Import.',
	},
	{
		id: 'SEC-003',
		severity: 'error',
		stages: ['source'],
		title: 'kein `{@html}` außerhalb der SDK-Komponenten',
		fix: 'Ersetze `{@html …}` durch `<RichText>` oder gib den Text normal aus.',
	},
	{
		id: 'SEC-004',
		severity: 'error',
		stages: ['source'],
		title: 'kein eigener Aufruf von `/api/site/`, `/api/v1/`, `/api/internal/`',
		fix: 'Sprich die DealSystem-API nicht direkt an. Nutze `<LeadForm>`, `getCollection()` oder `<CollectionList>`.',
	},
	{
		id: 'SEC-005',
		severity: 'error',
		stages: ['source'],
		title: '`kit.csp` wie im Starter (Modus `hash`, Direktiven nicht gelockert)',
		fix: 'Stelle den Abschnitt `csp` in svelte.config.js wieder her: `npx dealsystem sync --fix-config`.',
	},
	{
		id: 'SEC-006',
		severity: 'error',
		stages: ['source'],
		title: 'kein `eval`, `new Function`, kein Inline-Event-Handler als Zeichenkette',
		fix: 'Entferne den Fund; die Seite läuft mit einer strengen Content-Security-Policy.',
	},
	{
		id: 'SEC-007',
		severity: 'error',
		stages: ['source'],
		title: 'Formulare nur über `<LeadForm>`, kein eigenes `<form>`',
		fix: 'Ersetze das `<form>` durch `<LeadForm funnel="…" />` und lege das Formular in dealsystem.config.ts unter `funnels` an.',
	},
	{
		id: 'SEC-008',
		severity: 'error',
		stages: ['source', 'output'],
		title:
			'eingebettete fremde Inhalte (`<iframe>`, `<script>`) sind von der Content-Security-Policy der Seite erlaubt',
		fix: 'Für eine Karte nutze `<MapEmbed lat={…} lon={…} title="…" />` aus `@dealsystem/site`. Jeden anderen fremden Inhalt ersetzt du durch einen Link zum Anbieter. Lockere nicht die Regeln in svelte.config.js.',
	},
	// --------------------------------------------------------------- Datenschutz
	{
		id: 'PRV-001',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'keine externen Skripte, Styles, Iframes, Schriften, Bilder außerhalb `<ConsentGate>`',
		fix: 'Lege die Datei lokal ab (Ordner `static/` oder Import) oder umschließe das Element mit `<ConsentGate category="…">`.',
	},
	{
		id: 'PRV-002',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'keine Google-Fonts- oder CDN-Schrift-URLs',
		fix: 'Schriften müssen lokal liegen. Installiere `@fontsource/<name>` und importiere sie in `src/routes/+layout.svelte`.',
	},
	{
		id: 'PRV-003',
		severity: 'error',
		stages: ['source'],
		title: 'Tracking nur über `<Tracking>` in `<ConsentGate>`, keine eigenen Pixel-Snippets',
		fix: 'Entferne das Snippet. Trage die ID im CRM ein und nutze `<ConsentGate category="marketing"><Tracking /></ConsentGate>`.',
	},
	{
		id: 'PRV-004',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'Routen `/impressum` und `/datenschutz` mit `<Impressum>` bzw. `<Datenschutz>`',
		fix: 'Lege `src/routes/impressum/+page.svelte` mit `<Impressum />` und `src/routes/datenschutz/+page.svelte` mit `<Datenschutz />` an.',
	},
	{
		id: 'PRV-005',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'jede Seite verlinkt Impressum und Datenschutz und enthält den Cookie-Hinweis',
		fix: 'Füge `<SiteFooterLegal />` und `<CookieBanner />` in `src/routes/+layout.svelte` ein.',
	},
	{
		id: 'PRV-006',
		severity: 'warning',
		stages: ['source'],
		title: 'kein eigener Zugriff auf `document.cookie`, `localStorage`, `sessionStorage`',
		fix: 'Wenn das Speichern nicht technisch nötig ist, gehört es hinter `<ConsentGate>`.',
	},
	// ------------------------------------------------------------ Barrierefreiheit
	{
		id: 'A11Y-001',
		severity: 'error',
		stages: ['source', 'output'],
		title: '`<html lang>` gesetzt',
		fix: 'Setze `<html lang="de">` in `src/app.html`.',
	},
	{
		id: 'A11Y-002',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'jedes Bild hat `alt`; `<img>` nur über `<MediaImage>`',
		fix: 'Ersetze `<img>` durch `<MediaImage>` und beschreibe das Bild in `alt`. Rein dekorativ: `alt="" decorative`.',
	},
	{
		id: 'A11Y-003',
		severity: 'error',
		stages: ['output'],
		title: 'genau eine `<h1>` je Seite, keine übersprungene Überschriften-Ebene',
		fix: 'Nutze genau eine `<h1>` je Seite und danach jeweils die nächste Ebene.',
	},
	{
		id: 'A11Y-004',
		severity: 'error',
		stages: ['output'],
		title: 'Formularfelder haben eine verknüpfte Beschriftung',
		fix: 'Nutze `<LeadForm>` oder ergänze `<label for="…">`.',
	},
	{
		id: 'A11Y-005',
		severity: 'error',
		stages: ['output'],
		title: 'Links und Schaltflächen haben einen zugänglichen Namen; kein „hier klicken“ als einziger Text',
		fix: 'Ergänze sichtbaren, beschreibenden Text oder `aria-label`.',
	},
	{
		id: 'A11Y-006',
		severity: 'error',
		stages: ['source'],
		title: 'Farbpaare der Design-Tokens erreichen 4,5:1',
		fix: 'Wähle für `--color-on-<name>` oder `--color-<name>` einen Farbton mit mindestens 4,5:1 Kontrast.',
	},
	{
		id: 'A11Y-007',
		severity: 'error',
		stages: ['source'],
		title: 'kein `outline: none` ohne Ersatz, kein `tabindex` > 0, kein `user-scalable=no`',
		fix: 'Entferne den Fund; Tastaturnutzer brauchen den sichtbaren Fokus.',
	},
	{
		id: 'A11Y-008',
		severity: 'error',
		stages: ['output'],
		title: '`<title>` und `meta description` je Seite, Titel eindeutig',
		fix: 'Ergänze `<svelte:head><title>…</title><meta name="description" content="…" /></svelte:head>`.',
	},
	{
		id: 'A11Y-009',
		severity: 'error',
		stages: ['source', 'output'],
		title: 'Videos über `<MediaVideo>` mit `title`; kein Autoplay mit Ton',
		fix: 'Nutze `<MediaVideo media={…} title="…" />`.',
	},
	// ----------------------------------------------------------------- Qualität
	{
		id: 'QUA-001',
		severity: 'error',
		stages: ['output'],
		title: 'Ausgabe ≤ 200 MB, ≤ 10 000 Dateien, Einzeldatei ≤ 25 MB',
		fix: 'Verkleinere Bilder oder lege Videos im CRM ab.',
	},
	{
		id: 'QUA-002',
		severity: 'warning',
		stages: ['output'],
		title: 'JavaScript je Seite ≤ 300 KB (gzip)',
		fix: 'Entferne ungenutzte Pakete und große Bibliotheken.',
	},
	{
		id: 'QUA-003',
		severity: 'error',
		stages: ['output'],
		title: 'keine toten internen Links, `404.html` vorhanden',
		fix: 'Korrigiere den Link oder lege die Zielseite an.',
	},
	{
		id: 'QUA-004',
		severity: 'error',
		stages: ['output'],
		title: '`sitemap.xml` und `robots.txt` vorhanden',
		fix: 'Stelle `src/routes/sitemap.xml/+server.ts` und `src/routes/robots.txt/+server.ts` aus dem Starter wieder her (mit `export const prerender = true`).',
	},
	{
		id: 'QUA-005',
		severity: 'error',
		stages: ['source'],
		title: 'jedes Formular hat ein Feld mit `standardField` `email` oder `phone`',
		fix: "Ergänze im Formular ein Feld `{ name: 'email', type: 'email', standardField: 'email', required: true }`.",
	},
	{
		id: 'QUA-006',
		severity: 'error',
		stages: ['source'],
		title: 'Schlüssel-Formate (Slots, Formulare, Sammlungen), kein Slot-Schlüssel mit zwei Typen',
		fix: 'Formular- und Sammlungs-Schlüssel: Kleinbuchstaben, Ziffern und Bindestriche, z. B. `kontakt`. Slot-Schlüssel: zwei bis fünf Teile mit Punkten, der erste ohne Bindestrich, z. B. `ueberuns.team.titel` für die Seite „Über uns“.',
	},
	{
		id: 'QUA-007',
		severity: 'warning',
		stages: ['source'],
		title: 'AGENTS.md-Block passt zur installierten SDK-Version',
		fix: 'Führe `npx dealsystem sync` aus, damit die Agenten-Anleitung zur SDK-Version passt.',
	},
	{
		id: 'QUA-008',
		severity: 'warning',
		stages: ['source'],
		title:
			'eigene Oberfläche mit `createLeadClient`: Ausweichkontakt (`fallback`) und Bot-Falle (`<LeadHoneypot>`)',
		fix: 'Zeig bei jedem Fehler außer `validation` `result.message` und den Ausweichkontakt `result.fallback` (Telefon, E-Mail) und setz `<LeadHoneypot client={lead} />` in die Oberfläche. Vorlage: Skill `funnel-mehrstufig`.',
	},
	// ------------------------------------------------------------------ Inhalte
	{
		id: 'CNT-001',
		severity: 'warning',
		stages: ['source'],
		title: 'Überschriften und längere Texte als Content-Slot statt fest im Code',
		fix: 'Lege den Text als Slot an, damit er im CRM änderbar ist: `<Text key="seite.bereich.name" default="…" />` (Überschrift: `as="h2"`, mehrzeilig: `multiline`, mit Formatierung: `<RichText>`).',
	},
	{
		id: 'CNT-002',
		severity: 'warning',
		stages: ['source'],
		title: 'Adresse, Telefonnummer und E-Mail-Adresse kommen aus dem CRM, nicht aus dem Code',
		fix: 'Nimm die Angabe aus dem CRM: `getSite()` aus `@dealsystem/site/content` liefert `company`, `address`, `email` und `phone` (im Starter als `data.site` auf jeder Seite). Gib sie mit `{data.site.address}` aus. Ändert der Kunde sie im CRM, folgt die Seite.',
	},
	{
		id: 'CNT-003',
		severity: 'warning',
		stages: ['source'],
		title: 'kein `\\n` im `default` von `<Text>`/`<RichText>`: im Attribut ist es kein Zeilenumbruch',
		fix: "Setz den Text in geschweifte Klammern, dann ist `\\n` ein echter Zeilenumbruch: `default={'1. Erster Schritt\\n2. Zweiter Schritt'}`. Leerzeile (`\\n\\n`) = neuer Absatz. Bei `<Text>` zusätzlich `multiline`. Beispiele: komponenten.md, `<Text>` und `<RichText>`.",
	},
	{
		id: 'CNT-004',
		severity: 'warning',
		stages: ['source'],
		title:
			'Titel und Beschreibung über `<Seo>`, Favicon und `noindex` über `<SiteHead>`, damit „Google und Teilen“ im CRM wirkt',
		fix: 'Ersetze `<title>` und `<meta name="description">` in `<svelte:head>` durch `<Seo title="…" description="…" />` (Import aus `@dealsystem/site`). Ins Haupt-Layout gehört `<SiteHead favicon="/favicon.svg" />`, der Favicon-Link nicht nach `src/app.html`.',
	},
	// ------------------------------------------------- Meldungen des Build-Hosts
	{
		id: 'BLD-001',
		severity: 'error',
		stages: [],
		title: '`npm ci` oder `vite build` scheitert',
		fix: 'Führe lokal `npm run build` aus und behebe den ersten Fehler.',
	},
	{
		id: 'BLD-002',
		severity: 'error',
		stages: [],
		title: 'Zeit- oder Speichergrenze des Builds überschritten',
		fix: 'Der Build darf höchstens 5 Minuten und 2 GB brauchen. Entferne große Abhängigkeiten oder Seiten mit sehr vielen Einträgen.',
	},
	{
		id: 'BLD-003',
		severity: 'error',
		stages: [],
		title: 'Archiv oder Ausgabe ungültig (Symlinks, `..` im Pfad, Gerätedateien, Größengrenze)',
		fix: 'Entferne Symlinks und Dateien außerhalb des Projekts und verkleinere große Dateien. Lade nur mit `npx dealsystem deploy` hoch; es packt ausschließlich die erlaubten Dateien.',
	},
];

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): RuleMeta | undefined {
	return BY_ID.get(id);
}
