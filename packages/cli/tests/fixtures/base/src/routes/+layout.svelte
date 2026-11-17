<script lang="ts">
	import { CookieBanner, SiteFooterLegal } from '@dealsystem/site';
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}

<SiteFooterLegal />
<CookieBanner />
