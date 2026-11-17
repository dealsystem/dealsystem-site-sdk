// Captcha des Formulars: ALTCHA, ein Proof-of-Work-Verfahren. Der Browser
// holt eine Rechenaufgabe von der eigenen Site-API und löst sie im
// Hintergrund. Kein Drittanbieter, kein Cookie, nichts zum Anklicken.
//
// Das Widget ist im Paket gebündelt und wird erst geladen, wenn der Besucher
// das Formular zum ersten Mal anfasst — vorher geht keine Anfrage raus.
// Es läuft unsichtbar; was der Besucher erfährt, sagt das Formular selbst
// (aria-live). Die Worker kommen als eigene Dateien vom selben Ursprung
// (CSP: `worker-src 'self'`), ohne blob:-Adressen und ohne eingebettete Styles.
// Typen der `?worker`-Importe: eine Deklarationsdatei lässt sich nur so einbinden.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./altcha-workers.d.ts" />
import type { WidgetMethods } from 'altcha/types';

/** Ein laufendes Captcha. */
export interface CaptchaHandle {
	/** Neue Aufgabe holen und lösen, z. B. nach einem abgelehnten Versuch. */
	reset(): void;
	destroy(): void;
}

/** Rückmeldungen an das Formular. */
export interface CaptchaCallbacks {
	/** Aufgabe gelöst. `payload` geht als `captcha` an die Site-API. */
	onSolved(payload: string): void;
	/** Lösung abgelaufen oder zurückgesetzt. */
	onCleared(): void;
	/** Aufgabe nicht ladbar oder nicht lösbar. */
	onError(): void;
}

/** Startet das Captcha im angegebenen Element. */
export type CaptchaAdapter = (
	element: HTMLElement,
	challengeUrl: string,
	callbacks: CaptchaCallbacks,
) => Promise<CaptchaHandle>;

type AltchaWidget = HTMLElement & WidgetMethods;
type AltchaEvent = CustomEvent<{ payload?: string; state?: string }>;

/** Algorithmen, deren Worker das Paket mitbringt. Der Server muss einen davon verwenden. */
export const CAPTCHA_ALGORITHMS = {
	pbkdf2: ['PBKDF2/SHA-256', 'PBKDF2/SHA-384', 'PBKDF2/SHA-512'],
	sha: ['SHA-256', 'SHA-384', 'SHA-512'],
} as const;

const altcha: CaptchaAdapter = async (element, challengeUrl, callbacks) => {
	const [, pbkdf2, sha] = await Promise.all([
		import('altcha/external'),
		import('altcha/workers/pbkdf2?worker'),
		import('altcha/workers/sha?worker'),
	]);
	const registry = globalThis.$altcha;
	for (const name of CAPTCHA_ALGORITHMS.pbkdf2) registry.algorithms.set(name, () => new pbkdf2.default());
	for (const name of CAPTCHA_ALGORITHMS.sha) registry.algorithms.set(name, () => new sha.default());

	const widget = document.createElement('altcha-widget') as AltchaWidget;
	widget.addEventListener('verified', (event) => {
		const payload = (event as AltchaEvent).detail?.payload;
		if (payload) callbacks.onSolved(payload);
		else callbacks.onError();
	});
	widget.addEventListener('expired', () => callbacks.onCleared());
	widget.addEventListener('statechange', (event) => {
		if ((event as AltchaEvent).detail?.state === 'error') callbacks.onError();
	});

	// Die Methoden des Widgets gibt es erst nach seinem `load`-Ereignis.
	const loaded = new Promise<void>((resolve, reject) => {
		widget.addEventListener('load', () => resolve(), { once: true });
		setTimeout(() => reject(new Error('ALTCHA lädt nicht')), 10_000);
	});
	// Unsichtbar ohne die Styles des Widgets: das Element selbst ist versteckt.
	element.hidden = true;
	element.append(widget);
	if (typeof widget.configure !== 'function') await loaded;

	await widget.configure({
		challenge: challengeUrl,
		auto: 'off',
		display: 'invisible',
		// Die Site-API antwortet ohne `Access-Control-Allow-Credentials`.
		credentials: 'omit',
		hideLogo: true,
		hideFooter: true,
	});
	const verify = () => {
		widget.verify().catch(() => callbacks.onError());
	};
	verify();

	return {
		reset() {
			widget.reset();
			verify();
		},
		destroy() {
			widget.remove();
		},
	};
};

let testAdapter: CaptchaAdapter | null = null;

/** @internal Nur für Tests. */
export function setCaptchaAdapterForTests(adapter: CaptchaAdapter | null): void {
	testAdapter = adapter;
}

/** @internal */
export function captchaAdapter(): CaptchaAdapter {
	return testAdapter ?? altcha;
}
