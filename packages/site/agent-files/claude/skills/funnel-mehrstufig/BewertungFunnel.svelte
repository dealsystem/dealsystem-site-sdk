<script lang="ts">
	// Beispiel „Immobilie bewerten lassen“: mehrstufig, ohne Wertberechnung. Gehört nach
	// `src/lib/BewertungFunnel.svelte`; das Formular `bewertung` steht in `dealsystem.config.ts` (siehe SKILL.md).
	import { createFunnelState, createLeadClient, LeadHoneypot, Text, type LeadResult } from '@dealsystem/site';
	import { onMount, tick } from 'svelte';

	const lead = createLeadClient('bewertung');
	const funnel = createFunnelState(lead, [
		{ id: 'objekt', title: 'Um welche Immobilie geht es?', fields: ['objektart'] },
		{ id: 'lage', title: 'Wie groß ist sie, und wo liegt sie?', fields: ['wohnflaeche', 'plz'] },
		{ id: 'zustand', title: 'In welchem Zustand ist sie?', fields: ['zustand', 'baujahr'] },
		{
			id: 'kontakt',
			title: 'Wohin dürfen wir die Einschätzung schicken?',
			fields: ['firstName', 'lastName', 'email', 'phone'],
		},
	]);

	let heading = $state<HTMLElement | null>(null);
	let result = $state<LeadResult | null>(null);
	let done = $state(false);

	onMount(() => () => lead.destroy());

	/** Nach jedem Wechsel steht der Fokus auf der Überschrift: Vorleseprogramme lesen den neuen Schritt vor. */
	async function focusHeading() {
		await tick();
		heading?.focus();
	}

	async function weiter() {
		result = null;
		if (!funnel.next()) {
			await tick();
			document.querySelector<HTMLElement>('.funnel [aria-invalid="true"]')?.focus();
			return;
		}
		await focusHeading();
	}

	async function zurueck() {
		result = null;
		funnel.back();
		await focusHeading();
	}

	async function absenden() {
		result = null;
		if (!funnel.next()) {
			await tick();
			document.querySelector<HTMLElement>('.funnel [aria-invalid="true"]')?.focus();
			return;
		}
		result = await funnel.submit();
		if (result.ok) done = true;
		await focusHeading();
	}

	// Die Felder eines Schritts stehen als Namen in der Liste oben; für `bind:value` reicht hier ein Text je Feld.
	const values = funnel.values as Record<string, string | undefined>;
	const field = (name: string) => lead.field(name)!;
	const id = (name: string) => `bewertung-${name}`;
</script>

<section class="funnel" aria-labelledby="bewertung-titel">
	{#if done}
		<h2 id="bewertung-titel" tabindex="-1" bind:this={heading}>
			<Text key="bewertung.danke.titel" default="Vielen Dank" />
		</h2>
		<Text
			key="bewertung.danke.text"
			as="p"
			default="Ihre Angaben sind bei uns angekommen. Wir sehen sie uns an und melden uns mit einer Einschätzung."
		/>
		{#if result?.ok && result.dryRun}
			<p>Vorschau: Diese Anfrage wurde geprüft, aber nicht gespeichert.</p>
		{/if}
	{:else}
		<p class="funnel__schritt">Schritt {funnel.progress.current} von {funnel.progress.total}</p>
		<progress max={funnel.progress.total} value={funnel.progress.current} aria-label="Fortschritt"></progress>
		<h2 id="bewertung-titel" tabindex="-1" bind:this={heading}>{funnel.step.title}</h2>

		<div class="funnel__felder">
			{#each funnel.step.fields as name (name)}
				{@const f = field(name)}
				{@const error = funnel.errors[name]}
				<div class="funnel__feld">
					<label for={id(name)}
						>{f.label}{#if f.required}<span aria-hidden="true"> *</span>{/if}</label
					>
					{#if f.type === 'select'}
						<select
							id={id(name)}
							bind:value={values[name]}
							required={f.required}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={error ? `${id(name)}-fehler` : undefined}
							onfocus={() => lead.prepare()}
						>
							<option value="">Bitte wählen</option>
							{#each f.options ?? [] as option (option)}
								<option value={option}>{option}</option>
							{/each}
						</select>
					{:else}
						<input
							id={id(name)}
							type={f.type === 'email' || f.type === 'tel' ? f.type : 'text'}
							inputmode={name === 'wohnflaeche' || name === 'plz' || name === 'baujahr'
								? 'numeric'
								: undefined}
							bind:value={values[name]}
							required={f.required}
							placeholder={f.placeholder}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={error ? `${id(name)}-fehler` : undefined}
							onfocus={() => lead.prepare()}
						/>
					{/if}
					{#if error}
						<p class="funnel__fehler" id="{id(name)}-fehler">{error}</p>
					{/if}
				</div>
			{/each}
		</div>

		<LeadHoneypot client={lead} />

		<div aria-live="polite">
			{#if lead.status === 'captcha'}
				<p>Die Sicherheitsprüfung läuft. Ihre Angaben werden gleich gesendet.</p>
			{:else if lead.status === 'sending'}
				<p>Ihre Angaben werden gesendet.</p>
			{/if}
		</div>

		{#if result && !result.ok && result.reason !== 'validation'}
			<div role="alert">
				<p><strong>Ihre Angaben wurden nicht gesendet.</strong> {result.message}</p>
				{#if result.fallback.phone || result.fallback.email}
					<p>
						Sie erreichen uns auch direkt:
						{#if result.fallback.phone}<a href="tel:{result.fallback.phone.replace(/[^+0-9]/g, '')}"
								>{result.fallback.phone}</a
							>{/if}
						{#if result.fallback.phone && result.fallback.email}oder{/if}
						{#if result.fallback.email}<a href="mailto:{result.fallback.email}">{result.fallback.email}</a
							>{/if}
					</p>
				{/if}
			</div>
		{/if}

		<div class="funnel__knoepfe">
			{#if !funnel.isFirst}
				<button type="button" onclick={zurueck}>Zurück</button>
			{/if}
			{#if funnel.isLast}
				<button type="button" onclick={absenden} aria-disabled={lead.status !== 'idle'}
					>Einschätzung anfragen</button
				>
			{:else}
				<button type="button" onclick={weiter}>Weiter</button>
			{/if}
		</div>
		<Text
			key="bewertung.hinweis.text"
			as="p"
			class="funnel__hinweis"
			default="Wir nennen Ihnen keinen automatisch errechneten Preis. Wir sehen uns Ihre Angaben an und melden uns mit einer Einschätzung."
		/>
	{/if}
</section>

<style>
	.funnel {
		max-width: 36rem;
	}
	.funnel :focus-visible {
		outline: 3px solid var(--color-focus, #1a56db);
		outline-offset: 2px;
	}
	progress {
		width: 100%;
		height: 0.5rem;
		accent-color: var(--color-primary, #1a1a1a);
	}
	.funnel__feld {
		margin-bottom: 1.25rem;
	}
	.funnel__feld label {
		display: block;
		margin-bottom: 0.375rem;
		font-weight: 600;
	}
	input,
	select {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		font: inherit;
	}
	.funnel__fehler {
		color: var(--color-error, #b3261e);
	}
	.funnel__knoepfe {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}
	button {
		min-height: 44px;
		padding: 0.5rem 1.25rem;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
