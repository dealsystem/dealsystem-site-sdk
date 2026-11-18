// Zeitpunkte für `<Zeitfenster>`: Lesen, Prüfen, Fenster auswerten. Ohne Abhängigkeiten, damit Baustein,
// Vite-Plugin (Manifest `schedule`) und `dealsystem check` (QUA-009) dieselbe Regel benutzen.

/**
 * Zeitpunkt nach ISO 8601 **mit** Zeitzone: `2026-12-01T18:00:00+01:00` oder `…Z`. Ohne Angabe der Zeitzone
 * hinge die Bedeutung von der Uhr des Rechners ab (Build-Host in UTC, Besucher in Berlin), deshalb nicht erlaubt.
 */
const ZEITPUNKT =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

/** Höchstens so viele künftige Grenzen meldet das Manifest (die frühesten). */
export const SCHEDULE_MAX = 50;

export type ZeitpunktFehler = 'format' | 'offset' | 'ungueltig';

/**
 * Liest einen Zeitpunkt. Liefert Millisekunden seit 1970 (UTC) oder den Grund, warum es nicht geht:
 * `offset` = Zeitzone fehlt, `format` = kein ISO-Zeitpunkt, `ungueltig` = z. B. 31. Februar.
 */
export function parseZeitpunkt(value: string): { ms: number } | { fehler: ZeitpunktFehler } {
	const text = value.trim();
	const match = ZEITPUNKT.exec(text);
	if (!match) {
		const ohneZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text);
		return { fehler: ohneZone ? 'offset' : 'format' };
	}
	const [, y, mo, d, h, mi, s = '0', , zone, oh = '0', om = '0'] = match;
	const month = Number(mo);
	const day = Number(d);
	const hour = Number(h);
	const minute = Number(mi);
	const second = Number(s);
	if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59)
		return { fehler: 'ungueltig' };
	if (zone !== 'Z' && (Number(oh) > 14 || Number(om) > 59)) return { fehler: 'ungueltig' };
	// Tag im Monat prüfen: Date.UTC rollt den 31. Februar sonst still in den März.
	if (new Date(Date.UTC(Number(y), month - 1, day)).getUTCDate() !== day) return { fehler: 'ungueltig' };
	const ms = Date.parse(text);
	return Number.isFinite(ms) ? { ms } : { fehler: 'ungueltig' };
}

/** Meldung zu einem Fehler beim Lesen, für Baustein und Prüfung. */
export function zeitpunktFehlerText(name: string, value: string, fehler: ZeitpunktFehler): string {
	const beispiel =
		'z. B. "2026-12-01T18:00:00+01:00" (Winterzeit) oder "2026-07-01T18:00:00+02:00" (Sommerzeit)';
	if (fehler === 'offset')
		return `${name}="${value}" hat keine Zeitzone. Hänge sie an, ${beispiel}; sonst hinge die Zeit vom Rechner ab.`;
	if (fehler === 'ungueltig')
		return `${name}="${value}" ist kein gültiger Zeitpunkt (Datum oder Uhrzeit gibt es nicht).`;
	return `${name}="${value}" ist kein Zeitpunkt. Schreibe Datum und Uhrzeit mit Zeitzone, ${beispiel}.`;
}

/** Ist der Inhalt zum Zeitpunkt `now` sichtbar? `ab` gehört dazu, `bis` nicht mehr: [ab, bis). */
export function imZeitfenster(now: number, ab: number | null, bis: number | null): boolean {
	return (ab === null || now >= ab) && (bis === null || now < bis);
}

/** Nächste Grenze nach `now`, oder `null`. */
export function naechsteGrenze(now: number, grenzen: readonly (number | null)[]): number | null {
	let next: number | null = null;
	for (const g of grenzen) if (g !== null && g > now && (next === null || g < next)) next = g;
	return next;
}

/**
 * Die Grenzen für das Manifest: nur künftige (nach `now`), ohne doppelte, aufsteigend, höchstens
 * `SCHEDULE_MAX`, als UTC-Zeitpunkt (`2026-12-01T17:00:00.000Z`).
 */
export function scheduleFrom(grenzen: Iterable<number>, now: number): string[] {
	return [...new Set([...grenzen].filter((ms) => ms > now))]
		.sort((a, b) => a - b)
		.slice(0, SCHEDULE_MAX)
		.map((ms) => new Date(ms).toISOString());
}
