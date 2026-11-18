// createLeadClient und createFunnelState: dieselbe Einsendung wie <LeadForm>, ohne dessen Oberfläche.
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { setCaptchaAdapterForTests, type CaptchaCallbacks } from '../src/lib/client/captcha.js';
import { createFunnelState } from '../src/lib/client/funnelState.svelte.js';
import { createLeadClient } from '../src/lib/client/leadClient.svelte.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { bewertungConfig } from './fixtures/bewertungConfig.js';
import { jsonResponse, testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const fetchSpy = vi.fn<typeof fetch>();
const captcha = {
	started: 0,
	resets: 0,
	destroyed: 0,
	solve: true,
	fail: false,
	callbacks: null as CaptchaCallbacks | null,
	element: null as HTMLElement | null,
};

const VALID = {
	objektart: 'Wohnung',
	wohnflaeche: '85',
	plz: '04109',
	zustand: 'Gepflegt',
	lastName: 'Muster',
	email: 'erika@beispiel.de',
};

const body = (call = 0) => JSON.parse(String(fetchSpy.mock.calls[call]![1]!.body));

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	window.history.replaceState({}, '', '/bewertung?partner=immo24&utm_source=google&utm_campaign=herbst');
	resetAttributionForTests();
	Object.assign(captcha, {
		started: 0,
		resets: 0,
		destroyed: 0,
		solve: true,
		fail: false,
		callbacks: null,
		element: null,
	});
	setCaptchaAdapterForTests(async (element, _url, callbacks) => {
		captcha.started++;
		captcha.element = element;
		captcha.callbacks = callbacks;
		if (captcha.fail) throw new Error('blockiert');
		if (captcha.solve)
			queueMicrotask(() => callbacks.onSolved(`loesung-${captcha.started}-${captcha.resets}`));
		return {
			reset: () => {
				captcha.resets++;
				if (captcha.solve)
					queueMicrotask(() => callbacks.onSolved(`loesung-${captcha.started}-${captcha.resets}`));
			},
			destroy: () => captcha.destroyed++,
		};
	});
	fetchSpy.mockReset();
	fetchSpy.mockResolvedValue(jsonResponse(201, { data: { accepted: true } }));
	vi.stubGlobal('fetch', fetchSpy);
	const site = testSiteData();
	setSiteDataForTests({
		...site,
		funnels: { ...site.funnels, bewertung: { ...bewertungConfig(), active: true } },
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	setCaptchaAdapterForTests(null);
	setSiteDataForTests(null);
	window.history.replaceState({}, '', '/');
});

describe('createLeadClient', () => {
	it('kennt nur die sichtbaren Felder; versteckte füllt es selbst beim Absenden', async () => {
		const lead = createLeadClient('bewertung');
		expect(lead.available).toBe(true);
		expect(lead.label).toBe('Bewertung');
		expect(lead.fields.map((f) => f.name)).not.toContain('partner');
		expect(lead.field('quelle')).toBeUndefined();

		const result = await lead.submit(VALID);
		expect(result).toEqual({ ok: true, dryRun: false, submissionId: expect.any(String) });
		const sent = body();
		expect(sent).toMatchObject({
			funnelKey: 'bewertung',
			submissionId: (result as { submissionId: string }).submissionId,
			data: { ...VALID, quelle: 'Bewertungsrechner', partner: 'immo24' },
			captcha: 'loesung-1-0',
			website: '',
			attribution: { v: 2, first: { source: 'google', campaign: 'herbst', landingPath: '/bewertung' } },
		});
		lead.destroy();
	});

	it('Captcha: unsichtbar, erst bei prepare() oder submit(), eine Lösung je Einsendung', async () => {
		captcha.solve = false;
		const lead = createLeadClient('bewertung');
		expect(captcha.started).toBe(0);
		lead.prepare();
		lead.prepare();
		await vi.waitFor(() => expect(captcha.started).toBe(1));
		expect(captcha.element!.hidden).toBe(true);
		expect(document.body.contains(captcha.element)).toBe(true);

		const pending = lead.submit(VALID);
		await vi.waitFor(() => expect(lead.status).toBe('captcha'));
		expect(fetchSpy).not.toHaveBeenCalled();
		captcha.callbacks!.onSolved('erste');
		expect(await pending).toMatchObject({ ok: true });
		expect(body().captcha).toBe('erste');
		expect(lead.status).toBe('idle');

		lead.destroy();
		expect(captcha.destroyed).toBe(1);
		expect(document.body.contains(captcha.element)).toBe(false);
	});

	it('Captcha lässt sich nicht laden: reason captcha mit Ausweichkontakt, beim nächsten Mal neuer Versuch', async () => {
		captcha.fail = true;
		const lead = createLeadClient('bewertung');
		const failed = await lead.submit(VALID);
		expect(failed).toMatchObject({
			ok: false,
			reason: 'captcha',
			message: expect.stringMatching(/Sicherheitsprüfung konnte nicht durchgeführt werden/),
			fallback: { phone: '0341 1234567', email: 'info@kunde.de' },
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		captcha.fail = false;
		expect(await lead.submit(VALID)).toMatchObject({ ok: true });
		expect(captcha.started).toBe(2);
	});

	it('Vorschau: dryRun, kein Pixel-Ereignis', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: { accepted: true, dryRun: true } }));
		const lead = createLeadClient('bewertung');
		expect(await lead.submit(VALID)).toMatchObject({ ok: true, dryRun: true });
	});

	it('doppelt absenden: eine Anfrage, dasselbe Ergebnis; danach eine neue submissionId', async () => {
		const lead = createLeadClient('bewertung');
		const [a, b] = await Promise.all([lead.submit(VALID), lead.submit(VALID)]);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
		await lead.submit(VALID);
		expect(body(1).submissionId).not.toBe(body(0).submissionId);
	});

	it('Bot-Falle: der Wert geht an den Server, der ihn still verwirft', async () => {
		const lead = createLeadClient('bewertung');
		lead.setHoneypot('http://spam.example');
		await lead.submit(VALID);
		expect(body().website).toBe('http://spam.example');
	});

	it('prüft vor dem Versand, auch nur einzelne Felder', async () => {
		const lead = createLeadClient('bewertung');
		expect(lead.validate({}, ['objektart'])).toEqual({
			objektart: 'Bitte wählen Sie bei „Art der Immobilie“ etwas aus.',
		});
		expect(lead.validate({ ...VALID, email: 'kaputt' })).toEqual({
			email: expect.stringContaining('gültige E-Mail'),
		});
		const result = await lead.submit({ ...VALID, plz: '' });
		expect(result).toMatchObject({
			ok: false,
			reason: 'validation',
			fields: { plz: expect.any(String) },
			fallback: null,
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it.each([
		[
			'429',
			() =>
				jsonResponse(
					429,
					{ error: 'x', message: 'x', status: 429, code: 'rate_limited' },
					{ 'Retry-After': '60' },
				),
			{ reason: 'rate_limited', retryAfterSeconds: 60 },
		],
		['Netzfehler', () => Promise.reject(new TypeError('offline')), { reason: 'network' }],
		[
			'503',
			() => jsonResponse(503, { error: 'x', message: 'Interna', status: 503, code: 'captcha_unavailable' }),
			{ reason: 'unavailable' },
		],
		[
			'404',
			() => jsonResponse(404, { error: 'x', message: 'x', status: 404, code: 'funnel_not_found' }),
			{ reason: 'unavailable' },
		],
	] as const)(
		'%s: verständlicher Text, Ausweichkontakt, nie Text vom Server',
		async (_name, answer, expected) => {
			fetchSpy.mockImplementation(answer as () => Promise<Response>);
			const lead = createLeadClient('bewertung');
			const result = await lead.submit(VALID);
			expect(result).toMatchObject({ ok: false, ...expected, fallback: { phone: '0341 1234567' } });
			expect((result as { message: string }).message).not.toMatch(/Interna/);
		},
	);

	it('Feldfehler des Servers werden zu eigenen Texten am Feld; E-Mail oder Telefon fehlt fürs ganze Formular', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(422, {
				error: 'x',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [{ path: 'data.plz', message: 'Server sagt' }],
			}),
		);
		const lead = createLeadClient('bewertung');
		expect(await lead.submit(VALID)).toMatchObject({
			reason: 'validation',
			fields: { plz: 'Bitte prüfen Sie Ihre Angabe bei „Postleitzahl“.' },
		});
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(422, {
				error: 'x',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [{ path: 'data', message: 'x' }],
			}),
		);
		expect(await lead.submit(VALID)).toMatchObject({
			reason: 'validation',
			fields: {},
			message: 'Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an.',
		});
		// Jede Lösung nur einmal: nach jedem abgelehnten Versuch eine neue Aufgabe.
		expect(new Set([body(0).captcha, body(1).captcha]).size).toBe(2);
	});

	it('ein ausgeschaltetes Formular sendet nichts', async () => {
		const site = testSiteData();
		setSiteDataForTests({ ...site, funnels: { bewertung: { ...bewertungConfig(), active: false } } });
		const lead = createLeadClient('bewertung');
		expect(lead.available).toBe(false);
		expect(await lead.submit(VALID)).toMatchObject({
			ok: false,
			reason: 'unavailable',
			fallback: { email: 'info@kunde.de' },
		});
		expect(captcha.started).toBe(0);
	});
});

describe('createFunnelState', () => {
	const steps = [
		{ id: 'objekt', title: 'Objekt', fields: ['objektart', 'wohnflaeche', 'plz'] },
		{ id: 'zustand', title: 'Zustand', fields: ['zustand'] },
		{ id: 'kontakt', title: 'Kontakt', fields: ['lastName', 'email'] },
	];

	it('drei Schritte: Prüfung je Schritt, Fortschritt, Zurück behält die Antworten, Versand', async () => {
		const lead = createLeadClient('bewertung');
		const funnel = createFunnelState(lead, steps);
		expect(funnel.progress).toEqual({ current: 1, total: 3, percent: 33 });
		expect(funnel.isFirst).toBe(true);

		expect(funnel.next()).toBe(false);
		expect(Object.keys(funnel.errors).sort()).toEqual(['objektart', 'plz', 'wohnflaeche']);
		Object.assign(funnel.values, { objektart: 'Haus', wohnflaeche: '120', plz: '04109' });
		expect(funnel.next()).toBe(true);
		expect(funnel.step.id).toBe('zustand');
		expect(funnel.errors).toEqual({});
		await vi.waitFor(() => expect(captcha.started).toBe(1));

		funnel.back();
		expect(funnel.step.id).toBe('objekt');
		expect(funnel.values).toMatchObject({ objektart: 'Haus', wohnflaeche: '120' });
		funnel.next();
		funnel.values.zustand = 'Gepflegt';
		funnel.next();
		expect(funnel.isLast).toBe(true);
		expect(funnel.progress.percent).toBe(100);
		Object.assign(funnel.values, { lastName: 'Muster', email: 'erika@beispiel.de' });

		expect(await funnel.submit()).toMatchObject({ ok: true });
		expect(body().data).toMatchObject({
			objektart: 'Haus',
			wohnflaeche: '120',
			zustand: 'Gepflegt',
			email: 'erika@beispiel.de',
		});
	});

	it('ein Feldfehler des Servers führt zum Schritt mit dem Feld', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(422, {
				error: 'x',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [{ path: 'data.plz', message: 'x' }],
			}),
		);
		const funnel = createFunnelState(createLeadClient('bewertung'), steps);
		Object.assign(funnel.values, VALID);
		funnel.next();
		funnel.next();
		await funnel.submit();
		expect(funnel.step.id).toBe('objekt');
		expect(funnel.errors).toHaveProperty('plz');
	});

	it('nennt ein Schrittfeld, das es nicht gibt', () => {
		expect(() =>
			createFunnelState(createLeadClient('bewertung'), [{ id: 'x', title: 'X', fields: ['quelle'] }]),
		).toThrow(/Feld "quelle".*fehlt oder versteckt/);
	});
});
