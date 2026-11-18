// <Zeitfenster> im Browser: übernimmt das HTML des Builds und schaltet an der Grenze mit der Uhr des Besuchers um.
import { render, screen } from '@testing-library/svelte';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import ZeitHarness from './fixtures/ZeitHarness.svelte';
import { testSiteData } from './helpers.js';

afterEach(() => {
	vi.useRealTimers();
	setSiteDataForTests(null);
});

it('schaltet an der Grenze um, ohne neu zu laden', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	// Gebaut vor einer Woche; der Besucher kommt eine Minute vor Beginn.
	setSiteDataForTests({ ...testSiteData(), builtAt: Date.parse('2026-11-24T12:00:00Z') });
	vi.setSystemTime(new Date('2026-12-01T16:59:00Z'));
	render(ZeitHarness);
	expect(screen.getByText('Jetzt anmelden')).toBeInTheDocument();
	expect(screen.queryByText('Webinar läuft gerade')).toBeNull();

	await vi.advanceTimersByTimeAsync(61_000);
	expect(screen.queryByText('Jetzt anmelden')).toBeNull();
	expect(screen.getByText('Webinar läuft gerade')).toBeInTheDocument();

	await vi.advanceTimersByTimeAsync(90 * 60_000);
	expect(screen.queryByText('Webinar läuft gerade')).toBeNull();
});

it('war die Grenze beim Build schon vorbei, aber der Besucher kommt danach: sofort richtig', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	setSiteDataForTests({ ...testSiteData(), builtAt: Date.parse('2026-11-24T12:00:00Z') });
	vi.setSystemTime(new Date('2026-12-01T17:30:00Z'));
	render(ZeitHarness);
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.queryByText('Jetzt anmelden')).toBeNull();
	expect(screen.getByText('Webinar läuft gerade')).toBeInTheDocument();
});
