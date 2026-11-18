// Client für die öffentliche Site-API (`/api/site/v1/s/{publishableKey}/…`).
// Grundsatz: Fehler kommen als Daten zurück. Keine Funktion hier wirft, auch
// nicht bei Netzfehlern oder kaputten Antworten.
import { getSiteData } from '../internal/siteData.js';
import type { LeadAttributionV2, Touch } from './attribution.js';
import { normalizeEntry } from '../snapshot.js';
import type { RawCollectionEntry } from '../types.js';

/** Art eines Fehlers der Site-API, zum Verzweigen in der Oberfläche. */
export type SiteApiErrorKind =
	/** Keine Verbindung, Abbruch oder Zeitüberschreitung. */
	| 'network'
	/** 429: zu viele Anfragen. */
	| 'rate_limited'
	/** 422 `validation_error`: Eingaben abgelehnt, siehe `invalidFields` und `formInvalid`. */
	| 'validation'
	/** 400 `captcha_failed`. */
	| 'captcha_failed'
	/** 400, 405, 413, 415: der Server nimmt die Anfrage so nicht an (z. B. `payload_too_large`). */
	| 'rejected'
	/** 404: Formular, Sammlung, Eintrag oder Buchung gibt es nicht (oder sie ist ausgeschaltet). */
	| 'not_found'
	/** 409 `slot_taken`: Die Zeit ist inzwischen vergeben. Freie Zeiten neu laden. */
	| 'conflict'
	/** 410 `appointment_closed`: Der Termin hat begonnen oder ist vorbei. */
	| 'gone'
	/** 403: die Seite darf von dieser Adresse aus nicht anfragen. */
	| 'forbidden'
	/** 5xx, auch `captcha_unavailable` (503). */
	| 'server'
	/** Antwort hat nicht die vereinbarte Form. */
	| 'invalid_response';

/** Ein Fehler der Site-API als Wert. */
export interface SiteApiError {
	kind: SiteApiErrorKind;
	/** HTTP-Status, `null` bei Netzfehlern. */
	status: number | null;
	/** Fehlercode des Servers, z. B. `funnel_not_found`. */
	code: string | null;
	/** Text für Besucher, auf Deutsch. Nie Text vom Server. */
	message: string;
	/** Bei `rate_limited`: frühester neuer Versuch in Sekunden. */
	retryAfterSeconds: number | null;
	/** Bei `validation`: Namen der abgelehnten Felder (`details[].path` ohne `data.`). */
	invalidFields: string[];
	/** Bei `validation`: das Formular als Ganzes ist abgelehnt (`path: "data"`), z. B. weil E-Mail und Telefon fehlen. */
	formInvalid: boolean;
	/** Bei `validation`: alle abgelehnten Pfade wie gemeldet, z. B. `attendee.email` oder `answers.anliegen`. */
	invalidPaths: string[];
}

/** Ergebnis jedes Aufrufs: entweder Daten oder ein Fehler, nie eine Ausnahme. */
export type SiteApiResult<T> = { ok: true; data: T } | { ok: false; error: SiteApiError };

/** Fassung 1 der Zuordnung (flach, ältere SDKs). Der Core nimmt sie weiter an. */
export interface LeadAttributionV1 {
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmTerm?: string;
	utmContent?: string;
	referrerHost?: string;
	capturedAt?: string;
}

/** Body von `POST …/leads`. */
export interface LeadRequest {
	funnelKey: string;
	/** UUID je Einsendung. Derselbe Wert bei einem neuen Versuch verhindert Doppel. */
	submissionId: string;
	data: Record<string, string | string[] | boolean>;
	/** Herkunft (Fassung 2). Ohne Einwilligung nur der aktuelle Besuch. */
	attribution?: LeadAttributionV2 | LeadAttributionV1;
	/** Gelöste Captcha-Aufgabe (ALTCHA v3): base64 von `{ challenge, solution }`, höchstens 4 000 Zeichen. */
	captcha: string;
	/** Honeypot. Echte Besucher lassen das Feld leer. */
	website?: string;
}

export interface LeadAccepted {
	accepted: true;
	/** `true` in der Vorschau: geprüft, aber nicht gespeichert. */
	dryRun: boolean;
}

/** Body von `POST …/track` (Seitenaufruf). */
export interface PageviewRequest {
	/** `location.pathname`. */
	path: string;
	/** Erster Seitenaufruf der geöffneten Seite: nur dann zählen `utm` und `referrerHost`. */
	landing?: boolean;
	referrerHost?: string | null;
	utm?: Pick<Touch, 'source' | 'medium' | 'campaign' | 'term' | 'content'> | null;
	/** Nur mit Einwilligung (siehe `ATTRIBUTION_CONSENT.visitorId`). */
	visitorId?: string | null;
	consent?: { statistics: boolean; marketing: boolean; at: string | null };
}

/** Ort-Art eines Termins. Adresse, Telefonnummer oder Link nennt erst die Bestätigung. */
export type BookingLocationType = 'google_meet' | 'in_person' | 'phone' | 'link';

/** Eine Buchungsfrage der Terminart. Antworten gehen unter `answers[key]` mit. */
export interface BookingQuestion {
	key: string;
	label: string;
	/** `text`, `textarea`, `number`, `boolean`, `select`, `multiselect`, `date`, `email`, `phone`; Unbekanntes wie `text`. */
	type: string;
	required: boolean;
	options: string[] | null;
	placeholder: string | null;
}

/** Antwort von `GET …/booking/{bookingKey}`. */
export interface BookingInfo {
	key: string;
	/** Bezeichnung aus dem Code, sonst der Name der Terminart. */
	label: string;
	/** Name der Terminart im CRM. */
	title: string;
	description: string | null;
	durationMinutes: number;
	/** IANA-Zeitzone des Kalenders, z. B. `Europe/Berlin`. */
	timezone: string;
	locations: { type: BookingLocationType; label: string }[];
	questions: BookingQuestion[];
	/**
	 * Reihenfolge im CRM: `calendar_first` (erst Zeit, dann Angaben) oder `contact_first` (erst Angaben und
	 * Fragen, dann Zeit). Fehlt das Feld, gilt `calendar_first`.
	 */
	flow: BookingFlow;
}

/** Reihenfolge der Buchung, eingestellt an der Terminart im CRM. */
export type BookingFlow = 'calendar_first' | 'contact_first';

/** Ein freier Termin, Zeiten in UTC (`…Z`). */
export interface BookingSlot {
	start: string;
	end: string;
}

/** Antwort von `GET …/booking/{bookingKey}/slots`. */
export interface BookingSlots {
	/** IANA-Zeitzone des Kalenders. */
	timezone: string;
	from: string;
	to: string;
	slots: BookingSlot[];
}

/** Body von `POST …/booking/{bookingKey}/bookings`. */
export interface BookingRequest {
	/** UUID je Buchungsvorgang. Dieselbe ID wird innerhalb von 24 h nur einmal gebucht. */
	submissionId: string;
	/** Beginn, genau `start` aus `…/slots`. */
	start: string;
	/** IANA-Zeitzone des Besuchers, für die Zeiten in der Bestätigung. */
	tz: string;
	attendee: { firstName: string; lastName?: string; email: string; phone?: string };
	answers?: Record<string, string | number | boolean | string[]>;
	locationType?: BookingLocationType;
	attribution?: LeadAttributionV2 | LeadAttributionV1;
	captcha: string;
	website?: string;
}

/** Antwort von `POST …/booking/{bookingKey}/bookings`. */
export interface BookingConfirmed {
	booked: true;
	/** Vorschau: geprüft, nichts gebucht, keine Mail. */
	dryRun: boolean;
	/** Dieselbe `submissionId` war schon gebucht (z. B. doppelt abgeschickt). */
	duplicate: boolean;
	start: string | null;
	end: string | null;
}

/** Antwort von `POST …/booking/{bookingKey}/qualify` (bei `contact_first` vor der Zeitwahl). */
export type BookingQualification =
	| { qualified: true }
	| {
			qualified: false;
			/** Überschrift für Besucher aus der Regel im CRM. */
			headline: string | null;
			/** Text für Besucher aus der Regel im CRM. */
			message: string | null;
	  };

const LOCATION_TYPES: readonly BookingLocationType[] = ['google_meet', 'in_person', 'phone', 'link'];

function str(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

/** Liest die Terminart defensiv: Unbekanntes fällt weg, nie eine Ausnahme. */
function normalizeBookingInfo(raw: unknown): BookingInfo | null {
	if (!isRecord(raw)) return null;
	const key = str(raw.key);
	const timezone = str(raw.timezone);
	const duration = raw.durationMinutes;
	if (!key || !timezone || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0)
		return null;
	const locations = Array.isArray(raw.locations)
		? raw.locations.flatMap((l) =>
				isRecord(l) && LOCATION_TYPES.includes(l.type as BookingLocationType) && typeof l.label === 'string'
					? [{ type: l.type as BookingLocationType, label: l.label }]
					: [],
			)
		: [];
	const questions = Array.isArray(raw.questions)
		? raw.questions.flatMap((q): BookingQuestion[] => {
				if (!isRecord(q) || typeof q.key !== 'string' || typeof q.label !== 'string') return [];
				return [
					{
						key: q.key,
						label: q.label,
						type: str(q.type) ?? 'text',
						required: q.required === true,
						options: Array.isArray(q.options)
							? q.options.filter((o): o is string => typeof o === 'string')
							: null,
						placeholder: str(q.placeholder),
					},
				];
			})
		: [];
	return {
		key,
		label: str(raw.label) ?? str(raw.title) ?? key,
		title: str(raw.title) ?? key,
		description: str(raw.description),
		durationMinutes: duration,
		timezone,
		locations,
		questions,
		flow: raw.flow === 'contact_first' ? 'contact_first' : 'calendar_first',
	};
}

function isInstant(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export interface CollectionPage {
	entries: RawCollectionEntry[];
	/** Gesamtzahl laut Server, `null` wenn nicht genannt. */
	total: number | null;
}

export interface SiteApiOptions {
	/** Basis-URL des Core, z. B. `https://app.dealsystem.io`. Leer = gleiche Adresse (Entwicklung). */
	baseUrl: string;
	siteKey: string;
	fetch?: typeof fetch;
	timeoutMs?: number;
}

const MESSAGES: Record<SiteApiErrorKind, string> = {
	network:
		'Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
	rate_limited: 'Im Moment gehen zu viele Anfragen ein. Bitte versuchen Sie es in ein paar Minuten erneut.',
	validation: 'Bitte prüfen Sie Ihre Angaben.',
	captcha_failed: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
	rejected: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
	not_found: 'Der angefragte Inhalt ist nicht verfügbar.',
	conflict: 'Diese Zeit ist leider nicht mehr frei. Bitte wählen Sie eine andere.',
	gone: 'Dieser Termin hat bereits begonnen oder ist vorbei.',
	forbidden: 'Die Anfrage wurde abgelehnt.',
	server: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
	invalid_response: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(
	kind: SiteApiErrorKind,
	status: number | null,
	extra: Partial<
		Pick<SiteApiError, 'code' | 'retryAfterSeconds' | 'invalidFields' | 'formInvalid' | 'invalidPaths'>
	> = {},
): { ok: false; error: SiteApiError } {
	return {
		ok: false,
		error: {
			kind,
			status,
			code: extra.code ?? null,
			message: MESSAGES[kind],
			retryAfterSeconds: extra.retryAfterSeconds ?? null,
			invalidFields: extra.invalidFields ?? [],
			formInvalid: extra.formInvalid ?? false,
			invalidPaths: extra.invalidPaths ?? [],
		},
	};
}

function kindOf(status: number, code: string | null): SiteApiErrorKind {
	if (code === 'captcha_failed') return 'captcha_failed';
	if (status === 429) return 'rate_limited';
	if (status === 404) return 'not_found';
	if (status === 409) return 'conflict';
	if (status === 410) return 'gone';
	if (status === 403) return 'forbidden';
	if (status === 422) return 'validation';
	if (status >= 500) return 'server';
	return 'rejected';
}

/** Liest `details: [{ path, message }]` eines `validation_error`. Texte des Servers werden nicht übernommen. */
function validationDetails(
	body: Record<string, unknown>,
): Pick<SiteApiError, 'invalidFields' | 'formInvalid' | 'invalidPaths'> {
	const invalidFields: string[] = [];
	const invalidPaths: string[] = [];
	let formInvalid = false;
	if (Array.isArray(body.details)) {
		for (const detail of body.details) {
			const path = isRecord(detail) ? detail.path : null;
			if (typeof path !== 'string') continue;
			if (!invalidPaths.includes(path) && invalidPaths.length < 100) invalidPaths.push(path.slice(0, 200));
			if (path === 'data') formInvalid = true;
			else if (path.startsWith('data.')) {
				// `data.themen.0` gehört zum Feld `themen`.
				const name = path.slice('data.'.length).split('.')[0]!;
				if (name && !invalidFields.includes(name)) invalidFields.push(name);
			}
		}
	}
	return { invalidFields, formInvalid, invalidPaths };
}

/** @internal */
export interface SiteApi {
	submitLead(request: LeadRequest): Promise<SiteApiResult<LeadAccepted>>;
	/** Seitenaufruf melden. Fehler sind egal: Gezählt wird, was ankommt. */
	track(request: PageviewRequest): Promise<SiteApiResult<{ accepted: true; dryRun: boolean }>>;
	getCollection(
		key: string,
		query?: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' },
	): Promise<SiteApiResult<CollectionPage>>;
	getEntry(key: string, slug: string): Promise<SiteApiResult<RawCollectionEntry>>;
	getBooking(bookingKey: string): Promise<SiteApiResult<BookingInfo>>;
	/** Freie Zeiten zwischen `from` und `to` (ISO, höchstens 31 Tage). */
	getBookingSlots(
		bookingKey: string,
		range: { from: string; to: string },
	): Promise<SiteApiResult<BookingSlots>>;
	createBooking(bookingKey: string, request: BookingRequest): Promise<SiteApiResult<BookingConfirmed>>;
	/** Passen die Antworten zur Terminart? Schreibt nichts. */
	qualifyBooking(
		bookingKey: string,
		request: { answers?: BookingRequest['answers'] },
	): Promise<SiteApiResult<BookingQualification>>;
}

/**
 * Baut einen Client für die Site-API.
 * @internal Seiten nutzen `<LeadForm>`, `loadCollection()` und `loadEntry()`.
 */
export function createSiteApi(options: SiteApiOptions): SiteApi {
	const base = `${options.baseUrl.replace(/\/+$/, '')}/api/site/v1/s/${encodeURIComponent(options.siteKey)}`;
	const timeoutMs = options.timeoutMs ?? 15_000;

	async function request(path: string, init: RequestInit): Promise<SiteApiResult<Record<string, unknown>>> {
		const doFetch = options.fetch ?? globalThis.fetch;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let response: Response;
		let body: unknown;
		try {
			response = await doFetch(base + path, {
				...init,
				credentials: 'omit',
				signal: controller.signal,
			});
			const text = await response.text();
			try {
				body = text ? JSON.parse(text) : null;
			} catch {
				body = null;
			}
		} catch {
			return fail('network', null);
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			const record = isRecord(body) ? body : {};
			const code = typeof record.code === 'string' ? record.code : null;
			const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
			return fail(kindOf(response.status, code), response.status, {
				code,
				retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
				...validationDetails(record),
			});
		}
		if (!isRecord(body)) return fail('invalid_response', response.status);
		return { ok: true, data: body };
	}

	return {
		async submitLead(lead) {
			const send = () =>
				request('/leads', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(lead),
				});
			let result = await send();
			// `internal_error` darf mit derselben submissionId wiederholt werden: einmal, automatisch.
			if (!result.ok && result.error.status === 500 && result.error.code === 'internal_error') {
				result = await send();
			}
			if (!result.ok) return result;
			const data = result.data.data;
			// Nie ein Erfolg ohne ausdrückliches `accepted: true`.
			if (!isRecord(data) || data.accepted !== true) return fail('invalid_response', 200);
			return { ok: true, data: { accepted: true, dryRun: data.dryRun === true } };
		},

		async track(pageview) {
			const result = await request('/track', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(pageview),
				// Auch beim Verlassen der Seite noch zustellen.
				keepalive: true,
			});
			if (!result.ok) return result;
			const data = result.data.data;
			if (!isRecord(data) || data.accepted !== true) return fail('invalid_response', 200);
			return { ok: true, data: { accepted: true, dryRun: data.dryRun === true } };
		},

		async getCollection(key, query = {}) {
			const params = new URLSearchParams();
			// Der Server liefert ohne Angabe 20 Einträge und höchstens 100 je Abruf.
			if (query.limit !== undefined) {
				params.set('limit', String(Math.min(100, Math.max(1, Math.floor(query.limit)))));
			}
			if (query.offset) params.set('offset', String(Math.min(10_000, Math.max(0, Math.floor(query.offset)))));
			if (query.sort) params.set('sort', query.sort === 'oldest' ? 'publishedAt' : '-publishedAt');
			const search = params.toString();
			const result = await request(`/collections/${encodeURIComponent(key)}${search ? `?${search}` : ''}`, {
				method: 'GET',
			});
			if (!result.ok) return result;
			if (!Array.isArray(result.data.data)) return fail('invalid_response', 200);
			const meta = isRecord(result.data.meta) ? result.data.meta : {};
			return {
				ok: true,
				data: {
					entries: result.data.data.map(normalizeEntry).filter((e): e is RawCollectionEntry => e !== null),
					total: typeof meta.total === 'number' ? meta.total : null,
				},
			};
		},

		async getBooking(bookingKey) {
			const result = await request(`/booking/${encodeURIComponent(bookingKey)}`, { method: 'GET' });
			if (!result.ok) return result;
			const info = normalizeBookingInfo(result.data.data);
			return info ? { ok: true, data: info } : fail('invalid_response', 200);
		},

		async getBookingSlots(bookingKey, range) {
			const params = new URLSearchParams({ from: range.from, to: range.to });
			const result = await request(`/booking/${encodeURIComponent(bookingKey)}/slots?${params}`, {
				method: 'GET',
			});
			if (!result.ok) return result;
			const data = result.data.data;
			if (!isRecord(data) || typeof data.timezone !== 'string' || !Array.isArray(data.slots)) {
				return fail('invalid_response', 200);
			}
			const slots = data.slots
				.flatMap((slot) =>
					isRecord(slot) && isInstant(slot.start) && isInstant(slot.end)
						? [{ start: slot.start, end: slot.end }]
						: [],
				)
				.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
			return {
				ok: true,
				data: {
					timezone: data.timezone,
					from: str(data.from) ?? range.from,
					to: str(data.to) ?? range.to,
					slots,
				},
			};
		},

		async qualifyBooking(bookingKey, body) {
			const result = await request(`/booking/${encodeURIComponent(bookingKey)}/qualify`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body.answers ? { answers: body.answers } : {}),
			});
			if (!result.ok) return result;
			const data = result.data.data;
			if (!isRecord(data) || typeof data.qualified !== 'boolean') return fail('invalid_response', 200);
			return {
				ok: true,
				data: data.qualified
					? { qualified: true }
					: { qualified: false, headline: str(data.headline), message: str(data.message) },
			};
		},

		async createBooking(bookingKey, booking) {
			const send = () =>
				request(`/booking/${encodeURIComponent(bookingKey)}/bookings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(booking),
				});
			let result = await send();
			// Wie bei Leads: `internal_error` einmal mit derselben submissionId wiederholen (gebucht wird nur einmal).
			if (!result.ok && result.error.status === 500 && result.error.code === 'internal_error') {
				result = await send();
			}
			if (!result.ok) return result;
			const data = result.data.data;
			// Nie ein Erfolg ohne ausdrückliches `booked: true`.
			if (!isRecord(data) || data.booked !== true) return fail('invalid_response', 200);
			return {
				ok: true,
				data: {
					booked: true,
					dryRun: data.dryRun === true,
					duplicate: data.duplicate === true,
					start: isInstant(data.start) ? data.start : null,
					end: isInstant(data.end) ? data.end : null,
				},
			};
		},

		async getEntry(key, slug) {
			const result = await request(`/collections/${encodeURIComponent(key)}/${encodeURIComponent(slug)}`, {
				method: 'GET',
			});
			if (!result.ok) return result;
			const entry = normalizeEntry(result.data.data);
			return entry ? { ok: true, data: entry } : fail('invalid_response', 200);
		},
	};
}

/** @internal Adresse, von der das Formular seine Captcha-Aufgabe holt. */
export function captchaChallengeUrl(): string {
	const { api } = getSiteData();
	return `${api.baseUrl.replace(/\/+$/, '')}/api/site/v1/s/${encodeURIComponent(api.siteKey)}/captcha`;
}

/** @internal Client mit den Zugangsdaten der Seite aus dem Build. */
export function siteApi(): SiteApi {
	const { api } = getSiteData();
	return createSiteApi({ baseUrl: api.baseUrl, siteKey: api.siteKey });
}
