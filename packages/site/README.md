# @dealsystem/site

Bausteine für Self-Service-Websites auf DealSystem: Svelte-5-Komponenten, Lade-Helfer für den Build, ein
Vite-Plugin und die Konfiguration. Die Seite ist statisch (`@sveltejs/adapter-static`), enthält kein Secret
und spricht das CRM nur über die öffentliche Site-API an.

## Einstiegspunkte

| Import                     | Inhalt                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `@dealsystem/site`         | Komponenten, `consent`, `loadCollection`, `loadEntry`                                    |
| `@dealsystem/site/content` | `getCollection`, `getEntry`, `collectionEntries`, `getSlots`, `getSite` (nur beim Build) |
| `@dealsystem/site/config`  | `defineSite`, `validateSiteConfig`, `handleHttpError`                                    |
| `@dealsystem/site/vite`    | `dealsystem(site)`                                                                       |

## Einrichtung

```ts
// dealsystem.config.ts
import { defineSite } from '@dealsystem/site/config';

export default defineSite({
	siteId: '…',
	funnels: {
		kontakt: {
			label: 'Kontakt',
			fields: [
				{ name: 'email', type: 'email', standardField: 'email', required: true },
				{ name: 'nachricht', type: 'textarea' },
			],
		},
	},
});
```

```ts
// vite.config.ts — dealsystem() steht vor sveltekit()
import { sveltekit } from '@sveltejs/kit/vite';
import { dealsystem } from '@dealsystem/site/vite';
import { defineConfig } from 'vite';
import site from './dealsystem.config';

export default defineConfig({ plugins: [dealsystem(site), sveltekit()] });
```

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { handleHttpError } from '@dealsystem/site/config';

export default {
	kit: { adapter: adapter({ fallback: '404.html' }), prerender: { handleHttpError } },
};
```

```ts
// src/dealsystem.d.ts — macht funnel- und collection-Schlüssel zu geprüften Typen
import type site from '../dealsystem.config';

declare global {
	interface DealsystemSiteTypes {
		config: typeof site;
	}
}

export {};
```

## Komponenten

| Komponente                                                | Zweck                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `<LeadForm funnel>`                                       | Formular mit Beschriftungen, Fehlertexten, Honeypot, Captcha und Versand |
| `<Text key default>`                                      | kurzer Text, im CRM änderbar                                             |
| `<RichText key default>` / `<RichText content>`           | formatierter Text, geprüft                                               |
| `<MediaImage src\|media\|key alt>`                        | Bild; `alt` ist Pflicht, leer nur mit `decorative`                       |
| `<MediaVideo media title>`                                | Video mit Bedienelementen                                                |
| `<CollectionList collection entries>`                     | Liste von CMS-Einträgen                                                  |
| `<CookieBanner />`, `<ConsentGate category>`              | Einwilligung; vorher lädt nichts von Dritten                             |
| `<Tracking />`                                            | Meta Pixel und Google Tag, nur in `<ConsentGate category="marketing">`   |
| `<Impressum />`, `<Datenschutz />`, `<SiteFooterLegal />` | Rechtstexte und Pflicht-Links aus den Firmendaten                        |

Jede Komponente und Funktion trägt ihre Beschreibung mit Beispiel im Quelltext.

## Gestaltung

Die Komponenten erben Schrift und Textfarbe der Seite. Diese CSS-Variablen ändern den Rest:

| Variable                                       | Standard              | Wirkt auf                |
| ---------------------------------------------- | --------------------- | ------------------------ |
| `--ds-color-primary` / `--ds-color-on-primary` | `#1a1a1a` / `#ffffff` | Schaltflächen            |
| `--ds-color-text` / `--ds-color-surface`       | `#1a1a1a` / `#ffffff` | Formular, Cookie-Hinweis |
| `--ds-color-border`                            | `#6b6b6b`             | Eingabefelder            |
| `--ds-color-error`                             | `#b3261e`             | Fehlertexte              |
| `--ds-color-focus`                             | `#1a56db`             | Fokusrahmen              |
| `--ds-radius`                                  | `4px`                 | Ecken                    |

Die Standardwerte erfüllen die Kontraste von WCAG 2.1 AA. Wer sie ändert, prüft die Kontraste neu.

## Umgebung

| Variable                                                                            | Gesetzt von | Bedeutung                                                                       |
| ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `DEALSYSTEM_CONTENT_FILE`                                                           | Build-Host  | Pfad des Inhalts-Schnappschusses. Lokal: `.dealsystem/content.json`             |
| `DEALSYSTEM_MANIFEST_FILE`                                                          | Build-Host  | Zielpfad des Manifests. Lokal: `.dealsystem/manifest.json`                      |
| `PUBLIC_DEALSYSTEM_API`, `PUBLIC_DEALSYSTEM_SITE_KEY`, `PUBLIC_DEALSYSTEM_SITE_URL` | Build-Host  | Zugang zur Site-API. Ohne sie antwortet der Dev-Server selbst (Schlüssel `dev`) |

## Marker im fertigen HTML

Für Prüfungen an der Ausgabe setzen die Komponenten feste Attribute: `data-ds-cookie-banner`,
`data-ds-footer-legal`, `data-ds-impressum`, `data-ds-datenschutz`, `data-ds-lead-form="<funnel>"`,
`data-ds-image` (am `<img>`), `data-ds-video`, `data-ds-richtext`, `data-ds-collection="<key>"`, `data-ds-slot="<key>"`.

## Vertrag

`contract/site-api.v1.json` ist die Kopie des Vertrags aus dem Core, gegen die der Client getestet ist
(siehe `contract/README.md`).
