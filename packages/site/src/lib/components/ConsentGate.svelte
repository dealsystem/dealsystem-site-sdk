<!--
@component
Zeigt seinen Inhalt erst, wenn der Besucher dem Zweck zugestimmt hat. Alles,
was Daten an Dritte schickt (Tracking, Karten, eingebettete Videos, fremde
Skripte), gehört hier hinein. Vorher wird der Inhalt gar nicht erzeugt — auch
nicht beim Build.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>

<ConsentGate category="media">
	<iframe title="Anfahrt" src="https://www.openstreetmap.org/export/embed.html?bbox=…"></iframe>
	{#snippet fallback({ accept })}
		<p>Die Karte kommt von OpenStreetMap. Beim Laden werden Daten dorthin übertragen.</p>
		<button type="button" onclick={accept}>Karte anzeigen</button>
	{/snippet}
</ConsentGate>
```
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { ConsentCategory } from '../consent/consent.svelte.js';

	export interface ConsentGateProps {
		/** Zweck: `statistics`, `marketing` oder `media`. */
		category: ConsentCategory;
		/** Inhalt, der erst nach der Einwilligung entsteht. */
		children: Snippet;
		/** Ersatz ohne Einwilligung. `accept` stimmt genau diesem Zweck zu. */
		fallback?: Snippet<[{ accept: () => void }]>;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { consent } from '../consent/consent.svelte.js';

	let { category, children, fallback }: ConsentGateProps = $props();

	onMount(() => consent.init());
</script>

{#if consent.has(category)}
	{@render children()}
{:else if fallback && consent.ready}
	<div data-ds-consent-fallback={category}>
		{@render fallback({ accept: () => consent.grant(category) })}
	</div>
{/if}
