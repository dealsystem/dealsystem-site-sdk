import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { setCaptchaAdapterForTests, type CaptchaCallbacks } from '../src/lib/client/captcha.js';
import { loadTracking, resetTrackingForTests } from '../src/lib/client/tracking.js';
import LeadForm from '../src/lib/components/LeadForm.svelte';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import type { SiteData } from '../src/lib/types.js';
import { jsonResponse, testSiteData } from './helpers.js';

const fetchSpy = vi.fn<typeof fetch>();

/** Ersatz für das ALTCHA-Widget. Löst sofort, wenn nicht anders verlangt. */
function fakeCaptcha(options: { solve?: boolean; fail?: boolean; error?: boolean } = {}) {
	const state = {
		started: 0,
		resets: 0,
		destroyed: 0,
		challengeUrl: '',
		element: null as HTMLElement | null,
		callbacks: null as CaptchaCallbacks | null,
		solve: options.solve ?? true,
		fail: options.fail ?? false,
		error: options.error ?? false,
	};
	setCaptchaAdapterForTests(async (element, challengeUrl, callbacks) => {
		state.started++;
		state.element = element;
		state.challengeUrl = challengeUrl;
		state.callbacks = callbacks;
		if (state.fail) throw new Error('blockiert');
		if (state.error) queueMicrotask(() => callbacks.onError());
		else if (state.solve) queueMicrotask(() => callbacks.onSolved('test-payload'));
		return {
			reset: () => {
				state.resets++;
				if (state.solve) queueMicrotask(() => callbacks.onSolved('test-payload'));
			},
			destroy: () => state.destroyed++,
		};
	});
	return state;
}

function sentBody(call = 0): Record<string, unknown> {
	return JSON.parse(String(fetchSpy.mock.calls[call]![1]!.body));
}

function setup(site: Partial<SiteData> = {}, props: Record<string, unknown> = {}) {
	setSiteDataForTests(testSiteData(site));
	const user = userEvent.setup();
	const view = render(LeadForm, { props: { funnel: 'kontakt', submitLabel: 'Anfrage senden', ...props } });
	return { user, ...view };
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/E-Mail/), 'anna@beispiel.de');
	await user.type(screen.getByLabelText('Nachricht'), 'Bitte um Rückruf');
	await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	consent.resetForTests();
	resetAttributionForTests();
	fetchSpy.mockReset();
	fetchSpy.mockResolvedValue(jsonResponse(201, { data: { accepted: true } }));
	vi.stubGlobal('fetch', fetchSpy);
	fakeCaptcha();
});

afterEach(() => {
	vi.unstubAllGlobals();
	setCaptchaAdapterForTests(null);
	setSiteDataForTests(null);
	window.history.replaceState({}, '', '/');
});

describe('Aufbau', () => {
	it('beschriftet jedes Feld und markiert Pflichtfelder', () => {
		setup();
		expect(screen.getByLabelText('Vorname')).toHaveAttribute('autocomplete', 'given-name');
		const email = screen.getByLabelText(/E-Mail/);
		expect(email).toBeRequired();
		expect(email).toHaveAttribute('type', 'email');
		expect(screen.getByLabelText('Nachricht').tagName).toBe('TEXTAREA');
		expect(screen.getByText(/Pflichtfelder sind mit/)).toBeInTheDocument();
	});

	it('hält den Honeypot aus Tab-Reihenfolge und Vorleseprogramm heraus', () => {
		const { container } = setup();
		const honeypot = container.querySelector('input[name="website"]')!;
		expect(honeypot).toHaveAttribute('tabindex', '-1');
		expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
		expect(screen.queryByRole('textbox', { name: /Website/ })).toBeNull();
	});

	it('rendert Auswahl, Mehrfachauswahl und Kontrollkästchen zugänglich', async () => {
		const { user } = setup({
			funnels: {
				kontakt: {
					label: 'Kontakt',
					active: true,
					fields: [
						{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },
						{ name: 'art', type: 'select', label: 'Anliegen', options: ['Kauf', 'Verkauf'], required: true },
						{ name: 'themen', type: 'multiselect', label: 'Themen', options: ['Wohnung', 'Haus'] },
						{
							name: 'rueckruf',
							type: 'checkbox',
							label: 'Bitte rufen Sie mich an',
							help: 'Werktags 9–17 Uhr',
						},
					],
				},
			},
		});
		await user.type(screen.getByLabelText(/E-Mail/), 'a@b.de');
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		expect(await screen.findByText('Bitte wählen Sie bei „Anliegen“ etwas aus.')).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();

		await user.selectOptions(screen.getByLabelText(/Anliegen/), 'Verkauf');
		expect(screen.getByRole('group', { name: 'Themen' })).toBeInTheDocument();
		await user.click(screen.getByLabelText('Haus'));
		const rueckruf = screen.getByLabelText('Bitte rufen Sie mich an');
		expect(rueckruf).toHaveAccessibleDescription('Werktags 9–17 Uhr');
		await user.click(rueckruf);
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));

		await screen.findByRole('status');
		expect(sentBody().data).toEqual({ email: 'a@b.de', art: 'Verkauf', themen: ['Haus'], rueckruf: true });
	});
});

describe('Prüfung im Browser', () => {
	it('meldet ein leeres Pflichtfeld am Feld, setzt den Fokus und sendet nicht', async () => {
		const { user } = setup();
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));

		const email = screen.getByLabelText(/E-Mail/);
		const message = await screen.findByText('Bitte füllen Sie das Feld „E-Mail“ aus.');
		expect(email).toHaveAttribute('aria-invalid', 'true');
		expect(email).toHaveAccessibleDescription(message.textContent!);
		expect(email).toHaveFocus();
		expect(
			screen.getByText('Bitte prüfen Sie das markierte Feld.').closest('[aria-live="polite"]'),
		).not.toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('meldet eine ungültige E-Mail-Adresse und räumt den Fehler nach der Korrektur ab', async () => {
		const { user } = setup();
		const email = screen.getByLabelText(/E-Mail/);
		await user.type(email, 'anna@');
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		expect(await screen.findByText(/gültige E-Mail-Adresse/)).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();

		await user.clear(email);
		await user.type(email, 'anna@beispiel.de');
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		await screen.findByRole('status');
		expect(screen.queryByText(/gültige E-Mail-Adresse/)).toBeNull();
	});
});

describe('Versand', () => {
	it('schickt die Angaben laut Vertrag und zeigt erst nach accepted die Bestätigung', async () => {
		window.history.replaceState({}, '', '/?utm_source=google&utm_medium=cpc');
		let release!: (response: Response) => void;
		fetchSpy.mockReturnValue(new Promise((resolve) => (release = resolve)));
		const onsuccess = vi.fn();
		const { user } = setup({}, { successMessage: 'Danke, wir melden uns.', onsuccess });

		await fillAndSubmit(user);

		expect(await screen.findByText('Ihre Anfrage wird gesendet.')).toBeInTheDocument();
		expect(screen.queryByText('Danke, wir melden uns.')).toBeNull();
		expect(onsuccess).not.toHaveBeenCalled();

		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('https://core.test/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/leads');
		expect(init).toMatchObject({
			method: 'POST',
			credentials: 'omit',
			headers: { 'Content-Type': 'application/json' },
		});
		const body = sentBody();
		expect(body).toMatchObject({
			funnelKey: 'kontakt',
			data: { email: 'anna@beispiel.de', nachricht: 'Bitte um Rückruf' },
			attribution: {
				v: 2,
				first: { source: 'google', medium: 'cpc', landingPath: '/' },
				touches: 1,
				clickIds: null,
				visitorId: null,
				consent: { statistics: false, marketing: false, at: null },
			},
			website: '',
		});
		expect(body.submissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
		expect(body.captcha).toBe('test-payload');
		expect(body.data).not.toHaveProperty('firstName');

		release(jsonResponse(201, { data: { accepted: true } }));
		const status = await screen.findByRole('status');
		expect(status).toHaveTextContent('Danke, wir melden uns.');
		await waitFor(() => expect(status).toHaveFocus());
		expect(screen.queryByRole('button', { name: 'Anfrage senden' })).toBeNull();
		expect(onsuccess).toHaveBeenCalledTimes(1);
	});

	it('sendet bei einem Doppelklick nur einmal', async () => {
		let release!: (response: Response) => void;
		fetchSpy.mockReturnValue(new Promise((resolve) => (release = resolve)));
		const { user } = setup();
		await fillAndSubmit(user);
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		release(jsonResponse(201, { data: { accepted: true } }));
		await screen.findByRole('status');
	});

	it('reicht ein ausgefülltes Honeypot-Feld an den Server durch', async () => {
		const { user, container } = setup();
		await user.type(container.querySelector<HTMLInputElement>('input[name="website"]')!, 'https://spam.test');
		await fillAndSubmit(user);
		await screen.findByRole('status');
		expect(sentBody().website).toBe('https://spam.test');
	});

	describe('Leadmagnet', () => {
		const withLeadmagnet = (): Partial<SiteData> => {
			const base = testSiteData();
			return {
				funnels: {
					kontakt: { ...base.funnels.kontakt!, leadmagnet: { label: ' Ratgeber Immobilienverkauf ' } },
				},
			};
		};

		it('kündigt die Datei als Standard-Erfolgstext an, ohne mehr zu versprechen', async () => {
			const { user } = setup(withLeadmagnet());
			await fillAndSubmit(user);
			const status = await screen.findByRole('status');
			expect(status).toHaveTextContent(
				'Vielen Dank. Ihre Anfrage ist bei uns angekommen. „Ratgeber Immobilienverkauf“ schicken wir Ihnen ' +
					'per E-Mail. Falls nichts ankommt, sehen Sie bitte im Spam-Ordner nach oder sprechen Sie uns an.',
			);
		});

		it('lässt einen eigenen Erfolgstext gelten', async () => {
			const { user } = setup(withLeadmagnet(), { successMessage: 'Danke! Der Ratgeber ist unterwegs.' });
			await fillAndSubmit(user);
			const status = await screen.findByRole('status');
			expect(status).toHaveTextContent('Danke! Der Ratgeber ist unterwegs.');
			expect(status).not.toHaveTextContent('Spam-Ordner');
		});

		it('bleibt ohne Leadmagnet beim bisherigen Standardtext', async () => {
			const { user } = setup();
			await fillAndSubmit(user);
			expect(await screen.findByRole('status')).toHaveTextContent(
				/^Vielen Dank\. Ihre Anfrage ist bei uns angekommen\.$/,
			);
		});
	});

	it('kennzeichnet den Probelauf der Vorschau', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(201, { data: { accepted: true, dryRun: true } }));
		const { user } = setup();
		await fillAndSubmit(user);
		expect(
			await screen.findByText(/Vorschau: Diese Anfrage wurde geprüft, aber nicht gespeichert/),
		).toBeInTheDocument();
	});
});

describe('Fehlerwege', () => {
	async function expectFailure(user: ReturnType<typeof userEvent.setup>, text: RegExp) {
		await fillAndSubmit(user);
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Ihre Anfrage wurde nicht gesendet.');
		expect(alert).toHaveTextContent(text);
		// Telefon und E-Mail aus den Firmendaten als Ausweg.
		expect(screen.getByRole('link', { name: '0341 1234567' })).toHaveAttribute('href', 'tel:03411234567');
		expect(screen.getByRole('link', { name: 'info@kunde.de' })).toHaveAttribute(
			'href',
			'mailto:info@kunde.de',
		);
		await waitFor(() => expect(alert).toHaveFocus());
		// Keine Erfolgsmeldung, Eingaben bleiben erhalten.
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.getByLabelText(/E-Mail/)).toHaveValue('anna@beispiel.de');
		expect(screen.getByLabelText('Nachricht')).toHaveValue('Bitte um Rückruf');
		return alert;
	}

	it('zeigt bei 429 den Hinweis und den direkten Kontakt', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(
				429,
				{ error: 'x', message: 'x', status: 429, code: 'rate_limited' },
				{ 'Retry-After': '60' },
			),
		);
		const { user } = setup();
		await expectFailure(user, /zu viele Anfragen/);
	});

	it('zeigt bei einem Netzfehler den direkten Kontakt', async () => {
		fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
		const { user } = setup();
		await expectFailure(user, /Verbindung ist fehlgeschlagen/);
	});

	it('zeigt bei einem Serverfehler nie Text vom Server', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(500, { error: 'x', message: '<b>Stacktrace at db.ts:12</b>', status: 500 }),
		);
		const { user } = setup();
		const alert = await expectFailure(user, /später erneut/);
		expect(alert).not.toHaveTextContent('Stacktrace');
	});

	it.each([
		['200 ohne accepted', () => jsonResponse(200, { data: {} })],
		['200 mit accepted: false', () => jsonResponse(200, { data: { accepted: false } })],
		['200 ohne JSON', () => new Response('ok', { status: 200 })],
	])('meldet bei %s keinen Erfolg', async (_name, answer) => {
		fetchSpy.mockResolvedValue(answer());
		const { user } = setup();
		await expectFailure(user, /Fehler aufgetreten/);
	});

	it('zeigt Feldfehler des Servers (details[].path) am Feld, mit eigenem Text', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(422, {
				error: 'x',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [
					{ path: 'data.email', message: '<i>invalid</i>' },
					{ path: 'data.fremd', message: 'x' },
				],
			}),
		);
		const { user } = setup();
		await fillAndSubmit(user);
		const email = screen.getByLabelText(/E-Mail/);
		await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
		expect(email).toHaveAccessibleDescription('Bitte prüfen Sie Ihre Angabe bei „E-Mail“.');
		expect(email).toHaveFocus();
		expect(screen.queryByText(/invalid/)).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('zeigt path "data" als Fehler des Formulars: E-Mail oder Telefon fehlt', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(422, {
				error: 'x',
				message: 'At least email or phone is required',
				status: 422,
				code: 'validation_error',
				details: [{ path: 'data', message: 'At least email or phone is required' }],
			}),
		);
		const { user } = setup();
		await fillAndSubmit(user);
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an.');
		expect(alert).not.toHaveTextContent('At least');
		await waitFor(() => expect(alert).toHaveFocus());
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('wiederholt bei internal_error einmal von selbst, mit derselben submissionId', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(500, { error: 'x', message: 'x', status: 500, code: 'internal_error' }),
		);
		const { user } = setup();
		await fillAndSubmit(user);
		await screen.findByRole('status');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(sentBody(1).submissionId).toBe(sentBody(0).submissionId);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('zeigt bei 413 payload_too_large den direkten Kontakt', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(413, { error: 'Payload Too Large', message: 'x', status: 413, code: 'payload_too_large' }),
		);
		const { user } = setup();
		await expectFailure(user, /später erneut/);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('zeigt bei einem 429 vor der Schlüssel-Prüfung (ohne Code) den direkten Kontakt', async () => {
		fetchSpy.mockResolvedValue(
			new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '30' } }),
		);
		const { user } = setup();
		await expectFailure(user, /zu viele Anfragen/);
	});

	it('zeigt bei captcha_unavailable den direkten Kontakt', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(503, { error: 'x', message: 'x', status: 503, code: 'captcha_unavailable' }),
		);
		const { user } = setup();
		await expectFailure(user, /später erneut/);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('verwendet beim neuen Versuch dieselbe submissionId', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse(503, { error: 'x', message: 'x', status: 503 }));
		const { user } = setup();
		await fillAndSubmit(user);
		await screen.findByRole('alert');

		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		await screen.findByRole('status');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(sentBody(1).submissionId).toBe(sentBody(0).submissionId);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('zeigt als Ausweichkontakt nur, was der Kunde eingetragen hat', async () => {
		fetchSpy.mockRejectedValue(new TypeError('offline'));
		const { user } = setup({ legal: { ...testSiteData().legal, phone: '' } });
		await fillAndSubmit(user);
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Sie erreichen uns auch direkt: info@kunde.de');
		expect(alert).not.toHaveTextContent('oder');
		expect(screen.queryByRole('link', { name: /0341/ })).toBeNull();
	});

	it('zeigt ohne Firmendaten keinen leeren Kontakt-Hinweis', async () => {
		fetchSpy.mockRejectedValue(new TypeError('offline'));
		const { user } = setup({ legal: { ...testSiteData().legal, phone: '', email: '' } });
		await fillAndSubmit(user);
		const alert = await screen.findByRole('alert');
		expect(alert).not.toHaveTextContent('Sie erreichen uns');
	});
});

describe('Captcha', () => {
	it('holt die Aufgabe erst beim ersten Kontakt mit dem Formular, von der eigenen Site-API', async () => {
		const fake = fakeCaptcha({ solve: false });
		const { user } = setup();
		expect(fake.started).toBe(0);

		await user.click(screen.getByLabelText(/E-Mail/));
		await waitFor(() => expect(fake.started).toBe(1));
		expect(fake.challengeUrl).toBe(
			'https://core.test/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/captcha',
		);

		await user.click(screen.getByLabelText('Nachricht'));
		expect(fake.started).toBe(1);
		// Das Widget selbst ist unsichtbar; das Formular spricht für es.
		expect(fake.element!.hidden).toBe(true);
	});

	it('schickt die gelöste Aufgabe als captcha mit', async () => {
		const fake = fakeCaptcha({ solve: false });
		const { user } = setup();
		await user.click(screen.getByLabelText(/E-Mail/));
		await waitFor(() => expect(fake.callbacks).not.toBeNull());
		fake.callbacks!.onSolved('eyJjaGFsbGVuZ2UiOnt9fQ==');

		await fillAndSubmit(user);
		await screen.findByRole('status');
		expect(sentBody().captcha).toBe('eyJjaGFsbGVuZ2UiOnt9fQ==');
	});

	it('wartet mit dem Versand, bis die Aufgabe gelöst ist, und sagt das an', async () => {
		const fake = fakeCaptcha({ solve: false });
		const { user } = setup();
		await fillAndSubmit(user);

		const hint = await screen.findByText(/Die Sicherheitsprüfung läuft/);
		expect(hint.closest('[aria-live="polite"]')).not.toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();

		fake.callbacks!.onSolved('loesung-2');
		await screen.findByRole('status');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(sentBody().captcha).toBe('loesung-2');
	});

	it('sendet nie ohne gelöste Aufgabe', async () => {
		const fake = fakeCaptcha({ solve: false });
		const { user } = setup();
		await fillAndSubmit(user);
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		expect(fake.started).toBe(1);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('löst nach captcha_failed eine neue Aufgabe und sendet die alte Lösung nicht erneut', async () => {
		const fake = fakeCaptcha({ solve: false });
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(400, { error: 'x', message: 'x', status: 400, code: 'captcha_failed' }),
		);
		const { user } = setup();
		await user.click(screen.getByLabelText(/E-Mail/));
		await waitFor(() => expect(fake.callbacks).not.toBeNull());
		fake.callbacks!.onSolved('alt');
		await fillAndSubmit(user);

		expect(await screen.findByRole('alert')).toHaveTextContent(/Sicherheitsprüfung ist fehlgeschlagen/);
		expect(fake.resets).toBe(1);

		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		fake.callbacks!.onSolved('neu');
		await screen.findByRole('status');
		expect(sentBody(1).captcha).toBe('neu');
	});

	it('fordert eine neue Aufgabe an, wenn die Lösung abgelaufen ist', async () => {
		const fake = fakeCaptcha({ solve: false });
		const { user } = setup();
		await user.click(screen.getByLabelText(/E-Mail/));
		await waitFor(() => expect(fake.callbacks).not.toBeNull());
		fake.callbacks!.onSolved('abgelaufen');
		fake.callbacks!.onCleared();

		await fillAndSubmit(user);
		expect(fake.resets).toBe(1);
		expect(fetchSpy).not.toHaveBeenCalled();
		fake.callbacks!.onSolved('frisch');
		await screen.findByRole('status');
		expect(sentBody().captcha).toBe('frisch');
	});

	it.each([
		['das Widget nicht laden kann', { fail: true }],
		['die Aufgabe nicht geholt oder gelöst werden kann', { error: true }],
	])('zeigt den direkten Kontakt, wenn %s', async (_name, options) => {
		fakeCaptcha({ solve: false, ...options });
		const { user } = setup();
		await fillAndSubmit(user);

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Ihre Anfrage wurde nicht gesendet.');
		expect(alert).toHaveTextContent(/Sicherheitsprüfung konnte nicht durchgeführt werden/);
		expect(screen.getByRole('link', { name: '0341 1234567' })).toHaveAttribute('href', 'tel:03411234567');
		expect(screen.getByRole('link', { name: 'info@kunde.de' })).toHaveAttribute(
			'href',
			'mailto:info@kunde.de',
		);
		await waitFor(() => expect(alert).toHaveFocus());
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('versucht es nach einem Fehler beim nächsten Absenden erneut', async () => {
		const fake = fakeCaptcha({ solve: false, fail: true });
		const { user } = setup();
		await fillAndSubmit(user);
		await screen.findByRole('alert');

		fake.fail = false;
		fake.solve = true;
		await user.click(screen.getByRole('button', { name: 'Anfrage senden' }));
		await screen.findByRole('status');
		// Erster Fokus, erstes Absenden, zweites Absenden.
		expect(fake.started).toBe(3);
		expect(sentBody().captcha).toBe('test-payload');
	});

	it('räumt das Widget beim Entfernen des Formulars ab', async () => {
		const fake = fakeCaptcha();
		const { user, unmount } = setup();
		await user.click(screen.getByLabelText(/E-Mail/));
		await waitFor(() => expect(fake.started).toBe(1));
		unmount();
		expect(fake.destroyed).toBe(1);
	});
});

describe('Ereignis-ID für Meta Pixel und Google Tag', () => {
	const w = window as unknown as Record<string, unknown>;
	afterEach(() => {
		for (const key of ['fbq', '_fbq', 'gtag', 'dataLayer']) delete w[key];
		for (const script of document.head.querySelectorAll('script')) script.remove();
		resetTrackingForTests();
	});

	function withPixel() {
		consent.save(['marketing']);
		loadTracking({ metaPixelId: '1234567890', googleTagId: null });
		const fbq = vi.fn();
		w.fbq = fbq;
		return fbq;
	}

	it('meldet die angenommene Anfrage mit lead-<submissionId>, derselben ID wie der Lead', async () => {
		const fbq = withPixel();
		const { user } = setup();
		await fillAndSubmit(user);
		await screen.findByRole('status');
		const { submissionId, attribution } = sentBody() as {
			submissionId: string;
			attribution: { consent: unknown };
		};
		expect(fbq).toHaveBeenCalledWith('track', 'Lead', {}, { eventID: `lead-${submissionId}` });
		expect(attribution.consent).toMatchObject({ marketing: true });
	});

	it('nicht in der Vorschau und nicht bei einem Fehler', async () => {
		const fbq = withPixel();
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: { accepted: true, dryRun: true } }));
		const { user } = setup();
		await fillAndSubmit(user);
		await screen.findByRole('status');
		expect(fbq).not.toHaveBeenCalled();
	});
});
