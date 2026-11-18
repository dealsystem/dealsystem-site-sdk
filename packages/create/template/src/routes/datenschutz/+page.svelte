<script lang="ts">
	import { Datenschutz, Seo } from '@dealsystem/site';

	let { data } = $props();
</script>

<Seo
	title="Datenschutz – {data.site.name || 'Meine Website'}"
	description="Datenschutzerklärung dieser Website."
/>

<!-- Der Text kommt aus dem CRM (Eigene Website → Rechtliches), nie aus dem Code. -->
<div class="section page">
	<Datenschutz />
</div>
