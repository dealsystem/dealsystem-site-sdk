<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# dealsystem.config.ts (@dealsystem/site/config)

Eine Datei beschreibt die Seite: ihre Kennung, die Sammlungen (Inhalte aus dem CMS) und die Formulare.
Felder eines Formulars stehen nur hier. Nach einer Änderung an Sammlungen: `npx dealsystem sync`.

### defineSite()

Beschreibt die Seite: Kennung, Sammlungen und Formulare. Steht in
`dealsystem.config.ts` im Projektordner. Aus dem Rückgabetyp entstehen die
Typen für `funnel` und `collection` — ein Tippfehler ist ein Typfehler.
Wirft mit einer Liste aller Probleme, wenn die Konfiguration ungültig ist.

```ts
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
function defineSite<const T extends SiteConfig>(config: T): T;
```

### validateSiteConfig()

Prüft eine Konfiguration und liefert alle Probleme als Liste.
Leere Liste heißt: gültig. `defineSite` ruft das auf und wirft; nur eine
fehlende `siteId` lässt es durch, damit die Seite vor `dealsystem init` läuft.

```ts
const problems = validateSiteConfig(config);
if (problems.length > 0) console.log(problems[0].message);
```

```ts
function validateSiteConfig(config: unknown): ConfigProblem[];
```

### handleHttpError()

Für `kit.prerender.handleHttpError` in `svelte.config.js`. Bilder aus dem CRM
(`/_ds/media/…`) liefert erst der DealSystem-Server aus; beim Build gibt es
sie nicht. Diese Funktion lässt genau das durch und bricht bei jedem anderen
toten Link weiter mit einer Fehlermeldung ab.

```ts
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { handleHttpError } from '@dealsystem/site/config';

export default {
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		prerender: { handleHttpError },
	},
};
```

```ts
function handleHttpError(details: {
	status: number;
	path: string;
	referrer: string | null;
	message: string;
}): void;
```

### siteApiOrigin()

Für `connect-src` in der Content-Security-Policy von `svelte.config.js`:
die Adresse, unter der die Seite ihre Formulare an DealSystem schickt. Der
Server, der die Seite erzeugt, nennt sie in `PUBLIC_DEALSYSTEM_API`; ohne
Angabe gilt die Adresse von DealSystem. So passt die Seite auch dann, wenn
sie für eine Test-Umgebung erzeugt wird.

```ts
// svelte.config.js
import { siteApiOrigin } from '@dealsystem/site/config';

// … in kit.csp.directives:
// 'connect-src': ['self', siteApiOrigin()],
```

```ts
function siteApiOrigin(): string;
```

## Typen

### SiteConfig

Inhalt von `dealsystem.config.ts`.

```ts
interface SiteConfig {
	/** Kennung der Seite im CRM. `npx dealsystem init` trägt sie ein. */
	siteId: string;
	collections?: Readonly<Record<string, CollectionDef>>;
	funnels?: Readonly<Record<string, FunnelDef>>;
}
```

### FunnelDef

Ein Formular in `dealsystem.config.ts`.

```ts
interface FunnelDef {
	label: string;
	fields: readonly FunnelFieldDef[];
	/** Vorschlag, was im CRM mit der Anfrage passiert (Deal, Pipeline, Tags, Bestätigung). */
	crm?: FunnelCrmConfig;
}
```

### FunnelFieldDef

Ein Feld eines Formulars in `dealsystem.config.ts`.

```ts
interface FunnelFieldDef {
	/** Technischer Name, z. B. `nachricht`. Nur Buchstaben, Ziffern, `_`. */
	name: string;
	type: FieldType;
	/** Sichtbare Beschriftung. Fehlt sie, wird der Name verwendet. */
	label?: string;
	required?: boolean;
	/** Auswahlwerte für `select` und `multiselect`. */
	options?: readonly string[];
	/** Ordnet das Feld einem Kontaktfeld im CRM zu. */
	standardField?: StandardFieldKey;
	placeholder?: string;
	/** Hilfetext unter dem Feld. */
	help?: string;
	maxLength?: number;
	/** Nur bei `type: 'hidden'`: woher der Wert kommt. */
	from?: HiddenFieldSource;
}
```

### FieldType

Feldtypen eines Formulars. `hidden` sieht der Besucher nicht; das SDK füllt es beim Absenden (`from`).

```ts
type FieldType =
	'text' | 'email' | 'tel' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'hidden';
```

### HiddenFieldSource

Woher ein verstecktes Feld (`type: 'hidden'`) seinen Wert nimmt, genau eine Angabe:
- `{ query: 'partner' }` – URL-Parameter `?partner=…` (aktueller Besuch, gespeichert nur mit Einwilligung)
- `{ utm: 'campaign' }` – UTM-Angabe des Besuchs (`utm_campaign`)
- `{ value: 'Bewertungsrechner' }` – fester Text

Höchstens 500 Zeichen. Im CRM lässt sich das Feld einem eigenen Feld zuordnen, nie einem Standardfeld.

```ts
type HiddenFieldSource = { query: string } | { utm: UtmKey } | { value: string };
```

### FunnelCrmConfig

Was mit einer Anfrage im CRM passiert, als Vorschlag aus dem Code. Der Kunde kann jede Angabe im CRM ändern;
ab dann gilt seine, auch nach dem nächsten Hochladen („Code legt vor, CRM entscheidet“). Namen (Pipeline,
Phase, Tags, Lead-Quelle) sucht das CRM im Workspace; was es dort nicht gibt, legt es nicht an, sondern meldet
es als Warnung beim Hochladen.

```ts
interface FunnelCrmConfig {
	/** Einen Deal anlegen. */
	createDeal?: boolean;
	/** Pipeline des Deals, Name oder ID, höchstens 100 Zeichen. */
	pipeline?: string;
	/** Phase in der Pipeline, Name oder ID, höchstens 100 Zeichen. */
	stage?: string;
	/**
	 * Name des Deals, höchstens 200 Zeichen. Platzhalter: `{{firstName}}`, `{{lastName}}`, `{{email}}`,
	 * `{{phone}}`, `{{adresse}}`.
	 */
	dealName?: string;
	/** Tags am Kontakt, höchstens 20, je höchstens 50 Zeichen. */
	tags?: readonly string[];
	/** Lead-Quelle, Name oder ID, höchstens 100 Zeichen. */
	leadSource?: string;
	/**
	 * Eingangsbestätigung an den Absender. Betreff höchstens 200, Text höchstens 5 000 Zeichen, nur Klartext,
	 * Platzhalter `{{firstName}}`, `{{lastName}}`, `{{formName}}`. Ohne Betreff oder Text gilt der Standard.
	 */
	confirmation?: { enabled: boolean; subject?: string; body?: string };
}
```

### StandardFieldKey

Kontakt-Standardfelder im CRM. Namen immer getrennt als `firstName` und
`lastName`. Jedes Formular braucht ein Feld mit `email` oder `phone`.

```ts
type StandardFieldKey =
	'firstName' | 'lastName' | 'email' | 'phone' | 'address1' | 'postalCode' | 'city';
```

### CollectionDef

Eine Sammlung in `dealsystem.config.ts`.

```ts
interface CollectionDef {
	/** Quelle der Einträge. Bisher nur das CMS. */
	source?: 'cms';
	label: string;
	/** Route eines Eintrags, z. B. `/angebote/:slug`. */
	route: string;
	/** Übersichtsseite, z. B. `/angebote`. */
	indexRoute?: string;
	/** Feld, aus dem das CMS den Slug vorschlägt. Standard: das erste Textfeld. */
	slugFrom?: string;
	fields: readonly CollectionFieldDef[];
}
```

### CollectionFieldDef

Ein Feld einer Sammlung in `dealsystem.config.ts`.

```ts
interface CollectionFieldDef {
	name: string;
	type: CollectionFieldType;
	label?: string;
	required?: boolean;
	options?: readonly string[];
	maxItems?: number;
}
```

### CollectionFieldType

Feldtypen eines CMS-Eintrags.

```ts
type CollectionFieldType =
	| 'text'
	| 'textarea'
	| 'richtext'
	| 'number'
	| 'url'
	| 'date'
	| 'checkbox'
	| 'select'
	| 'multiselect'
	| 'image'
	| 'gallery'
	| 'file';
```
