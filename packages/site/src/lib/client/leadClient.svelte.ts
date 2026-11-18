// Einsendung eines Formulars ohne eigenes `fetch`: für eigene Oberflächen (mehrstufige Funnels, Rechner, Quiz)
// und intern für `<LeadForm>`. Eine Implementierung für beides: Prüfung, Captcha (ALTCHA, gelöst im Web Worker,
// ohne sichtbares Widget), versteckte Felder, Attribution, Honeypot, `submissionId`, Ereignis-ID für Pixel und
// gtag. Fehler kommen als Werte mit deutschem Text für Besucher zurück, nie als Ausnahme.
import { buildLeadAttribution, getCampaignParam, getCampaignUtm } from './attribution.js';
import { captchaAdapter, type CaptchaHandle } from './captcha.js';
import { captchaChallengeUrl, siteApi, type SiteApiError } from './siteApi.js';
import { reportLeadConversion } from './tracking.js';
import { labelOf, toLeadData, validateField, type FieldValue } from './validation.js';
import { consent } from '../consent/consent.svelte.js';
import { getSiteData } from '../internal/siteData.js';
import { usageError } from '../internal/usage.js';
import type { FunnelFieldDef, FunnelKey, LeadValues } from '../types.js';

/** Ausweichkontakt aus den Firmendaten im CRM. Leere Angaben sind `null`. Zeig ihn bei jedem Fehler außer `validation`. */
export interface LeadFallback {
	phone: string | null;
	email: string | null;
}

/** Warum eine Einsendung nicht angekommen ist. */
export type LeadFailureReason =
	/** Angaben fehlen oder passen nicht: `fields` nennt je Feld den Text, `message` den für das ganze Formular. */
	| 'validation'
	/** Die Sicherheitsprüfung (Captcha) ließ sich nicht durchführen. */
	| 'captcha'
	/** Zu viele Anfragen; `retryAfterSeconds` sagt, wann es wieder geht. */
	| 'rate_limited'
	/** Keine Verbindung. */
	| 'network'
	/** Formular abgeschaltet, Server gestört oder Antwort unbrauchbar. */
	| 'unavailable';

/** Ergebnis von `submit()`. */
export type LeadResult =
	| {
			ok: true;
			/** `true` in der Vorschau: geprüft, aber nicht gespeichert. Zeig dann einen Hinweis. */
			dryRun: boolean;
			submissionId: string;
	  }
	| {
			ok: false;
			reason: 'validation';
			/** Text für Besucher, auf Deutsch. */
			message: string;
			/** Je abgelehntem Feld ein Text, z. B. `{ email: 'Bitte geben Sie …' }`. */
			fields: Record<string, string>;
			fallback: null;
			/** @internal Fehler der Site-API, wenn der Server abgelehnt hat. */
			error: SiteApiError | null;
	  }
	| {
			ok: false;
			reason: Exclude<LeadFailureReason, 'validation'>;
			message: string;
			fields: Record<string, never>;
			/** Telefon und E-Mail aus dem CRM. Zeig sie, damit der Besucher trotzdem anfragen kann. */
			fallback: LeadFallback;
			retryAfterSeconds: number | null;
			/** @internal */
			error: SiteApiError;
	  };

/** Was der Client gerade tut, reaktiv. `captcha`: wartet auf die Sicherheitsprüfung; `sending`: sendet. */
export type LeadClientStatus = 'idle' | 'captcha' | 'sending';

export interface LeadClientOptions {
	/** Element für das unsichtbare Captcha. Standard: ein verstecktes Element am Ende von `<body>`. @internal */
	captchaElement?: () => HTMLElement | null;
	/** Wie der Aufruf in Fehlermeldungen heißt. @internal */
	caller?: string;
}

/** Ein Client für ein Formular aus `dealsystem.config.ts`. */
export interface LeadClient<K extends string = string> {
	readonly funnel: K;
	/** Beschriftung des Formulars aus `dealsystem.config.ts`. */
	readonly label: string;
	/** `false`, wenn das Formular fehlt oder im CRM ausgeschaltet ist: zeig dann den Ausweichkontakt. */
	readonly available: boolean;
	/** Die sichtbaren Felder in der Reihenfolge der Konfiguration (ohne `hidden`). */
	readonly fields: readonly FunnelFieldDef[];
	readonly fallback: LeadFallback;
	/** Was der Client gerade tut (reaktiv), z. B. für „Die Sicherheitsprüfung läuft“. */
	readonly status: LeadClientStatus;
	/** Ein sichtbares Feld nach Namen. */
	field(name: string): FunnelFieldDef | undefined;
	/** Startet die Sicherheitsprüfung im Hintergrund. Beim ersten Schritt aufrufen; mehrfach aufrufbar. */
	prepare(): void;
	/**
	 * Prüft Werte wie der Server. Mit `only` nur diese Felder (ein Schritt eines Funnels). Leeres Objekt = alles in
	 * Ordnung, sonst je Feld ein Text für Besucher.
	 */
	validate(values: LeadValues<K>, only?: readonly string[]): Record<string, string>;
	/** Wert der Bot-Falle (`<LeadHoneypot>`). Echte Besucher lassen sie leer. */
	setHoneypot(value: string): void;
	/**
	 * Sendet die Anfrage. Wartet auf die Sicherheitsprüfung, hängt versteckte Felder, Herkunft und Einwilligung an
	 * und wiederholt bei einem Serverfehler einmal. Läuft schon eine Einsendung, gibt es deren Ergebnis zurück.
	 */
	submit(values: LeadValues<K>): Promise<LeadResult>;
	/** Räumt das Captcha ab. In `onMount` als Rückgabe verwenden. */
	destroy(): void;
}

const CAPTCHA_TIMEOUT_MS = 60_000;
const HIDDEN_MAX = 500;

const MESSAGES = {
	validation: 'Bitte prüfen Sie Ihre Angaben.',
	reachable: 'Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an.',
	captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuchen Sie es später erneut.',
	unavailable: 'Dieses Formular ist zurzeit nicht verfügbar.',
} as const;

function captchaError(): SiteApiError {
	return {
		kind: 'captcha_failed',
		status: null,
		code: null,
		message: MESSAGES.captcha,
		retryAfterSeconds: null,
		invalidFields: [],
		formInvalid: false,
	};
}

function reasonOf(error: SiteApiError): Exclude<LeadFailureReason, 'validation'> {
	if (error.kind === 'captcha_failed') return 'captcha';
	if (error.kind === 'rate_limited') return 'rate_limited';
	if (error.kind === 'network') return 'network';
	return 'unavailable';
}

/**
 * Formular ohne `<LeadForm>`: für eigene Oberflächen wie mehrstufige Funnels. Nimmt den Schlüssel aus
 * `dealsystem.config.ts`. Kein eigenes `fetch` an DealSystem, das ist verboten (`SEC-004`).
 *
 * Zeig bei jedem Fehler außer `validation` den Ausweichkontakt `res.fallback` (`QUA-008`) und
 * setz `<LeadHoneypot client={lead} />` in die Oberfläche (Bot-Falle).
 *
 * @example
 * <script lang="ts">
 * 	import { createLeadClient, LeadHoneypot } from '@dealsystem/site';
 * 	import { onMount } from 'svelte';
 *
 * 	const lead = createLeadClient('bewertung');
 * 	onMount(() => () => lead.destroy());
 * 	let email = $state('');
 * 	let result = $state<Awaited<ReturnType<typeof lead.submit>> | null>(null);
 *
 * 	// Eigenes <form>: Enter sendet, der Browser prüft `required`. Ohne `action`, Absenden nur hier (SEC-007).
 * 	async function senden(event: SubmitEvent) {
 * 		event.preventDefault();
 * 		result = await lead.submit({ email });
 * 	}
 * </script>
 *
 * <form onsubmit={senden}>
 * 	<label for="email">E-Mail</label>
 * 	<input id="email" type="email" autocomplete="email" required bind:value={email} onfocus={() => lead.prepare()} />
 * 	<LeadHoneypot client={lead} />
 * 	<button type="submit">Senden</button>
 * </form>
 * {#if result && !result.ok}
 * 	<p role="alert">{result.message}</p>
 * 	{#if result.fallback?.phone}<a href="tel:{result.fallback.phone}">{result.fallback.phone}</a>{/if}
 * {/if}
 */
export function createLeadClient<K extends FunnelKey>(
	funnel: K,
	options: LeadClientOptions = {},
): LeadClient<K> {
	const site = getSiteData();
	const definition = site.funnels[funnel];
	if (!definition) {
		const known = Object.keys(site.funnels);
		usageError(
			`${options.caller ?? `createLeadClient("${funnel}")`}: Dieses Formular steht nicht in dealsystem.config.ts. ` +
				(known.length > 0 ? `Vorhanden: ${known.join(', ')}.` : 'Dort ist noch kein Formular eingetragen.'),
		);
	}
	const allFields = definition?.fields ?? [];
	const visible = allFields.filter((f) => f.type !== 'hidden');
	const hidden = allFields.filter((f) => f.type === 'hidden');
	const fallback: LeadFallback = { phone: site.legal.phone || null, email: site.legal.email || null };

	let status = $state<LeadClientStatus>('idle');
	let honeypot = '';
	/** Bleibt über neue Versuche gleich, damit der Server Doppel erkennt; nach Erfolg neu. */
	let submissionId = '';
	let inFlight: Promise<LeadResult> | null = null;

	// --- Captcha ------------------------------------------------------------------------------------------
	type CaptchaState = 'idle' | 'loading' | 'solving' | 'ready' | 'expired' | 'failed';
	let captcha: CaptchaState = 'idle';
	let solution: string | null = null;
	let handle: CaptchaHandle | null = null;
	let host: HTMLElement | null = null;
	let ownHost = false;
	let destroyed = false;
	const waiters: ((solution: string | null) => void)[] = [];

	function settle(value: string | null): void {
		for (const resolve of waiters.splice(0)) resolve(value);
	}

	function captchaHost(): HTMLElement {
		const given = options.captchaElement?.();
		if (given) return given;
		if (!host) {
			host = document.createElement('div');
			host.hidden = true;
			host.dataset.dsCaptcha = String(funnel);
			document.body.append(host);
			ownHost = true;
		}
		return host;
	}

	async function startCaptcha(): Promise<void> {
		if (captcha !== 'idle' || destroyed || typeof window === 'undefined') return;
		captcha = 'loading';
		try {
			handle = await captchaAdapter()(captchaHost(), captchaChallengeUrl(), {
				onSolved(payload) {
					solution = payload;
					captcha = 'ready';
					settle(payload);
				},
				onCleared() {
					solution = null;
					captcha = 'expired';
				},
				onError() {
					solution = null;
					captcha = 'failed';
					settle(null);
				},
			});
			if (captcha === 'loading') captcha = 'solving';
		} catch {
			captcha = 'failed';
			settle(null);
		}
	}

	/** Wartet auf eine frische Lösung. `null`: die Prüfung ließ sich nicht durchführen. */
	function awaitSolution(): Promise<string | null> {
		if (captcha === 'ready' && solution) return Promise.resolve(solution);
		const waiting = new Promise<string | null>((resolve) => {
			waiters.push(resolve);
			setTimeout(() => resolve(null), CAPTCHA_TIMEOUT_MS);
		});
		if (captcha === 'failed') {
			handle?.destroy();
			handle = null;
			captcha = 'idle';
		}
		if (captcha === 'idle') void startCaptcha();
		else if (captcha === 'expired' || (captcha === 'ready' && !solution)) {
			captcha = 'solving';
			handle?.reset();
		}
		return waiting;
	}

	/** Eine Lösung gilt nur einmal: verbrauchen und gleich die nächste Aufgabe lösen. */
	function consumeSolution(): void {
		solution = null;
		if (handle && captcha !== 'failed') {
			captcha = 'solving';
			handle.reset();
		}
	}

	// --- Werte --------------------------------------------------------------------------------------------
	function hiddenValues(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const field of hidden) {
			const from = field.from;
			let value: string | null = null;
			if (from && 'query' in from) value = getCampaignParam(from.query);
			else if (from && 'utm' in from) value = getCampaignUtm(from.utm);
			else if (from && 'value' in from) value = from.value;
			const text = value?.trim().slice(0, HIDDEN_MAX);
			if (text) out[field.name] = text;
		}
		return out;
	}

	function validate(values: LeadValues<K>, only?: readonly string[]): Record<string, string> {
		const found: Record<string, string> = {};
		const record = values as Record<string, FieldValue | readonly string[] | undefined>;
		for (const field of visible) {
			if (only && !only.includes(field.name)) continue;
			const value = record[field.name];
			const message = validateField(
				field,
				Array.isArray(value) ? [...value] : (value as FieldValue | undefined),
			);
			if (message) found[field.name] = message;
		}
		return found;
	}

	async function send(values: LeadValues<K>): Promise<LeadResult> {
		const found = validate(values);
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
		if (!definition || definition.active === false) {
			const error: SiteApiError = { ...captchaError(), kind: 'not_found', message: MESSAGES.unavailable };
			return {
				ok: false,
				reason: 'unavailable',
				message: error.message,
				fields: {},
				fallback,
				retryAfterSeconds: null,
				error,
			};
		}

		status = 'captcha';
		const payload = await awaitSolution();
		if (!payload) {
			const error = captchaError();
			return {
				ok: false,
				reason: 'captcha',
				message: error.message,
				fields: {},
				fallback,
				retryAfterSeconds: null,
				error,
			};
		}

		status = 'sending';
		submissionId ||= crypto.randomUUID();
		const record = values as Record<string, FieldValue | readonly string[] | undefined>;
		const plain = Object.fromEntries(
			Object.entries(record).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
		) as Record<string, FieldValue | undefined>;
		const result = await siteApi().submitLead({
			funnelKey: funnel,
			submissionId,
			data: { ...toLeadData(visible, plain), ...hiddenValues() },
			attribution: buildLeadAttribution(consent.granted(), consent.decidedAt),
			captcha: payload,
			website: honeypot.slice(0, 500),
		});

		if (result.ok) {
			const id = submissionId;
			submissionId = '';
			solution = null;
			// Gleiche Ereignis-ID wie die serverseitige Conversion. Die Vorschau zählt nicht.
			if (!result.data.dryRun && consent.has('marketing')) reportLeadConversion(id);
			return { ok: true, dryRun: result.data.dryRun, submissionId: id };
		}

		consumeSolution();
		const error = result.error;
		if (error.kind === 'validation') {
			const fields: Record<string, string> = {};
			for (const field of visible) {
				// Text vom Server wird nie angezeigt: eigene Meldung je Feld.
				if (error.invalidFields.includes(field.name))
					fields[field.name] = `Bitte prüfen Sie Ihre Angabe bei „${labelOf(field)}“.`;
			}
			const message =
				Object.keys(fields).length === 0 && error.formInvalid ? MESSAGES.reachable : MESSAGES.validation;
			return {
				ok: false,
				reason: 'validation',
				message,
				fields,
				fallback: null,
				error: { ...error, message },
			};
		}
		return {
			ok: false,
			reason: reasonOf(error),
			message: error.message,
			fields: {},
			fallback,
			retryAfterSeconds: error.retryAfterSeconds,
			error,
		};
	}

	return {
		funnel,
		label: definition?.label ?? String(funnel),
		available: Boolean(definition) && definition?.active !== false,
		fields: visible,
		fallback,
		get status() {
			return status;
		},
		field: (name) => visible.find((f) => f.name === name),
		prepare() {
			void startCaptcha();
		},
		validate,
		setHoneypot(value) {
			honeypot = value;
		},
		submit(values) {
			if (inFlight) return inFlight;
			inFlight = send(values).finally(() => {
				inFlight = null;
				status = 'idle';
			});
			return inFlight;
		},
		destroy() {
			destroyed = true;
			handle?.destroy();
			handle = null;
			if (ownHost) host?.remove();
			settle(null);
		},
	};
}
