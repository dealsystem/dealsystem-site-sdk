// Prüft den Client gegen die Beschreibung der Site-API, eine Kopie aus dem Core.
import Ajv2020 from 'ajv/dist/2020.js';
import contract from '../contract/site-api.v1.json' with { type: 'json' };
import { pbkdf2, solveChallenge } from 'altcha/lib';
import { CAPTCHA_ALGORITHMS } from '../src/lib/client/captcha.js';
import {
	captchaChallengeUrl,
	createSiteApi,
	type BookingRequest,
	type LeadRequest,
	type SiteApiErrorKind,
} from '../src/lib/client/siteApi.js';
import { emptySiteData, setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { createDevCaptchaChallenge } from '../src/lib/vite/index.js';
import { toLeadData } from '../src/lib/client/validation.js';
import { jsonResponse } from './helpers.js';

const ajv = new Ajv2020({ strict: false, formats: { uuid: true } });
ajv.addSchema(contract, 'core');
const coreSchema = (name: string) => ajv.getSchema(`core#/components/schemas/${name}`)!;

const leadOperation = contract.paths['/s/{key}/leads'].post;
const bookingInfoOperation = contract.paths['/s/{key}/booking/{bookingKey}'].get;
const bookingSlotsOperation = contract.paths['/s/{key}/booking/{bookingKey}/slots'].get;
const bookingOperation = contract.paths['/s/{key}/booking/{bookingKey}/bookings'].post;
const validateBookingBody = ajv.compile(bookingOperation.requestBody.content['application/json'].schema);

/** Fehlercodes der Terminbuchung: Status und Art im Client. Die Termin-Seiten (`appointments/…`) nutzt das SDK nicht. */
const BOOKING_CODES: Record<string, [status: number, kind: SiteApiErrorKind]> = {
	booking_unavailable: [404, 'not_found'],
	slot_taken: [409, 'conflict'],
	slots_unavailable: [503, 'server'],
	invalid_range: [400, 'rejected'],
	invalid_timezone: [400, 'rejected'],
	not_qualified: [422, 'validation'],
	appointment_not_found: [404, 'not_found'],
	appointment_closed: [410, 'gone'],
};
const validateLeadBody = ajv.compile(leadOperation.requestBody.content['application/json'].schema);
const SITE_KEY = 'dsp_abcd1234_abcdefghijklmnopqrstuvwx';

interface Call {
	method: string;
	url: URL;
	headers: Record<string, string>;
	body: unknown;
	credentials: RequestCredentials | undefined;
}

function recordingApi(answer: () => Response) {
	const calls: Call[] = [];
	const api = createSiteApi({
		// Basis-URL der Seite ist der Ursprung; `/api/site/v1` hängt der Client an.
		baseUrl: new URL(contract.servers[0]!.url).origin,
		siteKey: SITE_KEY,
		fetch: async (input, init) => {
			calls.push({
				method: init?.method ?? 'GET',
				url: new URL(String(input)),
				headers: (init?.headers ?? {}) as Record<string, string>,
				body: init?.body ? JSON.parse(String(init.body)) : null,
				credentials: init?.credentials,
			});
			return answer();
		},
	});
	return { api, calls };
}

const lead = (overrides: Partial<LeadRequest> = {}): LeadRequest => ({
	funnelKey: 'kontakt',
	submissionId: crypto.randomUUID(),
	data: { email: 'a@b.de' },
	captcha: 'loesung',
	...overrides,
});

type JsonContent = { content: { 'application/json': { example?: unknown } } };
const exampleOf = (response: unknown) => (response as JsonContent).content['application/json'].example;

describe('Vertrag Site-API v1: Leads (Kopie aus dem Core)', () => {
	it('der Client ruft genau den Pfad, die Methode und den Content-Type des Vertrags', async () => {
		const { api, calls } = recordingApi(() => jsonResponse(201, { data: { accepted: true } }));
		await api.submitLead(lead());

		const server = contract.servers[0]!.url;
		const path = '/s/{key}/leads'.replace('{key}', SITE_KEY);
		expect(calls[0]!.url.href).toBe(server + path);
		expect(calls[0]!.method).toBe('POST');
		expect(calls[0]!.headers['Content-Type']).toBe('application/json');
		expect(calls[0]!.credentials).toBe('omit');
		const keyPattern = leadOperation.parameters.find((p) => p.name === 'key')!.schema.pattern!;
		expect(SITE_KEY).toMatch(new RegExp(keyPattern));
	});

	it('der Lead-Body erfüllt das strikte Schema — mit und ohne optionale Teile', async () => {
		const { api, calls } = recordingApi(() => jsonResponse(201, { data: { accepted: true } }));
		const fields = [
			{ name: 'email', type: 'email' as const },
			{ name: 'themen', type: 'multiselect' as const, options: ['Kauf', 'Verkauf'] },
			{ name: 'rueckruf', type: 'checkbox' as const },
			{ name: 'leer', type: 'text' as const },
		];

		await api.submitLead(
			lead({
				data: toLeadData(fields, { email: ' a@b.de ', themen: ['Kauf'], rueckruf: true, leer: '  ' }),
				attribution: { utmSource: 'google', referrerHost: 'google.de', capturedAt: new Date().toISOString() },
				website: '',
			}),
		);
		await api.submitLead(lead({ attribution: undefined, website: undefined }));

		for (const call of calls) {
			expect(validateLeadBody(call.body), JSON.stringify(validateLeadBody.errors)).toBe(true);
		}
		expect(calls[0]!.body).toMatchObject({ data: { email: 'a@b.de', themen: ['Kauf'], rueckruf: true } });
		expect(Object.keys(calls[1]!.body as object).sort()).toEqual([
			'captcha',
			'data',
			'funnelKey',
			'submissionId',
		]);
	});

	it('das Schema lehnt ab, was der Client nie senden darf', () => {
		const valid = lead();
		expect(validateLeadBody(valid)).toBe(true);
		expect(validateLeadBody({ ...valid, captcha: '' })).toBe(false);
		expect(validateLeadBody({ ...valid, captcha: undefined })).toBe(false);
		expect(validateLeadBody({ ...valid, extra: 1 })).toBe(false);
		expect(validateLeadBody({ ...valid, data: { 'e-mail adresse': 'x' } })).toBe(false);
	});

	it('beide Erfolgsantworten des Vertrags gelten als angenommen', async () => {
		const responses = leadOperation.responses;
		expect(coreSchema('LeadAccepted')(exampleOf(responses['201']))).toBe(true);
		expect(coreSchema('LeadAccepted')(exampleOf(responses['200']))).toBe(true);

		const live = await recordingApi(() => jsonResponse(201, exampleOf(responses['201']))).api.submitLead(
			lead(),
		);
		expect(live).toEqual({ ok: true, data: { accepted: true, dryRun: false } });
		const preview = await recordingApi(() => jsonResponse(200, exampleOf(responses['200']))).api.submitLead(
			lead(),
		);
		expect(preview).toEqual({ ok: true, data: { accepted: true, dryRun: true } });
	});

	it('jeder Fehlercode des Vertrags hat im Client eine feste Bedeutung', async () => {
		// Kommt im Core ein Code dazu, wird dieser Test rot, bis er hier (Leads) oder unter `BOOKING_CODES` steht.
		const expected: Record<string, [status: number, kind: SiteApiErrorKind]> = {
			invalid_json: [400, 'rejected'],
			captcha_failed: [400, 'captcha_failed'],
			origin_not_allowed: [403, 'forbidden'],
			not_found: [404, 'not_found'],
			site_not_found: [404, 'not_found'],
			funnel_not_found: [404, 'not_found'],
			method_not_allowed: [405, 'rejected'],
			payload_too_large: [413, 'rejected'],
			unsupported_media_type: [415, 'rejected'],
			validation_error: [422, 'validation'],
			rate_limited: [429, 'rate_limited'],
			internal_error: [500, 'server'],
			captcha_unavailable: [503, 'server'],
		};
		const codes = contract.components.schemas.Error.properties.code.enum;
		expect([...codes].sort()).toEqual([...Object.keys(expected), ...Object.keys(BOOKING_CODES)].sort());

		for (const code of Object.keys(expected)) {
			const [status, kind] = expected[code]!;
			expect(Object.keys(leadOperation.responses), code).toContain(String(status));
			const body = { error: 'x', message: 'Text vom Server', status, code };
			expect(coreSchema('Error')(body), code).toBe(true);
			const result = await recordingApi(() => jsonResponse(status, body)).api.submitLead(lead());
			expect(result, code).toMatchObject({ ok: false, error: { kind, code, status } });
		}
	});

	it('der Client liest das Fehlerbeispiel des Vertrags für 422', async () => {
		const example = exampleOf(leadOperation.responses['422']) as { details: { path: string }[] };
		expect(coreSchema('Error')(example)).toBe(true);
		const result = await recordingApi(() => jsonResponse(422, example)).api.submitLead(lead());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const fromExample = example.details
			.filter((d) => d.path.startsWith('data.'))
			.map((d) => d.path.split('.')[1]);
		expect(result.error.invalidFields).toEqual([...new Set(fromExample)]);
	});
});

describe('Vertrag Site-API v1: Captcha (Kopie aus dem Core)', () => {
	const operation = contract.paths['/s/{key}/captcha'].get;
	const maxLength = leadOperation.requestBody.content['application/json'].schema.properties.captcha.maxLength;

	it('das Formular holt die Aufgabe von genau diesem Pfad', () => {
		setSiteDataForTests({
			...emptySiteData(),
			api: { baseUrl: new URL(contract.servers[0]!.url).origin, siteKey: SITE_KEY },
		});
		try {
			expect(captchaChallengeUrl()).toBe(
				contract.servers[0]!.url + '/s/{key}/captcha'.replace('{key}', SITE_KEY),
			);
		} finally {
			setSiteDataForTests(null);
		}
		expect(Object.keys(operation.responses)).toContain('200');
	});

	it('das Beispiel des Vertrags hat die Form, die das Widget liest: { parameters, signature } ohne Hülle', () => {
		const example = exampleOf(operation.responses['200']) as Record<string, unknown>;
		expect(coreSchema('CaptchaChallenge')(example)).toBe(true);
		expect(Object.keys(example).sort()).toEqual(['parameters', 'signature']);
		const algorithm = (example.parameters as { algorithm: string }).algorithm;
		// Für diesen Algorithmus bringt das Paket den Worker mit.
		expect([...CAPTCHA_ALGORITHMS.pbkdf2, ...CAPTCHA_ALGORITHMS.sha]).toContain(algorithm);
	});

	it('die Test-Aufgabe des Dev-Servers erfüllt dasselbe Schema, und ihre Lösung passt ins Feld captcha', async () => {
		const challenge = (await createDevCaptchaChallenge('2c4e6a8b-0d1f-4a3c-9e5b-7d9f1b3d5f7a')) as Parameters<
			typeof solveChallenge
		>[0]['challenge'];
		const validate = coreSchema('CaptchaChallenge');
		expect(validate(challenge), JSON.stringify(validate.errors)).toBe(true);

		// Dieselbe Bibliothek, die im Widget rechnet.
		const solution = await solveChallenge({ challenge, deriveKey: pbkdf2.deriveKey });
		expect(solution).not.toBeNull();
		const payload = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
		expect(payload.length).toBeLessThanOrEqual(maxLength);
		expect(validateLeadBody(lead({ captcha: payload }))).toBe(true);
	});

	it('eine Seite ohne Kennung bekommt lokal trotzdem eine gültige Aufgabe', async () => {
		expect(coreSchema('CaptchaChallenge')(await createDevCaptchaChallenge(''))).toBe(true);
	});
});

describe('Vertrag Site-API v1: Sammlungen (Kopie aus dem Core)', () => {
	const listPath = '/s/{key}/collections/{collection}';
	const entryPath = '/s/{key}/collections/{collection}/{slug}';
	const list = contract.paths[listPath].get;
	const one = contract.paths[entryPath].get;
	const server = contract.servers[0]!.url;
	const fill = (template: string, values: Record<string, string>) =>
		template.replace(/\{(\w+)\}/g, (_all, name: string) => values[name]!);

	it('der Client ruft genau die Pfade des Vertrags, nur mit erlaubten Parametern', async () => {
		const { api, calls } = recordingApi(() => jsonResponse(200, { data: [] }));
		await api.getCollection('angebote', { limit: 500, offset: 99_999, sort: 'oldest' });
		await api.getCollection('angebote');
		await api.getEntry('angebote', 'altbau-leipzig');

		expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'GET']);
		expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe(
			server + fill(listPath, { key: SITE_KEY, collection: 'angebote' }),
		);
		expect(calls[2]!.url.href).toBe(
			server + fill(entryPath, { key: SITE_KEY, collection: 'angebote', slug: 'altbau-leipzig' }),
		);

		// Jeder Query-Parameter steht im Vertrag, und sein Wert liegt im erlaubten Bereich.
		const params = Object.fromEntries(
			list.parameters.filter((p) => p.in === 'query').map((p) => [p.name, p.schema]),
		);
		for (const [name, value] of calls[0]!.url.searchParams) {
			const schema = params[name] as { minimum?: number; maximum?: number; enum?: string[] } | undefined;
			expect(schema, name).toBeDefined();
			if (schema!.enum) expect(schema!.enum).toContain(value);
			if (schema!.maximum !== undefined) expect(Number(value)).toBeLessThanOrEqual(schema!.maximum);
			if (schema!.minimum !== undefined) expect(Number(value)).toBeGreaterThanOrEqual(schema!.minimum);
		}
		expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
			limit: '100',
			offset: '10000',
			sort: 'publishedAt',
		});
		// Ohne Angaben schickt der Client keine Parameter: Es gelten die Standardwerte des Servers.
		expect(calls[1]!.url.search).toBe('');
		const collectionPattern = (
			list.parameters.find((p) => p.name === 'collection')!.schema as { pattern: string }
		).pattern;
		expect('angebote').toMatch(new RegExp(collectionPattern));
	});

	it('der Client versteht die Beispielantworten, und sie erfüllen ihr Schema', async () => {
		const listExample = exampleOf(list.responses['200']);
		const entryExample = exampleOf(one.responses['200']);
		expect(coreSchema('CollectionList')(listExample)).toBe(true);
		expect(coreSchema('CollectionEntry')(entryExample)).toBe(true);

		const listed = await recordingApi(() => jsonResponse(200, listExample)).api.getCollection('angebote');
		expect(listed.ok).toBe(true);
		if (!listed.ok) return;
		expect(listed.data.total).toBe(1);
		const [entry] = listed.data.entries;
		expect(entry).toMatchObject({ slug: 'altbau-leipzig', publishedAt: '2026-11-01T09:00:00.000Z' });
		// Richtext kommt als bereinigtes HTML und bleibt, wie er ist.
		expect(entry!.data.beschreibung).toBe('<p><strong>Drei</strong> Zimmer</p>');
		// Medien stehen nur unter `media`; die drei Größen bleiben vollständig erhalten.
		expect(entry!.data).not.toHaveProperty('bilder');
		const variants = entry!.media.bilder![0]!.variants;
		expect(variants.map((v) => v.url.split('/').pop())).toEqual(['thumb.jpg', 'medium.jpg', 'large.jpg']);
		expect(variants.map((v) => v.width)).toEqual([400, 800, 1600]);

		const single = await recordingApi(() => jsonResponse(200, entryExample)).api.getEntry('angebote', 'x');
		expect(single).toMatchObject({ ok: true, data: { slug: 'altbau-leipzig', media: { bilder: [] } } });
	});

	it('eine unbekannte Sammlung oder ein unbekannter Eintrag ist not_found', async () => {
		expect(Object.keys(list.responses)).toContain('404');
		expect(Object.keys(one.responses)).toContain('404');
		const body = { error: 'Not Found', message: 'x', status: 404, code: 'not_found' };
		expect(coreSchema('Error')(body)).toBe(true);
		const listed = await recordingApi(() => jsonResponse(404, body)).api.getCollection('gibt-es-nicht');
		const single = await recordingApi(() => jsonResponse(404, body)).api.getEntry(
			'angebote',
			'gibt-es-nicht',
		);
		for (const result of [listed, single]) {
			expect(result).toMatchObject({
				ok: false,
				error: { kind: 'not_found', code: 'not_found', status: 404 },
			});
		}
	});
});

describe('Vertrag Site-API v1: Terminbuchung (Kopie aus dem Core)', () => {
	const BOOKING = 'erstgespraech';
	const booking = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
		submissionId: crypto.randomUUID(),
		start: '2026-12-01T09:00:00.000Z',
		tz: 'Europe/Berlin',
		attendee: { firstName: 'Erika', email: 'erika@beispiel.de' },
		captcha: 'loesung',
		...overrides,
	});

	it('der Client ruft genau die Pfade, Methoden und Parameter des Vertrags', async () => {
		const { api, calls } = recordingApi(() =>
			jsonResponse(200, exampleOf(bookingInfoOperation.responses['200'])),
		);
		await api.getBooking(BOOKING);
		await api.getBookingSlots(BOOKING, { from: '2026-12-01T00:00:00.000Z', to: '2026-12-08T00:00:00.000Z' });
		await api.createBooking(BOOKING, booking());
		const server = contract.servers[0]!.url;
		const base = `${server}/s/${SITE_KEY}/booking/${BOOKING}`;
		expect(calls.map((c) => [c.method, c.url.origin + c.url.pathname])).toEqual([
			['GET', base],
			['GET', `${base}/slots`],
			['POST', `${base}/bookings`],
		]);
		const allowed = bookingSlotsOperation.parameters.filter((p) => p.in === 'query').map((p) => p.name);
		expect([...calls[1]!.url.searchParams.keys()].every((k) => allowed.includes(k))).toBe(true);
		expect(calls[2]!.headers['Content-Type']).toBe('application/json');
		expect(calls.every((c) => c.credentials === 'omit')).toBe(true);
		const keyPattern = bookingOperation.parameters.find((p) => p.name === 'bookingKey')!.schema.pattern!;
		expect(BOOKING).toMatch(new RegExp(keyPattern));
		expect('a'.repeat(51)).not.toMatch(new RegExp(keyPattern));
	});

	it('der Buchungs-Body erfüllt das strikte Schema — mit und ohne optionale Teile', () => {
		expect(validateBookingBody(booking()), JSON.stringify(validateBookingBody.errors)).toBe(true);
		const full = booking({
			attendee: { firstName: 'Erika', lastName: 'Muster', email: 'erika@beispiel.de', phone: '0341 123456' },
			answers: { anliegen: 'Verkauf', flaeche: 85, rueckruf: true, themen: ['Kauf'] },
			locationType: 'phone',
			attribution: { utmSource: 'google' },
			website: '',
		});
		expect(validateBookingBody(full), JSON.stringify(validateBookingBody.errors)).toBe(true);
		expect(validateBookingBody({ ...booking(), extra: 1 })).toBe(false);
		expect(validateBookingBody({ ...booking(), captcha: '' })).toBe(false);
		expect(
			validateBookingBody({ ...booking(), attendee: { firstName: 'E', email: 'x@y.de', anrede: 'Frau' } }),
		).toBe(false);
	});

	it('der Client versteht die Beispielantworten, und sie erfüllen ihr Schema', async () => {
		const infoExample = exampleOf(bookingInfoOperation.responses['200']);
		expect(coreSchema('BookingInfo')(infoExample)).toBe(true);
		const info = await recordingApi(() => jsonResponse(200, infoExample)).api.getBooking(BOOKING);
		expect(info.ok && info.data.key).toBe((infoExample as { data: { key: string } }).data.key);

		const slotsExample = exampleOf(bookingSlotsOperation.responses['200']) as { data: { slots: unknown[] } };
		expect(coreSchema('BookingSlots')(slotsExample)).toBe(true);
		const slots = await recordingApi(() => jsonResponse(200, slotsExample)).api.getBookingSlots(BOOKING, {
			from: '2026-12-01T00:00:00.000Z',
			to: '2026-12-02T00:00:00.000Z',
		});
		expect(slots.ok && slots.data.slots).toHaveLength(slotsExample.data.slots.length);

		for (const [status, dryRun] of [
			['201', false],
			['200', true],
		] as const) {
			const example = exampleOf(bookingOperation.responses[status]);
			expect(coreSchema('BookingCreated')(example)).toBe(true);
			const result = await recordingApi(() => jsonResponse(Number(status), example)).api.createBooking(
				BOOKING,
				booking(),
			);
			expect(result).toMatchObject({ ok: true, data: { booked: true, dryRun } });
		}
	});

	it('jeder Fehlercode der Buchung hat im Client eine feste Bedeutung', async () => {
		for (const [code, [status, kind]] of Object.entries(BOOKING_CODES)) {
			const body = { error: 'x', message: 'Text vom Server', status, code };
			expect(coreSchema('Error')(body), code).toBe(true);
			const result = await recordingApi(() => jsonResponse(status, body)).api.createBooking(
				BOOKING,
				booking(),
			);
			expect(result, code).toMatchObject({ ok: false, error: { kind, code, status } });
			expect(JSON.stringify(result)).not.toContain('Text vom Server');
		}
		for (const code of ['booking_unavailable', 'slot_taken', 'not_qualified']) {
			const status = BOOKING_CODES[code]![0];
			expect(Object.keys(bookingOperation.responses), code).toContain(String(status));
		}
	});

	it('das 422-Beispiel des Vertrags nennt Pfade, die der Client den Feldern zuordnet', async () => {
		const example = exampleOf(bookingOperation.responses['422']) as { details?: { path: string }[] };
		expect(coreSchema('Error')(example)).toBe(true);
		const result = await recordingApi(() => jsonResponse(422, example)).api.createBooking(BOOKING, booking());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.invalidPaths).toEqual([...new Set((example.details ?? []).map((d) => d.path))]);
		expect(result.error.invalidPaths.every((p) => /^(attendee|answers|start)\b/.test(p))).toBe(true);
	});
});
