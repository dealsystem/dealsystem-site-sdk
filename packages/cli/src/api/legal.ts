// Stand der Rechtstexte, wie ihn der Server jetzt meldet (`legalProfileMissing`). `publish` und `status` geben
// ihn aus, damit der Agent nicht aus einer veralteten `.dealsystem/content.json` rät.

import type { WebsiteDetails } from './types.js';

const LABELS: Record<string, string> = {
	imprintHtml: 'Impressum',
	privacyHtml: 'Datenschutzerklärung',
	company: 'Firmenname',
	email: 'E-Mail-Adresse',
};

export interface LegalStatus {
	/** `null`: Der Server liefert keinen Stand. */
	complete: boolean | null;
	/** Fehlende Pflichtangaben als Schlüssel des Servers (`imprintHtml` …). */
	missing: string[] | null;
}

export function legalStatus(site: Pick<WebsiteDetails, 'legalProfileMissing'>): LegalStatus {
	const missing = site.legalProfileMissing;
	return { complete: missing === null ? null : missing.length === 0, missing };
}

export function legalStatusLine(status: LegalStatus): string {
	if (status.missing === null) return 'Rechtstexte im CRM: Stand unbekannt (der Server meldet ihn nicht).';
	if (status.missing.length === 0)
		return 'Rechtstexte im CRM: vollständig (Impressum, Datenschutzerklärung, Firmenname, E-Mail-Adresse).';
	const names = status.missing.map((key) => LABELS[key] ?? key).join(', ');
	return `Rechtstexte im CRM: es fehlen ${names}. Der Inhaber trägt sie unter „Eigene Website → Rechtliches“ ein.`;
}
