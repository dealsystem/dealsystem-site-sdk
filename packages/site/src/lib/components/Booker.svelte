<!--
@component
Terminbuchung auf der Seite: Tag wählen, Uhrzeit wählen, Angaben, Bestätigung. Die freien Zeiten,
Buchungsfragen, der Spam-Schutz und die Buchung im CRM sind eingebaut. Kein iframe, kein eigenes `fetch`.

```svelte
<Booker booking="erstgespraech" />
```

Den Schlüssel trägst du in `dealsystem.config.ts` unter `booking` ein. Die Terminart (Dauer, Arbeitszeiten,
Fragen, Reihenfolge) richtet der Kunde im CRM unter Kalender → Buchungsseiten ein; erfinde keine. Steht sie auf „erst Angaben,
dann Termin“ (`contact_first`), fragt der Baustein zuerst Kontaktdaten und Fragen ab und zeigt danach die freien
Zeiten; sonst umgekehrt. Zeiten erscheinen in der Zeitzone des
Besuchers, die des Kalenders steht als Hinweis dabei. Farben und Rundungen wie bei `<LeadForm>` über
CSS-Variablen, z. B. `--ds-color-primary`.
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { BookingKey } from '../types.js';

	export interface BookerProps {
		/** Schlüssel aus `booking` in `dealsystem.config.ts`, z. B. `erstgespraech`. */
		booking: BookingKey;
		/** So viele Tage zeigt der erste Abruf, Standard 14 (höchstens 31). „Weitere Termine“ lädt nach. */
		days?: number;
		/** Ebene der Schritt-Überschriften, Standard 2. */
		headingLevel?: 2 | 3 | 4;
		/** Text der Schaltfläche. Standard „Termin buchen“. */
		submitLabel?: string;
		/** Adresse der Datenschutzerklärung. Standard `/datenschutz`. */
		privacyHref?: string;
		/**
		 * Beschriftungen der Adressfelder, wenn der Termin beim Gast stattfindet (Ort-Art mit Adresse). Standard
		 * „Straße und Hausnummer“, „PLZ“, „Ort“.
		 */
		addressLabels?: { street?: string; postalCode?: string; city?: string };
		/**
		 * Eigene Bezeichnung je Ort-Art statt der aus dem CRM, z. B. `{ attendee_address: 'Bei dir vor Ort' }`, wenn die
		 * Seite ihre Besucher duzt.
		 */
		locationLabels?: Partial<Record<BookingLocationType, string>>;
		/** Eigene Anzeige nach der Buchung; bekommt Datum und Uhrzeit als Text. */
		success?: Snippet<[{ when: string; dryRun: boolean }]>;
		/** Wird nach der Buchung aufgerufen. */
		onbooked?: (booked: { start: string; end: string | null; dryRun: boolean }) => void;
		class?: string;
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		createBookingClient,
		needsAttendeeAddress,
		type BookingFailure,
	} from '../client/bookingClient.svelte.js';
	import {
		BOOKING_RANGE_MAX_DAYS,
		bookingRange,
		groupSlotsByDay,
		timeZoneLabel,
		visitorTimeZone,
		type BookingDay,
		type BookingSlotView,
	} from '../client/bookingTime.js';
	import type { BookingInfo, BookingLocationType, BookingSlot } from '../client/siteApi.js';
	import { consent } from '../consent/consent.svelte.js';
	import { navigateTo } from '../internal/navigate.js';
	import LeadHoneypot from './LeadHoneypot.svelte';

	let {
		booking,
		days = 14,
		headingLevel = 2,
		submitLabel = 'Termin buchen',
		privacyHref = '/datenschutz',
		addressLabels,
		locationLabels,
		success,
		onbooked,
		class: className,
	}: BookerProps = $props();

	const uid = $props.id();
	let captchaElement = $state<HTMLElement | null>(null);
	// svelte-ignore state_referenced_locally
	const client = createBookingClient(booking, {
		captchaElement: () => captchaElement,
		caller: `<Booker booking="${booking}">`,
	});
	const zone = visitorTimeZone();
	// svelte-ignore state_referenced_locally
	const span = Math.min(Math.max(1, Math.floor(days)), BOOKING_RANGE_MAX_DAYS);
	/** Weiter als so viele Tage wird nicht nachgeladen. */
	const HORIZON_DAYS = 180;

	/** `confirm` nur bei `contact_first`: Angaben stehen, Zeit gewählt, jetzt buchen. */
	type Step = 'loading' | 'pick' | 'details' | 'confirm' | 'not_qualified' | 'done' | 'unavailable';
	let step = $state<Step>('loading');
	let info = $state<BookingInfo | null>(null);
	let calendarZone = $state<string | null>(null);
	let slots = $state<BookingSlot[]>([]);
	let loadedUntil = $state<Date | null>(null);
	let loadingMore = $state(false);
	let selectedDay = $state<string | null>(null);
	let selected = $state<BookingSlotView | null>(null);
	let problem = $state<BookingFailure | null>(null);
	let notice = $state('');

	const PERSON_FIELDS = [
		{ name: 'firstName', label: 'Vorname', type: 'text', auto: 'given-name', required: true, max: 100 },
		{ name: 'lastName', label: 'Nachname', type: 'text', auto: 'family-name', required: false, max: 100 },
		{ name: 'email', label: 'E-Mail', type: 'email', auto: 'email', required: true, max: 254 },
		{ name: 'phone', label: 'Telefon', type: 'tel', auto: 'tel', required: false, max: 50 },
	] as const;
	let person = $state({ firstName: '', lastName: '', email: '', phone: '' });
	let locationType = $state<BookingLocationType | null>(null);
	let attendeeAddress = $state({ street: '', postalCode: '', city: '' });
	/** Die gewählte Ort-Art verlangt eine Adresse des Gasts (z. B. „Bei Ihnen vor Ort“). */
	const needsAddress = $derived(info ? needsAttendeeAddress(info.locations, locationType) : false);
	const ADDRESS_FIELDS = $derived([
		{
			name: 'street',
			label: addressLabels?.street ?? 'Straße und Hausnummer',
			auto: 'street-address',
			max: 200,
		},
		{ name: 'postalCode', label: addressLabels?.postalCode ?? 'PLZ', auto: 'postal-code', max: 10 },
		{ name: 'city', label: addressLabels?.city ?? 'Ort', auto: 'address-level2', max: 100 },
	] as const);
	const locationLabel = (location: { type: BookingLocationType; label: string }) =>
		locationLabels?.[location.type] ?? location.label;
	let answers = $state<Record<string, string | boolean | string[]>>({});
	let errors = $state<Record<string, string>>({});
	let sending = $state(false);
	let booked = $state<{ when: string; dryRun: boolean } | null>(null);
	/** `contact_first`: Antworten werden geprüft (vor der Zeitwahl). */
	let qualifying = $state(false);
	let rejection = $state<{ headline: string; message: string; redirectUrl: string | null } | null>(null);

	let heading = $state<HTMLElement | null>(null);
	let form = $state<HTMLFormElement | null>(null);
	let problemElement = $state<HTMLElement | null>(null);

	const groups = $derived<BookingDay[]>(groupSlotsByDay(slots, zone));
	const day = $derived(groups.find((g) => g.date === selectedDay) ?? null);
	const canLoadMore = $derived(
		loadedUntil !== null && loadedUntil.getTime() < Date.now() + HORIZON_DAYS * 86_400_000,
	);
	const errorCount = $derived(Object.keys(errors).length);
	const zoneNote = $derived(
		calendarZone && calendarZone !== zone
			? `Zeiten in Ihrer Zeitzone: ${timeZoneLabel(zone)}. Der Kalender des Anbieters führt ${timeZoneLabel(calendarZone)}.`
			: `Zeiten in Ihrer Zeitzone: ${timeZoneLabel(zone)}${calendarZone ? ', wie der Kalender des Anbieters' : ''}.`,
	);
	const headingTag = $derived(`h${headingLevel}`);
	/** Erst Angaben, dann Zeit (an der Terminart im CRM eingestellt). */
	const contactFirst = $derived(info?.flow === 'contact_first');

	async function focusHeading() {
		await tick();
		heading?.focus();
	}

	async function load(from: Date, append: boolean): Promise<boolean> {
		const range = bookingRange(span, from);
		const result = await client.slots(range.from, range.to);
		if (!result.ok) {
			problem = result;
			return false;
		}
		calendarZone = result.timezone;
		const known = new Set(append ? slots.map((s) => s.start) : []);
		slots = [...(append ? slots : []), ...result.slots.filter((s) => !known.has(s.start))];
		loadedUntil = range.to;
		return true;
	}

	async function start() {
		problem = null;
		step = 'loading';
		const [loaded, ok] = await Promise.all([client.info(), load(new Date(), false)]);
		if (!loaded.ok) {
			problem = loaded;
			step = 'unavailable';
			return;
		}
		info = loaded.info;
		locationType = info.locations[0]?.type ?? null;
		if (!ok) {
			step = 'unavailable';
			return;
		}
		selectedDay = groups[0]?.date ?? null;
		if (info.flow === 'contact_first') {
			step = 'details';
			notice = '';
			return;
		}
		step = 'pick';
		notice = groups.length > 0 ? '' : 'In diesem Zeitraum ist kein Termin frei.';
	}

	onMount(() => {
		consent.init();
		void start();
		return () => client.destroy();
	});

	async function loadMore() {
		if (!loadedUntil || loadingMore) return;
		loadingMore = true;
		const before = groups.length;
		const ok = await load(loadedUntil, true);
		loadingMore = false;
		if (!ok) return;
		notice =
			groups.length > before
				? `${groups.length - before} weitere Tage mit freien Terminen.`
				: 'Im nächsten Zeitraum ist kein Termin frei.';
		if (!selectedDay) selectedDay = groups[0]?.date ?? null;
	}

	function chooseDay(date: string) {
		selectedDay = date;
		const chosen = groups.find((g) => g.date === date);
		notice = chosen ? `${chosen.long}: ${chosen.slots.length} freie Zeiten.` : '';
	}

	async function chooseTime(slot: BookingSlotView) {
		selected = slot;
		problem = null;
		client.prepare();
		if (contactFirst) {
			step = 'confirm';
		} else {
			errors = {};
			step = 'details';
		}
		await focusHeading();
	}

	async function backToPick() {
		step = 'pick';
		await focusHeading();
	}

	async function backToDetails() {
		problem = null;
		step = 'details';
		await focusHeading();
	}

	async function focusFirstInvalid() {
		await tick();
		form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}

	function answerOf(key: string): string {
		const value = answers[key];
		return typeof value === 'string' ? value : '';
	}

	function toggleMulti(key: string, option: string, on: boolean) {
		const current = Array.isArray(answers[key]) ? (answers[key] as string[]) : [];
		answers[key] = on ? [...current, option] : current.filter((o) => o !== option);
	}

	/** `contact_first`: Angaben prüfen, dann zur Zeitwahl. */
	async function toPick(event: SubmitEvent) {
		event.preventDefault();
		if (!info) return;
		problem = null;
		errors = client.validate(
			{ ...person, answers, ...guestDetails() },
			info.questions,
			info.locations,
			info.attendeePhone,
		);
		if (errorCount > 0) return focusFirstInvalid();
		if (qualifying) return;
		// Die Sicherheitsprüfung läuft schon, während der Besucher die Zeit wählt.
		client.prepare();
		qualifying = true;
		const check = await client.qualify(answers);
		qualifying = false;
		if (!check.ok) {
			problem = check;
			await tick();
			problemElement?.focus();
			return;
		}
		if (!check.qualified) {
			rejection = { headline: check.headline, message: check.message, redirectUrl: check.redirectUrl };
			step = 'not_qualified';
			// Die Regel im CRM leitet weiter: dorthin statt zur Zeitwahl (der Link bleibt für alle Fälle stehen).
			if (check.redirectUrl) return navigateTo(check.redirectUrl);
			await focusHeading();
			return;
		}
		step = 'pick';
		notice = groups.length > 0 ? '' : 'In diesem Zeitraum ist kein Termin frei.';
		await focusHeading();
	}

	/** Ort-Art und, falls sie es verlangt, die Adresse des Gasts. */
	function guestDetails() {
		return {
			...(locationType ? { locationType } : {}),
			...(needsAddress ? { attendeeAddress: { ...attendeeAddress } } : {}),
		};
	}

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (sending || !selected || !info) return;
		problem = null;
		const input = { ...person, answers, ...guestDetails() };
		errors = client.validate(input, info.questions, info.locations, info.attendeePhone);
		if (errorCount > 0) {
			if (step === 'confirm') step = 'details';
			return focusFirstInvalid();
		}
		sending = true;
		const result = await client.book({ ...input, start: selected.start });
		sending = false;

		if (result.ok) {
			booked = { when: selected.label, dryRun: result.dryRun };
			step = 'done';
			onbooked?.({ start: result.start, end: result.end, dryRun: result.dryRun });
			await focusHeading();
			return;
		}
		if (result.reason === 'validation') {
			errors = result.fields;
			if (contactFirst && !errors.start) {
				// Die Angaben stehen im ersten Schritt: dorthin zurück, die gewählte Zeit bleibt.
				step = 'details';
				await focusHeading();
			}
			return focusFirstInvalid();
		}
		problem = result;
		if (result.reason === 'slot_taken') {
			// Die Zeit ist weg: frische Zeiten zeigen, die Angaben bleiben.
			const taken = selected.start;
			selected = null;
			await load(new Date(), false);
			slots = slots.filter((s) => s.start !== taken);
			if (!groups.some((g) => g.date === selectedDay)) selectedDay = groups[0]?.date ?? null;
			step = 'pick';
			await focusHeading();
			return;
		}
		await tick();
		problemElement?.focus();
	}

	const contact = $derived(client.fallback);
	const live = $derived(
		step === 'loading'
			? 'Freie Termine werden geladen.'
			: step === 'not_qualified' && rejection
				? rejection.headline
				: qualifying
					? 'Ihre Angaben werden geprüft.'
					: step === 'done' && booked
						? booked.dryRun
							? `Vorschau: Termin am ${booked.when} geprüft, nicht gebucht.`
							: `Termin gebucht: ${booked.when}.`
						: sending
							? client.status === 'captcha'
								? 'Die Sicherheitsprüfung läuft. Ihr Termin wird gleich gebucht.'
								: 'Ihr Termin wird gebucht.'
							: errorCount > 0
								? errorCount === 1
									? 'Bitte prüfen Sie das markierte Feld.'
									: `Bitte prüfen Sie die ${errorCount} markierten Felder.`
								: notice,
	);
</script>

{#snippet contactFallback()}
	{#if contact.phone || contact.email}
		<p class="ds-booker__contact">
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

{#snippet stepHeading(text: string)}
	<svelte:element this={headingTag} class="ds-booker__heading" tabindex="-1" bind:this={heading}>
		{text}
	</svelte:element>
{/snippet}

{#snippet privacy()}
	<p class="ds-booker__privacy">
		Ihre Angaben verwenden wir, um den Termin zu vereinbaren. Mehr dazu in der
		<a href={privacyHref}>Datenschutzerklärung</a>.
	</p>
{/snippet}

{#snippet failureBox()}
	{#if problem}
		<div class="ds-booker__failure" role="alert" tabindex="-1" bind:this={problemElement}>
			<p><strong>Der Termin wurde nicht gebucht.</strong> {problem.message}</p>
			{@render contactFallback()}
		</div>
	{/if}
{/snippet}

{#snippet submitButton()}
	<button type="submit" class="ds-booker__submit" aria-disabled={sending}>
		{sending ? 'Wird gebucht …' : submitLabel}
	</button>
{/snippet}

{#snippet fieldError(name: string, id: string)}
	{#if errors[name]}
		<p class="ds-booker__error" id="{id}-error">{errors[name]}</p>
	{/if}
{/snippet}

<div class={['ds-booker', className]} data-ds-booker={booking}>
	<div class="ds-booker__live" aria-live="polite" aria-atomic="true">{live}</div>

	{#if step === 'loading'}
		<p class="ds-booker__hint">Freie Termine werden geladen …</p>
	{:else if step === 'unavailable'}
		<div class="ds-booker__notice" role="alert" tabindex="-1" bind:this={problemElement}>
			<p>{problem?.message ?? 'Die Terminbuchung ist zurzeit nicht verfügbar.'}</p>
			{@render contactFallback()}
		</div>
	{:else if step === 'not_qualified' && rejection}
		<div class="ds-booker__done">
			{@render stepHeading(rejection.headline)}
			<p>{rejection.message}</p>
			{#if rejection.redirectUrl}
				<p><a href={rejection.redirectUrl}>Weiter</a></p>
			{:else}
				{@render contactFallback()}
			{/if}
			<button type="button" class="ds-booker__link" onclick={backToDetails}>Angaben ändern</button>
		</div>
	{:else if step === 'done' && booked}
		<div class="ds-booker__done">
			{@render stepHeading(booked.dryRun ? 'Vorschau: Termin geprüft' : 'Ihr Termin ist gebucht')}
			{#if success}
				{@render success(booked)}
			{:else}
				<p>
					{booked.when}{info ? ` · ${info.durationMinutes} Minuten` : ''}.
					{#if !booked.dryRun}
						Sie erhalten gleich eine Bestätigung per E-Mail, darin auch Links zum Absagen oder Verschieben.
					{/if}
				</p>
			{/if}
			{#if booked.dryRun}
				<p class="ds-booker__hint">
					Vorschau: Die Buchung wurde geprüft, aber nicht angelegt. Es geht keine Mail raus.
				</p>
			{/if}
		</div>
	{:else if step === 'pick' && info}
		{@render stepHeading(`${info.label}: Tag und Uhrzeit wählen`)}
		<p class="ds-booker__hint">{info.durationMinutes} Minuten. {zoneNote}</p>
		{#if contactFirst}
			<p class="ds-booker__chosen">
				Ihre Angaben: {person.firstName}
				{person.lastName}, {person.email}
				<button type="button" class="ds-booker__link" onclick={backToDetails}>Angaben ändern</button>
			</p>
		{/if}

		{#if problem}
			<div class="ds-booker__failure" role="alert">
				<p>{problem.message}</p>
				{#if problem.reason !== 'slot_taken'}
					{@render contactFallback()}
				{/if}
			</div>
		{/if}

		{#if groups.length === 0}
			<p>In diesem Zeitraum ist kein Termin frei.</p>
			{@render contactFallback()}
		{:else}
			<div class="ds-booker__days" role="group" aria-label="Tag wählen">
				{#each groups as g (g.date)}
					<button
						type="button"
						class="ds-booker__day"
						aria-pressed={g.date === selectedDay}
						aria-label="{g.long}, {g.slots.length} freie Zeiten"
						onclick={() => chooseDay(g.date)}
					>
						{g.short}
					</button>
				{/each}
			</div>
		{/if}

		{#if day}
			<div class="ds-booker__times" role="group" aria-labelledby="{uid}-day">
				<p class="ds-booker__day-label" id="{uid}-day">{day.long}</p>
				<ul>
					{#each day.slots as slot (slot.start)}
						<li>
							<button
								type="button"
								class="ds-booker__time"
								aria-label={slot.label}
								onclick={() => chooseTime(slot)}
							>
								{slot.time}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if canLoadMore}
			<button type="button" class="ds-booker__more" aria-disabled={loadingMore} onclick={loadMore}>
				{loadingMore ? 'Termine werden geladen …' : 'Weitere Termine'}
			</button>
		{/if}
	{:else if step === 'confirm' && info && selected}
		{@render stepHeading('Termin bestätigen')}
		<p class="ds-booker__chosen">
			<strong>{selected.label}</strong>, {info.durationMinutes} Minuten
			<button type="button" class="ds-booker__link" onclick={backToPick}>Andere Zeit wählen</button>
		</p>
		<p class="ds-booker__chosen">
			Für {person.firstName}
			{person.lastName}, {person.email}
			<button type="button" class="ds-booker__link" onclick={backToDetails}>Angaben ändern</button>
		</p>
		<form bind:this={form} novalidate {onsubmit} aria-busy={sending}>
			{@render privacy()}
			{@render failureBox()}
			{@render submitButton()}
		</form>
	{:else if step === 'details' && info && (selected || contactFirst)}
		{@render stepHeading(contactFirst ? `${info.label}: Ihre Angaben` : 'Ihre Angaben')}
		{#if selected && !contactFirst}
			<p class="ds-booker__chosen">
				<strong>{selected.label}</strong>, {info.durationMinutes} Minuten
				<button type="button" class="ds-booker__link" onclick={backToPick}>Andere Zeit wählen</button>
			</p>
		{:else}
			<p class="ds-booker__hint">{info.durationMinutes} Minuten. Danach wählen Sie Tag und Uhrzeit.</p>
		{/if}

		<form bind:this={form} novalidate onsubmit={contactFirst ? toPick : onsubmit} aria-busy={sending}>
			<p class="ds-booker__hint">Pflichtfelder sind mit <span aria-hidden="true">*</span> markiert.</p>

			{#each PERSON_FIELDS as f (f.name)}
				{@const id = `${uid}-${f.name}`}
				{@const required = f.required || (f.name === 'phone' && info.attendeePhone === 'required')}
				<div class="ds-booker__field">
					<label for={id}
						>{f.label}{#if required}<span aria-hidden="true"> *</span>{/if}</label
					>
					<input
						{id}
						type={f.type}
						autocomplete={f.auto}
						{required}
						maxlength={f.max}
						bind:value={person[f.name]}
						aria-invalid={!!errors[f.name]}
						aria-describedby={errors[f.name] ? `${id}-error` : undefined}
					/>
					{@render fieldError(f.name, id)}
				</div>
			{/each}

			{#if info.locations.length > 1}
				<fieldset class="ds-booker__field">
					<legend>Wie möchten Sie sprechen?</legend>
					{#each info.locations as location (location.type)}
						<label class="ds-booker__check">
							<input type="radio" name="{uid}-location" value={location.type} bind:group={locationType} />
							{locationLabel(location)}
						</label>
					{/each}
				</fieldset>
			{:else if info.locations.length === 1}
				<p class="ds-booker__hint">Ort: {locationLabel(info.locations[0]!)}</p>
			{/if}

			{#if needsAddress}
				{#each ADDRESS_FIELDS as f (f.name)}
					{@const id = `${uid}-address-${f.name}`}
					{@const name = `attendeeAddress.${f.name}`}
					<div class="ds-booker__field">
						<label for={id}>{f.label}<span aria-hidden="true"> *</span></label>
						<input
							{id}
							type="text"
							autocomplete={f.auto}
							required
							maxlength={f.max}
							bind:value={attendeeAddress[f.name]}
							aria-invalid={!!errors[name]}
							aria-describedby={errors[name] ? `${id}-error` : undefined}
						/>
						{@render fieldError(name, id)}
					</div>
				{/each}
			{/if}

			{#each info.questions as q (q.key)}
				{@const id = `${uid}-q-${q.key}`}
				{@const name = `answers.${q.key}`}
				{@const invalid = !!errors[name]}
				{@const described = invalid ? `${id}-error` : undefined}
				<div class="ds-booker__field">
					{#if q.type === 'boolean'}
						<div class="ds-booker__check">
							<input
								{id}
								type="checkbox"
								checked={answers[q.key] === true}
								onchange={(e) => (answers[q.key] = e.currentTarget.checked)}
								aria-invalid={invalid}
								aria-describedby={described}
							/>
							<label for={id}
								>{q.label}{#if q.required}<span aria-hidden="true"> *</span>{/if}</label
							>
						</div>
					{:else if q.type === 'multiselect'}
						<fieldset aria-describedby={described}>
							<legend
								>{q.label}{#if q.required}<span aria-hidden="true"> *</span>{/if}</legend
							>
							{#each q.options ?? [] as option, i (option)}
								<label class="ds-booker__check" for="{id}-{i}">
									<input
										id="{id}-{i}"
										type="checkbox"
										checked={Array.isArray(answers[q.key]) && (answers[q.key] as string[]).includes(option)}
										onchange={(e) => toggleMulti(q.key, option, e.currentTarget.checked)}
										aria-invalid={invalid}
									/>
									{option}
								</label>
							{/each}
						</fieldset>
					{:else}
						<label for={id}
							>{q.label}{#if q.required}<span aria-hidden="true"> *</span>{/if}</label
						>
						{#if q.type === 'textarea'}
							<textarea
								{id}
								rows="4"
								maxlength="5000"
								placeholder={q.placeholder ?? undefined}
								required={q.required}
								value={answerOf(q.key)}
								oninput={(e) => (answers[q.key] = e.currentTarget.value)}
								aria-invalid={invalid}
								aria-describedby={described}></textarea>
						{:else if q.type === 'select'}
							<select
								{id}
								required={q.required}
								value={answerOf(q.key)}
								onchange={(e) => (answers[q.key] = e.currentTarget.value)}
								aria-invalid={invalid}
								aria-describedby={described}
							>
								<option value="">Bitte wählen</option>
								{#each q.options ?? [] as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else}
							<input
								{id}
								type={q.type === 'email'
									? 'email'
									: q.type === 'phone'
										? 'tel'
										: q.type === 'date'
											? 'date'
											: 'text'}
								inputmode={q.type === 'number' ? 'decimal' : undefined}
								maxlength="5000"
								placeholder={q.placeholder ?? undefined}
								required={q.required}
								value={answerOf(q.key)}
								oninput={(e) => (answers[q.key] = e.currentTarget.value)}
								aria-invalid={invalid}
								aria-describedby={described}
							/>
						{/if}
					{/if}
					{@render fieldError(name, id)}
				</div>
			{/each}

			<LeadHoneypot {client} />

			{@render privacy()}
			{#if contactFirst}
				{#if problem}
					<div class="ds-booker__failure" role="alert" tabindex="-1" bind:this={problemElement}>
						<p>{problem.message}</p>
						{@render contactFallback()}
					</div>
				{/if}
				<button type="submit" class="ds-booker__submit" aria-disabled={qualifying}>
					{qualifying ? 'Wird geprüft …' : 'Weiter zur Terminwahl'}
				</button>
			{:else}
				{@render failureBox()}
				{@render submitButton()}
			{/if}
		</form>
	{/if}

	<!-- Außerhalb der Schritte: das Captcha läuft weiter, wenn der Besucher zwischen ihnen wechselt. -->
	<div bind:this={captchaElement} hidden></div>

	<noscript>
		<p>Die Terminbuchung braucht JavaScript.</p>
		{@render contactFallback()}
	</noscript>
</div>

<style>
	.ds-booker {
		color: var(--ds-color-text, #1a1a1a);
		line-height: 1.5;
		min-width: 0;
	}
	.ds-booker :focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
	.ds-booker__heading {
		margin: 0 0 0.5rem;
	}
	.ds-booker__heading:focus {
		outline: none;
	}
	.ds-booker__heading:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
	}
	.ds-booker__live {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.ds-booker__hint,
	.ds-booker__privacy,
	.ds-booker__chosen {
		margin: 0 0 1rem;
		font-size: 0.9375rem;
	}
	.ds-booker__days {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}
	.ds-booker__times ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 1.25rem;
		padding: 0;
		list-style: none;
	}
	.ds-booker__day-label {
		margin: 0 0 0.5rem;
		font-weight: 600;
	}
	.ds-booker__day,
	.ds-booker__time,
	.ds-booker__more {
		min-height: 44px;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-surface, #ffffff);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.ds-booker__more {
		width: auto;
	}
	.ds-booker__day[aria-pressed='true'] {
		border: 2px solid var(--ds-color-primary, #1a1a1a);
		background: var(--ds-color-primary, #1a1a1a);
		color: var(--ds-color-on-primary, #ffffff);
		font-weight: 600;
	}
	.ds-booker__field {
		margin: 0 0 1.25rem;
		min-width: 0;
	}
	.ds-booker__field > label,
	legend {
		display: block;
		margin-bottom: 0.375rem;
		padding: 0;
		font-weight: 600;
	}
	fieldset {
		margin: 0 0 1.25rem;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	input:not([type='checkbox']):not([type='radio']),
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
	[aria-invalid='true']:not([type='checkbox']) {
		border-color: var(--ds-color-error, #b3261e);
		border-width: 2px;
	}
	.ds-booker__check {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		min-height: 44px;
		padding: 0.5rem 0;
		box-sizing: border-box;
		font-weight: 400;
	}
	.ds-booker__check input {
		width: 1.25rem;
		height: 1.25rem;
		margin: 0.125rem 0 0;
		flex-shrink: 0;
	}
	.ds-booker__error {
		margin: 0.375rem 0 0;
		color: var(--ds-color-error, #b3261e);
		font-weight: 600;
	}
	.ds-booker__failure,
	.ds-booker__notice,
	.ds-booker__done {
		margin-bottom: 1rem;
		padding: 1rem;
		border-left: 4px solid var(--ds-color-primary, #1a1a1a);
	}
	.ds-booker__failure {
		border-left-color: var(--ds-color-error, #b3261e);
	}
	.ds-booker__failure p,
	.ds-booker__notice p,
	.ds-booker__done p {
		margin: 0 0 0.5rem;
	}
	.ds-booker a,
	.ds-booker__link {
		color: inherit;
		text-decoration: underline;
	}
	.ds-booker__link {
		min-height: 44px;
		margin-left: 0.5rem;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		cursor: pointer;
	}
	.ds-booker__submit {
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
	.ds-booker__submit[aria-disabled='true'],
	.ds-booker__more[aria-disabled='true'] {
		opacity: 0.7;
		cursor: progress;
	}
</style>
