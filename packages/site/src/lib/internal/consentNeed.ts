import type { ConsentCategory } from '../consent/consent.svelte.js';
import type { Anrede } from '../types.js';
import { getSiteData } from './siteData.js';

/**
 * Sind im CRM Tracking-Kennungen eingetragen? Dann fragt die Seite nach „Marketing“, schon im
 * Server-Rendering. Ohne Kennung lädt `<Tracking>` nichts.
 * @internal
 */
export function siteHasTracking(): boolean {
	try {
		const { metaPixelId, googleTagId } = getSiteData().tracking;
		return Boolean(metaPixelId || googleTagId);
	} catch {
		// Ohne Vite-Plugin meldet sich der Fehler an anderer Stelle (`<Tracking>`, Lade-Helfer).
		return false;
	}
}

/**
 * Braucht ein `<ConsentGate>` mit diesem Zweck eine Einwilligung? „Marketing“ nur, wenn etwas dafür da ist:
 * eine Tracking-Kennung im CRM oder ein fremder Dienst mit `category: 'marketing'` in `dealsystem.config.ts`.
 * Sonst lässt die CSP der Seite keinen Werbe-Dienst zu, und der Hinweis fragte ins Leere.
 * @internal
 */
export function gateNeedsConsent(category: ConsentCategory): boolean {
	if (category !== 'marketing') return true;
	if (siteHasTracking()) return true;
	try {
		return Object.values(getSiteData().external ?? {}).some((e) => e.category === 'marketing');
	} catch {
		return false;
	}
}

/**
 * Holt ein eigenes Banner die Einwilligung ein (`consent: { banner: 'own' }` in `dealsystem.config.ts`)? Dann zeigt
 * das SDK weder `<CookieBanner>` noch „Cookie-Einstellungen“; das eigene Banner meldet die Wahl mit `setConsent()`.
 * @internal
 */
export function ownConsentBanner(): boolean {
	try {
		return getSiteData().consent?.banner === 'own';
	} catch {
		return false;
	}
}

/**
 * Fragt das Banner von DealSystem auf dieser Seite nach einer Einwilligung? Ja, außer bei einem eigenen Banner:
 * Jede Seite mit `<SiteHead />` sendet Seitenaufrufe an DealSystem, und mit Zustimmung zu „Marketing“ erkennt sie
 * wiederkehrende Besuche (Entscheidung vom 19.11.2026: Hinweis immer, wenn DealSystem-Tracking läuft). Dann steht
 * „Cookie-Einstellungen“ schon im fertigen HTML jeder Seite, damit der Widerruf überall erreichbar ist.
 * @internal
 */
export function siteUsesConsent(): boolean {
	return !ownConsentBanner();
}

/**
 * Anrede der Besucher aus dem CRM (`site.salutation` im Inhalts-Schnappschuss). Ohne Daten `sie`.
 * @internal
 */
export function siteSalutation(): Anrede {
	try {
		return getSiteData().site.salutation === 'du' ? 'du' : 'sie';
	} catch {
		return 'sie';
	}
}
