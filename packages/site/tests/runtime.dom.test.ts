// Inhalte, die erst im Browser über die Site-API kommen.
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { loadCollection, loadEntry } from '../src/lib/client/collections.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import ListHarness from './fixtures/ListHarness.svelte';
import { jsonResponse, testSiteData } from './helpers.js';

const fetchSpy = vi.fn<typeof fetch>();
const entry = {
	slug: 'altbau',
	publishedAt: '2026-11-01T09:00:00.000Z',
	data: { titel: 'Altbau', beschreibung: '<p>Sehr <strong>hell</strong></p>' },
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

describe('loadCollection / loadEntry', () => {
	it('liefert Einträge samt bereinigtem Richtext-HTML vom Server', async () => {
		fetchSpy.mockResolvedValue(jsonResponse(200, { data: [entry], meta: { total: 1 } }));
		const result = await loadCollection('angebote', { limit: 5 });

		expect(String(fetchSpy.mock.calls[0]![0])).toBe(
			'https://core.test/api/site/v1/s/dsp_TEST1234_abcdefghijklmnopqrstuvwx/collections/angebote?limit=5',
		);
		expect(result).toEqual({
			ok: true,
			data: {
				total: 1,
				entries: [entry],
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
		expect(screen.getByText('hell').tagName).toBe('STRONG');
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
