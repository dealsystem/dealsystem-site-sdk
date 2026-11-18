// Seitenaufrufe für die Statistik der Website (`POST …/track`). Ohne Einwilligung nur Pfad, Einstieg, Kampagne und
// fremder Referrer; der Core zählt dann anonym über einen Tages-Hash (kein Zugriff auf das Endgerät). Die Besuchs-ID
// geht nur mit Einwilligung mit (`ATTRIBUTION_CONSENT.visitorId`).
import { consent } from '../consent/consent.svelte.js';
import { getEntry, getVisitorId } from './attribution.js';
import { siteApi, type PageviewRequest } from './siteApi.js';

let landed = false;
let lastPath: string | null = null;

/**
 * Meldet einen Seitenaufruf, je Pfad nur einmal hintereinander. `<SiteHead>` ruft das bei jedem Seitenwechsel auf.
 * @internal
 */
export function trackPageview(path: string): void {
	if (typeof window === 'undefined' || path === lastPath) return;
	lastPath = path;
	const landing = !landed;
	landed = true;
	const granted = consent.granted();
	const body: PageviewRequest = {
		path: path.slice(0, 2000),
		landing,
		consent: { statistics: granted.statistics, marketing: granted.marketing, at: consent.decidedAt },
	};
	if (landing) {
		const entry = getEntry();
		if (entry.utm) body.utm = entry.utm;
		if (entry.referrerHost) body.referrerHost = entry.referrerHost;
	}
	const visitorId = getVisitorId(granted);
	if (visitorId) body.visitorId = visitorId;
	// Kein await, kein Fehler für den Besucher: Statistik ist nie wichtiger als die Seite.
	void siteApi()
		.track(body)
		.catch(() => undefined);
}

/** @internal Nur für Tests. */
export function resetPageviewsForTests(): void {
	landed = false;
	lastPath = null;
}
