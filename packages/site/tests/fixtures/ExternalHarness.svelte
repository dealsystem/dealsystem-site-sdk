<script lang="ts">
	import CookieBanner from '../../src/lib/components/CookieBanner.svelte';
	import Embed from '../../src/lib/components/Embed.svelte';
	import ExternalScript from '../../src/lib/components/ExternalScript.svelte';
	import SiteFooterLegal from '../../src/lib/components/SiteFooterLegal.svelte';

	let {
		video = true,
		chat = false,
		src = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
		poster,
	}: { video?: boolean; chat?: boolean; src?: string; poster?: string } = $props();
</script>

<main>
	<h1>Startseite</h1>
	{#if video}
		<Embed id="video" {src} title="Rundgang durch das Haus" {poster} />
	{/if}
	{#if chat}
		<ExternalScript
			id="chat"
			src="https://js.hs-scripts.com/123.js"
			attrs={{ id: 'hs-script-loader', defer: true }}
		/>
	{/if}
</main>
<footer><SiteFooterLegal /></footer>
<CookieBanner />
