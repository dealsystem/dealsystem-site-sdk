<!--
@component
Das Impressum der Seite. Gibt den Text aus, den der Kunde im CRM unter
Eigene Website → Rechtliches eingetragen hat. Der Text steht nie im Code, und die
Komponente erzeugt keinen eigenen. Gehört auf `src/routes/impressum/+page.svelte`.

Fehlt der Text noch, zeigt die Vorschau einen Hinweis, wo er einzutragen ist.
Live schalten lässt sich die Seite erst mit Text.

```svelte
<svelte:head>
	<title>Impressum</title>
	<meta name="description" content="Impressum und Anbieterkennzeichnung." />
</svelte:head>

<Impressum />
```
-->
<script lang="ts" module>
	export interface ImpressumProps {
		/** Ebene der Überschrift „Impressum“. Standard 1 (die `h1` der Seite). */
		headingLevel?: 1 | 2;
		class?: string;
	}
</script>

<script lang="ts">
	import { imprintHtml } from '../internal/imprint.js';
	import { hasVisibleText, nestHeadings } from './legal.js';

	let { headingLevel = 1, class: className }: ImpressumProps = $props();

	const text = imprintHtml();
	const html = $derived(nestHeadings(text, headingLevel + 1));
</script>

<section class={['ds-legal', className]} data-ds-impressum>
	<svelte:element this={`h${headingLevel}`}>Impressum</svelte:element>
	{#if hasVisibleText(text)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Text des Kunden, im Core bereinigt -->
		{@html html}
	{:else}
		<p class="ds-legal__missing" data-ds-legal-missing="imprint">
			<strong>Der Impressumstext fehlt.</strong> Bitte tragen Sie ihn im CRM unter Eigene Website → Rechtliches
			ein. Ohne Impressum kann die Seite nicht live geschaltet werden.
		</p>
	{/if}
</section>

<style>
	.ds-legal :global(a) {
		text-decoration: underline;
	}
	.ds-legal__missing {
		padding: 1rem;
		border: 2px dashed var(--ds-color-error, #b3261e);
		color: var(--ds-color-text, #1a1a1a);
	}
</style>
