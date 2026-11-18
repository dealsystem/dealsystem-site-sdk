// Je Regel mindestens ein Projekt, das bestehen muss, und eines, das scheitern muss.
// Grundlage sind die vollständigen Fixture-Projekte `fixtures/base` (Quelle) und `fixtures/output-base` (Ausgabe).

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { RULES } from '../src/check/catalog.js';
import { runCheck } from '../src/check/run.js';
import { LEGACY_SVELTE_CONFIG_TEMPLATE, SVELTE_CONFIG_TEMPLATE } from '../src/project/svelteConfig.js';
import type { CheckOptions, CheckStage, Finding } from '../src/check/types.js';
import { buildCspDirectives, resolveExternal, type ExternalDef } from '@dealsystem/site/config';
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

/** dealsystem.config.ts der Basis mit einem Kontaktformular aus `n` Feldern (eines davon E-Mail). */
const manyFields = (n: number): string =>
	baseText('dealsystem.config.ts').replace(
		/(kontakt: \{[\s\S]*?)fields: \[[\s\S]*?\n\t\t\t\],/,
		`$1fields: [\n\t\t\t\t{ name: 'email', type: 'email', standardField: 'email', required: true },\n${Array.from(
			{ length: n - 1 },
			(_, i) => `\t\t\t\t{ name: 'f${i}', type: 'text' },`,
		).join('\n')}\n\t\t\t],`,
	);
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
	/** Zusätzliche Optionen für `runCheck` (Build-Host: `external`, `hosting`, `apiUrl`). */
	options?: Partial<CheckOptions>;
}

// ------------------------------------------------- Regelsatz 3: fremde Dienste

/** svelte.config.js des Starters ab Regelsatz 3: `csp: dealsystemCsp()`. */
const NEW_CSP: Overlay = { 'svelte.config.js': SVELTE_CONFIG_TEMPLATE };
const CHAT = `{ category: 'marketing', provider: 'HubSpot, Inc., USA', purpose: 'Live-Chat', privacyUrl: 'https://legal.hubspot.com/privacy-policy', script: ['https://js.hs-scripts.com'], connect: ['https://*.hubspot.com'] }`;
/** Neue CSP und `external` in dealsystem.config.ts. */
const withExternal = (external: string, extra: Overlay = {}): Overlay => ({
	...NEW_CSP,
	'dealsystem.config.ts': baseText('dealsystem.config.ts').replace(
		'defineSite({',
		`defineSite({\n\texternal: ${external},`,
	),
	...extra,
});
const IMPORT_EXTERNAL = "\timport { Embed, ExternalScript } from '@dealsystem/site';\n";
const embedPage = (body: string): Overlay => ({
	'src/routes/+page.svelte': homePage(`<h1>A</h1>\n${body}`, IMPORT_EXTERNAL),
});
const YT = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

/** Meta-Tag wie SvelteKit ihn schreibt: Schlüsselwörter in Anführungszeichen, Direktiven mit `;`. */
function metaTag(directives: Record<string, string[]>): string {
	const keyword =
		/^(self|none|unsafe-inline|unsafe-eval|wasm-unsafe-eval|strict-dynamic|unsafe-hashes|sha\d+-.*)$/;
	const content = Object.entries(directives)
		.map(([name, sources]) => [name, ...sources.map((v) => (keyword.test(v) ? `'${v}'` : v))].join(' '))
		.join('; ');
	return `<meta http-equiv="content-security-policy" content="${content}">`;
}
const API = 'https://app.dealsystem.io';
const DECLARED = resolveExternal({ video: { preset: 'youtube' } } satisfies Record<string, ExternalDef>);
const expectedMeta = (patch: (d: Record<string, string[]>) => void = () => {}): string => {
	const d = buildCspDirectives(DECLARED, API);
	d['script-src'] = [...d['script-src']!, 'sha256-AbCdEf0123456789+/='];
	patch(d);
	return metaTag(d);
};
const EMBED_MARKER =
	'<div data-ds-embed="video" data-ds-src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"><button type="button">Video laden</button></div>';
const SCRIPT_MARKER =
	'<span hidden data-ds-external-script="chat" data-ds-src="https://js.hs-scripts.com/1.js"></span>';

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
			// Regelsatz 3: `dealsystemCsp()` und gültige Deklarationen.
			pass: [
				NEW_CSP,
				withExternal(`{ video: { preset: 'youtube' }, rundgang: { preset: 'vimeo' }, chat: ${CHAT} }`),
				// Die feste Liste bis SDK 0.1 bleibt gültig (unveränderte Live-Seite).
				{ 'svelte.config.js': LEGACY_SVELTE_CONFIG_TEMPLATE },
			],
			fail: [
				// Platzhalter in script und frame: jeder Unterhost wäre offen.
				withExternal(`{ chat: { category: 'marketing', script: ['https://*.hubspot.com'] } }`),
				withExternal(`{ karte: { category: 'media', frame: ['https://*.google.com'] } }`),
				// Alles, was jeden Host öffnet.
				withExternal(`{ chat: { category: 'marketing', connect: ['*'] } }`),
				withExternal(`{ chat: { category: 'marketing', connect: ['https:'] } }`),
				withExternal(`{ chat: { category: 'marketing', img: ['data:'] } }`),
				withExternal(`{ chat: { category: 'marketing', script: ["'unsafe-eval'"] } }`),
				// Platzhalter auf einer Endung, unter der jeder eine Adresse bekommt.
				withExternal(`{ chat: { category: 'marketing', connect: ['https://*.github.io'] } }`),
				withExternal(`{ chat: { category: 'marketing', connect: ['https://*.co.uk'] } }`),
				// Unverschlüsselt, mit Pfad, mit Port, groß geschrieben.
				withExternal(`{ chat: { category: 'marketing', script: ['http://js.example.com'] } }`),
				withExternal(`{ chat: { category: 'marketing', script: ['https://js.example.com/a.js'] } }`),
				withExternal(`{ chat: { category: 'marketing', script: ['https://js.example.com:8443'] } }`),
				withExternal(`{ chat: { category: 'marketing', script: ['https://JS.example.com'] } }`),
				// Keine Kategorie „notwendig“, keine ohne Host, keine unbekannte Vorlage, nichts neben preset.
				withExternal(`{ chat: { category: 'necessary', script: ['https://js.example.com'] } }`),
				withExternal(`{ chat: { category: 'marketing' } }`),
				withExternal(`{ video: { preset: 'tiktok' } }`),
				withExternal(`{ video: { preset: 'youtube', script: ['https://evil.example.com'] } }`),
				// DealSystem selbst gehört nicht in die Deklaration.
				withExternal(`{ chat: { category: 'marketing', connect: ['https://app.dealsystem.io'] } }`),
				// Nicht feste Werte kommen nicht in die CSP.
				withExternal(`{ chat: { category: 'marketing', script: [process.env.HOST] } }`),
				// dealsystemCsp() mit Argumenten, aus falschem Modul, oder svelte.config.js führt eigenen Code aus.
				{
					'svelte.config.js': SVELTE_CONFIG_TEMPLATE.replace(
						'dealsystemCsp()',
						"dealsystemCsp({ 'script-src': ['*'] })",
					),
				},
				{
					'svelte.config.js': SVELTE_CONFIG_TEMPLATE.replace(
						"import { dealsystemCsp } from '@dealsystem/site/csp';",
						"import { dealsystemCsp } from './csp.js';",
					),
				},
				{
					'svelte.config.js': SVELTE_CONFIG_TEMPLATE.replace(
						'export default config;',
						"config.kit.csp.directives['script-src'].push('*');\nexport default config;",
					),
				},
				{ 'svelte.config.js': SVELTE_CONFIG_TEMPLATE.replace('dealsystemCsp()', 'eigeneCsp()') },
				// Deklaration mit der alten, festen CSP: Die Dienste blieben gesperrt.
				{
					...withExternal(`{ video: { preset: 'youtube' } }`),
					'svelte.config.js': LEGACY_SVELTE_CONFIG_TEMPLATE,
				},
				// Die alte, feste CSP von Hand um einen Host erweitert.
				{
					'svelte.config.js': LEGACY_SVELTE_CONFIG_TEMPLATE.replace(
						"'frame-src': ['self', 'https://www.openstreetmap.org'],",
						"'frame-src': ['self', 'https://www.openstreetmap.org', 'https://www.youtube-nocookie.com'],",
					),
				},
			],
		},
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
					...NEW_CSP,
					'src/routes/+page.svelte': homePage(
						'<svelte:head><script type="application/ld+json">[]</script></svelte:head>\n<h1>A</h1>',
					),
				},
				// Eigene JSON-Daten mit anderer id führen nichts aus.
				{
					...NEW_CSP,
					'src/routes/+page.svelte': homePage(
						'<svelte:head><script type="application/json" id="preise">[]</script></svelte:head>\n<h1>A</h1>',
					),
				},
			],
			fail: [
				{
					...NEW_CSP,
					'src/routes/+page.svelte': homePage(
						'<svelte:head><script>window.chat = true;</script></svelte:head>\n<h1>A</h1>',
					),
				},
				{
					...NEW_CSP,
					'src/lib/rechnen.ts': 'export const run = (b: BufferSource) => WebAssembly.instantiate(b);\n',
				},
				{
					...NEW_CSP,
					'static/info.html': '<!doctype html><html lang="de"><script>alert(1)</script></html>\n',
				},
				// Inhaltsblock des SDK (Patchen statt Bauen) nie im eigenen Code, auch nicht als JSON und nicht mit
				// der alten CSP: Er würde das Patchen im Core aushebeln.
				{
					'src/routes/+page.svelte': homePage(
						'<svelte:head><script type="application/json" id="ds-content">[]</script></svelte:head>\n<h1>A</h1>',
					),
				},
				{ 'src/lib/patch.ts': "export const block = () => document.getElementById('ds-content');\n" },
				{
					'static/info.html':
						'<!doctype html><html lang="de"><script type="application/json" id="ds-content">[]</script></html>\n',
				},
			],
		},
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
			pass: [
				{},
				// Eigenes Formular ohne action: Absenden übernimmt der eigene Code (createLeadClient).
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<form onsubmit={(e) => e.preventDefault()}><label>PLZ <input name="plz" /></label><button>Weiter</button></form>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<dialog open><form method="dialog"><button>Schließen</button></form></dialog>',
					),
				},
			],
			fail: [
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<form action="/danke"><button>Senden</button></form>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<form><button formaction="https://evil.example.com/x">Senden</button></form>',
					),
				},
				{
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<form {...rest}><button>Senden</button></form>',
						'\tconst rest = {};\n',
					),
				},
				{
					'static/kontakt.html':
						'<!doctype html><html lang="de"><form action="https://formspree.io/f/x"></form></html>\n',
				},
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
				// Snippet als Datei, geladen von <ExternalScript> nach der Einwilligung „Marketing“.
				withExternal(
					`{ tags: { category: 'marketing', provider: 'Google', purpose: 'Messung', privacyUrl: 'https://policies.google.com/privacy', script: ['https://www.googletagmanager.com'] } }`,
					{
						...embedPage('<ExternalScript id="tags" src="/scripts/gtm.js" />'),
						'static/scripts/gtm.js':
							"window.dataLayer = window.dataLayer || [];\ndataLayer.push({ event: 'start' });\n",
					},
				),
			],
			fail: [
				// Datei in static/ ohne <ExternalScript>.
				{ ...NEW_CSP, 'static/scripts/gtm.js': "gtag('config', 'G-123');\n" },
				// Geladen, aber als „Externe Inhalte“ deklariert.
				withExternal(
					`{ tags: { category: 'media', provider: 'Google', purpose: 'Messung', privacyUrl: 'https://policies.google.com/privacy', script: ['https://www.googletagmanager.com'] } }`,
					{
						...embedPage('<ExternalScript id="tags" src="/scripts/gtm.js" />'),
						'static/scripts/gtm.js': "gtag('config', 'G-123');\n",
					},
				),
			],
		},
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
				withExternal(
					`{ video: { preset: 'youtube' } }`,
					embedPage(`<Embed id="video" src="${YT}" title="Rundgang" />`),
				),
				withExternal(
					`{ rundgang: { preset: 'vimeo' }, termin: { preset: 'calendly' } }`,
					embedPage(
						'<Embed id="rundgang" src="https://vimeo.com/76979871" title="Rundgang" />\n<Embed id="termin" src="https://calendly.com/makler/erstgespraech" title="Termin buchen" />',
					),
				),
				withExternal(
					`{ chat: ${CHAT} }`,
					embedPage(
						'<ExternalScript id="chat" src="https://js.hs-scripts.com/123.js" />\n<ExternalScript id="chat" src="/scripts/chat.js" />',
					),
				),
			],
			fail: [
				// Ohne Deklaration.
				{ ...NEW_CSP, ...embedPage(`<Embed id="video" src="${YT}" title="Rundgang" />`) },
				withExternal(
					`{ video: { preset: 'youtube' } }`,
					embedPage(`<ExternalScript id="chat" src="https://js.hs-scripts.com/1.js" />`),
				),
				// Adresse passt nicht zur Vorlage oder zum Host der Deklaration.
				withExternal(
					`{ video: { preset: 'youtube' } }`,
					embedPage('<Embed id="video" src="https://evil.example.com/embed/x" title="Rundgang" />'),
				),
				withExternal(
					`{ chat: ${CHAT} }`,
					embedPage('<ExternalScript id="chat" src="https://evil.example.com/x.js" />'),
				),
				withExternal(
					`{ chat: ${CHAT} }`,
					embedPage('<ExternalScript id="chat" src="//js.hs-scripts.com.evil.example/x.js" />'),
				),
				// Rahmen und Skripte ohne Baustein, auch wenn die CSP sie erlaubt.
				withExternal(
					`{ video: { preset: 'youtube' } }`,
					embedPage(
						'<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Video"></iframe>',
					),
				),
				withExternal(
					`{ chat: ${CHAT} }`,
					embedPage('<svelte:head><script src="https://js.hs-scripts.com/1.js"></script></svelte:head>'),
				),
				{ ...NEW_CSP, ...embedPage('<svelte:head><script src="/scripts/eigen.js"></script></svelte:head>') },
				// Deklariert, aber die alte, feste CSP sperrt den Rahmen.
				{
					...withExternal(
						`{ video: { preset: 'youtube' } }`,
						embedPage(`<Embed id="video" src="${YT}" title="Rundgang" />`),
					),
					'svelte.config.js': LEGACY_SVELTE_CONFIG_TEMPLATE,
				},
			],
		},
		{
			stage: O,
			options: { external: DECLARED, apiUrl: API },
			pass: [{ 'index.html': page({ head: expectedMeta(), body: EMBED_MARKER }) }],
			fail: [
				// Meta-Tag lockerer als die Deklaration.
				{
					'index.html': page({
						head: expectedMeta((d) => d['script-src']!.push('https://evil.example.com')),
					}),
				},
				{ 'index.html': page({ head: expectedMeta((d) => d['connect-src']!.push('*')) }) },
				{ 'index.html': page({ head: expectedMeta((d) => d['script-src']!.push('unsafe-eval')) }) },
				{
					'index.html': page({
						head: expectedMeta((d) => (d['report-uri'] = ['https://evil.example.com/r'])),
					}),
				},
				{ 'index.html': page({ head: expectedMeta((d) => delete d['form-action']) }) },
				{ 'index.html': page({ head: expectedMeta((d) => delete d['default-src']) }) },
				// Baustein lädt einen Host, den der Meta-Tag nicht erlaubt.
				{
					'index.html': page({
						head: expectedMeta((d) => (d['frame-src'] = ['self'])),
						body: EMBED_MARKER,
					}),
				},
				{ 'index.html': page({ head: expectedMeta(), body: SCRIPT_MARKER }) },
			],
		},
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
						'<h1>A</h1>\n<MapEmbed lat={53.87} lon={10.69} title="Anfahrt" />',
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
	'SEC-009': [
		{
			stage: S,
			pass: [
				{
					...NEW_CSP,
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<label>PLZ <input type="text" name="plz" /></label>',
					),
				},
			],
			fail: [
				{
					...NEW_CSP,
					'src/routes/+page.svelte': homePage(
						'<h1>A</h1>\n<label>Passwort <input type="password" name="pw" /></label>',
					),
				},
				{
					...NEW_CSP,
					'static/login.html': '<!doctype html><html lang="de"><input type="password"></html>\n',
				},
			],
		},
		{
			stage: O,
			options: { external: [] },
			pass: [{ 'index.html': page({ body: '<label>PLZ <input type="text" name="plz"></label>' }) }],
			fail: [{ 'index.html': page({ body: '<label>Passwort <input type="password" name="pw"></label>' }) }],
		},
	],
	'SEC-011': [
		{
			stage: O,
			options: { hosting: { standardHostOnly: true, sitesDomainOnPsl: false } },
			pass: [{}, { 'index.html': page({ body: EMBED_MARKER }) }],
			fail: [{ 'index.html': page({ body: SCRIPT_MARKER }) }],
		},
		{
			// Eigene Domain oder PSL-Eintrag: Skripte gehen.
			stage: O,
			options: { hosting: { standardHostOnly: false, sitesDomainOnPsl: false } },
			pass: [{ 'index.html': page({ body: SCRIPT_MARKER }) }],
			fail: [],
		},
		{
			stage: O,
			options: { hosting: { standardHostOnly: true, sitesDomainOnPsl: true } },
			pass: [{ 'index.html': page({ body: SCRIPT_MARKER }) }],
			fail: [],
		},
	],
	'PRV-008': [
		{
			stage: S,
			pass: [withExternal(`{ video: { preset: 'youtube' } }`), withExternal(`{ chat: ${CHAT} }`)],
			fail: [
				withExternal(`{ chat: { category: 'marketing', script: ['https://js.hs-scripts.com'] } }`),
				withExternal(
					`{ chat: { category: 'marketing', provider: 'HubSpot', purpose: 'Chat', script: ['https://js.hs-scripts.com'] } }`,
				),
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
	'QUA-010': [
		{
			stage: S,
			pass: [{ 'dealsystem.config.ts': manyFields(50) }],
			fail: [{ 'dealsystem.config.ts': manyFields(51) }],
		},
	],
	'QUA-008': [
		{
			stage: S,
			pass: [
				{
					'src/lib/Funnel.svelte':
						'<script lang="ts">\n\timport { createLeadClient, LeadHoneypot } from \'@dealsystem/site\';\n\tconst lead = createLeadClient(\'kontakt\');\n\tlet r = $state(null);\n\tconst send = async () => (r = await lead.submit({}));\n</script>\n<LeadHoneypot client={lead} />\n<button type="button" onclick={send}>Senden</button>\n{#if r && !r.ok && r.fallback}<p>{r.fallback.phone}</p>{/if}\n',
				},
			],
			fail: [
				// kein Ausweichkontakt
				{
					'src/lib/Funnel.svelte':
						'<script lang="ts">\n\timport { createLeadClient, LeadHoneypot } from \'@dealsystem/site\';\n\tconst lead = createLeadClient(\'kontakt\');\n\tconst send = () => lead.submit({});\n</script>\n<LeadHoneypot client={lead} />\n<button type="button" onclick={send}>Senden</button>\n',
				},
				// keine Bot-Falle
				{
					'src/lib/Funnel.svelte':
						'<script lang="ts">\n\timport { createLeadClient } from \'@dealsystem/site\';\n\tconst lead = createLeadClient(\'kontakt\');\n\tlet r = $state(null);\n\tconst send = async () => (r = await lead.submit({}));\n</script>\n<button type="button" onclick={send}>Senden</button>\n{#if r && !r.ok}<p>{r.fallback?.phone}</p>{/if}\n',
				},
			],
		},
	],
	'QUA-009': [
		{
			stage: S,
			pass: [
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster ab="2026-12-01T18:00:00+01:00" bis="2026-12-01T19:30:00Z"><p>Jetzt</p></Zeitfenster>',
					),
				},
			],
			fail: [
				// ohne Zeitzone
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster bis="2026-12-01T18:00:00"><p>Jetzt</p></Zeitfenster>',
					),
				},
				// Variable: kein Rebuild zur Grenze möglich
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster bis={ende}><p>Jetzt</p></Zeitfenster>',
						"\tconst ende = '2026-12-01T18:00:00+01:00';\n",
					),
				},
				// ab nach bis
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster ab="2026-12-02T00:00:00Z" bis="2026-12-01T00:00:00Z"><p>Nie</p></Zeitfenster>',
					),
				},
				// weder ab noch bis
				{
					'src/routes/+page.svelte': homePage(
						'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster><p>Immer</p></Zeitfenster>',
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

async function findingsFor(
	stage: CheckStage,
	overlay: Overlay,
	options: Partial<CheckOptions> = {},
): Promise<Finding[]> {
	const dir = materialize(stage === 'source' ? BASE_SOURCE : BASE_OUTPUT, overlay);
	const result = await runCheck({
		...options,
		...(stage === 'source' ? { projectDir: dir } : { outputDir: dir }),
	});
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

describe('QUA-009: Zeitfenster', () => {
	it('ist eine Warnung mit Zeile und nennt die Zeitzone', async () => {
		const found = (
			await findingsFor('source', {
				'src/routes/+page.svelte': homePage(
					'<Text key="start.titel" default="Willkommen" as="h1" />\n<Zeitfenster bis="2026-12-01T18:00:00"><p>Jetzt</p></Zeitfenster>',
				),
			})
		).filter((f) => f.rule === 'QUA-009');
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ severity: 'warning', file: 'src/routes/+page.svelte', line: 8 });
		expect(found[0]!.message).toContain('hat keine Zeitzone');
		expect(found[0]!.message).toContain('+01:00');
	});
});

describe('QUA-010: Feldgrenze des Core', () => {
	it('51 Felder: Warnung mit Zeile; über 60 bleibt es ein Fehler (STR-005)', async () => {
		const found = await findingsFor('source', { 'dealsystem.config.ts': manyFields(51) });
		const own = found.filter((f) => f.rule === 'QUA-010');
		expect(own).toHaveLength(1);
		expect(own[0]).toMatchObject({
			severity: 'warning',
			file: 'dealsystem.config.ts',
			line: expect.any(Number),
		});
		expect(own[0]!.message).toContain('51 Felder');
		expect(found.filter((f) => f.severity === 'error')).toEqual([]);

		const over = await findingsFor('source', { 'dealsystem.config.ts': manyFields(61) });
		expect(over.filter((f) => f.severity === 'error').map((f) => f.rule)).toEqual(['STR-005']);
	});

	it('die Grenze ist die des Vertrags', async () => {
		const { FUNNEL_MANIFEST_MAX_FIELDS, MAX_FUNNEL_FIELDS } = await import('@dealsystem/site/config');
		expect(FUNNEL_MANIFEST_MAX_FIELDS).toBe(50);
		expect(MAX_FUNNEL_FIELDS).toBe(60);
		const contract = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../../site/contract/funnel-code-config.md'),
			'utf8',
		);
		expect(contract).toMatch(/höchstens \*\*50 Felder\*\*/);
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
		expect(found[0]!.fix).toContain('dealsystemCsp()');
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
					cases.some((c) => c.pass.length > 0) && cases.some((c) => c.fail.length > 0),
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
					const own = (await findingsFor(c.stage, overlay, c.options)).filter((f) => f.rule === id);
					expect(own).toEqual([]);
				});
			});
			c.fail.forEach((overlay, i) => {
				it(`${c.stage}: Negativ-Beispiel ${i + 1} meldet ${id} mit Korrektur`, async () => {
					const own = (await findingsFor(c.stage, overlay, c.options)).filter((f) => f.rule === id);
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

describe('SEC-006: Inhaltsblock ds-content gehört dem SDK', () => {
	const sec006 = async (overlay: Overlay) =>
		(await findingsFor('source', overlay))
			.filter((f) => f.rule === 'SEC-006')
			.map((f) => [f.severity, f.file, f.line]);

	it('meldet eigenen Block und Code, der ihn nennt, als Fehler (Regelsatz 3)', async () => {
		expect(
			await sec006({
				'src/routes/+page.svelte':
					'<svelte:head>\n\t<script type="application/json" id="ds-content">{}</script>\n</svelte:head>\n<h1>Hallo</h1>\n',
				'src/lib/lesen.ts': "export const block = () => document.getElementById('ds-content');\n",
			}),
		).toEqual([
			['error', 'src/lib/lesen.ts', 1],
			['error', 'src/routes/+page.svelte', 2],
		]);
	});

	it('eigene JSON-Daten mit anderer id sind in Ordnung', async () => {
		expect(
			await sec006({
				'src/routes/+page.svelte':
					'<svelte:head>\n\t<script type="application/ld+json" id="firma">{}</script>\n</svelte:head>\n<h1>Hallo</h1>\n',
			}),
		).toEqual([]);
	});
});

describe('Regelsatz 3: unveränderte Seiten bauen weiter', () => {
	const legacy = { 'svelte.config.js': LEGACY_SVELTE_CONFIG_TEMPLATE };
	const raw = embedPage(
		'<ConsentGate category="media">\n\t<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4" title="Karte"></iframe>\n</ConsentGate>',
	);
	const password = embedPage('<label>Passwort <input type="password" name="pw" /></label>');

	it('die feste CSP bis SDK 0.1 besteht ohne Meldung', async () => {
		expect(await findingsFor('source', legacy)).toEqual([]);
	});

	it('Verschärfungen sind bei der festen CSP nur Warnungen, die Prüfung besteht', async () => {
		for (const overlay of [raw, password]) {
			const dir = materialize(BASE_SOURCE, { ...legacy, ...overlay });
			const result = await runCheck({ projectDir: dir });
			expect(result.passed).toBe(true);
			expect(result.warnings.map((f) => f.rule)).toEqual(
				expect.arrayContaining([overlay === raw ? 'SEC-008' : 'SEC-009']),
			);
		}
	});

	it('mit dealsystemCsp() sind dieselben Funde Fehler', async () => {
		for (const overlay of [raw, password]) {
			const dir = materialize(BASE_SOURCE, { ...NEW_CSP, ...overlay });
			const result = await runCheck({ projectDir: dir });
			expect(result.passed).toBe(false);
			expect(result.errors.map((f) => f.rule)).toContain(overlay === raw ? 'SEC-008' : 'SEC-009');
		}
	});

	it('Ausgabe ohne bekannte Deklaration (älteres SDK auf dem Build-Host): Abweichung nur als Warnung', async () => {
		const dir = materialize(BASE_OUTPUT, {
			'index.html': page({
				head: `<meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self' https://evil.example.com">`,
			}),
		});
		const result = await runCheck({ outputDir: dir });
		expect(result.passed).toBe(true);
		expect(result.warnings.map((f) => f.rule)).toContain('SEC-008');
	});

	it('lokal mit Quelle und Ausgabe: die Deklaration kommt aus der Quelle', async () => {
		const source = materialize(BASE_SOURCE, withExternal(`{ video: { preset: 'youtube' } }`));
		const meta = (d: Record<string, string[]>) => d;
		const ok = materialize(BASE_OUTPUT, {
			'index.html': page({ head: expectedMeta(meta), body: EMBED_MARKER }),
		});
		expect((await runCheck({ projectDir: source, outputDir: ok, apiUrl: API })).passed).toBe(true);
		// Ohne die Deklaration fehlt der Rahmen von YouTube in der erwarteten CSP: Der Meta-Tag ist lockerer.
		const plain = materialize(BASE_SOURCE, NEW_CSP);
		const result = await runCheck({ projectDir: plain, outputDir: ok, apiUrl: API });
		expect(result.errors.some((f) => f.rule === 'SEC-008' && f.message.includes('youtube-nocookie'))).toBe(
			true,
		);
	});
});

describe('sync --fix-config: Vorlage', () => {
	it('die Vorlage nutzt dealsystemCsp() und besteht SEC-005 und SEC-008', async () => {
		expect(SVELTE_CONFIG_TEMPLATE).toContain('csp: dealsystemCsp()');
		const own = (await findingsFor('source', NEW_CSP)).filter((f) => /^SEC-00[58]$/.test(f.rule));
		expect(own).toEqual([]);
	});
});
