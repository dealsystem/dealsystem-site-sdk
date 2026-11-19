// Vertrag `position` und `route` der Content-Slots: `contract/slot-order.v1.json`. Der Core übernimmt das Beispiel in
// seinen Test (Lesen über `normalizeSelfSiteSlotDefinition`, Sortieren in `groupSelfSiteSlots`).
// Neu schreiben: UPDATE_CONTRACT=1 npx vitest run tests/slotOrderContract.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectSlots } from '../src/lib/vite/index.js';

const FILE = new URL('../contract/slot-order.v1.json', import.meta.url);

const script = (extra = '') =>
	`<script lang="ts">\n\timport { Text, RichText } from '@dealsystem/site';\n${extra}\tlet { children } = $props();\n</script>\n`;

/** Kleines Projekt: Layout mit Kopf, Startseite und Kontakt mit gemeinsamer Hero-Komponente, Fehlerseite. */
const FILES: Record<string, string> = {
	'src/routes/+layout.svelte': `${script("\timport Kopf from '$lib/Kopf.svelte';\n")}<Kopf />
<main>{@render children()}</main>
<footer><Text key="fuss.text" default="© Muster GmbH" /></footer>
`,
	'src/lib/Kopf.svelte': `${script()}<Text key="kopf.titel" default="Muster GmbH" />
`,
	'src/routes/+page.svelte': `${script("\timport Hero from '$lib/Hero.svelte';\n")}<Text key="start.titel" default="Willkommen" as="h1" />
<Hero />
<RichText key="start.ueber-uns" default="Seit **2010** für Sie da." />
`,
	'src/lib/Hero.svelte': `${script()}<Text key="hero.titel" default="Wir helfen schnell" />
<Text key="hero.text" default="Rufen Sie an." />
`,
	'src/routes/kontakt/+page.svelte': `${script("\timport Hero from '$lib/Hero.svelte';\n")}<Text key="kontakt.titel" default="Kontakt" as="h1" />
<Hero />
`,
	'src/routes/+error.svelte': `${script()}<Text key="fehler.titel" default="Seite nicht gefunden" />
`,
};

async function generate() {
	const root = await mkdtemp(join(tmpdir(), 'ds-slot-order-'));
	try {
		for (const [path, code] of Object.entries(FILES)) {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await writeFile(join(root, path), code);
		}
		const { slots, routes } = await collectSlots(root);
		return {
			$comment:
				'Vertrag position und route der Content-Slots (manifest.slots, manifestVersion 1). Quelle: SDK, erzeugt von packages/site/tests/slotOrderContract.test.ts (UPDATE_CONTRACT=1). Der Core übernimmt example in seinen Test.',
			rules: {
				position: [
					'Ganzzahl ab 1, lückenlos und eindeutig, an jedem Eintrag von manifest.slots (flach neben key und type). Höchstens so groß wie die Zahl der Slots (Core-Grenze 2000).',
					'Reihenfolge des ersten Vorkommens beim Rendern, statisch aus dem Quelltext: Routen in der Reihenfolge von manifest.routes; je Route Layouts von außen nach innen, die Seite an der Stelle von {@render children()}, eigene Komponenten ($lib/…, relative .svelte-Importe) an der Stelle ihrer Verwendung. Kommt ein Slot auf mehreren Seiten vor, zählt die erste.',
					'Slots, die keine Route erreicht (+error.svelte, nicht eingebundene Komponenten), folgen danach in Datei- und Quelltext-Reihenfolge.',
					'Die Liste manifest.slots bleibt nach Schlüssel sortiert (ds-content.v1 bindet die Richtext-Reihenfolge daran). Sortiert wird nach position.',
					'Ein älteres SDK schickt kein position: dann gilt die Reihenfolge wie bisher.',
				],
				route: [
					'Slot direkt in einer +page- oder +layout-Datei: deren Route (ein Slot im Haupt-Layout also /).',
					'Slot in einer Komponente, die eine Seite einbindet (auch über weitere Komponenten): die erste Route, in der er vorkommt.',
					'Ohne route: Slots in Komponenten, die nur ein Layout einbindet (Kopf, Fußzeile, Navigation), und Slots, die keine Route erreicht.',
				],
			},
			example: { files: FILES, manifest: { routes, slots } },
		};
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const generated = await generate();
if (process.env.UPDATE_CONTRACT) writeFileSync(FILE, `${JSON.stringify(generated, null, '\t')}\n`);
const contract = JSON.parse(readFileSync(FILE, 'utf8')) as typeof generated;

describe('Vertrag slot-order.v1', () => {
	it('die Datei passt zum SDK (sonst: UPDATE_CONTRACT=1)', () => {
		expect(contract).toEqual(generated);
	});

	it('zeigt position und route an Komponenten-Slots, wie mit inhalte-editor vereinbart', () => {
		const bySlot = Object.fromEntries(
			contract.example.manifest.slots.map((s) => [s.key, { position: s.position, route: s.route ?? null }]),
		);
		expect(contract.example.manifest.routes).toEqual(['/', '/kontakt']);
		expect(bySlot).toEqual({
			'kopf.titel': { position: 1, route: null }, // Komponente im Layout: keine Route
			'start.titel': { position: 2, route: '/' },
			'hero.titel': { position: 3, route: '/' }, // Komponente der Startseite, auch auf /kontakt: erste Route
			'hero.text': { position: 4, route: '/' },
			'start.ueber-uns': { position: 5, route: '/' },
			'fuss.text': { position: 6, route: '/' }, // direkt im Haupt-Layout: Route der Datei
			'kontakt.titel': { position: 7, route: '/kontakt' },
			'fehler.titel': { position: 8, route: null }, // von keiner Route erreicht
		});
		// Die Liste selbst bleibt nach Schlüssel sortiert.
		const keys = contract.example.manifest.slots.map((s) => s.key);
		expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
	});
});
