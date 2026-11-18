// Schreibt contract/content-block.v1.fixture.json neu, aus dem gebauten Paket: npm run build && node scripts/content-block-fixture.mjs
import { writeFileSync } from 'node:fs';
const dist = new URL('../dist', import.meta.url).href;
const out = new URL('../contract/content-block.v1.fixture.json', import.meta.url);
const { contentBlockTag } = await import(`${dist}/contentBlock.js`);
const cases = [
	{ name: 'leer (Seite ohne Texte aus dem CRM)', block: { v: 1, slots: {}, richtext: {} } },
	{
		name: 'Text, Richtext und Bild',
		block: {
			v: 1,
			slots: {
				'start.hero.titel': { type: 'text', value: 'Wir kaufen Ihr Haus in Leipzig' },
				'start.ueber': { type: 'richtext', value: '<p>Seit <strong>2010</strong> vor Ort.</p>' },
				'start.hero.bild': {
					type: 'image',
					value: {
						id: 'a1',
						kind: 'image',
						alt: 'Büro von außen',
						width: 1600,
						height: 1067,
						variants: [
							{ url: '/_ds/media/s1/a1/480.jpg', width: 480, format: 'jpeg' },
							{ url: '/_ds/media/s1/a1/1600.webp', width: 1600, format: 'webp' },
						],
					},
				},
				'start.zuruecksetzen': { type: 'text', value: null },
			},
			richtext: { 'start.ueber': '<p>Seit <strong>2010</strong> vor Ort.</p>' },
		},
	},
	{
		name: 'Maskierung: </script>, <!--, &, Anführungszeichen, U+2028/U+2029',
		block: {
			v: 1,
			slots: {
				'a.b': { type: 'text', value: '</script><script>alert(1)</script><!-- & "x" \u2028\u2029 > ende' },
			},
			richtext: {},
		},
	},
];
writeFileSync(
	out,
	JSON.stringify(
		{
			description:
				'Beispiele für den Inhaltsblock: `tag` ist das Element genau so, wie es im HTML steht. Erzeugt aus contentBlockTag(block); der Core prüft damit seine Lesart.',
			cases: cases.map((c) => ({ ...c, tag: contentBlockTag(c.block) })),
		},
		null,
		'\t',
	) + '\n',
);
