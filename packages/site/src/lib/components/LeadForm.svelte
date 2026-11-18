<!--
@component
Ein Formular aus `dealsystem.config.ts`. Die Felder, Beschriftungen,
Fehlermeldungen, der Spam-Schutz und der Versand an das CRM sind eingebaut.
Schreibe kein eigenes `<form>` und kein eigenes `fetch`.

```svelte
<LeadForm funnel="kontakt" submitLabel="Anfrage senden" successMessage="Danke, wir melden uns." />
```

Neue Felder trägst du in `dealsystem.config.ts` unter `funnels.<schlüssel>.fields` ein.
Farben und Rundungen steuerst du mit CSS-Variablen, z. B. `--ds-color-primary`.
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { FunnelKey } from '../types.js';

	export interface LeadFormProps {
		/** Schlüssel des Formulars aus `dealsystem.config.ts`, z. B. `kontakt`. */
		funnel: FunnelKey;
		/** Text der Schaltfläche. Standard „Absenden“. */
		submitLabel?: string;
		/** Text nach erfolgreichem Versand. */
		successMessage?: string;
		/** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
		privacyHref?: string;
		/** Eigene Anzeige nach erfolgreichem Versand, statt `successMessage`. */
		success?: Snippet;
		/** Wird nach erfolgreichem Versand aufgerufen, z. B. für eine Weiterleitung. */
		onsuccess?: () => void;
		class?: string;
	}

	const AUTOCOMPLETE: Record<string, AutoFill> = {
		firstName: 'given-name',
		lastName: 'family-name',
		email: 'email',
		phone: 'tel',
		address1: 'address-line1',
		postalCode: 'postal-code',
		city: 'address-level2',
	};
	type AutoFill =
		'given-name' | 'family-name' | 'email' | 'tel' | 'address-line1' | 'postal-code' | 'address-level2';
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { createLeadClient } from '../client/leadClient.svelte.js';
	import type { SiteApiError } from '../client/siteApi.js';
	import { labelOf, maxLengthOf, type FieldValue } from '../client/validation.js';
	import { consent } from '../consent/consent.svelte.js';
	import { getSiteData } from '../internal/siteData.js';

	let {
		funnel,
		submitLabel = 'Absenden',
		successMessage = 'Vielen Dank. Ihre Anfrage ist bei uns angekommen.',
		privacyHref = '/datenschutz',
		success,
		onsuccess,
		class: className,
	}: LeadFormProps = $props();

	const uid = $props.id();
	const site = getSiteData();

	let captchaElement = $state<HTMLElement | null>(null);
	// Dieselbe Einsendung wie `createLeadClient()` für eigene Oberflächen: eine Implementierung, nicht zwei.
	// svelte-ignore state_referenced_locally
	const client = createLeadClient(funnel, {
		captchaElement: () => captchaElement,
		caller: `<LeadForm funnel="${funnel}">`,
	});
	const fields = client.fields;
	const hasRequired = fields.some((field) => field.required);

	let texts = $state<Record<string, string>>({});
	let checks = $state<Record<string, boolean>>({});
	let multis = $state<Record<string, string[]>>({});
	let honeypot = $state('');
	let errors = $state<Record<string, string>>({});
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let failure = $state<SiteApiError | null>(null);
	let dryRun = $state(false);
	const waitingForCaptcha = $derived(status === 'submitting' && client.status === 'captcha');

	let form = $state<HTMLFormElement | null>(null);
	let successElement = $state<HTMLElement | null>(null);
	let errorElement = $state<HTMLElement | null>(null);

	const errorCount = $derived(Object.keys(errors).length);

	onMount(() => {
		consent.init();
		return () => client.destroy();
	});

	function valueOf(name: string, type: string): FieldValue | undefined {
		if (type === 'checkbox') return checks[name] ?? false;
		if (type === 'multiselect') return multis[name] ?? [];
		return texts[name] ?? '';
	}

	function values(): Record<string, FieldValue | undefined> {
		return Object.fromEntries(fields.map((field) => [field.name, valueOf(field.name, field.type)]));
	}

	/** Holt und löst die Captcha-Aufgabe beim ersten Kontakt mit dem Formular, nicht vorher. */
	function startCaptcha() {
		client.prepare();
	}

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (status === 'submitting' || !client.available) return;

		const current = values();
		errors = client.validate(current);
		failure = null;
		if (Object.keys(errors).length > 0) {
			status = 'idle';
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}

		status = 'submitting';
		client.setHoneypot(honeypot);
		const result = await client.submit(current);

		if (result.ok) {
			dryRun = result.dryRun;
			status = 'success';
			await tick();
			successElement?.focus();
			onsuccess?.();
			return;
		}

		status = 'error';
		failure = result.error ?? null;
		if (result.reason === 'validation' && Object.keys(result.fields).length > 0) {
			errors = result.fields;
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		await tick();
		errorElement?.focus();
	}

	const contact = $derived({
		phone: site.legal.phone,
		email: site.legal.email,
	});
</script>

{#snippet contactFallback()}
	{#if contact.phone || contact.email}
		<p class="ds-form__contact">
			Sie erreichen uns auch direkt:
			{#if contact.phone}
				<a href="tel:{contact.phone.replace(/[^+0-9]/g, '')}">{contact.phone}</a>
			{/if}
			{#if contact.phone && contact.email}
				oder
			{/if}
			{#if contact.email}
				<a href="mailto:{contact.email}">{contact.email}</a>
			{/if}
		</p>
	{/if}
{/snippet}

<div class={['ds-form', className]} data-ds-lead-form={funnel}>
	{#if !client.available}
		<div class="ds-form__notice">
			<p>Dieses Formular ist zurzeit nicht verfügbar.</p>
			{@render contactFallback()}
		</div>
	{:else if status === 'success'}
		<div class="ds-form__success" role="status" tabindex="-1" bind:this={successElement}>
			{#if success}
				{@render success()}
			{:else}
				<p>{successMessage}</p>
			{/if}
			{#if dryRun}
				<p class="ds-form__hint">Vorschau: Diese Anfrage wurde geprüft, aber nicht gespeichert.</p>
			{/if}
		</div>
	{:else}
		<form bind:this={form} novalidate {onsubmit} onfocusin={startCaptcha} aria-busy={status === 'submitting'}>
			{#if hasRequired}
				<p class="ds-form__hint">Pflichtfelder sind mit <span aria-hidden="true">*</span> markiert.</p>
			{/if}

			{#each fields as field (field.name)}
				{@const id = `${uid}-${field.name}`}
				{@const error = errors[field.name]}
				{@const describedBy =
					[field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
					undefined}
				{@const label = labelOf(field)}
				{@const autocomplete = field.standardField ? AUTOCOMPLETE[field.standardField] : undefined}

				<div class="ds-form__field" class:ds-form__field--invalid={!!error}>
					{#if field.type === 'checkbox'}
						<div class="ds-form__check">
							<input
								{id}
								type="checkbox"
								name={field.name}
								bind:checked={checks[field.name]}
								required={field.required}
								aria-invalid={error ? 'true' : undefined}
								aria-describedby={describedBy}
							/>
							<label for={id}>
								{label}{#if field.required}<span aria-hidden="true">&nbsp;*</span>{/if}
							</label>
						</div>
					{:else if field.type === 'multiselect'}
						<fieldset aria-describedby={describedBy}>
							<legend>
								{label}{#if field.required}<span aria-hidden="true">&nbsp;*</span>{/if}
							</legend>
							{#each field.options ?? [] as option, index (option)}
								<div class="ds-form__check">
									<input
										id="{id}-{index}"
										type="checkbox"
										name={field.name}
										value={option}
										aria-invalid={error && index === 0 ? 'true' : undefined}
										checked={(multis[field.name] ?? []).includes(option)}
										onchange={(event) => {
											const rest = (multis[field.name] ?? []).filter((v) => v !== option);
											multis[field.name] = event.currentTarget.checked ? [...rest, option] : rest;
										}}
									/>
									<label for="{id}-{index}">{option}</label>
								</div>
							{/each}
						</fieldset>
					{:else}
						<label for={id}>
							{label}{#if field.required}<span aria-hidden="true">&nbsp;*</span>{/if}
						</label>
						{#if field.type === 'textarea'}
							<textarea
								{id}
								name={field.name}
								rows="5"
								bind:value={texts[field.name]}
								required={field.required}
								maxlength={maxLengthOf(field)}
								placeholder={field.placeholder}
								aria-invalid={error ? 'true' : undefined}
								aria-describedby={describedBy}></textarea>
						{:else if field.type === 'select'}
							<select
								{id}
								name={field.name}
								bind:value={texts[field.name]}
								required={field.required}
								aria-invalid={error ? 'true' : undefined}
								aria-describedby={describedBy}
							>
								<option value="">Bitte wählen</option>
								{#each field.options ?? [] as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else}
							<input
								{id}
								type={field.type}
								name={field.name}
								bind:value={texts[field.name]}
								required={field.required}
								maxlength={field.type === 'date' ? undefined : maxLengthOf(field)}
								placeholder={field.placeholder}
								{autocomplete}
								aria-invalid={error ? 'true' : undefined}
								aria-describedby={describedBy}
							/>
						{/if}
					{/if}
					{#if field.help}
						<p class="ds-form__help" id="{id}-help">{field.help}</p>
					{/if}
					{#if error}
						<p class="ds-form__error" id="{id}-error">{error}</p>
					{/if}
				</div>
			{/each}

			<!-- Honeypot: für Menschen unsichtbar und nicht erreichbar. -->
			<div class="ds-form__extra" aria-hidden="true">
				<label for="{uid}-website">Website (bitte leer lassen)</label>
				<input
					id="{uid}-website"
					type="text"
					name="website"
					tabindex="-1"
					autocomplete="off"
					bind:value={honeypot}
				/>
			</div>

			<div bind:this={captchaElement} hidden></div>

			<p class="ds-form__privacy">
				Ihre Angaben verwenden wir, um Ihre Anfrage zu bearbeiten. Mehr dazu in der
				<a href={privacyHref}>Datenschutzerklärung</a>.
			</p>

			<div class="ds-form__status" aria-live="polite">
				{#if errorCount > 0}
					<p class="ds-form__error">
						{errorCount === 1
							? 'Bitte prüfen Sie das markierte Feld.'
							: `Bitte prüfen Sie die ${errorCount} markierten Felder.`}
					</p>
				{:else if waitingForCaptcha}
					<p>Die Sicherheitsprüfung läuft. Ihre Anfrage wird gleich gesendet.</p>
				{:else if status === 'submitting'}
					<p>Ihre Anfrage wird gesendet.</p>
				{/if}
			</div>

			{#if status === 'error' && failure && errorCount === 0}
				<div class="ds-form__failure" role="alert" tabindex="-1" bind:this={errorElement}>
					<p><strong>Ihre Anfrage wurde nicht gesendet.</strong> {failure.message}</p>
					{#if failure.kind !== 'validation'}
						{@render contactFallback()}
					{/if}
				</div>
			{/if}

			<button type="submit" class="ds-form__submit" aria-disabled={status === 'submitting'}>
				{submitLabel}
			</button>
		</form>
		<noscript>
			<p>Das Formular braucht JavaScript.</p>
			{@render contactFallback()}
		</noscript>
	{/if}
</div>

<style>
	.ds-form {
		color: var(--ds-color-text, #1a1a1a);
		line-height: 1.5;
	}
	.ds-form :focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
	.ds-form__field {
		margin-bottom: 1.25rem;
	}
	.ds-form__field > label,
	legend {
		display: block;
		margin-bottom: 0.375rem;
		padding: 0;
		font-weight: 600;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	input:not([type='checkbox']),
	textarea,
	select {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-surface, #ffffff);
		color: inherit;
		font: inherit;
	}
	.ds-form__field--invalid input:not([type='checkbox']),
	.ds-form__field--invalid textarea,
	.ds-form__field--invalid select {
		border-color: var(--ds-color-error, #b3261e);
		border-width: 2px;
	}
	.ds-form__check {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		min-height: 44px;
		padding: 0.5rem 0;
		box-sizing: border-box;
	}
	.ds-form__check input {
		width: 1.25rem;
		height: 1.25rem;
		margin: 0.125rem 0 0;
		flex-shrink: 0;
	}
	.ds-form__help,
	.ds-form__hint,
	.ds-form__privacy {
		margin: 0.375rem 0 0;
		font-size: 0.9375rem;
	}
	.ds-form__hint,
	.ds-form__privacy {
		margin-bottom: 1rem;
	}
	.ds-form__error {
		margin: 0.375rem 0 0;
		color: var(--ds-color-error, #b3261e);
		font-weight: 600;
	}
	.ds-form__failure,
	.ds-form__success,
	.ds-form__notice {
		margin-bottom: 1rem;
		padding: 1rem;
		border-left: 4px solid var(--ds-color-primary, #1a1a1a);
	}
	.ds-form__failure {
		border-left-color: var(--ds-color-error, #b3261e);
	}
	.ds-form__failure p,
	.ds-form__success p,
	.ds-form__notice p {
		margin: 0 0 0.5rem;
	}
	.ds-form__status p {
		margin: 0 0 1rem;
	}
	.ds-form a {
		color: inherit;
		text-decoration: underline;
	}
	.ds-form__submit {
		min-height: 44px;
		padding: 0.625rem 1.5rem;
		border: 2px solid var(--ds-color-primary, #1a1a1a);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-primary, #1a1a1a);
		color: var(--ds-color-on-primary, #ffffff);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.ds-form__submit[aria-disabled='true'] {
		opacity: 0.7;
		cursor: progress;
	}
	.ds-form__extra {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
