<script lang="ts">
	import { LeadForm, MediaImage, Seo, Text, RichText } from '@dealsystem/site';
	import hero from '$lib/hero.jpg?enhanced';
</script>

<Seo title="Muster Immobilien" description="Wir kaufen Ihr Haus." />

<Text key="start.hero.titel" default="Wir kaufen Ihr Haus" as="h1" />
<RichText key="start.ueber-uns" default="Seit 1998 in Leipzig." />
<MediaImage src={hero} alt="Sanierter Altbau in Leipzig" />
<a href="/angebote">Alle Angebote ansehen</a>

<LeadForm funnel="kontakt" submitLabel="Anfrage senden" />
