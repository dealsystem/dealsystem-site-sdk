// Je Regel mindestens ein Projekt, das bestehen muss, und eines, das scheitern muss.
// Grundlage sind die vollständigen Fixture-Projekte `fixtures/base` (Quelle) und `fixtures/output-base` (Ausgabe).

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RULES } from '../src/check/catalog.js';
import { runCheck } from '../src/check/run.js';
import { SVELTE_CONFIG_TEMPLATE } from '../src/project/svelteConfig.js';
import type { CheckStage, Finding } from '../src/check/types.js';
import {
	BASE_OUTPUT,
	BASE_SOURCE,
	cleanupFixtures,
	homePage,
	materialize,
	page,
	type Overlay,
} from './helpers/fixtures.js';

const baseText = (rel: string): string => readFileSync(join(BASE_SOURCE, ...rel.split('/')), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-Fixtures frei verändern
type Json = Record<string, any>;
const lock = (): Json => JSON.parse(baseText('package-lock.json'));
const pkg = (): Json => JSON.parse(baseText('package.json'));
const json = (v: unknown): string => `${JSON.stringify(v, null, '\t')}\n`;

function withDependency(
	name: string,
	spec: string,
	resolved = `https://registry.npmjs.org/${name}/-/x-1.0.0.tgz`,
): Overlay {
	const p = pkg();
	p.dependencies[name] = spec;
	const l = lock();
	l.packages[''].dependencies[name] = spec;
	l.packages[`node_modules/${name}`] = { version: '1.0.0', resolved, integrity: 'sha512-DDDD' };
	return { 'package.json': json(p), 'package-lock.json': json(l) };
}

const svelteConfig = (kit: string): string =>
	`import adapter from '@sveltejs/adapter-static';\n\nexport default {\n\tkit: {\n${kit}\n\t},\n};\n`;

interface RuleCase {
	stage: CheckStage;
	pass: Overlay[];
	fail: Overlay[];
}

const S = 'source' as const;
const O = 'output' as const;

const CASES: Record<string, RuleCase[]> = {
	'STR-001': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{
					'svelte.config.js': `import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter(), csp: { mode: 'hash', directives: { 'script-src': ['self'] } } } };\n`,
				},
				{ 'svelte.config.js': null },
			],
		},
	],
	'STR-002': [
		{
			stage: S,
			pass: [
				{
					'src/routes/robots.txt/+server.ts': `export const prerender = true;\nexport const GET = () => new Response('');\n`,
					'static/robots.txt': null,
				},
			],
			fail: [
				{ 'src/routes/api/kontakt/+server.ts': `export const POST = () => new Response('ok');\n` },
				{ 'src/hooks.server.ts': `export const handle = ({ event, resolve }) => resolve(event);\n` },
				{
					'src/routes/kontakt/+page.server.ts': `export const prerender = true;\nexport const actions = { default: async () => ({}) };\n`,
				},
				{ 'src/routes/sitemap.xml/+server.ts': `export const GET = () => new Response('');\n` },
			],
		},
	],
	'STR-003': [
		{
			stage: S,
			pass: [{ 'src/routes/kontakt/+page.server.ts': `export const load = () => ({ a: 1 });\n` }],
			fail: [
				{
					'src/routes/+layout.ts': null,
					'src/routes/kontakt/+page.server.ts': `export const load = () => ({ a: 1 });\n`,
				},
				{
					'src/routes/angebote/[slug]/+page.server.ts': null,
					'src/routes/angebote/[slug]/+page.ts': baseText('src/routes/angebote/[slug]/+page.server.ts'),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>',
						"\timport { getCollection } from '@dealsystem/site/content';\n\tconst a = getCollection('angebote');\n",
					),
				},
			],
		},
	],
	'STR-004': [{ stage: S, pass: [{}], fail: [{ 'src/routes/angebote/[slug]/+page.server.ts': null }] }],
	'STR-008': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"\t\tprerender: { handleHttpError, handleUnseenRoutes: 'ignore' },\n",
						'',
					),
				},
				{
					'svelte.config.js': baseText('svelte.config.js')
						.replace("import { handleHttpError } from '@dealsystem/site/config';\n", '')
						.replace('prerender: { handleHttpError,', "prerender: { handleHttpError: 'warn',"),
				},
				{
					// Ohne 'ignore' scheitert der Build bei einer Sammlung ohne Einträge.
					'svelte.config.js': baseText('svelte.config.js').replace(", handleUnseenRoutes: 'ignore'", ''),
				},
			],
		},
	],
	'STR-009': [
		{
			stage: S,
			pass: [{ 'vite.config.ts': null, 'vite.config.js': baseText('vite.config.ts') }],
			fail: [
				{
					'vite.config.ts': baseText('vite.config.ts').replace(
						'dealsystem(site), sveltekit()',
						'sveltekit(), dealsystem(site)',
					),
				},
				{ 'vite.config.ts': baseText('vite.config.ts').replace('dealsystem(site), ', '') },
				{ 'vite.config.ts': null },
			],
		},
	],
	'STR-005': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{ 'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(/siteId: '[^']+'/, "siteId: ''") },
				{
					'dealsystem.config.ts': `import { defineSite } from '@dealsystem/site/config';\nimport { ID } from './id';\nexport default defineSite({ siteId: ID });\n`,
				},
				{ 'dealsystem.config.ts': null },
				{
					'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(
						"type: 'textarea'",
						"type: 'longtext'",
					),
				},
			],
		},
	],
	'STR-006': [
		{
			stage: S,
			pass: [{}],
			fail: [
				(() => {
					const l = lock();
					l.packages['node_modules/@dealsystem/site'].version = '2.0.0';
					return { 'package-lock.json': json(l) };
				})(),
				(() => {
					const p = pkg();
					const l = lock();
					delete p.dependencies['@dealsystem/site'];
					delete l.packages[''].dependencies['@dealsystem/site'];
					return { 'package.json': json(p), 'package-lock.json': json(l) };
				})(),
			],
		},
	],
	'STR-007': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{ 'package-lock.json': null },
				(() => {
					const p = pkg();
					p.dependencies['clsx'] = '^2.1.1';
					return { 'package.json': json(p) };
				})(),
				{ 'package-lock.json': '{ kaputt' },
			],
		},
	],
	'DEP-001': [
		{
			stage: S,
			pass: [withDependency('@fontsource/inter', '^5.2.0')],
			fail: [withDependency('axios', '^1.7.0')],
		},
	],
	'DEP-002': [
		{
			stage: S,
			pass: [{}],
			fail: [
				withDependency('clsx', '^2.1.1', 'git+ssh://git@github.com/lukeed/clsx.git#abc'),
				withDependency('clsx', 'github:lukeed/clsx'),
				withDependency('clsx', 'file:../clsx'),
			],
		},
	],
	'SEC-001': [
		{
			stage: S,
			pass: [
				{
					'src/lib/site.ts': `export const SITE_KEY = 'dsp_0a1b2c3d_abcdefghijklmnopqrstuvwx';\nexport const placeholder = 'dm_live_...';\n`,
				},
			],
			fail: [
				{ 'src/lib/site.ts': `export const KEY = 'dm_live_${'a1'.repeat(32)}';\n` },
				{ 'src/lib/site.ts': `export const KEY = 'dms_site_ABCD1234_abcdefghijklmnopqrstu';\n` },
				{ 'static/key.pem': `-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\n` },
				{ 'src/lib/stripe.ts': `export const s = 'sk_live_${'Ab3'.repeat(10)}';\n` },
			],
		},
		{
			stage: O,
			pass: [{}],
			fail: [{ '_app/immutable/entry/start.js': `const k = "dm_live_${'f0'.repeat(32)}";\n` }],
		},
	],
	'SEC-002': [
		{
			stage: S,
			pass: [{ '.env.example': 'PUBLIC_X=\n' }],
			fail: [
				{ 'src/lib/env.ts': `import { env } from '$env/dynamic/private';\nexport const a = env.A;\n` },
				{
					'src/routes/+page.svelte': homePage(
						'<p>x</p>',
						`\timport { SECRET } from '$env/static/private';\n`,
					),
				},
				{ '.env': 'SECRET=1\n' },
			],
		},
	],
	'SEC-003': [
		{
			stage: S,
			pass: [{ 'src/routes/+page.svelte': homePage('<!-- {@html text} wäre verboten -->\n<h1>Hallo</h1>') }],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<div>{@html text}</div>',
						`\tconst text = '<b>x</b>';\n`,
					),
				},
			],
		},
	],
	'SEC-004': [
		{
			stage: S,
			pass: [{ 'src/lib/note.ts': `// Nie direkt /api/v1/ aufrufen.\nexport const ok = 1;\n` }],
			fail: [
				{
					'src/lib/api.ts': `export const load = () => fetch('https://app.dealsystem.io/api/v1/contacts');\n`,
				},
				{ 'src/lib/api.ts': 'export const u = (k: string) => `/api/site/v1/s/${k}/leads`;\n' },
			],
		},
	],
	'SEC-005': [
		{
			stage: S,
			// Der Aufruf siteApiOrigin() aus dem SDK ist die eine erlaubte Quelle, die keine feste Zeichenkette ist.
			pass: [{}],
			fail: [
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"'connect-src': ['self', siteApiOrigin()],",
						"'connect-src': ['self', process.env.API_HOST],",
					),
				},
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"import { handleHttpError, siteApiOrigin } from '@dealsystem/site/config';",
						"import { handleHttpError } from '@dealsystem/site/config';\nconst siteApiOrigin = () => '*';",
					),
				},
			],
		},
		{
			stage: S,
			pass: [
				{
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'hash', directives: { 'script-src': ["'self'"], 'style-src': ['self', 'unsafe-inline'] } },`,
					),
				},
				{ 'svelte.config.js': SVELTE_CONFIG_TEMPLATE },
			],
			fail: [
				{ 'svelte.config.js': svelteConfig(`\t\tadapter: adapter(),`) },
				{
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'auto', directives: { 'script-src': ['self'] } },`,
					),
				},
				{
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'hash', directives: { 'script-src': ['self', 'unsafe-inline'] } },`,
					),
				},
				{
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'hash', directives: { 'script-src': ['self', 'unsafe-eval'] } },`,
					),
				},
				{
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'hash', directives: { 'script-src': ['self', 'https://cdn.example.com'] } },`,
					),
				},
				{
					// Seit ALTCHA im SDK gibt es keinen Captcha-Host mehr.
					'svelte.config.js': svelteConfig(
						`\t\tadapter: adapter(),\n\t\tcsp: { mode: 'hash', directives: { 'script-src': ['self'], 'connect-src': ['self', 'https://*.frcapi.com'] } },`,
					),
				},
			],
		},
	],
	'SEC-006': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<button onclick={() => (n += 1)}>Mehr</button>',
						`\tlet n = $state(0);\n\tconst evaluate = (x: number) => x;\n\tevaluate(1);\n`,
					),
				},
			],
			fail: [
				{ 'src/lib/calc.ts': `export const run = (code: string) => eval(code);\n` },
				{ 'src/lib/calc.ts': `export const f = new Function('a', 'return a');\n` },
				{ 'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<button onclick="alert(1)">Mehr</button>') },
			],
		},
	],
	'SEC-007': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<form action="https://formspree.io/f/abc" method="post"><label>E-Mail <input name="email" /></label></form>',
					),
				},
			],
		},
	],
	'PRV-001': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<ConsentGate category="marketing">\n\t<iframe src="https://www.youtube-nocookie.com/embed/x" title="Video"></iframe>\n</ConsentGate>\n<a href="https://example.com">Partner</a>',
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<iframe src="https://www.youtube.com/embed/x" title="Video"></iframe>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<img src="https://images.example.com/a.jpg" alt="x" />',
					),
				},
				{
					'src/app.css': `body { background: url("https://images.example.com/bg.jpg"); }\na:focus-visible { outline: 2px solid; }\n`,
				},
			],
		},
		{
			stage: O,
			pass: [{ 'index.html': page({ body: '<a href="https://example.com">Partner</a>' }) }],
			fail: [
				{ 'index.html': page({ head: '<script src="https://tracker.example.com/t.js"></script>' }) },
				{ 'index.html': page({ head: '<link rel="preconnect" href="https://api.example.com" />' }) },
				{
					'index.html': page({
						head: '<script src="https://eu.frcapi.com/api/v2/captcha/widget.js"></script>',
					}),
				},
			],
		},
	],
	'PRV-002': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{
					'src/app.css': `@import url('https://fonts.googleapis.com/css2?family=Inter');\na:focus-visible { outline: 2px solid; }\n`,
				},
				{
					'src/app.html': baseText('src/app.html').replace(
						'%sveltekit.head%',
						'<script src="https://cdn.jsdelivr.net/npm/x"></script>\n\t\t%sveltekit.head%',
					),
				},
			],
		},
		{
			stage: O,
			pass: [{}],
			fail: [
				{
					'_app/immutable/assets/app.css': `@font-face { src: url(https://fonts.gstatic.com/s/inter.woff2); }\n`,
				},
			],
		},
	],
	'PRV-003': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<ConsentGate category="marketing"><Tracking /></ConsentGate>',
					),
				},
			],
			fail: [
				{ 'src/lib/pixel.ts': `export function track() {\n\tgtag('config', 'G-123');\n}\n` },
				{
					'src/app.html': baseText('src/app.html').replace(
						'%sveltekit.head%',
						'<script>fbq("init", "1");</script>\n\t\t%sveltekit.head%',
					),
				},
			],
		},
	],
	'PRV-004': [
		{
			stage: S,
			pass: [
				{
					'src/routes/impressum/+page.svelte': null,
					'src/routes/(recht)/impressum/+page.svelte': baseText('src/routes/impressum/+page.svelte'),
				},
			],
			fail: [
				{ 'src/routes/impressum/+page.svelte': null },
				{ 'src/routes/datenschutz/+page.svelte': '<h1>Datenschutz</h1>\n<p>Wir speichern nichts.</p>\n' },
			],
		},
		{
			stage: O,
			pass: [
				{
					'impressum.html': null,
					'impressum/index.html': readFileSync(join(BASE_OUTPUT, 'impressum.html'), 'utf8').replaceAll(
						'./',
						'../',
					),
				},
			],
			fail: [
				{ 'impressum.html': null },
				{ 'datenschutz.html': page({ title: 'Datenschutz', body: '<p>Text</p>' }) },
			],
		},
	],
	'PRV-005': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{
					'src/routes/+layout.svelte': baseText('src/routes/+layout.svelte').replace('<CookieBanner />', ''),
				},
				{ 'src/routes/+layout.svelte': null },
			],
		},
		{
			stage: O,
			pass: [{}],
			fail: [
				{ 'angebote.html': page({ title: 'Angebote', footer: false }) },
				{ 'angebote.html': page({ title: 'Angebote', cookie: false }) },
			],
		},
	],
	'PRV-006': [
		{
			stage: S,
			pass: [{ 'src/lib/note.ts': `// localStorage nutzen wir nicht.\nexport const a = 1;\n` }],
			fail: [{ 'src/lib/merken.ts': `export const merken = (v: string) => localStorage.setItem('x', v);\n` }],
		},
	],
	'A11Y-001': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{ 'src/app.html': baseText('src/app.html').replace(' lang="de"', '') },
				{ 'src/app.html': null },
			],
		},
		{ stage: O, pass: [{}], fail: [{ 'angebote.html': page({ title: 'Angebote', lang: '' }) }] },
	],
	'A11Y-002': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<MediaImage src={hero} alt="" decorative />\n<MediaImage media={bild} />',
					),
				},
			],
			fail: [
				{ 'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<img src="/haus.jpg" alt="Haus" />') },
				{ 'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<MediaImage src={hero} />') },
				{ 'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<MediaImage src={hero} alt="" />') },
			],
		},
		{
			stage: O,
			pass: [{ 'angebote.html': page({ title: 'A', body: '<img src="./a.jpg" alt="" />' }) }],
			fail: [{ 'angebote.html': page({ title: 'A', body: '<img src="./a.jpg" />' }) }],
		},
	],
	'A11Y-003': [
		{
			stage: O,
			pass: [{ 'angebote.html': page({ title: 'A', body: '<h2>a</h2><h3>b</h3><h2>c</h2>' }) }],
			fail: [
				{ 'angebote.html': page({ title: 'A', body: '<h1>zwei</h1>' }) },
				{ 'angebote.html': page({ title: 'A', body: '<h3>Sprung</h3>' }) },
				{ 'angebote.html': page({ title: 'A', h1: '' }) },
			],
		},
	],
	'A11Y-004': [
		{
			stage: O,
			pass: [
				{
					'angebote.html': page({
						title: 'A',
						body: '<label>Name <input name="n" /></label><input aria-label="Suche" name="q" /><input type="hidden" name="h" />',
					}),
				},
			],
			fail: [{ 'angebote.html': page({ title: 'A', body: '<input name="telefon" type="tel" />' }) }],
		},
	],
	'A11Y-005': [
		{
			stage: O,
			pass: [
				{
					'angebote.html': page({
						title: 'A',
						body: '<a href="./" aria-label="Startseite"><svg></svg></a><button><img src="./x.png" alt="Menü" /></button>',
					}),
				},
			],
			fail: [
				{ 'angebote.html': page({ title: 'A', body: '<a href="./"></a>' }) },
				{ 'angebote.html': page({ title: 'A', body: '<a href="./">Hier klicken</a>' }) },
				{ 'angebote.html': page({ title: 'A', body: '<button></button>' }) },
			],
		},
	],
	'A11Y-006': [
		{
			stage: S,
			pass: [
				{
					'src/app.css': `:root { --color-accent: #ffffff; --color-on-accent: #1d4ed8; }\na:focus-visible { outline: 2px solid; }\n`,
				},
			],
			fail: [
				{
					'src/app.css': `:root { --color-primary: #ffffff; --color-on-primary: #aaaaaa; }\na:focus-visible { outline: 2px solid; }\n`,
				},
				{
					'src/app.css': `:root { --color-text: #999999; --color-background: #ffffff; }\na:focus-visible { outline: 2px solid; }\n`,
				},
			],
		},
	],
	'A11Y-007': [
		{
			stage: S,
			pass: [
				{
					'src/app.css': `button { outline: none; }\nbutton:focus-visible { box-shadow: 0 0 0 3px #1d4ed8; }\n`,
				},
			],
			fail: [
				{ 'src/app.css': `button { outline: none; }\n` },
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<a href="/angebote" tabindex="3">Angebote</a>',
					),
				},
				{
					'src/app.html': baseText('src/app.html').replace(
						'initial-scale=1',
						'initial-scale=1, user-scalable=no',
					),
				},
			],
		},
	],
	'A11Y-008': [
		{
			stage: O,
			pass: [{}],
			fail: [
				{ 'angebote.html': page({ title: '' }) },
				{ 'angebote.html': page({ title: 'Startseite' }) },
				{
					'angebote.html': page({ title: 'A' }).replace(
						'<meta name="description" content="Beschreibung" />',
						'',
					),
				},
			],
		},
	],
	'A11Y-009': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>Hallo</h1>\n<MediaVideo media={video} title="Rundgang" />',
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<video src="/rundgang.mp4" controls></video>'),
				},
				{ 'src/routes/+page.svelte': homePage('<h1>Hallo</h1>\n<MediaVideo media={video} />') },
			],
		},
		{
			stage: O,
			pass: [
				{ 'angebote.html': page({ title: 'A', body: '<video autoplay muted loop src="./a.mp4"></video>' }) },
			],
			fail: [{ 'angebote.html': page({ title: 'A', body: '<video autoplay src="./a.mp4"></video>' }) }],
		},
	],
	'QUA-001': [
		{
			stage: O,
			pass: [{}],
			fail: [{ 'video/gross.bin': Buffer.alloc(26 * 1024 * 1024).toString('latin1') }],
		},
	],
	'QUA-002': [
		{
			stage: O,
			pass: [{}],
			fail: [
				{
					'_app/immutable/entry/start.js': `export const blob = "${randomBytes(600 * 1024).toString('base64')}";\n`,
				},
			],
		},
	],
	'QUA-003': [
		{
			stage: O,
			pass: [
				{
					'angebote.html': page({
						title: 'A',
						body: '<a href="./#kontakt">Kontakt</a><a href="mailto:a@b.de">Mail</a><a href="./_ds/media/s/a/800.jpg">Bild</a><a href="./sitemap.xml">Sitemap</a>',
					}),
				},
			],
			fail: [
				{ 'angebote.html': page({ title: 'A', body: '<a href="./gibt-es-nicht">Weg</a>' }) },
				{ '404.html': null },
			],
		},
	],
	'QUA-004': [{ stage: O, pass: [{}], fail: [{ 'robots.txt': null }, { 'sitemap.xml': null }] }],
	'QUA-005': [
		{
			stage: S,
			pass: [
				{
					'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(
						"{ name: 'email', type: 'email', standardField: 'email', required: true }",
						"{ name: 'telefon', type: 'tel', standardField: 'phone', required: true }",
					),
				},
			],
			fail: [
				{ 'dealsystem.config.ts': baseText('dealsystem.config.ts').replace("standardField: 'email', ", '') },
			],
		},
	],
	'QUA-006': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.hero.titel" default="A" as="h1" />\n<Text key="start.hero.titel" default="A" />\n<CollectionList collection="angebote" />',
					),
				},
			],
			fail: [
				{ 'src/routes/+page.svelte': homePage('<h1>A</h1>\n<Text key="Start Hero" default="A" />') },
				{ 'src/routes/+page.svelte': homePage('<h1>A</h1>\n<LeadForm funnel="anfrage" />') },
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<Text key="start.text" default="A" />\n<Text key="start.text" default="B" />',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<Link key="start.text" default={{ href: \'/kontakt\', label: \'Kontakt\' }} />\n<Text key="start.text" default="B" />',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<Text key="start.text" default="A" />\n<RichText key="start.text" default="B" />',
					),
				},
				{
					'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(
						'kontakt: {',
						'Kontakt_Formular: {',
					),
				},
				{
					'src/lib/daten.ts': `import { getCollection } from '@dealsystem/site/content';\nexport const x = getCollection('objekte');\n`,
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<Text key={dynamisch} default="A" />',
						`\tconst dynamisch = 'a.b';\n`,
					),
				},
				// Beschriftung eines Bild-Slots als Variable: Der Build kann sie nicht ans CRM melden.
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<MediaImage key="start.hero.bild" default="/haus.jpg" alt="Haus" label={beschriftung} />',
						`\tconst beschriftung = 'Titelbild';\n`,
					),
				},
			],
		},
	],
	'QUA-007': [
		{
			stage: S,
			pass: [{}],
			fail: [
				{ 'AGENTS.md': baseText('AGENTS.md').replace('begin 0.1.0', 'begin 0.0.9') },
				{ 'AGENTS.md': null },
			],
		},
	],
	'SEC-008': [
		{
			stage: S,
			pass: [
				// Die CSP erlaubt den Anbieter ausdrücklich.
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"'object-src': ['none'],",
						"'object-src': ['none'],\n\t\t\t\t'frame-src': ['self', 'https://www.openstreetmap.org'],",
					),
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<ConsentGate category="media">\n\t<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4" title="Karte"></iframe>\n</ConsentGate>\n<MapEmbed lat={53.87} lon={10.69} title="Anfahrt" />',
						"\timport { MapEmbed } from '@dealsystem/site';\n",
					),
				},
				// Ein Link auf den Anbieter ist keine Einbettung.
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<a href="https://www.google.com/maps?q=L%C3%BCbeck">Karte öffnen</a>',
					),
				},
			],
			fail: [
				// Hinter der Einwilligung, aber von der CSP blockiert: Die Karte bliebe leer.
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<ConsentGate category="media">\n\t<iframe src="https://www.google.com/maps?q=L%C3%BCbeck&output=embed" title="Karte"></iframe>\n</ConsentGate>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<ConsentGate category="media">\n\t<script src="https://widget.example.com/w.js"></script>\n</ConsentGate>',
					),
				},
				// Die Site-API fest eingetragen: passt nur für eine Umgebung.
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"'connect-src': ['self', siteApiOrigin()],",
						"'connect-src': ['self', 'https://app.dealsystem.io'],",
					),
				},
				{
					'svelte.config.js': baseText('svelte.config.js').replace(
						"\t\t\t\t'connect-src': ['self', siteApiOrigin()],\n",
						'',
					),
				},
				// `<MapEmbed>` ohne die Freigabe in der CSP (ältere oder veränderte svelte.config.js).
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<MapEmbed lat={53.87} lon={10.69} title="Anfahrt" />',
						"\timport { MapEmbed } from '@dealsystem/site';\n",
					),
				},
			],
		},
		{
			stage: O,
			pass: [
				{
					'index.html': page({
						head: `<meta http-equiv="content-security-policy" content="default-src 'self'; frame-src 'self' https://www.openstreetmap.org">`,
						body: '<iframe src="https://www.openstreetmap.org/export/embed.html" title="Karte"></iframe>',
					}),
				},
			],
			fail: [
				{
					'index.html': page({
						head: `<meta http-equiv="content-security-policy" content="default-src 'self'; frame-src 'self'">`,
						body: '<iframe src="https://www.google.com/maps?output=embed" title="Karte"></iframe>',
					}),
				},
				{
					'index.html': page({
						head: `<meta http-equiv="content-security-policy" content="default-src 'self'">\n<script src="https://widget.example.com/w.js"></script>`,
					}),
				},
			],
		},
	],
	'CNT-001': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						`<h1>A</h1>\n<Text key="start.lang" default="${'Langer Text. '.repeat(20)}" multiline />\n<pre>${'Code '.repeat(40)}</pre>`,
					),
				},
				// Überschriften als Slot oder aus Daten; kurze Beschriftungen bleiben erlaubt.
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Text key="start.anfahrt" default="Anfahrt" as="h2" />\n<h2>{titel}</h2>\n<a href="/kontakt">Kontakt</a>',
						"\tconst titel = 'x';\n",
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						`<h1>A</h1>\n<p>${'Wir sind seit vielen Jahren für Sie da. '.repeat(5)}</p>`,
					),
				},
				// Kurze feste Überschrift: Der Kunde kann sie im CRM nicht umbenennen.
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<h2 id="anfahrt">Anfahrt</h2>',
					),
				},
			],
		},
	],
	'CNT-002': [
		{
			stage: S,
			pass: [
				// Firmendaten aus dem CRM; Jahreszahlen, Preise und Flächen sind keine Telefonnummern.
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<p>{data.site.address}</p>\n<a href="mailto:{data.site.email}">{data.site.email}</a>\n<p>Seit 1998, über 120 Objekte, 320.000 €, 85 m².</p>',
						'\tlet { data } = $props();\n',
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<p>Breite Straße 12, 23552 Lübeck</p>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<p>Rufen Sie uns an: 0451 1234567</p>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<p>Schreiben Sie an info@hansen-immobilien.de</p>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<a href="tel:+494511234567">Anrufen</a>',
					),
				},
			],
		},
	],
	'CNT-004': [
		{
			stage: S,
			pass: [
				// Eigener Kopf ohne die Tags von <Seo> ist in Ordnung.
				{
					'src/routes/+page.svelte': homePage(
						'<svelte:head>\n\t<link rel="canonical" href="https://muster.de/" />\n</svelte:head>\n<Text key="start.titel" default="Willkommen" as="h1" />',
					),
				},
			],
			fail: [
				{
					'src/routes/kontakt/+page.svelte':
						'<svelte:head>\n\t<title>Kontakt</title>\n\t<meta name="description" content="Schreiben Sie uns." />\n</svelte:head>\n<h1>Kontakt</h1>\n',
				},
				{
					'src/routes/+page.svelte': homePage(
						'<svelte:head>\n\t<meta property="og:image" content="/bild.jpg" />\n</svelte:head>\n<Text key="start.titel" default="Willkommen" as="h1" />',
					),
				},
				{
					'src/routes/+layout.svelte': baseText('src/routes/+layout.svelte').replace(
						'<SiteHead favicon="/favicon.svg" />',
						'',
					),
				},
				{
					'src/app.html': baseText('src/app.html').replace(
						'%sveltekit.head%',
						'<link rel="icon" href="%sveltekit.assets%/favicon.svg" />\n\t\t%sveltekit.head%',
					),
				},
			],
		},
	],
	'CNT-003': [
		{
			stage: S,
			pass: [
				// In geschweiften Klammern ist `\n` JavaScript, also ein echter Zeilenumbruch; Backticks ebenso.
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<RichText key="start.ablauf" default={\'1. Anfragen\\n2. Besichtigen\'} />\n<Text key="start.zeilen" multiline default={`Zeile 1\nZeile 2`} />',
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<RichText key="start.ablauf" default="1. Anfragen\\n2. Besichtigen" />',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen\\nbei uns" as="h1" />',
					),
				},
			],
		},
	],
};

async function findingsFor(stage: CheckStage, overlay: Overlay): Promise<Finding[]> {
	const dir = materialize(stage === 'source' ? BASE_SOURCE : BASE_OUTPUT, overlay);
	const result = await runCheck(stage === 'source' ? { projectDir: dir } : { outputDir: dir });
	return [...result.errors, ...result.warnings];
}

afterAll(() => cleanupFixtures());

describe('Basis-Fixtures', () => {
	it('die Quelle besteht ohne jede Meldung', async () => {
		expect(await findingsFor('source', {})).toEqual([]);
	});
	it('die Ausgabe besteht ohne jede Meldung', async () => {
		expect(await findingsFor('output', {})).toEqual([]);
	});
});

describe('Zuordnung der SDK-Meldungen aus validateSiteConfig', () => {
	it('E-Mail/Telefon nur als QUA-005, Schlüssel nur als QUA-006, nicht zusätzlich STR-005', async () => {
		const reach = await findingsFor('source', {
			'dealsystem.config.ts': baseText('dealsystem.config.ts').replace("standardField: 'email', ", ''),
		});
		expect(reach.map((f) => f.rule)).toEqual(['QUA-005']);
		const key = await findingsFor('source', {
			'dealsystem.config.ts': baseText('dealsystem.config.ts').replace('kontakt: {', 'Kontakt_Formular: {'),
		});
		// Zweiter Fund: `<LeadForm funnel="kontakt">` zeigt auf den alten Schlüssel.
		expect(key.map((f) => f.rule)).toEqual(['QUA-006', 'QUA-006']);
		expect(key[0]?.line).toBe(
			baseText('dealsystem.config.ts')
				.split('\n')
				.findIndex((l) => l.includes('kontakt: {')) + 1,
		);
	});

	it('nennt die Zeile des fehlerhaften Felds', async () => {
		const [finding] = await findingsFor('source', {
			'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(
				"type: 'textarea'",
				"type: 'longtext'",
			),
		});
		expect(finding).toMatchObject({ rule: 'STR-005', file: 'dealsystem.config.ts' });
		expect(finding?.line).toBe(
			baseText('dealsystem.config.ts')
				.split('\n')
				.findIndex((l) => l.includes("type: 'textarea'")) + 1,
		);
	});
});

describe('CNT-004: Titel und Favicon aus dem CRM', () => {
	it('meldet jeden festen Tag mit Datei und Zeile, als Warnung', async () => {
		const found = (
			await findingsFor('source', {
				'src/routes/kontakt/+page.svelte':
					'<svelte:head>\n\t<title>Kontakt</title>\n\t<meta name="description" content="Schreiben Sie uns." />\n</svelte:head>\n<h1>Kontakt</h1>\n',
			})
		).filter((f) => f.rule === 'CNT-004');
		expect(found.map((f) => [f.severity, f.file, f.line])).toEqual([
			['warning', 'src/routes/kontakt/+page.svelte', 2],
			['warning', 'src/routes/kontakt/+page.svelte', 3],
		]);
		expect(found[0]!.message).toContain('Google und Teilen');
		expect(found[0]!.fix).toContain('<Seo title="…" description="…" />');
	});
});

describe('QUA-006: Slot-Schlüssel vom Seitennamen', () => {
	it('nennt den Grund und schlägt einen gültigen Schlüssel vor', async () => {
		const found = (
			await findingsFor('source', {
				'src/routes/+page.svelte': homePage('<Text key="ueber-uns.titel" default="Über uns" as="h1" />'),
			})
		).filter((f) => f.rule === 'QUA-006');
		expect(found).toHaveLength(1);
		expect(found[0]!.severity).toBe('error');
		expect(found[0]!.message).toContain('Bindestrich oder Unterstrich im ersten Teil ist nicht erlaubt');
		expect(found[0]!.message).toContain('Nimm "ueberuns.titel"');
		expect(found[0]!.fix).toContain('`ueberuns.team.titel`');
	});
});

describe('SEC-008: CSP der fertigen Seite und die Site-API', () => {
	const csp = (connect: string): Overlay => ({
		'index.html': page({
			head: `<meta http-equiv="content-security-policy" content="default-src 'self'; connect-src 'self' ${connect}">`,
		}),
	});
	const check = async (overlay: Overlay, apiUrl?: string): Promise<Finding[]> => {
		const dir = materialize(BASE_OUTPUT, overlay);
		const result = await runCheck({ outputDir: dir, stages: ['output'], ...(apiUrl ? { apiUrl } : {}) });
		return [...result.errors, ...result.warnings].filter((f) => f.rule === 'SEC-008');
	};

	it('meldet, wenn die Seite für eine Site-API gebaut wurde, die ihre CSP nicht erlaubt', async () => {
		const found = await check(csp('https://app.dealsystem.io'), 'https://staging.dealsystem.io');
		expect(found).toHaveLength(1);
		expect(found[0]!.message).toContain('https://staging.dealsystem.io');
		expect(found[0]!.message).toContain('Formular und Captcha');
		expect(found[0]!.fix).toContain('siteApiOrigin()');
	});

	it('ist zufrieden, wenn die CSP genau diese Site-API erlaubt, auch lokal über http', async () => {
		expect(await check(csp('https://staging.dealsystem.io'), 'https://staging.dealsystem.io/')).toEqual([]);
		expect(await check(csp('http://localhost:5173'), 'http://localhost:5173')).toEqual([]);
	});

	it('prüft nichts, wenn keine Site-API genannt ist (lokaler Build ohne Umgebung)', async () => {
		expect(await check(csp('https://app.dealsystem.io'))).toEqual([]);
	});
});

describe('Abdeckung', () => {
	it('jede Regel mit Prüfstufe hat Fälle für jede ihrer Stufen', () => {
		for (const rule of RULES) {
			for (const stage of rule.stages.filter((s) => s !== 'browser')) {
				const cases = CASES[rule.id]?.filter((c) => c.stage === stage) ?? [];
				expect(cases.length, `${rule.id} (${stage})`).toBeGreaterThan(0);
				expect(
					cases.every((c) => c.pass.length > 0 && c.fail.length > 0),
					`${rule.id} (${stage})`,
				).toBe(true);
			}
		}
	});
});

for (const [id, cases] of Object.entries(CASES)) {
	describe(id, () => {
		for (const c of cases) {
			c.pass.forEach((overlay, i) => {
				it(`${c.stage}: Positiv-Beispiel ${i + 1} meldet nichts für ${id}`, async () => {
					const own = (await findingsFor(c.stage, overlay)).filter((f) => f.rule === id);
					expect(own).toEqual([]);
				});
			});
			c.fail.forEach((overlay, i) => {
				it(`${c.stage}: Negativ-Beispiel ${i + 1} meldet ${id} mit Korrektur`, async () => {
					const own = (await findingsFor(c.stage, overlay)).filter((f) => f.rule === id);
					expect(own.length).toBeGreaterThan(0);
					for (const f of own) {
						expect(f.message.length).toBeGreaterThan(5);
						expect(f.fix.length).toBeGreaterThan(5);
						expect(f.severity).toBe(RULES.find((r) => r.id === id)?.severity);
					}
				});
			});
		}
	});
}
