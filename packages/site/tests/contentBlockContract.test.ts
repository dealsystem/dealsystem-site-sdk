// Vertrag des Inhaltsblocks: Schema und Beispiele unter contract/, gegen die auch der Core testet.
import Ajv2020 from 'ajv/dist/2020.js';
import { render } from 'svelte/server';
import blockSchema from '../contract/content-block.v1.schema.json' with { type: 'json' };
import fixture from '../contract/content-block.v1.fixture.json' with { type: 'json' };
import patchSchema from '../contract/content-patch.v1.schema.json' with { type: 'json' };
import SiteHead from '../src/lib/components/SiteHead.svelte';
import {
	CONTENT_BLOCK_PATTERN,
	contentBlockTag,
	parseContentBlock,
	type ContentBlock,
} from '../src/lib/contentBlock.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { buildContentPatchInfo } from '../src/lib/vite/index.js';
import { testSiteData } from './helpers.js';

const ajv = new Ajv2020({ strict: false });
const validBlock = ajv.compile(blockSchema);
const validPatch = ajv.compile(patchSchema);

describe('contract/content-block.v1', () => {
	it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
		expect(validBlock(c.block), JSON.stringify(validBlock.errors)).toBe(true);
		// Erzeugt das SDK genau dieses Element? (Sonst: Beispiele mit dem Generator neu schreiben.)
		expect(contentBlockTag(c.block as ContentBlock)).toBe(c.tag);
		const inner = [...c.tag.matchAll(CONTENT_BLOCK_PATTERN)];
		expect(inner).toHaveLength(1);
		expect(inner[0]![1]).not.toMatch(/[<>&\u2028\u2029]/);
		expect(parseContentBlock(inner[0]![1])).toEqual(c.block);
	});

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

describe('contract/content-patch.v1', () => {
	it('passt zu dem, was das Vite-Plugin ins Manifest schreibt', () => {
		for (const collected of [
			{ siteHeadInRootLayout: true, readsSlotsInCode: false },
			{ siteHeadInRootLayout: false, readsSlotsInCode: true },
		]) {
			const info = buildContentPatchInfo(collected, [{ key: 'a.b', type: 'richtext', default: '**x**' }]);
			expect(validPatch(info), JSON.stringify(validPatch.errors)).toBe(true);
		}
		expect(validPatch({ version: 1, delivery: 'dom', blockers: [] })).toBe(false);
		expect(validPatch({ version: 1, delivery: 'patch', blockers: [], richtextDefaults: {} })).toBe(false);
	});
});
