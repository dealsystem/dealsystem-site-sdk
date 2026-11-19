// `position` der Slots: Reihenfolge des ersten Vorkommens beim Rendern, statisch aus dem Quelltext.
import { slotOrder, slotPositions, type OrderInput } from '../src/lib/vite/order.js';
import { scanSlots } from '../src/lib/vite/scan.js';

const file = (path: string, markup: string, imports = ''): OrderInput => {
	const code = `<script lang="ts">
	import { Text, RichText, MediaImage } from '@dealsystem/site';
	${imports}
	let { children } = $props();
</script>
${markup}`;
	return { file: path, code, slots: scanSlots(code, path) };
};

const text = (key: string) => `<Text key="${key}" default="x" />`;

/** Schlüssel nach Position. */
const ordered = (inputs: OrderInput[]) =>
	[...slotPositions(inputs).entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);

const project = (): OrderInput[] => [
	file(
		'src/routes/+layout.svelte',
		`<header>${text('kopf.titel')}</header>
<main>{@render children()}</main>
<footer>${text('fuss.text')}</footer>`,
	),
	file(
		'src/routes/+page.svelte',
		`${text('start.titel')}
<Hero />
{#if zeigen}${text('start.wenn')}{/if}
{#each liste as eintrag (eintrag)}${text('start.liste')}{/each}
<Karte />`,
		`import Hero from '$lib/Hero.svelte';
	import Karte from './Karte.svelte';`,
	),
	file('src/lib/Hero.svelte', `${text('hero.titel')}<RichText key="hero.text" default="y" />`),
	file('src/routes/Karte.svelte', text('karte.titel')),
	file(
		'src/routes/kontakt/+page.svelte',
		`${text('kontakt.titel')}<Hero />${text('kontakt.text')}`,
		`import Hero from '$lib/Hero.svelte';`,
	),
	file('src/routes/+error.svelte', text('fehler.titel')),
	file('src/lib/Ungenutzt.svelte', text('ungenutzt.titel')),
];

describe('slotPositions', () => {
	it('folgt dem Rendern: Layout-Kopf, Seite mit Komponenten an ihrer Stelle, Layout-Fuß, dann die nächste Route', () => {
		expect(ordered(project())).toEqual([
			'kopf.titel',
			'start.titel',
			'hero.titel',
			'hero.text',
			'start.wenn',
			'start.liste',
			'karte.titel',
			'fuss.text',
			// `/kontakt`: Kopf, Hero und Fuß stehen schon (erste Route zählt).
			'kontakt.titel',
			'kontakt.text',
			// Von keiner Route erreichbar: nach Datei, dann Stelle.
			'ungenutzt.titel',
			'fehler.titel',
		]);
	});

	it('vergibt 1 bis n lückenlos und eindeutig, für jeden Slot', () => {
		const positions = slotPositions(project());
		expect([...positions.values()].sort((a, b) => a - b)).toEqual(
			Array.from({ length: positions.size }, (_, i) => i + 1),
		);
		expect(positions.size).toBe(12);
	});

	it('ist unabhängig von der Reihenfolge, in der die Dateien gelesen werden', () => {
		const inputs = project();
		expect(slotPositions([...inputs].reverse())).toEqual(slotPositions(inputs));
	});

	it('ordnet Routen wie manifest.routes, nicht nach Dateinamen; Gruppen-Layouts gelten', () => {
		const inputs = [
			file('src/routes/(shop)/+layout.svelte', `${text('shop.kopf')}{@render children()}`),
			file('src/routes/(shop)/zubehoer/+page.svelte', text('zubehoer.titel')),
			file('src/routes/angebote/+page.svelte', text('angebote.titel')),
			file('src/routes/+page.svelte', text('start.titel')),
		];
		expect(ordered(inputs)).toEqual(['start.titel', 'angebote.titel', 'shop.kopf', 'zubehoer.titel']);
	});

	it('Layout ohne {@render children()}: die Seite zählt trotzdem, hinter dem Layout', () => {
		const inputs = [
			file('src/routes/+layout.svelte', text('kopf.titel')),
			file('src/routes/+page.svelte', text('start.titel')),
		];
		expect(ordered(inputs)).toEqual(['kopf.titel', 'start.titel']);
	});

	it('erste Route nur für Komponenten einer Seite; Layout und seine Komponenten (Kopf, Fußzeile) bekommen keine', () => {
		const inputs = [
			...project(),
			file(
				'src/routes/kontakt/+layout.svelte',
				`<Navi />{@render children()}`,
				`import Navi from '$lib/Navi.svelte';`,
			),
			file('src/lib/Navi.svelte', text('navi.titel')),
		];
		const { firstRoutes } = slotOrder(inputs);
		expect(Object.fromEntries(firstRoutes)).toEqual({
			// Seite und Komponenten der Seite: erste Route (Hero auch auf /kontakt, zählt /).
			'start.titel': '/',
			'start.wenn': '/',
			'start.liste': '/',
			'hero.titel': '/',
			'hero.text': '/',
			'karte.titel': '/',
			'kontakt.titel': '/kontakt',
			'kontakt.text': '/kontakt',
		});
		// navi.*, kopf.*, fuss.*: nur aus Layouts erreicht; fehler.*, ungenutzt.*: von keiner Route.
	});

	it('Komponenten, die sich gegenseitig einbinden, führen nicht in eine Schleife', () => {
		const inputs = [
			file('src/routes/+page.svelte', '<A />', `import A from '$lib/A.svelte';`),
			file('src/lib/A.svelte', `${text('a.titel')}<B />`, `import B from './B.svelte';`),
			file('src/lib/B.svelte', `${text('b.titel')}<A />`, `import A from './A.svelte';`),
		];
		expect(ordered(inputs)).toEqual(['a.titel', 'b.titel']);
	});
});

describe('collectSlots: position und route im Manifest', () => {
	it('route aus der Datei bleibt, Komponenten einer Seite bekommen die erste Route, Layout-Komponenten keine', async () => {
		const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const { collectSlots } = await import('../src/lib/vite/index.js');
		const root = await mkdtemp(join(tmpdir(), 'ds-order-'));
		try {
			const write = async (path: string, input: OrderInput) => {
				await mkdir(join(root, path, '..'), { recursive: true });
				await writeFile(join(root, path), input.code);
			};
			await write(
				'src/routes/+layout.svelte',
				file('', `<Kopf />{@render children()}`, `import Kopf from '$lib/Kopf.svelte';`),
			);
			await write('src/lib/Kopf.svelte', file('', text('kopf.titel')));
			await write(
				'src/routes/kontakt/+page.svelte',
				file('', `${text('kontakt.titel')}<Hero />`, `import Hero from '$lib/Hero.svelte';`),
			);
			await write('src/lib/Hero.svelte', file('', text('hero.titel')));
			const { slots } = await collectSlots(root);
			expect(slots.map(({ key, route, position }) => ({ key, route, position }))).toEqual([
				{ key: 'hero.titel', route: '/kontakt', position: 3 },
				{ key: 'kontakt.titel', route: '/kontakt', position: 2 },
				{ key: 'kopf.titel', route: undefined, position: 1 },
			]);
			expect(slots.find((s) => s.key === 'kopf.titel')).not.toHaveProperty('route');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
