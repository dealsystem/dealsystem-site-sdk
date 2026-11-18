// `dealsystem image add`: Handyfoto ins Projekt, ohne Standort und Metadaten, mit passendem Baustein.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanSlots } from '@dealsystem/site/vite';
import { IMAGE_MAX_EDGE, imageNameFrom } from '../src/commands/image.js';
import { withPhoneExif } from './helpers/exif.js';
import { runCli, testIO, type TestIO } from './helpers/io.js';

let project: string;
let downloads: string;
let io: TestIO;

const photo = async (width: number, height: number, orientation = 1) =>
	withPhoneExif(
		await sharp({ create: { width, height, channels: 3, background: '#7a5' } })
			.jpeg()
			.toBuffer(),
		orientation,
	);

beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), 'ds-image-'));
	writeFileSync(join(project, 'package.json'), '{"name":"x","private":true}');
	downloads = mkdtempSync(join(tmpdir(), 'ds-downloads-'));
	io = testIO({ cwd: project });
});

afterEach(() => {
	rmSync(project, { recursive: true, force: true });
	rmSync(downloads, { recursive: true, force: true });
});

describe('image add', () => {
	it('Handyfoto: verkleinert, gedreht, ohne EXIF und GPS, mit Import und Baustein', async () => {
		const source = join(downloads, 'IMG_2041.JPG');
		const original = await photo(4000, 3000, 6);
		expect((await sharp(original).metadata()).exif?.includes(Buffer.from([0x88, 0x25]))).toBe(true);
		writeFileSync(source, original);

		const r = await runCli(
			io,
			'image',
			'add',
			source,
			'--name',
			'ueber-uns-foto',
			'--alt',
			'Der Inhaber',
			'--json',
		);
		expect(r.code).toBe(0);
		const out = join(project, 'src/lib/assets/bilder/ueber-uns-foto.jpg');
		const meta = await sharp(readFileSync(out)).metadata();
		expect(meta.exif).toBeUndefined();
		expect(meta.xmp).toBeUndefined();
		expect(meta.iptc).toBeUndefined();
		expect(readFileSync(out).includes(Buffer.from('Apple'))).toBe(false);
		// Hochformat nach der EXIF-Drehung, längste Kante 2560.
		expect([meta.width, meta.height]).toEqual([1920, IMAGE_MAX_EDGE]);
		expect(meta.orientation ?? 1).toBe(1);

		expect(r.json.data).toMatchObject({
			path: 'src/lib/assets/bilder/ueber-uns-foto.jpg',
			import: "import ueberUnsFoto from '$lib/assets/bilder/ueber-uns-foto.jpg';",
			key: 'bilder.ueber-uns-foto',
			width: 1920,
			height: 2560,
			resized: true,
			removed: { exif: true, gps: true },
		});
		// Was ausgegeben wird, liest der Build als Bild-Slot.
		const page = `<script lang="ts">\n\timport { MediaImage } from '@dealsystem/site';\n\t${r.json.data.import}\n</script>\n${r.json.data.component}\n`;
		expect(scanSlots(page, 'src/routes/ueber-uns/+page.svelte')).toMatchObject([
			{ key: 'bilder.ueber-uns-foto', type: 'image', label: 'Foto' },
		]);
		expect(r.json.data.component).toContain('alt="Der Inhaber"');
	});

	it('Text sagt, was entfernt wurde und wie es weitergeht', async () => {
		writeFileSync(join(downloads, 'Büro Ansicht.jpg'), await photo(800, 600));
		io.cwd = downloads;
		const r = await runCli(io, 'image', 'add', 'Büro Ansicht.jpg', '--dir', project);
		expect(r.code).toBe(0);
		expect(r.stdout).toContain('Gespeichert: src/lib/assets/bilder/buero-ansicht.jpg (800 × 600 px');
		expect(r.stdout).toContain('entfernt: Standort (GPS), Kameradaten (EXIF)');
		expect(r.stdout).toContain(`import bueroAnsicht from '$lib/assets/bilder/buero-ansicht.jpg';`);
		expect(r.stdout).toContain('Ersetze alt="…"');
		expect(r.stdout).toContain('Eigene Website → Inhalte');
	});

	it('kleine Bilder werden nicht vergrößert, PNG bleibt PNG', async () => {
		writeFileSync(
			join(downloads, 'logo.png'),
			await sharp({ create: { width: 300, height: 120, channels: 4, background: '#0000' } })
				.png()
				.toBuffer(),
		);
		const r = await runCli(io, 'image', 'add', join(downloads, 'logo.png'), '--json');
		expect(r.json.data).toMatchObject({ format: 'png', width: 300, height: 120, resized: false });
		expect(existsSync(join(project, 'src/lib/assets/bilder/logo.png'))).toBe(true);
	});

	it('überschreibt nichts ohne --force', async () => {
		const source = join(downloads, 'haus.jpg');
		writeFileSync(source, await photo(500, 400));
		expect((await runCli(io, 'image', 'add', source)).code).toBe(0);
		const again = await runCli(io, 'image', 'add', source, '--json');
		expect(again.code).toBe(2);
		expect(again.json.error.code).toBe('image_exists');
		expect((await runCli(io, 'image', 'add', source, '--force')).code).toBe(0);
	});

	it.each([
		[
			'HEIC vom iPhone',
			Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]),
			'image_heic',
		],
		['kein Bild', Buffer.from('hallo'), 'image_unreadable'],
		['zu groß', Buffer.alloc(15 * 1024 * 1024 + 1), 'image_too_large'],
	])('%s wird abgelehnt, nichts geschrieben', async (_name, bytes, code) => {
		const source = join(downloads, 'datei.jpg');
		writeFileSync(source, bytes);
		const r = await runCli(io, 'image', 'add', source, '--json');
		expect(r.code).toBe(1);
		expect(r.json.error.code).toBe(code);
		expect(existsSync(join(project, 'src/lib/assets'))).toBe(false);
	});

	it('SVG und GIF gehen nicht, mit Hinweis', async () => {
		const svg = join(downloads, 'logo.svg');
		writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
		const r = await runCli(io, 'image', 'add', svg, '--json');
		expect(r.json.error.code).toBe('image_format');
		expect(r.json.error.fix).toContain('static/');
	});

	it('falscher Aufruf, ungültiger Name oder Schlüssel: Exit-Code 2', async () => {
		const source = join(downloads, 'haus.jpg');
		writeFileSync(source, await photo(500, 400));
		expect((await runCli(io, 'image', 'push', source)).code).toBe(2);
		expect((await runCli(io, 'image', 'add')).code).toBe(2);
		expect((await runCli(io, 'image', 'add', join(downloads, 'fehlt.jpg'))).code).toBe(2);
		expect((await runCli(io, 'image', 'add', source, '--name', 'Haus Foto')).code).toBe(2);
		const key = await runCli(io, 'image', 'add', source, '--key', 'ueber-uns.foto', '--json');
		expect(key.code).toBe(2);
		expect(key.json.error.message).toContain('Nimm "ueberuns.foto"');
		mkdirSync(join(project, 'leer'));
		expect((await runCli(io, 'image', 'add', source, '--dir', join(project, 'leer'))).code).toBe(2);
	});

	it('Name aus dem Dateinamen', () => {
		expect(imageNameFrom('/x/Über uns (1).JPG')).toBe('ueber-uns-1');
		expect(imageNameFrom('IMG_2041.HEIC')).toBe('img-2041');
	});
});
