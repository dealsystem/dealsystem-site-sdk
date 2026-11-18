// Seitenwechsel aus Bausteinen (z. B. Weiterleitung nach einer Regel im CRM). Eigene Funktion, damit Tests ihn
// ersetzen können; jsdom kennt keinen echten Seitenwechsel.

let override: ((url: string) => void) | null = null;

/** Nur http(s): Adressen aus dem CRM sind geprüft, hier trotzdem kein `javascript:` o. Ä. */
export function safeHttpUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 2000) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
	} catch {
		return null;
	}
}

export function navigateTo(url: string): void {
	if (override) return override(url);
	window.location.assign(url);
}

/** @internal Nur für Tests. */
export function setNavigateForTests(fn: ((url: string) => void) | null): void {
	override = fn;
}
