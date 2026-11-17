<script lang="ts">
	import { LeadForm, Seo, Text } from '@dealsystem/site';

	let { data } = $props();
</script>

<Seo
	title="Kontakt – {data.site.name || 'Meine Website'}"
	description="Schreiben Sie uns. Wir melden uns schnell bei Ihnen zurück."
/>

<section class="section">
	<div class="page kontakt">
		<Text key="kontakt.titel" default="Kontakt" as="h1" label="Überschrift" group="Kontakt" />
		<Text
			key="kontakt.text"
			default="Schreiben Sie uns kurz, worum es geht. Wir melden uns in der Regel innerhalb eines Werktags."
			as="p"
			multiline
			label="Einleitung"
			group="Kontakt"
		/>

		<!-- Die Felder stehen in dealsystem.config.ts unter funnels.kontakt. -->
		<LeadForm
			funnel="kontakt"
			submitLabel="Nachricht senden"
			successMessage="Vielen Dank für Ihre Nachricht. Wir melden uns bei Ihnen."
		/>
	</div>
</section>

<style>
	.kontakt {
		max-width: 40rem;
	}
</style>
