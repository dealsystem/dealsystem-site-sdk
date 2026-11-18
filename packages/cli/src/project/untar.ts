// Entpackt ein Quellpaket (`.tar.gz`) aus dem Speicher in einen NEUEN Ordner — für `dealsystem pull`.
//
// Das Archiv ist fremde Eingabe: Hochladen kann es auch ein Agent per `curl` (MCP-Werkzeug), mit jedem
// `tar` der Welt. Deshalb streng:
// - nur reguläre Dateien und Ordner; Symlinks, Hardlinks, Geräte, FIFOs und alles Unbekannte brechen ab
// - Pfade relativ und ohne `..`, ohne Backslash, ohne Laufwerksbuchstaben; nach dem Auflösen im Zielordner
// - Grenzen für entpackte Größe (schon beim Entpacken von gzip), Größe je Datei und Dateianzahl
// - Prüfsumme jedes Kopfes, kein abgeschnittenes Archiv
// - Dateien mit `wx` (exklusiv): ein doppelter Eintrag überschreibt nichts, er bricht ab
// Der Zielordner darf noch nicht existieren; der Aufrufer legt ihn als Temp-Ordner an und benennt danach um.
//
// Gelesen werden ustar (eigenes `deploy`), GNU-Langnamen (`L`) und pax-Pfade (`x`, `g`), wie sie GNU tar
// und bsdtar (macOS) schreiben. Rechte aus dem Archiv werden nicht übernommen (Dateien 0644, Ordner 0755).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BLOCK = 512;

export interface UntarLimits {
	/** Entpackte Größe des ganzen Tar-Stroms (inkl. Köpfe). */
	maxTarBytes: number;
	/** Größe einer einzelnen Datei. */
	maxFileBytes: number;
	/** Anzahl Dateien und Ordner. */
	maxEntries: number;
}

export const UNTAR_LIMITS: UntarLimits = {
	maxTarBytes: 200 * 1024 * 1024,
	maxFileBytes: 50 * 1024 * 1024,
	maxEntries: 10_000,
};

export class UnsafeArchiveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsafeArchiveError';
	}
}

export interface UntarResult {
	files: number;
	directories: number;
	bytes: number;
}

function field(block: Buffer, start: number, len: number): string {
	const raw = block.subarray(start, start + len);
	const end = raw.indexOf(0);
	return raw.subarray(0, end === -1 ? len : end).toString('utf8');
}

function octal(block: Buffer, start: number, len: number, what: string): number {
	if ((block[start] ?? 0) & 0x80)
		throw new UnsafeArchiveError(`${what}: Binärkodierung wird nicht unterstützt.`);
	const text = field(block, start, len).trim();
	if (text === '') return 0;
	if (!/^[0-7]+$/.test(text)) throw new UnsafeArchiveError(`${what}: kein gültiger Zahlenwert.`);
	const value = parseInt(text, 8);
	if (!Number.isSafeInteger(value)) throw new UnsafeArchiveError(`${what}: Zahl zu groß.`);
	return value;
}

function checksumOk(block: Buffer): boolean {
	const stored = octal(block, 148, 8, 'Prüfsumme');
	let sum = 0;
	for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
	return sum === stored;
}

/** Pfade aus pax-Kopf (`<länge> path=<wert>\n`). */
function paxPath(data: Buffer): string | null {
	let offset = 0;
	let path: string | null = null;
	while (offset < data.length) {
		const space = data.indexOf(0x20, offset);
		if (space === -1) throw new UnsafeArchiveError('pax-Kopf ist beschädigt.');
		const len = Number(data.subarray(offset, space).toString('ascii'));
		if (!Number.isInteger(len) || len <= space - offset || offset + len > data.length) {
			throw new UnsafeArchiveError('pax-Kopf ist beschädigt.');
		}
		const record = data.subarray(space + 1, offset + len - 1).toString('utf8');
		const eq = record.indexOf('=');
		if (eq > 0) {
			const key = record.slice(0, eq);
			if (key === 'path') path = record.slice(eq + 1);
			// Ein Link-Ziel im pax-Kopf gehört zu einem Link-Eintrag; der scheitert ohnehin am Typ.
		}
		offset += len;
	}
	return path;
}

/**
 * Prüft einen Archivpfad und liefert ihn normalisiert (ohne `./`, ohne abschließenden `/`).
 * Wirft bei allem, was aus dem Zielordner führen könnte oder auf einem anderen System anders gelesen wird.
 */
export function safeArchivePath(raw: string): string {
	if (raw.includes('\0')) throw new UnsafeArchiveError('Pfad mit Nullzeichen im Archiv.');
	if (raw.includes('\\')) throw new UnsafeArchiveError(`Pfad mit Backslash im Archiv: ${raw}`);
	if (raw.startsWith('/')) throw new UnsafeArchiveError(`Absoluter Pfad im Archiv: ${raw}`);
	if (/^[A-Za-z]:/.test(raw)) throw new UnsafeArchiveError(`Laufwerkspfad im Archiv: ${raw}`);
	const segments = raw.split('/').filter((s) => s !== '' && s !== '.');
	if (segments.some((s) => s === '..')) throw new UnsafeArchiveError(`Pfad mit „..“ im Archiv: ${raw}`);
	return segments.join('/');
}

/**
 * Dateisystem-Fehler beim Anlegen als Archivfehler. Ordner anlegen scheitert nur, wenn eine Datei im Weg
 * liegt; Datei schreiben (`wx`) nur bei einem doppelten Eintrag oder einem Ordner gleichen Namens.
 */
function guardFs(rel: string, kind: 'dir' | 'file', action: () => void): void {
	try {
		action();
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (kind === 'dir' && (code === 'EEXIST' || code === 'ENOTDIR')) {
			throw new UnsafeArchiveError(`Datei und Ordner mit gleichem Namen im Archiv: ${rel}`);
		}
		if (kind === 'file' && code === 'EEXIST')
			throw new UnsafeArchiveError(`Doppelter Eintrag im Archiv: ${rel}`);
		if (kind === 'file' && (code === 'EISDIR' || code === 'ENOTDIR')) {
			throw new UnsafeArchiveError(`Datei und Ordner mit gleichem Namen im Archiv: ${rel}`);
		}
		throw e;
	}
}

/** Liegt `abs` echt unterhalb von `root`? */
function inside(root: string, abs: string): boolean {
	return abs.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Entpackt `data` (gzip) nach `dest`. `dest` darf nicht existieren und wird angelegt. Wirft
 * `UnsafeArchiveError`, sobald etwas nicht passt; was bis dahin geschrieben ist, räumt der Aufrufer weg.
 */
export function extractTarGz(
	data: Uint8Array,
	dest: string,
	limits: UntarLimits = UNTAR_LIMITS,
): UntarResult {
	let tar: Buffer;
	try {
		// Die Grenze wirkt schon beim Entpacken: eine gzip-Bombe kommt nie ganz in den Speicher.
		tar = gunzipSync(data, { maxOutputLength: limits.maxTarBytes });
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|buffer/i.test((e as Error).message)) {
			throw new UnsafeArchiveError(
				`Das Archiv ist entpackt größer als ${Math.round(limits.maxTarBytes / 1024 / 1024)} MB.`,
			);
		}
		throw new UnsafeArchiveError('Das Archiv ist kein gültiges .tar.gz.');
	}

	const root = resolve(dest);
	mkdirSync(root, { recursive: false });
	const result: UntarResult = { files: 0, directories: 0, bytes: 0 };
	let offset = 0;
	let longName: string | null = null;
	let paxName: string | null = null;
	let ended = false;

	const body = (size: number, name: string): Buffer => {
		const end = offset + size;
		if (end > tar.length) throw new UnsafeArchiveError(`Das Archiv ist abgeschnitten (bei ${name}).`);
		return tar.subarray(offset, end);
	};

	while (offset + BLOCK <= tar.length) {
		const block = tar.subarray(offset, offset + BLOCK);
		if (block.every((b) => b === 0)) {
			ended = true;
			break;
		}
		if (!checksumOk(block)) throw new UnsafeArchiveError('Ein Kopf im Archiv ist beschädigt (Prüfsumme).');
		const type = String.fromCharCode(block[156] ?? 0);
		const size = octal(block, 124, 12, 'Größe');
		const name = field(block, 0, 100);
		const magic = field(block, 257, 6);
		const prefix = magic.startsWith('ustar') ? field(block, 345, 155) : '';
		offset += BLOCK;
		const padded = Math.ceil(size / BLOCK) * BLOCK;

		// Zusatzköpfe: gelten für den nächsten Eintrag.
		if (type === 'L' || type === 'x' || type === 'g') {
			if (size > 64 * 1024) throw new UnsafeArchiveError('Zusatzkopf im Archiv ist zu groß.');
			const data = body(size, name);
			if (type === 'L') longName = data.toString('utf8').replace(/\0+$/, '');
			else if (type === 'x') paxName = paxPath(data);
			// `g` (globale pax-Angaben) enthält nichts, was wir brauchen.
			offset += padded;
			continue;
		}

		const fullName = paxName ?? longName ?? (prefix ? `${prefix}/${name}` : name);
		paxName = null;
		longName = null;

		if (type !== '0' && type !== '\0' && type !== '5') {
			const what =
				type === '1'
					? 'Hardlink'
					: type === '2'
						? 'Symlink'
						: type === '3' || type === '4'
							? 'Gerätedatei'
							: type === '6'
								? 'FIFO'
								: `Eintragstyp „${type}“`;
			throw new UnsafeArchiveError(`${what} im Archiv (${fullName}); erlaubt sind nur Dateien und Ordner.`);
		}

		const rel = safeArchivePath(fullName);
		if (rel === '') {
			// `./` als Wurzel-Eintrag (GNU tar): nichts zu tun.
			if (type === '5') {
				offset += padded;
				continue;
			}
			throw new UnsafeArchiveError('Datei ohne Namen im Archiv.');
		}
		const abs = resolve(root, ...rel.split('/'));
		if (!inside(root, abs)) throw new UnsafeArchiveError(`Pfad außerhalb des Zielordners: ${fullName}`);

		if (result.files + result.directories + 1 > limits.maxEntries) {
			throw new UnsafeArchiveError(`Das Archiv hat mehr als ${limits.maxEntries} Einträge.`);
		}

		if (type === '5') {
			guardFs(rel, 'dir', () => mkdirSync(abs, { recursive: true, mode: 0o755 }));
			result.directories += 1;
			offset += padded;
			continue;
		}

		if (size > limits.maxFileBytes) {
			throw new UnsafeArchiveError(
				`${rel} ist größer als ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB.`,
			);
		}
		const content = body(size, rel);
		guardFs(rel, 'dir', () => mkdirSync(dirname(abs), { recursive: true, mode: 0o755 }));
		// `wx`: nie über eine vorhandene Datei schreiben (doppelter Eintrag im Archiv).
		guardFs(rel, 'file', () => writeFileSync(abs, content, { flag: 'wx', mode: 0o644 }));
		result.files += 1;
		result.bytes += size;
		offset += padded;
	}

	// Ohne Endmarke nur, wenn das Archiv genau an einer Blockgrenze endet (manche Werkzeuge lassen sie weg).
	if (!ended && offset !== tar.length) throw new UnsafeArchiveError('Das Archiv ist abgeschnitten.');
	if (longName !== null || paxName !== null)
		throw new UnsafeArchiveError('Zusatzkopf ohne Eintrag im Archiv.');
	return result;
}
