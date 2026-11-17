<script lang="ts">
	import { Impressum, Seo } from '@dealsystem/site';

	let { data } = $props();
</script>

<Seo
	title="Impressum – {data.site.name || 'Meine Website'}"
	description="Impressum und Anbieterkennzeichnung."
/>

<!-- Der Text kommt aus dem CRM (Eigene Website → Rechtliches), nie aus dem Code. -->
<div class="section page">
	<Impressum />
</div>
