// Minimales, deterministisches ustar-Archiv (nur reguläre Dateien), gzip-komprimiert.
// Gleicher Inhalt → gleiche Bytes → gleiche SHA-256 (feste Zeit, feste Rechte, sortierte Einträge).

import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;

export interface TarEntry {
	path: string;
	data: Uint8Array;
}

function writeString(buf: Buffer, offset: number, length: number, value: string): void {
	const bytes = Buffer.from(value, 'utf8');
	if (bytes.length > length) throw new Error(`Feld zu lang: ${value}`);
	bytes.copy(buf, offset);
}

function writeOctal(buf: Buffer, offset: number, length: number, value: number): void {
	writeString(buf, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
}

/** Teilt einen Pfad in `prefix` (≤155 Byte) und `name` (≤100 Byte). */
function splitPath(path: string): { name: string; prefix: string } {
	if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
	const parts = path.split('/');
	for (let i = parts.length - 1; i > 0; i--) {
		const prefix = parts.slice(0, i).join('/');
		const name = parts.slice(i).join('/');
		if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
	}
	throw new Error(`Pfad zu lang für das Archiv: ${path}`);
}

function header(path: string, size: number): Buffer {
	const buf = Buffer.alloc(BLOCK, 0);
	const { name, prefix } = splitPath(path);
	writeString(buf, 0, 100, name);
	writeOctal(buf, 100, 8, 0o644);
	writeOctal(buf, 108, 8, 0);
	writeOctal(buf, 116, 8, 0);
	writeOctal(buf, 124, 12, size);
	writeOctal(buf, 136, 12, 0);
	buf.fill(0x20, 148, 156); // Prüfsummenfeld beim Rechnen als Leerzeichen
	buf[156] = 0x30; // '0' = reguläre Datei
	writeString(buf, 257, 6, 'ustar\0');
	writeString(buf, 263, 2, '00');
	writeString(buf, 345, 155, prefix);
	let sum = 0;
	for (const byte of buf) sum += byte;
	writeString(buf, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
	return buf;
}

export function createTar(entries: TarEntry[]): Buffer {
	const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const chunks: Buffer[] = [];
	for (const e of sorted) {
		if (e.path.startsWith('/') || e.path.split('/').some((s) => s === '..' || s === '.' || s === '')) {
			throw new Error(`Ungültiger Pfad im Archiv: ${e.path}`);
		}
		chunks.push(header(e.path, e.data.byteLength), Buffer.from(e.data));
		const pad = (BLOCK - (e.data.byteLength % BLOCK)) % BLOCK;
		if (pad) chunks.push(Buffer.alloc(pad, 0));
	}
	chunks.push(Buffer.alloc(BLOCK * 2, 0));
	return Buffer.concat(chunks);
}

export function createTarGz(entries: TarEntry[]): Buffer {
	return gzipSync(createTar(entries), { level: 9 });
}

/** Liest ein mit `createTarGz` erzeugtes Archiv (für Tests und Selbstprüfung vor dem Upload). */
export function readTarGz(data: Uint8Array): TarEntry[] {
	const buf = gunzipSync(data);
	const out: TarEntry[] = [];
	let offset = 0;
	while (offset + BLOCK <= buf.length) {
		const block = buf.subarray(offset, offset + BLOCK);
		if (block.every((b) => b === 0)) break;
		const field = (start: number, len: number): string =>
			block
				.subarray(start, start + len)
				.toString('utf8')
				.replace(/\0.*$/s, '');
		const name = field(0, 100);
		const prefix = field(345, 155);
		const size = parseInt(field(124, 12).trim() || '0', 8);
		const type = String.fromCharCode(block[156] ?? 0x30);
		offset += BLOCK;
		if (type !== '0' && type !== '\0') throw new Error(`Nicht unterstützter Eintragstyp ${type} für ${name}`);
		out.push({ path: prefix ? `${prefix}/${name}` : name, data: buf.subarray(offset, offset + size) });
		offset += Math.ceil(size / BLOCK) * BLOCK;
	}
	return out;
}
