// <Embed>, <ExternalScript> und Cookie-Hinweis mit fremden Diensten aus `external`: nichts vor der Einwilligung,
// Laden danach, Widerruf lädt die Seite neu.
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { resetExternalScriptsForTests } from '../src/lib/client/externalScript.js';
import { consent } from '../src/lib/consent/consent.svelte.js';
import { resolveExternal } from '../src/lib/external/resolve.js';
import { reloadPage } from '../src/lib/internal/reload.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import type { ExternalDef } from '../src/lib/types.js';
import ExternalHarness from './fixtures/ExternalHarness.svelte';
import { testSiteData } from './helpers.js';

vi.mock('../src/lib/internal/reload.js', () => ({ reloadPage: vi.fn() }));

const EXTERNAL: Record<string, ExternalDef> = {
	video: { preset: 'youtube' },
	chat: {
		category: 'marketing',
		provider: 'HubSpot, Inc., USA',
		purpose: 'Live-Chat mit dem Vertrieb',
		privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
		script: ['https://js.hs-scripts.com'],
		connect: ['https://*.hubspot.com'],
	},
};

/** Alles im Dokument, das eine Adresse außerhalb der Seite lädt. */
function externalRequests(): string[] {
	const urls: string[] = [];
	for (const element of document.querySelectorAll(
		'script[src], iframe[src], img[src], link[href], video[src]',
	)) {
		const url = element.getAttribute('src') ?? element.getAttribute('href') ?? '';
		if (/^(https?:)?\/\//.test(url)) urls.push(url);
	}
	return urls;
}

beforeEach(() => {
	localStorage.clear();
	consent.resetForTests();
	resetExternalScriptsForTests();
	for (const script of document.head.querySelectorAll('script')) script.remove();
	vi.mocked(reloadPage).mockReset();
	setSiteDataForTests(
		testSiteData({
			external: Object.fromEntries(resolveExternal(EXTERNAL).map((e) => [e.id, e])),
		}),
	);
});

afterEach(() => setSiteDataForTests(null));

describe('<Embed>', () => {
	it('lädt vor der Einwilligung nichts, auch kein Vorschaubild des Anbieters', async () => {
		render(ExternalHarness, { poster: '/bilder/vorschau.jpg' });
		expect(await screen.findByRole('button', { name: 'Video laden' })).toBeInTheDocument();
		expect(screen.getByText(/Google Ireland Limited/)).toBeInTheDocument();
		expect(document.querySelector('iframe')).toBeNull();
		expect(externalRequests()).toEqual([]);
		// Das Vorschaubild liegt auf der eigenen Seite.
		expect(document.querySelector('.ds-embed__poster')?.getAttribute('src')).toBe('/bilder/vorschau.jpg');
	});

	it('nach „Video laden“: Rahmen ohne Cookies, mit sandbox, und nur „Externe Inhalte“ ist erlaubt', async () => {
		const user = userEvent.setup();
		render(ExternalHarness);
		await user.click(await screen.findByRole('button', { name: 'Video laden' }));
		const frame = await waitFor(() => {
			const f = document.querySelector('iframe');
			expect(f).not.toBeNull();
			return f!;
		});
		expect(frame.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
		expect(frame.getAttribute('title')).toBe('Rundgang durch das Haus');
		expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
		expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
		expect(consent.has('media')).toBe(true);
		expect(consent.has('marketing')).toBe(false);
	});

	it('der Link zum Anbieter geht auch ohne Einwilligung', async () => {
		render(ExternalHarness);
		const link = await screen.findByRole('link', { name: /Beim Anbieter öffnen/ });
		expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
	});

	it('nach einem Widerruf lädt die Seite neu', async () => {
		const user = userEvent.setup();
		render(ExternalHarness);
		await user.click(await screen.findByRole('button', { name: 'Video laden' }));
		await user.click(screen.getByRole('button', { name: 'Cookie-Einstellungen' }));
		await user.click(await screen.findByRole('button', { name: 'Alle ablehnen' }));
		expect(reloadPage).toHaveBeenCalledTimes(1);
		expect(consent.has('media')).toBe(false);
	});

	it('ein fremder Host neben der Vorlage lädt nie, auch nach der Einwilligung', async () => {
		consent.init();
		consent.grant('media');
		// Im Browser der fertigen Seite nur protokolliert, nicht geworfen.
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			render(ExternalHarness, { src: 'https://evil.example.com/embed/aqz-KE-bpKQ' });
		} catch {
			// In der Entwicklung wirft das SDK; beides ist in Ordnung, solange nichts lädt.
		}
		expect(externalRequests()).toEqual([]);
		error.mockRestore();
	});
});

describe('<ExternalScript>', () => {
	it('lädt vor der Einwilligung nicht und danach genau einmal, mit den erlaubten Attributen', async () => {
		const user = userEvent.setup();
		const { rerender } = render(ExternalHarness, { video: false, chat: true });
		await screen.findByRole('dialog');
		expect(document.head.querySelector('script[src]')).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Alle akzeptieren' }));
		await waitFor(() => expect(document.head.querySelectorAll('script[src]')).toHaveLength(1));
		const script = document.head.querySelector('script[src]')!;
		expect(script.getAttribute('src')).toBe('https://js.hs-scripts.com/123.js');
		expect(script.getAttribute('id')).toBe('hs-script-loader');
		expect((script as HTMLScriptElement).defer).toBe(true);
		await rerender({ video: true, chat: true });
		expect(document.head.querySelectorAll('script[src]')).toHaveLength(1);
	});

	it('„Externe Inhalte“ allein lädt kein Marketing-Skript', async () => {
		consent.init();
		consent.grant('media');
		render(ExternalHarness, { video: false, chat: true });
		await Promise.resolve();
		expect(document.head.querySelector('script[src]')).toBeNull();
	});

	it('nach einem Widerruf lädt die Seite neu, damit das Skript verschwindet', async () => {
		const user = userEvent.setup();
		render(ExternalHarness, { video: false, chat: true });
		await user.click(await screen.findByRole('button', { name: 'Alle akzeptieren' }));
		await user.click(screen.getByRole('button', { name: 'Cookie-Einstellungen' }));
		await user.click(await screen.findByRole('button', { name: 'Alle ablehnen' }));
		expect(reloadPage).toHaveBeenCalledTimes(1);
	});
});

describe('Cookie-Hinweis', () => {
	it('fragt nach den Zwecken der Dienste und nennt die Anbieter mit Datenschutz-Link', async () => {
		const user = userEvent.setup();
		render(ExternalHarness, { chat: true });
		await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
		expect(screen.getByRole('checkbox', { name: /Externe Inhalte/ })).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: /Marketing/ })).toBeInTheDocument();
		const youtube = screen.getByRole('link', { name: /Google Ireland Limited, Irland \(YouTube\)/ });
		expect(youtube.getAttribute('href')).toBe('https://policies.google.com/privacy');
		expect(screen.getByRole('link', { name: /HubSpot, Inc\., USA/ })).toBeInTheDocument();
	});

	it('„Cookie-Einstellungen“ steht im Footer jeder Seite, auch ohne den Dienst auf dieser Seite', async () => {
		render(ExternalHarness, { video: false });
		expect(await screen.findByRole('button', { name: 'Cookie-Einstellungen' })).toBeInTheDocument();
	});
});
