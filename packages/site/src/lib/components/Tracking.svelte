<!--
@component
Bindet Meta Pixel und Google Tag ein. Die IDs stehen im CRM unter
Eigene Website → Einstellungen, nie im Code. Geladen wird erst nach der Einwilligung
„Marketing“. Eigene Pixel-Snippets sind nicht erlaubt.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { loadTracking } from '../client/tracking.js';
	import { consent } from '../consent/consent.svelte.js';
	import { siteHasTracking } from '../internal/consentNeed.js';
	import { getSiteData } from '../internal/siteData.js';

	onMount(() => consent.init());

	$effect(() => {
		if (siteHasTracking()) return consent.require('marketing');
	});

	$effect(() => {
		// Prüft selbst noch einmal: auch außerhalb von <ConsentGate> lädt nichts ohne Einwilligung.
		if (consent.has('marketing')) loadTracking(getSiteData().tracking);
	});
</script>
