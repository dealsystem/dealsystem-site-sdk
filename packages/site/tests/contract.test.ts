// Prüft den Client gegen die kopierte Beschreibung der Site-API.
import Ajv2020 from 'ajv/dist/2020.js';
import contract from '../contract/site-api.v1.json' with { type: 'json' };
import { createSiteApi } from '../src/lib/client/siteApi.js';
import { toLeadData } from '../src/lib/client/validation.js';
import { jsonResponse } from './helpers.js';

const ajv = new Ajv2020({ strict: false, formats: { uuid: /^[0-9a-f-]{36}$/i } });
ajv.addSchema(contract, 'contract');
const schema = (name: string) => ajv.getSchema(`contract#/components/schemas/${name}`)!;

interface Call {
	method: string;
	path: string;
	body: unknown;
}

function recordingApi(answer: () => Response) {
	const calls: Call[] = [];
	const api = createSiteApi({
		baseUrl: 'https://core.test',
		siteKey: 'dsp_KEY',
		fetch: async (input, init) => {
			const url = new URL(String(input));
			calls.push({
				method: init?.method ?? 'GET',
				path: url.pathname,
				body: init?.body ? JSON.parse(String(init.body)) : null,
			});
			return answer();
		},
	});
	return { api, calls };
}

/** Sucht den Pfad des Vertrags, der zu einer echten Anfrage passt. */
function operationFor(call: Call): Record<string, unknown> | undefined {
	for (const [template, methods] of Object.entries(contract.paths)) {
		const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
		if (pattern.test(call.path))
			return (methods as Record<string, Record<string, unknown>>)[call.method.toLowerCase()];
	}
	return undefined;
}

type Example = { content: { 'application/json': { example: unknown } } };

describe('Vertrag Site-API v1', () => {
	it('jede Anfrage des Clients trifft einen Pfad und eine Methode des Vertrags', async () => {
		const { api, calls } = recordingApi(() => jsonResponse(200, { data: [] }));
		await api.submitLead({ funnelKey: 'k', submissionId: crypto.randomUUID(), data: {}, website: '' });
		await api.getCollection('angebote', { limit: 3, offset: 3, sort: 'newest' });
		await api.getEntry('angebote', 'altbau');

		expect(calls).toHaveLength(3);
		for (const call of calls) expect(operationFor(call), `${call.method} ${call.path}`).toBeDefined();
	});

	it('der Lead-Body erfüllt das strikte Schema — mit und ohne optionale Teile', async () => {
		const validate = schema('LeadRequest');
		const { api, calls } = recordingApi(() => jsonResponse(201, { data: { accepted: true } }));
		const fields = [
			{ name: 'email', type: 'email' as const },
			{ name: 'themen', type: 'multiselect' as const, options: ['Kauf', 'Verkauf'] },
			{ name: 'rueckruf', type: 'checkbox' as const },
			{ name: 'leer', type: 'text' as const },
		];

		await api.submitLead({
			funnelKey: 'kontakt',
			submissionId: crypto.randomUUID(),
			data: toLeadData(fields, { email: ' a@b.de ', themen: ['Kauf'], rueckruf: true, leer: '  ' }),
			attribution: { utmSource: 'google', referrerHost: 'google.de', capturedAt: new Date().toISOString() },
			captcha: 'loesung',
			website: '',
		});
		await api.submitLead({
			funnelKey: 'kontakt',
			submissionId: crypto.randomUUID(),
			data: { email: 'a@b.de' },
			attribution: undefined,
			captcha: undefined,
			website: '',
		});

		for (const call of calls) {
			expect(validate(call.body), JSON.stringify(validate.errors)).toBe(true);
		}
		expect(calls[0]!.body).toMatchObject({ data: { email: 'a@b.de', themen: ['Kauf'], rueckruf: true } });
		expect(Object.keys(calls[1]!.body as object).sort()).toEqual([
			'data',
			'funnelKey',
			'submissionId',
			'website',
		]);
	});

	it('der Client versteht die Beispielantworten des Vertrags, und sie erfüllen ihr Schema', async () => {
		const paths = contract.paths;
		const lead = paths['/api/site/v1/s/{publishableKey}/leads'].post.responses;
		const list = paths['/api/site/v1/s/{publishableKey}/collections/{key}'].get.responses;
		const one = paths['/api/site/v1/s/{publishableKey}/collections/{key}/{slug}'].get.responses;
		const example = (response: unknown) => (response as Example).content['application/json'].example;

		expect(schema('LeadAcceptedResponse')(example(lead['201']))).toBe(true);
		expect(schema('CollectionListResponse')(example(list['200']))).toBe(true);
		expect(schema('CollectionEntryResponse')(example(one['200']))).toBe(true);
		expect(schema('Error')(example(contract.components.responses.Error))).toBe(true);

		const accepted = await recordingApi(() => jsonResponse(201, example(lead['201']))).api.submitLead({
			funnelKey: 'k',
			submissionId: crypto.randomUUID(),
			data: {},
			website: '',
		});
		expect(accepted).toEqual({ ok: true, data: { accepted: true, dryRun: false } });

		const listed = await recordingApi(() => jsonResponse(200, example(list['200']))).api.getCollection(
			'angebote',
		);
		expect(listed.ok && listed.data.entries[0]!.media.bilder![0]!.variants).toHaveLength(2);
		expect(listed.ok && listed.data.total).toBe(1);

		const entry = await recordingApi(() => jsonResponse(200, example(one['200']))).api.getEntry(
			'angebote',
			'x',
		);
		expect(entry).toMatchObject({ ok: true, data: { slug: 'altbau-leipzig' } });

		const failed = await recordingApi(() =>
			jsonResponse(400, example(contract.components.responses.Error)),
		).api.submitLead({ funnelKey: 'k', submissionId: crypto.randomUUID(), data: {}, website: '' });
		expect(failed).toMatchObject({ ok: false, error: { kind: 'captcha_failed' } });
	});
});
