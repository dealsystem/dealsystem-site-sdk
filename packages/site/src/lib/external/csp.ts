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
): Record<string, string[]> {
	const directives = baseDirectives(apiOrigin);
	for (const directive of EXTERNAL_DIRECTIVES) {
		const name = CSP_DIRECTIVE[directive];
		const declared = [...new Set(external.flatMap((e) => e.hosts[directive]))].sort();
		const list = directives[name] ?? ['self'];
		for (const host of declared) if (!list.includes(host)) list.push(host);
		directives[name] = list;
	}
	return directives;
}
