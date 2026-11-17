<!--
Falsche Verwendung im Markup. `tests/typeErrors.test.ts` lässt svelte-check
über diese Datei laufen und erwartet zu jedem Aufruf außer dem letzten einen Fehler.
-->
<script lang="ts">
	import {
		CollectionList,
		ConsentGate,
		LeadForm,
		MediaImage,
		MediaVideo,
		Text,
	} from '../../src/lib/index.js';
</script>

<MediaImage src="/haus.jpg" />
<MediaImage src="/haus.jpg" alt="" />
<MediaImage key="start.hero.bild" default="/hero.jpg" />
<MediaImage src="/haus.jpg" alt="Haus" decorative />
<LeadForm funnel="kontakd" />
<CollectionList collection="angebot">{#snippet item()}x{/snippet}</CollectionList>
<ConsentGate category="werbung">Inhalt</ConsentGate>
<MediaVideo media={null} />
<Text key="start.titel" />
<MediaImage src="/haus.jpg" alt="Sanierter Altbau in Leipzig" />
