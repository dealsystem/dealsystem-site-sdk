<!--
@component
Lädt ein fremdes Skript (Chat, Tag-Manager, Widget) erst, wenn der Besucher der
Kategorie aus der Deklaration zugestimmt hat. Je Seite höchstens einmal; nach
einem Widerruf lädt die Seite neu, damit das Skript weg ist. Zeigt selbst nichts.

`id` ist ein Schlüssel aus `external` in `dealsystem.config.ts`; `src` muss zu
einem Host unter `script` passen oder ein Pfad der eigenen Seite sein
(`/scripts/gtm.js` aus `static/`). Inline-Code gibt es nicht: Ein Snippet des
Anbieters legst du als Datei unter `static/scripts/` ab. Anleitung: `extern.md`.

```svelte
<ExternalScript id="chat" src="https://js.hs-scripts.com/1234567.js" attrs={{ id: 'hs-script-loader', defer: true }} />
```

```ts
// dealsystem.config.ts
external: {
	chat: {
		category: 'marketing',
		provider: 'HubSpot, Inc., USA',
		purpose: 'Live-Chat mit dem Vertrieb',
		privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
		script: ['https://js.hs-scripts.com'],
		connect: ['https://*.hubspot.com'],
	},
},
```
-->
<script lang="ts" module>
	import type { ExternalScriptAttrs } from '../client/externalScript.js';
	import type { ExternalKey } from '../types.js';

	export interface ExternalScriptProps {
		/** Schlüssel aus `external` in `dealsystem.config.ts`, z. B. `chat`. */
		id: ExternalKey;
		/** Adresse des Skripts beim Anbieter oder Pfad der eigenen Seite (`/scripts/gtm.js`). */
		src: string;
		/** `async`, `defer`, `id`, `type`, `crossorigin`, `referrerpolicy` und `data-*`. Ohne Angabe: `async`. */
		attrs?: ExternalScriptAttrs;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidScriptAttrs, loadExternalScript } from '../client/externalScript.js';
	import { consent } from '../consent/consent.svelte.js';
	import { scriptSourceProblem } from '../external/resolve.js';
	import { getSiteData } from '../internal/siteData.js';
	import { usageError } from '../internal/usage.js';

	let { id, src, attrs }: ExternalScriptProps = $props();

	const entry = $derived.by(() => {
		const found = getSiteData().external?.[id];
		if (!found) {
			usageError(
				`<ExternalScript id="${id}">: "${id}" steht nicht unter external in dealsystem.config.ts. ` +
					'Trage den Dienst mit category, provider, purpose, privacyUrl und dem Host unter script ein (extern.md).',
			);
		}
		return found ?? null;
	});

	const valid = $derived.by(() => {
		if (!entry) return false;
		const problem = scriptSourceProblem(entry, src);
		if (problem) usageError(`<ExternalScript id="${id}">: ${problem}`);
		const invalid = invalidScriptAttrs(attrs as Record<string, unknown> | undefined);
		if (invalid.length > 0) {
			usageError(
				`<ExternalScript id="${id}">: Nicht erlaubte Attribute: ${invalid.join(', ')}. Erlaubt: async, defer, id, type, crossorigin, referrerpolicy, data-*.`,
			);
		}
		return problem === null && invalid.length === 0;
	});

	onMount(() => consent.init());

	$effect(() => {
		if (!entry) return;
		return consent.require(entry.category);
	});

	$effect(() => {
		// Prüft selbst: auch außerhalb von <ConsentGate> lädt nichts ohne Einwilligung.
		if (entry && valid && consent.has(entry.category)) loadExternalScript(src, attrs);
	});
</script>

<!-- Marker für `dealsystem check` (Ausgabe): welcher Dienst auf welcher Seite. Lädt nichts. -->
{#if valid}
	<span hidden data-ds-external-script={id} data-ds-src={src}></span>
{/if}
