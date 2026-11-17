<!--
@component
Formatierter Text (Markdown): Absätze, Überschriften, Listen, Links.
Die Ausgabe ist geprüft; `{@html}` braucht die Seite dafür nie.

Als Text, den der Kunde im CRM ändern kann (`key` und `default` als feste
Zeichenketten):

```svelte
<RichText key="start.ueber-uns" default="Wir sind **seit 2010** in Leipzig tätig." />
```

Für ein Richtext-Feld eines CMS-Eintrags:

```svelte
<RichText content={angebot.data.beschreibung} />
```
-->
<script lang="ts" module>
	import type { RichTextContent } from '../types.js';

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
				/** Frühere Schlüssel dieses Textes. */
				aliases?: readonly string[];
				content?: undefined;
		  }
		| {
				/** Richtext-Feld eines Eintrags aus `getCollection()`, `getEntry()` oder `loadCollection()`. */
				content: RichTextContent | null | undefined;
				key?: undefined;
		  }
	);
</script>

<script lang="ts">
	import { getSiteData } from '../internal/siteData.js';
	import { plainParagraphs } from '../richtext/escape.js';
	import { resolveTextSlot } from '../slots.js';

	let props: RichTextProps = $props();

	/** Im Browser nachträglich umgewandeltes Markdown, je Quelltext. */
	let upgraded = $state<{ source: string; html: string } | null>(null);

	const source = $derived(props.key === undefined ? (props.content?.source ?? null) : null);

	const html = $derived.by(() => {
		if (props.key !== undefined) {
			const site = getSiteData();
			const prepared = site.richtext[props.key];
			if (prepared !== undefined) return prepared;
			// Der Build kennt diesen Slot nicht (Schlüssel nicht als feste
			// Zeichenkette). Dann nur als maskierter Text, nie als HTML.
			return plainParagraphs(resolveTextSlot(site.slots, props.key, props.aliases) ?? props.default);
		}
		const content = props.content;
		if (!content) return '';
		if (typeof content.html === 'string') return content.html;
		if (source === null) return '';
		return upgraded?.source === source ? upgraded.html : plainParagraphs(source);
	});

	$effect(() => {
		const current = source;
		if (current === null) return;
		let cancelled = false;
		import('../richtext/browser.js')
			.then(({ richtextToHtmlInBrowser }) => {
				if (!cancelled) upgraded = { source: current, html: richtextToHtmlInBrowser(current) };
			})
			.catch(() => {
				// Ohne den Umwandler bleibt der maskierte Text stehen.
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if html}
	<div class={['ds-richtext', props.class]} data-ds-slot={props.key}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- html ist geprüft (Positiv-Liste) oder maskiert -->
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
