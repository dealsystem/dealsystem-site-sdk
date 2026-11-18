// Erzeugt den Vertrag `contract/ds-content.v1.json`: Aufbau des Inhaltsblocks, Form von
// `contentPatch` samt Grenzen, und Fälle „Artefakt vorher + neue Slot-Werte → Artefakt nachher“.
// Die Seiten stammen aus `svelte/server` mit den echten SDK-Bausteinen, in der Form eines
// Produktions-Builds. Der Core liest die Datei ohne SDK ein und prüft seinen Patcher dagegen.
import { render } from 'svelte/server';
import {
	CONTENT_BLOCK_VERSION,
	CONTENT_PATCH_LIMITS,
	contentBlockTag,
	type ContentBlock,
} from '../../src/lib/contentBlock.js';
import { setSiteDataForTests } from '../../src/lib/internal/siteData.js';
import type { ContentSlotDef, MediaRef, SiteManifest, SlotOverride } from '../../src/lib/types.js';
import { buildContentPatchInfo } from '../../src/lib/vite/index.js';
import PatchHarness from '../fixtures/PatchHarness.svelte';
import { testSiteData } from '../helpers.js';
import { buildContentBlock, patchArtifact, type PatchBlocker } from './patch.js';

export const CONTRACT_SLOTS: ContentSlotDef[] = [
	{ key: 'start.titel', type: 'text', default: 'Standard-Titel der Startseite' },
	{ key: 'start.text', type: 'textarea', default: 'Zeile eins\nZeile zwei' },
	{ key: 'start.knopf', type: 'text', default: 'Kontakt aufnehmen' },
	{ key: 'start.ueber', type: 'richtext', default: 'Wir sind **seit 2010** in Leipzig tätig.' },
	{ key: 'start.bild', type: 'image', default: null },
	{ key: 'start.deko', type: 'image', default: null },
	{ key: 'start.link', type: 'link', default: { href: '/angebote', label: 'Angebote' } },
];

export function contractManifest(
	patch: Partial<NonNullable<SiteManifest['contentPatch']>> = {},
): SiteManifest {
	// Manifest wie zur Fassung 1 des Vertrags. Später hinzugekommene Felder (`schedule`, `external`) stehen bewusst
	// nicht darin: Der Patcher liest nur `contentPatch`, `slots` und `routes`, und der Vertrag bleibt byte-gleich.
	return {
		manifestVersion: 1,
		sdkVersion: '0.1.0',
		siteId: '11111111-1111-4111-8111-111111111111',
		routes: ['/'],
		slots: CONTRACT_SLOTS,
		collections: [],
		funnels: [],
		contentPatch: {
			...buildContentPatchInfo({ siteHeadInRootLayout: true, readsSlotsInCode: false }, CONTRACT_SLOTS),
			...patch,
		},
	} satisfies Omit<SiteManifest, 'schedule' | 'external'> as unknown as SiteManifest;
}

export function image(
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

/** Wie `vite build`: Vor `{@html}` und in `<svelte:head>` steht eine leere Prüfsumme `<!---->`. */
const asProduction = (html: string) => html.replace(/<!--[a-z0-9]+-->/g, '<!---->');

/** Eine vorgerenderte Seite mit diesen Slot-Werten. */
export function contractPage(slots: Record<string, SlotOverride>): string {
	const block = buildContentBlock(contractManifest(), slots);
	setSiteDataForTests(testSiteData({ slots, richtext: block.richtext }));
	try {
		const { head, body } = render(PatchHarness, { props: {} });
		return asProduction(
			`<!doctype html><html lang="de"><head><meta charset="utf-8" />${head}</head><body><div style="display: contents">${body}</div></body></html>`,
		);
	} finally {
		setSiteDataForTests(null);
	}
}

/** Rückfall-Seite von adapter-static (ohne Server-Rendering); den Block setzt der Build-Host beim Packen ein. */
const FALLBACK =
	'<!doctype html><html lang="de"><head><meta charset="utf-8" /></head><body><div class="app"><script>{ const element = document.currentScript.parentElement; Promise.all([import("/_app/immutable/entry/start.js"), import("/_app/immutable/entry/app.js")]).then(([kit, app]) => { kit.start(app, element); }); }</script></div></body></html>';
const fallbackWith = (block: ContentBlock) => FALLBACK.replace('</head>', `${contentBlockTag(block)}</head>`);

/** Ein kleines Artefakt: Startseite, Rückfall-Seite, eigene Datei aus `static/`, Ladedaten, JS. */
export function contractArtifact(
	slots: Record<string, SlotOverride>,
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		'404.html': fallbackWith(buildContentBlock(contractManifest(), slots)),
		'_app/immutable/chunks/a1b2c3.js':
			'import{t as e}from"./x.js";var n={key:`start.titel`,default:`Standard-Titel der Startseite`};export{n as t};',
		'__data.json': '{"type":"data","nodes":[]}',
		'google1234.html':
			'<!doctype html><html><head></head><body>google-site-verification: google1234.html</body></html>',
		'index.html': contractPage(slots),
		...extra,
	};
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
const EVIL =
	'</script><script>alert(1)</script><!-- " onmouseover="alert(2) &amp; <img src=x onerror=alert(3)> \u2028\u2029';

interface CaseInput {
	name: string;
	from: Record<string, SlotOverride>;
	to: Record<string, SlotOverride>;
	manifest?: SiteManifest;
	/** Das Artefakt vorher wird so verändert (Angriff oder unbekannter Aufbau). */
	tamper?: (files: Record<string, string>) => Record<string, string>;
}

const PATCHABLE: CaseInput[] = [
	{ name: 'Standard → CRM: Text, Richtext, Bild', from: {}, to: A },
	{ name: 'CRM → anderer CRM-Wert, mehrzeilig, Bild nur JPEG und WebP', from: A, to: B },
	{
		name: 'Text und Richtext zurück auf den Standard aus dem Code',
		from: B,
		to: { 'start.bild': B['start.bild']! },
	},
	{
		name: 'dekoratives Bild bleibt ohne Alternativtext',
		from: {},
		to: { 'start.deko': { type: 'image', value: image('e5', 'wird ignoriert') } },
	},
	{
		name: 'Bild aus dem CRM ohne Alternativtext behält den aus dem Code',
		from: {},
		to: { 'start.bild': { type: 'image', value: image('f6', '') } },
	},
	{
		name: 'XSS im Text: </script>, <!--, Anführungszeichen, &, U+2028/U+2029',
		from: A,
		to: { ...A, 'start.titel': { type: 'text', value: EVIL } },
	},
	{
		name: 'XSS in Alternativtext und Bild-Adresse',
		from: A,
		to: {
			...A,
			'start.bild': {
				type: 'image',
				value: (() => {
					const media = image('g7', '" onerror="alert(1)');
					media.variants[0]!.url = '/_ds/media/s1/g7/480.jpg?" onload="alert(2)';
					return media;
				})(),
			},
		},
	},
	{ name: 'gleiche Werte: nichts ändert sich', from: A, to: A },
];

const BLOCKED: (CaseInput & { expect: PatchBlocker['code'][] })[] = [
	{
		name: 'Manifest ohne contentPatch (SDK vor E1a)',
		from: A,
		to: B,
		manifest: { ...contractManifest(), contentPatch: undefined },
		expect: ['not-patchable'],
	},
	{
		name: 'unbekannte format-Fassung',
		from: A,
		to: B,
		manifest: contractManifest({ format: 2 }),
		expect: ['not-patchable'],
	},
	{
		name: 'Blocker im Manifest (getSlots im Code)',
		from: A,
		to: B,
		manifest: contractManifest({ blockers: ['get-slots'] }),
		expect: ['not-patchable'],
	},
	{
		name: 'Richtext wird leer',
		from: A,
		to: { ...A, 'start.ueber': { type: 'richtext', value: '' } },
		expect: ['richtext-empty'],
	},
	{
		name: 'Bild zurück auf das Bild aus dem Code',
		from: A,
		to: { ...A, 'start.bild': { type: 'image', value: null } },
		expect: ['image-reset'],
	},
	{
		name: 'Link geändert',
		from: A,
		to: { ...A, 'start.link': { type: 'link', value: { href: '/x', label: 'X' } } },
		expect: ['link-changed'],
	},
	{
		name: 'alter Wert steht außerhalb des Slots (<title>)',
		from: A,
		to: B,
		tamper: (f) => ({
			...f,
			'index.html': f['index.html']!.replace('<head>', '<head><title>Wir kaufen Ihr Haus in Leipzig</title>'),
		}),
		expect: ['value-elsewhere'],
	},
	{
		name: 'zweiter Inhaltsblock in einer Seite',
		from: A,
		to: B,
		tamper: (f) => ({
			...f,
			'index.html': f['index.html']!.replace(
				'</main>',
				`${contentBlockTag(buildContentBlock(contractManifest(), A))}</main>`,
			),
		}),
		expect: ['blocks-duplicate'],
	},
	{
		name: 'eigenes <script data-ds-slot> wird nie beschrieben',
		from: A,
		to: B,
		tamper: (f) => ({
			...f,
			'index.html': f['index.html']!.replace(
				'</main>',
				'<script data-ds-slot="start.titel">Wir kaufen Ihr Haus in Leipzig<!----></script></main>',
			),
		}),
		expect: ['markup-unknown'],
	},
	{
		name: 'Pfad mit ..',
		from: A,
		to: B,
		tamper: (f) => ({ ...f, '../x.html': '<html></html>' }),
		expect: ['bad-path'],
	},
];

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function runPatch(
	files: Record<string, string>,
	manifest: SiteManifest,
	slots: Record<string, SlotOverride>,
) {
	return patchArtifact({
		files: new Map(Object.entries(files).map(([p, t]) => [p, enc(t)])),
		manifest,
		slots,
	});
}

/** Der ganze Vertrag. `cases` sind mit dem Referenz-Patcher und mit `svelte/server` gegengeprüft. */
export function buildContract() {
	const cases = [
		...PATCHABLE.map((c) => {
			const manifest = c.manifest ?? contractManifest();
			const before = contractArtifact(c.from);
			const after = contractArtifact(c.to);
			const result = runPatch(before, manifest, c.to);
			if (!result.ok) throw new Error(`${c.name}: ${JSON.stringify(result.blockers)}`);
			const patched = Object.fromEntries([...result.files].map(([p, b]) => [p, dec(b)]));
			if (JSON.stringify(patched) !== JSON.stringify(after))
				throw new Error(`${c.name}: Patch weicht vom Build ab`);
			return { name: c.name, manifest, slots: c.to, before, after };
		}),
		...BLOCKED.map((c) => {
			const manifest = c.manifest ?? contractManifest();
			const before = (c.tamper ?? ((f) => f))(contractArtifact(c.from));
			const result = runPatch(before, manifest, c.to);
			const codes = result.ok ? [] : [...new Set(result.blockers.map((b) => b.code))];
			if (JSON.stringify(codes) !== JSON.stringify(c.expect))
				throw new Error(`${c.name}: ${JSON.stringify(codes)}`);
			return { name: c.name, manifest, slots: c.to, before, blockers: c.expect };
		}),
	];
	const blockExamples = [
		{ v: CONTENT_BLOCK_VERSION, slots: {}, richtext: {} },
		buildContentBlock(contractManifest(), A),
		{ v: CONTENT_BLOCK_VERSION, slots: { 'a.b': { type: 'text', value: EVIL } }, richtext: {} },
	].map((block) => ({ block, element: contentBlockTag(block as ContentBlock) }));

	return {
		$comment:
			'Vertrag ds-content Fassung 1 (Konzept Phase 2, 8.1). Quelle: SDK, erzeugt von packages/site/tests/contentBlockContract.test.ts (UPDATE_CONTRACT=1). Der Core hält eine byte-gleiche Kopie und prüft, dass sein Patcher aus before + slots genau after erzeugt bzw. bei blockers neu baut.',
		format: CONTENT_BLOCK_VERSION,
		element: {
			pattern: '<script type="application/json" id="ds-content">([^<]*)</script>',
			rules: [
				'Genau ein Element je vorgerenderter Seite, im <head>, geschrieben von <SiteHead>. Die Rückfall-Seite (404.html) bekommt es beim Packen auf dem Build-Host.',
				'Inhalt ist JSON.stringify({ v, slots, richtext }) in dieser Schlüsselreihenfolge; danach <, >, &, U+2028, U+2029 als \\u003c, \\u003e, \\u0026, \\u2028, \\u2029. Das Element kann deshalb kein < enthalten.',
				'slots: die Überschreibungen aus dem CRM (snapshot.slots) in der Reihenfolge der Eingabe. richtext: fertiges HTML je Richtext-Slot in der Reihenfolge von manifest.slots; Wert aus dem CRM durch die Positiv-Liste, sonst contentPatch.richtextDefaults[key].',
				'Vor dem Element steht in Produktions-Builds <!---->; es bleibt stehen.',
			],
			schema: {
				$schema: 'https://json-schema.org/draft/2020-12/schema',
				type: 'object',
				additionalProperties: false,
				required: ['v', 'slots', 'richtext'],
				properties: {
					v: { const: CONTENT_BLOCK_VERSION },
					slots: {
						type: 'object',
						propertyNames: { not: { const: '__proto__' } },
						additionalProperties: {
							type: 'object',
							required: ['type'],
							properties: { type: { enum: ['text', 'textarea', 'richtext', 'link', 'image'] }, value: true },
						},
					},
					richtext: {
						type: 'object',
						propertyNames: { not: { const: '__proto__' } },
						additionalProperties: { type: 'string' },
					},
				},
			},
			examples: blockExamples,
		},
		markup: {
			text: 'Element aus <Text as> (span, p, h1–h6, strong, em, small, div, li, blockquote, figcaption, dt, dd) mit data-ds-slot; Inhalt: Text maskiert wie Sveltes escape_html (& und <), danach <!---->.',
			richtext:
				'<div class="ds-richtext …" data-ds-richtext="" data-ds-slot="…">; Inhalt: <!----> HTML <!---->. Leerer Richtext gibt kein Element aus (Blocker richtext-empty).',
			image:
				'<picture class="ds-image …" data-ds-slot="…">; Inhalt: <!--[--> <source type srcset sizes/>… <!--]--> <img class src srcset sizes width height alt loading fetchpriority decoding data-ds-image/>. Attribute maskiert (&, ", <). sizes, class, loading, fetchpriority, decoding kommen aus dem alten <img>. Leerer alt heißt dekorativ und bleibt leer.',
			pages:
				'Ein fehlender Block wird nur in SvelteKit-Seiten (mit kit.start( im Text) vor </head> eingefügt; eigene HTML-Dateien aus static/ bleiben unverändert.',
		},
		contentPatch: {
			description:
				'Feld contentPatch im Manifest. delivery "dom" ohne blockers und bekannte format-Fassung heißt patchbar; sonst bauen. Unbekannte blockers annehmen (Liste wächst), sie heißen ebenfalls bauen.',
			limits: CONTENT_PATCH_LIMITS,
			schema: {
				$schema: 'https://json-schema.org/draft/2020-12/schema',
				type: 'object',
				additionalProperties: false,
				required: ['format', 'delivery', 'blockers', 'richtextDefaults'],
				properties: {
					format: { type: 'integer', minimum: 1 },
					delivery: { enum: ['dom', 'embedded'] },
					blockers: {
						type: 'array',
						maxItems: CONTENT_PATCH_LIMITS.blockersMaxItems,
						items: { type: 'string', maxLength: CONTENT_PATCH_LIMITS.blockerMaxLength },
					},
					richtextDefaults: {
						type: 'object',
						maxProperties: CONTENT_PATCH_LIMITS.richtextDefaultsMaxEntries,
						propertyNames: { not: { const: '__proto__' } },
						additionalProperties: {
							type: 'string',
							maxLength: CONTENT_PATCH_LIMITS.richtextDefaultMaxLength,
						},
						$comment: `Alle Schlüssel und Werte zusammen höchstens ${CONTENT_PATCH_LIMITS.richtextDefaultsTotalBytes} Bytes (UTF-8); das SDK setzt sonst den Blocker richtext-defaults-too-large und lässt das Objekt leer.`,
					},
				},
			},
			blockers: {
				'site-head-missing': '<SiteHead> steht nicht im Haupt-Layout (delivery embedded)',
				'get-slots': 'Code liest Slot-Werte selbst (getSlots, readSnapshot, content.json)',
				'richtext-defaults-too-large': 'richtextDefaults über den Grenzen',
			},
		},
		patchBlockers: {
			'not-patchable': 'contentPatch fehlt, unbekannte format-Fassung, delivery embedded oder blockers',
			'richtext-empty': 'Richtext wechselt zwischen leer und gefüllt',
			'image-reset': 'Bild-Slot zurück auf das Bild aus dem Code',
			'link-changed': 'Link-Slot geändert (Fassung 1 patcht keine Links)',
			'value-elsewhere': 'alter Wert steht zusätzlich außerhalb eines Slots',
			'blocks-duplicate': 'mehr als ein Block in einer Seite',
			'markup-unknown': 'Slot-Element nicht im erwarteten Aufbau oder nicht von einem SDK-Baustein',
			'bad-path': 'Pfad im Artefakt unzulässig',
		},
		cases,
	};
}
