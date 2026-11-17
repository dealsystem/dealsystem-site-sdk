import embedded from './dealsystem-legal-imprint.js';

let override: string | null = null;

/** @internal Nur für Tests des SDK. */
export function setImprintForTests(html: string | null): void {
	override = html;
}

/** @internal Impressumstext des Kunden, bereinigtes HTML. Leer, wenn noch keiner eingetragen ist. */
export function imprintHtml(): string {
	return override ?? embedded;
}
