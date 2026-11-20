// Attribution Fassung 2: was ohne und mit Einwilligung erfasst, gespeichert, gesendet und gelöscht wird.
import {
	buildLeadAttribution,
	readParams,
	resetAttributionForTests,
	syncAttribution,
} from '../src/lib/client/attribution.js';
import { resetPageviewsForTests, trackPageview } from '../src/lib/client/pageview.js';
import {
	leadEventId,
	loadTracking,
	reportLeadConversion,
	resetTrackingForTests,
} from '../src/lib/client/tracking.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { reloadPage } from '../src/lib/internal/reload.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { jsonResponse, testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const NONE = { statistics: false, marketing: false, media: false };
const MARKETING = { statistics: false, marketing: true, media: false };
const LANDING =
	'/verkaufen?utm_source=google&utm_medium=cpc&gclid=Cj0K-abc&fbclid=IwAR_Xy9&msclkid=ms1&partner=immo24';
const fetchSpy = vi.fn<typeof fetch>();

function land(url: string, referrer = '') {
	window.history.replaceState({}, '', url);
	Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
	resetAttributionForTests();
}

const storedAttr = () => JSON.parse(localStorage.getItem('ds-attr') ?? 'null');

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
	consent.resetForTests();
	resetTrackingForTests();
	resetPageviewsForTests();
	vi.mocked(reloadPage).mockReset();
	fetchSpy.mockReset();
	fetchSpy.mockResolvedValue(jsonResponse(202, { data: { accepted: true } }));
	vi.stubGlobal('fetch', fetchSpy);
	setSiteDataForTests(testSiteData({ tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' } }));
	land(LANDING, 'https://www.google.com/search?q=haus');
});

afterEach(() => {
	vi.unstubAllGlobals();
	setSiteDataForTests(null);
	window.history.replaceState({}, '', '/');
});

describe('ohne Einwilligung', () => {
	it('nur der aktuelle Besuch: keine Klick-IDs, keine Besuchs-ID, nichts im Browser-Speicher', () => {
		document.cookie = '_fbp=fb.1.1700000000000.123';
		sessionStorage.setItem('ds-first-touch', '{"utmSource":"alt"}');
		syncAttribution(NONE);
		const attribution = buildLeadAttribution(NONE, null)!;
		expect(attribution).toEqual({
			v: 2,
			first: {
				source: 'google',
				medium: 'cpc',
				referrerHost: 'www.google.com',
				landingPath: '/verkaufen',
				at: expect.any(String),
			},
			last: attribution.first,
			touches: 1,
			clickIds: null,
			visitorId: null,
			params: { partner: 'immo24' },
			consent: { statistics: false, marketing: false, at: null },
		});
		expect(JSON.stringify(attribution)).not.toMatch(/Cj0K|IwAR|ms1|fb\.1\./);
		expect(localStorage.length).toBe(0);
		// Auch die Fassung 1 in sessionStorage verschwindet.
		expect(sessionStorage.length).toBe(0);
	});

	it('Seitenaufruf ohne Besuchs-ID, mit Kampagne nur beim Einstieg', async () => {
		consent.init();
		trackPageview('/verkaufen');
		trackPageview('/verkaufen');
		trackPageview('/kontakt');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('https://core.test/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/track');
		expect(init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
		expect(JSON.parse(String(init!.body))).toEqual({
			path: '/verkaufen',
			landing: true,
			utm: { source: 'google', medium: 'cpc' },
			referrerHost: 'www.google.com',
			consent: { statistics: false, marketing: false, at: null },
		});
		expect(JSON.parse(String(fetchSpy.mock.calls[1]![1]!.body))).toEqual({
			path: '/kontakt',
			landing: false,
			consent: { statistics: false, marketing: false, at: null },
		});
		expect(localStorage.length).toBe(0);
	});
});

describe('mit Einwilligung „Marketing“', () => {
	it('Klick-IDs (fbc im Meta-Format), _fbp, Besuchs-ID, gespeichert und im Lead', () => {
		document.cookie = '_fbp=fb.1.1700000000000.123';
		consent.save(['marketing']);
		const attribution = buildLeadAttribution(MARKETING, consent.decidedAt)!;
		expect(attribution.clickIds).toEqual({
			gclid: 'Cj0K-abc',
			fbc: expect.stringMatching(/^fb\.1\.\d{13}\.IwAR_Xy9$/),
			msclkid: 'ms1',
			fbp: 'fb.1.1700000000000.123',
		});
		expect(attribution.visitorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/);
		expect(attribution.consent).toEqual({ statistics: false, marketing: true, at: consent.decidedAt });
		expect(storedAttr()).toMatchObject({
			first: { source: 'google', landingPath: '/verkaufen' },
			touches: 1,
			clickIds: { gclid: { value: 'Cj0K-abc' } },
			visitorId: { id: attribution.visitorId },
		});
		expect(sessionStorage.length).toBe(0);
	});

	it('Einwilligung erst nach der Landung: übernimmt die Werte des Einstiegs', () => {
		syncAttribution(NONE);
		window.history.replaceState({}, '', '/kontakt'); // weiter geklickt, Klick-IDs nicht mehr in der Adresse
		consent.save(['marketing']);
		expect(buildLeadAttribution(MARKETING, null)!.clickIds?.gclid).toBe('Cj0K-abc');
	});

	it('First und Last Touch über Besuche: Google zuerst, dann Newsletter', () => {
		syncAttribution(MARKETING);
		const visitorId = storedAttr().visitorId.id;
		land('/?utm_source=newsletter&utm_medium=email');
		syncAttribution(MARKETING);
		const attribution = buildLeadAttribution(MARKETING, null)!;
		expect(attribution.first).toMatchObject({ source: 'google', landingPath: '/verkaufen' });
		expect(attribution.last).toMatchObject({ source: 'newsletter', medium: 'email', landingPath: '/' });
		expect(attribution.touches).toBe(2);
		expect(attribution.clickIds?.gclid).toBe('Cj0K-abc');
		expect(attribution.visitorId).toBe(visitorId);
		// Ein Seitenwechsel innerhalb von 30 Minuten ohne Kampagne ist kein neuer Besuch.
		land('/kontakt');
		syncAttribution(MARKETING);
		expect(storedAttr().touches).toBe(2);
	});

	it('Besuchs-ID geht mit dem Seitenaufruf mit', () => {
		consent.save(['marketing']);
		trackPageview('/verkaufen');
		const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
		expect(body.visitorId).toBe(storedAttr().visitorId.id);
		expect(body.consent).toMatchObject({ marketing: true, at: expect.any(String) });
	});

	it('ohne „Marketing“ keine Besuchs-ID im Seitenaufruf, auch mit einer alten im Speicher', () => {
		localStorage.setItem(
			'ds-attr',
			JSON.stringify({ v: 2, visitorId: { id: '0f8fad5b-d9cb-469f-a165-70867728950e', at: Date.now() } }),
		);
		consent.save(['statistics']);
		trackPageview('/verkaufen');
		const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
		expect(body).not.toHaveProperty('visitorId');
		expect(body.consent).toMatchObject({ marketing: false });
	});

	it('abgelaufene Klick-IDs fallen weg', () => {
		localStorage.setItem(
			'ds-attr',
			JSON.stringify({ v: 2, clickIds: { gclid: { value: 'alt', at: Date.now() - 91 * 86_400_000 } } }),
		);
		land('/');
		syncAttribution(MARKETING);
		expect(storedAttr().clickIds).toBeUndefined();
	});
});

describe('Widerruf', () => {
	it('löscht Klick-IDs, Besuchs-ID und Besuche', () => {
		consent.save(['marketing']);
		expect(storedAttr().visitorId).toBeDefined();
		consent.rejectAll();
		expect(localStorage.getItem('ds-attr')).toBeNull();
		expect(reloadPage).toHaveBeenCalled();
		const attribution = buildLeadAttribution(NONE, consent.decidedAt)!;
		expect(attribution.clickIds).toBeNull();
		expect(attribution.visitorId).toBeNull();
	});

	it('nur noch Statistik: Besuche bleiben, Klick-IDs und Besuchs-ID nicht', () => {
		consent.save(['marketing']);
		consent.save(['statistics']);
		const stored = storedAttr();
		expect(stored.first).toBeDefined();
		expect(stored.clickIds).toBeUndefined();
		expect(stored.visitorId).toBeUndefined();
	});
});

describe('eigene Parameter (versteckte Felder)', () => {
	it('Anzahl, Länge, Namen und heikle Namen', () => {
		const many = Array.from({ length: 30 }, (_, i) => `p${i}=${i}`).join('&');
		expect(Object.keys(readParams(`?${many}`))).toHaveLength(20);
		const long = readParams(`?partner=${'x'.repeat(600)}&ab%20c=1&${'k'.repeat(65)}=2&ok_1.v-2=3`);
		expect(long.partner).toHaveLength(500);
		expect(Object.keys(long)).toEqual(['partner', 'ok_1.v-2']);
		expect(
			readParams(
				'?email=a@b.de&token=x&session=y&utm_source=g&gclid=z&_fbp=f&partner=p&kampagne=%E2%80%8Bherbst%00',
			),
		).toEqual({ partner: 'p', kampagne: 'herbst' });
	});
});

describe('Ereignis-ID für Pixel und Lead', () => {
	it('fbq und gtag bekommen lead-<submissionId>, dieselbe ID wie die serverseitige Conversion', () => {
		const w = window as unknown as Record<string, unknown>;
		loadTracking({ metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' });
		const fbq = vi.fn();
		const gtag = vi.fn();
		w.fbq = fbq;
		w.gtag = gtag;
		const submissionId = '0b7e3c9a-2f4d-4e8b-9a1c-5d6e7f8a9b0c';
		expect(reportLeadConversion(submissionId)).toEqual(['meta', 'google']);
		expect(fbq).toHaveBeenCalledWith('track', 'Lead', {}, { eventID: `lead-${submissionId}` });
		expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', { transaction_id: `lead-${submissionId}` });
		expect(leadEventId(submissionId)).toBe(`lead-${submissionId}`);
		delete w.fbq;
		delete w.gtag;
		delete w._fbq;
		delete w.dataLayer;
		for (const script of document.head.querySelectorAll('script')) script.remove();
	});

	it('ohne geladene Tags wird nichts gemeldet', () => {
		expect(reportLeadConversion('x')).toEqual([]);
	});
});
