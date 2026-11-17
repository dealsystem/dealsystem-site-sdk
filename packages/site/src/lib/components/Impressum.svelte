<!--
@component
Das Impressum, erzeugt aus den Firmendaten im CRM (Website → Einstellungen).
Gehört auf die Seite `src/routes/impressum/+page.svelte`. Die Angaben nie von
Hand in den Code schreiben.

```svelte
<svelte:head><title>Impressum</title></svelte:head>
<Impressum />
```

Zusätzliche Angaben (z. B. Berufsbezeichnung, Aufsichtsbehörde) als Inhalt:

```svelte
<Impressum>
	<h2>Aufsichtsbehörde</h2>
	<p>Gewerbeamt der Stadt Leipzig</p>
</Impressum>
```
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface ImpressumProps {
		/** Ebene der Überschrift „Impressum“. Standard 1 (die `h1` der Seite). */
		headingLevel?: 1 | 2;
		/** Weitere Abschnitte unter den Pflichtangaben. */
		children?: Snippet;
		class?: string;
	}
</script>

<script lang="ts">
	import { getSiteData } from '../internal/siteData.js';
	import { addressLines, MISSING, telHref } from './legal.js';

	let { headingLevel = 1, children, class: className }: ImpressumProps = $props();

	const legal = getSiteData().legal;
	const h = $derived(`h${headingLevel}`);
	const sub = $derived(`h${headingLevel + 1}`);
</script>

<section class={['ds-legal', className]} data-ds-impressum>
	<svelte:element this={h}>Impressum</svelte:element>

	<svelte:element this={sub}>Angaben gemäß § 5 DDG</svelte:element>
	<address>
		{legal.company || MISSING}<br />
		{#each addressLines(legal.address) as line, index (index)}
			{line}<br />
		{:else}
			{MISSING}<br />
		{/each}
	</address>
	{#if legal.representative}
		<p>Vertreten durch: {legal.representative}</p>
	{/if}

	<svelte:element this={sub}>Kontakt</svelte:element>
	<p>
		Telefon:
		{#if legal.phone}<a href={telHref(legal.phone)}>{legal.phone}</a>{:else}{MISSING}{/if}<br />
		E-Mail:
		{#if legal.email}<a href="mailto:{legal.email}">{legal.email}</a>{:else}{MISSING}{/if}
	</p>

	{#if legal.register}
		<svelte:element this={sub}>Registereintrag</svelte:element>
		<p>{legal.register}</p>
	{/if}

	{#if legal.vatId}
		<svelte:element this={sub}>Umsatzsteuer-ID</svelte:element>
		<p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: {legal.vatId}</p>
	{/if}

	{@render children?.()}
</section>

<style>
	address {
		font-style: normal;
	}
	.ds-legal :global(a) {
		text-decoration: underline;
	}
</style>
