// Wie aus einem Bild aus dem CRM (`MediaRef`) `<source>`- und `<img>`-Angaben
// werden. Eine Stelle für `<MediaImage>` und die Patch-Funktion, damit beide
// dasselbe HTML erzeugen.
import type { MediaRef } from '../types.js';

/** Was `<MediaImage>` ausgibt. */
export interface ResolvedImage {
	sources: { type: string; srcset: string }[];
	src: string;
	srcset: string | undefined;
	width: number | undefined;
	height: number | undefined;
	alt: string;
}

const FORMAT_ORDER = ['avif', 'webp'] as const;

/** Bild aus dem CRM. `null`, wenn es keine Bild-Varianten hat. */
export function resolveMediaImage(media: MediaRef, alt: string): ResolvedImage | null {
	if (media.kind !== 'image' || media.variants.length === 0) return null;
	const byWidth = [...media.variants].sort((a, b) => a.width - b.width);
	const srcsetOf = (format: string) =>
		byWidth
			.filter((v) => v.format === format)
			.map((v) => `${v.url} ${v.width}w`)
			.join(', ');
	const jpeg = byWidth.filter((v) => v.format === 'jpeg');
	const fallback = (jpeg.length > 0 ? jpeg : byWidth).at(-1)!;
	const jpegSrcset = srcsetOf('jpeg');
	return {
		sources: FORMAT_ORDER.map((format) => ({ type: `image/${format}`, srcset: srcsetOf(format) })).filter(
			(s) => s.srcset !== '' && (jpeg.length > 0 || s.type !== `image/${fallback.format}`),
		),
		src: fallback.url,
		srcset: jpegSrcset || srcsetOf(fallback.format) || undefined,
		width: media.width ?? undefined,
		height: media.height ?? undefined,
		alt,
	};
}
