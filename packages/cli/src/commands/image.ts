// `dealsystem image add <datei>` — ein Foto ins Projekt holen, lokal und ohne DealSystem: Format und Größe prüfen,
// nach der EXIF-Drehung ausrichten, auf höchstens 2 560 px verkleinern, ALLE Metadaten entfernen (Handyfotos
// tragen GPS-Koordinaten, oft die der Wohnung) und nach `src/lib/assets/bilder/` schreiben. Danach steht dort ein
// Baustein, den der Agent einsetzen kann: `<MediaImage key=… default=…>`, im CRM tauschbar.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import { scanSlots, SlotScanError } from '@dealsystem/site/vite';
import { CliError, EXIT } from '../api/errors.js';
import type { CommandContext, CommandResult } from '../cli/context.js';

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
	if (sub !== 'add') {
		throw usage(
			sub ? `Unbekannter Unterbefehl \`image ${sub}\`.` : 'Es fehlt der Unterbefehl.',
			'Aufruf: `npx dealsystem image add <datei> [--name <name>] [--key <schlüssel>] [--alt "…"]`.',
		);
	}
	if (!file || rest.length > 0) {
		throw usage('Gib genau eine Bilddatei an.', 'Aufruf: `npx dealsystem image add pfad/zum/foto.jpg`.');
	}
	if (!existsSync(ctx.path('package.json'))) {
		throw new CliError(
			'not_a_project',
			`${ctx.projectDir} ist kein Website-Projekt (package.json fehlt).`,
			'Wechsle in den Projektordner oder gib ihn mit `--dir <ordner>` an.',
			EXIT.usage,
		);
	}

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

	const name = ctx.str('name') ?? imageNameFrom(file);
	if (!NAME.test(name) || name.length > 60) {
		throw usage(
			`Der Name \`${name}\` geht nicht.`,
			'Nimm Kleinbuchstaben, Ziffern und Bindestriche, z. B. `--name ueber-uns-foto`.',
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
	const format: OutputFormat | null =
		meta.format === 'jpeg' || meta.format === 'png' || meta.format === 'webp'
			? meta.format
			: meta.format === 'heif' && meta.compression === 'av1'
				? 'avif'
				: null;
	if (!format || (meta.pages ?? 1) > 1) {
		throw new CliError(
			'image_format',
			`\`${file}\` hat das Format ${meta.pages && meta.pages > 1 ? 'animiert' : (meta.format ?? 'unbekannt')}; erlaubt sind JPEG, PNG, WebP und AVIF (ohne Animation).`,
			'Bitte den Kunden um ein Foto als JPEG. SVG-Grafiken (z. B. ein Logo) gehören nach `static/` und werden mit `src="/logo.svg"` eingebunden.',
			EXIT.failed,
		);
	}

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

	const removed = {
		exif: Boolean(meta.exif),
		gps: hasGps(meta.exif),
		xmp: Boolean(meta.xmp),
		iptc: Boolean(meta.iptc),
	};
	const what = [
		removed.gps ? 'Standort (GPS)' : null,
		removed.exif ? 'Kameradaten (EXIF)' : null,
		removed.xmp || removed.iptc ? 'weitere Metadaten' : null,
	]
		.filter(Boolean)
		.join(', ');
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
			resized: info.width !== meta.width || info.height !== meta.height,
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
