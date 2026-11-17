<!-- Ein Angebot in der Übersicht: Bild, Titel, Ort und Preis. Die Inhalte kommen aus dem CRM. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { MediaImage, type CollectionEntry } from '@dealsystem/site';

	interface Props {
		angebot: CollectionEntry<'angebote'>;
		/** Ebene der Überschrift: eine unter der Überschrift, unter der die Karte steht. */
		ebene?: 'h2' | 'h3';
	}

	let { angebot, ebene = 'h2' }: Props = $props();
</script>

<article class="karte">
	<MediaImage media={angebot.media.bilder[0]} sizes="(min-width: 60rem) 33vw, 100vw" class="karte__bild" />
	<svelte:element this={ebene} class="karte__titel">
		<a href={resolve('/angebote/[slug]', { slug: angebot.slug })}>{angebot.data.titel}</a>
	</svelte:element>
	{#if angebot.data.ort}
		<p class="muted">{angebot.data.ort}</p>
	{/if}
	{#if angebot.data.kurztext}
		<p>{angebot.data.kurztext}</p>
	{/if}
	{#if angebot.data.preis}
		<p><strong>{angebot.data.preis}</strong></p>
	{/if}
</article>

<style>
	.karte :global(.karte__bild) {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}
	.karte__titel {
		margin: 0 0 0.25rem;
		font-size: 1.25rem;
	}
	p {
		margin: 0 0 0.5rem;
	}
</style>
