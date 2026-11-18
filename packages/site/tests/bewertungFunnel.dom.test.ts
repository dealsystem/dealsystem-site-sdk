// Der Beispiel-Funnel aus dem Skill `funnel-mehrstufig`, so wie ein Agent ihn übernimmt: vier Schritte bis zum
// Danke, Fokus beim Schrittwechsel, Fortschritt, Zurück ohne Datenverlust, Fehler am Feld, Ausweichkontakt.
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import BewertungFunnel from '../../create/template/.claude/skills/funnel-mehrstufig/BewertungFunnel.svelte';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { setCaptchaAdapterForTests } from '../src/lib/client/captcha.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { bewertungConfig, SKILL_DIR } from './fixtures/bewertungConfig.js';
import { jsonResponse, testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	window.history.replaceState({}, '', '/bewertung?partner=immo24');
	resetAttributionForTests();
	setCaptchaAdapterForTests(async (_element, _url, callbacks) => {
		queueMicrotask(() => callbacks.onSolved('loesung'));
		return { reset: () => queueMicrotask(() => callbacks.onSolved('loesung-neu')), destroy: () => {} };
	});
	fetchSpy.mockReset();
	fetchSpy.mockResolvedValue(jsonResponse(201, { data: { accepted: true } }));
	vi.stubGlobal('fetch', fetchSpy);
	const site = testSiteData();
	setSiteDataForTests({ ...site, funnels: { bewertung: { ...bewertungConfig(), active: true } } });
});

afterEach(() => {
	vi.unstubAllGlobals();
	setCaptchaAdapterForTests(null);
	setSiteDataForTests(null);
	window.history.replaceState({}, '', '/');
});

const heading = () => screen.getByRole('heading', { level: 2 });

async function toStep4(user: ReturnType<typeof userEvent.setup>) {
	await user.selectOptions(screen.getByLabelText(/Art der Immobilie/), 'Wohnung');
	await user.click(screen.getByRole('button', { name: 'Weiter' }));
	await user.type(screen.getByLabelText(/Wohnfläche/), '85');
	await user.type(screen.getByLabelText(/Postleitzahl/), '04109');
	await user.click(screen.getByRole('button', { name: 'Weiter' }));
	await user.selectOptions(screen.getByLabelText(/^Zustand/), 'Gepflegt');
	await user.click(screen.getByRole('button', { name: 'Weiter' }));
}

describe('Beispiel-Funnel „Immobilie bewerten lassen“', () => {
	it('vier Schritte bis zum Danke: Fokus auf der Überschrift, Fortschritt, Versand mit allen Angaben', async () => {
		const user = userEvent.setup();
		render(BewertungFunnel);
		expect(screen.getByText('Schritt 1 von 4')).toBeInTheDocument();
		expect(screen.getByRole('progressbar', { name: 'Fortschritt' })).toHaveAttribute('value', '1');
		expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();

		await user.selectOptions(screen.getByLabelText(/Art der Immobilie/), 'Wohnung');
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		await waitFor(() => expect(heading()).toHaveFocus());
		expect(heading()).toHaveTextContent('Wie groß ist sie, und wo liegt sie?');
		expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument();

		await user.type(screen.getByLabelText(/Wohnfläche/), '85');
		await user.type(screen.getByLabelText(/Postleitzahl/), '04109');
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		await user.selectOptions(screen.getByLabelText(/^Zustand/), 'Gepflegt');
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		await waitFor(() => expect(heading()).toHaveTextContent('Wohin dürfen wir die Einschätzung schicken?'));

		await user.type(screen.getByLabelText(/Nachname/), 'Muster');
		await user.type(screen.getByLabelText(/E-Mail/), 'erika@beispiel.de');
		await user.click(screen.getByRole('button', { name: 'Einschätzung anfragen' }));

		await waitFor(() => expect(heading()).toHaveTextContent('Vielen Dank'));
		await waitFor(() => expect(heading()).toHaveFocus());
		expect(screen.getByText(/melden uns mit einer Einschätzung/)).toBeInTheDocument();
		// Keine erfundene Zahl: weder Euro noch Spanne.
		expect(document.body.textContent).not.toMatch(/€|EUR|Spanne/);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
		expect(body.data).toEqual({
			objektart: 'Wohnung',
			wohnflaeche: '85',
			plz: '04109',
			zustand: 'Gepflegt',
			lastName: 'Muster',
			email: 'erika@beispiel.de',
			quelle: 'Bewertungsrechner',
			partner: 'immo24',
		});
		expect(body.website).toBe('');
	});

	it('Zurück behält die Eingaben; Fehler stehen am Feld, mit Fokus darauf', async () => {
		const user = userEvent.setup();
		render(BewertungFunnel);
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		const select = screen.getByLabelText(/Art der Immobilie/);
		await waitFor(() => expect(select).toHaveFocus());
		expect(select).toHaveAttribute('aria-invalid', 'true');
		expect(select).toHaveAccessibleDescription(/Bitte wählen Sie/);

		await user.selectOptions(select, 'Haus');
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		await user.type(screen.getByLabelText(/Wohnfläche/), '140');
		await user.click(screen.getByRole('button', { name: 'Zurück' }));
		await waitFor(() => expect(heading()).toHaveFocus());
		expect(screen.getByLabelText(/Art der Immobilie/)).toHaveValue('Haus');
		await user.click(screen.getByRole('button', { name: 'Weiter' }));
		expect(screen.getByLabelText(/Wohnfläche/)).toHaveValue('140');
	});

	it('Vorschau: Danke mit Hinweis, nichts gespeichert', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: { accepted: true, dryRun: true } }));
		const user = userEvent.setup();
		render(BewertungFunnel);
		await toStep4(user);
		await user.type(screen.getByLabelText(/Nachname/), 'Muster');
		await user.type(screen.getByLabelText(/E-Mail/), 'erika@beispiel.de');
		await user.click(screen.getByRole('button', { name: 'Einschätzung anfragen' }));
		expect(await screen.findByText(/geprüft, aber nicht gespeichert/)).toBeInTheDocument();
	});

	it('Fehler beim Versand: Hinweis mit Ausweichkontakt, Eingaben bleiben', async () => {
		fetchSpy.mockResolvedValue(
			jsonResponse(
				429,
				{ error: 'x', message: 'x', status: 429, code: 'rate_limited' },
				{ 'Retry-After': '30' },
			),
		);
		const user = userEvent.setup();
		render(BewertungFunnel);
		await toStep4(user);
		await user.type(screen.getByLabelText(/Nachname/), 'Muster');
		await user.type(screen.getByLabelText(/E-Mail/), 'erika@beispiel.de');
		await user.click(screen.getByRole('button', { name: 'Einschätzung anfragen' }));
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Ihre Angaben wurden nicht gesendet.');
		expect(screen.getByRole('link', { name: '0341 1234567' })).toHaveAttribute('href', 'tel:03411234567');
		expect(screen.getByLabelText(/E-Mail/)).toHaveValue('erika@beispiel.de');
	});

	it('hat eine Bot-Falle außerhalb der Tab-Reihenfolge', () => {
		render(BewertungFunnel);
		const trap = document.querySelector('[data-ds-honeypot] input')!;
		expect(trap).toHaveAttribute('tabindex', '-1');
		expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
	});

	it('die Vorlage im Skill ist dieselbe Datei, die hier getestet wird', () => {
		const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
		expect(skill).toContain('BewertungFunnel.svelte');
		expect(readFileSync(join(SKILL_DIR, 'BewertungFunnel.svelte'), 'utf8')).toContain(
			"createLeadClient('bewertung')",
		);
	});
});
