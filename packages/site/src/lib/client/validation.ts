// Prüfung der Formularwerte im Browser. Der Server prüft alles noch einmal;
// hier geht es um schnelle, verständliche Rückmeldung.
import type { FunnelFieldDef } from '../types.js';

export type FieldValue = string | boolean | string[];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+0-9][0-9 ()/.-]{4,29}$/;

/** Höchstlänge eines Feldes, wenn die Konfiguration keine nennt. */
export function maxLengthOf(field: FunnelFieldDef): number {
	// Die Site-API nimmt je Feld höchstens 10 000 Zeichen an.
	return Math.min(field.maxLength ?? (field.type === 'textarea' ? 5000 : 255), 10_000);
}

/** Sichtbare Beschriftung eines Feldes. */
export function labelOf(field: FunnelFieldDef): string {
	return field.label ?? field.name.charAt(0).toUpperCase() + field.name.slice(1);
}

/** Meldung zu einem Feld oder `null`, wenn der Wert passt. */
export function validateField(field: FunnelFieldDef, value: FieldValue | undefined): string | null {
	const label = labelOf(field);
	const empty =
		value === undefined ||
		value === false ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0);

	if (empty) {
		if (!field.required) return null;
		if (field.type === 'checkbox') return `Bitte bestätigen Sie „${label}“.`;
		if (field.type === 'select' || field.type === 'multiselect')
			return `Bitte wählen Sie bei „${label}“ etwas aus.`;
		return `Bitte füllen Sie das Feld „${label}“ aus.`;
	}
	if (typeof value !== 'string') return null;

	const text = value.trim();
	if (text.length > maxLengthOf(field)) {
		return `„${label}“ ist zu lang. Erlaubt sind höchstens ${maxLengthOf(field)} Zeichen.`;
	}
	if (field.type === 'email' && !EMAIL.test(text)) {
		return 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.';
	}
	if (field.type === 'tel' && !PHONE.test(text)) {
		return 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0341 1234567.';
	}
	if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return `Bitte geben Sie bei „${label}“ ein Datum an.`;
	}
	if (field.type === 'select' && field.options && !field.options.includes(text)) {
		return `Bitte wählen Sie bei „${label}“ etwas aus.`;
	}
	return null;
}

/** Werte für den Versand: getrimmt, leere Felder ausgelassen. */
export function toLeadData(
	fields: readonly FunnelFieldDef[],
	values: Record<string, FieldValue | undefined>,
): Record<string, string | string[] | boolean> {
	const data: Record<string, string | string[] | boolean> = {};
	for (const field of fields) {
		const value = values[field.name];
		if (typeof value === 'string') {
			if (value.trim() !== '') data[field.name] = value.trim();
		} else if (Array.isArray(value)) {
			if (value.length > 0) data[field.name] = [...value];
		} else if (value === true) {
			data[field.name] = true;
		}
	}
	return data;
}
