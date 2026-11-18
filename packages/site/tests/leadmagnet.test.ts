// Leadmagnet (Paket C4): Im Code steht nur die Ankündigung, nie die Datei oder ein Link.
import { defineSite, validateSiteConfig } from '../src/lib/config/index.js';
import { leadmagnetSuccessMessage, normalizeLeadmagnet } from '../src/lib/leadmagnet.js';
import { buildManifest } from '../src/lib/vite/index.js';

const fields = [{ name: 'email', type: 'email', standardField: 'email', required: true }] as const;

function site(leadmagnet: unknown) {
	return { siteId: 's1', funnels: { ratgeber: { label: 'Ratgeber', fields, leadmagnet } } };
}

describe('leadmagnet in dealsystem.config.ts', () => {
	it('nimmt ein label von 1 bis 120 Zeichen an', () => {
		expect(validateSiteConfig(site({ label: 'Ratgeber Immobilienverkauf' }))).toEqual([]);
		expect(validateSiteConfig(site({ label: 'R' }))).toEqual([]);
		expect(validateSiteConfig(site({ label: 'a'.repeat(120) }))).toEqual([]);
		// Gemessen wird nach dem Trimmen.
		expect(validateSiteConfig(site({ label: `  ${'a'.repeat(120)}  ` }))).toEqual([]);
		expect(() =>
			defineSite({
				siteId: 's1',
				funnels: { ratgeber: { label: 'Ratgeber', fields, leadmagnet: { label: 'Ratgeber' } } },
			}),
		).not.toThrow();
	});

	it('lehnt ein zu langes oder leeres label ab, mit Pfad', () => {
		expect(validateSiteConfig(site({ label: 'a'.repeat(121) }))).toEqual([
			{ path: 'funnels.ratgeber.leadmagnet.label', message: 'Höchstens 120 Zeichen (jetzt 121).' },
		]);
		for (const label of ['', '   ', undefined, 42]) {
			expect(validateSiteConfig(site({ label })).map((p) => p.path)).toEqual([
				'funnels.ratgeber.leadmagnet.label',
			]);
		}
	});

	it('lehnt Datei- und Link-Schlüssel ab und verweist auf das CRM', () => {
		for (const key of ['url', 'file', 'href', 'downloadUrl', 'pdf', 'datei', 'path', 'src', 'fileUrl']) {
			const problems = validateSiteConfig(site({ label: 'Ratgeber', [key]: '/ratgeber.pdf' }));
			expect(problems).toEqual([
				{
					path: `funnels.ratgeber.leadmagnet.${key}`,
					message: expect.stringContaining('Die Datei lädst du im CRM hoch (Eigene Website → Formulare)'),
				},
			]);
		}
	});

	it('lehnt einen Link im label ab', () => {
		for (const label of ['https://kunde.de/ratgeber.pdf', 'www.kunde.de/ratgeber', '//cdn.test/a.pdf']) {
			const [problem, ...rest] = validateSiteConfig(site({ label }));
			expect(rest).toEqual([]);
			expect(problem).toEqual({
				path: 'funnels.ratgeber.leadmagnet.label',
				message: expect.stringContaining('im CRM hoch'),
			});
		}
	});

	it('lehnt Unbekanntes und Nicht-Objekte ab (fail-closed)', () => {
		expect(validateSiteConfig(site({ label: 'R', titel: 'x' }))).toEqual([
			{
				path: 'funnels.ratgeber.leadmagnet.titel',
				message: 'Unbekannte Angabe "titel". Erlaubt ist nur label.',
			},
		]);
		for (const value of ['Ratgeber', true, null, ['Ratgeber']]) {
			expect(validateSiteConfig(site(value))).toEqual([
				{
					path: 'funnels.ratgeber.leadmagnet',
					message: expect.stringContaining('leadmagnet ist ein Objekt'),
				},
			]);
		}
		expect(() => defineSite(site({ label: 'R', url: 'https://x.test/a.pdf' }) as never)).toThrow(
			/im CRM hoch/,
		);
	});
});

describe('leadmagnet im Manifest', () => {
	it('trägt bei jedem Formular leadmagnet: { label } oder null, label getrimmt', () => {
		const manifest = buildManifest(
			{
				siteId: 's1',
				funnels: {
					ratgeber: { label: 'Ratgeber', fields, leadmagnet: { label: '  Ratgeber Immobilienverkauf ' } },
					kontakt: { label: 'Kontakt', fields },
				},
			},
			[],
			['/'],
		);
		expect(manifest.funnels.map((f) => [f.key, f.leadmagnet])).toEqual([
			['ratgeber', { label: 'Ratgeber Immobilienverkauf' }],
			['kontakt', null],
		]);
		// Genau diese Form, nichts darüber hinaus (keine Datei, kein Link), auch im JSON.
		const json = JSON.parse(JSON.stringify(manifest)) as { funnels: Record<string, unknown>[] };
		expect(json.funnels[0]!.leadmagnet).toStrictEqual({ label: 'Ratgeber Immobilienverkauf' });
		expect(json.funnels[1]).toHaveProperty('leadmagnet', null);
	});

	it('normalizeLeadmagnet lässt nur label durch', () => {
		expect(normalizeLeadmagnet({ label: ' A ', url: 'https://x.test' })).toStrictEqual({ label: 'A' });
		expect(normalizeLeadmagnet(undefined)).toBeNull();
		expect(normalizeLeadmagnet({ label: '   ' })).toBeNull();
		expect(normalizeLeadmagnet({ label: 'a'.repeat(121) })).toBeNull();
	});
});

describe('Erfolgstext mit Leadmagnet', () => {
	it('kündigt die Datei per E-Mail an und verspricht nicht, dass sie schon da ist', () => {
		const text = leadmagnetSuccessMessage('Ratgeber Immobilienverkauf');
		expect(text).toBe(
			'Vielen Dank. Ihre Anfrage ist bei uns angekommen. „Ratgeber Immobilienverkauf“ schicken wir Ihnen per ' +
				'E-Mail. Falls nichts ankommt, sehen Sie bitte im Spam-Ordner nach oder sprechen Sie uns an.',
		);
		expect(text).not.toMatch(/geschickt|gesendet|haben Sie/);
	});
});
