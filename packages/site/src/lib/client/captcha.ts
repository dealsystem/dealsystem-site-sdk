// Andockpunkt für das Captcha. Der Anbieter wird erst geladen, wenn der
// Besucher das Formular zum ersten Mal anfasst — vorher geht kein Request raus.
import type { CaptchaConfig } from '../types.js';

/** Ein laufendes Captcha-Widget. */
export interface CaptchaHandle {
	/** Neue Aufgabe anfordern, z. B. nach einem abgelehnten Versuch. */
	reset(): void;
	destroy(): void;
}

/** Rückmeldungen des Widgets an das Formular. */
export interface CaptchaCallbacks {
	/** Aufgabe gelöst. `solution` geht als `captcha` an die Site-API. */
	onSolved(solution: string): void;
	/** Lösung abgelaufen oder zurückgesetzt. */
	onCleared(): void;
	/** Das Widget konnte nicht laden oder prüfen. */
	onError(): void;
}

/** Startet ein Widget im angegebenen Element. */
export type CaptchaAdapter = (
	element: HTMLElement,
	config: CaptchaConfig,
	callbacks: CaptchaCallbacks,
	locale: string,
) => Promise<CaptchaHandle>;

/** Friendly Captcha v2 über den EU-Endpunkt. */
const friendlyCaptcha: CaptchaAdapter = async (element, config, callbacks, locale) => {
	const { FriendlyCaptchaSDK } = await import('@friendlycaptcha/sdk');
	const sdk = new FriendlyCaptchaSDK({ apiEndpoint: 'eu', disableEvalPatching: true });
	const widget = sdk.createWidget({
		element,
		sitekey: config.siteKey,
		startMode: 'auto',
		formFieldName: null,
		language: locale,
	});
	widget.addEventListener('frc:widget.complete', (event) => callbacks.onSolved(event.detail.response));
	widget.addEventListener('frc:widget.expire', () => callbacks.onCleared());
	widget.addEventListener('frc:widget.reset', () => callbacks.onCleared());
	widget.addEventListener('frc:widget.error', () => callbacks.onError());
	return { reset: () => widget.reset(), destroy: () => widget.destroy() };
};

const ADAPTERS: Record<CaptchaConfig['provider'], CaptchaAdapter> = {
	'friendly-captcha': friendlyCaptcha,
};

let testAdapter: CaptchaAdapter | null = null;

/** @internal Nur für Tests. */
export function setCaptchaAdapterForTests(adapter: CaptchaAdapter | null): void {
	testAdapter = adapter;
}

/** @internal */
export function captchaAdapterFor(config: CaptchaConfig): CaptchaAdapter {
	return testAdapter ?? ADAPTERS[config.provider];
}
