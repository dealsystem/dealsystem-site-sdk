// Inhaltsblock: Texte aus dem CRM stehen im HTML, nicht im JS-Bundle.
import { CONTENT_BLOCK_PATTERN, contentBlockTag, parseContentBlock } from '../src/lib/contentBlock.js';
import { buildContentPatchInfo, clientSiteDataModule, usesSiteHead } from '../src/lib/vite/index.js';
import { testSiteData } from './helpers.js';

describe('Inhaltsblock', () => {
	it('übersteht jeden Wert und lässt sich genau einmal finden', () => {
		const value = '</script><!-- <script> &   "x"';
		const tag = contentBlockTag({
			v: 1,
			slots: { 'a.b': { type: 'text', value } },
			richtext: { 'a.c': '<p>x</p>' },
		});
		const matches = [...`<head>${tag}</head>`.matchAll(CONTENT_BLOCK_PATTERN)];
		expect(matches).toHaveLength(1);
		const block = parseContentBlock(matches[0]![1]);
		expect(block!.slots['a.b']!.value).toBe(value);
		expect(block!.richtext['a.c']).toBe('<p>x</p>');
	});

	it('verwirft Unlesbares: dann gelten die Standardwerte', () => {
		expect(parseContentBlock('{kaputt')).toBeNull();
		expect(parseContentBlock('{"v":2,"slots":{}}')).toBeNull();
		expect(
			parseContentBlock('{"v":1,"slots":{"a":1,"b":{"type":"text","value":"x"}},"richtext":{"c":3}}'),
		).toEqual({
			v: 1,
			slots: { b: { type: 'text', value: 'x' } },
			richtext: {},
		});
	});
});

describe('Bundle für den Browser', () => {
	it('enthält keine Texte aus dem CRM, aber alles andere', () => {
		const data = testSiteData({
			slots: { 'start.titel': { type: 'text', value: 'GEHEIMER-CRM-TEXT' } },
			richtext: { 'start.ueber': '<p>CRM-RICHTEXT</p>' },
		});
		const code = clientSiteDataModule(data);
		expect(code).not.toContain('GEHEIMER-CRM-TEXT');
		expect(code).not.toContain('CRM-RICHTEXT');
		expect(code).toContain('dsp_TEST1234');
		expect(code).toContain('document.getElementById(CONTENT_BLOCK_ID)');
	});
});

describe('Manifest: contentPatch', () => {
	it('dom nur mit <SiteHead> im Haupt-Layout, getSlots verhindert das Patchen', () => {
		expect(buildContentPatchInfo({ siteHeadInRootLayout: true, readsSlotsInCode: false }, [])).toEqual({
			format: 1,
			delivery: 'dom',
			blockers: [],
			richtextDefaults: {},
		});
		expect(buildContentPatchInfo({ siteHeadInRootLayout: false, readsSlotsInCode: true }, [])).toMatchObject({
			delivery: 'embedded',
			blockers: ['site-head-missing', 'get-slots'],
		});
		expect(
			buildContentPatchInfo({ siteHeadInRootLayout: true, readsSlotsInCode: false }, [
				{ key: 'a.b', type: 'richtext', default: '**fett**' },
			]).richtextDefaults,
		).toEqual({ 'a.b': '<p><strong>fett</strong></p>\n' });
	});

	it('erkennt <SiteHead> aus dem SDK', () => {
		expect(
			usesSiteHead(
				'<script>import { SiteHead, Seo } from \'@dealsystem/site\';</script>\n<SiteHead favicon="/f.svg" />',
			),
		).toBe(true);
		expect(usesSiteHead("<script>import { Seo } from '@dealsystem/site';</script>")).toBe(false);
		expect(usesSiteHead("<script>import SiteHead from '$lib/SiteHead.svelte';</script><SiteHead />")).toBe(
			false,
		);
	});
});
