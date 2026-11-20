import type { ConsentCategory, ConsentProvider } from '../consent/consent.svelte.js';
import { getSiteData } from './siteData.js';

/**
 * DealSystem selbst: Mit Zustimmung zu „Marketing“ erkennt die Seite wiederkehrende Besuche (Besuchs-ID) und ordnet
 * sie der Anfrage zu. `<SiteHead />` meldet den Zweck auf jeder Seite, außer bei einem eigenen Banner.
 * @internal
 */
export const DEALSYSTEM_VISITS: ConsentProvider = {
	name: 'DealSystem (Betreiber der Website-Plattform)',
	purpose: 'Erkennt wiederkehrende Besuche und ordnet sie einer Anfrage zu.',
	privacyUrl: null,
};

/** Anbieter von `<Tracking>`, wenn die Kennung im CRM steht. */
const GOOGLE_TAG: ConsentProvider = {
	name: 'Google Ireland Limited, Irland (Google Tag)',
	purpose: 'Misst Besuche und Anzeigen-Erfolge.',
	privacyUrl: 'https://policies.google.com/privacy',
};
const META_PIXEL: ConsentProvider = {
	name: 'Meta Platforms Ireland Limited, Irland (Meta Pixel)',
	purpose: 'Misst Anzeigen-Erfolge auf Facebook und Instagram.',
	privacyUrl: 'https://www.facebook.com/privacy/policy/',
};

/**
 * Anbieter je Zweck für den Cookie-Hinweis: alle fremden Dienste aus `dealsystem.config.ts` (seitenweit, die
 * Einwilligung gilt für alle Seiten) und die Tracking-Kennungen aus dem CRM.
 * @internal
 */
export function declaredProviders(): Record<ConsentCategory, ConsentProvider[]> {
	const out: Record<ConsentCategory, ConsentProvider[]> = { statistics: [], marketing: [], media: [] };
	let data;
	try {
		data = getSiteData();
	} catch {
		return out;
	}
	if (data.tracking.googleTagId) out.marketing.push(GOOGLE_TAG);
	if (data.tracking.metaPixelId) out.marketing.push(META_PIXEL);
	for (const entry of Object.values(data.external ?? {})) {
		out[entry.category].push({
			name: entry.provider ?? `Anbieter von „${entry.id}“`,
			purpose: entry.purpose,
			privacyUrl: entry.privacyUrl,
		});
	}
	return out;
}

/** Fügt Listen zusammen, je Name einmal. @internal */
export function mergeProviders(...lists: ConsentProvider[][]): ConsentProvider[] {
	const seen = new Set<string>();
	return lists.flat().filter((p) => !seen.has(p.name) && seen.add(p.name));
}
