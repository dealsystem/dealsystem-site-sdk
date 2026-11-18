// Terminbuchung ohne eigenes `fetch`: für eigene Oberflächen und intern für `<Booker>`. Eine Implementierung für
// beides: Terminart laden, freie Zeiten, Prüfung, Captcha (derselbe Weg wie bei Formularen), Bot-Falle,
// Herkunft und Einwilligung, `submissionId` gegen doppeltes Buchen. Fehler kommen als Werte mit deutschem Text
// für Besucher zurück, nie als Ausnahme.
import { buildLeadAttribution } from './attribution.js';
import { BOOKING_RANGE_MAX_DAYS, visitorTimeZone } from './bookingTime.js';
import { createCaptchaSession } from './captchaSession.js';
import {
	siteApi,
	type BookingInfo,
	type BookingLocationType,
	type BookingQuestion,
	type BookingSlot,
	type SiteApiError,
} from './siteApi.js';
import { consent } from '../consent/consent.svelte.js';
import { getSiteData } from '../internal/siteData.js';
import { usageError } from '../internal/usage.js';
import type { BookingKey } from '../types.js';
import type { LeadFallback } from './leadClient.svelte.js';

/** Warum etwas nicht geklappt hat. */
export type BookingFailureReason =
	/** Angaben fehlen oder passen nicht: `fields` nennt je Feld den Text. */
	| 'validation'
	/** Die Zeit ist inzwischen vergeben: freie Zeiten neu laden und eine andere wählen lassen. */
	| 'slot_taken'
	/** Die Angaben passen nicht zu dieser Terminart (Regel im CRM). Ausweichkontakt zeigen. */
	| 'not_qualified'
	/** Die Sicherheitsprüfung (Captcha) ließ sich nicht durchführen. */
	| 'captcha'
	/** Zu viele Anfragen; `retryAfterSeconds` sagt, wann es wieder geht. */
	| 'rate_limited'
	/** Keine Verbindung. */
	| 'network'
	/** Buchung ausgeschaltet, ohne Terminart, Kalender gestört oder Antwort unbrauchbar. */
	| 'unavailable';

/** Fehlschlag mit Text für Besucher und Ausweichkontakt aus dem CRM. */
export interface BookingFailure {
	ok: false;
	reason: Exclude<BookingFailureReason, 'validation'>;
	/** Text für Besucher, auf Deutsch. */
	message: string;
	fields: Record<string, never>;
	/** Telefon und E-Mail aus dem CRM. Zeig sie, damit der Besucher trotzdem einen Termin bekommt. */
	fallback: LeadFallback;
	retryAfterSeconds: number | null;
	/** @internal */
	error: SiteApiError;
}

/** Ergebnis von `info()`. */
export type BookingInfoResult = { ok: true; info: BookingInfo } | BookingFailure;

/** Ergebnis von `slots()`. Zeiten in UTC; zum Anzeigen `groupSlotsByDay(result.slots, visitorTimeZone())`. */
export type BookingSlotsResult =
	| {
			ok: true;
			/** Zeitzone des Kalenders (Hinweis für Besucher). */
			timezone: string;
			slots: BookingSlot[];
	  }
	| BookingFailure;

/** Was gebucht werden soll. */
export interface BookingInput {
	/** Beginn genau wie `start` aus `slots()` (UTC). */
	start: string;
	firstName: string;
	lastName?: string;
	email: string;
	phone?: string;
	/** Antworten auf die Buchungsfragen (`info.questions[].key`). */
	answers?: Record<string, string | number | boolean | readonly string[] | undefined>;
	/** Gewählte Ort-Art aus `info.locations`; ohne Angabe die erste. */
	locationType?: BookingLocationType;
}

/** Ergebnis von `book()`. */
export type BookingResult =
	| {
			ok: true;
			/** `true` in der Vorschau: geprüft, nichts gebucht, keine Mail. Zeig dann einen Hinweis. */
			dryRun: boolean;
			/** `true`, wenn derselbe Vorgang schon gebucht war (doppelt abgeschickt). Für Besucher: gebucht. */
			duplicate: boolean;
			/** Beginn und Ende in UTC. */
			start: string;
			end: string | null;
			submissionId: string;
	  }
	| {
			ok: false;
			reason: 'validation';
			message: string;
			/** Je abgelehntem Feld ein Text: `firstName`, `lastName`, `email`, `phone` oder `answers.<key>`. */
			fields: Record<string, string>;
			fallback: null;
			/** @internal */
			error: SiteApiError | null;
	  }
	| BookingFailure;

/** Was der Client gerade tut, reaktiv. */
export type BookingClientStatus = 'idle' | 'loading' | 'captcha' | 'sending';

export interface BookingClientOptions {
	/** Element für das unsichtbare Captcha. @internal */
	captchaElement?: () => HTMLElement | null;
	/** Wie der Aufruf in Fehlermeldungen heißt. @internal */
	caller?: string;
}

/** Ein Client für eine Terminbuchung aus `dealsystem.config.ts`. */
export interface BookingClient<K extends string = string> {
	readonly booking: K;
	/** `label` aus `dealsystem.config.ts`, sonst der Schlüssel. Nach `info()` gilt `info.label`. */
	readonly label: string;
	readonly fallback: LeadFallback;
	/** Was der Client gerade tut (reaktiv). */
	readonly status: BookingClientStatus;
	/** Terminart: Titel, Dauer, Ort-Arten, Fragen, Zeitzone des Kalenders. Einmal geladen, danach aus dem Speicher. */
	info(): Promise<BookingInfoResult>;
	/** Freie Zeiten ab `from` (Standard: jetzt) bis `to` (Standard: 7 Tage später, höchstens 31 Tage). */
	slots(from?: Date | string, to?: Date | string): Promise<BookingSlotsResult>;
	/** Prüft die Angaben wie der Server. Leeres Objekt = in Ordnung. */
	validate(
		input: Omit<BookingInput, 'start'>,
		questions?: readonly BookingQuestion[],
	): Record<string, string>;
	/** Startet die Sicherheitsprüfung im Hintergrund, z. B. sobald eine Zeit gewählt ist. */
	prepare(): void;
	/** Wert der Bot-Falle (`<LeadHoneypot client={booking} />`). Echte Besucher lassen sie leer. */
	setHoneypot(value: string): void;
	/**
	 * Bucht. Wartet auf die Sicherheitsprüfung, hängt Zeitzone, Herkunft und Einwilligung an. Derselbe Beginn bei
	 * einem neuen Versuch behält die `submissionId`: doppelt abgeschickt wird nur einmal gebucht. Läuft schon eine
	 * Buchung, gibt es deren Ergebnis zurück.
	 */
	book(input: BookingInput): Promise<BookingResult>;
	/** Räumt das Captcha ab. In `onMount` als Rückgabe verwenden. */
	destroy(): void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+0-9][0-9 ()/.-]{4,29}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ATTENDEE_FIELDS = ['firstName', 'lastName', 'email', 'phone'] as const;

const MESSAGES = {
	validation: 'Bitte prüfen Sie Ihre Angaben.',
	captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuchen Sie es später erneut.',
	unavailable: 'Die Terminbuchung ist zurzeit nicht verfügbar.',
	slot_taken: 'Diese Zeit ist leider nicht mehr frei. Bitte wählen Sie eine andere.',
	not_qualified:
		'Für diesen Termin passt Ihre Anfrage leider nicht. Bitte nehmen Sie direkt Kontakt auf, wir helfen gern weiter.',
} as const;

const LABELS: Record<(typeof ATTENDEE_FIELDS)[number], string> = {
	firstName: 'Vorname',
	lastName: 'Nachname',
	email: 'E-Mail',
	phone: 'Telefon',
};

function apiError(kind: SiteApiError['kind'], message: string): SiteApiError {
	return {
		kind,
		status: null,
		code: null,
		message,
		retryAfterSeconds: null,
		invalidFields: [],
		invalidPaths: [],
		formInvalid: false,
	};
}

/** Zeitpunkt in ms seit 1970 (`NaN`, wenn ungültig). Zahlen statt `Date`: hier ist nichts reaktiv. */
function msOf(value: Date | string): number {
	return value instanceof Date ? value.getTime() : Date.parse(value);
}

function isoOf(ms: number): string {
	return new Date(ms).toISOString();
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

/** Meldung zu einer Buchungsfrage oder `null`. Regeln wie `validateBookingFieldAnswers` im Core. */
function checkAnswer(question: BookingQuestion, value: unknown): string | null {
	const label = question.label;
	if (isEmpty(value) || (question.type === 'boolean' && value === false && question.required)) {
		if (!question.required) return null;
		if (question.type === 'boolean') return `Bitte bestätigen Sie „${label}“.`;
		if (question.type === 'select' || question.type === 'multiselect')
			return `Bitte wählen Sie bei „${label}“ etwas aus.`;
		return `Bitte füllen Sie das Feld „${label}“ aus.`;
	}
	if (question.type === 'multiselect') {
		if (!Array.isArray(value) || value.some((v) => question.options && !question.options.includes(v)))
			return `Bitte wählen Sie bei „${label}“ etwas aus.`;
		return null;
	}
	if (question.type === 'boolean')
		return typeof value === 'boolean' ? null : `Bitte bestätigen Sie „${label}“.`;
	const text = String(value).trim();
	if (text.length > 5000) return `„${label}“ ist zu lang. Erlaubt sind höchstens 5000 Zeichen.`;
	if (question.type === 'email' && !EMAIL.test(text))
		return 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.';
	if (question.type === 'phone' && !PHONE.test(text))
		return 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0341 1234567.';
	if (question.type === 'number' && !Number.isFinite(Number(text.replace(',', '.'))))
		return `Bitte geben Sie bei „${label}“ eine Zahl an.`;
	if (question.type === 'date' && !DATE.test(text)) return `Bitte geben Sie bei „${label}“ ein Datum an.`;
	if (question.type === 'select' && question.options?.length && !question.options.includes(text))
		return `Bitte wählen Sie bei „${label}“ etwas aus.`;
	return null;
}

/**
 * Terminbuchung ohne `<Booker>`: für eine eigene Oberfläche. Nimmt den Schlüssel aus `booking` in
 * `dealsystem.config.ts`. Die Terminart (Dauer, Arbeitszeiten, Fragen) richtet der Kunde im CRM ein; erfinde
 * keine. Kein eigenes `fetch` an DealSystem (`SEC-004`).
 *
 * Zeiten kommen und gehen in UTC. Zeig sie in der Zeitzone des Besuchers (`groupSlotsByDay`, `visitorTimeZone`)
 * und nenne die des Kalenders (`timezone`) als Hinweis. Zeig bei jedem Fehler außer `validation` den
 * Ausweichkontakt `fallback`; bei `slot_taken` die Zeiten neu laden. Setz `<LeadHoneypot client={termin} />` in
 * die Oberfläche.
 *
 * @example
 * <script lang="ts">
 * 	import { createBookingClient, groupSlotsByDay, visitorTimeZone, LeadHoneypot } from '@dealsystem/site';
 * 	import { onMount } from 'svelte';
 *
 * 	const termin = createBookingClient('erstgespraech');
 * 	const zone = visitorTimeZone();
 * 	let tage = $state<ReturnType<typeof groupSlotsByDay>>([]);
 * 	let start = $state('');
 * 	let vorname = $state('');
 * 	let email = $state('');
 * 	let ergebnis = $state<Awaited<ReturnType<typeof termin.book>> | null>(null);
 *
 * 	onMount(() => {
 * 		termin.slots().then((r) => (tage = r.ok ? groupSlotsByDay(r.slots, zone) : []));
 * 		return () => termin.destroy();
 * 	});
 *
 * 	async function buchen(event: SubmitEvent) {
 * 		event.preventDefault();
 * 		ergebnis = await termin.book({ start, firstName: vorname, email });
 * 	}
 * </script>
 *
 * {#each tage as tag (tag.date)}
 * 	<h3>{tag.long}</h3>
 * 	{#each tag.slots as zeit (zeit.start)}
 * 		<button type="button" aria-pressed={start === zeit.start} onclick={() => ((start = zeit.start), termin.prepare())}>
 * 			{zeit.time}
 * 		</button>
 * 	{/each}
 * {/each}
 * <form onsubmit={buchen}>
 * 	<label for="vorname">Vorname</label>
 * 	<input id="vorname" required bind:value={vorname} />
 * 	<label for="email">E-Mail</label>
 * 	<input id="email" type="email" required bind:value={email} />
 * 	<LeadHoneypot client={termin} />
 * 	<button type="submit" disabled={!start}>Termin buchen</button>
 * </form>
 * {#if ergebnis && !ergebnis.ok}<p role="alert">{ergebnis.message}</p>{/if}
 */
export function createBookingClient<K extends BookingKey>(
	booking: K,
	options: BookingClientOptions = {},
): BookingClient<K> {
	const site = getSiteData();
	const definition = site.bookings?.[booking];
	if (!definition) {
		const known = Object.keys(site.bookings ?? {});
		usageError(
			`${options.caller ?? `createBookingClient("${booking}")`}: Diese Terminbuchung steht nicht unter booking in dealsystem.config.ts. ` +
				(known.length > 0 ? `Vorhanden: ${known.join(', ')}.` : 'Dort ist noch keine eingetragen.'),
		);
	}
	const fallback: LeadFallback = { phone: site.legal.phone || null, email: site.legal.email || null };
	const captcha = createCaptchaSession({ name: `booking-${booking}`, element: options.captchaElement });

	let status = $state<BookingClientStatus>('idle');
	let honeypot = '';
	let loadedInfo: Promise<BookingInfoResult> | null = null;
	/** Je Beginn eine ID: ein neuer Versuch derselben Zeit bucht nicht doppelt, eine andere Zeit ist ein neuer Vorgang. */
	let submission: { start: string; id: string } | null = null;
	let inFlight: Promise<BookingResult> | null = null;

	function failure(
		error: SiteApiError,
		reason?: Exclude<BookingFailureReason, 'validation'>,
	): BookingFailure {
		const own =
			reason ??
			(error.code === 'slot_taken' || error.kind === 'conflict'
				? 'slot_taken'
				: error.code === 'not_qualified'
					? 'not_qualified'
					: error.kind === 'captcha_failed'
						? 'captcha'
						: error.kind === 'rate_limited'
							? 'rate_limited'
							: error.kind === 'network'
								? 'network'
								: 'unavailable');
		const message =
			own === 'slot_taken'
				? MESSAGES.slot_taken
				: own === 'not_qualified'
					? MESSAGES.not_qualified
					: own === 'unavailable' && error.kind === 'not_found'
						? MESSAGES.unavailable
						: error.message;
		return {
			ok: false,
			reason: own,
			message,
			fields: {},
			fallback,
			retryAfterSeconds: error.retryAfterSeconds,
			error: { ...error, message },
		};
	}

	function unavailable(): BookingFailure {
		return failure(apiError('not_found', MESSAGES.unavailable), 'unavailable');
	}

	function validate(
		input: Omit<BookingInput, 'start'>,
		questions: readonly BookingQuestion[] = [],
	): Record<string, string> {
		const found: Record<string, string> = {};
		const first = input.firstName?.trim() ?? '';
		if (!first) found.firstName = 'Bitte geben Sie Ihren Vornamen an.';
		else if (first.length > 100)
			found.firstName = '„Vorname“ ist zu lang. Erlaubt sind höchstens 100 Zeichen.';
		if ((input.lastName?.trim().length ?? 0) > 100)
			found.lastName = '„Nachname“ ist zu lang. Erlaubt sind höchstens 100 Zeichen.';
		const email = input.email?.trim() ?? '';
		if (!email) found.email = 'Bitte geben Sie Ihre E-Mail-Adresse an.';
		else if (!EMAIL.test(email) || email.length > 254)
			found.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.';
		const phone = input.phone?.trim() ?? '';
		if (phone && !PHONE.test(phone))
			found.phone = 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0341 1234567.';
		for (const question of questions) {
			const message = checkAnswer(question, input.answers?.[question.key]);
			if (message) found[`answers.${question.key}`] = message;
		}
		return found;
	}

	function answersOf(input: BookingInput): Record<string, string | number | boolean | string[]> | undefined {
		const out: Record<string, string | number | boolean | string[]> = {};
		for (const [key, value] of Object.entries(input.answers ?? {})) {
			if (value === undefined || isEmpty(value)) continue;
			if (Array.isArray(value)) out[key] = [...value];
			else if (typeof value === 'string') out[key] = value.trim();
			else out[key] = value as number | boolean;
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}

	async function send(input: BookingInput): Promise<BookingResult> {
		if (!definition) return unavailable();
		const loaded = await info();
		const questions = loaded.ok ? loaded.info.questions : [];
		const found = validate(input, questions);
		if (!input.start || Number.isNaN(Date.parse(input.start))) found.start = 'Bitte wählen Sie eine Zeit.';
		if (Object.keys(found).length > 0) {
			return {
				ok: false,
				reason: 'validation',
				message: MESSAGES.validation,
				fields: found,
				fallback: null,
				error: null,
			};
		}
		if (!loaded.ok) return loaded;

		status = 'captcha';
		const payload = await captcha.solution();
		if (!payload) return failure(apiError('captcha_failed', MESSAGES.captcha), 'captcha');

		status = 'sending';
		if (!submission || submission.start !== input.start)
			submission = { start: input.start, id: crypto.randomUUID() };
		const id = submission.id;
		const result = await siteApi().createBooking(String(booking), {
			submissionId: id,
			start: input.start,
			tz: visitorTimeZone(),
			attendee: {
				firstName: input.firstName.trim(),
				...(input.lastName?.trim() ? { lastName: input.lastName.trim() } : {}),
				email: input.email.trim(),
				...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
			},
			answers: answersOf(input),
			...(input.locationType ? { locationType: input.locationType } : {}),
			attribution: buildLeadAttribution(consent.granted(), consent.decidedAt),
			captcha: payload,
			website: honeypot.slice(0, 500),
		});

		if (result.ok) {
			submission = null;
			captcha.clear();
			return {
				ok: true,
				dryRun: result.data.dryRun,
				duplicate: result.data.duplicate,
				start: result.data.start ?? input.start,
				end: result.data.end,
				submissionId: id,
			};
		}

		captcha.consume();
		const error = result.error;
		if (error.kind === 'validation' && error.code !== 'not_qualified') {
			const fields: Record<string, string> = {};
			for (const path of error.invalidPaths) {
				// Text vom Server wird nie angezeigt: eigene Meldung je Feld.
				const [head, name] = path.split('.');
				if (head === 'attendee' && name && (ATTENDEE_FIELDS as readonly string[]).includes(name)) {
					fields[name] = `Bitte prüfen Sie Ihre Angabe bei „${LABELS[name as keyof typeof LABELS]}“.`;
				} else if (head === 'answers' && name) {
					const question = questions.find((q) => q.key === name);
					fields[`answers.${name}`] = `Bitte prüfen Sie Ihre Angabe bei „${question?.label ?? name}“.`;
				} else if (head === 'start') {
					fields.start = 'Bitte wählen Sie eine Zeit.';
				}
			}
			return { ok: false, reason: 'validation', message: MESSAGES.validation, fields, fallback: null, error };
		}
		return failure(error);
	}

	function info(): Promise<BookingInfoResult> {
		if (!definition) return Promise.resolve(unavailable());
		loadedInfo ??= siteApi()
			.getBooking(String(booking))
			.then((r): BookingInfoResult => (r.ok ? { ok: true, info: r.data } : failure(r.error)))
			.then((r) => {
				// Fehler nicht merken: Ein späterer Aufruf versucht es neu.
				if (!r.ok) loadedInfo = null;
				return r;
			});
		return loadedInfo;
	}

	return {
		booking,
		label: definition?.label ?? String(booking),
		fallback,
		get status() {
			return status;
		},
		info,
		async slots(from, to) {
			if (!definition) return unavailable();
			const start = from === undefined ? Date.now() : msOf(from);
			const end = to === undefined ? start + 7 * 86_400_000 : msOf(to);
			if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
				return failure(apiError('rejected', 'Der Zeitraum ist ungültig.'), 'unavailable');
			}
			status = 'loading';
			try {
				const result = await siteApi().getBookingSlots(String(booking), {
					from: isoOf(start),
					to: isoOf(Math.min(end, start + BOOKING_RANGE_MAX_DAYS * 86_400_000)),
				});
				return result.ok
					? { ok: true, timezone: result.data.timezone, slots: result.data.slots }
					: failure(result.error);
			} finally {
				status = 'idle';
			}
		},
		validate,
		prepare() {
			captcha.start();
		},
		setHoneypot(value) {
			honeypot = value;
		},
		book(input) {
			if (inFlight) return inFlight;
			inFlight = send(input).finally(() => {
				inFlight = null;
				status = 'idle';
			});
			return inFlight;
		},
		destroy() {
			captcha.destroy();
		},
	};
}
