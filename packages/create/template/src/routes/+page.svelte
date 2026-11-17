<script lang="ts">
	import { resolve } from '$app/paths';
	import { RichText, Seo, Text } from '@dealsystem/site';
	import AngebotKarte from '$lib/AngebotKarte.svelte';

	let { data } = $props();
</script>

<!-- Titel, Beschreibung und Vorschaubild kann der Kunde im CRM ersetzen (Eigene Website → Einstellungen → Google und Teilen). -->
<Seo
	title={data.site.name || 'Startseite'}
	description="Immobilien in Ihrer Region: aktuelle Angebote ansehen oder direkt Kontakt aufnehmen."
/>

<section class="section hero">
	<div class="page">
		<Text
			key="start.hero.titel"
			default="Immobilien in Ihrer Region"
			as="h1"
			label="Überschrift"
			group="Startseite"
		/>
		<Text
			key="start.hero.text"
			default="Wir kaufen, verkaufen und entwickeln Immobilien. Persönlich, verlässlich und mit Ortskenntnis."
			as="p"
			multiline
			label="Text unter der Überschrift"
			group="Startseite"
			class="hero__text"
		/>
		<a class="button" href={resolve('/kontakt')}>
			<Text key="start.hero.knopf" default="Kontakt aufnehmen" label="Schaltfläche" group="Startseite" />
		</a>
	</div>
</section>

<section class="section">
	<div class="page">
		<Text
			key="start.ueber.titel"
			default="Über uns"
			as="h2"
			label="Überschrift „Über uns“"
			group="Startseite"
		/>
		<RichText
			key="start.ueber.text"
			default="Hier steht in zwei, drei Sätzen, wer Sie sind und was Sie für Ihre Kunden tun. **Ersetzen Sie diesen Text** durch Ihren eigenen."
			label="Text „Über uns“"
			group="Startseite"
		/>
	</div>
</section>

{#if data.angebote.length > 0}
	<section class="section">
		<div class="page">
			<Text
				key="start.angebote.titel"
				default="Aktuelle Angebote"
				as="h2"
				label="Überschrift der Angebote"
				group="Startseite"
			/>
			<ul class="cards" role="list">
				{#each data.angebote as angebot (angebot.slug)}
					<li><AngebotKarte {angebot} ebene="h3" /></li>
				{/each}
			</ul>
			<p><a href={resolve('/angebote')}>Alle Angebote ansehen</a></p>
		</div>
	</section>
{/if}

<style>
	.hero {
		background: var(--color-surface);
		color: var(--color-on-surface);
	}
	.hero :global(.hero__text) {
		max-width: 40rem;
		font-size: 1.25rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 2rem;
		margin: 0 0 2rem;
		padding: 0;
		list-style: none;
	}
</style>
