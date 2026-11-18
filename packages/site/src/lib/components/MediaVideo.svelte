<!--
@component
Ein Video aus dem CMS, mit Bedienelementen und ohne automatischen Start.
`title` benennt das Video für Vorleseprogramme. Kommt das Video von einem
anderen Anbieter, wird es erst nach der Einwilligung „Externe Inhalte“ geladen.

```svelte
<MediaVideo media={angebot.media.video[0]} title="Rundgang durch die Wohnung" />
```
-->
<script lang="ts" module>
	import type { MediaRef } from '../types.js';

	export interface MediaVideoProps {
		/** Video aus einem CMS-Eintrag. Fehlt es, wird nichts ausgegeben. */
		media: MediaRef | null | undefined;
		/** Kurzer Name des Videos, z. B. „Rundgang“. */
		title: string;
		class?: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { consent } from '../consent/consent.svelte.js';
	import { usageError } from '../internal/usage.js';

	let { media, title, class: className }: MediaVideoProps = $props();

	const video = $derived(media?.kind === 'video' ? (media.video ?? null) : null);
	/** Adressen außerhalb der eigenen Seite brauchen die Einwilligung. */
	const external = $derived(video ? !video.playbackUrl.startsWith('/') : false);
	const allowed = $derived(!external || consent.has('media'));

	onMount(() => consent.init());

	$effect(() => {
		if (external) return consent.require('media');
	});

	$effect(() => {
		if (typeof title !== 'string' || title.trim() === '') {
			usageError('<MediaVideo> braucht einen title, z. B. title="Rundgang durch die Wohnung".');
		}
	});
</script>

{#if video}
	<div class={['ds-video', className]} data-ds-video>
		{#if allowed}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				controls
				preload="none"
				playsinline
				{title}
				aria-label={title}
				poster={video.posterUrl || undefined}
				src={video.playbackUrl}
			></video>
		{:else if consent.ready}
			<div class="ds-video__gate">
				<p>
					Das Video „{title}“ wird von einem anderen Anbieter geladen. Dabei werden Daten an diesen Anbieter
					übertragen.
				</p>
				<button type="button" onclick={() => consent.grant('media')}>Video laden</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	video {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.ds-video__gate {
		padding: 1rem;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		color: var(--ds-color-text, #1a1a1a);
		line-height: 1.5;
	}
	.ds-video__gate p {
		margin: 0 0 0.75rem;
	}
	.ds-video__gate button {
		min-height: 44px;
		padding: 0.5rem 1.25rem;
		border: 2px solid var(--ds-color-primary, #1a1a1a);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-primary, #1a1a1a);
		color: var(--ds-color-on-primary, #ffffff);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.ds-video__gate button:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
