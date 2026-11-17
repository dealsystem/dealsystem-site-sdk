<!--
Typ-Tests der Komponenten. Wird nur von svelte-check geprüft, nie gerendert.
Jedes `@ts-expect-error` muss einen echten Fehler treffen.
-->
<script lang="ts" module>
	import type { MediaRef } from '../../src/lib/index.js';

	declare const media: MediaRef | undefined;
	declare const dynamisch: string;
</script>

<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import {
		CollectionList,
		ConsentGate,
		LeadForm,
		MediaImage,
		MediaVideo,
		RichText,
		Text,
	} from '../../src/lib/index.js';

	type ImageProps = ComponentProps<typeof MediaImage>;

	// ---- MediaImage: alt ist Pflicht ------------------------------------
	const mitAlt: ImageProps = { src: '/haus.jpg', alt: 'Sanierter Altbau in Leipzig' };
	const dekorativ: ImageProps = { src: '/muster.svg', alt: '', decorative: true };
	const ausDemCms: ImageProps = { media };
	const slot: ImageProps = { key: 'start.hero.bild', default: '/hero.jpg', alt: 'Haus' };
	// @ts-expect-error alt fehlt
	const ohneAlt: ImageProps = { src: '/haus.jpg' };
	// @ts-expect-error alt fehlt auch beim Bild-Slot
	const slotOhneAlt: ImageProps = { key: 'start.hero.bild', default: '/hero.jpg' };
	// @ts-expect-error decorative verlangt einen leeren Alternativtext
	const widerspruch: ImageProps = { src: '/haus.jpg', alt: 'Haus', decorative: true };
	// @ts-expect-error ohne Quelle
	const ohneQuelle: ImageProps = { alt: 'Haus' };

	// ---- andere Pflicht-Props -------------------------------------------
	// @ts-expect-error title ist Pflicht
	const video: ComponentProps<typeof MediaVideo> = { media };
	// @ts-expect-error default ist Pflicht
	const text: ComponentProps<typeof Text> = { key: 'start.titel' };
	// @ts-expect-error unbekanntes Element
	const element: ComponentProps<typeof Text> = { key: 'start.titel', default: 'x', as: 'marquee' };
	// @ts-expect-error entweder Slot oder Eintragsfeld, nicht beides
	const richtext: ComponentProps<typeof RichText> = { key: 'a.b', default: 'x', content: null };
	// @ts-expect-error Richtext braucht einen vorbereiteten Wert, keine Zeichenkette
	const roh: ComponentProps<typeof RichText> = { content: '<b>x</b>' };

	void [mitAlt, dekorativ, ausDemCms, slot, ohneAlt, slotOhneAlt, widerspruch, ohneQuelle];
	void [video, text, element, richtext, roh];
</script>

<!-- Gültige Verwendung -->
<MediaImage src="/haus.jpg" alt="Sanierter Altbau in Leipzig" sizes="100vw" priority />
<MediaImage src="/haus.jpg" alt={dynamisch} />
<MediaImage src="/muster.svg" alt="" decorative />
<MediaImage {media} />
<LeadForm funnel="kontakt" submitLabel="Anfrage senden" />
<CollectionList collection="angebote" limit={12}>
	{#snippet item(angebot)}
		{angebot.data.titel}
		<RichText content={angebot.data.beschreibung} />
		<MediaImage media={angebot.media.bilder[0]} />
	{/snippet}
</CollectionList>
<ConsentGate category="marketing">Inhalt</ConsentGate>
