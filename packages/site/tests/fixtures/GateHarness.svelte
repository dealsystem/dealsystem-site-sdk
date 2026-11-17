<script lang="ts">
	import ConsentGate from '../../src/lib/components/ConsentGate.svelte';
	import type { ConsentCategory } from '../../src/lib/consent/consent.svelte.js';

	let { category, withFallback = false }: { category: ConsentCategory; withFallback?: boolean } = $props();
</script>

{#if withFallback}
	<ConsentGate {category}>
		<iframe title="Karte" src="https://maps.example/embed"></iframe>
		{#snippet fallback({ accept })}
			<p>Die Karte kommt von einem anderen Anbieter.</p>
			<button type="button" onclick={accept}>Karte anzeigen</button>
		{/snippet}
	</ConsentGate>
{:else}
	<ConsentGate {category}>
		<iframe title="Karte" src="https://maps.example/embed"></iframe>
	</ConsentGate>
{/if}
