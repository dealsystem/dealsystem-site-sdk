<!--
@component
Zeigt seinen Inhalt erst, wenn der Besucher dem Zweck zugestimmt hat. Vorher
wird der Inhalt gar nicht erzeugt, auch nicht beim Build.

Für fremde Dienste brauchst du `<ConsentGate>` meist nicht: Videos, Karten und
Terminbuchung bindest du mit `<Embed>` ein, fremde Skripte mit
`<ExternalScript>`, Tracking mit `<Tracking />`. Diese Bausteine fragen selbst
nach der Einwilligung. Jeder fremde Host muss unter `external` in
`dealsystem.config.ts` stehen, sonst blockiert ihn der Browser
(`npx dealsystem check` meldet es, `SEC-008`). Anleitung: `extern.md`.

```svelte
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
```

Eigener Inhalt, der erst nach der Zustimmung erscheinen soll, mit Ersatz davor:

```svelte
<ConsentGate category="media">
	<Embed id="video" src="https://www.youtube.com/watch?v=…" title="Rundgang" />
	{#snippet fallback({ accept })}
		<p>Hier steht nach Ihrer Zustimmung ein Video von YouTube.</p>
		<button type="button" onclick={accept}>Video anzeigen</button>
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
	import { gateNeedsConsent } from '../internal/consentNeed.js';

	let { category, children, fallback }: ConsentGateProps = $props();

	onMount(() => consent.init());

	// Meldet dem Cookie-Hinweis, dass hier eine Einwilligung nötig ist. „Marketing“ nur mit Tracking-Kennung
	// oder einem deklarierten Werbe-Dienst: Sonst lassen die Sicherheitsregeln keinen zu.
	$effect(() => {
		if (!gateNeedsConsent(category)) return;
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
