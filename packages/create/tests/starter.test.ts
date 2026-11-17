// Der Starter, so wie ein Kunde ihn bekommt: Er muss ohne jede Änderung
// `dealsystem check` bestehen, sich bauen lassen und typrein sein.
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
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
		expect(await page(project.dir, 'robots.txt')).toContain(
			'Sitemap: https://muster-immobilien.de/sitemap.xml',
		);
	});

	it('bindet Tracking-Kennungen aus dem CRM nicht ins HTML ein', async () => {
		const start = withoutCsp(await page(project.dir, 'index.html'));
		expect(start).not.toMatch(/G-ABCDEF1234|1234567890|googletagmanager|fbevents/);
	});
});
