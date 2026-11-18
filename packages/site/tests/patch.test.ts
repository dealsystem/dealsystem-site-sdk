// „Patchen statt Bauen“: Die Patch-Funktion muss genau das HTML liefern, das ein
// frischer Server-Render mit den neuen Werten liefert. Dann hydriert der
// Browser die gepatchte Seite wie eine gebaute, ohne etwas zu überschreiben.
import { render as renderLazy } from 'svelte/server';
import { contentBlockTag, parseContentBlock } from '../src/lib/contentBlock.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import {
	buildContentBlock,
	escapeHtml,
	patchArtifact,
	svelteHash,
	unsafeArtifactPath,
	type PatchInput,
} from './reference/patch.js';
import { defaultRichtextToHtml } from '../src/lib/richtext/server.js';
import type { ContentSlotDef, MediaRef, SiteManifest, SlotOverride } from '../src/lib/types.js';
import { buildContentPatchInfo, buildSiteData } from '../src/lib/vite/index.js';
import PatchHarness from './fixtures/PatchHarness.svelte';
import { testSiteData } from './helpers.js';

const SLOTS: ContentSlotDef[] = [
	{ key: 'start.titel', type: 'text', default: 'Standard-Titel der Startseite' },
	{ key: 'start.text', type: 'textarea', default: 'Zeile eins\nZeile zwei' },
	{ key: 'start.knopf', type: 'text', default: 'Kontakt aufnehmen' },
	{ key: 'start.ueber', type: 'richtext', default: 'Wir sind **seit 2010** in Leipzig tätig.' },
	{ key: 'start.bild', type: 'image', default: null },
	{ key: 'start.deko', type: 'image', default: null },
	{ key: 'start.link', type: 'link', default: { href: '/angebote', label: 'Angebote' } },
];

const manifest = (patch: Partial<NonNullable<SiteManifest['contentPatch']>> = {}): SiteManifest => ({
	manifestVersion: 1,
	sdkVersion: '0.1.0',
	siteId: 's1',
	routes: ['/'],
	slots: SLOTS,
	collections: [],
	funnels: [],
	contentPatch: {
		...buildContentPatchInfo({ siteHeadInRootLayout: true, readsSlotsInCode: false }, SLOTS),
		...patch,
	},
});

function image(
	id: string,
	alt: string,
	formats: ('jpeg' | 'webp' | 'avif')[] = ['jpeg', 'webp', 'avif'],
): MediaRef {
	return {
		id,
		kind: 'image',
		alt,
		width: 1600,
		height: 1067,
		variants: formats.flatMap((format) => [
			{ url: `/_ds/media/s1/${id}/480.${format}`, width: 480, format },
			{ url: `/_ds/media/s1/${id}/1600.${format}`, width: 1600, format },
		]),
	};
}

/** Eine fertige Seite, wie der Build sie mit diesen Slot-Werten schreibt. */
function page(slots: Record<string, SlotOverride>): string {
	const block = buildContentBlock(manifest(), slots);
	setSiteDataForTests(testSiteData({ slots, richtext: block.richtext }));
	try {
		const { head, body } = (renderLazy as (c: unknown, o: unknown) => { head: string; body: string })(
			PatchHarness,
			{ props: {} },
		);
		return `<!doctype html><html lang="de"><head><meta charset="utf-8" />${head}</head><body><div style="display: contents">${body}</div></body></html>`;
	} finally {
		setSiteDataForTests(null);
	}
}

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

const FALLBACK_404 =
	'<!doctype html><html><head><meta charset="utf-8" /></head><body><div class="app"><script>{ const element = document.currentScript.parentElement; Promise.all([import("/_app/immutable/entry/start.js")]).then(([kit, app]) => { kit.start(app, element); }); }</script></div></body></html>';

function artifact(
	slots: Record<string, SlotOverride>,
	extra: Record<string, string> = {},
): Map<string, Uint8Array> {
	return new Map(
		Object.entries({
			'index.html': page(slots),
			// Rückfall-Seite von adapter-static: ohne Server-Rendering, nur der Start von SvelteKit.
			'404.html': FALLBACK_404,
			'__data.json': '{"type":"data","nodes":[]}',
			'_app/immutable/chunks/abc.js': 'export const x={default:`Standard-Titel der Startseite`};',
			...extra,
		}).map(([path, text]) => [path, enc(text)]),
	);
}

function patch(
	from: Record<string, SlotOverride>,
	to: Record<string, SlotOverride>,
	input: Partial<PatchInput> = {},
) {
	return patchArtifact({ files: artifact(from), manifest: manifest(), slots: to, ...input });
}

const A: Record<string, SlotOverride> = {
	'start.titel': { type: 'text', value: 'Wir kaufen Ihr Haus in Leipzig' },
	'start.ueber': { type: 'richtext', value: '<p>Seit <strong>2010</strong> vor Ort.</p>' },
	'start.bild': { type: 'image', value: image('a1', 'Büro von außen') },
};
const B: Record<string, SlotOverride> = {
	'start.titel': { type: 'text', value: 'Wir kaufen Ihr Haus in Leipzig und Umgebung' },
	'start.text': { type: 'textarea', value: 'Erste Zeile\nZweite & dritte <Zeile>' },
	'start.ueber': { type: 'richtext', value: '<h2>Über uns</h2><ul><li>eins</li><li>zwei</li></ul>' },
	'start.bild': { type: 'image', value: image('b2', 'Team im Büro', ['jpeg', 'webp']) },
};

describe('patchArtifact ergibt dasselbe HTML wie ein Build', () => {
	const cases: [string, Record<string, SlotOverride>, Record<string, SlotOverride>][] = [
		['Standard → CRM', {}, A],
		['CRM → anderer CRM-Wert', A, B],
		['CRM-Text zurück auf Standard', B, { 'start.bild': B['start.bild']!, 'start.ueber': B['start.ueber']! }],
		['Richtext zurück auf Standard', A, { ...A, 'start.ueber': { type: 'richtext', value: null } }],
		['Bild nur als JPEG', A, { ...A, 'start.bild': { type: 'image', value: image('c3', 'Haus', ['jpeg']) } }],
		['Bild nur als WebP', A, { ...A, 'start.bild': { type: 'image', value: image('d4', 'Haus', ['webp']) } }],
		[
			'dekoratives Bild bleibt ohne Alternativtext',
			{},
			{ 'start.deko': { type: 'image', value: image('e5', 'Wird ignoriert') } },
		],
		[
			'Bild ohne Alternativtext aus dem CRM behält den aus dem Code',
			{},
			{ 'start.bild': { type: 'image', value: image('f6', '') } },
		],
	];
	it.each(cases)('%s', (_name, from, to) => {
		const result = patch(from, to);
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		expect(dec(result.files.get('index.html'))).toBe(page(to));
	});

	it('wie ein Produktions-Build: leere Prüfsummen vor {@html} bleiben leer', () => {
		// `vite build` schreibt `<!---->` statt `<!--c87m4-->` vor {@html}.
		const prod = (html: string) => html.replace(/<!--[a-z0-9]+-->/g, '<!---->');
		const files = artifact(A);
		files.set('index.html', enc(prod(dec(files.get('index.html')))));
		const result = patchArtifact({ files, manifest: manifest(), slots: B });
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		expect(dec(result.files.get('index.html'))).toBe(prod(page(B)));
	});

	it('ändert nichts, wenn die Werte gleich sind', () => {
		const files = artifact(A);
		const result = patchArtifact({ files, manifest: manifest(), slots: A });
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		// Nur die 404-Seite bekommt beim ersten Patch den Block.
		expect(result.changedFiles).toEqual(['404.html']);
		expect(result.changedSlots).toEqual([]);
		expect(result.files.get('index.html')).toBe(files.get('index.html'));
	});

	it('schreibt den Block in Seiten ohne Server-Rendering (404-Rückfall)', () => {
		const result = patch(A, B);
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		const fallback = dec(result.files.get('404.html'));
		expect(fallback).toContain(`${contentBlockTag(buildContentBlock(manifest(), B))}</head>`);
	});

	it('lässt alle anderen Dateien unverändert', () => {
		const files = artifact(A);
		const result = patchArtifact({ files, manifest: manifest(), slots: B });
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		expect(result.changedFiles).toEqual(['404.html', 'index.html']);
		expect(result.files.get('__data.json')).toBe(files.get('__data.json'));
		expect(result.files.get('_app/immutable/chunks/abc.js')).toBe(files.get('_app/immutable/chunks/abc.js'));
	});

	it('baut den Richtext wie das Vite-Plugin', () => {
		const snapshot = { slots: A } as Parameters<typeof buildSiteData>[1];
		const fromPlugin = buildSiteData(
			{ siteId: 's1' } as Parameters<typeof buildSiteData>[0],
			{
				...snapshot,
				site: testSiteData().site,
				legal: { ...testSiteData().legal, imprintHtml: '', privacyHtml: '' },
				tracking: { metaPixelId: null, googleTagId: null },
				funnels: [],
				collections: {},
				seo: testSiteData().seo,
				snapshotVersion: 1,
			},
			SLOTS,
			{},
		);
		expect(buildContentBlock(manifest(), A).richtext).toEqual(fromPlugin.richtext);
		expect(buildContentBlock(manifest(), {}).richtext).toEqual({
			'start.ueber': defaultRichtextToHtml('Wir sind **seit 2010** in Leipzig tätig.'),
		});
	});
});

describe('Maskierung (XSS)', () => {
	const EVIL =
		'</script><script>alert(1)</script><!-- " onmouseover="alert(2) &amp; <img src=x onerror=alert(3)>';

	function patched(to: Record<string, SlotOverride>): string {
		const result = patch(A, to);
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		const html = dec(result.files.get('index.html'));
		expect(html).toBe(page(to));
		return html;
	}

	/** Alle Skript-Elemente der Seite: Nur der Inhaltsblock darf eins sein. */
	function scripts(html: string): string[] {
		return [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
	}

	it('Text mit <script> und </script> bleibt Text', () => {
		const html = patched({ ...A, 'start.titel': { type: 'text', value: EVIL } });
		expect(scripts(html)).toEqual(['<script type="application/json" id="ds-content">']);
		expect(html).not.toContain('<img src=x');
		expect(html).toContain(`>${escapeHtml(EVIL)}<!----></h1>`);
		// Der Block endet genau einmal, der Wert steckt maskiert darin.
		const block = /<script type="application\/json" id="ds-content">([^<]*)<\/script>/.exec(html)!;
		expect(parseContentBlock(block[1])!.slots['start.titel']!.value).toBe(EVIL);
		expect(block[1]).not.toMatch(/<|>|&/);
	});

	it('Zeilentrenner U+2028 im JSON-Block', () => {
		const html = patched({ ...A, 'start.titel': { type: 'text', value: 'a b c' } });
		const block = /id="ds-content">([^<]*)<\/script>/.exec(html)![1]!;
		expect(block).toContain('\\u2028');
		expect(parseContentBlock(block)!.slots['start.titel']!.value).toBe('a b c');
	});

	it('Richtext aus dem CRM geht durch dieselbe Positiv-Liste wie beim Build', () => {
		const html = patched({
			...A,
			'start.ueber': {
				type: 'richtext',
				value:
					'<p onclick="alert(1)">ok</p><script>alert(2)</script><a href="javascript:alert(3)">x</a><img src=x onerror=alert(4)><a href="https://a.de" target="_blank">y</a>',
			},
		});
		expect(scripts(html)).toEqual(['<script type="application/json" id="ds-content">']);
		// Im Block steht der Rohwert als JSON-Daten (maskiert, nie ausgeführt); ausgegeben wird nur das bereinigte HTML.
		const markup = html.replace(/<script type="application\/json" id="ds-content">[^<]*<\/script>/, '');
		expect(markup).not.toMatch(/onclick|onerror|javascript:|<img src=x/);
		expect(html).toContain('<a href="https://a.de" target="_blank" rel="noopener noreferrer">y</a>');
	});

	it('Alternativtext und Bild-Adresse im Attribut', () => {
		const media = image('g7', '" onerror="alert(1)');
		media.variants[0]!.url = '/_ds/media/s1/g7/480.jpg?" onload="alert(2)';
		const html = patched({ ...A, 'start.bild': { type: 'image', value: media } });
		expect(html).toContain('alt="&quot; onerror=&quot;alert(1)"');
		expect(html).not.toMatch(/" onerror="|" onload="/);
	});

	it('neue Werte für unbekannte Schlüssel landen nur im Block', () => {
		const html = patched({ ...A, 'gibt.es.nicht': { type: 'text', value: '<b>x</b>' } });
		expect(html).not.toContain('<b>x</b>');
	});
});

describe('Grenzen: dann wird doch gebaut', () => {
	const codes = (result: ReturnType<typeof patchArtifact>) =>
		result.ok ? [] : result.blockers.map((b) => b.code);

	it('Seite ohne Inhaltsblock (alte SDK-Version oder ohne <SiteHead>)', () => {
		expect(codes(patch(A, B, { manifest: { ...manifest(), contentPatch: undefined } }))).toEqual([
			'not-patchable',
		]);
		expect(
			codes(patch(A, B, { manifest: manifest({ delivery: 'embedded', blockers: ['site-head-missing'] }) })),
		).toEqual(['not-patchable']);
	});

	it('Code liest Slots selbst (getSlots)', () => {
		expect(codes(patch(A, B, { manifest: manifest({ blockers: ['get-slots'] }) }))).toEqual([
			'not-patchable',
		]);
	});

	it('Richtext wird leer: <RichText> gibt dann kein Element aus', () => {
		expect(codes(patch(A, { ...A, 'start.ueber': { type: 'richtext', value: '' } }))).toEqual([
			'richtext-empty',
		]);
	});

	it('Bild zurück auf das Bild aus dem Code', () => {
		expect(codes(patch(A, { ...A, 'start.bild': { type: 'image', value: null } }))).toEqual(['image-reset']);
	});

	it('Bild aus dem CRM ohne Alternativtext, wenn schon eins aus dem CRM gesetzt war', () => {
		expect(codes(patch(A, { ...A, 'start.bild': { type: 'image', value: image('h8', '') } }))).toEqual([
			'image-alt',
		]);
	});

	it('Link geändert (im Prototyp nicht umgesetzt)', () => {
		expect(
			codes(patch(A, { ...A, 'start.link': { type: 'link', value: { href: '/x', label: 'X' } } })),
		).toEqual(['link-changed']);
	});

	it('alter Wert steht außerhalb des Slots, z. B. im Titel', () => {
		const files = artifact(A);
		const html = dec(files.get('index.html')).replace(
			'<head>',
			'<head><title>Wir kaufen Ihr Haus in Leipzig</title>',
		);
		files.set('index.html', enc(html));
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['value-elsewhere']);
	});

	it('alter CRM-Wert steht in den Ladedaten oder im Bundle', () => {
		const files = artifact(A, { 'ueber/__data.json': '{"titel":"Wir kaufen Ihr Haus in Leipzig"}' });
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['value-elsewhere']);
	});

	it('Standardtext im Bundle ist kein Hindernis', () => {
		expect(patch({}, A).ok).toBe(true);
	});

	it('Seite mit Slots, aber ohne Block', () => {
		const files = artifact(A, {
			'kontakt.html':
				'<html><head></head><body><h1 data-ds-slot="start.titel">Wir kaufen Ihr Haus in Leipzig</h1></body></html>',
		});
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toContain('block-missing');
	});

	it('verschiedene Blöcke in verschiedenen Seiten', () => {
		const files = artifact(A, { 'b.html': page(B) });
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['blocks-differ']);
	});

	it('unbekannter Aufbau eines Slots', () => {
		const files = artifact(A);
		files.set(
			'index.html',
			enc(
				dec(files.get('index.html')).replace(
					'Wir kaufen Ihr Haus in Leipzig<!---->',
					'Wir <em>kaufen</em><!---->',
				),
			),
		);
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['markup-unknown']);
	});

	it('Pfade mit .. oder absolut', () => {
		for (const bad of ['../x.html', '/etc/x.html', 'a/../../x.html', 'a/./b.html']) {
			const files = artifact(A, { [bad]: '<html></html>' });
			expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['bad-path']);
		}
	});

	it('kein UTF-8', () => {
		const files = artifact(A);
		files.set('x.html', new Uint8Array([0xff, 0xfe, 0x00]));
		expect(codes(patchArtifact({ files, manifest: manifest(), slots: B }))).toEqual(['bad-encoding']);
	});
});

it('svelteHash wie Svelte', () => {
	// Wert aus einem echten Server-Render von Svelte 5.57: <!--c87m4--><p>Hallo</p>
	expect(svelteHash('<p>Hallo</p>')).toBe('c87m4');
});

describe('feindliches Artefakt', () => {
	const codes = (result: ReturnType<typeof patchArtifact>) =>
		result.ok ? [] : result.blockers.map((b) => b.code);
	const run = (files: Map<string, Uint8Array>, input: Partial<PatchInput> = {}) =>
		patchArtifact({ files, manifest: manifest(), slots: B, ...input });

	it('Pfade: Umlaute erlaubt, Steuerzeichen, Rückstrich, leere Teile und Tiefe nicht', () => {
		expect(unsafeArtifactPath('über-uns.html')).toBeNull();
		expect(unsafeArtifactPath('_app/immutable/chunks/a-B_c.js')).toBeNull();
		for (const bad of [
			'',
			'/a',
			'a//b',
			'a/./b',
			'a/../b',
			'..',
			'a\\b',
			'a\u0000b',
			'a\nb',
			'x'.repeat(1025),
		]) {
			expect(unsafeArtifactPath(bad), JSON.stringify(bad)).not.toBeNull();
		}
		expect(unsafeArtifactPath(Array(40).fill('a').join('/'))).not.toBeNull();
	});

	it('derselbe Pfad in anderer Schreibweise', () => {
		expect(codes(run(artifact(A, { 'Index.html': '<html></html>' })))).toEqual(['bad-path']);
	});

	it('Grenzen für Dateizahl, Gesamtgröße, Textdateien und Slots', () => {
		expect(codes(run(artifact(A), { limits: { maxFiles: 3 } }))).toEqual(['too-large']);
		expect(codes(run(artifact(A), { limits: { maxTotalBytes: 1000 } }))).toEqual(['too-large']);
		expect(codes(run(artifact(A), { limits: { maxTextFileBytes: 1000 } }))).toContain('too-large');
		expect(codes(run(artifact(A), { limits: { maxSlotElementsPerFile: 3 } }))).toEqual(['too-large']);
	});

	it('Einträge ohne Bytes', () => {
		const files = artifact(A) as Map<string, unknown>;
		files.set('x.html', 'kein Uint8Array');
		expect(codes(run(files as Map<string, Uint8Array>))).toEqual(['bad-path']);
	});

	it('eigenes <script data-ds-slot> wird nie beschrieben', () => {
		const files = artifact(A);
		const html = dec(files.get('index.html')).replace(
			'</main>',
			'<script data-ds-slot="start.titel">Wir kaufen Ihr Haus in Leipzig<!----></script></main>',
		);
		files.set('index.html', enc(html));
		expect(codes(run(files))).toContain('markup-unknown');
	});

	it('zweiter Inhaltsblock in einer Seite', () => {
		const files = artifact(A);
		const html = dec(files.get('index.html'));
		const block = /<script type="application\/json" id="ds-content">[^<]*<\/script>/.exec(html)![0];
		files.set('index.html', enc(html.replace('</main>', `${block}</main>`)));
		expect(codes(run(files))).toEqual(['blocks-duplicate']);
	});

	it('eigene HTML-Datei aus static/ ohne SvelteKit bleibt unberührt', () => {
		const own = '<!doctype html><html><head></head><body>google-site-verification</body></html>';
		const files = artifact(A, { 'google123.html': own });
		const result = run(files);
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		expect(result.files.get('google123.html')).toBe(files.get('google123.html'));
	});

	it('__proto__ im Block wird verworfen, im Manifest abgelehnt', () => {
		const block = parseContentBlock(
			'{"v":1,"slots":{"__proto__":{"type":"text","value":"x"}},"richtext":{"__proto__":"y"}}',
		);
		expect(block).toEqual({ v: 1, slots: {}, richtext: {} });
		expect(Object.getPrototypeOf(block!.slots)).toBe(Object.prototype);
		const bad = {
			...manifest(),
			slots: [...SLOTS, { key: '__proto__', type: 'text', default: 'x' } as ContentSlotDef],
		};
		expect(codes(run(artifact(A), { manifest: bad }))).toEqual(['bad-manifest']);
	});

	it('kaputtes Manifest', () => {
		for (const bad of [
			null,
			{},
			{ ...manifest(), slots: 'x' },
			{ ...manifest(), slots: [{ key: 'a.b', type: 'script', default: null }] },
			{ ...manifest(), slots: [SLOTS[0], SLOTS[0]] },
			{ ...manifest(), contentPatch: { format: 1, delivery: 'dom', blockers: 'x', richtextDefaults: {} } },
		]) {
			expect(codes(run(artifact(A), { manifest: bad as unknown as SiteManifest }))).toEqual(['bad-manifest']);
		}
	});

	it('Standard-HTML aus dem Manifest geht durch die Positiv-Liste', () => {
		const evil = manifest({
			richtextDefaults: { 'start.ueber': '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)>' },
		});
		const result = patchArtifact({
			files: artifact(A),
			manifest: evil,
			slots: { ...A, 'start.ueber': { type: 'richtext', value: null } },
		});
		if (!result.ok) throw new Error(JSON.stringify(result.blockers));
		const html = dec(result.files.get('index.html')).replace(
			/<script type="application\/json" id="ds-content">[^<]*<\/script>/,
			'',
		);
		expect(html).toContain('<p>ok</p>');
		expect(html).not.toMatch(/alert|onerror/);
	});
});
