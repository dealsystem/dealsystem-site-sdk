import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetAttributionForTests } from '../src/lib/client/attribution.js';
import { resetTrackingForTests } from '../src/lib/client/tracking.js';
import { COOKIE_BANNER_TEXTS, type CookieBannerTexts } from '../src/lib/consent/bannerTexts.js';
import { consent, setConsent } from '../src/lib/consent/consent.svelte.js';
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

describe('auf jeder Seite', () => {
	it('ohne Tracking-Kennung fragt er nach „Marketing“ für die Wiedererkennung von Besuchen', async () => {
		setSiteDataForTests(testSiteData());
		const user = userEvent.setup();
		render(StarterLayoutHarness);
		expect(await screen.findByRole('dialog', { name: 'Cookies und Datenschutz' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cookie-Einstellungen' })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
		const marketing = screen.getByRole('checkbox', { name: /Marketing/ });
		expect(marketing).not.toBeChecked();
		expect(marketing).toHaveAccessibleDescription(COOKIE_BANNER_TEXTS.sie.marketingHint);
		expect(screen.getByText(/DealSystem/)).toBeInTheDocument();
		expect(screen.queryByRole('checkbox', { name: /Statistik/ })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: /Externe Inhalte/ })).toBeNull();
		// Vor der Wahl nichts gespeichert, keine Besuchs-ID.
		expect(localStorage.length).toBe(0);
	});

	it('mit Tracking-Kennung nennt „Marketing“ auch die Werbemessung', async () => {
		const user = userEvent.setup();
		render(StarterLayoutHarness);
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).toHaveAccessibleDescription(
			`${COOKIE_BANNER_TEXTS.sie.marketingHint} ${COOKIE_BANNER_TEXTS.sie.marketingAdsHint}`,
		);
		expect(screen.queryByRole('checkbox', { name: /Statistik/ })).toBeNull();
		expect(screen.queryByRole('checkbox', { name: /Externe Inhalte/ })).toBeNull();
	});

	it('eine Karte auf der Seite fragt zusätzlich nach „Externe Inhalte“', async () => {
		setSiteDataForTests(testSiteData());
		const user = userEvent.setup();
		render(StarterLayoutHarness, { props: { map: true } });
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Externe Inhalte/ })).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).toBeInTheDocument();
	});

	it('ohne <SiteHead> verschwindet er mit dem letzten Baustein, der ihn braucht', async () => {
		setSiteDataForTests(testSiteData());
		const view = render(StarterLayoutHarness, { props: { map: true, head: false } });
		expect(await screen.findByRole('dialog')).toBeInTheDocument();
		await view.rerender({ map: false, head: false });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('wer schon entschieden hat, kann auf jeder Seite widerrufen', async () => {
		setSiteDataForTests(testSiteData());
		localStorage.setItem(
			'ds-consent',
			JSON.stringify({ v: 1, at: Date.now(), granted: { statistics: false, marketing: false, media: true } }),
		);
		render(StarterLayoutHarness);
		expect(await screen.findByRole('button', { name: 'Cookie-Einstellungen' })).toBeInTheDocument();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('hält unten seine Höhe frei, solange er offen ist, und gibt sie nach der Wahl zurück (WCAG 2.4.11)', async () => {
		document.body.style.paddingBottom = '3px';
		const user = userEvent.setup();
		render(StarterLayoutHarness);
		await screen.findByRole('dialog');
		await waitFor(() => expect(document.documentElement.style.scrollPaddingBottom).toMatch(/px$/));
		expect(document.body.style.paddingBottom).not.toBe('3px');
		await user.click(screen.getByRole('button', { name: 'Alle ablehnen' }));
		await waitFor(() => expect(document.body.style.paddingBottom).toBe('3px'));
		expect(document.documentElement.style.scrollPaddingBottom).toBe('');
		document.body.style.paddingBottom = '';
	});

	it('blockiert die Seite nicht: kein modaler Dialog, Inhalt bleibt erreichbar', async () => {
		render(StarterLayoutHarness);
		const dialog = await screen.findByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'false');
		expect(screen.getByRole('heading', { name: 'Startseite' })).toBeVisible();
		expect(screen.getByRole('link', { name: 'Datenschutz' })).toBeInTheDocument();
	});
});

describe('Anrede und Texte', () => {
	/** Seite mit Tracking und der Anrede aus dem CRM. */
	function withSalutation(salutation: 'sie' | 'du') {
		const data = testSiteData({ tracking: { metaPixelId: '1234567890', googleTagId: null } });
		setSiteDataForTests({ ...data, site: { ...data.site, salutation } });
	}

	it('duzt, wenn im CRM „Du“ eingestellt ist', async () => {
		withSalutation('du');
		const user = userEvent.setup();
		render(LayoutHarness, { props: { categories: ['marketing'] } });
		const dialog = await screen.findByRole('dialog');
		expect(dialog).toHaveTextContent(COOKIE_BANNER_TEXTS.du.intro);
		expect(dialog).toHaveTextContent(COOKIE_BANNER_TEXTS.du.change);
		await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('group', { name: 'Deine Auswahl' })).toBeInTheDocument();
		expect(dialog).not.toHaveTextContent(/\b(Sie|Ihre?[nrms]?)\b/);
	});

	it('auch der Platzhalter der Karte duzt, wenn im CRM „Du“ eingestellt ist', async () => {
		const data = testSiteData();
		setSiteDataForTests({ ...data, site: { ...data.site, salutation: 'du' } });
		render(StarterLayoutHarness, { props: { map: true, head: false } });
		expect(await screen.findByText(/zum Beispiel deine IP-Adresse/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Karte anzeigen' })).toBeInTheDocument();
	});

	it('die Prop anrede geht ausnahmsweise vor der Einstellung im CRM', async () => {
		withSalutation('du');
		render(LayoutHarness, { props: { anrede: 'sie', categories: ['marketing'] } });
		expect(await screen.findByRole('dialog')).toHaveTextContent(COOKIE_BANNER_TEXTS.sie.intro);
	});

	it('siezt ohne Angabe, und einzelne Texte lassen sich überschreiben', async () => {
		render(LayoutHarness, {
			props: { categories: ['marketing'], texts: { title: 'Kurz zu Cookies', rejectAll: 'Nein danke' } },
		});
		const dialog = await screen.findByRole('dialog', { name: 'Kurz zu Cookies' });
		expect(dialog).toHaveTextContent(COOKIE_BANNER_TEXTS.sie.intro);
		expect(screen.getByRole('button', { name: 'Nein danke' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Alle akzeptieren' })).toBeInTheDocument();
	});

	it('beide Anreden haben jeden Text', () => {
		const keys = Object.keys(COOKIE_BANNER_TEXTS.sie).sort();
		expect(Object.keys(COOKIE_BANNER_TEXTS.du).sort()).toEqual(keys);
		for (const anrede of ['sie', 'du'] as const) {
			for (const key of keys)
				expect(COOKIE_BANNER_TEXTS[anrede][key as keyof CookieBannerTexts].trim(), key).not.toBe('');
		}
	});
});

describe('eigenes Banner', () => {
	beforeEach(() => {
		setSiteDataForTests(
			testSiteData({
				tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' },
				consent: { banner: 'own' },
			}),
		);
	});

	it('zeigt weder Hinweis noch „Cookie-Einstellungen“ und lädt ohne Meldung nichts', async () => {
		render(StarterLayoutHarness, { props: { map: true } });
		await waitFor(() => expect(consent.ready).toBe(true));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Cookie-Einstellungen' })).toBeNull();
		expect(consent.has('marketing')).toBe(false);
		expect(externalRequests()).toEqual([]);
		expect(document.querySelector('iframe')).toBeNull();
		expect(localStorage.getItem('ds-attr')).toBeNull();
	});

	it('übernimmt die Wahl aus setConsent(), auch nur für einzelne Zwecke', async () => {
		render(StarterLayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		setConsent({ marketing: true });
		expect(consent.has('marketing')).toBe(true);
		expect(consent.has('statistics')).toBe(false);
		expect(consent.has('media')).toBe(false);
		await waitFor(() => expect(externalRequests().length).toBeGreaterThan(0));
		// Speichern ist Sache des eigenen Banners.
		expect(stored()).toBeNull();
	});

	it('Widerruf über setConsent() löscht die Besuchs-ID', async () => {
		render(StarterLayoutHarness);
		await waitFor(() => expect(consent.ready).toBe(true));
		setConsent({ marketing: true });
		const visitorId = () => JSON.parse(localStorage.getItem('ds-attr') ?? '{}').visitorId;
		expect(visitorId()?.id).toMatch(/^[0-9a-f-]{36}$/);
		setConsent({ marketing: false });
		expect(consent.has('marketing')).toBe(false);
		expect(visitorId()).toBeUndefined();
	});
});

describe('setConsent() mit dem Banner von DealSystem', () => {
	it('speichert die Wahl wie ein Klick und schließt den Hinweis', async () => {
		render(StarterLayoutHarness);
		await screen.findByRole('dialog');
		setConsent({ marketing: false, media: true });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(stored()?.granted).toEqual({ statistics: false, marketing: false, media: true });
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
