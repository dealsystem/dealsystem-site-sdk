<script lang="ts">
	import { Seo, Text } from '@dealsystem/site';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<Seo title="Seite nicht gefunden" description="Diese Seite gibt es nicht." />

<section class="section">
	<div class="page">
		{#if page.status === 404}
			<Text
				key="fehler.fehlt.titel"
				default="Diese Seite gibt es nicht"
				as="h1"
				label="Überschrift"
				group="Fehlerseite"
			/>
		{:else}
			<Text
				key="fehler.sonst.titel"
				default="Etwas ist schiefgegangen"
				as="h1"
				label="Überschrift"
				group="Fehlerseite"
			/>
		{/if}
		<Text
			key="fehler.text"
			default="Vielleicht hilft Ihnen die Startseite weiter."
			as="p"
			label="Hinweis"
			group="Fehlerseite"
		/>
		<p><a class="button" href={resolve('/')}>Zur Startseite</a></p>
	</div>
</section>
