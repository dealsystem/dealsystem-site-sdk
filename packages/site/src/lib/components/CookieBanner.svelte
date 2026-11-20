<!--
@component
Hinweis zur Einwilligung. Gehört einmal in `src/routes/+layout.svelte`.
Er erscheint auf jeder Seite: DealSystem erkennt mit Zustimmung zu „Marketing“ wiederkehrende Besuche und
ordnet sie einer Anfrage zu. Dazu kommen, was die Seite sonst braucht: Tracking mit Kennung aus dem CRM,
`<ConsentGate>`, `<MapEmbed>` oder ein Video eines anderen Anbieters.
„Alle ablehnen“ und „Alle akzeptieren“ sind gleich gestaltet, nichts ist vorausgewählt, und die Seite bleibt
ohne Wahl benutzbar. Die Wahl wird im Browser gespeichert; ändern lässt sie sich jederzeit über
„Cookie-Einstellungen“ in `<SiteFooterLegal />`.

```svelte
<CookieBanner />
```

Duzt die Seite ihre Besucher, schaltet `anrede="du"` alle Texte um. Einzelne Texte überschreibt `texts`:

```svelte
<CookieBanner anrede="du" texts={{ title: 'Kurz zu Cookies' }} />
```

Nutzt die Seite ein eigenes Banner (Cookiebot, Usercentrics …), steht in `dealsystem.config.ts`
`consent: { banner: 'own' }`; dieser Hinweis bleibt dann unsichtbar, und das eigene Banner meldet die Wahl mit
`setConsent()` (`rechtstexte.md`).

Gefragt wird nach den Zwecken, die die Seite gerade braucht. Fest vorgeben lassen sie sich so:

```svelte
<CookieBanner categories={['marketing']} />
```
-->
<script lang="ts" module>
	import type { ConsentCategory } from '../consent/consent.svelte.js';
	import type { Anrede, CookieBannerTexts } from '../consent/bannerTexts.js';

	export interface CookieBannerProps {
		/** Zwecke, nach denen gefragt wird. Standard: die, die Bausteine auf der Seite brauchen. */
		categories?: readonly ConsentCategory[];
		/** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
		privacyHref?: string;
		/** Anrede wie auf der übrigen Seite: `sie` (Standard) oder `du`. */
		anrede?: Anrede;
		/** Einzelne Texte statt der Standardtexte, z. B. `{ title: 'Kurz zu Cookies' }`. */
		texts?: Partial<CookieBannerTexts>;
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { CONSENT_CATEGORIES, consent } from '../consent/consent.svelte.js';
	import { COOKIE_BANNER_TEXTS } from '../consent/bannerTexts.js';
	import { ownConsentBanner } from '../internal/consentNeed.js';
	import { DEALSYSTEM_VISITS, declaredProviders, mergeProviders } from '../internal/providers.js';

	let {
		categories: fixed,
		privacyHref = '/datenschutz',
		anrede = 'sie',
		texts,
	}: CookieBannerProps = $props();
	const t = $derived({ ...COOKIE_BANNER_TEXTS[anrede], ...texts });
	// Eigenes Banner (`consent: { banner: 'own' }`): Es fragt selbst und meldet die Wahl mit `setConsent()`.
	const own = ownConsentBanner();

	const categories = $derived(fixed ?? consent.relevant);

	// Anbieter je Zweck: Deklaration und Tracking-Kennungen stehen fest, Bausteine wie die Karte melden sich.
	const declared = declaredProviders();
	const providers = $derived(
		Object.fromEntries(
			CONSENT_CATEGORIES.map((c) => [c, mergeProviders(declared[c], consent.activeProviders(c))]),
		) as Record<ConsentCategory, ReturnType<typeof consent.activeProviders>>,
	);

	const uid = $props.id();

	let dialog = $state<HTMLElement | null>(null);
	let detailsOpen = $state(false);
	let selection = $state<Record<ConsentCategory, boolean>>({
		statistics: false,
		marketing: false,
		media: false,
	});
	let returnFocusTo: HTMLElement | null = null;

	// Ohne etwas, das eine Einwilligung braucht, ist kein Hinweis nötig.
	const visible = $derived(
		!own && consent.ready && consent.needed && (!consent.decided || consent.settingsOpen),
	);
	// Werbe-Dienste neben der Wiedererkennung durch DealSystem: dann sagt „Marketing“ auch das.
	const hasAds = $derived(providers.marketing.some((p) => p.name !== DEALSYSTEM_VISITS.name));
	const labels = $derived<Record<ConsentCategory, { title: string; text: string }>>({
		statistics: { title: t.statistics, text: t.statisticsHint },
		marketing: {
			title: t.marketing,
			text: hasAds ? `${t.marketingHint} ${t.marketingAdsHint}` : t.marketingHint,
		},
		media: { title: t.media, text: t.mediaHint },
	});
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
			<p class="ds-cookie__title" id="{uid}-title">{t.title}</p>
			<p class="ds-cookie__text" id="{uid}-text">
				{t.intro}
				{t.change}
				{t.privacyBefore} <a href={privacyHref}>{t.privacyLink}</a>.
			</p>

			{#if showDetails}
				<fieldset class="ds-cookie__choices">
					<legend>{t.choices}</legend>
					<label class="ds-cookie__choice">
						<input type="checkbox" checked disabled />
						<span>
							<strong>{t.necessary}</strong>
							<span class="ds-cookie__hint">{t.necessaryHint}</span>
						</span>
					</label>
					{#each categories as category (category)}
						<div class="ds-cookie__choice">
							<input
								type="checkbox"
								id="{uid}-{category}"
								aria-describedby="{uid}-{category}-hint"
								bind:checked={selection[category]}
							/>
							<span>
								<label for="{uid}-{category}"><strong>{labels[category].title}</strong></label>
								<span class="ds-cookie__hint" id="{uid}-{category}-hint">{labels[category].text}</span>
								{#if providers[category].length > 0}
									<span class="ds-cookie__providers">
										{t.providers}
										{#each providers[category] as provider, i (provider.name)}
											{#if i > 0}<span aria-hidden="true">, </span>{/if}
											{#if provider.privacyUrl}
												<a href={provider.privacyUrl} target="_blank" rel="noopener noreferrer"
													>{provider.name}<span class="ds-cookie__sr"> {t.newWindow}</span></a
												>
											{:else}
												<span>{provider.name}</span>
											{/if}
										{/each}
									</span>
								{/if}
							</span>
						</div>
					{/each}
				</fieldset>
			{/if}

			<div class="ds-cookie__actions">
				<button type="button" class="ds-cookie__button" onclick={rejectAll}>{t.rejectAll}</button>
				<button type="button" class="ds-cookie__button" onclick={acceptAll}>{t.acceptAll}</button>
				{#if showDetails}
					<button type="button" class="ds-cookie__button" onclick={saveSelection}>{t.save}</button>
				{:else}
					<button type="button" class="ds-cookie__more" onclick={() => (detailsOpen = true)}>
						{t.settings}
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
	.ds-cookie__hint,
	.ds-cookie__providers {
		display: block;
	}
	.ds-cookie__providers {
		font-size: 0.875rem;
	}
	.ds-cookie__providers a {
		color: inherit;
		text-decoration: underline;
	}
	.ds-cookie__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
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
