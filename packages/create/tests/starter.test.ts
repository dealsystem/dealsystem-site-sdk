// Der Starter, so wie ein Kunde ihn bekommt: Er muss ohne jede Änderung
// `dealsystem check` bestehen, sich bauen lassen und typrein sein.
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runCheck, type CheckResult } from 'dealsystem/check';
import { SVELTE_CONFIG_TEMPLATE, VITE_CONFIG_TEMPLATE } from '../../cli/dist/project/svelteConfig.js';
import {
	createStarter,
	FILLED_SNAPSHOT,
	packageDir,
	simulateInstallAndInit,
	writeSnapshot,
	type StarterProject,
} from './helpers.js';

const run = promisify(execFile);

const problems = (result: CheckResult) =>
	[...result.errors, ...result.warnings].map(
		(f) => `${f.rule} ${f.severity} ${f.file ?? ''}:${f.line ?? ''} ${f.message}`,
	);

async function build(dir: string): Promise<void> {
	const vite = join(packageDir('vite', dir), 'bin/vite.js');
	await run(process.execPath, [vite, 'build'], {
		cwd: dir,
		env: {
			...process.env,
			PUBLIC_DEALSYSTEM_API: 'https://app.dealsystem.io',
			PUBLIC_DEALSYSTEM_SITE_KEY: 'dsp_abcd1234_abcdefghijklmnopqrstuvwx',
			PUBLIC_DEALSYSTEM_SITE_URL: 'https://muster-immobilien.de',
		},
	});
}

const page = (dir: string, file: string) => readFile(join(dir, 'build', file), 'utf8');

/** HTML ohne die Sicherheitsregeln im Kopf: Dort stehen erlaubte Adressen, geladen wird davon nichts. */
const withoutCsp = (html: string) => html.replace(/<meta http-equiv="content-security-policy"[^>]*>/i, '');

describe('Starter ohne Inhalte aus dem CRM (erster Tag)', () => {
	let project: StarterProject;

	beforeAll(async () => {
		project = await createStarter();
		await simulateInstallAndInit(project.dir);
		await build(project.dir);
	});

	afterAll(() => project.remove());

	it('besteht alle Regeln am Quelltext, ohne Fehler und ohne Warnung', async () => {
		const result = await runCheck({ projectDir: project.dir, stages: ['source'] });
		expect(problems(result)).toEqual([]);
		expect(result.passed).toBe(true);
	});

	it('besteht alle Regeln an der fertigen Seite', async () => {
		const result = await runCheck({
			outputDir: join(project.dir, 'build'),
			stages: ['output'],
			siteUrl: 'https://muster-immobilien.de',
		});
		expect(problems(result)).toEqual([]);
		expect(result.passed).toBe(true);
	});

	it('erzeugt jede Seite, auch wenn es noch kein Angebot gibt', async () => {
		const files = await readdir(join(project.dir, 'build'));
		expect(files).toEqual(
			expect.arrayContaining([
				'index.html',
				'angebote.html',
				'kontakt.html',
				'impressum.html',
				'datenschutz.html',
				'404.html',
				'sitemap.xml',
				'robots.txt',
			]),
		);
		expect(await page(project.dir, 'angebote.html')).toContain('Zurzeit haben wir kein Angebot online.');
	});

	it('ohne „Google und Teilen“: eigene Titel, Favicon aus dem Code, Sitemap in robots.txt', async () => {
		const kontakt = await page(project.dir, 'kontakt.html');
		expect(kontakt.match(/<title>/g)).toHaveLength(1);
		expect(kontakt).toContain('<title>Kontakt – Meine Website</title>');
		expect(kontakt.match(/name="description"/g)).toHaveLength(1);
		expect(kontakt).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"');
		expect(kontakt).not.toContain('name="robots"');
		expect(kontakt).not.toContain('rel="manifest"');
		expect(await readdir(join(project.dir, 'build'))).not.toContain('manifest.webmanifest');
		expect(await page(project.dir, 'robots.txt')).toContain(
			'Sitemap: https://muster-immobilien.de/sitemap.xml',
		);
	});

	it('zeigt statt eines erfundenen Rechtstexts den Hinweis, wo der Kunde ihn einträgt', async () => {
		const impressum = await page(project.dir, 'impressum.html');
		expect(impressum).toContain('Der Impressumstext fehlt.');
		expect(impressum).toContain('im CRM unter Eigene Website → Rechtliches');
		expect(await page(project.dir, 'datenschutz.html')).toContain('Der Datenschutztext fehlt.');
	});

	it('lädt in keiner Seite etwas von fremden Servern', async () => {
		for (const file of [
			'index.html',
			'angebote.html',
			'kontakt.html',
			'impressum.html',
			'datenschutz.html',
		]) {
			const html = withoutCsp(await page(project.dir, file));
			const external = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
			expect(external, file).toEqual([]);
			expect(html, file).not.toMatch(/fonts\.googleapis|gstatic|googletagmanager|facebook/);
		}
		// Die Schrift liegt als Datei in der Seite.
		const assets = await readdir(join(project.dir, 'build/_app/immutable/assets'));
		expect(assets.some((name) => /inter.*\.woff2$/.test(name))).toBe(true);
	});

	it('erlaubt in der CSP genau die Site-API, für die die Seite gebaut wurde', async () => {
		const html = await page(project.dir, 'kontakt.html');
		const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
		expect(csp).toMatch(/connect-src 'self' https:\/\/app\.dealsystem\.io[ ;]/);
		expect(csp).toMatch(/frame-src 'self' https:\/\/www\.openstreetmap\.org/);
		expect(csp).toMatch(/worker-src 'self'/);

		const check = (apiUrl: string) =>
			runCheck({ outputDir: join(project.dir, 'build'), stages: ['output'], apiUrl }).then(problems);
		expect(await check('https://app.dealsystem.io')).toEqual([]);
		// Dieselbe Seite gegen eine andere Site-API: Formular und Captcha wären blockiert.
		const other = await check('https://staging.dealsystem.io');
		expect(other).toHaveLength(1);
		expect(other[0]).toMatch(/^SEC-008 error .*staging\.dealsystem\.io/);
	});

	it('übernimmt svelte.config.js und vite.config.ts unverändert aus der CLI', async () => {
		expect(await readFile(join(project.dir, 'svelte.config.js'), 'utf8')).toBe(SVELTE_CONFIG_TEMPLATE);
		expect(await readFile(join(project.dir, 'vite.config.ts'), 'utf8')).toBe(VITE_CONFIG_TEMPLATE);
	});

	it('ist typrein', async () => {
		const kit = join(packageDir('@sveltejs/kit', project.dir), 'svelte-kit.js');
		const check = join(packageDir('svelte-check', project.dir), 'bin/svelte-check');
		await run(process.execPath, [kit, 'sync'], { cwd: project.dir });
		const { stdout } = await run(
			process.execPath,
			[check, '--tsconfig', './tsconfig.json', '--output', 'machine'],
			{ cwd: project.dir },
		).catch((error: { stdout: string }) => ({ stdout: error.stdout }));
		expect(stdout).toMatch(/COMPLETED \d+ FILES 0 ERRORS 0 WARNINGS/);
	});
});

describe('Karte auf der Kontaktseite', () => {
	let project: StarterProject;
	const kontakt = () => join(project.dir, 'src/routes/kontakt/+page.svelte');

	beforeAll(async () => {
		project = await createStarter();
		await simulateInstallAndInit(project.dir);
	});

	afterAll(() => project.remove());

	async function withMarkup(script: string, markup: string): Promise<string[]> {
		const original = await readFile(kontakt(), 'utf8');
		const changed = original
			.replace("import { LeadForm, Text } from '@dealsystem/site';", script)
			.replace('</section>', `${markup}\n</section>`);
		expect(changed).not.toBe(original);
		await writeFile(kontakt(), changed);
		try {
			return problems(await runCheck({ projectDir: project.dir, stages: ['source'] }));
		} finally {
			await writeFile(kontakt(), original);
		}
	}

	it('die freigegebene Karte <MapEmbed> besteht die Prüfung mit der CSP des Starters', async () => {
		const found = await withMarkup(
			"import { LeadForm, MapEmbed, Text } from '@dealsystem/site';",
			'<MapEmbed lat={53.8676} lon={10.6866} title="Unser Büro in der Lübecker Altstadt" />',
		);
		expect(found).toEqual([]);
	});

	it('eine Google-Karte hinter der Einwilligung wird abgelehnt, mit dem Weg zur Lösung', async () => {
		const found = await withMarkup(
			"import { ConsentGate, LeadForm, Text } from '@dealsystem/site';",
			'<ConsentGate category="media">\n\t<iframe title="Karte" src="https://www.google.com/maps?q=Breite+Stra%C3%9Fe+12&output=embed"></iframe>\n</ConsentGate>',
		);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatch(/^SEC-008 error src\/routes\/kontakt\/\+page\.svelte:\d+ `<iframe>` lädt/);
		expect(found[0]).toContain('www.google.com');
		expect(found[0]).toContain('auch nach der Einwilligung');
	});

	it('feste Überschrift und feste Adresse werden gemeldet', async () => {
		const found = await withMarkup(
			"import { LeadForm, Text } from '@dealsystem/site';",
			'<h2 id="anfahrt">Anfahrt</h2>\n<p>Breite Straße 12, 23552 Lübeck</p>',
		);
		expect(found.map((f) => f.split(' ').slice(0, 2).join(' ')).sort()).toEqual([
			'CNT-001 warning',
			'CNT-002 warning',
		]);
	});
});

describe('Standardbilder der Bild-Slots im Manifest', () => {
	let project: StarterProject;

	beforeAll(async () => {
		project = await createStarter();
		await simulateInstallAndInit(project.dir);
		// Drei Wege zum Standardbild: Datei unter static/, Import (groß) und Import unter 4 KB (eingebettet).
		await mkdir(join(project.dir, 'static/bilder'), { recursive: true });
		await mkdir(join(project.dir, 'src/lib/bilder'), { recursive: true });
		await writeFile(join(project.dir, 'static/bilder/buero.jpg'), Buffer.alloc(6000, 1));
		await writeFile(join(project.dir, 'src/lib/bilder/inhaber.jpg'), Buffer.alloc(9000, 2));
		await writeFile(join(project.dir, 'src/lib/bilder/logo.png'), Buffer.alloc(500, 3));
		await mkdir(join(project.dir, 'src/routes/team'), { recursive: true });
		await writeFile(
			join(project.dir, 'src/routes/team/+page.svelte'),
			`<script lang="ts">
	import { MediaImage, Seo, Text } from '@dealsystem/site';
	import inhaber from '$lib/bilder/inhaber.jpg';
	import logo from '../../lib/bilder/logo.png';
	const variabel = '/bilder/buero.jpg';
</script>

<Seo title="Team" description="Unser Team." />
<Text key="team.titel" default="Team" as="h1" />
<MediaImage key="team.buero.foto" default="/bilder/buero.jpg" width={1600} height={900} alt="Unser Büro" />
<MediaImage key="team.inhaber.foto" default={inhaber} width={1200} height={1500} alt="Der Inhaber" />
<MediaImage key="team.logo.bild" default={logo} alt="Logo" />
<MediaImage key="team.variabel.bild" default={variabel} alt="Büro" />
`,
		);
		await build(project.dir);
	});

	afterAll(() => project.remove());

	it('meldet den Pfad im Artefakt, sonst null', async () => {
		const manifest = JSON.parse(await readFile(join(project.dir, '.dealsystem/manifest.json'), 'utf8')) as {
			slots: { key: string; type: string; defaultImage?: unknown }[];
		};
		const images = Object.fromEntries(
			manifest.slots.filter((s) => s.type === 'image').map((s) => [s.key, s.defaultImage]),
		);
		expect(images['team.buero.foto']).toEqual({ path: '/bilder/buero.jpg', width: 1600, height: 900 });
		expect(images['team.inhaber.foto']).toEqual({
			path: expect.stringMatching(/^\/_app\/immutable\/assets\/inhaber\.[\w-]+\.jpg$/),
			width: 1200,
			height: 1500,
		});
		// Unter 4 KB bettet Vite das Bild ein; bei einer Variablen lässt sich der Pfad nicht sicher sagen.
		expect(images['team.logo.bild']).toBeNull();
		expect(images['team.variabel.bild']).toBeNull();
		// Der gemeldete Pfad liegt wirklich in der fertigen Seite.
		const inhaber = (images['team.inhaber.foto'] as { path: string }).path;
		expect((await readFile(join(project.dir, 'build', inhaber))).byteLength).toBe(9000);
		expect(await readdir(join(project.dir, 'build/bilder'))).toContain('buero.jpg');
		// Andere Slots tragen das Feld nicht.
		expect(manifest.slots.find((s) => s.key === 'team.titel')).not.toHaveProperty('defaultImage');
	});
});

describe('Starter mit Inhalten aus dem CRM', () => {
	let project: StarterProject;

	beforeAll(async () => {
		project = await createStarter();
		await simulateInstallAndInit(project.dir);
		await writeSnapshot(project.dir, FILLED_SNAPSHOT);
		await build(project.dir);
	});

	afterAll(() => project.remove());

	it('besteht weiterhin alle Regeln an Quelltext und fertiger Seite', async () => {
		const source = await runCheck({ projectDir: project.dir, stages: ['source'] });
		const output = await runCheck({
			outputDir: join(project.dir, 'build'),
			stages: ['output'],
			siteUrl: 'https://muster-immobilien.de',
		});
		expect([...problems(source), ...problems(output)]).toEqual([]);
	});

	it('zeigt Texte, Angebote und Rechtstexte des Kunden', async () => {
		const start = await page(project.dir, 'index.html');
		expect(start).toContain('Wir kaufen Ihr Haus in Leipzig');
		expect(start).toContain('Muster Immobilien');
		expect(start).toContain('Sanierter Altbau in der Südvorstadt');
		expect(start).toMatch(
			/srcset="\/_ds\/media\/s1\/a1\/480\.jpg 480w, \/_ds\/media\/s1\/a1\/1600\.jpg 1600w"/,
		);
		expect(start).toContain('alt="Fassade des Altbaus mit Stuck"');

		const detail = await page(project.dir, 'angebote/altbau-suedvorstadt.html');
		expect(detail).toMatch(/<h1[^>]*>Sanierter Altbau in der Südvorstadt<\/h1>/);
		expect(detail).toContain('<strong>Balkon</strong>');
		// Ein Angebot ohne Bild und ohne Beschreibung bricht nichts.
		expect(await page(project.dir, 'angebote/baugrundstueck-markkleeberg.html')).toContain(
			'Baugrundstück in Markkleeberg',
		);

		const impressum = await page(project.dir, 'impressum.html');
		expect(impressum).toContain('Muster Immobilien GmbH, Musterstraße 1, 04109 Leipzig');
		expect(impressum).not.toContain('fehlt');
		expect(impressum.match(/<h1/g)).toHaveLength(1);
	});

	it('listet in der Sitemap jede Seite mit der Adresse der Seite', async () => {
		const sitemap = await page(project.dir, 'sitemap.xml');
		for (const path of [
			'/',
			'/angebote',
			'/angebote/altbau-suedvorstadt',
			'/kontakt',
			'/impressum',
			'/datenschutz',
		]) {
			expect(sitemap).toContain(`<loc>https://muster-immobilien.de${path}</loc>`);
		}
	});

	it('übernimmt „Google und Teilen“: Titel je Seite, Vorgabe, Favicon, noindex', async () => {
		const kontakt = await page(project.dir, 'kontakt.html');
		expect(kontakt.match(/<title>/g)).toHaveLength(1);
		// Klartext aus dem CRM, auch mit Skript darin nur als Text.
		expect(kontakt).toContain('<title>Jetzt anfragen &lt;script>alert(1)&lt;/script></title>');
		expect(withoutCsp(kontakt)).not.toContain('<script>alert');
		// Die eigene Beschreibung der Seite geht vor der Vorgabe aus dem CRM.
		expect(kontakt).toContain('content="Schreiben Sie uns. Wir melden uns schnell bei Ihnen zurück."');
		expect(kontakt).toContain('property="og:url" content="https://muster-immobilien.de/kontakt"');

		const start = await page(project.dir, 'index.html');
		expect(start).toContain('<meta name="robots" content="noindex"');
		expect(start).toContain(
			'<link rel="icon" type="image/png" sizes="32x32" href="/_ds/media/s1/f1/icon-32.png"',
		);
		expect(start).toContain(
			'<link rel="apple-touch-icon" sizes="180x180" href="/_ds/media/s1/f1/icon-180.png"',
		);
		expect(start).toContain('<link rel="manifest" href="/manifest.webmanifest"');
		expect(start).not.toContain('favicon.svg');

		const manifest = JSON.parse(await page(project.dir, 'manifest.webmanifest'));
		expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
		// Nicht bei Google: kein Verweis auf die Sitemap, aber auch kein Disallow.
		const robots = await page(project.dir, 'robots.txt');
		expect(robots).not.toContain('Sitemap');
		expect(robots).not.toContain('Disallow');
	});

	it('bindet Tracking-Kennungen aus dem CRM nicht ins HTML ein', async () => {
		const start = withoutCsp(await page(project.dir, 'index.html'));
		expect(start).not.toMatch(/G-ABCDEF1234|1234567890|googletagmanager|fbevents/);
	});
});

describe('YouTube-Video auf der Startseite (echter Build, Regelsatz 3)', () => {
	let project: StarterProject;

	beforeAll(async () => {
		project = await createStarter();
		await simulateInstallAndInit(project.dir);
		const configFile = join(project.dir, 'dealsystem.config.ts');
		const config = await readFile(configFile, 'utf8');
		await writeFile(
			configFile,
			config.replace('\tcollections: {', "\texternal: { video: { preset: 'youtube' } },\n\tcollections: {"),
		);
		const home = join(project.dir, 'src/routes/+page.svelte');
		const original = await readFile(home, 'utf8');
		const changed = original
			.replace(
				"import { RichText, Seo, Text } from '@dealsystem/site';",
				"import { Embed, RichText, Seo, Text } from '@dealsystem/site';",
			)
			.replace(
				'<section class="section hero">',
				'<Embed id="video" src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Rundgang durch das Haus" />\n\n<section class="section hero">',
			);
		expect(changed).not.toBe(original);
		await writeFile(home, changed);
		await build(project.dir);
	});

	afterAll(() => project.remove());

	it('Quelle und fertige Seite bestehen die Prüfung ohne Meldung', async () => {
		const result = await runCheck({
			projectDir: project.dir,
			outputDir: join(project.dir, 'build'),
			siteUrl: 'https://muster-immobilien.de',
			apiUrl: 'https://app.dealsystem.io',
		});
		expect(problems(result)).toEqual([]);
	});

	it('die CSP der fertigen Seite erlaubt YouTube ohne Cookies als Rahmen, sonst nichts Neues', async () => {
		const html = await page(project.dir, 'index.html');
		const csp = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1] ?? '';
		const frame = csp.split(';').find((d) => d.trim().startsWith('frame-src')) ?? '';
		expect(frame.trim().split(/\s+/)).toEqual([
			'frame-src',
			"'self'",
			'https://www.openstreetmap.org',
			'https://www.youtube-nocookie.com',
		]);
		expect(csp).not.toContain('youtube.com ');
		expect(csp).not.toContain('unsafe-eval');
	});

	it('vor der Einwilligung steht kein Rahmen im HTML und nichts lädt von YouTube', async () => {
		const html = withoutCsp(await page(project.dir, 'index.html'));
		expect(html).toContain('data-ds-embed="video"');
		expect(html).not.toMatch(/<iframe/i);
		expect(html).not.toMatch(/\ssrc="https:\/\/[^"]*youtube/i);
		expect(html).not.toMatch(/<img[^>]+(ytimg|youtube)/i);
	});

	it('mit der Build-Host-Angabe aus dem Manifest: Abweichung im Meta-Tag ist ein Fehler', async () => {
		const out = join(project.dir, 'build');
		const html = await page(project.dir, 'index.html');
		const tampered = html.replace('frame-src', 'frame-src https://evil.example.com');
		await writeFile(join(out, 'index.html'), tampered);
		try {
			const manifest = JSON.parse(await readFile(join(project.dir, '.dealsystem/manifest.json'), 'utf8')) as {
				external: Parameters<typeof runCheck>[0]['external'];
			};
			const result = await runCheck({
				outputDir: out,
				stages: ['output'],
				apiUrl: 'https://app.dealsystem.io',
				external: manifest.external,
			});
			expect(result.errors.map((f) => f.rule)).toContain('SEC-008');
		} finally {
			await writeFile(join(out, 'index.html'), html);
		}
	});
});
