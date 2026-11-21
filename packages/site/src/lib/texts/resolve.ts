// Texte der Bausteine für Besucher: je Baustein eine Quelle in Sie- und Du-Form (`texts/*.ts`,
// `consent/bannerTexts.ts`). Die Anrede kommt aus dem CRM (`site.salutation`), einzelne Texte überschreibt der
// Baustein über `texts`. Platzhalter wie `{label}` statt Funktionen, damit eine Überschreibung reiner Text bleibt.
import { getSiteData } from '../internal/siteData.js';
import type { Anrede } from '../types.js';

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

/**
 * Texte eines Bausteins: Standard in der Anrede der Seite (oder `anrede`), darüber die Überschreibungen. Leere oder
 * fremde Angaben zählen nicht; es bleibt der Standard.
 * @internal
 */
export function pickTexts<T extends object>(
	defaults: Readonly<Record<Anrede, T>>,
	overrides?: Partial<T> | null,
	anrede?: Anrede,
): T {
	const base = defaults[anrede === 'du' || anrede === 'sie' ? anrede : siteSalutation()];
	if (!overrides) return base;
	const result = { ...base };
	for (const key of Object.keys(base) as (keyof T)[]) {
		const value = overrides[key];
		if (typeof value === 'string' && value.trim() !== '') result[key] = value as T[keyof T];
	}
	return result;
}

/**
 * Setzt Platzhalter ein: `fillText('Bitte prüfen Sie „{label}“.', { label: 'E-Mail' })`. Unbekannte Platzhalter
 * bleiben stehen.
 * @internal
 */
export function fillText(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		Object.hasOwn(values, name) ? String(values[name]) : match,
	);
}
