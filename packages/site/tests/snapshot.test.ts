import { resolveImageSlot, resolveLinkSlot, resolveTextSlot } from '../src/lib/slots.js';
import { normalizeSnapshot } from '../src/lib/snapshot.js';

describe('normalizeSnapshot', () => {
	it('liefert für Unsinn einen leeren, vollständigen Schnappschuss', () => {
		for (const raw of [null, undefined, 'x', 5, [], {}]) {
			const snapshot = normalizeSnapshot(raw);
			expect(snapshot.site.locale).toBe('de');
			expect(snapshot.legal.company).toBe('');
			expect(snapshot.captcha).toBeNull();
			expect(snapshot.tracking).toEqual({ metaPixelId: null, googleTagId: null });
			expect(snapshot.funnels).toEqual([]);
			expect(snapshot.slots).toEqual({});
			expect(snapshot.collections).toEqual({});
		}
	});

	it('übernimmt nur bekannte Felder', () => {
		const snapshot = normalizeSnapshot({
			snapshotVersion: 1,
			site: { id: 's1', slug: 'kunde', name: 'Kunde', primaryHost: 'kunde.de', locale: 'de', geheim: 'x' },
			captcha: { provider: 'friendly-captcha', siteKey: 'FC1' },
			legal: { company: 'Kunde GmbH', email: 'a@b.de', kontakte: ['privat'] },
			tracking: { metaPixelId: '123456', googleTagId: '' },
			funnels: [{ key: 'kontakt', active: false, fields: [] }, { active: true }, 'x'],
			slots: {
				'start.hero.titel': { type: 'text', value: 'Hallo' },
				'start.leer': { type: 'text', value: null },
				'start.falsch': { type: 'video', value: 'x' },
				'start.kaputt': 'x',
			},
			collections: {
				angebote: { source: 'cms', schemaHash: 'h', entries: [{ slug: 'a', data: { t: 1 } }, { data: {} }] },
			},
		});
		expect(snapshot.site).toEqual({
			id: 's1',
			slug: 'kunde',
			name: 'Kunde',
			primaryHost: 'kunde.de',
			locale: 'de',
		});
		expect(snapshot.captcha).toEqual({ provider: 'friendly-captcha', siteKey: 'FC1' });
		expect(snapshot.legal).toMatchObject({ company: 'Kunde GmbH', email: 'a@b.de', phone: '' });
		expect(snapshot.legal).not.toHaveProperty('kontakte');
		expect(snapshot.tracking).toEqual({ metaPixelId: '123456', googleTagId: null });
		expect(snapshot.funnels).toEqual([{ key: 'kontakt', active: false }]);
		expect(Object.keys(snapshot.slots)).toEqual(['start.hero.titel']);
		expect(snapshot.collections.angebote!.entries).toEqual([
			{ slug: 'a', publishedAt: '', data: { t: 1 }, media: {} },
		]);
	});

	it('zählt nur source "override" mit Wert als Überschreibung', () => {
		const snapshot = normalizeSnapshot({
			slots: {
				'start.titel': { type: 'text', source: 'override', value: 'Aus dem CRM' },
				'start.standard': { type: 'text', source: 'default', value: null },
				// Widerspruch im Schnappschuss: im Zweifel gilt der Standard aus dem Code.
				'start.widerspruch': { type: 'text', source: 'default', value: 'darf nicht gelten' },
				'start.ohne-wert': { type: 'richtext', source: 'override', value: null },
				'start.alt-format': { type: 'text', value: 'ohne source' },
			},
		});
		expect(Object.keys(snapshot.slots).sort()).toEqual(['start.alt-format', 'start.titel']);
		expect(resolveTextSlot(snapshot.slots, 'start.titel')).toBe('Aus dem CRM');
		expect(resolveTextSlot(snapshot.slots, 'start.standard')).toBeNull();
		expect(resolveTextSlot(snapshot.slots, 'start.widerspruch')).toBeNull();
		expect(resolveTextSlot(snapshot.slots, 'start.ohne-wert')).toBeNull();
	});

	it('verträgt null, wo der Core nichts eingetragen hat', () => {
		const snapshot = normalizeSnapshot({
			site: { id: 's1', slug: 'kunde', name: 'Kunde', primaryHost: null, locale: 'de' },
			captcha: { provider: 'friendly-captcha', siteKey: null },
			legal: {
				company: null,
				address: null,
				representative: null,
				email: null,
				phone: null,
				register: null,
				vatId: null,
			},
			collections: {
				angebote: {
					source: 'cms',
					schemaHash: null,
					entries: [{ slug: 'a', publishedAt: null, data: {}, media: {} }],
				},
			},
		});
		expect(snapshot.site.primaryHost).toBe('');
		expect(snapshot.captcha).toBeNull();
		expect(snapshot.legal.company).toBe('');
		expect(snapshot.collections.angebote).toEqual({
			source: 'cms',
			schemaHash: '',
			entries: [{ slug: 'a', publishedAt: '', data: {}, media: {} }],
		});
	});

	it('kennt nur den vereinbarten Captcha-Anbieter', () => {
		expect(normalizeSnapshot({ captcha: { provider: 'anderer', siteKey: 'x' } }).captcha).toBeNull();
		expect(normalizeSnapshot({ captcha: { provider: 'friendly-captcha' } }).captcha).toBeNull();
	});
});

describe('Slots auflösen', () => {
	const overrides = {
		'start.titel': { type: 'text' as const, value: 'Aus dem CRM' },
		'start.alt': { type: 'text' as const, value: 'Alter Schlüssel' },
		'start.zahl': { type: 'text' as const, value: 5 },
		'start.link': { type: 'link' as const, value: { href: '/kontakt', label: 'Kontakt' } },
		'start.boese': { type: 'link' as const, value: { href: 'javascript:alert(1)', label: 'x' } },
		'start.bild': {
			type: 'image' as const,
			value: {
				id: 'm',
				kind: 'image',
				alt: 'Haus',
				width: 10,
				height: 10,
				variants: [{ url: '/a.jpg', width: 10, format: 'jpeg' }],
			},
		},
	};

	it('nimmt die Überschreibung, sonst null', () => {
		expect(resolveTextSlot(overrides, 'start.titel')).toBe('Aus dem CRM');
		expect(resolveTextSlot(overrides, 'start.fehlt')).toBeNull();
	});

	it('findet den Text unter einem früheren Schlüssel', () => {
		expect(resolveTextSlot(overrides, 'start.neu', ['start.nix', 'start.alt'])).toBe('Alter Schlüssel');
		expect(resolveTextSlot(overrides, 'start.titel', ['start.alt'])).toBe('Aus dem CRM');
	});

	it('fällt bei falschem Typ auf den Standard zurück statt zu werfen', () => {
		expect(resolveTextSlot(overrides, 'start.zahl')).toBeNull();
		expect(resolveTextSlot(overrides, 'start.link')).toBeNull();
		expect(resolveLinkSlot(overrides, 'start.titel')).toBeNull();
		expect(resolveImageSlot(overrides, 'start.titel')).toBeNull();
	});

	it('löst Link und Bild auf und verwirft gefährliche Ziele', () => {
		expect(resolveLinkSlot(overrides, 'start.link')).toEqual({
			href: '/kontakt',
			label: 'Kontakt',
			newTab: false,
		});
		expect(resolveLinkSlot(overrides, 'start.boese')).toBeNull();
		expect(resolveImageSlot(overrides, 'start.bild')).toMatchObject({ id: 'm', alt: 'Haus' });
	});

	it('lässt sich von Schlüsseln wie __proto__ nicht täuschen', () => {
		expect(resolveTextSlot({}, '__proto__')).toBeNull();
		expect(resolveTextSlot({}, 'constructor')).toBeNull();
	});
});
