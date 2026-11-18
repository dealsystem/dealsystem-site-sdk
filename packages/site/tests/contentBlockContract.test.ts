// Vertrag ds-content Fassung 1: `contract/ds-content.v1.json`. Der Core hält eine byte-gleiche Kopie und
// prüft seinen Patcher dagegen. Neu schreiben: UPDATE_CONTRACT=1 npx vitest run tests/contentBlockContract.test.ts
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { render } from 'svelte/server';
import SiteHead from '../src/lib/components/SiteHead.svelte';
import {
	CONTENT_BLOCK_PATTERN,
	contentBlockTag,
	parseContentBlock,
	type ContentBlock,
} from '../src/lib/contentBlock.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import type { ContentSlotDef } from '../src/lib/types.js';
import { buildContentPatchInfo } from '../src/lib/vite/index.js';
import { testSiteData } from './helpers.js';
import { buildContract } from './reference/contract.js';

const FILE = new URL('../contract/ds-content.v1.json', import.meta.url);
const generated = buildContract();
if (process.env.UPDATE_CONTRACT) writeFileSync(FILE, `${JSON.stringify(generated, null, '\t')}\n`);
const contract = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof buildContract>;

const ajv = new Ajv2020({ strict: false });
const validBlock = ajv.compile(contract.element.schema);
const validPatch = ajv.compile(contract.contentPatch.schema);

it('die Datei passt zum SDK (sonst: UPDATE_CONTRACT=1)', () => {
	expect(contract).toEqual(JSON.parse(JSON.stringify(generated)));
});

describe('Element', () => {
	it.each(contract.element.examples.map((e, i) => [i, e] as const))(
		'Beispiel %i',
		(_i, { block, element }) => {
			expect(validBlock(block), JSON.stringify(validBlock.errors)).toBe(true);
			expect(contentBlockTag(block as ContentBlock)).toBe(element);
			const inner = [...element.matchAll(new RegExp(contract.element.pattern, 'g'))];
			expect(inner).toHaveLength(1);
			expect(inner[0]![1]).not.toMatch(/[<>&\u2028\u2029]/);
			expect(parseContentBlock(inner[0]![1])).toEqual(block);
		},
	);

	it('<SiteHead> schreibt genau einen Block, der zum Schema passt', () => {
		setSiteDataForTests(
			testSiteData({
				slots: { 'a.b': { type: 'text', value: '</script>' } },
				richtext: { 'a.c': '<p>x</p>' },
			}),
		);
		try {
			const { head } = render(SiteHead, { props: { favicon: '/favicon.svg' } });
			const blocks = [...head.matchAll(CONTENT_BLOCK_PATTERN)];
			expect(blocks).toHaveLength(1);
			expect(validBlock(JSON.parse(blocks[0]![1]!))).toBe(true);
		} finally {
			setSiteDataForTests(null);
		}
	});

	it('Schema lehnt fremde Felder und falsche Fassung ab', () => {
		expect(validBlock({ v: 2, slots: {}, richtext: {} })).toBe(false);
		expect(validBlock({ v: 1, slots: {}, richtext: {}, script: 'x' })).toBe(false);
		expect(validBlock({ v: 1, slots: { a: { type: 'script' } }, richtext: {} })).toBe(false);
		expect(validBlock({ v: 1, slots: {}, richtext: { a: 1 } })).toBe(false);
	});
});

describe('contentPatch im Manifest', () => {
	const richtext = (n: number, length: number): ContentSlotDef[] =>
		Array.from({ length: n }, (_, i) => ({ key: `s.r${i}`, type: 'richtext', default: 'x'.repeat(length) }));

	it('passt zum Schema, auch mit Blockern', () => {
		for (const collected of [
			{ siteHeadInRootLayout: true, readsSlotsInCode: false },
			{ siteHeadInRootLayout: false, readsSlotsInCode: true },
		]) {
			const info = buildContentPatchInfo(collected, richtext(1, 10));
			expect(validPatch(info), JSON.stringify(validPatch.errors)).toBe(true);
		}
		expect(validPatch({ format: 1, delivery: 'dom', blockers: [] })).toBe(false);
		expect(validPatch({ format: 1, delivery: 'patch', blockers: [], richtextDefaults: {} })).toBe(false);
		expect(validPatch({ version: 1, delivery: 'dom', blockers: [], richtextDefaults: {} })).toBe(false);
	});

	it('über 2 MB Richtext-Standard: Blocker statt Riesen-Manifest, der Build läuft weiter', () => {
		// 150 × 15 000 Zeichen ≈ 2,2 MB HTML
		const info = buildContentPatchInfo(
			{ siteHeadInRootLayout: true, readsSlotsInCode: false },
			richtext(150, 15_000),
		);
		expect(info.blockers).toEqual(['richtext-defaults-too-large']);
		expect(info.richtextDefaults).toEqual({});
		expect(info.delivery).toBe('dom');
		expect(validPatch(info)).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(info))).toBeLessThan(1024);
	});

	it('knapp unter 2 MB bleibt patchbar', () => {
		const info = buildContentPatchInfo(
			{ siteHeadInRootLayout: true, readsSlotsInCode: false },
			richtext(130, 15_000),
		);
		expect(info.blockers).toEqual([]);
		expect(Object.keys(info.richtextDefaults)).toHaveLength(130);
		expect(Buffer.byteLength(JSON.stringify(info.richtextDefaults))).toBeLessThan(
			contract.contentPatch.limits.richtextDefaultsTotalBytes + 10_000,
		);
	});
});

describe('Fälle', () => {
	it('decken jeden Slot-Typ, XSS und jede Grenze ab', () => {
		const names = contract.cases.map((c) => c.name).join('\n');
		expect(names).toMatch(/Richtext/);
		expect(names).toMatch(/Bild/);
		expect(names).toMatch(/XSS/);
		const blocked = contract.cases.flatMap((c) => ('blockers' in c ? c.blockers : []));
		expect(new Set(blocked)).toEqual(new Set(Object.keys(contract.patchBlockers)));
	});

	it('jede Seite „nachher“ trägt genau einen Block mit den neuen Werten, nie ein ausführbares Fremdskript', () => {
		for (const c of contract.cases) {
			if (!('after' in c)) continue;
			for (const [path, html] of Object.entries(c.after)) {
				if (!path.endsWith('.html') || (!html.includes('kit.start(') && !html.includes('data-ds-slot')))
					continue;
				const blocks = [...html.matchAll(new RegExp(contract.element.pattern, 'g'))];
				expect(blocks, `${c.name} ${path}`).toHaveLength(1);
				expect(validBlock(JSON.parse(blocks[0]![1]!))).toBe(true);
				expect(html).not.toMatch(/<img src=x|onerror="alert|<script>alert/);
			}
		}
	});
});
