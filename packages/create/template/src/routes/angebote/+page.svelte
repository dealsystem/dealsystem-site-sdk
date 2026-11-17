<script lang="ts">
	import { resolve } from '$app/paths';
	import { Text } from '@dealsystem/site';
	import AngebotKarte from '$lib/AngebotKarte.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Angebote – {data.site.name || 'Meine Website'}</title>
	<meta name="description" content="Alle aktuellen Immobilien-Angebote im Überblick." />
</svelte:head>

<section class="section">
	<div class="page">
		<Text key="angebote.titel" default="Angebote" as="h1" label="Überschrift" group="Angebote" />
		<Text
			key="angebote.text"
			default="Hier finden Sie unsere aktuellen Angebote. Sprechen Sie uns an, wenn etwas für Sie dabei ist."
			as="p"
			multiline
			label="Einleitung"
			group="Angebote"
		/>

		{#if data.angebote.length > 0}
			<ul class="cards" role="list">
				{#each data.angebote as angebot (angebot.slug)}
					<li><AngebotKarte {angebot} /></li>
				{/each}
			</ul>
		{:else}
			<Text
				key="angebote.leer"
				default="Zurzeit haben wir kein Angebot online. Schreiben Sie uns gern, wonach Sie suchen."
				as="p"
				label="Hinweis ohne Angebote"
				group="Angebote"
			/>
			<p><a class="button" href={resolve('/kontakt')}>Kontakt aufnehmen</a></p>
		{/if}
	</div>
</section>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 2rem;
		margin: 2rem 0 0;
		padding: 0;
		list-style: none;
	}
</style>
