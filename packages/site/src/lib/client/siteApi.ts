// Client für die öffentliche Site-API (`/api/site/v1/s/{publishableKey}/…`).
// Grundsatz: Fehler kommen als Daten zurück. Keine Funktion hier wirft, auch
// nicht bei Netzfehlern oder kaputten Antworten.
import { getSiteData } from '../internal/siteData.js';
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
	/** 400, 405, 415: der Server versteht die Anfrage nicht. Ein Fehler im SDK, nicht des Besuchers. */
	| 'rejected'
	/** 404: Formular, Sammlung oder Eintrag gibt es nicht. */
	| 'not_found'
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
}

/** Ergebnis jedes Aufrufs: entweder Daten oder ein Fehler, nie eine Ausnahme. */
export type SiteApiResult<T> = { ok: true; data: T } | { ok: false; error: SiteApiError };

/** First-Touch-Zuordnung einer Anfrage. */
export interface LeadAttribution {
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
	attribution?: LeadAttribution;
	/** Gelöste Captcha-Aufgabe (ALTCHA, base64), 1 bis 16 000 Zeichen. */
	captcha: string;
	/** Honeypot. Echte Besucher lassen das Feld leer. */
	website?: string;
}

export interface LeadAccepted {
	accepted: true;
	/** `true` in der Vorschau: geprüft, aber nicht gespeichert. */
	dryRun: boolean;
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
	extra: Partial<Pick<SiteApiError, 'code' | 'retryAfterSeconds' | 'invalidFields' | 'formInvalid'>> = {},
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
		},
	};
}

function kindOf(status: number, code: string | null): SiteApiErrorKind {
	if (code === 'captcha_failed') return 'captcha_failed';
	if (status === 429) return 'rate_limited';
	if (status === 404) return 'not_found';
	if (status === 403) return 'forbidden';
	if (status === 422) return 'validation';
	if (status >= 500) return 'server';
	return 'rejected';
}

/** Liest `details: [{ path, message }]` eines `validation_error`. Texte des Servers werden nicht übernommen. */
function validationDetails(
	body: Record<string, unknown>,
): Pick<SiteApiError, 'invalidFields' | 'formInvalid'> {
	const invalidFields: string[] = [];
	let formInvalid = false;
	if (Array.isArray(body.details)) {
		for (const detail of body.details) {
			const path = isRecord(detail) ? detail.path : null;
			if (typeof path !== 'string') continue;
			if (path === 'data') formInvalid = true;
			else if (path.startsWith('data.')) {
				// `data.themen.0` gehört zum Feld `themen`.
				const name = path.slice('data.'.length).split('.')[0]!;
				if (name && !invalidFields.includes(name)) invalidFields.push(name);
			}
		}
	}
	return { invalidFields, formInvalid };
}

/** @internal */
export interface SiteApi {
	submitLead(request: LeadRequest): Promise<SiteApiResult<LeadAccepted>>;
	getCollection(
		key: string,
		query?: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' },
	): Promise<SiteApiResult<CollectionPage>>;
	getEntry(key: string, slug: string): Promise<SiteApiResult<RawCollectionEntry>>;
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

		async getCollection(key, query = {}) {
			const params = new URLSearchParams();
			if (query.limit !== undefined) params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
			if (query.offset) params.set('offset', String(Math.max(0, query.offset)));
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
