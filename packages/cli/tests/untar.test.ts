// Sicheres Entpacken der Quellpakete (`dealsystem pull`): nur Dateien und Ordner, nichts außerhalb des Ziels,
// Grenzen schon beim Entpacken. Jeder Fall hier wäre bei einem naiven `tar -x` ein Schreiben außerhalb des
// Ziels, ein Link nach außen oder ein voller Datenträger.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createTarGz } from '../src/project/tar.js';
import { extractTarGz, safeArchivePath, UnsafeArchiveError, UNTAR_LIMITS } from '../src/project/untar.js';
import { gnuLongName, paxPathEntry, rawTar, rawTarGz, type RawEntry } from './helpers/rawTar.js';

let base: string;
let dest: string;

beforeEach(() => {
	// `base/zone/ziel` ist das Ziel; alles, was in `base` oder `base/zone` landet, ist ausgebrochen.
	base = mkdtempSync(join(tmpdir(), 'ds-untar-'));
	dest = join(base, 'zone', 'ziel');
	mkdirSync(join(base, 'zone'));
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

function onlyTarget(): void {
	expect(readdirSync(base)).toEqual(['zone']);
	expect(readdirSync(join(base, 'zone')).filter((n) => n !== 'ziel')).toEqual([]);
}

function rejects(entries: RawEntry[], pattern: RegExp): void {
	const zone = join(base, 'zone');
	rmSync(zone, { recursive: true, force: true });
	mkdirSync(zone, { recursive: true });
	expect(() => extractTarGz(rawTarGz(entries), dest)).toThrow(pattern);
	onlyTarget();
}

describe('extractTarGz – gültige Archive', () => {
	it('entpackt, was deploy packt, Byte für Byte', () => {
		const files = [
			{ path: 'package.json', data: Buffer.from('{"name":"x"}') },
			{ path: 'src/routes/+page.svelte', data: Buffer.from('<h1>Hallo</h1>') },
			{ path: `src/${'a'.repeat(90)}/${'b'.repeat(60)}.svelte`, data: Buffer.from('lang') },
			{ path: 'static/bild.bin', data: Buffer.from([0, 1, 2, 255]) },
		];
		const r = extractTarGz(createTarGz(files), dest);
		expect(r).toMatchObject({ files: 4 });
		for (const f of files) expect(readFileSync(join(dest, ...f.path.split('/')))).toEqual(f.data);
	});

	it('liest GNU tar (./-Präfix, Ordner-Einträge, Langnamen) und pax-Pfade', () => {
		const long = `src/${'x'.repeat(120)}.svelte`;
		const r = extractTarGz(
			rawTarGz([
				{ name: './', type: '5' },
				{ name: './src/', type: '5' },
				{ name: './src/app.html', data: 'html' },
				gnuLongName(long),
				{ name: long.slice(0, 99), data: 'gnu' },
				paxPathEntry('static/über.txt'),
				{ name: 'static/ueber.txt', data: 'pax' },
				{ name: 'pax_global_header', type: 'g', data: '20 comment=abcdef\n' },
			]),
			dest,
		);
		expect(r).toMatchObject({ files: 3, directories: 1 });
		expect(readFileSync(join(dest, 'src', 'app.html'), 'utf8')).toBe('html');
		expect(readFileSync(join(dest, ...long.split('/')), 'utf8')).toBe('gnu');
		expect(readFileSync(join(dest, 'static', 'über.txt'), 'utf8')).toBe('pax');
		expect(existsSync(join(dest, 'static', 'ueber.txt'))).toBe(false);
	});

	it('übernimmt keine Rechte aus dem Archiv', () => {
		extractTarGz(rawTarGz([{ name: 'run.sh', data: 'x' }]), dest);
		expect(lstatSync(join(dest, 'run.sh')).mode & 0o7777).toBe(0o644);
	});

	it('legt den Zielordner selbst an und lehnt einen vorhandenen ab', () => {
		mkdirSync(dest);
		expect(() => extractTarGz(rawTarGz([{ name: 'a.txt', data: 'x' }]), dest)).toThrow();
	});
});

describe('extractTarGz – Pfade außerhalb des Ziels', () => {
	it.each([
		['../boese.txt'],
		['../../boese.txt'],
		['src/../../boese.txt'],
		['./../boese.txt'],
		['/tmp/ds-untar-absolut.txt'],
		['C:/boese.txt'],
		['..\\boese.txt'],
		['src\\..\\..\\boese.txt'],
	])('%s', (name) => {
		rejects(
			[
				{ name: 'ok.txt', data: 'ok' },
				{ name, data: 'boese' },
			],
			/Archiv/,
		);
		expect(existsSync('/tmp/ds-untar-absolut.txt')).toBe(false);
	});

	it('`..` im ustar-Präfix', () => {
		rejects([{ name: 'boese.txt', prefix: '..', data: 'x' }], /\.\./);
	});

	it('`..` über einen GNU-Langnamen', () => {
		rejects([gnuLongName(`../${'x'.repeat(120)}`), { name: 'harmlos.txt', data: 'x' }], /\.\./);
	});

	it('`..` über einen pax-Pfad', () => {
		rejects([paxPathEntry('../boese.txt'), { name: 'harmlos.txt', data: 'x' }], /\.\./);
	});
});

describe('extractTarGz – nur Dateien und Ordner', () => {
	it('Symlink nach außen und Datei durch ihn hindurch', () => {
		rejects(
			[
				{ name: 'link', type: '2', linkname: '..' },
				{ name: 'link/boese.txt', data: 'x' },
			],
			/Symlink/,
		);
	});

	it('Symlink auf eine absolute Datei', () => {
		rejects([{ name: 'passwd', type: '2', linkname: '/etc/passwd' }], /Symlink/);
	});

	it('Hardlink', () => {
		rejects([{ name: 'passwd', type: '1', linkname: '/etc/passwd' }], /Hardlink/);
	});

	it('Gerätedatei und FIFO', () => {
		rejects([{ name: 'null', type: '3' }], /Gerätedatei/);
		rejects([{ name: 'rohr', type: '6' }], /FIFO/);
	});

	it('unbekannter Typ', () => {
		rejects([{ name: 'x', type: '7', data: 'y' }], /Eintragstyp/);
	});

	it('doppelter Eintrag überschreibt nicht', () => {
		rejects(
			[
				{ name: 'a.txt', data: 'erst' },
				{ name: 'a.txt', data: 'dann' },
			],
			/Doppelter Eintrag/,
		);
	});

	it('Datei und Ordner gleichen Namens', () => {
		rejects(
			[
				{ name: 'a', data: 'datei' },
				{ name: 'a/b.txt', data: 'x' },
			],
			/gleichem Namen/,
		);
	});
});

describe('extractTarGz – Grenzen und kaputte Archive', () => {
	const small = { maxTarBytes: 64 * 1024, maxFileBytes: 1000, maxEntries: 3 };

	it('gzip-Bombe: Grenze greift schon beim Entpacken', () => {
		const bomb = gzipSync(rawTar([{ name: 'nullen.bin', data: Buffer.alloc(1024 * 1024) }]));
		expect(bomb.length).toBeLessThan(10 * 1024);
		expect(() => extractTarGz(bomb, dest, { ...small, maxFileBytes: 10 * 1024 * 1024 })).toThrow(
			/entpackt größer/,
		);
	});

	it('zu große Einzeldatei', () => {
		expect(() =>
			extractTarGz(rawTarGz([{ name: 'gross.bin', data: Buffer.alloc(1001) }]), dest, small),
		).toThrow(/größer als/);
	});

	it('zu viele Einträge', () => {
		const many = [1, 2, 3, 4].map((i) => ({ name: `f${i}.txt`, data: 'x' }));
		expect(() => extractTarGz(rawTarGz(many), dest, small)).toThrow(/mehr als 3 Einträge/);
	});

	it('beschädigte Prüfsumme', () => {
		expect(() => extractTarGz(rawTarGz([{ name: 'a.txt', data: 'x', badChecksum: true }]), dest)).toThrow(
			/Prüfsumme/,
		);
	});

	it('abgeschnittener Inhalt', () => {
		const tar = rawTar([{ name: 'a.txt', data: Buffer.alloc(2000, 1) }], { end: false });
		expect(() => extractTarGz(gzipSync(tar.subarray(0, 1024)), dest)).toThrow(/abgeschnitten/);
	});

	it('kein gzip', () => {
		expect(() => extractTarGz(Buffer.from('kein archiv'), dest)).toThrow(UnsafeArchiveError);
	});

	it('Standardgrenzen liegen über dem Upload-Limit', () => {
		expect(UNTAR_LIMITS.maxTarBytes).toBeGreaterThanOrEqual(50 * 1024 * 1024);
	});
});

describe('safeArchivePath', () => {
	it('normalisiert harmlose Pfade', () => {
		expect(safeArchivePath('./src//a.txt')).toBe('src/a.txt');
		expect(safeArchivePath('src/')).toBe('src');
		expect(safeArchivePath('..datei')).toBe('..datei');
	});
});
