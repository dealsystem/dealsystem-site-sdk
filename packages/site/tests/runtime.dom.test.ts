// Inhalte, die erst im Browser über die Site-API kommen.
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { loadCollection, loadEntry } from '../src/lib/client/collections.js';
import RichText from '../src/lib/components/RichText.svelte';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { richtextToHtmlInBrowser } from '../src/lib/richtext/browser.js';
import ListHarness from './fixtures/ListHarness.svelte';
import { jsonResponse, testSiteData } from './helpers.js';

const fetchSpy = vi.fn<typeof fetch>();
const entry = {
	slug: 'altbau',
	publishedAt: '2026-11-01T09:00:00.000Z',
	data: { titel: 'Altbau', beschreibung: 'Sehr **hell** <img src=x onerror="window.gehackt=1">' },
	media: {},
};

beforeEach(() => {
	setSiteDataForTests(testSiteData());
	fetchSpy.mockReset();
	vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
	vi.unstubAllGlobals();
	setSiteDataForTests(null);
});

describe('richtextToHtmlInBrowser', () => {
	it.each([
		['<script>alert(1)</script>Text', /script|alert/],
		['<img src=x onerror=alert(1)>', /<img|onerror/],
		['[klick](javascript:alert(1))', /javascript:/],
		['<iframe src="https://evil.test"></iframe>', /iframe|evil/],
		['<p style="position:fixed" data-x="1">x</p>', /style=|data-x/],
		['<a href="//evil.test">x</a>', /evil/],
		['<a href="data:text/html,x">x</a>', /data:/],
		['<a href=" JaVaScRiPt:alert(1)">x</a>', /script/i],
	])('entfernt Gefährliches: %s', (source, forbidden) => {
		expect(richtextToHtmlInBrowser(source)).not.toMatch(forbidden);
	});

	it('erhält Formatierung und sichert Links in neuem Tab', () => {
		expect(richtextToHtmlInBrowser('Ein **fetter** [Link](https://beispiel.de)')).toContain(
			'<strong>fetter</strong> <a href="https://beispiel.de">Link</a>',
		);
		expect(richtextToHtmlInBrowser('<a href="https://a.de" target="_blank">a</a>')).toContain(
			'rel="noopener noreferrer"',
		);
		expect(richtextToHtmlInBrowser('<a href="/kontakt" target="oben">a</a>')).toBe(
			'<p><a href="/kontakt">a</a></p>\n',
		);
		expect(richtextToHtmlInBrowser('<a href="mailto:a@b.de" title="Schreiben Sie uns">a</a>')).toContain(
			'href="mailto:a@b.de" title="Schreiben Sie uns"',
		);
		expect(richtextToHtmlInBrowser('<table><tr><td colspan="2">x</td></tr></table>')).toContain(
			'colspan="2"',
		);
	});
});

describe('<RichText content> mit Markdown-Quelltext', () => {
	it('zeigt zuerst maskierten Text und danach geprüftes HTML', async () => {
		const { container } = render(RichText, {
			props: { content: { kind: 'richtext', source: entry.data.beschreibung } },
		});
		await waitFor(() => expect(container.querySelector('strong')).not.toBeNull());
		expect(container.querySelector('strong')).toHaveTextContent('hell');
		expect(container.querySelector('img')).toBeNull();
		expect((window as unknown as Record<string, unknown>).gehackt).toBeUndefined();
	});
});

describe('loadCollection / loadEntry', () => {
	it('liefert Einträge mit Richtext als Quelltext, nie als fertiges HTML', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: [entry], meta: { total: 1 } }));
		const result = await loadCollection('angebote', { limit: 5 });

		expect(String(fetchSpy.mock.calls[0]![0])).toBe(
			'https://core.test/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/collections/angebote?limit=5',
		);
		expect(result).toEqual({
			ok: true,
			data: {
				total: 1,
				entries: [
					{
						...entry,
						data: { titel: 'Altbau', beschreibung: { kind: 'richtext', source: entry.data.beschreibung } },
					},
				],
			},
		});
	});

	it('gibt Fehler als Wert zurück', async () => {
		fetchSpy.mockRejectedValue(new TypeError('offline'));
		expect(await loadCollection('angebote')).toMatchObject({ ok: false, error: { kind: 'network' } });
		fetchSpy.mockResolvedValue(jsonResponse(404, { error: 'x', message: 'x', status: 404 }));
		expect(await loadEntry('angebote', 'fehlt')).toMatchObject({ ok: false, error: { kind: 'not_found' } });
	});
});

describe('<CollectionList> ohne entries', () => {
	it('lädt im Browser und zeigt die Einträge', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: [entry] }));
		render(ListHarness);
		expect(await screen.findByRole('link', { name: 'Altbau' })).toHaveAttribute('href', '/angebote/altbau');
		expect(screen.queryByText('Einträge werden geladen.')).toBeNull();
	});

	it('meldet einen Ladefehler und lädt auf Wunsch erneut', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse(500, { error: 'x', message: 'x', status: 500 }));
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: [entry] }));
		const user = userEvent.setup();
		render(ListHarness);

		expect(await screen.findByText('Die Einträge konnten nicht geladen werden.')).toBeInTheDocument();
		expect(screen.queryByText('Zurzeit gibt es hier keine Einträge.')).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
		expect(await screen.findByRole('link', { name: 'Altbau' })).toBeInTheDocument();
	});

	it('fragt die Site-API nicht, wenn Einträge übergeben werden', async () => {
		render(ListHarness, { props: { entries: [] } });
		expect(await screen.findByText('Zurzeit gibt es hier keine Einträge.')).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
