// Leadmagnet (Paket C4): Ein Formular verspricht eine Datei. Im Code steht nur die Ankündigung (`label`); die Datei
// lädt der Kunde im CRM hoch, der Core schickt den Download-Link in der Eingangsbestätigung. Hier liegt, was
// Konfig-Prüfung, Manifest und `<LeadForm>`/`createLeadClient` gemeinsam brauchen.
import { FORM_TEXTS } from './texts/form.js';
import { fillText, pickTexts } from './texts/resolve.js';
import type { FunnelLeadmagnetConfig } from './types.js';

/** Höchstlänge von `funnels.<schlüssel>.leadmagnet.label` (getrimmt). Vertrag mit dem Core. */
export const LEADMAGNET_LABEL_MAX = 120;

/** Wo der Kunde die Datei hochlädt. Steht in Fehlermeldungen und Doku. */
export const LEADMAGNET_CRM_HINT = 'Die Datei lädst du im CRM hoch (Eigene Website → Formulare).';

/**
 * Die Form, die das Manifest meldet: `{ label }` mit getrimmtem Text oder `null`, wenn das Formular keinen
 * Leadmagnet deklariert oder die Angabe unbrauchbar ist (die Konfig-Prüfung meldet das vorher als Fehler).
 */
export function normalizeLeadmagnet(value: unknown): FunnelLeadmagnetConfig | null {
	if (typeof value !== 'object' || value === null) return null;
	const label = (value as { label?: unknown }).label;
	if (typeof label !== 'string') return null;
	const trimmed = label.trim();
	if (trimmed === '' || trimmed.length > LEADMAGNET_LABEL_MAX) return null;
	return { label: trimmed };
}

/**
 * Standard-Erfolgstext, wenn das Formular eine Datei verspricht. Verspricht nur, was sicher ist: Die Anfrage ist
 * angekommen. Die Mail kann ausbleiben (Grenzen, Spam-Filter, Bestätigung im CRM aus), deshalb nennt der Text den
 * Spam-Ordner und den Weg zu einer Antwort statt eines festen „Sie haben es schon“.
 */
export function leadmagnetSuccessMessage(
	label: string,
	template = pickTexts(FORM_TEXTS).successLeadmagnet,
): string {
	return fillText(template, { label });
}
