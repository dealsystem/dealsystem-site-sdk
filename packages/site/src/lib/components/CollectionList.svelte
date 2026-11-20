<!--
@component
Liste der Einträge einer Sammlung. Das Snippet `item` bestimmt, wie ein
Eintrag aussieht.

Empfohlen: Einträge beim Build laden und übergeben. Dann stehen sie im
fertigen HTML und Suchmaschinen sehen sie.

```svelte
<script lang="ts">
	import { CollectionList, MediaImage } from '@dealsystem/site';
	let { data } = $props(); // aus +page.server.ts: { angebote: await getCollection('angebote') }
</script>

<CollectionList collection="angebote" entries={data.angebote} limit={12}>
	{#snippet item(angebot)}
		<a href="/angebote/{angebot.slug}">
			<MediaImage media={angebot.media.bilder[0]} sizes="33vw" />
			{angebot.data.titel}
		</a>
	{/snippet}
</CollectionList>
```

Ohne `entries` lädt die Liste die Einträge erst im Browser über die Site-API:
ohne `limit` die neuesten 20, mit `limit` bis zu 100.
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { CollectionListTexts } from '../texts/list.js';
	import type { CollectionEntry, CollectionKey } from '../types.js';

	export interface CollectionListProps<K extends CollectionKey> {
		/** Schlüssel der Sammlung aus `dealsystem.config.ts`. */
		collection: K;
		/** Einträge aus `getCollection()`. Ohne Angabe wird im Browser geladen. */
		entries?: CollectionEntry<K>[];
		/** Höchstzahl der angezeigten Einträge. */
		limit?: number;
		/** Darstellung eines Eintrags. */
		item: Snippet<[CollectionEntry<K>]>;
		/** Anzeige, wenn es keine Einträge gibt. */
		empty?: Snippet;
		/** Einzelne Texte statt der Standardtexte (Anrede aus dem CRM). */
		texts?: Partial<CollectionListTexts>;
		class?: string;
	}
</script>

<script lang="ts" generics="K extends CollectionKey">
	import { loadCollection } from '../client/collections.js';
	import { COLLECTION_LIST_TEXTS } from '../texts/list.js';
	import { pickTexts } from '../texts/resolve.js';

	let { collection, entries, limit, item, empty, texts, class: className }: CollectionListProps<K> = $props();
	const t = $derived(pickTexts(COLLECTION_LIST_TEXTS, texts));

	let loaded = $state.raw<CollectionEntry<K>[] | null>(null);
	let loadState = $state<'idle' | 'loading' | 'error'>('idle');
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		if (entries !== undefined) return;
		let cancelled = false;
		loadState = 'loading';
		loadCollection(collection, { limit }).then((result) => {
			if (cancelled) return;
			if (result.ok) {
				loaded = result.data.entries;
				loadState = 'idle';
			} else {
				loadState = 'error';
			}
		});
		return () => {
			cancelled = true;
		};
	});

	const visible = $derived.by(() => {
		const all = entries ?? loaded ?? [];
		return limit === undefined ? all : all.slice(0, Math.max(0, limit));
	});
	const pending = $derived(entries === undefined && loaded === null);
</script>

<div class={['ds-collection', className]} data-ds-collection={collection} aria-busy={loadState === 'loading'}>
	{#if visible.length > 0}
		<ul role="list">
			{#each visible as entry (entry.slug)}
				<li>{@render item(entry)}</li>
			{/each}
		</ul>
	{:else if !pending}
		{#if empty}
			{@render empty()}
		{:else}
			<p>{t.empty}</p>
		{/if}
	{/if}
	<div aria-live="polite">
		{#if loadState === 'error'}
			<p>{t.failed}</p>
			<button type="button" onclick={() => attempt++}>{t.retry}</button>
		{:else if pending && loadState === 'loading'}
			<p>{t.loading}</p>
		{/if}
	</div>
</div>

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	button {
		min-height: 44px;
		padding: 0.5rem 1.25rem;
		font: inherit;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
