// <Booker>: Barrierefreiheit und Ablauf. Tastatur, Fokus beim Schrittwechsel, Zeiten als echte Buttons,
// Live-Region für „Termin gebucht“, Zeitzonen-Hinweis, `slot_taken`, Vorschau, Ausweichkontakt.
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { formatBookingTime, visitorTimeZone } from '../src/lib/client/bookingTime.js';
import { setCaptchaAdapterForTests } from '../src/lib/client/captcha.js';
import Booker from '../src/lib/components/Booker.svelte';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { INFO, SLOTS } from './fixtures/booking.js';
import { jsonResponse, testSiteData } from './helpers.js';

const fetchSpy = vi.fn<typeof fetch>();
let slots = [...SLOTS];
let bookingAnswer: () => Response;
let infoAnswer: () => Response;
const zone = visitorTimeZone();
const time = (i: number) => formatBookingTime(SLOTS[i]!.start, zone);
const bookings = () => fetchSpy.mock.calls.filter(([input]) => String(input).endsWith('/bookings'));

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	resetAttributionForTests();
	slots = [...SLOTS];
	setCaptchaAdapterForTests(async (_el, _url, callbacks) => {
		queueMicrotask(() => callbacks.onSolved('loesung'));
		return { reset: () => queueMicrotask(() => callbacks.onSolved('loesung-neu')), destroy: () => {} };
	});
	infoAnswer = () => jsonResponse(200, { data: INFO });
	bookingAnswer = () =>
		jsonResponse(201, { data: { booked: true, start: SLOTS[0]!.start, end: SLOTS[0]!.end } });
	fetchSpy.mockReset();
	fetchSpy.mockImplementation(async (input) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/slots')) {
			return jsonResponse(200, { data: { timezone: 'Europe/Berlin', from: '', to: '', slots } });
		}
		if (url.pathname.endsWith('/bookings')) return bookingAnswer();
		return infoAnswer();
	});
	vi.stubGlobal('fetch', fetchSpy);
	setSiteDataForTests(testSiteData());
});

afterEach(() => {
	vi.unstubAllGlobals();
	setCaptchaAdapterForTests(null);
	setSiteDataForTests(null);
});

async function toDetails(user: ReturnType<typeof userEvent.setup>) {
	render(Booker, { booking: 'erstgespraech' });
	const button = await screen.findByRole('button', { name: new RegExp(`${time(0)} Uhr$`) });
	// Mit der Tastatur: Fokus auf die Zeit, Enter.
	button.focus();
	await user.keyboard('{Enter}');
	await waitFor(() => expect(screen.getByRole('heading', { name: 'Ihre Angaben' })).toHaveFocus());
}

async function fillAndBook(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/^Vorname/), 'Erika');
	await user.type(screen.getByLabelText(/^E-Mail/), 'erika@beispiel.de');
	await user.type(screen.getByLabelText(/^Worum geht es\?/), 'Wohnung verkaufen');
	await user.click(screen.getByRole('button', { name: 'Termin buchen' }));
}

describe('<Booker>', () => {
	it('Tage und Zeiten sind echte Buttons; der gewählte Tag ist aria-pressed; der Zeitzonen-Hinweis nennt den Kalender', async () => {
		render(Booker, { booking: 'erstgespraech' });
		const heading = await screen.findByRole('heading', {
			level: 2,
			name: 'Erstgespräch: Tag und Uhrzeit wählen',
		});
		expect(heading).toBeInTheDocument();
		const days = within(screen.getByRole('group', { name: 'Tag wählen' })).getAllByRole('button');
		expect(days).toHaveLength(1);
		expect(days[0]).toHaveAttribute('aria-pressed', 'true');
		expect(days[0]).toHaveAccessibleName(/Dienstag, 1\. Dezember 2026, 2 freie Zeiten/);
		const times = within(screen.getByRole('group', { name: /Dezember 2026/ })).getAllByRole('button');
		expect(times.map((t) => t.textContent?.trim())).toEqual([time(0), time(1)]);
		expect(times.every((t) => t.tagName === 'BUTTON' && t.getAttribute('type') === 'button')).toBe(true);
		expect(screen.getByText(/Zeiten in Ihrer Zeitzone/)).toHaveTextContent(
			/30 Minuten\. Zeiten in Ihrer Zeitzone: .+/,
		);
	});

	it('nur Tastatur: Zeit wählen → Fokus auf „Ihre Angaben“, buchen → Fokus auf die Bestätigung, Live-Region meldet es', async () => {
		const user = userEvent.setup();
		await toDetails(user);
		// Ort: zwei Arten → Auswahl als Radiogruppe, die erste vorgewählt.
		expect(screen.getByRole('radio', { name: 'Telefon' })).toBeChecked();
		await fillAndBook(user);
		const done = await screen.findByRole('heading', { name: 'Ihr Termin ist gebucht' });
		await waitFor(() => expect(done).toHaveFocus());
		const live = document.querySelector('[aria-live="polite"]')!;
		expect(live).toHaveTextContent(`Termin gebucht: Dienstag, 1. Dezember 2026, ${time(0)} Uhr.`);
		expect(bookings()).toHaveLength(1);
	});

	it('fehlende Angaben: Fokus auf das erste markierte Feld, Fehlertext verbunden, nichts gesendet', async () => {
		const user = userEvent.setup();
		await toDetails(user);
		await user.click(screen.getByRole('button', { name: 'Termin buchen' }));
		const vorname = screen.getByLabelText(/^Vorname/);
		await waitFor(() => expect(vorname).toHaveFocus());
		expect(vorname).toHaveAttribute('aria-invalid', 'true');
		expect(vorname).toHaveAccessibleDescription('Bitte geben Sie Ihren Vornamen an.');
		expect(screen.getByLabelText(/^Worum geht es\?/)).toHaveAccessibleDescription(
			'Bitte füllen Sie das Feld „Worum geht es?“ aus.',
		);
		expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
			'Bitte prüfen Sie die 3 markierten Felder.',
		);
		expect(bookings()).toHaveLength(0);
	});

	it('slot_taken: zurück zur Zeitwahl mit Fokus, Hinweis, die Zeit ist weg, die Angaben bleiben', async () => {
		const user = userEvent.setup();
		await toDetails(user);
		bookingAnswer = () =>
			jsonResponse(409, { error: 'Conflict', message: 'x', status: 409, code: 'slot_taken' });
		slots = [SLOTS[1]!];
		await fillAndBook(user);
		const heading = await screen.findByRole('heading', { name: /Tag und Uhrzeit wählen/ });
		await waitFor(() => expect(heading).toHaveFocus());
		expect(screen.getByRole('alert')).toHaveTextContent('Diese Zeit ist leider nicht mehr frei');
		expect(screen.queryByRole('button', { name: new RegExp(`${time(0)} Uhr$`) })).toBeNull();
		await user.click(screen.getByRole('button', { name: new RegExp(`${time(1)} Uhr$`) }));
		expect(await screen.findByLabelText(/^Vorname/)).toHaveValue('Erika');
	});

	it('Vorschau: geprüft, nicht gebucht; die Bestätigung sagt es', async () => {
		const user = userEvent.setup();
		bookingAnswer = () => jsonResponse(200, { data: { booked: true, dryRun: true } });
		await toDetails(user);
		await fillAndBook(user);
		expect(await screen.findByRole('heading', { name: 'Vorschau: Termin geprüft' })).toBeInTheDocument();
		expect(screen.getByText(/nicht angelegt/)).toBeInTheDocument();
	});

	it('Buchung nicht verfügbar: Hinweis mit Telefon und E-Mail aus dem CRM', async () => {
		infoAnswer = () =>
			jsonResponse(404, { error: 'x', message: 'x', status: 404, code: 'booking_unavailable' });
		render(Booker, { booking: 'erstgespraech' });
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Die Terminbuchung ist zurzeit nicht verfügbar.',
		);
		expect(screen.getByRole('link', { name: '0341 1234567' })).toHaveAttribute('href', 'tel:03411234567');
		expect(screen.getByRole('link', { name: 'info@kunde.de' })).toHaveAttribute(
			'href',
			'mailto:info@kunde.de',
		);
	});

	it('Überschriften-Ebene einstellbar', async () => {
		render(Booker, { booking: 'erstgespraech', headingLevel: 3 });
		expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Tag und Uhrzeit wählen');
	});
});
