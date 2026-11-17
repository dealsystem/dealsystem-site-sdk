import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	collectionEntries,
	CONTENT_FILE_ENV,
	getCollection,
	getEntry,
	getSite,
	getSlots,
} from '../src/lib/content/index.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import type { RichTextContent } from '../src/lib/types.js';
import { testSiteData } from './helpers.js';

let dir: string;

const snapshot = {
	snapshotVersion: 1,
	site: { id: 's1', slug: 'kunde', name: 'Kunde Immobilien', primaryHost: 'kunde.de', locale: 'de' },
	legal: { company: 'Kunde GmbH' },
	slots: { 'start.hero.titel': { type: 'text', value: 'Aus dem CRM' } },
	collections: {
		angebote: {
			source: 'cms',
			schemaHash: 'h',
			entries: [
				{
					slug: 'alt',
					publishedAt: '2026-01-01T00:00:00.000Z',
					data: { titel: 'Alt', beschreibung: '' },
					media: {},
				},
				{
					slug: 'neu',
					publishedAt: '2026-06-01T00:00:00.000Z',
					data: { titel: 'Neu', beschreibung: '**Fett** <script>alert(1)</script>' },
					media: { bilder: [{ id: 'm', kind: 'image', alt: '', width: 1, height: 1, variants: [] }] },
				},
				{ slug: 'mitte', publishedAt: '2026-03-01T00:00:00.000Z', data: { titel: 'Mitte' }, media: {} },
			],
		},
	},
};

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'ds-content-'));
	await writeFile(join(dir, 'content.json'), JSON.stringify(snapshot));
	await writeFile(join(dir, 'kaputt.json'), '{ kein json');
});

afterAll(() => rm(dir, { recursive: true, force: true }));

beforeEach(() => {
	setSiteDataForTests(testSiteData());
	process.env[CONTENT_FILE_ENV] = join(dir, 'content.json');
});

afterEach(() => {
	delete process.env[CONTENT_FILE_ENV];
	setSiteDataForTests(null);
});

describe('getCollection', () => {
	it('liefert die Einträge, neueste zuerst', async () => {
		const entries = await getCollection('angebote');
		expect(entries.map((e) => e.slug)).toEqual(['neu', 'mitte', 'alt']);
	});

	it('beachtet sort, limit und offset', async () => {
		expect((await getCollection('angebote', { sort: 'oldest', limit: 2 })).map((e) => e.slug)).toEqual([
			'alt',
			'mitte',
		]);
		expect((await getCollection('angebote', { offset: 1, limit: 1 })).map((e) => e.slug)).toEqual(['mitte']);
		expect(await getCollection('angebote', { limit: 0 })).toEqual([]);
	});

	it('wandelt Richtext-Felder beim Build in geprüftes HTML um', async () => {
		const [neu, , alt] = await getCollection('angebote');
		const beschreibung = neu!.data.beschreibung as RichTextContent;
		expect(beschreibung.kind).toBe('richtext');
		expect(beschreibung.html).toContain('<strong>Fett</strong>');
		expect(beschreibung.html).not.toContain('script');
		expect(alt!.data.beschreibung).toBeNull();
		expect(neu!.media.bilder).toHaveLength(1);
	});

	it('ergibt für eine Sammlung ohne Einträge im Schnappschuss eine leere Liste', async () => {
		setSiteDataForTests(
			testSiteData({ collections: { ...testSiteData().collections, blog: { fields: [] } } }),
		);
		expect(await getCollection('blog')).toEqual([]);
	});

	it('nennt bei einem unbekannten Schlüssel die vorhandenen Sammlungen', async () => {
		await expect(getCollection('angebot')).rejects.toThrow(
			/"angebot" steht nicht in dealsystem\.config\.ts.*angebote/,
		);
	});

	it('scheitert laut, wenn die vom Build-Host genannte Datei fehlt oder kaputt ist', async () => {
		process.env[CONTENT_FILE_ENV] = join(dir, 'fehlt.json');
		await expect(getCollection('angebote')).rejects.toThrow(/fehlt/);
		process.env[CONTENT_FILE_ENV] = join(dir, 'kaputt.json');
		await expect(getCollection('angebote')).rejects.toThrow(/kein gültiges JSON/);
	});
});

describe('getEntry, collectionEntries, getSlots, getSite', () => {
	it('findet einen Eintrag über den Slug, sonst null', async () => {
		expect((await getEntry('angebote', 'mitte'))?.data.titel).toBe('Mitte');
		expect(await getEntry('angebote', 'gibt-es-nicht')).toBeNull();
	});

	it('liefert die Slugs für den entries-Export', async () => {
		expect(await collectionEntries('angebote')()).toEqual([
			{ slug: 'alt' },
			{ slug: 'neu' },
			{ slug: 'mitte' },
		]);
	});

	it('liefert Überschreibungen und Angaben zur Seite', async () => {
		expect(await getSlots()).toEqual({ 'start.hero.titel': { type: 'text', value: 'Aus dem CRM' } });
		expect(await getSite()).toMatchObject({
			name: 'Kunde Immobilien',
			url: 'https://kunde.de',
			legal: { company: 'Kunde GmbH' },
		});
	});
});

describe('ohne lokale Kopie', () => {
	it('baut die Seite mit leeren Sammlungen und warnt einmal', async () => {
		delete process.env[CONTENT_FILE_ENV];
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
		try {
			expect(await getCollection('angebote')).toEqual([]);
			expect(await getSlots()).toEqual({});
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]![0]).toContain('npx dealsystem sync');
		} finally {
			warn.mockRestore();
			cwd.mockRestore();
		}
	});
});
