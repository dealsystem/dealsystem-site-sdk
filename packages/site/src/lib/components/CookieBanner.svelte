<!--
@component
Hinweis zur Einwilligung. Gehört einmal in `src/routes/+layout.svelte`.
„Alle ablehnen“ und „Alle akzeptieren“ sind gleich gestaltet. Die Wahl wird im
Browser gespeichert; ändern lässt sie sich über „Cookie-Einstellungen“ in
`<SiteFooterLegal />`.

```svelte
<CookieBanner />
```

Nutzt die Seite nur manche Zwecke, nenne sie:

```svelte
<CookieBanner categories={['marketing']} />
```
-->
<script lang="ts" module>
	import type { ConsentCategory } from '../consent/consent.svelte.js';

	export interface CookieBannerProps {
		/** Zwecke, die die Seite nutzt. Standard: alle. */
		categories?: readonly ConsentCategory[];
		/** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
		privacyHref?: string;
	}

	const LABELS: Record<ConsentCategory, { title: string; text: string }> = {
		statistics: {
			title: 'Statistik',
			text: 'Hilft uns zu verstehen, wie die Website genutzt wird.',
		},
		marketing: {
			title: 'Marketing',
			text: 'Misst, über welche Anzeigen und Kampagnen Besucher zu uns kommen.',
		},
		media: {
			title: 'Externe Inhalte',
			text: 'Zeigt eingebettete Inhalte anderer Anbieter, z. B. Karten und Videos.',
		},
	};
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { CONSENT_CATEGORIES, consent } from '../consent/consent.svelte.js';

	let { categories = CONSENT_CATEGORIES, privacyHref = '/datenschutz' }: CookieBannerProps = $props();

	const uid = $props.id();

	let dialog = $state<HTMLElement | null>(null);
	let detailsOpen = $state(false);
	let selection = $state<Record<ConsentCategory, boolean>>({
		statistics: false,
		marketing: false,
		media: false,
	});
	let returnFocusTo: HTMLElement | null = null;

	const visible = $derived(consent.ready && (!consent.decided || consent.settingsOpen));
	const showDetails = $derived(detailsOpen || consent.settingsOpen);

	onMount(() => consent.init());

	// Wird der Hinweis über „Cookie-Einstellungen“ geöffnet, wandert der Fokus
	// hinein und beim Schließen zurück.
	$effect(() => {
		if (!consent.settingsOpen) return;
		for (const category of CONSENT_CATEGORIES) selection[category] = consent.has(category);
		returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		tick().then(() => dialog?.focus());
		return () => {
			returnFocusTo?.focus();
			returnFocusTo = null;
		};
	});

	function close() {
		detailsOpen = false;
	}

	function rejectAll() {
		close();
		consent.rejectAll();
	}

	function acceptAll() {
		close();
		consent.acceptAll(categories);
	}

	function saveSelection() {
		close();
		consent.save(categories.filter((category) => selection[category]));
	}

	function onkeydown(event: KeyboardEvent) {
		// Ohne frühere Entscheidung bleibt der Hinweis: Schließen wäre keine Wahl.
		if (event.key === 'Escape' && consent.decided) {
			close();
			consent.closeSettings();
		}
	}
</script>

<div data-ds-cookie-banner>
	{#if visible}
		<div
			class="ds-cookie"
			role="dialog"
			aria-modal="false"
			aria-labelledby="{uid}-title"
			aria-describedby="{uid}-text"
			tabindex="-1"
			bind:this={dialog}
			{onkeydown}
		>
			<p class="ds-cookie__title" id="{uid}-title">Cookies und Datenschutz</p>
			<p class="ds-cookie__text" id="{uid}-text">
				Manche Funktionen dieser Website übertragen Daten an andere Anbieter. Das geschieht nur, wenn Sie
				zustimmen. Sie können Ihre Wahl jederzeit über „Cookie-Einstellungen“ am Seitenende ändern. Mehr dazu
				in der <a href={privacyHref}>Datenschutzerklärung</a>.
			</p>

			{#if showDetails}
				<fieldset class="ds-cookie__choices">
					<legend>Ihre Auswahl</legend>
					<label class="ds-cookie__choice">
						<input type="checkbox" checked disabled />
						<span>
							<strong>Notwendig</strong>
							<span class="ds-cookie__hint">Speichert Ihre Auswahl. Immer aktiv.</span>
						</span>
					</label>
					{#each categories as category (category)}
						<label class="ds-cookie__choice">
							<input type="checkbox" bind:checked={selection[category]} />
							<span>
								<strong>{LABELS[category].title}</strong>
								<span class="ds-cookie__hint">{LABELS[category].text}</span>
							</span>
						</label>
					{/each}
				</fieldset>
			{/if}

			<div class="ds-cookie__actions">
				<button type="button" class="ds-cookie__button" onclick={rejectAll}>Alle ablehnen</button>
				<button type="button" class="ds-cookie__button" onclick={acceptAll}>Alle akzeptieren</button>
				{#if showDetails}
					<button type="button" class="ds-cookie__button" onclick={saveSelection}>Auswahl speichern</button>
				{:else}
					<button type="button" class="ds-cookie__more" onclick={() => (detailsOpen = true)}>
						Einstellungen
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.ds-cookie {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 1000;
		max-height: 100dvh;
		overflow-y: auto;
		box-sizing: border-box;
		padding: 1.25rem;
		background: var(--ds-color-surface, #ffffff);
		color: var(--ds-color-text, #1a1a1a);
		border-top: 1px solid var(--ds-color-border, #6b6b6b);
		font-size: 1rem;
		line-height: 1.5;
	}
	.ds-cookie:focus-visible,
	.ds-cookie :focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
	.ds-cookie__title {
		margin: 0 0 0.5rem;
		font-weight: 700;
		font-size: 1.125rem;
	}
	.ds-cookie__text {
		margin: 0 0 1rem;
		max-width: 70ch;
	}
	.ds-cookie__text a {
		color: inherit;
		text-decoration: underline;
	}
	.ds-cookie__choices {
		margin: 0 0 1rem;
		padding: 0;
		border: 0;
	}
	.ds-cookie__choices legend {
		padding: 0;
		margin-bottom: 0.5rem;
		font-weight: 700;
	}
	.ds-cookie__choice {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		padding: 0.5rem 0;
		min-height: 44px;
		box-sizing: border-box;
	}
	.ds-cookie__choice input {
		width: 1.25rem;
		height: 1.25rem;
		margin: 0.125rem 0 0;
		flex-shrink: 0;
	}
	.ds-cookie__hint {
		display: block;
	}
	.ds-cookie__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}
	.ds-cookie__button {
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
	.ds-cookie__more {
		min-height: 44px;
		padding: 0.5rem 0.25rem;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
