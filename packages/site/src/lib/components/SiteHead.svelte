<!--
@component
Angaben im Kopf jeder Seite, die für die ganze Website gelten. Gehört einmal in
`src/routes/+layout.svelte`.

- Favicon: Hat der Kunde im CRM unter Eigene Website → Einstellungen → Google und
  Teilen eins hochgeladen, gelten dessen Größen (32 px im Tab, 180 px für iOS,
  192 und 512 px im Web-Manifest). Sonst das Favicon aus dem Code, das du mit
  `favicon` angibst. Schreib den Favicon-Link nicht zusätzlich in `src/app.html`.
- „Nicht bei Google anzeigen“: Hat der Kunde das eingestellt, steht auf jeder
  Seite `<meta name="robots" content="noindex">`.

- Inhaltsblock: Die Texte und Bilder aus dem CRM (Content-Slots) stehen einmal
  je Seite als `<script type="application/json" id="ds-content">` im Kopf. Der
  Browser liest sie dort, nicht aus dem JS-Bundle. So kann DealSystem einen
  geänderten Text in die fertige Seite schreiben, ohne sie neu zu bauen.

Titel und Beschreibung je Seite setzt `<Seo>`.

Außerdem meldet `<SiteHead>` jeden Seitenaufruf für die Statistik im CRM: Pfad,
Einstieg und Kampagne. Die Besuchs-ID geht nur mit Einwilligung „Marketing“ mit.

```svelte
<SiteHead favicon="/favicon.svg" />
```
-->
<script lang="ts" module>
	export interface SiteHeadProps {
		/** Favicon aus dem Projekt (Pfad unter `static/`), solange im CRM keins hochgeladen ist. */
		favicon?: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { trackPageview } from '../client/pageview.js';
	import { consent } from '../consent/consent.svelte.js';
	import { getSiteData } from '../internal/siteData.js';
	import { faviconLinks, iconType, WEB_MANIFEST_PATH } from '../internal/seo.js';
	import { CONTENT_BLOCK_VERSION, contentBlockTag } from '../contentBlock.js';

	let { favicon }: SiteHeadProps = $props();

	const { seo, slots, richtext } = getSiteData();
	// JSON mit maskiertem `<`, `>` und `&`: kein Wert kann das Element verlassen.
	const block = contentBlockTag({ v: CONTENT_BLOCK_VERSION, slots, richtext });
	const crm = seo.favicon ? faviconLinks(seo.favicon) : null;
	const hasManifest = seo.favicon?.icons.some((i) => i.size >= 192) ?? false;

	onMount(() => consent.init());

	// Jeder Seitenwechsel ist ein Seitenaufruf für die Statistik im CRM. Nur im Browser, nie beim Build.
	$effect(() => {
		const path = page.url.pathname;
		if (consent.ready) trackPageview(path);
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON, in contentBlockTag maskiert -->
	{@html block}
	{#if seo.noindex}
		<meta name="robots" content="noindex" />
	{/if}
	{#if crm}
		{#if crm.icon}
			<link rel="icon" type="image/png" sizes="32x32" href={crm.icon} />
		{/if}
		{#if crm.apple}
			<link rel="apple-touch-icon" sizes="180x180" href={crm.apple} />
		{/if}
		{#if hasManifest}
			<link rel="manifest" href={WEB_MANIFEST_PATH} />
		{/if}
	{:else if favicon}
		<link rel="icon" href={favicon} type={iconType(favicon)} />
	{/if}
</svelte:head>
