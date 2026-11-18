// Lädt ein fremdes oder eigenes Skript für <ExternalScript>. Aufruf nur nach der Einwilligung der Kategorie.

/** Zusätzliche Attribute eines Skripts. Nur diese, damit kein Inline-Code und keine Event-Handler entstehen. */
export interface ExternalScriptAttrs {
	async?: boolean;
	defer?: boolean;
	/** Manche Anbieter erwarten eine feste Kennung, z. B. `hs-script-loader`. */
	id?: string;
	type?: 'module' | 'text/javascript';
	crossorigin?: 'anonymous' | 'use-credentials';
	referrerpolicy?: 'no-referrer' | 'origin' | 'strict-origin' | 'strict-origin-when-cross-origin';
	[data: `data-${string}`]: string;
}

const ALLOWED = new Set(['async', 'defer', 'id', 'type', 'crossorigin', 'referrerpolicy']);
const DATA_ATTR = /^data-[a-z0-9-]{1,64}$/;

/** Attribute, die nicht erlaubt sind. Leere Liste heißt: alles in Ordnung. */
export function invalidScriptAttrs(attrs: Record<string, unknown> | undefined): string[] {
	return Object.keys(attrs ?? {}).filter((name) => !ALLOWED.has(name) && !DATA_ATTR.test(name));
}

const loaded = new Set<string>();

/**
 * Hängt das Skript einmal je Seite an `<head>`. Gibt `true` zurück, wenn es neu angehängt wurde.
 * @internal
 */
export function loadExternalScript(src: string, attrs: ExternalScriptAttrs = {}): boolean {
	if (typeof document === 'undefined' || loaded.has(src)) return false;
	loaded.add(src);
	const script = document.createElement('script');
	script.src = src;
	// Ohne Angabe wie die Snippets der Anbieter: asynchron, blockiert die Seite nicht.
	script.async = attrs.async ?? !attrs.defer;
	if (attrs.defer) script.defer = true;
	for (const [name, value] of Object.entries(attrs)) {
		if (name === 'async' || name === 'defer' || typeof value !== 'string') continue;
		if (ALLOWED.has(name) || DATA_ATTR.test(name)) script.setAttribute(name, value);
	}
	script.setAttribute('data-ds-external-script', '');
	document.head.append(script);
	return true;
}

/** @internal Nur für Tests. */
export function resetExternalScriptsForTests(): void {
	loaded.clear();
}
