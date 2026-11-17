import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { CONTENT_FILE_ENV } from '../src/lib/content/index.js';
import type { SiteConfig, SiteData, SiteManifest } from '../src/lib/types.js';
import { SDK_VERSION } from '../src/lib/version.js';
import { collectSlots, dealsystem, MANIFEST_FILE_ENV } from '../src/lib/vite/index.js';

const config: SiteConfig = {
	siteId: 's1',
	collections: {
		angebote: {
			label: 'Angebote',
			route: '/angebote/:slug',
			fields: [
				{ name: 'titel', type: 'text', required: true },
				{ name: 'bilder', type: 'gallery' },
			],
		},
	},
	funnels: {
		kontakt: {
			label: 'Kontakt',
			fields: [{ name: 'email', type: 'email', standardField: 'email', required: true }],
		},
		rueckruf: {
			label: 'Rückruf',
			fields: [{ name: 'telefon', type: 'tel', standardField: 'phone', required: true }],
		},
		neu: { label: 'Neu', fields: [{ name: 'email', type: 'email', standardField: 'email' }] },
	},
};

let root: string;
const ENV_KEYS = [
	CONTENT_FILE_ENV,
	MANIFEST_FILE_ENV,
	'PUBLIC_DEALSYSTEM_API',
	'PUBLIC_DEALSYSTEM_SITE_KEY',
	'PUBLIC_DEALSYSTEM_SITE_URL',
];

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'ds-vite-'));
	await cp(join(import.meta.dirname, 'fixtures/project'), root, { recursive: true });
});

afterAll(() => rm(root, { recursive: true, force: true }));

afterEach(() => {
	for (const key of ENV_KEYS) delete process.env[key];
});

let builds = 0;
let outDir = '';

async function outputFile(): Promise<string> {
	const file = (await readdir(outDir)).find((name) => /^entry\.m?js$/.test(name));
	return join(outDir, file!);
}

async function buildFixture(): Promise<SiteData> {
	// Je Build ein eigener Ordner: der Modul-Cache kennt die Datei sonst schon.
	outDir = join(root, `out-${++builds}`);
	await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [dealsystem(config)],
		build: {
			ssr: true,
			outDir,
			emptyOutDir: true,
			rollupOptions: { input: join(import.meta.dirname, 'fixtures/project/src/lib/entry.ts') },
		},
	});
	const module = await import(pathToFileURL(await outputFile()).href);
	return module.data as SiteData;
}

describe('dealsystem() im Build', () => {
	it('schreibt das Manifest und bettet die Daten der Seite ein', async () => {
		process.env[CONTENT_FILE_ENV] = join(root, 'content.json');
		process.env[MANIFEST_FILE_ENV] = join(root, 'manifest-out/manifest.json');
		process.env.PUBLIC_DEALSYSTEM_API = 'https://app.dealsystem.io';
		process.env.PUBLIC_DEALSYSTEM_SITE_KEY = 'dsp_ABCD1234_abcdefghijklmnopqrstuvwx';
		process.env.PUBLIC_DEALSYSTEM_SITE_URL = 'https://kunde.de/';

		const data = await buildFixture();

		const manifest = JSON.parse(
			await readFile(join(root, 'manifest-out/manifest.json'), 'utf8'),
		) as SiteManifest;
		expect(manifest.manifestVersion).toBe(1);
		expect(manifest.sdkVersion).toBe(SDK_VERSION);
		expect(manifest.siteId).toBe('s1');
		expect(manifest.routes).toEqual(['/', '/kontakt']);
		expect(manifest.slots).toEqual([
			{
				key: 'start.hero.titel',
				type: 'text',
				default: 'Wir kaufen Ihr Haus',
				label: 'Überschrift',
				group: 'Startseite',
				route: '/',
			},
			{
				key: 'start.leistungen',
				type: 'richtext',
				default: 'Standard',
				route: '/',
				aliases: ['start.angebot'],
			},
			{
				key: 'start.ueber-uns',
				type: 'richtext',
				default: 'Seit **2010** in Leipzig. <img src=x onerror=alert(1)>',
				route: '/',
			},
		]);
		expect(manifest.collections).toEqual([
			{ ...config.collections!.angebote, key: 'angebote', source: 'cms' },
		]);
		expect(manifest.funnels.map((f) => f.key)).toEqual(['kontakt', 'rueckruf', 'neu']);
		expect(manifest.funnels[0]!.fields).toEqual(config.funnels!.kontakt!.fields);

		expect(data.api).toEqual({
			baseUrl: 'https://app.dealsystem.io',
			siteKey: 'dsp_ABCD1234_abcdefghijklmnopqrstuvwx',
		});
		expect(data.site).toMatchObject({ name: 'Kunde Immobilien', url: 'https://kunde.de', locale: 'de' });
		expect(data.legal.company).toBe('Kunde GmbH');
		expect(data.captcha).toEqual({ provider: 'friendly-captcha', siteKey: 'FCMTEST' });
		expect(data.tracking).toEqual({ metaPixelId: '1234567890', googleTagId: null });
		// Formulare kommen aus dem Code; der Core schaltet sie nur ab.
		expect(data.funnels.kontakt!.active).toBe(true);
		expect(data.funnels.rueckruf!.active).toBe(false);
		expect(data.funnels.neu!.active).toBe(true);
		expect(data.slots['start.hero.titel']).toEqual({ type: 'text', value: 'Aus dem CRM' });
		// Richtext ist fertig geprüft: Standard aus dem Code und Überschreibung unter altem Schlüssel.
		expect(data.richtext['start.ueber-uns']).toBe('<p>Seit <strong>2010</strong> in Leipzig. </p>\n');
		expect(data.richtext['start.leistungen']).toBe('<p>Text unter <em>altem</em> Schlüssel</p>\n');
	});

	it('baut ohne Schnappschuss und ohne Umgebung mit Standardwerten für die Entwicklung', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const data = await buildFixture();
			expect(data.api).toEqual({ baseUrl: '', siteKey: 'dev' });
			expect(data.slots).toEqual({});
			expect(data.richtext['start.leistungen']).toBe('<p>Standard</p>\n');
			expect(data.funnels.rueckruf!.active).toBe(true);
			const manifest = JSON.parse(
				await readFile(join(root, '.dealsystem/manifest.json'), 'utf8'),
			) as SiteManifest;
			expect(manifest.slots).toHaveLength(3);
		} finally {
			warn.mockRestore();
		}
	});

	it('bettet nichts ein, was nicht öffentlich ist', async () => {
		process.env[CONTENT_FILE_ENV] = join(root, 'content.json');
		await buildFixture();
		const code = await readFile(await outputFile(), 'utf8');
		expect(code).not.toMatch(/SECRET|dm_live_|dms_site_/);
		expect(code).not.toContain(root);
	});
});

describe('dealsystem()', () => {
	it('lehnt eine ungültige Konfiguration sofort ab', () => {
		expect(() => dealsystem({ siteId: 's', funnels: { kontakt: { label: 'K', fields: [] } } })).toThrow(
			/dealsystem\.config\.ts ist ungültig/,
		);
	});

	it('findet Slots und Routen im Projekt', async () => {
		const { slots, routes } = await collectSlots(root);
		expect(slots.map((s) => s.key)).toEqual(['start.hero.titel', 'start.leistungen', 'start.ueber-uns']);
		expect(routes).toEqual(['/', '/kontakt']);
	});
});
