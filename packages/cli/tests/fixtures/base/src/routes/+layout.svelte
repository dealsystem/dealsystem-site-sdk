<script lang="ts">
	import { CookieBanner, SiteFooterLegal, SiteHead } from '@dealsystem/site';
	import '../app.css';

	let { children } = $props();
</script>

<SiteHead favicon="/favicon.svg" />

{@render children()}

<SiteFooterLegal />
<CookieBanner />
