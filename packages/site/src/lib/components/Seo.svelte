<!--
@component
Titel, Beschreibung und Vorschaubild einer Seite: `<title>`, `meta description`,
die Angaben für WhatsApp, Facebook und LinkedIn (`og:*`) und `twitter:card`.
Gehört einmal auf jede Seite, statt `<title>` und `meta description` selbst in
`<svelte:head>` zu schreiben. Sonst stünden die Tags doppelt da, und der Kunde
könnte sie im CRM nicht ändern.

Was gilt, wird je Angabe entschieden: was der Kunde im CRM unter Eigene Website
→ Einstellungen → Google und Teilen für diese Seite eingetragen hat, sonst
`title`/`description`/`image` von hier, sonst seine Vorgabe für alle Seiten,
beim Titel zuletzt der Name der Website. Alles wird als Text ausgegeben, nie als
HTML.

```svelte
<script lang="ts">
	import { Seo } from '@dealsystem/site';
	let { data } = $props();
</script>

<Seo
	title="Kontakt – {data.site.name}"
	description="Schreiben Sie uns. Wir melden uns schnell bei Ihnen zurück."
/>
```

Auf einer Detailseite mit Bild aus dem CMS:

```svelte
<Seo title={angebot.data.titel} description={angebot.data.kurztext} image={angebot.media.bilder[0]} />
```
-->
<script lang="ts" module>
	import type { MediaRef } from '../types.js';

	export interface SeoProps {
		/** Titel dieser Seite (Tab, Google), solange im CRM keiner eingetragen ist. Je Seite ein eigener. */
		title?: string | null;
		/** Beschreibung für Google und Vorschauen, ein bis zwei Sätze. */
		description?: string | null;
		/** Vorschaubild beim Teilen: Bild aus dem CMS oder Pfad bzw. Import eines Bildes im Projekt. */
		image?: MediaRef | string | null;
		/** Was auf dem Vorschaubild zu sehen ist (nur nötig, wenn `image` ein Pfad ist). */
		imageAlt?: string | null;
	}
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { getSiteData } from '../internal/siteData.js';
	import { resolveSeo, seoRouteKey } from '../internal/seo.js';

	let { title, description, image, imageAlt }: SeoProps = $props();

	const data = getSiteData();
	const seo = $derived(
		resolveSeo(data, seoRouteKey(page.route.id), page.url.pathname, { title, description, image, imageAlt }),
	);
	const siteName = data.site.name;
</script>

<svelte:head>
	<title>{seo.title}</title>
	{#if seo.description}
		<meta name="description" content={seo.description} />
	{/if}
	<meta property="og:type" content="website" />
	{#if siteName}
		<meta property="og:site_name" content={siteName} />
	{/if}
	<meta property="og:title" content={seo.title} />
	{#if seo.description}
		<meta property="og:description" content={seo.description} />
	{/if}
	{#if seo.url}
		<meta property="og:url" content={seo.url} />
	{/if}
	{#if seo.image}
		<meta property="og:image" content={seo.image.url} />
		{#if seo.image.alt}
			<meta property="og:image:alt" content={seo.image.alt} />
		{/if}
		{#if seo.image.width && seo.image.height}
			<meta property="og:image:width" content={String(seo.image.width)} />
			<meta property="og:image:height" content={String(seo.image.height)} />
		{/if}
	{/if}
	<meta name="twitter:card" content={seo.image ? 'summary_large_image' : 'summary'} />
</svelte:head>
