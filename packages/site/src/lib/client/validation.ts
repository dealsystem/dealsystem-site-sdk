// Prüfung der Formularwerte im Browser. Der Server prüft alles noch einmal;
// hier geht es um schnelle, verständliche Rückmeldung.
import { FORM_TEXTS, type FormTexts } from '../texts/form.js';
import { fillText, pickTexts } from '../texts/resolve.js';
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

/** Meldung zu einem Feld oder `null`, wenn der Wert passt. Texte in der Anrede der Seite (`texts/form.ts`). */
export function validateField(
	field: FunnelFieldDef,
	value: FieldValue | undefined,
	texts: FormTexts = pickTexts(FORM_TEXTS),
): string | null {
	const label = labelOf(field);
	const say = (template: string) => fillText(template, { label, max: maxLengthOf(field) });
	const empty =
		value === undefined ||
		value === false ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0);

	if (empty) {
		if (!field.required) return null;
		if (field.type === 'checkbox') return say(texts.confirmRequired);
		if (field.type === 'select' || field.type === 'multiselect') return say(texts.chooseRequired);
		return say(texts.fillRequired);
	}
	if (typeof value !== 'string') return null;

	const text = value.trim();
	if (text.length > maxLengthOf(field)) return say(texts.tooLong);
	if (field.type === 'email' && !EMAIL.test(text)) return say(texts.invalidEmail);
	if (field.type === 'tel' && !PHONE.test(text)) return say(texts.invalidPhone);
	if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return say(texts.invalidDate);
	if (field.type === 'select' && field.options && !field.options.includes(text))
		return say(texts.chooseRequired);
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
