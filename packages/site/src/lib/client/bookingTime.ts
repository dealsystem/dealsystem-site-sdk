// Zeiten einer Terminbuchung anzeigen. Die Site-API liefert und nimmt nur UTC; angezeigt wird in der Zeitzone
// des Besuchers, die Zeitzone des Kalenders steht als Hinweis daneben. Die Zeitumstellung erledigt `Intl`:
// Hier wird nie mit festen Stunden-Abständen gerechnet.
import type { BookingSlot } from './siteApi.js';

/** Zeitzone, wenn der Browser keine nennt. */
export const BOOKING_FALLBACK_TIME_ZONE = 'Europe/Berlin';

/** Höchstens so viele Tage fragt die Site-API je Abruf ab. */
export const BOOKING_RANGE_MAX_DAYS = 31;

/** `true`, wenn `Intl` die Zeitzone kennt. */
export function isTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** IANA-Zeitzone des Besuchers, z. B. `Europe/Berlin`. Ohne Angabe des Browsers `Europe/Berlin`. */
export function visitorTimeZone(): string {
	try {
		const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
		return zone && isTimeZone(zone) ? zone : BOOKING_FALLBACK_TIME_ZONE;
	} catch {
		return BOOKING_FALLBACK_TIME_ZONE;
	}
}

function parts(instant: Date, timeZone: string): Record<string, string> {
	const out: Record<string, string> = {};
	const format = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	});
	for (const p of format.formatToParts(instant)) out[p.type] = p.value;
	return out;
}

/** Kalendertag eines Zeitpunkts in einer Zeitzone als `YYYY-MM-DD`. */
export function dayOf(instant: Date | string, timeZone: string): string {
	const p = parts(new Date(instant), timeZone);
	return `${p.year}-${p.month}-${p.day}`;
}

/** Uhrzeit eines Zeitpunkts in einer Zeitzone, z. B. `09:30`. */
export function formatBookingTime(instant: Date | string, timeZone: string): string {
	const p = parts(new Date(instant), timeZone);
	return `${p.hour}:${p.minute}`;
}

/** Datum eines Zeitpunkts in einer Zeitzone, z. B. `Dienstag, 1. Dezember 2026`. */
export function formatBookingDate(instant: Date | string, timeZone: string, locale = 'de-DE'): string {
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	}).format(new Date(instant));
}

/**
 * Name einer Zeitzone für Besucher, z. B. `Mitteleuropäische Zeit (Berlin)`. Ohne Namen in `Intl` nur die Stadt.
 */
export function timeZoneLabel(timeZone: string, locale = 'de-DE', at: Date = new Date()): string {
	const city = (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ');
	try {
		const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
			.formatToParts(at)
			.find((p) => p.type === 'timeZoneName')?.value;
		return name && name !== timeZone ? `${name} (${city})` : city;
	} catch {
		return city;
	}
}

/** Ein freier Termin für die Anzeige. */
export interface BookingSlotView extends BookingSlot {
	/** Uhrzeit des Beginns in der Anzeige-Zeitzone, z. B. `09:30`. */
	time: string;
	/** Vollständig für Screenreader, z. B. `Dienstag, 1. Dezember 2026, 09:30 Uhr`. */
	label: string;
}

/** Ein Tag mit freien Terminen. */
export interface BookingDay {
	/** `YYYY-MM-DD` in der Anzeige-Zeitzone. */
	date: string;
	/** Kurz, z. B. `Di., 1. Dez.`. */
	short: string;
	/** Lang, z. B. `Dienstag, 1. Dezember 2026`. */
	long: string;
	slots: BookingSlotView[];
}

/**
 * Freie Termine nach Kalendertag in der Anzeige-Zeitzone, aufsteigend. Ein Termin um 23:30 UTC gehört in Berlin
 * zum nächsten Tag; ein Tag der Zeitumstellung hat einfach eine Stunde mehr oder weniger.
 */
export function groupSlotsByDay(
	slots: readonly BookingSlot[],
	timeZone: string,
	locale = 'de-DE',
): BookingDay[] {
	const short = new Intl.DateTimeFormat(locale, {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	});
	const days = new Map<string, BookingDay>();
	const sorted = [...slots].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
	for (const slot of sorted) {
		const date = dayOf(slot.start, timeZone);
		let day = days.get(date);
		if (!day) {
			day = {
				date,
				short: short.format(new Date(slot.start)),
				long: formatBookingDate(slot.start, timeZone, locale),
				slots: [],
			};
			days.set(date, day);
		}
		const time = formatBookingTime(slot.start, timeZone);
		day.slots.push({ ...slot, time, label: `${day.long}, ${time} Uhr` });
	}
	return [...days.values()];
}

/** Zeitraum für `slots()`: ab `from` (Standard: jetzt) für `days` Tage, höchstens 31. */
export function bookingRange(days: number, from: Date = new Date()): { from: Date; to: Date } {
	const span = Math.min(Math.max(1, Math.floor(days)), BOOKING_RANGE_MAX_DAYS);
	return { from, to: new Date(from.getTime() + span * 86_400_000) };
}
