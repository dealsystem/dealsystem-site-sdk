<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# Inhalte aus dem CRM laden (@dealsystem/site/content)

Diese Funktionen laufen nur, während die Seite erzeugt wird: in `+page.server.ts` oder
`+layout.server.ts` mit `export const prerender = true`. Sie lesen die Inhalte, die
`npx dealsystem sync` aus dem CRM geholt hat (`.dealsystem/content.json`). Nie in `+page.ts`,
nie in einer Komponente aufrufen. Ändert der Kunde etwas im CRM, erzeugt DealSystem die Seite neu.

### getCollection()

Lädt beim Build die veröffentlichten Einträge einer Sammlung. Richtext-Felder
sind bereinigtes HTML vom Server und werden mit `<RichText content={…} />`
ausgegeben. Eine Sammlung ohne Einträge ergibt `[]`.

```ts
// src/routes/angebote/+page.server.ts
import { getCollection } from '@dealsystem/site/content';

export const prerender = true;

export async function load() {
	return { angebote: await getCollection('angebote', { limit: 12 }) };
}
```

```ts
async function getCollection<K extends CollectionKey>(
	key: K,
	query: CollectionQuery = {},
): Promise<CollectionEntry<K>[]>;
```

### getEntry()

Lädt beim Build einen Eintrag über seinen Slug. Gibt `null` zurück, wenn es
ihn nicht gibt — die Seite antwortet dann mit `error(404)`.

```ts
// src/routes/angebote/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import { collectionEntries, getEntry } from '@dealsystem/site/content';

export const prerender = true;
export const entries = collectionEntries('angebote');

export async function load({ params }) {
	const angebot = await getEntry('angebote', params.slug);
	if (!angebot) error(404, 'Angebot nicht gefunden');
	return { angebot };
}
```

```ts
async function getEntry<K extends CollectionKey>(
	key: K,
	slug: string,
): Promise<CollectionEntry<K> | null>;
```

### collectionEntries()

Erzeugt den `entries`-Export einer dynamischen Route, damit SvelteKit jede
Detailseite vorrendert.

```ts
// src/routes/angebote/[slug]/+page.server.ts
export const entries = collectionEntries('angebote');
```

```ts
function collectionEntries<K extends CollectionKey>(key: K): () => Promise<{ slug: string }[]>;
```

### getSite()

Liefert beim Build Name und Adresse der Seite und die Firmendaten aus dem
CRM (`company`, `address`, `email`, `phone`), z. B. für `<title>` oder
strukturierte Daten. Felder, die im CRM leer sind, sind leere Zeichenketten.

```ts
// src/routes/+layout.server.ts
import { getSite } from '@dealsystem/site/content';

export const prerender = true;

export async function load() {
	return { site: await getSite() };
}
```

```ts
async function getSite(): Promise<SiteInfo & ContactProfile & { url: string }>;
```

### getSlots()

Liefert beim Build die im CRM überschriebenen Texte, je Slot-Schlüssel.
Für die Ausgabe im Markup ist `<Text>` der einfachere Weg.

```ts
const slots = await getSlots();
const titel = slots['start.hero.titel']?.value ?? 'Wir kaufen Ihr Haus';
```

```ts
async function getSlots(): Promise<Partial<Record<SlotKey, SlotOverride>>>;
```

### sitemap()

Erzeugt beim Build die `sitemap.xml` mit allen Seiten, auch den Detailseiten
der Sammlungen. Gehört in `src/routes/sitemap.xml/+server.ts` — eine der zwei
erlaubten `+server.ts`-Dateien.

```ts
// src/routes/sitemap.xml/+server.ts
import { sitemap } from '@dealsystem/site/content';

export const prerender = true;

export const GET = () => sitemap();
```

```ts
async function sitemap(): Promise<Response>;
```

### robots()

Erzeugt beim Build die `robots.txt` mit dem Verweis auf die Sitemap. Hat der
Kunde im CRM „Nicht bei Google anzeigen“ gewählt, fehlt der Verweis; ein
`Disallow` steht trotzdem nicht darin, sonst sähe Google das `noindex` der
Seiten nie. Gehört
in `src/routes/robots.txt/+server.ts` — eine der zwei erlaubten
`+server.ts`-Dateien.

```ts
// src/routes/robots.txt/+server.ts
import { robots } from '@dealsystem/site/content';

export const prerender = true;

export const GET = () => robots();
```

```ts
function robots(): Response;
```

## Typen

### CollectionQuery

Auswahl und Reihenfolge für `getCollection`.

```ts
interface CollectionQuery {
	/** Höchstzahl der Einträge. Ohne Angabe alle. */
	limit?: number;
	/** So viele Einträge überspringen. */
	offset?: number;
	/** `newest` (Standard): zuletzt veröffentlichte zuerst. */
	sort?: 'newest' | 'oldest';
}
```

### CollectionEntry

Ein veröffentlichter Eintrag einer Sammlung.

```ts
interface CollectionEntry<K extends string = string> {
	slug: string;
	/** ISO-Zeitstempel der Veröffentlichung. */
	publishedAt: string;
	data: EntryData<K>;
	media: EntryMedia<K>;
}
```

### MediaRef

Verweis auf ein Medium aus dem CRM. Form laut Site-API v1.

```ts
interface MediaRef {
	id: string;
	kind: 'image' | 'video' | 'file';
	/** Alternativtext aus dem CMS. Leer heißt: dekorativ. */
	alt: string;
	width: number | null;
	height: number | null;
	variants: MediaVariant[];
	video?: { provider: 'bunny'; playbackUrl: string; posterUrl: string };
	/** Nur bei `kind: 'file'`. */
	url?: string;
}
```

### SafeHtml

HTML, das der DealSystem-Server schon geprüft und bereinigt hat (Richtext
aus dem CMS). Eine gewöhnliche Zeichenkette ist kein `SafeHtml`. Ausgabe nur
über `<RichText content={…} />`, nie mit `{@html}`.

```ts
type SafeHtml = string & { readonly [safeHtml]: true };
```

### ContactProfile

Firmendaten der Seite für Ausweichkontakt und strukturierte Daten. Leere Zeichenkette = fehlt.

```ts
interface ContactProfile {
	company: string;
	/** Optional. */
	address: string;
	email: string;
	/** Optional: nicht jeder Kunde veröffentlicht eine Telefonnummer. */
	phone: string;
}
```
