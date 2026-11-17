<script lang="ts">
	import { Impressum } from '@dealsystem/site';

	let { data } = $props();
</script>

<svelte:head>
	<title>Impressum – {data.site.name || 'Meine Website'}</title>
	<meta name="description" content="Impressum und Anbieterkennzeichnung." />
</svelte:head>

<!-- Der Text kommt aus dem CRM (Website → Einstellungen), nie aus dem Code. -->
<div class="section page">
	<Impressum />
</div>
