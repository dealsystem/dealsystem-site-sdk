import { getSiteData } from './siteData.js';

/**
 * Sind im CRM Tracking-Kennungen eingetragen? Dann fragt die Seite nach „Marketing“, schon im
 * Server-Rendering. Ohne Kennung lädt `<Tracking>` nichts, und ein `<ConsentGate category="marketing">`
 * braucht keine Einwilligung: Andere Werbe-Dienste lassen die Sicherheitsregeln der Seite nicht zu.
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
