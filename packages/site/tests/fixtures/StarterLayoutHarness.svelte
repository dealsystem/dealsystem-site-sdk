<script lang="ts">
	// Layout wie im Starter: Tracking im ConsentGate, sonst nichts Einwilligungspflichtiges. Optional eine Karte.
	import ConsentGate from '../../src/lib/components/ConsentGate.svelte';
	import CookieBanner from '../../src/lib/components/CookieBanner.svelte';
	import MapEmbed from '../../src/lib/components/MapEmbed.svelte';
	import SiteFooterLegal from '../../src/lib/components/SiteFooterLegal.svelte';
	import Tracking from '../../src/lib/components/Tracking.svelte';

	let { map = false }: { map?: boolean } = $props();
</script>

<main>
	<h1>Startseite</h1>
	{#if map}
		<MapEmbed lat={53.8676} lon={10.6866} title="Unser Büro" />
	{/if}
</main>
<footer><SiteFooterLegal /></footer>
<CookieBanner />
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
