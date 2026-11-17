// Typ-Tests: diese Datei wird nur geprüft, nie ausgeführt. Jedes
// `@ts-expect-error` muss einen echten Fehler treffen, sonst schlägt `check` fehl.
import { defineSite } from '../../src/lib/config/index.js';
import { getCollection, getEntry } from '../../src/lib/content/index.js';
import { loadCollection } from '../../src/lib/index.js';
import type { CollectionKey, FunnelKey, MediaRef, RichTextContent } from '../../src/lib/index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T | void => undefined;

// Schlüssel kommen aus dealsystem.config.ts.
assert<Equal<FunnelKey, 'kontakt'>>();
assert<Equal<CollectionKey, 'angebote'>>();

// Einträge sind nach den Feldern der Sammlung typisiert.
const angebote = await getCollection('angebote');
const erstes = angebote[0]!;
assert<Equal<typeof erstes.data.titel, string>>();
assert<Equal<typeof erstes.data.preis, number | null>>();
assert<Equal<typeof erstes.data.beschreibung, RichTextContent | null>>();
assert<Equal<typeof erstes.media.bilder, MediaRef[]>>();
// @ts-expect-error Bilder stehen unter media, nicht unter data
void erstes.data.bilder;
// @ts-expect-error unbekanntes Feld
void erstes.data.title;

// @ts-expect-error Tippfehler im Schlüssel der Sammlung
await getCollection('angebot');
// @ts-expect-error Tippfehler im Schlüssel der Sammlung
await getEntry('angebte', 'x');
// @ts-expect-error Tippfehler im Schlüssel der Sammlung
await loadCollection('blog');

// Ergebnisse der Site-API sind eine Unterscheidung, kein Throw.
const loaded = await loadCollection('angebote');
if (loaded.ok) void loaded.data.entries[0]?.data.titel;
else void loaded.error.kind;
// @ts-expect-error ohne Prüfung von ok gibt es keine Daten
void loaded.data;

// defineSite prüft Feldtypen und Standardfelder.
defineSite({
	siteId: 's',
	// @ts-expect-error unbekannter Feldtyp
	funnels: { kontakt: { label: 'K', fields: [{ name: 'email', type: 'mail' }] } },
});
defineSite({
	siteId: 's',
	// @ts-expect-error unbekanntes Standardfeld
	funnels: { kontakt: { label: 'K', fields: [{ name: 'n', type: 'text', standardField: 'name' }] } },
});
// @ts-expect-error siteId fehlt
defineSite({ funnels: {} });
defineSite({
	siteId: 's',
	// @ts-expect-error Quelle "object" gibt es noch nicht
	collections: { a: { source: 'object', label: 'A', route: '/a/:slug', fields: [] } },
});
