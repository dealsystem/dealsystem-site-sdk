<!--
@component
Zeigt seinen Inhalt erst, wenn der Besucher dem Zweck zugestimmt hat. Vorher
wird der Inhalt gar nicht erzeugt, auch nicht beim Build.

Wichtig: `<ConsentGate>` allein macht einen fremden Dienst nicht erlaubt. Die
Sicherheitsregeln der Seite (CSP in `svelte.config.js`) lassen nur wenige
Anbieter zu; alles andere blockiert der Browser auch nach der Zustimmung, und
`npx dealsystem check` meldet es (`SEC-008`). Freigegeben sind:

- Tracking über `<Tracking />` (Google Tag, Meta Pixel)
- die Karte über `<MapEmbed />` (OpenStreetMap; fragt selbst nach der Zustimmung)

Jeden anderen fremden Inhalt (Google Maps, YouTube, Bewertungs-Widgets) ersetzt
du durch einen gewöhnlichen Link zum Anbieter und sagst dem Kunden, dass sich
dieser Dienst hier nicht einbetten lässt.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```

Eigener Inhalt, der erst nach der Zustimmung erscheinen soll, mit Ersatz davor:

```svelte
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
	import { siteHasTracking } from '../internal/consentNeed.js';

	let { category, children, fallback }: ConsentGateProps = $props();

	onMount(() => consent.init());

	// Meldet dem Cookie-Hinweis, dass hier eine Einwilligung nötig ist. „Marketing“ nur mit Tracking-Kennung:
	// Ohne sie lädt <Tracking> nichts, und andere Werbe-Dienste erlauben die Sicherheitsregeln nicht.
	$effect(() => {
		if (category === 'marketing' && !siteHasTracking()) return;
		return consent.require(category);
	});
</script>

{#if consent.has(category)}
	{@render children()}
{:else if fallback && consent.ready}
	<div data-ds-consent-fallback={category}>
		{@render fallback({ accept: () => consent.grant(category) })}
	</div>
{/if}
