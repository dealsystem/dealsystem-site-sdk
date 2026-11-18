// createBookingClient gegen eine Attrappe der Site-API: Terminart, freie Zeiten, Buchen mit Captcha und
// Bot-Falle, Vorschau, `slot_taken`, doppeltes Abschicken, Fehler als Werte mit deutschem Text.
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { createBookingClient } from '../src/lib/client/bookingClient.svelte.js';
import { setCaptchaAdapterForTests } from '../src/lib/client/captcha.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { INFO, SLOTS } from './fixtures/booking.js';
import { jsonResponse, testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const VALID = {
	start: SLOTS[0]!.start,
	firstName: 'Erika',
	lastName: 'Muster',
	email: 'erika@beispiel.de',
	answers: { anliegen: 'Wohnung verkaufen' },
};

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
let bookingAnswer: Handler;
const fetchSpy = vi.fn<typeof fetch>();
const calls = () =>
	fetchSpy.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), init: init! }));
const bookingBodies = () =>
	calls()
		.filter((c) => c.url.pathname.endsWith('/bookings'))
		.map((c) => JSON.parse(String(c.init.body)));
let captchaRuns = 0;

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	resetAttributionForTests();
	captchaRuns = 0;
	setCaptchaAdapterForTests(async (_el, _url, callbacks) => {
		captchaRuns++;
		queueMicrotask(() => callbacks.onSolved(`loesung-${captchaRuns}`));
		return {
			reset: () => queueMicrotask(() => callbacks.onSolved(`loesung-neu-${++captchaRuns}`)),
			destroy: () => {},
		};
	});
	bookingAnswer = () =>
		jsonResponse(201, {
			data: { booked: true, start: SLOTS[0]!.start, end: SLOTS[0]!.end, timezone: 'Europe/Berlin' },
		});
	fetchSpy.mockReset();
	fetchSpy.mockImplementation(async (input, init) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/slots')) {
			return jsonResponse(200, {
				data: {
					timezone: 'Europe/Berlin',
					from: url.searchParams.get('from'),
					to: url.searchParams.get('to'),
					slots: SLOTS,
				},
			});
		}
		if (url.pathname.endsWith('/bookings')) return bookingAnswer(url, init!);
		return jsonResponse(200, { data: INFO });
	});
	vi.stubGlobal('fetch', fetchSpy);
	setSiteDataForTests(testSiteData());
});

afterEach(() => {
	vi.unstubAllGlobals();
	setCaptchaAdapterForTests(null);
	setSiteDataForTests(null);
});

describe('createBookingClient: lesen', () => {
	it('lädt die Terminart einmal und die freien Zeiten in UTC über die Pfade der Site-API', async () => {
		const termin = createBookingClient('erstgespraech');
		expect(termin.label).toBe('Erstgespräch');
		const [a, b] = await Promise.all([termin.info(), termin.info()]);
		expect(a).toEqual(b);
		expect(a.ok && a.info.questions.map((q) => q.key)).toEqual(['anliegen', 'objekt']);

		const result = await termin.slots('2026-12-01T00:00:00.000Z', '2026-12-08T00:00:00.000Z');
		expect(result).toEqual({ ok: true, timezone: 'Europe/Berlin', slots: SLOTS });
		const urls = calls().map((c) => c.url);
		expect(urls.filter((u) => u.pathname.endsWith('/booking/erstgespraech'))).toHaveLength(1);
		const slotsUrl = urls.find((u) => u.pathname.endsWith('/slots'))!;
		expect(slotsUrl.pathname).toBe(
			'/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/booking/erstgespraech/slots',
		);
		expect(slotsUrl.searchParams.get('from')).toBe('2026-12-01T00:00:00.000Z');
		expect(calls().every((c) => c.init.credentials === 'omit')).toBe(true);
		// Nur die Site-API: die CSP der Seite braucht für Buchungen keinen weiteren Host (`connect-src`).
		expect(new Set(calls().map((c) => c.url.origin))).toEqual(new Set(['https://core.test']));
	});

	it('kappt den Zeitraum auf 31 Tage und lehnt einen leeren ab, ohne zu fragen', async () => {
		const termin = createBookingClient('erstgespraech');
		await termin.slots('2026-12-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z');
		const url = calls().find((c) => c.url.pathname.endsWith('/slots'))!.url;
		expect(url.searchParams.get('to')).toBe('2027-01-01T00:00:00.000Z');
		const empty = await termin.slots('2026-12-02T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
		expect(empty.ok).toBe(false);
	});

	it('Buchung aus oder ohne Terminart (404 booking_unavailable): Ausweichkontakt statt Fehlertext des Servers', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(404, { error: 'Not Found', message: 'intern', status: 404, code: 'booking_unavailable' }),
		);
		const result = await createBookingClient('erstgespraech').info();
		expect(result).toMatchObject({
			ok: false,
			reason: 'unavailable',
			message: 'Die Terminbuchung ist zurzeit nicht verfügbar.',
			fallback: { phone: '0341 1234567', email: 'info@kunde.de' },
		});
	});

	it('ein Schlüssel, der nicht in booking steht, ist ein Fehler beim Bauen der Seite', () => {
		expect(() => createBookingClient('gibtsnicht')).toThrow(
			/booking in dealsystem\.config\.ts.*Vorhanden: erstgespraech/,
		);
	});
});

describe('createBookingClient: buchen', () => {
	it('sendet Captcha, Bot-Falle, Zeitzone, Antworten, Ort und Herkunft; Text bereinigt', async () => {
		consent.save(['statistics']);
		const termin = createBookingClient('erstgespraech');
		termin.setHoneypot('');
		const result = await termin.book({
			...VALID,
			firstName: '  Erika ',
			phone: '',
			locationType: 'google_meet',
			answers: { anliegen: ' Wohnung verkaufen ', objekt: '', leer: undefined },
		});
		expect(result).toMatchObject({ ok: true, dryRun: false, duplicate: false, start: SLOTS[0]!.start });
		const [body] = bookingBodies();
		expect(body).toMatchObject({
			start: SLOTS[0]!.start,
			tz: expect.any(String),
			attendee: { firstName: 'Erika', lastName: 'Muster', email: 'erika@beispiel.de' },
			answers: { anliegen: 'Wohnung verkaufen' },
			locationType: 'google_meet',
			captcha: 'loesung-1',
			website: '',
			attribution: { v: 2, consent: { statistics: true, marketing: false } },
		});
		expect(body.attendee).not.toHaveProperty('phone');
		expect(body.submissionId).toMatch(/^[0-9a-f-]{36}$/);
		const post = calls().find((c) => c.url.pathname.endsWith('/bookings'))!;
		expect(post.init.method).toBe('POST');
		expect((post.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
	});

	it('prüft vorher wie der Server: Pflichtangaben, E-Mail, Pflichtfrage, Auswahl; schickt dann nichts', async () => {
		const termin = createBookingClient('erstgespraech');
		const result = await termin.book({
			start: SLOTS[0]!.start,
			firstName: '',
			email: 'keine-mail',
			answers: { objekt: 'Schloss' },
		});
		expect(result).toMatchObject({ ok: false, reason: 'validation', fallback: null });
		if (result.ok || result.reason !== 'validation') return;
		expect(Object.keys(result.fields).sort()).toEqual([
			'answers.anliegen',
			'answers.objekt',
			'email',
			'firstName',
		]);
		expect(bookingBodies()).toHaveLength(0);
	});

	it('Vorschau: geprüft, nichts gebucht (`dryRun`)', async () => {
		bookingAnswer = () =>
			jsonResponse(200, { data: { booked: true, dryRun: true, start: SLOTS[0]!.start, end: SLOTS[0]!.end } });
		const result = await createBookingClient('erstgespraech').book(VALID);
		expect(result).toMatchObject({ ok: true, dryRun: true });
	});

	it('slot_taken (409): eigener Grund und Text, Ausweichkontakt, Captcha-Lösung verbraucht', async () => {
		bookingAnswer = () =>
			jsonResponse(409, { error: 'Conflict', message: 'Server-Text', status: 409, code: 'slot_taken' });
		const termin = createBookingClient('erstgespraech');
		const result = await termin.book(VALID);
		expect(result).toMatchObject({
			ok: false,
			reason: 'slot_taken',
			message: 'Diese Zeit ist leider nicht mehr frei. Bitte wählen Sie eine andere.',
		});
		// Nächster Versuch mit anderer Zeit: frische Lösung, neue submissionId.
		bookingAnswer = () =>
			jsonResponse(201, { data: { booked: true, start: SLOTS[1]!.start, end: SLOTS[1]!.end } });
		await termin.book({ ...VALID, start: SLOTS[1]!.start });
		const [first, second] = bookingBodies();
		expect(second.captcha).not.toBe(first.captcha);
		expect(second.submissionId).not.toBe(first.submissionId);
	});

	it('doppelt abschicken: gleichzeitig ein Aufruf; nach Netzfehler dieselbe submissionId, der Server meldet duplicate', async () => {
		const termin = createBookingClient('erstgespraech');
		let resolve!: (r: Response) => void;
		bookingAnswer = () => new Promise<Response>((r) => (resolve = r));
		const a = termin.book(VALID);
		const b = termin.book(VALID);
		expect(b).toBe(a);
		await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
		resolve(jsonResponse(201, { data: { booked: true, start: SLOTS[0]!.start, end: SLOTS[0]!.end } }));
		await a;
		expect(bookingBodies()).toHaveLength(1);

		// Netzfehler, dann derselbe Termin noch einmal: dieselbe ID → der Server bucht nicht doppelt.
		const again = createBookingClient('erstgespraech');
		bookingAnswer = () => Promise.reject(new TypeError('offline'));
		const lost = await again.book(VALID);
		expect(lost).toMatchObject({ ok: false, reason: 'network', fallback: { phone: '0341 1234567' } });
		bookingAnswer = () => jsonResponse(201, { data: { booked: true, duplicate: true } });
		const retried = await again.book(VALID);
		expect(retried).toMatchObject({ ok: true, duplicate: true, start: VALID.start });
		const bodies = bookingBodies();
		expect(bodies.at(-1).submissionId).toBe(bodies.at(-2).submissionId);
	});

	it('internal_error (500) wird einmal mit derselben submissionId wiederholt', async () => {
		let n = 0;
		bookingAnswer = () =>
			++n === 1
				? jsonResponse(500, { error: 'x', message: 'x', status: 500, code: 'internal_error' })
				: jsonResponse(201, { data: { booked: true } });
		const result = await createBookingClient('erstgespraech').book(VALID);
		expect(result.ok).toBe(true);
		const [a, b] = bookingBodies();
		expect(b.submissionId).toBe(a.submissionId);
	});

	it('422 vom Server: Felder aus `details[].path`, eigene Texte statt Server-Text; not_qualified eigener Grund', async () => {
		bookingAnswer = () =>
			jsonResponse(422, {
				error: 'Unprocessable',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [
					{ path: 'attendee.email', message: 'Server sagt nein' },
					{ path: 'answers.anliegen', message: 'Server sagt nein' },
				],
			});
		const termin = createBookingClient('erstgespraech');
		const result = await termin.book(VALID);
		expect(result).toMatchObject({
			ok: false,
			reason: 'validation',
			fields: {
				email: 'Bitte prüfen Sie Ihre Angabe bei „E-Mail“.',
				'answers.anliegen': 'Bitte prüfen Sie Ihre Angabe bei „Worum geht es?“.',
			},
		});
		expect(JSON.stringify(result)).not.toContain('Server sagt nein');

		bookingAnswer = () =>
			jsonResponse(422, { error: 'x', message: 'Regel', status: 422, code: 'not_qualified', details: [] });
		const notQualified = await termin.book(VALID);
		expect(notQualified).toMatchObject({
			ok: false,
			reason: 'not_qualified',
			fallback: { email: 'info@kunde.de' },
		});
	});

	it('429: Wartezeit aus Retry-After, Ausweichkontakt', async () => {
		bookingAnswer = () =>
			jsonResponse(
				429,
				{ error: 'x', message: 'x', status: 429, code: 'rate_limited' },
				{ 'Retry-After': '90' },
			);
		const result = await createBookingClient('erstgespraech').book(VALID);
		expect(result).toMatchObject({ ok: false, reason: 'rate_limited', retryAfterSeconds: 90 });
	});

	it('nie ein Erfolg ohne ausdrückliches booked: true', async () => {
		bookingAnswer = () => jsonResponse(201, { data: { ok: true } });
		const result = await createBookingClient('erstgespraech').book(VALID);
		expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
	});

	it('Captcha nicht lösbar: Grund captcha, nichts gesendet', async () => {
		setCaptchaAdapterForTests(async () => {
			throw new Error('blockiert');
		});
		const result = await createBookingClient('erstgespraech').book(VALID);
		expect(result).toMatchObject({ ok: false, reason: 'captcha' });
		expect(bookingBodies()).toHaveLength(0);
	});
});
