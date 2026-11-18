<!--
@component
Formatierter Text: Absätze, Überschriften, Listen, Links. Das ist die einzige
Stelle, an der HTML aus dem CRM ausgegeben wird. `{@html}` schreibt die Seite nie.

Als Text, den der Kunde im CRM ändern kann (`key` und `default` als feste
Zeichenketten):

```svelte
<RichText key="start.ueber-uns" default="Wir sind **seit 2010** in Leipzig tätig." />
```

Liste oder mehrere Absätze: den Text in geschweifte Klammern, dann ist `\n`
ein Zeilenumbruch und `\n\n` ein neuer Absatz. In `default="…"` stünde `\n`
wörtlich auf der Seite (`dealsystem check` warnt, CNT-003).

```svelte
<RichText
	key="leistungen.ablauf"
	default={'1. Sie schicken uns die Eckdaten.\n2. Wir prüfen und melden uns.\n3. Sie erhalten ein Angebot.\n\nDer Ablauf ist für Sie kostenlos.'}
/>
```

Für ein Richtext-Feld eines CMS-Eintrags:

```svelte
<RichText content={angebot.data.beschreibung} />
```
-->
<script lang="ts" module>
	import type { SafeHtml } from '../types.js';

	export type RichTextProps = { class?: string } & (
		| {
				/** Eindeutiger Schlüssel, z. B. `start.ueber-uns`. */
				key: string;
				/** Markdown, solange im CRM nichts anderes eingetragen ist. */
				default: string;
				/** Beschriftung im CRM. */
				label?: string;
				/** Gruppe im CRM. */
				group?: string;
				/** Hinweis für den Kunden im CRM. */
				help?: string;
				/** Der Kunde darf den Text im CRM nicht leeren. */
				required?: boolean;
				/** Frühere Schlüssel dieses Textes. */
				aliases?: readonly string[];
				content?: undefined;
		  }
		| {
				/** Richtext-Feld eines Eintrags aus `getCollection()`, `getEntry()` oder `loadCollection()`. */
				content: SafeHtml | null | undefined;
				key?: undefined;
		  }
	);
</script>

<script lang="ts">
	import { getSiteData } from '../internal/siteData.js';
	import { plainParagraphs } from '../richtext/escape.js';
	import { resolveTextSlot } from '../slots.js';

	let props: RichTextProps = $props();

	const html = $derived.by(() => {
		if (props.key === undefined) return props.content ?? '';
		const site = getSiteData();
		// Der Build legt je Slot das fertige HTML ab: den Text aus dem CRM (vom
		// Server bereinigt) oder den umgewandelten Standardtext aus dem Code.
		const prepared = site.richtext[props.key];
		if (prepared !== undefined) return prepared;
		// Der Build kennt den Slot nicht (Schlüssel nicht als feste Zeichenkette).
		const override = resolveTextSlot(site.slots, props.key, props.aliases);
		return override ?? plainParagraphs(props.default);
	});
</script>

{#if html}
	<div class={['ds-richtext', props.class]} data-ds-richtext data-ds-slot={props.key}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- vom Server bereinigt, beim Build geprüft oder maskiert -->
		{@html html}
	</div>
{/if}

<style>
	.ds-richtext :global(:first-child) {
		margin-top: 0;
	}
	.ds-richtext :global(:last-child) {
		margin-bottom: 0;
	}
	.ds-richtext :global(a) {
		text-decoration: underline;
	}
	.ds-richtext :global(table) {
		border-collapse: collapse;
	}
	.ds-richtext :global(th),
	.ds-richtext :global(td) {
		padding: 0.25em 0.75em 0.25em 0;
		text-align: left;
		vertical-align: top;
	}
</style>
