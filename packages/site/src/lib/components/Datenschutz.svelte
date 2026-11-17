<!--
@component
Die Datenschutzerklärung der Seite. Gibt den Text aus, den der Kunde im CRM
unter Website → Einstellungen eingetragen hat. Der Text steht nie im Code, und
die Komponente erzeugt keinen eigenen. Gehört auf
`src/routes/datenschutz/+page.svelte`.

Fehlt der Text noch, zeigt die Vorschau einen Hinweis, wo er einzutragen ist.
Live schalten lässt sich die Seite erst mit Text.

```svelte
<svelte:head>
	<title>Datenschutz</title>
	<meta name="description" content="Datenschutzerklärung dieser Website." />
</svelte:head>

<Datenschutz />
```
-->
<script lang="ts" module>
	export interface DatenschutzProps {
		/** Ebene der Überschrift „Datenschutzerklärung“. Standard 1 (die `h1` der Seite). */
		headingLevel?: 1 | 2;
		class?: string;
	}
</script>

<script lang="ts">
	import { consent } from '../consent/consent.svelte.js';
	import { privacyHtml } from '../internal/privacy.js';
	import { hasVisibleText, nestHeadings } from './legal.js';

	let { headingLevel = 1, class: className }: DatenschutzProps = $props();

	const text = privacyHtml();
	const html = $derived(nestHeadings(text, headingLevel + 1));
</script>

<section class={['ds-legal', className]} data-ds-datenschutz>
	<svelte:element this={`h${headingLevel}`}>Datenschutzerklärung</svelte:element>
	{#if hasVisibleText(text)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Text des Kunden, im Core bereinigt -->
		{@html html}
	{:else}
		<p class="ds-legal__missing" data-ds-legal-missing="privacy">
			<strong>Der Datenschutztext fehlt.</strong> Bitte tragen Sie ihn im CRM unter Website → Einstellungen ein.
			Ohne Datenschutzerklärung kann die Seite nicht live geschaltet werden.
		</p>
	{/if}
	<p>
		<button type="button" class="ds-legal__link" onclick={() => consent.openSettings()}>
			Cookie-Einstellungen öffnen
		</button>
	</p>
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
	.ds-legal__link {
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.ds-legal__link:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
