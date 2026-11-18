// Baut ein JPEG mit EXIF, wie es ein Handy schreibt: Kamera, Drehung und ein GPS-Block. sharp selbst schreibt
// keinen GPS-Block, deshalb hier von Hand (TIFF, Big Endian).

type Entry = { tag: number; type: 2 | 3 | 4; value: string | number };

function ifd(entries: Entry[], start: number, next: number): { bytes: Buffer; end: number } {
	const head = Buffer.alloc(2 + entries.length * 12 + 4);
	head.writeUInt16BE(entries.length, 0);
	const extra: Buffer[] = [];
	let dataAt = start + head.length;
	entries.forEach((e, i) => {
		const o = 2 + i * 12;
		head.writeUInt16BE(e.tag, o);
		head.writeUInt16BE(e.type, o + 2);
		if (e.type === 2) {
			const text = Buffer.from(`${e.value}\0`, 'latin1');
			head.writeUInt32BE(text.length, o + 4);
			if (text.length <= 4) text.copy(head, o + 8);
			else {
				head.writeUInt32BE(dataAt, o + 8);
				extra.push(text);
				dataAt += text.length;
			}
		} else {
			head.writeUInt32BE(1, o + 4);
			if (e.type === 3) head.writeUInt16BE(Number(e.value), o + 8);
			else head.writeUInt32BE(Number(e.value), o + 8);
		}
	});
	head.writeUInt32BE(next, head.length - 4);
	const bytes = Buffer.concat([head, ...extra]);
	return { bytes, end: start + bytes.length };
}

/** EXIF mit Kamera „Apple“, `Orientation` und GPS (51° N), eingefügt direkt nach dem SOI eines JPEG. */
export function withPhoneExif(jpeg: Buffer, orientation = 1): Buffer {
	const tiffHead = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]);
	// Erst die Länge von IFD0 bestimmen, dann den Zeiger auf den GPS-Block setzen.
	const draft = ifd(
		[
			{ tag: 0x010f, type: 2, value: 'Apple' },
			{ tag: 0x0112, type: 3, value: orientation },
			{ tag: 0x8825, type: 4, value: 0 },
		],
		8,
		0,
	);
	const ifd0 = ifd(
		[
			{ tag: 0x010f, type: 2, value: 'Apple' },
			{ tag: 0x0112, type: 3, value: orientation },
			{ tag: 0x8825, type: 4, value: draft.end },
		],
		8,
		0,
	);
	const gps = ifd([{ tag: 0x0001, type: 2, value: 'N' }], ifd0.end, 0);
	const tiff = Buffer.concat([tiffHead, ifd0.bytes, gps.bytes]);
	const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
	const app1 = Buffer.alloc(4);
	app1.writeUInt16BE(0xffe1, 0);
	app1.writeUInt16BE(payload.length + 2, 2);
	return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}
