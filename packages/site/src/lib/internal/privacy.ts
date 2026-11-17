import embedded from './dealsystem-legal-privacy.js';

let override: string | null = null;

/** @internal Nur für Tests des SDK. */
export function setPrivacyForTests(html: string | null): void {
	override = html;
}

/** @internal Datenschutztext des Kunden, bereinigtes HTML. Leer, wenn noch keiner eingetragen ist. */
export function privacyHtml(): string {
	return override ?? embedded;
}
