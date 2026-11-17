<!--
@component
Die Pflicht-Links jeder Seite: Impressum, Datenschutz und „Cookie-Einstellungen“
(Widerruf der Einwilligung). Gehört in den Footer von `src/routes/+layout.svelte`.
„Cookie-Einstellungen“ erscheint nur, wenn es etwas einzustellen gibt (wie beim
`<CookieBanner />`).

```svelte
<footer>
	<SiteFooterLegal />
</footer>
```
-->
<script lang="ts" module>
	export interface SiteFooterLegalProps {
		/** Adresse des Impressums. Standard `/impressum`. */
		impressumHref?: string;
		/** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
		datenschutzHref?: string;
		class?: string;
	}
</script>

<script lang="ts">
	import { consent } from '../consent/consent.svelte.js';
	import { siteHasTracking } from '../internal/consentNeed.js';

	let {
		impressumHref = '/impressum',
		datenschutzHref = '/datenschutz',
		class: className,
	}: SiteFooterLegalProps = $props();

	// Mit Tracking-Kennung schon im fertigen HTML; sonst erst, wenn ein Baustein eine Einwilligung braucht.
	const hasTracking = siteHasTracking();
</script>

<nav class={['ds-footer-legal', className]} aria-label="Rechtliches" data-ds-footer-legal>
	<ul role="list">
		<li><a href={impressumHref}>Impressum</a></li>
		<li><a href={datenschutzHref}>Datenschutz</a></li>
		{#if hasTracking || consent.needed}
			<li><button type="button" onclick={() => consent.openSettings()}>Cookie-Einstellungen</button></li>
		{/if}
	</ul>
</nav>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a,
	button {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
