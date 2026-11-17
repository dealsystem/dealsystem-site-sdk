import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { defaultRichtextToHtml } from '../src/lib/richtext/server.js';
import { mergeSlots, routeOfFile, scanSlots, SlotScanError } from '../src/lib/vite/scan.js';

const page = (markup: string, imports = 'Text, RichText, MediaImage, Link') => `<script lang="ts">
	import { ${imports} } from '@dealsystem/site';
	import hero from './hero.jpg?enhanced';
	let name: string = $state('x');
</script>

${markup}
`;

describe('scanSlots', () => {
	it('liest Schlüssel, Typ, Standard und Zusatzangaben', () => {
		const slots = scanSlots(
			page(`<main>
	<Text key="start.hero.titel" default="Wir kaufen Ihr Haus" as="h1" label="Überschrift" group="Startseite" maxLength={80} />
	{#if name}
		<Text key="start.hero.text" default={\`Zeile 1
Zeile 2\`} multiline help="Zwei Zeilen" aliases={['start.text', 'start.intro']} />
	{/if}
	<RichText key="start.ueber-uns" default="Wir sind **da**." />
	<MediaImage key="start.hero.bild" default={hero} alt="Haus" label="Titelbild" />
</main>`),
			'src/routes/+page.svelte',
		);

		expect(slots).toEqual([
			{
				key: 'start.hero.titel',
				type: 'text',
				default: 'Wir kaufen Ihr Haus',
				label: 'Überschrift',
				group: 'Startseite',
				maxLength: 80,
				route: '/',
				file: 'src/routes/+page.svelte',
				line: 8,
			},
			{
				key: 'start.hero.text',
				type: 'textarea',
				default: 'Zeile 1\nZeile 2',
				help: 'Zwei Zeilen',
				aliases: ['start.text', 'start.intro'],
				route: '/',
				file: 'src/routes/+page.svelte',
				line: 10,
			},
			{
				key: 'start.ueber-uns',
				type: 'richtext',
				default: 'Wir sind **da**.',
				route: '/',
				file: 'src/routes/+page.svelte',
				line: 13,
			},
			{
				key: 'start.hero.bild',
				type: 'image',
				default: null,
				label: 'Titelbild',
				route: '/',
				file: 'src/routes/+page.svelte',
				line: 14,
			},
		]);
	});

	it('liest Link-Slots und required', () => {
		const slots = scanSlots(
			page(`<Link key="start.hero.knopf" default={{ href: '/kontakt', label: "Kontakt aufnehmen", newTab: true }} label="Schaltfläche" />
<Text key="start.pflicht" default="x" required />`),
			'src/lib/Hero.svelte',
		);
		expect(slots.map(({ file: _f, line: _l, ...slot }) => slot)).toEqual([
			{
				key: 'start.hero.knopf',
				type: 'link',
				default: { href: '/kontakt', label: 'Kontakt aufnehmen', newTab: true },
				label: 'Schaltfläche',
			},
			{ key: 'start.pflicht', type: 'text', default: 'x', required: true },
		]);
	});

	it('überspringt Komponenten ohne key und gleichnamige fremde Komponenten', () => {
		expect(
			scanSlots(page('<MediaImage src={hero} alt="x" /><RichText content={null} />'), 'src/lib/A.svelte'),
		).toEqual([]);
		const fremd = `<script>import Text from './Text.svelte';</script><Text key="a.b" default="x" />`;
		expect(scanSlots(fremd, 'src/lib/B.svelte')).toEqual([]);
	});

	it('folgt umbenannten Importen und findet Slots in Snippets', () => {
		const code = `<script>import { Text as T, CollectionList } from '@dealsystem/site';</script>
<CollectionList collection="angebote">
	{#snippet item(e)}<T key="liste.mehr" default="Mehr" />{/snippet}
</CollectionList>`;
		const slots = scanSlots(code, 'src/lib/Liste.svelte');
		expect(slots.map((s) => s.key)).toEqual(['liste.mehr']);
		expect(slots[0]).not.toHaveProperty('route');
	});

	it.each([
		['<Text key={name} default="x" />', /key muss eine feste Zeichenkette sein/],
		['<Text key="start.{name}" default="x" />', /key muss eine feste Zeichenkette sein/],
		['<Text key="Start.Titel" default="x" />', /Der Schlüssel "Start\.Titel" ist ungültig/],
		['<Text key="titel" default="x" />', /ist ungültig/],
		['<Text key="start.titel" />', /default fehlt/],
		['<Text key="start.titel" default={name} />', /default muss eine feste Zeichenkette sein/],
		['<Text key="start.titel" default="x" label={name} />', /label muss eine feste Zeichenkette sein/],
		['<Text key="start.titel" default="x" aliases={alte} />', /aliases muss eine feste Liste sein/],
		['<Text {...props} />', /verwendet \{\.\.\.props\}/],
		['<Link key="start.knopf" default={{ href: name, label: "x" }} />', /festes Objekt mit href und label/],
		['<Link key="start.knopf" default="/kontakt" />', /festes Objekt mit href und label/],
	])('lehnt %s mit Fundstelle ab', (markup, message) => {
		let error: unknown;
		try {
			scanSlots(page(markup), 'src/routes/+page.svelte');
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(SlotScanError);
		expect((error as SlotScanError).message).toMatch(message);
		expect((error as SlotScanError).message).toContain('src/routes/+page.svelte:7');
	});

	it('überlässt Syntaxfehler dem Svelte-Compiler', () => {
		expect(scanSlots(page('<Text key="a.b" default="x"'), 'src/x.svelte')).toEqual([]);
	});
});

describe('mergeSlots', () => {
	const slot = (over: object = {}) => ({
		key: 'start.titel',
		type: 'text' as const,
		default: 'A',
		file: 'src/a.svelte',
		line: 1,
		...over,
	});

	it('führt gleiche Slots zusammen, sortiert und entfernt die Fundstelle', () => {
		const merged = mergeSlots([slot({ key: 'z.z' }), slot(), slot({ file: 'src/b.svelte' })]);
		expect(merged).toEqual([
			{ key: 'start.titel', type: 'text', default: 'A' },
			{ key: 'z.z', type: 'text', default: 'A' },
		]);
	});

	it('lehnt denselben Schlüssel mit anderem Typ oder anderem Standardtext ab', () => {
		expect(() => mergeSlots([slot(), slot({ type: 'richtext', file: 'src/b.svelte', line: 9 })])).toThrow(
			/src\/b\.svelte:9.*schon in src\/a\.svelte:1.*als text, hier als richtext/,
		);
		expect(() => mergeSlots([slot(), slot({ default: 'B' })])).toThrow(/anderen Standardwert/);
	});
});

describe('routeOfFile', () => {
	it.each([
		['src/routes/+page.svelte', '/'],
		['src/routes/+layout.svelte', '/'],
		['src/routes/angebote/[slug]/+page.svelte', '/angebote/[slug]'],
		['src/routes/(marketing)/ueber-uns/+page@.svelte', '/ueber-uns'],
		['src/lib/Hero.svelte', undefined],
	])('%s → %s', (file, route) => {
		expect(routeOfFile(file)).toBe(route);
	});
});

describe('mehrzeilige Standardtexte (Beispiele aus komponenten.md)', () => {
	/** Das Beispiel mit `default={'…'}` aus dem `@component`-Kommentar, genau wie es in der Anleitung steht. */
	function example(component: string): string {
		const source = readFileSync(
			new URL(`../src/lib/components/${component}.svelte`, import.meta.url),
			'utf8',
		);
		const block = [...source.matchAll(/```svelte\n([\s\S]*?)```/g)]
			.map((m) => m[1]!)
			.find((code) => code.includes("default={'"));
		if (!block) throw new Error(`${component}.svelte hat kein Beispiel für mehrzeilige Standardtexte.`);
		return block;
	}

	it('<RichText>: das Beispiel kompiliert und wird zu Liste und Absatz', () => {
		const code = page(example('RichText'));
		expect(() => compile(code, { generate: 'server' })).not.toThrow();
		const [slot] = scanSlots(code, 'src/routes/ankauf/+page.svelte');
		expect(slot?.default).toContain('\n2. Wir prüfen');
		const html = defaultRichtextToHtml(slot!.default as string);
		expect(html).toMatch(/^<ol>\s*<li>Sie schicken uns die Eckdaten\.<\/li>/);
		expect(html.match(/<li>/g)).toHaveLength(3);
		expect(html).toContain('<p>Der Ablauf ist für Sie kostenlos.</p>');
		expect(html).not.toContain('\\n');
	});

	it('<Text multiline>: das Beispiel kompiliert und behält die Zeilen', () => {
		const code = page(example('Text'));
		expect(() => compile(code, { generate: 'server' })).not.toThrow();
		const [slot] = scanSlots(code, 'src/routes/kontakt/+page.svelte');
		expect(slot).toMatchObject({ type: 'textarea', default: 'Mo bis Fr 9 bis 18 Uhr\nSa nach Vereinbarung' });
	});

	it('in Anführungszeichen bleibt \\n ein Backslash mit n (deshalb warnt CNT-003)', () => {
		const [slot] = scanSlots(
			page('<RichText key="ankauf.ablauf" default="1. Eins\\n2. Zwei" />'),
			'src/routes/+page.svelte',
		);
		expect(slot?.default).toBe('1. Eins\\n2. Zwei');
	});
});
