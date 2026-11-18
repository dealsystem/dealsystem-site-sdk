import type { ConsentCategory } from '../consent/consent.svelte.js';
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
 * Nutzt die Seite überhaupt etwas, das eine Einwilligung braucht (Tracking-Kennung oder ein fremder Dienst unter
 * `external`)? Dann steht „Cookie-Einstellungen“ schon im fertigen HTML jeder Seite, damit der Widerruf überall
 * erreichbar ist, auch auf Seiten ohne den Dienst.
 * @internal
 */
export function siteUsesConsent(): boolean {
	if (siteHasTracking()) return true;
	try {
		return Object.keys(getSiteData().external ?? {}).length > 0;
	} catch {
		return false;
	}
}
