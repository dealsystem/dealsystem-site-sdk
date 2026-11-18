<script lang="ts">
	import Zeitfenster from '../../src/lib/components/Zeitfenster.svelte';

	let { bis = '2026-12-01T18:00:00+01:00' }: { bis?: string } = $props();
</script>

<Zeitfenster {bis}><p>Jetzt anmelden</p></Zeitfenster>
<Zeitfenster ab="2026-12-01T18:00:00+01:00" bis="2026-12-01T19:30:00+01:00"
	><p>Webinar läuft gerade</p></Zeitfenster
>
