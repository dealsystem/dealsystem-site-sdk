// <Booker>: Barrierefreiheit und Ablauf. Tastatur, Fokus beim Schrittwechsel, Zeiten als echte Buttons,
// Live-Region für „Termin gebucht“, Zeitzonen-Hinweis, `slot_taken`, Vorschau, Ausweichkontakt.
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { formatBookingTime, visitorTimeZone } from '../src/lib/client/bookingTime.js';
import { setCaptchaAdapterForTests } from '../src/lib/client/captcha.js';
import Booker from '../src/lib/components/Booker.svelte';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { safeHttpUrl, setNavigateForTests } from '../src/lib/internal/navigate.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { INFO, SLOTS } from './fixtures/booking.js';
import { jsonResponse, testSiteData } from './helpers.js';

const fetchSpy = vi.fn<typeof fetch>();
let slots = [...SLOTS];
let bookingAnswer: () => Response;
let infoAnswer: () => Response;
let qualifyAnswer: () => Response;
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
	qualifyAnswer = () => jsonResponse(200, { data: { qualified: true } });
	bookingAnswer = () =>
		jsonResponse(201, { data: { booked: true, start: SLOTS[0]!.start, end: SLOTS[0]!.end } });
	fetchSpy.mockReset();
	fetchSpy.mockImplementation(async (input) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/slots')) {
			return jsonResponse(200, { data: { timezone: 'Europe/Berlin', from: '', to: '', slots } });
		}
		if (url.pathname.endsWith('/bookings')) return bookingAnswer();
		if (url.pathname.endsWith('/qualify')) return qualifyAnswer();
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

describe('<Booker> mit flow: contact_first (erst Angaben, dann Zeit)', () => {
	beforeEach(() => {
		infoAnswer = () => jsonResponse(200, { data: { ...INFO, flow: 'contact_first' } });
	});

	async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
		await user.type(screen.getByLabelText(/^Vorname/), 'Erika');
		await user.type(screen.getByLabelText(/^E-Mail/), 'erika@beispiel.de');
		await user.type(screen.getByLabelText(/^Worum geht es\?/), 'Wohnung verkaufen');
	}

	it('fragt zuerst Angaben und Fragen ab, dann die Zeit, dann bucht es nach Bestätigung', async () => {
		const user = userEvent.setup();
		render(Booker, { booking: 'erstgespraech' });
		expect(await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' })).toBeInTheDocument();
		// Noch keine Zeiten sichtbar.
		expect(screen.queryByRole('group', { name: 'Tag wählen' })).not.toBeInTheDocument();
		await fillDetails(user);
		await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Erstgespräch: Tag und Uhrzeit wählen' })).toHaveFocus(),
		);
		expect(screen.getByText(/Ihre Angaben: Erika/)).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: new RegExp(`${time(0)} Uhr$`) }));
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Termin bestätigen' })).toHaveFocus());
		expect(bookings()).toHaveLength(0);
		await user.click(screen.getByRole('button', { name: 'Termin buchen' }));
		expect(await screen.findByRole('heading', { name: 'Ihr Termin ist gebucht' })).toBeInTheDocument();
		const body = JSON.parse(String(bookings()[0]![1]!.body)) as Record<string, unknown>;
		expect(body).toMatchObject({
			start: SLOTS[0]!.start,
			attendee: { firstName: 'Erika', email: 'erika@beispiel.de' },
			answers: { anliegen: 'Wohnung verkaufen' },
		});
	});

	it('fehlende Angaben: bleibt im ersten Schritt, Fokus aufs Feld, keine Zeiten', async () => {
		const user = userEvent.setup();
		render(Booker, { booking: 'erstgespraech' });
		await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' });
		await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
		await waitFor(() => expect(screen.getByLabelText(/^Vorname/)).toHaveFocus());
		expect(screen.queryByRole('group', { name: 'Tag wählen' })).not.toBeInTheDocument();
	});

	it('Server lehnt eine Angabe ab: zurück zu den Angaben, die Zeit bleibt gewählt', async () => {
		const user = userEvent.setup();
		bookingAnswer = () =>
			jsonResponse(422, {
				error: 'x',
				message: 'x',
				status: 422,
				code: 'validation_error',
				details: [{ path: 'attendee.email', message: 'x' }],
			});
		render(Booker, { booking: 'erstgespraech' });
		await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' });
		await fillDetails(user);
		await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
		await user.click(await screen.findByRole('button', { name: new RegExp(`${time(0)} Uhr$`) }));
		await user.click(await screen.findByRole('button', { name: 'Termin buchen' }));
		await waitFor(() => expect(screen.getByLabelText(/^E-Mail/)).toHaveFocus());
		expect(screen.getByText(/Bitte prüfen Sie Ihre Angabe bei „E-Mail“/)).toBeInTheDocument();
	});

	it('passt die Antwort nicht (qualify): Text aus dem CRM und Ausweichkontakt statt der Zeitwahl', async () => {
		const user = userEvent.setup();
		qualifyAnswer = () =>
			jsonResponse(200, {
				data: { qualified: false, headline: 'Leider kein Termin', message: 'Wir beraten nur beim Verkauf.' },
			});
		render(Booker, { booking: 'erstgespraech' });
		await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' });
		await fillDetails(user);
		await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Leider kein Termin' })).toHaveFocus());
		expect(screen.getByText('Wir beraten nur beim Verkauf.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '0341 1234567' })).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: 'Tag wählen' })).not.toBeInTheDocument();
		const call = fetchSpy.mock.calls.find(([input]) => String(input).endsWith('/qualify'));
		expect(JSON.parse(String(call![1]!.body))).toEqual({ answers: { anliegen: 'Wohnung verkaufen' } });
		expect(bookings()).toHaveLength(0);
		await user.click(screen.getByRole('button', { name: 'Angaben ändern' }));
		expect(await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' })).toBeInTheDocument();
	});

	it('leitet die Regel weiter (redirectUrl): dorthin statt zur Zeitwahl; javascript: wird nie übernommen', async () => {
		const user = userEvent.setup();
		const went: string[] = [];
		setNavigateForTests((url) => went.push(url));
		try {
			qualifyAnswer = () =>
				jsonResponse(200, {
					data: {
						qualified: false,
						headline: 'Passt besser hier',
						message: 'Wir leiten Sie weiter.',
						redirectUrl: 'https://kunde.de/mietanfrage',
					},
				});
			render(Booker, { booking: 'erstgespraech' });
			await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' });
			await fillDetails(user);
			await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
			await waitFor(() => expect(went).toEqual(['https://kunde.de/mietanfrage']));
			expect(screen.getByRole('link', { name: 'Weiter' })).toHaveAttribute(
				'href',
				'https://kunde.de/mietanfrage',
			);
			expect(screen.queryByRole('group', { name: 'Tag wählen' })).not.toBeInTheDocument();
		} finally {
			setNavigateForTests(null);
		}
		expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
		expect(safeHttpUrl('https://kunde.de/x')).toBe('https://kunde.de/x');
	});

	it('qualify technisch gestört: der Besucher kommt trotzdem zur Zeitwahl', async () => {
		const user = userEvent.setup();
		qualifyAnswer = () =>
			jsonResponse(500, { error: 'x', message: 'x', status: 500, code: 'internal_error' });
		render(Booker, { booking: 'erstgespraech' });
		await screen.findByRole('heading', { name: 'Erstgespräch: Ihre Angaben' });
		await fillDetails(user);
		await user.click(screen.getByRole('button', { name: 'Weiter zur Terminwahl' }));
		expect(
			await screen.findByRole('heading', { name: 'Erstgespräch: Tag und Uhrzeit wählen' }),
		).toBeInTheDocument();
	});

	it('ohne flow gilt calendar_first', async () => {
		infoAnswer = () => jsonResponse(200, { data: INFO });
		render(Booker, { booking: 'erstgespraech' });
		expect(
			await screen.findByRole('heading', { name: 'Erstgespräch: Tag und Uhrzeit wählen' }),
		).toBeInTheDocument();
	});
});

describe('<Booker>: Termin beim Gast (Ort-Art mit Adresse)', () => {
	const VOR_ORT = {
		...INFO,
		locations: [
			{ type: 'phone', label: 'Telefon', attendeeInput: null },
			{ type: 'attendee_address', label: 'Bei Ihnen vor Ort', attendeeInput: 'address' },
		],
	};

	it('Adressfelder nur bei „Bei Ihnen vor Ort“, mit autocomplete; Pflicht geprüft; Adresse geht mit', async () => {
		const user = userEvent.setup();
		infoAnswer = () => jsonResponse(200, { data: VOR_ORT });
		await toDetails(user);
		expect(screen.queryByLabelText(/^Straße und Hausnummer/)).not.toBeInTheDocument();
		await user.click(screen.getByRole('radio', { name: 'Bei Ihnen vor Ort' }));
		const street = screen.getByLabelText(/^Straße und Hausnummer/);
		expect(street).toHaveAttribute('autocomplete', 'street-address');
		expect(screen.getByLabelText(/^PLZ/)).toHaveAttribute('autocomplete', 'postal-code');
		expect(screen.getByLabelText(/^Ort/)).toHaveAttribute('autocomplete', 'address-level2');

		await fillAndBook(user);
		await waitFor(() => expect(street).toHaveFocus());
		expect(street).toHaveAccessibleDescription('Bitte geben Sie „Straße und Hausnummer“ an.');
		expect(bookings()).toHaveLength(0);

		await user.type(street, 'Lindenweg 4');
		await user.type(screen.getByLabelText(/^PLZ/), '04109');
		await user.type(screen.getByLabelText(/^Ort/), 'Leipzig');
		await user.click(screen.getByRole('button', { name: 'Termin buchen' }));
		expect(await screen.findByRole('heading', { name: 'Ihr Termin ist gebucht' })).toBeInTheDocument();
		expect(JSON.parse(String(bookings()[0]![1]!.body))).toMatchObject({
			locationType: 'attendee_address',
			attendeeAddress: { street: 'Lindenweg 4', postalCode: '04109', city: 'Leipzig' },
		});
	});

	it('Beschriftungen und Ort-Bezeichnung lassen sich überschreiben (z. B. per du)', async () => {
		const user = userEvent.setup();
		infoAnswer = () => jsonResponse(200, { data: VOR_ORT });
		render(Booker, {
			booking: 'erstgespraech',
			addressLabels: { street: 'Deine Straße', postalCode: 'Postleitzahl', city: 'Stadt' },
			locationLabels: { attendee_address: 'Bei dir vor Ort' },
		});
		await user.click(await screen.findByRole('button', { name: new RegExp(`${time(0)} Uhr$`) }));
		await user.click(await screen.findByRole('radio', { name: 'Bei dir vor Ort' }));
		expect(screen.queryByRole('radio', { name: 'Bei Ihnen vor Ort' })).not.toBeInTheDocument();
		for (const label of [/^Deine Straße/, /^Postleitzahl/, /^Stadt/])
			expect(screen.getByLabelText(label)).toBeInTheDocument();
	});

	it('nur eine Ort-Art, und die verlangt eine Adresse: Felder gleich da', async () => {
		const user = userEvent.setup();
		infoAnswer = () => jsonResponse(200, { data: { ...VOR_ORT, locations: [VOR_ORT.locations[1]] } });
		await toDetails(user);
		expect(screen.getByText('Ort: Bei Ihnen vor Ort')).toBeInTheDocument();
		expect(screen.getByLabelText(/^Straße und Hausnummer/)).toBeInTheDocument();
	});
});

describe('<Booker>: Telefon als Pflicht', () => {
	it('Terminart verlangt Telefon: Sternchen, Fehler am Feld, nichts gesendet', async () => {
		const user = userEvent.setup();
		infoAnswer = () => jsonResponse(200, { data: { ...INFO, attendeePhone: 'required' } });
		await toDetails(user);
		const phone = screen.getByRole('textbox', { name: /^Telefon/ });
		expect(phone).toBeRequired();
		expect(phone.closest('div')?.querySelector('label')?.textContent).toContain('*');
		await fillAndBook(user);
		await waitFor(() => expect(phone).toHaveFocus());
		expect(phone).toHaveAccessibleDescription('Bitte geben Sie Ihre Telefonnummer an.');
		expect(bookings()).toHaveLength(0);
	});

	it('ohne Pflicht bleibt Telefon freiwillig', async () => {
		const user = userEvent.setup();
		await toDetails(user);
		expect(screen.getByRole('textbox', { name: /^Telefon/ })).not.toBeRequired();
	});
});
