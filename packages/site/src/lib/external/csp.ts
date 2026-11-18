// Content-Security-Policy einer Seite: feste Basis plus die Hosts aus `external`. Reine Funktion; `dealsystemCsp()`
// (`@dealsystem/site/csp`) liest dafür die Konfiguration, `dealsystem check` (SEC-008) rechnet dieselbe CSP nach
// und vergleicht sie mit dem Meta-Tag jeder fertigen Seite.

import type { ExternalDirective, ResolvedExternal } from '../types.js';
import { EXTERNAL_DIRECTIVES } from './hosts.js';

/** CSP-Direktive je Schlüssel einer Deklaration. */
export const CSP_DIRECTIVE: Readonly<Record<ExternalDirective, string>> = {
	script: 'script-src',
	connect: 'connect-src',
	img: 'img-src',
	frame: 'frame-src',
	media: 'media-src',
	style: 'style-src',
	font: 'font-src',
};

/** Hosts von Google Tag und Meta Pixel. Laden nur über `<Tracking>` nach der Einwilligung „Marketing“. */
export const TRACKING_CSP: Readonly<Record<string, readonly string[]>> = {
	'script-src': ['https://www.googletagmanager.com', 'https://connect.facebook.net'],
	'img-src': ['https://www.googletagmanager.com', 'https://www.facebook.com'],
	'connect-src': [
		'https://*.google-analytics.com',
		'https://*.analytics.google.com',
		'https://www.googletagmanager.com',
		'https://www.facebook.com',
	],
};

/**
 * Zusätzliche Hosts für Google Ads (Conversion, Remarketing, Conversion Linker), nur wenn im CRM eine Kennung
 * `AW-…` steht. Laut Google: https://developers.google.com/tag-platform/security/guides/csp (Abschnitt „Google Ads“,
 * Stand 10.11.2026). `www.google.<TLD>` lässt sich in CSP nicht mit Platzhalter schreiben; aufgenommen ist
 * `www.google.de` für deutsche Besucher. Geladen wird weiter nur über `<Tracking>` nach der Einwilligung „Marketing“.
 */
export const GOOGLE_ADS_CSP: Readonly<Record<string, readonly string[]>> = {
	'script-src': ['https://www.googleadservices.com', 'https://www.google.com'],
	'img-src': [
		'https://www.googleadservices.com',
		'https://googleads.g.doubleclick.net',
		'https://pagead2.googlesyndication.com',
		'https://www.google.com',
		'https://www.google.de',
	],
	'connect-src': [
		'https://www.googleadservices.com',
		'https://googleads.g.doubleclick.net',
		'https://pagead2.googlesyndication.com',
		'https://www.google.com',
		'https://www.google.de',
		'https://ad.doubleclick.net',
	],
	'frame-src': ['https://www.googletagmanager.com'],
};

/** Ist die Google-Kennung aus dem CRM eine von Google Ads (`AW-…`)? */
export function isGoogleAdsId(id: string | null | undefined): boolean {
	return typeof id === 'string' && /^AW-[A-Z0-9-]{4,30}$/i.test(id.trim());
}

/** Herkunft der Karte von `<MapEmbed>` (OpenStreetMap, nach Einwilligung). */
export const MAP_EMBED_ORIGIN = 'https://www.openstreetmap.org';

/**
 * Basis der CSP, ohne Site-API. Schlüsselwörter ohne Anführungszeichen, wie SvelteKit sie in `kit.csp`
 * erwartet. Entspricht der festen CSP des Starters bis SDK 0.1 plus `media-src 'self'`.
 */
function baseDirectives(apiOrigin: string): Record<string, string[]> {
	return {
		'default-src': ['self'],
		'script-src': ['self', ...TRACKING_CSP['script-src']!],
		'style-src': ['self', 'unsafe-inline'],
		'img-src': ['self', 'data:', ...TRACKING_CSP['img-src']!],
		'font-src': ['self'],
		'connect-src': ['self', apiOrigin, ...TRACKING_CSP['connect-src']!],
		'frame-src': ['self', MAP_EMBED_ORIGIN],
		'media-src': ['self'],
		'worker-src': ['self'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self'],
	};
}

/**
 * Direktiven der CSP aus Basis und Deklaration. Gleiche Eingabe, gleiche Ausgabe (Reihenfolge: Basis, dann die
 * deklarierten Hosts sortiert).
 */
export function buildCspDirectives(
	external: readonly ResolvedExternal[],
	apiOrigin: string,
	/** `googleAds`: Kennung `AW-…` im CRM, dann kommen die Hosts aus `GOOGLE_ADS_CSP` dazu. */
	options: { googleAds?: boolean } = {},
): Record<string, string[]> {
	const directives = baseDirectives(apiOrigin);
	if (options.googleAds) {
		for (const [name, hosts] of Object.entries(GOOGLE_ADS_CSP)) {
			const list = directives[name] ?? ['self'];
			for (const host of hosts) if (!list.includes(host)) list.push(host);
			directives[name] = list;
		}
	}
	for (const directive of EXTERNAL_DIRECTIVES) {
		const name = CSP_DIRECTIVE[directive];
		const declared = [...new Set(external.flatMap((e) => e.hosts[directive]))].sort();
		const list = directives[name] ?? ['self'];
		for (const host of declared) if (!list.includes(host)) list.push(host);
		directives[name] = list;
	}
	return directives;
}
