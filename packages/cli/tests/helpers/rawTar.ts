// Baut Tar-Archive Byte für Byte, auch bösartige (Symlinks, `..`, Gerätedateien, pax/GNU-Köpfe), damit die
// Tests des Entpackers genau das bekommen, was ein fremdes `tar` schicken könnte.

import { gzipSync } from 'node:zlib';

const BLOCK = 512;

export interface RawEntry {
	name: string;
	/** Typ-Byte: '0' Datei, '1' Hardlink, '2' Symlink, '3' Zeichengerät, '5' Ordner, '6' FIFO, 'L', 'x', 'g'. */
	type?: string;
	data?: Buffer | string;
	linkname?: string;
	prefix?: string;
	/** Prüfsumme absichtlich falsch. */
	badChecksum?: boolean;
}

function put(buf: Buffer, offset: number, len: number, value: string): void {
	Buffer.from(value, 'utf8').copy(buf, offset, 0, len);
}

function octal(buf: Buffer, offset: number, len: number, value: number): void {
	put(buf, offset, len, `${value.toString(8).padStart(len - 1, '0')}\0`);
}

export function rawHeader(e: RawEntry, size: number): Buffer {
	const buf = Buffer.alloc(BLOCK, 0);
	put(buf, 0, 100, e.name);
	octal(buf, 100, 8, 0o644);
	octal(buf, 108, 8, 0);
	octal(buf, 116, 8, 0);
	octal(buf, 124, 12, size);
	octal(buf, 136, 12, 0);
	buf.fill(0x20, 148, 156);
	buf[156] = (e.type ?? '0').charCodeAt(0);
	if (e.linkname) put(buf, 157, 100, e.linkname);
	put(buf, 257, 6, 'ustar\0');
	put(buf, 263, 2, '00');
	if (e.prefix) put(buf, 345, 155, e.prefix);
	let sum = 0;
	for (const b of buf) sum += b;
	if (e.badChecksum) sum += 1;
	put(buf, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
	return buf;
}

export function rawTar(entries: RawEntry[], opts: { end?: boolean } = {}): Buffer {
	const chunks: Buffer[] = [];
	for (const e of entries) {
		const data = typeof e.data === 'string' ? Buffer.from(e.data) : (e.data ?? Buffer.alloc(0));
		chunks.push(rawHeader(e, data.length), data);
		const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
		if (pad) chunks.push(Buffer.alloc(pad, 0));
	}
	if (opts.end !== false) chunks.push(Buffer.alloc(BLOCK * 2, 0));
	return Buffer.concat(chunks);
}

export function rawTarGz(entries: RawEntry[], opts: { end?: boolean } = {}): Buffer {
	return gzipSync(rawTar(entries, opts));
}

/** pax-Kopf (`x`) mit `path=<wert>` für den nächsten Eintrag. */
export function paxPathEntry(path: string): RawEntry {
	const body = ` path=${path}\n`;
	const bytes = (t: string): number => Buffer.byteLength(t, 'utf8');
	let len = bytes(body) + 1;
	while (bytes(`${len}${body}`) !== len) len = bytes(`${len}${body}`);
	return { name: 'PaxHeader/x', type: 'x', data: `${len}${body}` };
}

/** GNU-Langname (`L`) für den nächsten Eintrag. */
export function gnuLongName(path: string): RawEntry {
	return { name: '././@LongLink', type: 'L', data: `${path}\0` };
}
