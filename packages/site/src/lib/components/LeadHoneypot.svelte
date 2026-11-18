<!--
@component
Bot-Falle für ein Formular mit `createLeadClient()`: ein Feld, das Menschen nicht
sehen und nicht erreichen. Füllt ein Programm es aus, nimmt DealSystem die
Anfrage still nicht an. Gehört einmal in die eigene Oberfläche, am besten in
das `<form>`. `<LeadForm>` bringt es schon mit.

```svelte
<LeadHoneypot client={lead} />
```
-->
<script lang="ts" module>
	import type { LeadClient } from '../client/leadClient.svelte.js';

	export interface LeadHoneypotProps {
		/** Der Client aus `createLeadClient()`. */
		client: Pick<LeadClient, 'setHoneypot'>;
	}
</script>

<script lang="ts">
	let { client }: LeadHoneypotProps = $props();

	const uid = $props.id();
	let value = $state('');

	$effect(() => client.setHoneypot(value));
</script>

<div class="ds-honeypot" aria-hidden="true" data-ds-honeypot>
	<label for="{uid}-website">Website (bitte leer lassen)</label>
	<input id="{uid}-website" type="text" name="website" tabindex="-1" autocomplete="off" bind:value />
</div>

<style>
	.ds-honeypot {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
