import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSiteApi, type LeadRequest } from '../src/lib/client/siteApi.js';

interface Recorded {
	method: string;
	url: string;
	headers: IncomingMessage['headers'];
	body: string;
}

type Reply = { status: number; body: string; headers?: Record<string, string>; delayMs?: number };

let server: Server;
let baseUrl: string;
let requests: Recorded[] = [];
let reply: (request: Recorded) => Reply;

const json = (status: number, body: unknown, headers?: Record<string, string>): Reply => ({
	status,
	body: JSON.stringify(body),
	headers: { 'Content-Type': 'application/json', ...headers },
});

beforeAll(async () => {
	server = createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += chunk;
		const recorded = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
		requests.push(recorded);
		const answer = reply(recorded);
		if (answer.delayMs) await new Promise((r) => setTimeout(r, answer.delayMs));
		res.writeHead(answer.status, answer.headers);
		res.end(answer.body);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
	requests = [];
	reply = () => json(201, { data: { accepted: true } });
});

const lead: LeadRequest = {
	funnelKey: 'kontakt',
	submissionId: '6f1f7a52-3d4e-4f0a-9a43-1c2b3d4e5f60',
	data: { email: 'a@b.de', nachricht: 'Hallo' },
	attribution: { utmSource: 'google' },
	captcha: 'loesung',
	website: '',
};

const api = () => createSiteApi({ baseUrl, siteKey: 'dsp_KEY' });

describe('submitLead', () => {
	it('schickt den Body laut Vertrag an den Pfad mit dem Publishable Key', async () => {
		const result = await api().submitLead(lead);

		expect(result).toEqual({ ok: true, data: { accepted: true, dryRun: false } });
		expect(requests).toHaveLength(1);
		expect(requests[0]!.method).toBe('POST');
		expect(requests[0]!.url).toBe('/api/site/v1/s/dsp_KEY/leads');
		expect(requests[0]!.headers['content-type']).toBe('application/json');
		expect(requests[0]!.headers.cookie).toBeUndefined();
		expect(JSON.parse(requests[0]!.body)).toEqual(lead);
	});

	it('meldet den Probelauf der Vorschau', async () => {
		reply = () => json(201, { data: { accepted: true, dryRun: true } });
		expect(await api().submitLead(lead)).toEqual({ ok: true, data: { accepted: true, dryRun: true } });
	});

	it('wertet eine 2xx-Antwort ohne accepted: true nie als Erfolg', async () => {
		for (const body of [
			{ data: {} },
			{ data: { accepted: false } },
			{ data: { accepted: 'true' } },
			{},
			[],
		]) {
			reply = () => json(200, body);
			const result = await api().submitLead(lead);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error.kind).toBe('invalid_response');
		}
	});

	it('liefert 429 als rate_limited mit Wartezeit', async () => {
		reply = () =>
			json(
				429,
				{ error: 'Too Many Requests', message: 'x', status: 429, code: 'rate_limited' },
				{ 'Retry-After': '42' },
			);
		const result = await api().submitLead(lead);
		expect(result).toMatchObject({
			ok: false,
			error: { kind: 'rate_limited', status: 429, code: 'rate_limited', retryAfterSeconds: 42 },
		});
	});

	it.each([
		[400, 'captcha_failed', 'captcha_failed'],
		[400, 'validation_failed', 'validation'],
		[422, undefined, 'validation'],
		[404, 'funnel_not_found', 'not_found'],
		[403, 'origin_not_allowed', 'forbidden'],
		[500, undefined, 'server'],
		[503, undefined, 'server'],
	])('ordnet Status %i (%s) als %s ein', async (status, code, kind) => {
		reply = () => json(status, { error: 'x', message: 'Text vom Server', status, code });
		const result = await api().submitLead(lead);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe(kind);
		expect(result.error.status).toBe(status);
		// Text vom Server wird nie durchgereicht.
		expect(result.error.message).not.toContain('Text vom Server');
		expect(result.error.message.length).toBeGreaterThan(10);
	});

	it('übernimmt Feldfehler des Servers', async () => {
		reply = () => json(422, { error: 'x', message: 'x', status: 422, fields: { email: 'ungültig', n: 5 } });
		const result = await api().submitLead(lead);
		expect(result).toMatchObject({ ok: false, error: { kind: 'validation', fields: { email: 'ungültig' } } });
	});

	it('übersteht eine Fehlerseite ohne JSON', async () => {
		reply = () => ({
			status: 502,
			body: '<html>Bad Gateway</html>',
			headers: { 'Content-Type': 'text/html' },
		});
		expect(await api().submitLead(lead)).toMatchObject({ ok: false, error: { kind: 'server', status: 502 } });
	});

	it('übersteht eine 200-Antwort ohne JSON', async () => {
		reply = () => ({ status: 200, body: 'ok' });
		expect(await api().submitLead(lead)).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
	});

	it('liefert einen Netzfehler als Wert statt zu werfen', async () => {
		const offline = createSiteApi({ baseUrl: 'http://127.0.0.1:1', siteKey: 'dsp_KEY' });
		expect(await offline.submitLead(lead)).toMatchObject({
			ok: false,
			error: { kind: 'network', status: null },
		});
	});

	it('bricht nach der Zeitgrenze ab', async () => {
		reply = () => ({ ...json(201, { data: { accepted: true } }), delayMs: 300 });
		const slow = createSiteApi({ baseUrl, siteKey: 'dsp_KEY', timeoutMs: 30 });
		expect(await slow.submitLead(lead)).toMatchObject({ ok: false, error: { kind: 'network' } });
	});

	it('übersteht ein fetch, das wirft', async () => {
		const broken = createSiteApi({
			baseUrl,
			siteKey: 'k',
			fetch: () => {
				throw new TypeError('kaputt');
			},
		});
		expect(await broken.submitLead(lead)).toMatchObject({ ok: false, error: { kind: 'network' } });
	});
});

describe('getCollection / getEntry', () => {
	const entry = {
		slug: 'altbau',
		publishedAt: '2026-11-01T09:00:00.000Z',
		data: { titel: 'Altbau' },
		media: {
			bilder: [
				{
					id: 'a1',
					kind: 'image',
					alt: 'Fassade',
					width: 1600,
					height: 1067,
					variants: [
						{ url: '/_ds/media/s1/a1/480.jpg', width: 480, format: 'jpeg' },
						{ url: 'javascript:alert(1)', width: 800, format: 'jpeg' },
						{ url: '//evil.test/x.jpg', width: 900, format: 'jpeg' },
						{ url: '/_ds/media/s1/a1/x.gif', width: 900, format: 'gif' },
					],
				},
				{ kind: 'image' },
				'kaputt',
			],
		},
	};

	it('fragt mit limit, offset und sort an und liefert geprüfte Einträge', async () => {
		reply = () => json(200, { data: [entry, { ohne: 'slug' }], meta: { total: 7 } });
		const result = await api().getCollection('angebote', { limit: 500, offset: 12, sort: 'oldest' });

		expect(requests[0]!.method).toBe('GET');
		expect(requests[0]!.url).toBe(
			'/api/site/v1/s/dsp_KEY/collections/angebote?limit=100&offset=12&sort=publishedAt',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.total).toBe(7);
		expect(result.data.entries).toHaveLength(1);
		const bilder = result.data.entries[0]!.media.bilder!;
		expect(bilder).toHaveLength(1);
		expect(bilder[0]!.variants).toEqual([{ url: '/_ds/media/s1/a1/480.jpg', width: 480, format: 'jpeg' }]);
	});

	it('lehnt eine Liste in falscher Form ab', async () => {
		reply = () => json(200, { data: { nicht: 'liste' } });
		expect(await api().getCollection('angebote')).toMatchObject({
			ok: false,
			error: { kind: 'invalid_response' },
		});
	});

	it('lädt einen Eintrag und kodiert Schlüssel und Slug', async () => {
		reply = () => json(200, { data: entry });
		const result = await api().getEntry('angebote', 'a/b c');
		expect(requests[0]!.url).toBe('/api/site/v1/s/dsp_KEY/collections/angebote/a%2Fb%20c');
		expect(result).toMatchObject({ ok: true, data: { slug: 'altbau' } });
	});

	it('meldet einen unbekannten Eintrag als not_found', async () => {
		reply = () => json(404, { error: 'Not Found', message: 'x', status: 404, code: 'entry_not_found' });
		expect(await api().getEntry('angebote', 'fehlt')).toMatchObject({
			ok: false,
			error: { kind: 'not_found', code: 'entry_not_found' },
		});
	});
});
