<script lang="ts">
	import { MediaImage } from '@dealsystem/site';

	let { data } = $props();
</script>

<h1>{data.entry.data.titel}</h1>
{#each data.entry.media.bilder as bild (bild.id)}
	<MediaImage media={bild} />
{/each}
