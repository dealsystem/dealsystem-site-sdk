// <Zeitfenster>: Zeitpunkte lesen, Grenzen fürs Manifest, fertiges HTML nach der Zeit des Builds.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { imZeitfenster, parseZeitpunkt, scheduleFrom, SCHEDULE_MAX } from '../src/lib/schedule.js';
import { buildManifest, collectSlots, scanZeitfenster } from '../src/lib/vite/index.js';
import ZeitHarness from './fixtures/ZeitHarness.svelte';
import { testSiteData } from './helpers.js';

const WINTER = '2026-12-01T18:00:00+01:00';
const ms = (iso: string) => Date.parse(iso);

describe('parseZeitpunkt', () => {
	it('nimmt ISO 8601 mit Zeitzone, auch Z und ohne Sekunden', () => {
		expect(parseZeitpunkt(WINTER)).toEqual({ ms: Date.UTC(2026, 11, 1, 17, 0, 0) });
		expect(parseZeitpunkt('2026-07-01T18:00+02:00')).toEqual({ ms: Date.UTC(2026, 6, 1, 16, 0, 0) });
		expect(parseZeitpunkt('2026-12-01T17:00:00.250Z')).toEqual({ ms: Date.UTC(2026, 11, 1, 17, 0, 0, 250) });
	});

	it('lehnt Zeitpunkte ohne Zeitzone ab (Bedeutung hinge vom Rechner ab)', () => {
		expect(parseZeitpunkt('2026-12-01T18:00:00')).toEqual({ fehler: 'offset' });
		expect(parseZeitpunkt('2026-12-01T18:00')).toEqual({ fehler: 'offset' });
	});

	it('lehnt Unsinn und Tage ab, die es nicht gibt', () => {
		for (const value of ['1.12.2026 18:00', '2026-12-01', 'morgen', '2026-12-01 18:00:00+01:00'])
			expect(parseZeitpunkt(value), value).toEqual({ fehler: 'format' });
		for (const value of [
			'2026-02-30T10:00:00Z',
			'2026-13-01T10:00:00Z',
			'2026-12-01T24:00:00Z',
			'2026-12-01T10:00:00+25:00',
		])
			expect(parseZeitpunkt(value), value).toEqual({ fehler: 'ungueltig' });
	});

	it('Fenster: ab gehört dazu, bis nicht mehr', () => {
		const ab = ms('2026-12-01T10:00:00Z');
		const bis = ms('2026-12-01T11:00:00Z');
		expect(imZeitfenster(ab - 1, ab, bis)).toBe(false);
		expect(imZeitfenster(ab, ab, bis)).toBe(true);
		expect(imZeitfenster(bis - 1, ab, bis)).toBe(true);
		expect(imZeitfenster(bis, ab, bis)).toBe(false);
		expect(imZeitfenster(0, null, bis)).toBe(true);
	});
});

describe('scheduleFrom (Manifest)', () => {
	it('nur künftige, ohne doppelte, aufsteigend, UTC mit Millisekunden', () => {
		const now = ms('2026-11-20T00:00:00Z');
		expect(
			scheduleFrom(
				[
					ms(WINTER),
					ms('2026-11-01T00:00:00Z'),
					ms('2026-12-01T17:00:00Z'),
					now,
					ms('2026-11-30T23:00:00+01:00'),
				],
				now,
			),
		).toEqual(['2026-11-30T22:00:00.000Z', '2026-12-01T17:00:00.000Z']);
	});

	it('höchstens 50, die frühesten', () => {
		const now = 0;
		const grenzen = Array.from({ length: 80 }, (_, i) => Date.UTC(2027, 0, 80 - i));
		const result = scheduleFrom(grenzen, now);
		expect(result).toHaveLength(SCHEDULE_MAX);
		expect(result[0]).toBe('2027-01-01T00:00:00.000Z');
		expect(result.at(-1)).toBe(new Date(Date.UTC(2027, 0, 50)).toISOString());
	});
});

describe('scanZeitfenster', () => {
	const page = (markup: string) =>
		`<script lang="ts">\n\timport { Zeitfenster as Z } from '@dealsystem/site';\n\tconst grenze = '${WINTER}';\n</script>\n\n${markup}\n`;

	it('findet feste Grenzen, Ausdrücke und fehlerhafte Werte, auch unter anderem Namen', () => {
		const found = scanZeitfenster(
			page(`<Z bis="${WINTER}">a</Z>\n{#if true}<Z ab={grenze} bis="2026-12-01T19:30:00">b</Z>{/if}`),
		);
		expect(found.map((f) => f.grenzen.map((g) => [g.name, g.value, g.ms, g.fehler]))).toEqual([
			[['bis', WINTER, ms(WINTER), null]],
			[
				['ab', null, null, null],
				['bis', '2026-12-01T19:30:00', null, 'offset'],
			],
		]);
	});

	it('ignoriert eigene Komponenten gleichen Namens', () => {
		expect(
			scanZeitfenster(`<script>import Zeitfenster from './Z.svelte';</script><Zeitfenster bis="x" />`),
		).toEqual([]);
	});

	it('collectSlots und Manifest: schedule aus allen Dateien unter src/', async () => {
		const root = await mkdtemp(join(tmpdir(), 'ds-zeit-'));
		try {
			await mkdir(join(root, 'src/routes'), { recursive: true });
			await mkdir(join(root, 'src/lib'), { recursive: true });
			await writeFile(
				join(root, 'src/routes/+page.svelte'),
				page(`<Z ab="2099-01-01T00:00:00+01:00" bis="2099-01-02T00:00:00+01:00">x</Z>`),
			);
			await writeFile(join(root, 'src/lib/Banner.svelte'), page(`<Z bis="2000-01-01T00:00:00Z">alt</Z>`));
			const { grenzen } = await collectSlots(root);
			expect(grenzen.sort()).toEqual(
				[ms('2000-01-01T00:00:00Z'), ms('2098-12-31T23:00:00Z'), ms('2099-01-01T23:00:00Z')].sort(),
			);
			const manifest = buildManifest({ siteId: 's1' }, [], ['/'], scheduleFrom(grenzen, Date.now()));
			expect(manifest.schedule).toEqual(['2098-12-31T23:00:00.000Z', '2099-01-01T23:00:00.000Z']);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe('<Zeitfenster> im fertigen HTML', () => {
	afterEach(() => setSiteDataForTests(null));
	const html = (builtAt: string) => {
		setSiteDataForTests({ ...testSiteData(), builtAt: ms(builtAt) });
		return render(ZeitHarness, { props: {} }).body;
	};

	it('entscheidet nach der Zeit des Builds', () => {
		expect(html('2026-12-01T16:59:59Z')).toContain('Jetzt anmelden');
		expect(html('2026-12-01T16:59:59Z')).not.toContain('läuft gerade');
		expect(html('2026-12-01T17:00:00Z')).not.toContain('Jetzt anmelden');
		expect(html('2026-12-01T17:00:00Z')).toContain('läuft gerade');
		expect(html('2026-12-01T18:30:00Z')).not.toMatch(/Jetzt anmelden|läuft gerade/);
	});

	it('bricht den Build bei Zeit ohne Zeitzone ab', () => {
		setSiteDataForTests({ ...testSiteData(), builtAt: 1 });
		expect(() => render(ZeitHarness, { props: { bis: '2026-12-01T18:00:00' } }).body).toThrow(
			/keine Zeitzone/,
		);
	});
});
