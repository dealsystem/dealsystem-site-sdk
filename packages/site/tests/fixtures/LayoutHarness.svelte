<script lang="ts">
	import ConsentGate from '../../src/lib/components/ConsentGate.svelte';
	import CookieBanner from '../../src/lib/components/CookieBanner.svelte';
	import SiteFooterLegal from '../../src/lib/components/SiteFooterLegal.svelte';
	import Tracking from '../../src/lib/components/Tracking.svelte';
	import type { Anrede, CookieBannerTexts } from '../../src/lib/consent/bannerTexts.js';
	import type { ConsentCategory } from '../../src/lib/consent/consent.svelte.js';

	let {
		categories,
		anrede,
		texts,
	}: { categories?: ConsentCategory[]; anrede?: Anrede; texts?: Partial<CookieBannerTexts> } = $props();
</script>

<main><h1>Startseite</h1></main>
<footer><SiteFooterLegal /></footer>
<CookieBanner {categories} {anrede} {texts} />
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>
<ConsentGate category="media">
	<iframe title="Karte" src="https://maps.example/embed"></iframe>
</ConsentGate>
