<script lang="ts">
	import { resolve } from '$app/paths';
	import { MediaImage, RichText } from '@dealsystem/site';

	let { data } = $props();

	const angebot = $derived(data.angebot);
</script>

<svelte:head>
	<title>{angebot.data.titel} – {data.site.name || 'Meine Website'}</title>
	<meta name="description" content={angebot.data.kurztext || `Angebot: ${angebot.data.titel}`} />
</svelte:head>

<article class="section">
	<div class="page">
		<p><a href={resolve('/angebote')}>Zurück zu allen Angeboten</a></p>
		<h1>{angebot.data.titel}</h1>
		{#if angebot.data.ort || angebot.data.preis}
			<p class="muted">
				{[angebot.data.ort, angebot.data.preis].filter(Boolean).join(' · ')}
			</p>
		{/if}

		<MediaImage
			media={angebot.media.bilder[0]}
			sizes="(min-width: 68rem) 68rem, 100vw"
			priority
			class="bild"
		/>

		<RichText content={angebot.data.beschreibung} />

		{#if angebot.media.bilder.length > 1}
			<h2>Weitere Bilder</h2>
			<ul class="galerie" role="list">
				{#each angebot.media.bilder.slice(1) as bild (bild.id)}
					<li><MediaImage media={bild} sizes="(min-width: 60rem) 33vw, 100vw" class="bild" /></li>
				{/each}
			</ul>
		{/if}

		<p><a class="button" href={resolve('/kontakt')}>Zu diesem Angebot anfragen</a></p>
	</div>
</article>

<style>
	article :global(.bild) {
		display: block;
		width: 100%;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
	}
	.galerie {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 1rem;
		margin: 0 0 2rem;
		padding: 0;
		list-style: none;
	}
</style>
