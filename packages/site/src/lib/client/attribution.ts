// Attribution, Fassung 2 (Phase 2, Paket B1): woher ein Besucher kommt, über Besuche hinweg.
//
// Ohne Einwilligung: nur der aktuelle Besuch, nur im Arbeitsspeicher der geöffneten Seite (UTM, fremder
// Referrer, Einstiegsseite, eigene URL-Parameter). Keine Klick-IDs, keine Besuchs-ID, nichts im Browser-Speicher.
// Mit Einwilligung (siehe `ATTRIBUTION_CONSENT`) zusätzlich `localStorage` `ds-attr`: erster und letzter Besuch,
// Zahl der Besuche, Klick-IDs, Besuchs-ID. Widerruf löscht, was nicht mehr erlaubt ist (TDDDG § 25).
//
// Vertrag mit dem Core: `attribution` im Lead (`v: 2`) und `POST …/track`, Feldnamen und Grenzen wie
// `SELF_SITE_ATTRIBUTION_LIMITS` im Core (`$lib/domain/selfSiteTracking.ts`).
import type { ConsentCategory } from '../consent/consent.svelte.js';

/**
 * Welche Einwilligung was erlaubt. EINE Stelle für die Entscheidungen des Inhabers; jede Angabe gilt, sobald
 * einer der genannten Zwecke erlaubt ist.
 * - `history`: erster und letzter Besuch über Besuche hinweg, eigene Parameter gespeichert
 * - `visitorId`: Besuchsreise (muss zu `SELF_SITE_CONSENT_RULES.visitorId` im Core passen)
 * - `clickIds`: Klick-IDs der Werbenetze, `_fbp` (E-1, Empfehlung a: nur mit Marketing)
 */
export const ATTRIBUTION_CONSENT = {
	history: ['statistics', 'marketing'],
	visitorId: ['marketing'],
	clickIds: ['marketing'],
} as const satisfies Record<string, readonly ConsentCategory[]>;

/** Grenzen des Vertrags (`SELF_SITE_ATTRIBUTION_LIMITS` im Core). */
export const ATTRIBUTION_LIMITS = {
	text: 200,
	host: 255,
	path: 500,
	at: 64,
	clickId: 500,
	paramKey: 64,
	paramValue: 500,
	params: 20,
	touches: 1000,
} as const;

/** So lange gelten gespeicherte Besuche und Klick-IDs (Tage); die Besuchs-ID 13 Monate. */
export const ATTRIBUTION_RETENTION_DAYS = { history: 90, clickIds: 90, visitorId: 395 } as const;
/** Nach so langer Pause zählt ein Aufruf als neuer Besuch, auch ohne neue Kampagne. */
const VISIT_GAP_MS = 30 * 60 * 1000;
const DAY_MS = 86_400_000;

const STORAGE_KEY = 'ds-attr';
/** Fassung 1 lag in `sessionStorage`; wird nicht mehr geschrieben und beim Start entfernt. */
const LEGACY_KEY = 'ds-first-touch';

export type Granted = Record<ConsentCategory, boolean>;

/** Ein Besuch, wie im Vertrag. Nur gefüllte Felder sind gesetzt. */
export interface Touch {
	source?: string;
	medium?: string;
	campaign?: string;
	term?: string;
	content?: string;
	referrerHost?: string;
	landingPath?: string;
	at?: string;
}

export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbc', 'fbp', 'msclkid'] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];
export type ClickIds = Partial<Record<ClickIdKey, string>>;

/** `attribution` im Lead, Fassung 2. */
export interface LeadAttributionV2 {
	v: 2;
	first: Touch | null;
	last: Touch | null;
	touches: number;
	clickIds: ClickIds | null;
	visitorId: string | null;
	params: Record<string, string> | null;
	consent: { statistics: boolean; marketing: boolean; at: string | null };
}

interface Stored {
	v: 2;
	first?: Touch;
	last?: Touch;
	touches?: number;
	/** Letzter Aufruf (ms), für die Erkennung eines neuen Besuchs. */
	seen?: number;
	params?: Record<string, string>;
	clickIds?: Partial<Record<ClickIdKey, { value: string; at: number }>>;
	visitorId?: { id: string; at: number };
}

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
/** URL-Parameter für Klick-IDs. `fbclid` wird zu `fbc` im Meta-Format. */
const CLICK_PARAMS = {
	gclid: 'gclid',
	gbraid: 'gbraid',
	wbraid: 'wbraid',
	fbclid: 'fbc',
	msclkid: 'msclkid',
} as const;
const PARAM_KEY = /^[A-Za-z0-9_.-]{1,64}$/;
/** Eigene Parameter mit diesen Namen gehen nie mit: Sie tragen oft Zugangsdaten oder Personendaten. */
const SENSITIVE_PARAM = /(pass|token|secret|session|auth|key|email|mail|phone|tel|name|code|sig)/i;
const CLICK_ID_VALUE = /^[\x21-\x7e]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex -- Steuerzeichen gehören in keinen Wert
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Der aktuelle Besuch, nur im Arbeitsspeicher. */
interface Visit {
	touch: Touch;
	/** Suchteil der Einstiegsadresse: Klick-IDs werden erst mit Einwilligung daraus gelesen. */
	search: string;
	params: Record<string, string>;
	at: number;
	/** Für Seitenaufrufe: UTM und Referrer nur beim Einstieg. */
	utm: Pick<Touch, (typeof UTM_KEYS)[number]> | null;
}

let visit: Visit | null = null;
let stored: Stored | null = null;

const allows = (granted: Granted, what: keyof typeof ATTRIBUTION_CONSENT) =>
	ATTRIBUTION_CONSENT[what].some((c) => granted[c]);

function clean(value: string | null | undefined, max: number): string | undefined {
	const text = value?.replace(CONTROL, '').trim();
	return text ? text.slice(0, max) : undefined;
}

function referrerHost(): string | undefined {
	try {
		if (!document.referrer) return undefined;
		const host = new URL(document.referrer).host.toLowerCase();
		const own = window.location.host.toLowerCase();
		if (!host || host === own || host === `www.${own}` || `www.${host}` === own) return undefined;
		return host.slice(0, ATTRIBUTION_LIMITS.host);
	} catch {
		return undefined;
	}
}

/** Eigene URL-Parameter: ohne UTM und Klick-IDs, ohne heikle Namen, höchstens 20, Werte gekürzt. */
export function readParams(search: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, raw] of new URLSearchParams(search)) {
		if (Object.keys(out).length >= ATTRIBUTION_LIMITS.params) break;
		if (!PARAM_KEY.test(key) || key.startsWith('utm_') || key in CLICK_PARAMS || key === '_fbp') continue;
		if (SENSITIVE_PARAM.test(key) || key in out) continue;
		const value = clean(raw, ATTRIBUTION_LIMITS.paramValue);
		if (value) out[key] = value;
	}
	return out;
}

/** Klick-IDs aus der Einstiegsadresse. Nur aufrufen, wenn die Einwilligung vorliegt. */
function readClickIds(search: string, at: number): ClickIds {
	const params = new URLSearchParams(search);
	const out: ClickIds = {};
	for (const [param, key] of Object.entries(CLICK_PARAMS)) {
		const raw = params.get(param)?.trim();
		if (!raw || !CLICK_ID_VALUE.test(raw)) continue;
		// Meta: `fb.1.<Zeitpunkt in ms>.<fbclid>`, die fbclid unverändert (Groß- und Kleinschreibung zählt).
		const value = key === 'fbc' ? `fb.1.${at}.${raw}` : raw;
		if (value.length <= ATTRIBUTION_LIMITS.clickId) out[key] = value;
	}
	return out;
}

/** `_fbp` aus dem Cookie des Meta Pixels. Nur mit Einwilligung lesen. */
function readFbp(): string | undefined {
	try {
		const match = /(?:^|;\s*)_fbp=([^;]+)/.exec(document.cookie);
		const value = match?.[1] ? decodeURIComponent(match[1]) : '';
		return value && value.length <= ATTRIBUTION_LIMITS.clickId && CLICK_ID_VALUE.test(value)
			? value
			: undefined;
	} catch {
		return undefined;
	}
}

function readStored(): Stored | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		return typeof parsed === 'object' && parsed !== null && (parsed as Stored).v === 2
			? (parsed as Stored)
			: null;
	} catch {
		return null;
	}
}

function writeStored(value: Stored | null): void {
	try {
		if (value && Object.keys(value).length > 1) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Speicher voll oder gesperrt: es bleibt beim aktuellen Besuch.
	}
}

function forgetLegacy(): void {
	try {
		sessionStorage.removeItem(LEGACY_KEY);
	} catch {
		// nichts zu tun
	}
}

/** Liest den aktuellen Besuch einmal je geöffneter Seite. Ohne Zugriff auf den Browser-Speicher. */
function currentVisit(): Visit {
	if (visit) return visit;
	const url = new URL(window.location.href);
	const at = Date.now();
	const touch: Touch = {};
	const utm: Visit['utm'] = {};
	for (const key of UTM_KEYS) {
		const value = clean(url.searchParams.get(`utm_${key}`), ATTRIBUTION_LIMITS.text);
		if (value) touch[key] = utm[key] = value;
	}
	const host = referrerHost();
	if (host) touch.referrerHost = host;
	touch.landingPath = url.pathname.slice(0, ATTRIBUTION_LIMITS.path);
	touch.at = new Date(at).toISOString();
	visit = {
		touch,
		search: url.search,
		params: readParams(url.search),
		at,
		utm: Object.keys(utm).length > 0 ? utm : null,
	};
	return visit;
}

/** Bringt Kampagne oder Klick-ID mit? Dann zählt der Aufruf immer als neuer Besuch. */
function isCampaign(v: Visit): boolean {
	return Boolean(v.utm || v.touch.referrerHost || Object.keys(readClickIds(v.search, v.at)).length > 0);
}

/**
 * Hält den aktuellen Besuch fest und gleicht den Speicher mit der Einwilligung ab: legt an, was erlaubt ist, und
 * löscht, was nicht (mehr) erlaubt ist. Mehrfach aufrufbar (Start der Seite, jede Änderung der Einwilligung).
 * @internal
 */
export function syncAttribution(granted: Granted): void {
	if (typeof window === 'undefined') return;
	forgetLegacy();
	const v = currentVisit();
	if (!allows(granted, 'history') && !allows(granted, 'visitorId') && !allows(granted, 'clickIds')) {
		stored = null;
		writeStored(null);
		return;
	}
	const now = Date.now();
	const next: Stored = { v: 2, ...(stored ?? readStored() ?? {}) };

	if (allows(granted, 'history')) {
		const lastAt = next.last?.at ? Date.parse(next.last.at) : NaN;
		if (Number.isFinite(lastAt) && now - lastAt > ATTRIBUTION_RETENTION_DAYS.history * DAY_MS) {
			delete next.first;
			delete next.last;
			delete next.touches;
			delete next.params;
		}
		// Gezählt wird der Besuch einmal: beim ersten Abgleich dieser geöffneten Seite.
		const counted = stored !== null;
		if (!counted) {
			const fresh = !next.seen || now - next.seen > VISIT_GAP_MS || isCampaign(v);
			if (fresh) {
				next.first ??= v.touch;
				next.last = v.touch;
				next.touches = Math.min(ATTRIBUTION_LIMITS.touches, (next.touches ?? 0) + 1);
			} else {
				next.first ??= v.touch;
				next.last ??= v.touch;
				next.touches ??= 1;
			}
			if (Object.keys(v.params).length > 0) next.params = v.params;
		}
		next.seen = now;
	} else {
		delete next.first;
		delete next.last;
		delete next.touches;
		delete next.seen;
		delete next.params;
	}

	if (allows(granted, 'clickIds')) {
		const ids: NonNullable<Stored['clickIds']> = {};
		for (const [key, entry] of Object.entries(next.clickIds ?? {}) as [
			ClickIdKey,
			{ value: string; at: number },
		][]) {
			if (entry && now - entry.at <= ATTRIBUTION_RETENTION_DAYS.clickIds * DAY_MS) ids[key] = entry;
		}
		// Die neueste Klick-ID je Netz gewinnt.
		for (const [key, value] of Object.entries(readClickIds(v.search, v.at)) as [ClickIdKey, string][]) {
			if (ids[key]?.value !== value) ids[key] = { value, at: v.at };
		}
		const fbp = readFbp();
		if (fbp) ids.fbp = { value: fbp, at: now };
		if (Object.keys(ids).length > 0) next.clickIds = ids;
		else delete next.clickIds;
	} else {
		delete next.clickIds;
	}

	if (allows(granted, 'visitorId')) {
		const valid =
			next.visitorId &&
			UUID.test(next.visitorId.id) &&
			now - next.visitorId.at <= ATTRIBUTION_RETENTION_DAYS.visitorId * DAY_MS;
		if (!valid) next.visitorId = { id: crypto.randomUUID(), at: now };
	} else {
		delete next.visitorId;
	}

	stored = next;
	writeStored(next);
}

/** Besuchs-ID, wenn erlaubt und angelegt. @internal */
export function getVisitorId(granted: Granted): string | null {
	return allows(granted, 'visitorId') ? (stored?.visitorId?.id ?? null) : null;
}

/** UTM und Referrer des aktuellen Besuchs, für den Seitenaufruf beim Einstieg. @internal */
export function getEntry(): { utm: Visit['utm']; referrerHost: string | null } {
	if (typeof window === 'undefined') return { utm: null, referrerHost: null };
	const v = currentVisit();
	return { utm: v.utm, referrerHost: v.touch.referrerHost ?? null };
}

/**
 * Wert eines eigenen URL-Parameters, z. B. `partner` aus `?partner=…`: aus dem aktuellen Besuch, sonst (nur mit
 * Einwilligung) aus dem zuletzt gespeicherten. `null`, wenn es ihn nicht gibt. Nur im Browser.
 *
 * Nicht gelesen werden UTM-Parameter, Klick-IDs und Namen, die nach Zugangs- oder Personendaten aussehen
 * (`email`, `token`, `session` …); höchstens 20 Parameter, Werte bis 500 Zeichen. Mit der Anfrage gehen die
 * Parameter ohnehin an das CRM (`<LeadForm>`), dafür ist nichts zu tun.
 *
 * @example
 * <script lang="ts">
 * 	import { getCampaignParam } from '@dealsystem/site';
 * 	import { onMount } from 'svelte';
 * 	let partner = $state<string | null>(null);
 * 	onMount(() => (partner = getCampaignParam('partner')));
 * </script>
 */
export function getCampaignParam(name: string): string | null {
	if (typeof window === 'undefined') return null;
	return currentVisit().params[name] ?? stored?.params?.[name] ?? null;
}

/**
 * `attribution` für den Lead (Fassung 2). Ohne Einwilligung nur der aktuelle Besuch, ohne Klick-IDs und
 * Besuchs-ID.
 * @internal
 */
export function buildLeadAttribution(
	granted: Granted,
	consentAt: string | null,
): LeadAttributionV2 | undefined {
	if (typeof window === 'undefined') return undefined;
	const v = currentVisit();
	const history = allows(granted, 'history') && stored;
	const clickIds: ClickIds = {};
	if (allows(granted, 'clickIds')) {
		for (const [key, entry] of Object.entries(stored?.clickIds ?? {}) as [ClickIdKey, { value: string }][]) {
			clickIds[key] = entry.value;
		}
		// Falls der Speicher gesperrt ist: wenigstens die Klick-IDs dieses Besuchs.
		for (const [key, value] of Object.entries(readClickIds(v.search, v.at)) as [ClickIdKey, string][]) {
			clickIds[key] ??= value;
		}
	}
	const params = { ...(history ? stored!.params : undefined), ...v.params };
	return {
		v: 2,
		first: (history && stored!.first) || v.touch,
		last: (history && stored!.last) || v.touch,
		touches: (history && stored!.touches) || 1,
		clickIds: Object.keys(clickIds).length > 0 ? clickIds : null,
		visitorId: getVisitorId(granted),
		params: Object.keys(params).length > 0 ? params : null,
		consent: { statistics: granted.statistics, marketing: granted.marketing, at: consentAt },
	};
}

/** @internal Nur für Tests. */
export function resetAttributionForTests(): void {
	visit = null;
	stored = null;
}
