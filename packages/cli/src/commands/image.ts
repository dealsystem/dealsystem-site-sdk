// `dealsystem image add <datei>` und `image push <datei> --slot … --alt …` (Ende der Datei).
// `add` — ein Foto ins Projekt holen, lokal und ohne DealSystem: Format und Größe prüfen,
// nach der EXIF-Drehung ausrichten, auf höchstens 2 560 px verkleinern, ALLE Metadaten entfernen (Handyfotos
// tragen GPS-Koordinaten, oft die der Wohnung) und nach `src/lib/assets/bilder/` schreiben. Danach steht dort ein
// Baustein, den der Agent einsetzen kann: `<MediaImage key=… default=…>`, im CRM tauschbar.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import { scanSlots, SlotScanError } from '@dealsystem/site/vite';
import { CliError, EXIT } from '../api/errors.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { canonicalJson, CONTENT_FILE } from '../project/snapshot.js';

/** Größte Datei, die angenommen wird (wie beim Hochladen ins CRM). */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
/** Längste Kante nach dem Verkleinern. */
export const IMAGE_MAX_EDGE = 2560;
/** Zielordner im Projekt und der Import dazu. */
export const IMAGE_DIR = 'src/lib/assets/bilder';
const IMAGE_IMPORT = '$lib/assets/bilder';

type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';
const EXT: Record<OutputFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Dateiname ohne Endung als Name: `Über uns (1).JPG` → `ueber-uns-1`. */
export function imageNameFrom(file: string): string {
	return basename(file, extname(file))
		.toLowerCase()
		.replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
}

/** `ueber-uns-foto` → `ueberUnsFoto`; beginnt der Name mit einer Ziffer, `bild2024`. */
function variableName(name: string): string {
	const camel = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
	return /^[a-z]/.test(camel) ? camel : `bild${camel}`;
}

/** HEIC/HEIF von iPhones: `ftyp` mit einer HEVC-Marke. Das gebündelte sharp kann HEVC nicht lesen. */
function isHeic(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const box = Buffer.from(bytes.subarray(4, 12)).toString('latin1');
	return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(box) && !/^ftypavi[fs]$/.test(box);
}

/** Steht im EXIF ein GPS-Block (Tag 0x8825)? Nur für die Meldung; entfernt wird ohnehin alles. */
function hasGps(exif: Buffer | undefined): boolean {
	if (!exif) return false;
	return exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88]));
}

function usage(message: string, fix: string): CliError {
	return new CliError('invalid_arguments', message, fix, EXIT.usage);
}

type Sharp = typeof import('sharp');

async function loadSharp(): Promise<Sharp> {
	try {
		return (await import('sharp')).default as unknown as Sharp;
	} catch (e) {
		throw new CliError(
			'image_tool_missing',
			`Die Bildbearbeitung (sharp) lässt sich auf diesem Rechner nicht laden: ${(e as Error).message}`,
			'Führe `npm install` im Projekt erneut aus. Hilft das nicht, verkleinere das Bild selbst und lege es ohne Standortdaten nach `src/lib/assets/bilder/`.',
			EXIT.failed,
		);
	}
}

export async function imageCommand(ctx: CommandContext): Promise<CommandResult> {
	const [sub, file, ...rest] = ctx.positionals;
	if (sub !== 'add' && sub !== 'push') {
		throw usage(
			sub ? `Unbekannter Unterbefehl \`image ${sub}\`.` : 'Es fehlt der Unterbefehl.',
			'Aufruf: `npx dealsystem image add <datei> [--name <name>] [--key <schlüssel>] [--alt "…"]` oder `npx dealsystem image push <datei> --slot <schlüssel> --alt "…"`.',
		);
	}
	if (!file || rest.length > 0) {
		throw usage('Gib genau eine Bilddatei an.', `Aufruf: \`npx dealsystem image ${sub} pfad/zum/foto.jpg\`.`);
	}
	if (!existsSync(ctx.path('package.json'))) {
		throw new CliError(
			'not_a_project',
			`${ctx.projectDir} ist kein Website-Projekt (package.json fehlt).`,
			'Wechsle in den Projektordner oder gib ihn mit `--dir <ordner>` an.',
			EXIT.usage,
		);
	}
	return sub === 'add' ? imageAdd(ctx, file) : imagePush(ctx, file);
}

/** Ergebnis der lokalen Bearbeitung: Bytes ohne Metadaten, Maße, Format, was entfernt wurde. */
interface ProcessedImage {
	data: Buffer;
	width: number;
	height: number;
	format: OutputFormat;
	resized: boolean;
	removed: { exif: boolean; gps: boolean; xmp: boolean; iptc: boolean };
}

/**
 * Prüfen, drehen, verkleinern, alle Metadaten entfernen — eine Bearbeitung für `add` und `push`. `crm: true` gibt
 * nur Formate aus, die DealSystem annimmt (AVIF wird zu WebP).
 */
async function processImage(
	ctx: CommandContext,
	file: string,
	opts: { crm: boolean },
): Promise<ProcessedImage> {
	// Die Datei liegt irgendwo (Downloads, Desktop); der Pfad gilt wie in der Shell ab dem aktuellen Ordner.
	const input = isAbsolute(file) ? file : resolve(ctx.io.cwd, file);
	const stat = existsSync(input) ? statSync(input) : null;
	if (!stat?.isFile()) throw usage(`Die Datei \`${file}\` gibt es nicht.`, 'Prüfe den Pfad zur Bilddatei.');
	if (stat.size > IMAGE_MAX_BYTES) {
		throw new CliError(
			'image_too_large',
			`\`${file}\` ist ${(stat.size / 1024 / 1024).toFixed(1)} MB groß (erlaubt 15 MB).`,
			'Bitte den Kunden um eine kleinere Fassung, z. B. beim Senden „Originalgröße“ abwählen.',
			EXIT.failed,
		);
	}

	const bytes = readFileSync(input);
	if (isHeic(bytes)) {
		throw new CliError(
			'image_heic',
			`\`${file}\` ist ein iPhone-Foto im Format HEIC. Das lässt sich hier nicht umwandeln.`,
			'Bitte den Kunden, das Foto als JPEG zu schicken: in der Fotos-App „Teilen“ → „Optionen“ → „Am kompatibelsten“, oder per Mail mit „Tatsächliche Größe“. Am Mac: in Vorschau öffnen und als JPEG exportieren.',
			EXIT.failed,
		);
	}

	const sharp = await loadSharp();
	let meta: Awaited<ReturnType<ReturnType<Sharp>['metadata']>>;
	try {
		meta = await sharp(bytes, { failOn: 'error' }).metadata();
	} catch {
		throw new CliError(
			'image_unreadable',
			`\`${file}\` ist kein lesbares Bild.`,
			'Erlaubt sind JPEG, PNG, WebP und AVIF.',
			EXIT.failed,
		);
	}
	const inputFormat: OutputFormat | null =
		meta.format === 'jpeg' || meta.format === 'png' || meta.format === 'webp'
			? meta.format
			: meta.format === 'heif' && meta.compression === 'av1'
				? 'avif'
				: null;
	if (!inputFormat || (meta.pages ?? 1) > 1) {
		throw new CliError(
			'image_format',
			`\`${file}\` hat das Format ${meta.pages && meta.pages > 1 ? 'animiert' : (meta.format ?? 'unbekannt')}; erlaubt sind JPEG, PNG, WebP und AVIF (ohne Animation).`,
			'Bitte den Kunden um ein Foto als JPEG. SVG-Grafiken (z. B. ein Logo) gehören nach `static/` und werden mit `src="/logo.svg"` eingebunden.',
			EXIT.failed,
		);
	}

	// DealSystem nimmt JPEG, PNG und WebP; ein AVIF für das CRM wird WebP (ähnlich klein, überall lesbar).
	const format: OutputFormat = opts.crm && inputFormat === 'avif' ? 'webp' : inputFormat;
	// `rotate()` ohne Winkel richtet nach der EXIF-Angabe aus; danach darf sie weg. sharp schreibt ohne
	// `withMetadata`/`keepExif` keine Metadaten (EXIF, GPS, XMP, IPTC) in die Ausgabe.
	let pipeline = sharp(bytes, { failOn: 'error' })
		.rotate()
		.resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true });
	pipeline =
		format === 'jpeg'
			? pipeline.jpeg({ quality: 82, mozjpeg: true })
			: format === 'png'
				? pipeline.png({ compressionLevel: 9 })
				: format === 'webp'
					? pipeline.webp({ quality: 82 })
					: pipeline.avif({ quality: 55 });
	const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

	// Doppelt hält besser: Was hinausgeht, wird noch einmal gelesen.
	const check = await sharp(data).metadata();
	if (check.exif || check.xmp || check.iptc) {
		throw new CliError(
			'image_metadata',
			'Die Metadaten ließen sich nicht entfernen; das Bild wurde nicht gespeichert.',
			'Melde das an DealSystem und nutze bis dahin ein anderes Foto.',
			EXIT.failed,
		);
	}

	return {
		data,
		width: info.width,
		height: info.height,
		format,
		resized: info.width !== meta.width || info.height !== meta.height,
		removed: {
			exif: Boolean(meta.exif),
			gps: hasGps(meta.exif),
			xmp: Boolean(meta.xmp),
			iptc: Boolean(meta.iptc),
		},
	};
}

/** „entfernt: Standort (GPS), Kameradaten (EXIF)“ für die Meldung. */
function removedText(removed: ProcessedImage['removed']): string {
	return [
		removed.gps ? 'Standort (GPS)' : null,
		removed.exif ? 'Kameradaten (EXIF)' : null,
		removed.xmp || removed.iptc ? 'weitere Metadaten' : null,
	]
		.filter(Boolean)
		.join(', ');
}

async function imageAdd(ctx: CommandContext, file: string): Promise<CommandResult> {
	const name = ctx.str('name') ?? imageNameFrom(file);
	if (!NAME.test(name) || name.length > 60) {
		throw usage(
			`Der Name \`${name}\` geht nicht.`,
			'Nimm Kleinbuchstaben, Ziffern und Bindestriche, z. B. `--name ueber-uns-foto`.',
		);
	}
	const { data, width, height, format, resized, removed } = await processImage(ctx, file, { crm: false });
	const info = { width, height };

	const fileName = `${name}.${EXT[format]}`;
	const target = `${IMAGE_DIR}/${fileName}`;
	if (existsSync(ctx.path(target)) && !ctx.flag('force')) {
		throw new CliError(
			'image_exists',
			`\`${target}\` gibt es schon.`,
			'Wähle mit `--name` einen anderen Namen oder überschreibe mit `--force`, wenn das alte Bild weg darf.',
			EXIT.usage,
		);
	}

	const variable = variableName(name);
	const key = ctx.str('key') ?? `bilder.${name}`;
	const alt = ctx.str('alt');
	const importLine = `import ${variable} from '${IMAGE_IMPORT}/${fileName}';`;
	const component =
		`<MediaImage key="${key}" default={${variable}} width={${info.width}} height={${info.height}} ` +
		`alt="${(alt ?? '…').replace(/"/g, '&quot;')}" label="Foto" />`;
	// Den Baustein so prüfen, wie der Build ihn liest: ein ungültiger Schlüssel fällt hier auf, nicht erst beim Hochladen.
	try {
		scanSlots(
			`<script lang="ts">\n\timport { MediaImage } from '@dealsystem/site';\n\t${importLine}\n</script>\n\n${component}\n`,
			'src/routes/+page.svelte',
		);
	} catch (e) {
		if (e instanceof SlotScanError) {
			throw usage(
				e.message.replace(/^\[dealsystem\]\s+\S+:\d+\s+/, ''),
				'Gib mit `--key` einen gültigen Schlüssel an.',
			);
		}
		throw e;
	}

	mkdirSync(ctx.path(IMAGE_DIR), { recursive: true });
	writeFileSync(ctx.path(target), data);

	const what = removedText(removed);
	return {
		exitCode: EXIT.ok,
		data: {
			path: target,
			import: importLine,
			component,
			key,
			width: info.width,
			height: info.height,
			bytes: data.byteLength,
			format,
			resized,
			removed,
		},
		text: [
			`Gespeichert: ${target} (${info.width} × ${info.height} px, ${Math.ceil(data.byteLength / 1024)} KB)${what ? `, entfernt: ${what}` : ''}.`,
			'Einbauen, im <script> der Seite:',
			`  ${importLine}`,
			'und an der Stelle des Bildes:',
			`  ${component}`,
			alt ? '' : 'Ersetze alt="…" durch eine Beschreibung dessen, was zu sehen ist.',
			'Nach dem Hochladen kann der Kunde das Bild unter Eigene Website → Inhalte selbst tauschen.',
		]
			.filter(Boolean)
			.join('\n'),
	};
}

/** Größte Datei, die DealSystem für einen Bild-Platz annimmt (wie „Bild ersetzen“ im CRM). */
export const CRM_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const SLOT_KEY = /^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/;

/**
 * `dealsystem image push <datei> --slot <schlüssel> --alt "…"`: das Foto wie bei `add` bearbeiten (drehen,
 * verkleinern, Metadaten weg) und als eigenes Bild des Bild-Platzes in DealSystem setzen — derselbe Weg wie „Bild
 * ersetzen“ im CRM (`POST /websites/{id}/media` → PUT → `…/complete`). Danach `.dealsystem/content.json` neu holen,
 * damit `dev` das Bild sofort zeigt (`/_ds/media/*` reicht der Dev-Server an die Seite im Netz durch).
 *
 * Keine Rückfrage: Inhalte gehen nach der Entscheidung des Inhabers ohne Freigabe live, wie im CRM. Die Meldung
 * sagt das; zurück auf das Bild aus dem Code geht es im CRM (Inhalte → „Auf Standard zurücksetzen“).
 */
async function imagePush(ctx: CommandContext, file: string): Promise<CommandResult> {
	const slotKey = ctx.str('slot');
	if (!slotKey) {
		throw usage(
			'Es fehlt der Bild-Platz.',
			'Gib mit `--slot <schlüssel>` an, welches Bild ersetzt wird — der Schlüssel aus `<MediaImage key="…">`.',
		);
	}
	if (!SLOT_KEY.test(slotKey)) {
		throw usage(
			`\`${slotKey}\` ist kein Schlüssel eines Bild-Platzes.`,
			'Nimm den Schlüssel aus `<MediaImage key="…">`, z. B. `--slot ueber.foto`.',
		);
	}
	const alt = ctx.str('alt')?.trim();
	if (!alt) {
		throw usage(
			'Es fehlt der Alternativtext.',
			'Gib mit `--alt "…"` kurz an, was auf dem Bild zu sehen ist (für Blinde und Suchmaschinen), z. B. `--alt "Das Team vor dem Büro"`.',
		);
	}
	if (alt.length > 1000) throw usage('Der Alternativtext ist zu lang.', 'Höchstens 1000 Zeichen.');

	const siteId = ctx.siteId();
	const image = await processImage(ctx, file, { crm: true });
	if (image.data.byteLength > CRM_IMAGE_MAX_BYTES) {
		throw new CliError(
			'image_too_large',
			`Das Foto ist nach dem Verkleinern noch ${(image.data.byteLength / 1024 / 1024).toFixed(1)} MB groß (erlaubt 10 MB).`,
			'Nimm ein Foto mit weniger Details oder als JPEG.',
			EXIT.failed,
		);
	}

	const api = ctx.api();
	ctx.progress('Prüfe den Bild-Platz …');
	const slots = await api.listSlots(siteId);
	const slot = slots.find((s) => s.key === slotKey);
	const imageKeys = slots.filter((s) => s.type === 'image').map((s) => s.key);
	if (!slot) {
		throw new CliError(
			'slot_not_found',
			`Einen Bild-Platz \`${slotKey}\` kennt DealSystem für diese Website nicht.`,
			imageKeys.length
				? `Vorhanden: ${imageKeys.join(', ')}. Ein neuer Platz aus dem Code ist erst nach \`npx dealsystem deploy\` bekannt.`
				: 'Die Website hat noch keinen Bild-Platz. Baue zuerst `<MediaImage key="…" default={…}>` ein (siehe `npx dealsystem image add`) und lade mit `npx dealsystem deploy` hoch.',
			EXIT.usage,
		);
	}
	if (slot.type !== 'image') {
		throw new CliError(
			'slot_not_image',
			`\`${slotKey}\` ist ein Text (${slot.type}), kein Bild-Platz.`,
			imageKeys.length ? `Bild-Plätze: ${imageKeys.join(', ')}.` : 'Die Website hat noch keinen Bild-Platz.',
			EXIT.usage,
		);
	}

	ctx.progress('Lade das Foto hoch …');
	const upload = await api.prepareImageUpload(siteId, { slotKey, bytes: image.data.byteLength });
	await api.uploadImage(upload, image.data);
	const result = await api.completeImageUpload(siteId, upload.uploadId, { slotKey, alt });

	// Lokal sofort sichtbar: den Schnappschuss neu holen. Scheitert das, ist das Bild trotzdem gesetzt.
	let contentFile: string | null = CONTENT_FILE;
	try {
		ctx.progress('Hole Inhalte aus dem CRM …');
		const snapshot = await api.getContent(siteId);
		mkdirSync(dirname(ctx.path(CONTENT_FILE)), { recursive: true });
		writeFileSync(ctx.path(CONTENT_FILE), canonicalJson(snapshot));
	} catch {
		contentFile = null;
	}

	const what = removedText(image.removed);
	return {
		exitCode: EXIT.ok,
		data: {
			slotKey,
			mediaId: result?.mediaId ?? null,
			width: image.width,
			height: image.height,
			bytes: image.data.byteLength,
			format: image.format,
			resized: image.resized,
			removed: image.removed,
			contentFile,
		},
		text: [
			`Gesetzt: Bild-Platz ${slotKey} zeigt jetzt dieses Foto (${image.width} × ${image.height} px${what ? `, entfernt: ${what}` : ''}).`,
			'Die Website wird automatisch neu gebaut und zeigt es ohne weitere Freigabe, meist nach ein bis zwei Minuten.',
			contentFile
				? `Lokal: ${CONTENT_FILE} aktualisiert; \`npx dealsystem dev\` zeigt das neue Bild.`
				: 'Lokal: Inhalte nicht geholt; `npx dealsystem sync` holt sie nach.',
			'Zurück auf das Bild aus dem Code: im CRM unter Eigene Website → Inhalte „Auf Standard zurücksetzen“.',
		].join('\n'),
	};
}
