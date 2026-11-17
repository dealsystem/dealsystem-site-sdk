<!--
@component
Ein Bild. `<img>` wird auf der Seite nie direkt geschrieben, immer `<MediaImage>`.
`alt` beschreibt, was auf dem Bild zu sehen ist. Nur bei reinem Schmuck:
`alt="" decorative`.

Lokales Bild (mit `?enhanced` entstehen WebP/AVIF und `srcset` automatisch):

```svelte
<script lang="ts">
	import { MediaImage } from '@dealsystem/site';
	import heroBild from '$lib/bilder/hero.jpg?enhanced';
</script>

<MediaImage src={heroBild} alt="Sanierter Altbau in Leipzig" sizes="100vw" priority />
```

Bild aus dem CMS (der Alternativtext kommt aus dem CMS):

```svelte
<MediaImage media={angebot.media.bilder[0]} sizes="(min-width: 800px) 50vw, 100vw" />
```

Bild, das der Kunde später im CRM austauschen kann:

```svelte
<MediaImage key="start.hero.bild" default={heroBild} alt="Sanierter Altbau in Leipzig" />
```
-->
<script lang="ts" module>
	import type { EnhancedPicture, MediaRef } from '../types.js';

	/** Ein leerer Alternativtext ist nur zusammen mit `decorative` erlaubt. */
	type DescribingAlt<A extends string> = A extends ''
		? 'Fehler: alt darf nicht leer sein. Beschreibe das Bild, oder setze alt="" zusammen mit decorative.'
		: A;

	type AltProps<A extends string> =
		| {
				/** Beschreibt das Bild für Menschen, die es nicht sehen. */
				alt: DescribingAlt<A>;
				decorative?: false;
		  }
		| {
				alt: '';
				/** Reiner Schmuck: Vorleseprogramme überspringen das Bild. */
				decorative: true;
		  };

	interface CommonProps {
		/** Anzeigebreite für die Auswahl der Bildgröße, z. B. `(min-width: 800px) 50vw, 100vw`. Standard `100vw`. */
		sizes?: string;
		/** Für das wichtigste Bild im sichtbaren Bereich: wird sofort geladen. */
		priority?: boolean;
		class?: string;
	}

	export type MediaImageProps<A extends string = string> = CommonProps &
		(
			| ({
					/** Lokales Bild: Import mit `?enhanced` oder Pfad aus `static/`. */
					src: EnhancedPicture | string;
					/** Breite in Pixeln. Nur nötig, wenn `src` ein Pfad ist. */
					width?: number;
					/** Höhe in Pixeln. Nur nötig, wenn `src` ein Pfad ist. */
					height?: number;
					key?: undefined;
					media?: undefined;
			  } & AltProps<A>)
			| ({
					/** Schlüssel des Bild-Slots, z. B. `start.hero.bild`. */
					key: string;
					/** Bild, solange im CRM kein anderes gewählt ist. */
					default: EnhancedPicture | string;
					width?: number;
					height?: number;
					/** Beschriftung im CRM. */
					label?: string;
					/** Gruppe im CRM. */
					group?: string;
					/** Frühere Schlüssel dieses Bildes. */
					aliases?: readonly string[];
					src?: undefined;
					media?: undefined;
			  } & AltProps<A>)
			| {
					/** Bild aus einem CMS-Eintrag. Fehlt es, wird nichts ausgegeben. */
					media: MediaRef | null | undefined;
					/** Ersetzt den Alternativtext aus dem CMS. */
					alt?: string;
					decorative?: boolean;
					src?: undefined;
					key?: undefined;
			  }
		);
</script>

<script lang="ts" generics="A extends string">
	import { getSiteData } from '../internal/siteData.js';
	import { usageError } from '../internal/usage.js';
	import { resolveImageSlot } from '../slots.js';

	let props: MediaImageProps<A> = $props();

	interface Resolved {
		sources: { type: string; srcset: string }[];
		src: string;
		srcset: string | undefined;
		width: number | undefined;
		height: number | undefined;
		alt: string;
	}

	const FORMAT_ORDER = ['avif', 'webp'] as const;

	function fromMedia(media: MediaRef, alt: string): Resolved | null {
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

	function fromLocal(
		image: EnhancedPicture | string,
		alt: string,
		width: number | undefined,
		height: number | undefined,
	): Resolved {
		if (typeof image === 'string') {
			return { sources: [], src: image, srcset: undefined, width, height, alt };
		}
		return {
			sources: Object.entries(image.sources).map(([format, srcset]) => ({ type: `image/${format}`, srcset })),
			src: image.img.src,
			srcset: undefined,
			width: image.img.w,
			height: image.img.h,
			alt,
		};
	}

	function describingAlt(alt: unknown, decorative: boolean | undefined, where: string): string {
		if (decorative) return '';
		if (typeof alt !== 'string' || alt.trim() === '') {
			usageError(
				`<MediaImage ${where}> hat keinen Alternativtext. Beschreibe das Bild in alt, ` +
					'oder setze alt="" zusammen mit decorative, wenn es reiner Schmuck ist.',
			);
			return '';
		}
		return alt;
	}

	const image = $derived.by((): Resolved | null => {
		// `in` statt Vergleich: `media={undefined}` (Eintrag ohne Bild) gehört hierher.
		if ('media' in props) {
			const media = props.media;
			if (!media) return null;
			// Leerer Alternativtext im CMS heißt: dekorativ.
			const alt = props.decorative ? '' : (props.alt ?? media.alt);
			return fromMedia(media, alt);
		}
		if (props.key !== undefined) {
			const alt = describingAlt(props.alt, props.decorative, `key="${props.key}"`);
			const override = resolveImageSlot(getSiteData().slots, props.key, props.aliases);
			if (override) return fromMedia(override, props.decorative ? '' : override.alt || alt);
			return fromLocal(props.default, alt, props.width, props.height);
		}
		if (props.src === undefined) {
			usageError('<MediaImage> braucht eine Quelle: src (lokales Bild), media (CMS) oder key mit default.');
			return null;
		}
		const where = typeof props.src === 'string' ? `src="${props.src}"` : 'src={…}';
		return fromLocal(props.src, describingAlt(props.alt, props.decorative, where), props.width, props.height);
	});

	const sizes = $derived(props.sizes ?? '100vw');
</script>

{#if image}
	<picture class="ds-image" data-ds-slot={props.key}>
		{#each image.sources as source (source.type)}
			<source type={source.type} srcset={source.srcset} {sizes} />
		{/each}
		<img
			class={props.class}
			src={image.src}
			srcset={image.srcset}
			sizes={image.srcset || image.sources.length > 0 ? sizes : undefined}
			width={image.width}
			height={image.height}
			alt={image.alt}
			loading={props.priority ? 'eager' : 'lazy'}
			fetchpriority={props.priority ? 'high' : undefined}
			decoding="async"
			data-ds-image
		/>
	</picture>
{/if}

<style>
	.ds-image {
		display: contents;
	}
	img {
		max-width: 100%;
		height: auto;
	}
</style>
