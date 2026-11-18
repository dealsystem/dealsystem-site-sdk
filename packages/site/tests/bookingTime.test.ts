// Zeiten der Terminbuchung: UTC von der Site-API, angezeigt in der Zeitzone des Besuchers, über die Zeitumstellung.
import {
	bookingRange,
	dayOf,
	formatBookingTime,
	groupSlotsByDay,
	isTimeZone,
	timeZoneLabel,
	visitorTimeZone,
} from '../src/lib/client/bookingTime.js';
import { devBookingSlots } from '../src/lib/vite/index.js';

const slot = (start: string, minutes = 30) => ({
	start,
	end: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
});

describe('Zeitumstellung', () => {
	it('09:00 Berliner Zeit ist im Winter 08:00Z und im Sommer 07:00Z, angezeigt beides als 09:00', () => {
		// Sommerzeit endet am 25.10.2026 um 03:00 Ortszeit.
		const days = groupSlotsByDay(
			[slot('2026-10-24T07:00:00.000Z'), slot('2026-10-26T08:00:00.000Z')],
			'Europe/Berlin',
		);
		expect(days.map((d) => [d.date, d.slots.map((s) => s.time)])).toEqual([
			['2026-10-24', ['09:00']],
			['2026-10-26', ['09:00']],
		]);
	});

	it('am Tag der Umstellung: dieselbe UTC-Stunde zeigt vor und nach 03:00 verschiedene Ortszeiten', () => {
		// 00:30Z = 02:30 Sommerzeit, 01:30Z = 02:30 Winterzeit (die Stunde 02–03 gibt es zweimal).
		expect(formatBookingTime('2026-10-25T00:30:00.000Z', 'Europe/Berlin')).toBe('02:30');
		expect(formatBookingTime('2026-10-25T01:30:00.000Z', 'Europe/Berlin')).toBe('02:30');
		// Frühjahr: 29.03.2026, 02:00 → 03:00.
		expect(formatBookingTime('2026-03-29T00:30:00.000Z', 'Europe/Berlin')).toBe('01:30');
		expect(formatBookingTime('2026-03-29T01:30:00.000Z', 'Europe/Berlin')).toBe('03:30');
	});

	it('ein Besucher in New York sieht dieselbe Zeit umgerechnet; die USA stellen eine Woche später um', () => {
		// 31.10.2026: Berlin schon Winterzeit (UTC+1), New York noch Sommerzeit (UTC-4).
		const start = '2026-10-30T08:00:00.000Z';
		expect(formatBookingTime(start, 'Europe/Berlin')).toBe('09:00');
		expect(formatBookingTime(start, 'America/New_York')).toBe('04:00');
		// Nach dem 1.11. (USA Winterzeit, UTC-5): 09:00 Berlin = 03:00 New York.
		expect(formatBookingTime('2026-11-02T08:00:00.000Z', 'America/New_York')).toBe('03:00');
	});

	it('Probe-Zeiten von vite dev folgen der Berliner Ortszeit über die Umstellung', () => {
		vi.useFakeTimers({ now: new Date('2026-10-20T00:00:00.000Z') });
		try {
			const slots = devBookingSlots(
				new Date('2026-10-23T00:00:00.000Z'),
				new Date('2026-10-27T00:00:00.000Z'),
			);
			const days = groupSlotsByDay(slots, 'Europe/Berlin');
			// Freitag und Montag (Wochenende frei), jeweils 09:00 bis 15:30 Ortszeit.
			expect(days.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-26']);
			for (const d of days) {
				expect(d.slots[0]!.time).toBe('09:00');
				expect(d.slots.at(-1)!.time).toBe('15:30');
			}
			expect(days[0]!.slots[0]!.start).toBe('2026-10-23T07:00:00.000Z');
			expect(days[1]!.slots[0]!.start).toBe('2026-10-26T08:00:00.000Z');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Tage und Beschriftung', () => {
	it('ein Termin um 23:30 UTC gehört in Berlin zum nächsten Tag', () => {
		expect(dayOf('2026-12-01T23:30:00.000Z', 'Europe/Berlin')).toBe('2026-12-02');
		expect(dayOf('2026-12-01T23:30:00.000Z', 'UTC')).toBe('2026-12-01');
	});

	it('gruppiert sortiert und beschriftet für Screenreader vollständig', () => {
		const days = groupSlotsByDay(
			[slot('2026-12-01T09:30:00.000Z'), slot('2026-12-01T09:00:00.000Z'), slot('2026-12-02T09:00:00.000Z')],
			'Europe/Berlin',
		);
		expect(days).toHaveLength(2);
		expect(days[0]!.short).toBe('Di., 1. Dez.');
		expect(days[0]!.long).toBe('Dienstag, 1. Dezember 2026');
		expect(days[0]!.slots.map((s) => s.time)).toEqual(['10:00', '10:30']);
		expect(days[0]!.slots[0]!.label).toBe('Dienstag, 1. Dezember 2026, 10:00 Uhr');
	});

	it('Zeitzonen: Name für Besucher, unbekannte fallen auf Berlin zurück', () => {
		expect(timeZoneLabel('Europe/Berlin')).toBe('Mitteleuropäische Zeit (Berlin)');
		expect(timeZoneLabel('America/New_York')).toContain('(New York)');
		expect(isTimeZone('Mars/Olympus')).toBe(false);
		expect(isTimeZone(visitorTimeZone())).toBe(true);
	});

	it('Zeitraum höchstens 31 Tage', () => {
		const from = new Date('2026-12-01T00:00:00.000Z');
		expect(bookingRange(90, from).to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
		expect(bookingRange(0, from).to.toISOString()).toBe('2026-12-02T00:00:00.000Z');
	});
});
