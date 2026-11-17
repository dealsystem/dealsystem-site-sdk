import { defineSite, handleHttpError, validateSiteConfig } from '../src/lib/config/index.js';

const valid = {
	siteId: 's1',
	collections: {
		angebote: {
			source: 'cms',
			label: 'Angebote',
			route: '/angebote/:slug',
			indexRoute: '/angebote',
			fields: [
				{ name: 'titel', type: 'text', required: true },
				{ name: 'bilder', type: 'gallery' },
			],
		},
	},
	funnels: {
		kontakt: {
			label: 'Kontakt',
			fields: [
				{ name: 'email', type: 'email', standardField: 'email', required: true },
				{ name: 'nachricht', type: 'textarea' },
			],
		},
	},
} as const;

describe('defineSite', () => {
	it('gibt eine gültige Konfiguration unverändert zurück', () => {
		expect(defineSite(valid)).toBe(valid);
		expect(validateSiteConfig(valid)).toEqual([]);
	});

	it('läuft ohne siteId, meldet sie aber in validateSiteConfig', () => {
		expect(() => defineSite({ siteId: '' })).not.toThrow();
		expect(validateSiteConfig({ siteId: '' })).toEqual([
			{ path: 'siteId', message: expect.stringContaining('npx dealsystem init') },
		]);
	});

	it('verlangt ein E-Mail- oder Telefonfeld je Formular', () => {
		const config = {
			siteId: 's',
			funnels: { kontakt: { label: 'K', fields: [{ name: 'nachricht', type: 'textarea' }] } },
		};
		expect(() => defineSite(config as never)).toThrow(/E-Mail- oder Telefonfeld/);
	});

	it('nennt alle Probleme auf einmal, mit Stelle und Korrektur', () => {
		const problems = validateSiteConfig({
			siteId: 's',
			funnels: {
				'Kontakt Formular': { label: '', fields: [{ name: 'e-mail', type: 'email' }] },
				anfrage: {
					label: 'Anfrage',
					fields: [
						{ name: 'email', type: 'mail', standardField: 'email' },
						{ name: 'art', type: 'select', standardField: 'phone' },
						{ name: 'art', type: 'text', standardField: 'name' },
					],
				},
			},
			collections: {
				angebote: { label: 'Angebote', route: '/angebote', source: 'object', slugFrom: 'fehlt', fields: [] },
			},
		});
		const paths = problems.map((p) => p.path);
		expect(paths).toEqual(
			expect.arrayContaining([
				'funnels.Kontakt Formular',
				'funnels.Kontakt Formular.label',
				'funnels.Kontakt Formular.fields[0].name',
				'funnels.anfrage.fields[0].type',
				'funnels.anfrage.fields[1].options',
				'funnels.anfrage.fields[2].name',
				'collections.angebote.source',
				'collections.angebote.route',
				'collections.angebote.fields',
				'collections.angebote.slugFrom',
			]),
		);
		expect(problems.find((p) => p.path === 'funnels.anfrage.fields[0].type')!.message).toContain('email');
		expect(problems.some((p) => p.message.includes('standardField "name"'))).toBe(true);
	});

	it('übersteht Unsinn als Eingabe', () => {
		expect(validateSiteConfig(null)).toHaveLength(1);
		expect(validateSiteConfig({ siteId: 's', funnels: [], collections: 'x' }).map((p) => p.path)).toEqual([
			'funnels',
			'collections',
		]);
	});
});

describe('handleHttpError', () => {
	const details = { status: 404, referrer: '/', message: '404 /x (linked from /)' };

	it('lässt Medien aus dem CRM durch, die es beim Build noch nicht gibt', () => {
		expect(() => handleHttpError({ ...details, path: '/_ds/media/s1/a1/480.jpg' })).not.toThrow();
	});

	it('bricht bei jedem anderen toten Link mit einer Anleitung ab', () => {
		expect(() => handleHttpError({ ...details, path: '/kontackt' })).toThrow(
			/Der Link \/kontackt auf der Seite \/ führt ins Leere/,
		);
		expect(() => handleHttpError({ ...details, path: '/_dsx/a.jpg', referrer: null })).toThrow(
			/führt ins Leere/,
		);
	});
});

describe('Grenzen der Site-API', () => {
	it('lehnt mehr als 60 Felder je Formular ab', () => {
		const fields = [
			{ name: 'email', type: 'email', standardField: 'email' },
			...Array.from({ length: 60 }, (_, i) => ({ name: `feld${i}`, type: 'text' })),
		];
		const problems = validateSiteConfig({ siteId: 's', funnels: { kontakt: { label: 'K', fields } } });
		expect(problems).toEqual([
			{ path: 'funnels.kontakt.fields', message: expect.stringContaining('höchstens 60') },
		]);
	});

	it('lehnt Feldnamen über 64 Zeichen ab', () => {
		const problems = validateSiteConfig({
			siteId: 's',
			funnels: {
				kontakt: { label: 'K', fields: [{ name: 'a'.repeat(65), type: 'email', standardField: 'email' }] },
			},
		});
		expect(problems[0]!.path).toBe('funnels.kontakt.fields[0].name');
	});
});
