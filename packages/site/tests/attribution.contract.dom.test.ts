// Attribution Fassung 2 und Seitenaufrufe gegen den Vertrag der Site-API (Kopie aus dem Core): Was das SDK im
// Browser baut, muss das strikte Schema des Core erfüllen, ohne und mit Einwilligung.
import Ajv2020 from 'ajv/dist/2020.js';
import contract from '../contract/site-api.v1.json' with { type: 'json' };
import {
	buildLeadAttribution,
	resetAttributionForTests,
	syncAttribution,
} from '../src/lib/client/attribution.js';
import { resetPageviewsForTests, trackPageview } from '../src/lib/client/pageview.js';
import { createSiteApi } from '../src/lib/client/siteApi.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { jsonResponse, testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const ajv = new Ajv2020({ strict: false, formats: { uuid: true } });
ajv.addSchema(contract, 'core');
const schemaOf = (op: { requestBody: { content: { 'application/json': { schema: object } } } }) =>
	ajv.compile(op.requestBody.content['application/json'].schema);
const validateLead = schemaOf(contract.paths['/s/{key}/leads'].post);
const trackOp = contract.paths['/s/{key}/track'].post;
const validateTrack = schemaOf(trackOp);
const accepted = ajv.getSchema('core#/components/schemas/PageviewAccepted')!;

const fetchSpy = vi.fn<typeof fetch>();
const LANDING =
	'/verkaufen?utm_source=google&utm_medium=cpc&utm_campaign=herbst&gclid=Cj0K-abc&fbclid=IwAR_Xy9&msclkid=ms1&partner=immo24';

const leadBody = (attribution: unknown) => ({
	funnelKey: 'kontakt',
	submissionId: crypto.randomUUID(),
	data: { email: 'a@b.de' },
	attribution,
	captcha: 'loesung',
});

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	resetPageviewsForTests();
	window.history.replaceState({}, '', LANDING);
	Object.defineProperty(document, 'referrer', { value: 'https://www.google.com/', configurable: true });
	document.cookie = '_fbp=fb.1.1700000000000.123';
	resetAttributionForTests();
	fetchSpy.mockReset();
	fetchSpy.mockResolvedValue(jsonResponse(202, { data: { accepted: true } }));
	vi.stubGlobal('fetch', fetchSpy);
	setSiteDataForTests(testSiteData());
});

afterEach(() => {
	vi.unstubAllGlobals();
	setSiteDataForTests(null);
	document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
	window.history.replaceState({}, '', '/');
});

describe('Vertrag: attribution im Lead (Fassung 2)', () => {
	it('ohne Einwilligung erfüllt das strikte Schema', () => {
		syncAttribution({ statistics: false, marketing: false, media: false });
		const body = leadBody(buildLeadAttribution({ statistics: false, marketing: false, media: false }, null));
		expect(validateLead(body), JSON.stringify(validateLead.errors)).toBe(true);
	});

	it('mit Einwilligung, Klick-IDs, Besuchs-ID, Parametern und zwei Besuchen erfüllt das strikte Schema', () => {
		consent.save(['marketing']);
		window.history.replaceState({}, '', '/?utm_source=newsletter');
		resetAttributionForTests();
		consent.save(['marketing']);
		const attribution = buildLeadAttribution(consent.granted(), consent.decidedAt)!;
		expect(attribution.clickIds?.gclid).toBe('Cj0K-abc');
		expect(attribution.visitorId).not.toBeNull();
		const body = leadBody(attribution);
		expect(validateLead(body), JSON.stringify(validateLead.errors)).toBe(true);
	});

	it('das Schema des Core lehnt ab, was das SDK nie sendet', () => {
		const ok = buildLeadAttribution({ statistics: false, marketing: false, media: false }, null)!;
		expect(validateLead(leadBody({ ...ok, extra: 1 }))).toBe(false);
		expect(validateLead(leadBody({ ...ok, consent: undefined }))).toBe(false);
		expect(validateLead(leadBody({ ...ok, clickIds: { gclid: 'x'.repeat(501) } }))).toBe(false);
	});
});

describe('Vertrag: POST …/track', () => {
	const sent = (i: number) => JSON.parse(String(fetchSpy.mock.calls[i]![1]!.body));

	it('Einstieg und Folgeseite, ohne und mit Einwilligung, erfüllen das strikte Schema', () => {
		consent.init();
		trackPageview('/verkaufen');
		trackPageview('/kontakt');
		consent.save(['marketing']);
		trackPageview('/danke');
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		for (let i = 0; i < 3; i++)
			expect(validateTrack(sent(i)), JSON.stringify(validateTrack.errors)).toBe(true);
		expect(sent(2).visitorId).toMatch(/^[0-9a-f-]{36}$/);
		const url = new URL(String(fetchSpy.mock.calls[0]![0]));
		expect(url.pathname).toMatch(/\/api\/site\/v1\/s\/[^/]+\/track$/);
		expect(contract.paths).toHaveProperty(['/s/{key}/track']);
		expect(fetchSpy.mock.calls[0]![1]).toMatchObject({
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		});
	});

	it('die Erfolgsantworten des Vertrags gelten als angenommen, die Vorschau als dryRun', async () => {
		const example = (code: '200' | '202') =>
			(trackOp.responses[code] as { content: { 'application/json': { example: unknown } } }).content[
				'application/json'
			].example;
		for (const code of ['200', '202'] as const) {
			expect(accepted(example(code)), code).toBe(true);
			const api = createSiteApi({
				baseUrl: 'https://core.test',
				siteKey: 'dsp_abcd1234_abcdefghijklmnopqrstuvwx',
				fetch: async () => jsonResponse(Number(code), example(code)),
			});
			const result = await api.track({ path: '/' });
			expect(result).toEqual({ ok: true, data: { accepted: true, dryRun: code === '200' } });
		}
	});
});
