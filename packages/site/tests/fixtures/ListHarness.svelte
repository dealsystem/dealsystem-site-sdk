<script lang="ts">
	import CollectionList from '../../src/lib/components/CollectionList.svelte';
	import RichText from '../../src/lib/components/RichText.svelte';
	import type { CollectionEntry, RichTextContent } from '../../src/lib/types.js';

	let { entries, limit }: { entries?: CollectionEntry[]; limit?: number } = $props();
</script>

<CollectionList collection="angebote" {entries} {limit}>
	{#snippet item(entry)}
		<a href="/angebote/{entry.slug}">{entry.data.titel}</a>
		<RichText content={entry.data.beschreibung as RichTextContent | null} />
	{/snippet}
</CollectionList>
