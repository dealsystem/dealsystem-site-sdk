import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { resetTrackingForTests } from '../src/lib/client/tracking.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { reloadPage } from '../src/lib/internal/reload.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import MapEmbed from '../src/lib/components/MapEmbed.svelte';
import GateHarness from './fixtures/GateHarness.svelte';
import LayoutHarness from './fixtures/LayoutHarness.svelte';
import StarterLayoutHarness from './fixtures/StarterLayoutHarness.svelte';
import { testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const fetchSpy = vi.fn();

/** Alles im Dokument, das eine Adresse außerhalb der Seite lädt. */
function externalRequests(): string[] {
	const urls: string[] = [];
	for (const element of document.querySelectorAll(
		'script[src], iframe[src], img[src], link[href], video[src], source[src]',
	)) {
		const url = element.getAttribute('src') ?? element.getAttribute('href') ?? '';
		if (/^(https?:)?\/\//.test(url)) urls.push(url);
	}
	return urls;
}

function stored(): { granted: Record<string, boolean> } | null {
	const raw = localStorage.getItem('ds-consent');
	return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	consent.resetForTests();
	resetTrackingForTests();
	resetAttributionForTests();
	for (const script of document.head.querySelectorAll('script')) script.remove();
	const w = window as unknown as Record<string, unknown>;
	delete w.fbq;
	delete w._fbq;
	delete w.gtag;
	delete w.dataLayer;
	fetchSpy.mockReset();
	vi.stubGlobal('fetch', fetchSpy);
	vi.mocked(reloadPage).mockReset();
	setSiteDataForTests(testSiteData({ tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' } }));
});

afterEach(() => {
	vi.unstubAllGlobals();
	setSiteDataForTests(null);
});

describe('vor der Entscheidung', () => {
	it('zeigt den Hinweis und lädt nichts von Dritten', async () => {
		render(LayoutHarness);

		const dialog = await screen.findByRole('dialog', { name: 'Cookies und Datenschutz' });
		expect(dialog).toBeVisible();
		expect(externalRequests()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(document.querySelector('iframe')).toBeNull();
		expect((window as unknown as Record<string, unknown>).fbq).toBeUndefined();
		expect(stored()).toBeNull();
		expect(consent.has('marketing')).toBe(false);
	});

	it('bietet Ablehnen und Akzeptieren gleichwertig an', async () => {
		render(LayoutHarness);
		const reject = await screen.findByRole('button', { name: 'Alle ablehnen' });
		const accept = screen.getByRole('button', { name: 'Alle akzeptieren' });

		// Gleiche Art von Element, gleiche Gestaltung, gleiche Ebene, Ablehnen zuerst.
		expect(reject.tagName).toBe(accept.tagName);
		expect(reject.className).toBe(accept.className);
		expect(reject.parentElement).toBe(accept.parentElement);
		expect(reject.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(reject).toBeEnabled();
	});

	it('lässt sich nicht mit Escape wegdrücken', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		(await screen.findByRole('dialog')).focus();
		await user.keyboard('{Escape}');
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(stored()).toBeNull();
	});
});

describe('nur bei Bedarf', () => {
	it('ohne Tracking-Kennung und ohne gesperrte Inhalte: kein Hinweis, nichts einzustellen, nichts gespeichert', async () => {
		setSiteDataForTests(testSiteData());
		render(StarterLayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Cookie-Einstellungen' })).toBeNull();
		expect(document.querySelector('[data-ds-cookie-banner]')).not.toBeNull();
		expect(screen.getByRole('link', { name: 'Datenschutz' })).toBeInTheDocument();
		expect(localStorage.length).toBe(0);
	});

	it('mit Tracking-Kennung fragt er nur nach „Marketing“', async () => {
		const user = userEvent.setup();
		render(StarterLayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).toBeInTheDocument();
		expect(screen.queryByRole('checkbox', { name: /Statistik/ })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: /Externe Inhalte/ })).toBeNull();
		expect(screen.getByRole('button', { name: 'Cookie-Einstellungen' })).toBeInTheDocument();
	});

	it('eine Karte auf der Seite braucht ihn auch ohne Tracking', async () => {
		setSiteDataForTests(testSiteData());
		const user = userEvent.setup();
		render(StarterLayoutHarness, { props: { map: true } });
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Externe Inhalte/ })).toBeInTheDocument();
		expect(screen.queryByRole('checkbox', { name: /Marketing/ })).toBeNull();
	});

	it('verschwindet mit dem letzten Baustein, der ihn braucht', async () => {
		setSiteDataForTests(testSiteData());
		const view = render(StarterLayoutHarness, { props: { map: true } });
		expect(await screen.findByRole('dialog')).toBeInTheDocument();
		await view.rerender({ map: false });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('wer schon zugestimmt hat, kann auf jeder Seite widerrufen', async () => {
		setSiteDataForTests(testSiteData());
		localStorage.setItem(
			'ds-consent',
			JSON.stringify({ v: 1, at: Date.now(), granted: { statistics: false, marketing: false, media: true } }),
		);
		render(StarterLayoutHarness);
		expect(await screen.findByRole('button', { name: 'Cookie-Einstellungen' })).toBeInTheDocument();
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

describe('Ablehnen', () => {
	it('speichert die Wahl, schließt den Hinweis und lädt weiterhin nichts', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle ablehnen' }));

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: false });
		expect(externalRequests()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(reloadPage).not.toHaveBeenCalled();
	});

	it('fragt beim nächsten Besuch nicht erneut', async () => {
		localStorage.setItem(
			'ds-consent',
			JSON.stringify({
				v: 1,
				at: Date.now(),
				granted: { statistics: false, marketing: false, media: false },
			}),
		);
		render(LayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(externalRequests()).toEqual([]);
	});
});

describe('Akzeptieren', () => {
	it('lädt Tracking und gesperrte Inhalte erst danach', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));

		expect(screen.queryByRole('dialog')).toBeNull();
		// Nur die Zwecke, die die Seite nutzt: Tracking und den gesperrten Inhalt, keine Statistik.
		expect(stored()?.granted).toEqual({ statistics: false, marketing: true, media: true });
		await waitFor(() =>
			expect(externalRequests().sort()).toEqual([
				'https://connect.facebook.net/en_US/fbevents.js',
				'https://maps.example/embed',
				'https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234',
			]),
		);
	});

	it('stimmt nur den Zwecken zu, die die Seite nennt', async () => {
		const user = userEvent.setup();
		render(LayoutHarness, { props: { categories: ['marketing'] } });
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));
		expect(stored()?.granted).toEqual({ statistics: false, marketing: true, media: false });
		expect(document.querySelector('iframe')).toBeNull();
	});

	it('lädt jedes Skript nur einmal', async () => {
		const user = userEvent.setup();
		const first = render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));
		await waitFor(() => expect(document.head.querySelectorAll('script')).toHaveLength(2));
		first.unmount();
		render(LayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(document.head.querySelectorAll('script')).toHaveLength(2);
	});
});

describe('Auswahl und Widerruf', () => {
	it('speichert eine einzelne Auswahl', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Notwendig/ })).toBeDisabled();
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).not.toBeChecked();

		await user.click(screen.getByRole('checkbox', { name: /Externe Inhalte/ }));
		await user.click(screen.getByRole('button', { name: 'Auswahl speichern' }));

		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: true });
		await waitFor(() => expect(externalRequests()).toEqual(['https://maps.example/embed']));
	});

	it('öffnet die Einstellungen über den Footer, mit Fokus im Dialog und zurück', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));

		const opener = screen.getByRole('button', { name: 'Cookie-Einstellungen' });
		await user.click(opener);
		const dialog = await screen.findByRole('dialog');
		await waitFor(() => expect(dialog).toHaveFocus());
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).toBeChecked();

		await user.keyboard('{Escape}');
		expect(screen.queryByRole('dialog')).toBeNull();
		await waitFor(() => expect(opener).toHaveFocus());
		expect(stored()?.granted.marketing).toBe(true);
	});

	it('lädt nach einem Widerruf die Seite neu, damit geladene Skripte verschwinden', async () => {
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));
		await user.click(screen.getByRole('button', { name: 'Cookie-Einstellungen' }));
		await user.click(await screen.findByRole('button', { name: 'Alle ablehnen' }));

		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: false });
		expect(reloadPage).toHaveBeenCalledTimes(1);
		expect(consent.has('marketing')).toBe(false);
	});
});

describe('gespeicherte Wahl', () => {
	it.each([
		['veraltet', { v: 1, at: Date.now() - 366 * 24 * 60 * 60 * 1000, granted: { marketing: true } }],
		['andere Version', { v: 0, at: Date.now(), granted: { marketing: true } }],
		['kaputt', 'kein json {'],
	])('gilt nicht, wenn sie %s ist', async (_name, value) => {
		localStorage.setItem('ds-consent', typeof value === 'string' ? value : JSON.stringify(value));
		render(LayoutHarness);
		expect(await screen.findByRole('dialog')).toBeInTheDocument();
		expect(consent.has('marketing')).toBe(false);
		expect(externalRequests()).toEqual([]);
	});

	it('wertet nur ausdrückliches true als Zustimmung', async () => {
		localStorage.setItem(
			'ds-consent',
			JSON.stringify({ v: 1, at: Date.now(), granted: { marketing: 'ja', media: 1 } }),
		);
		render(LayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(consent.has('marketing')).toBe(false);
		expect(consent.has('media')).toBe(false);
		expect(externalRequests()).toEqual([]);
	});
});

describe('<ConsentGate>', () => {
	it('zeigt den Ersatz und stimmt über accept genau diesem Zweck zu', async () => {
		const user = userEvent.setup();
		render(GateHarness, { props: { category: 'media', withFallback: true } });

		const button = await screen.findByRole('button', { name: 'Karte anzeigen' });
		expect(document.querySelector('iframe')).toBeNull();
		await user.click(button);

		expect(document.querySelector('iframe')?.getAttribute('src')).toBe('https://maps.example/embed');
		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: true });
		expect(screen.queryByRole('button', { name: 'Karte anzeigen' })).toBeNull();
	});

	it('zeigt ohne Ersatz und ohne Einwilligung nichts', async () => {
		const { container } = render(GateHarness, { props: { category: 'media' } });
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(container.querySelector('iframe')).toBeNull();
		expect(container.textContent?.trim()).toBe('');
	});
});

describe('<MapEmbed>', () => {
	const props = { lat: 53.8676, lon: 10.6866, title: 'Unser Büro in der Lübecker Altstadt', zoom: 15 };

	it('zeigt vor der Zustimmung nur den Hinweis und lädt die Karte erst nach „Karte anzeigen“', async () => {
		const user = userEvent.setup();
		const { container } = render(MapEmbed, { props });

		const button = await screen.findByRole('button', { name: 'Karte anzeigen' });
		expect(container.querySelector('iframe')).toBeNull();
		expect(externalRequests()).toEqual([]);
		expect(
			screen.getByText(/Daten, zum Beispiel Ihre IP-Adresse, an\s+OpenStreetMap übertragen/),
		).toBeInTheDocument();

		await user.click(button);
		const frame = container.querySelector('iframe')!;
		expect(frame).toHaveAttribute('title', props.title);
		const src = new URL(frame.getAttribute('src')!);
		// Genau die Herkunft, die die Sicherheitsregeln des Starters erlauben.
		expect(src.origin).toBe('https://www.openstreetmap.org');
		expect(src.pathname).toBe('/export/embed.html');
		expect(src.searchParams.get('marker')).toBe('53.8676,10.6866');
		const [west, south, east, north] = src.searchParams.get('bbox')!.split(',').map(Number);
		expect(west!).toBeLessThan(props.lon);
		expect(east!).toBeGreaterThan(props.lon);
		expect(south!).toBeLessThan(props.lat);
		expect(north!).toBeGreaterThan(props.lat);
		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: true });
		expect(screen.queryByRole('button', { name: 'Karte anzeigen' })).toBeNull();
	});

	it('bietet den Link zur Karte auch ohne Zustimmung an', async () => {
		render(MapEmbed, { props });
		const link = await screen.findByRole('link', { name: /Karte in OpenStreetMap öffnen/ });
		expect(link).toHaveAttribute('href', expect.stringContaining('mlat=53.8676'));
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAccessibleName(/neues Fenster.*Unser Büro/);
	});
});

describe('Zuordnung der Kampagne', () => {
	it('legt ohne Einwilligung nichts in den Browser-Speicher', async () => {
		window.history.replaceState({}, '', '/?utm_source=google&utm_campaign=herbst');
		const user = userEvent.setup();
		render(LayoutHarness);
		await screen.findByRole('dialog');
		expect(sessionStorage.length).toBe(0);

		await user.click(screen.getByRole('button', { name: 'Alle ablehnen' }));
		expect(sessionStorage.length).toBe(0);
		expect(Object.keys(localStorage)).toEqual(['ds-consent']);
		window.history.replaceState({}, '', '/');
	});

	it('speichert sie erst mit der Einwilligung „Marketing“', async () => {
		window.history.replaceState({}, '', '/?utm_source=google&utm_campaign=herbst');
		const user = userEvent.setup();
		render(LayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));
		expect(sessionStorage.length).toBe(0);
		expect(JSON.parse(localStorage.getItem('ds-attr')!)).toMatchObject({
			v: 2,
			first: { source: 'google', campaign: 'herbst', landingPath: '/' },
			touches: 1,
		});
		window.history.replaceState({}, '', '/');
	});
});
