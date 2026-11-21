<!--
@component
Bettet einen fremden Dienst ein: YouTube, Vimeo, Google Maps, Calendly oder
einen anderen Anbieter. Vor der Einwilligung steht dort ein Platzhalter mit
Titel, Anbieter und „Video laden“; erst danach lädt der Rahmen. Der Link zum
Anbieter funktioniert immer.

`id` ist ein Schlüssel aus `external` in `dealsystem.config.ts`. Die Adresse
darfst du so kopieren, wie der Kunde sie schickt, z. B.
`https://www.youtube.com/watch?v=…`; das SDK macht daraus die Einbettung
(YouTube ohne Cookies, Vimeo mit `dnt=1`). Vorschaubilder von YouTube lädt der
Platzhalter nicht; für ein Bild davor nimm `poster` mit einem Bild aus
`static/`. Anleitung: `extern.md`.

```svelte
<Embed id="video" src="https://www.youtube.com/watch?v=aqz-KE-bpKQ" title="Rundgang durch das Haus" />
```

```ts
// dealsystem.config.ts
external: { video: { preset: 'youtube' } },
```
-->
<script lang="ts" module>
	import type { EmbedTexts } from '../texts/embeds.js';
	import type { ExternalKey } from '../types.js';

	export interface EmbedProps {
		/** Schlüssel aus `external` in `dealsystem.config.ts`, z. B. `video`. */
		id: ExternalKey;
		/** Adresse beim Anbieter, z. B. `https://www.youtube.com/watch?v=…` oder `https://vimeo.com/123456789`. */
		src: string;
		/** Was zu sehen ist, z. B. „Rundgang durch das Haus“. Für Vorleseprogramme und den Platzhalter. */
		title: string;
		/** Seitenverhältnis, z. B. `16 / 9` (Video) oder `4 / 3`. Standard aus der Vorlage. */
		aspect?: string;
		/** Feste Höhe statt Seitenverhältnis, z. B. `700px` (Terminbuchung). */
		height?: string;
		/** Bild im Platzhalter, ein Pfad der eigenen Seite (`/bilder/vorschau.jpg`). Nie ein Bild des Anbieters. */
		poster?: string;
		/** Einzelne Texte statt der Standardtexte (Anrede aus dem CRM). */
		texts?: Partial<EmbedTexts>;
		class?: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { consent } from '../consent/consent.svelte.js';
	import { isLocalPath } from '../external/hosts.js';
	import { resolveEmbedSource } from '../external/resolve.js';
	import { getSiteData } from '../internal/siteData.js';
	import { usageError } from '../internal/usage.js';
	import { EMBED_TEXTS } from '../texts/embeds.js';
	import { fillText, pickTexts } from '../texts/resolve.js';

	let { id, src, title, aspect, height, poster, texts, class: className }: EmbedProps = $props();
	const t = $derived(pickTexts(EMBED_TEXTS, texts));

	const uid = $props.id();

	const entry = $derived.by(() => {
		const found = getSiteData().external?.[id];
		if (!found) {
			usageError(
				`<Embed id="${id}">: "${id}" steht nicht unter external in dealsystem.config.ts. ` +
					`Trage es ein, z. B. external: { ${/^[a-z0-9]+$/.test(id) ? id : `'${id}'`}: { preset: 'youtube' } }.`,
			);
		}
		return found ?? null;
	});

	const resolved = $derived.by(() => {
		if (!entry) return null;
		const result = resolveEmbedSource(entry, src);
		if (!result.ok) usageError(`<Embed id="${id}">: ${result.message}`);
		return result.ok ? result : null;
	});

	const validTitle = $derived.by(() => {
		const ok = typeof title === 'string' && title.trim() !== '';
		if (!ok) usageError(`<Embed id="${id}"> braucht einen title, z. B. title="Rundgang durch das Haus".`);
		return ok;
	});

	const posterSrc = $derived.by(() => {
		if (!poster) return null;
		if (!isLocalPath(poster)) {
			usageError(
				`<Embed poster="${poster}">: Das Bild muss auf der eigenen Seite liegen (Ordner static/, z. B. "/bilder/vorschau.jpg"). Ein Bild des Anbieters würde vor der Einwilligung laden.`,
			);
			return null;
		}
		return poster;
	});

	const settings = $derived(resolved?.settings ?? null);
	const boxHeight = $derived(height ?? settings?.height ?? null);
	const boxAspect = $derived(boxHeight ? null : (aspect ?? settings?.aspect ?? '16 / 9'));
	const allowed = $derived(entry !== null && consent.has(entry.category));
	const categoryLabel = $derived(
		entry?.category === 'media'
			? 'Externe Inhalte'
			: entry?.category === 'marketing'
				? 'Marketing'
				: 'Statistik',
	);

	onMount(() => consent.init());

	$effect(() => {
		if (!entry) return;
		return consent.require(entry.category);
	});
</script>

{#if entry && validTitle}
	<div class={['ds-embed', className]} data-ds-embed={id} data-ds-src={resolved?.src}>
		{#if allowed && resolved && settings}
			<iframe
				{title}
				src={resolved.src}
				sandbox={settings.sandbox}
				allow={settings.allow || undefined}
				allowfullscreen={settings.allowFullscreen || undefined}
				referrerpolicy={settings.referrerPolicy}
				loading="lazy"
				style:aspect-ratio={boxAspect}
				style:height={boxHeight}
			></iframe>
		{:else}
			<!-- Seitenverhältnis als Mindestmaß: Auf schmalen Bildschirmen wächst der Platzhalter mit dem Text. -->
			<div
				class="ds-embed__gate"
				role="group"
				aria-labelledby="{uid}-title"
				style:aspect-ratio={boxAspect}
				style:min-height={boxHeight}
			>
				{#if posterSrc}
					<img class="ds-embed__poster" src={posterSrc} alt="" loading="lazy" />
				{/if}
				<div class="ds-embed__box">
					<p class="ds-embed__title" id="{uid}-title">{title}</p>
					<p class="ds-embed__text">
						{fillText(t.notice, {
							noun: settings?.noun ?? t.noun,
							provider: entry.provider ?? t.unknownProvider,
						})}
						{#if entry.privacyUrl}
							<a href={entry.privacyUrl} target="_blank" rel="noopener noreferrer"
								>{t.privacyLink}<span class="ds-embed__hint"> {t.newWindow}</span></a
							>
						{/if}
					</p>
					{#if resolved}
						<div class="ds-embed__actions">
							<button type="button" onclick={() => consent.grant(entry.category)}>
								{settings?.loadLabel ?? t.load}
							</button>
							<a href={resolved.original} target="_blank" rel="noopener noreferrer">
								{t.open}<span class="ds-embed__hint"> {t.newWindow}: {title}</span>
							</a>
						</div>
						<p class="ds-embed__note">{fillText(t.consentNote, { category: categoryLabel })}</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.ds-embed {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		color: var(--ds-color-text, #1a1a1a);
		line-height: 1.5;
	}
	iframe {
		display: block;
		width: 100%;
		border: 0;
		border-radius: var(--ds-radius, 4px);
	}
	.ds-embed__gate {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-surface, #ffffff);
	}
	.ds-embed__poster {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--ds-radius, 4px);
	}
	.ds-embed__box {
		position: relative;
		max-width: 36rem;
		margin: 1rem;
		padding: 1rem 1.25rem;
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-surface, #ffffff);
		color: var(--ds-color-text, #1a1a1a);
	}
	.ds-embed__title {
		margin: 0 0 0.25rem;
		font-weight: 700;
	}
	.ds-embed__text,
	.ds-embed__note {
		margin: 0 0 0.75rem;
	}
	.ds-embed__note {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
	}
	.ds-embed__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
		align-items: center;
	}
	button {
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
	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: inherit;
		text-decoration: underline;
	}
	.ds-embed__text a {
		display: inline;
		min-height: 0;
	}
	.ds-embed__hint {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
