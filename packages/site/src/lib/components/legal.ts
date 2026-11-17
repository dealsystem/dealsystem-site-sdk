/** Sichtbarer Platzhalter für fehlende Firmendaten. */
export const MISSING = '[Angabe fehlt – bitte im CRM unter Website → Einstellungen eintragen]';

/** Telefonnummer für `tel:`-Links. */
export function telHref(phone: string): string {
	return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

/** Adresse als Zeilen. */
export function addressLines(address: string): string[] {
	return address
		.split(/\n|,\s*/)
		.map((line) => line.trim())
		.filter(Boolean);
}
