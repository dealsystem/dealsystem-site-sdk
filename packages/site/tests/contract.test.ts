// Prüft den Client gegen die Beschreibung der Site-API: Leads gegen die Kopie
// aus dem Core, Sammlungen gegen die vorläufige, von Hand abgeleitete Datei.
import Ajv2020 from 'ajv/dist/2020.js';
import collectionsContract from '../contract/site-api.collections.vorlaeufig.json' with { type: 'json' };
import contract from '../contract/site-api.v1.json' with { type: 'json' };
import { createSiteApi, type LeadRequest, type SiteApiErrorKind } from '../src/lib/client/siteApi.js';
import { toLeadData } from '../src/lib/client/validation.js';
import { jsonResponse } from './helpers.js';

const ajv = new Ajv2020({ strict: false, formats: { uuid: true } });
ajv.addSchema(contract, 'core');
ajv.addSchema(collectionsContract, 'collections');
const coreSchema = (name: string) => ajv.getSchema(`core#/components/schemas/${name}`)!;
const collectionsSchema = (name: string) => ajv.getSchema(`collections#/components/schemas/${name}`)!;

const leadOperation = contract.paths['/s/{key}/leads'].post;
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
		await api.submitLead(lead({ attribution: undefined, captcha: 'none', website: undefined }));

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
		// Kommt im Core ein Code dazu, wird dieser Test rot, bis er hier eingeordnet ist.
		const expected: Record<string, [status: number, kind: SiteApiErrorKind]> = {
			invalid_json: [400, 'rejected'],
			captcha_failed: [400, 'captcha_failed'],
			origin_not_allowed: [403, 'forbidden'],
			not_found: [404, 'not_found'],
			site_not_found: [404, 'not_found'],
			funnel_not_found: [404, 'not_found'],
			method_not_allowed: [405, 'rejected'],
			unsupported_media_type: [415, 'rejected'],
			validation_error: [422, 'validation'],
			rate_limited: [429, 'rate_limited'],
			internal_error: [500, 'server'],
			captcha_unavailable: [503, 'server'],
		};
		const codes = contract.components.schemas.Error.properties.code.enum;
		expect([...codes].sort()).toEqual(Object.keys(expected).sort());

		for (const code of codes) {
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

describe('Sammlungen (vorläufiger Vertrag)', () => {
	const paths = collectionsContract.paths;
	const list = paths['/api/site/v1/s/{publishableKey}/collections/{key}'].get.responses;
	const one = paths['/api/site/v1/s/{publishableKey}/collections/{key}/{slug}'].get.responses;

	it('jede Anfrage des Clients trifft einen Pfad des Vertrags', async () => {
		const { api, calls } = recordingApi(() => jsonResponse(200, { data: [] }));
		await api.getCollection('angebote', { limit: 3, offset: 3, sort: 'newest' });
		await api.getEntry('angebote', 'altbau');

		for (const call of calls) {
			const hit = Object.keys(paths).some((template) =>
				new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(call.url.pathname),
			);
			expect(hit, call.url.pathname).toBe(true);
			expect(call.method).toBe('GET');
		}
	});

	it('der Client versteht die Beispielantworten, und sie erfüllen ihr Schema', async () => {
		expect(collectionsSchema('CollectionListResponse')(exampleOf(list['200']))).toBe(true);
		expect(collectionsSchema('CollectionEntryResponse')(exampleOf(one['200']))).toBe(true);

		const listed = await recordingApi(() => jsonResponse(200, exampleOf(list['200']))).api.getCollection(
			'angebote',
		);
		expect(listed.ok && listed.data.entries[0]!.media.bilder![0]!.variants).toHaveLength(2);
		expect(listed.ok && listed.data.total).toBe(1);

		const entry = await recordingApi(() => jsonResponse(200, exampleOf(one['200']))).api.getEntry(
			'angebote',
			'x',
		);
		expect(entry).toMatchObject({ ok: true, data: { slug: 'altbau-leipzig' } });
	});
});
