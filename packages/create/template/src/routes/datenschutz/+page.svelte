<script lang="ts">
	import { Datenschutz } from '@dealsystem/site';

	let { data } = $props();
</script>

<svelte:head>
	<title>Datenschutz – {data.site.name || 'Meine Website'}</title>
	<meta name="description" content="Datenschutzerklärung dieser Website." />
</svelte:head>

<!-- Der Text kommt aus dem CRM (Website → Einstellungen), nie aus dem Code. -->
<div class="section page">
	<Datenschutz />
</div>
