// „Google und Teilen“: Schnappschuss lesen, Rückfall-Kette, fertiges HTML von <Seo> und <SiteHead>, robots.txt.
import type { Component, ComponentProps } from 'svelte';
import { render as renderLazy } from 'svelte/server';
import { robots } from '../src/lib/content/index.js';
import Seo from '../src/lib/components/Seo.svelte';
import SiteHead from '../src/lib/components/SiteHead.svelte';
import { resolveSeo, seoRouteKey, webManifest } from '../src/lib/internal/seo.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { normalizeSeo, normalizeSnapshot } from '../src/lib/snapshot.js';
import type { MediaRef, SeoConfig, SiteData } from '../src/lib/types.js';
import { setPageForTests } from './fixtures/appState.svelte.js';
import SeoPageHarness from './fixtures/SeoPageHarness.svelte';
import { testSiteData } from './helpers.js';

const image = (id: string, alt = 'Bürogebäude am Markt'): MediaRef => ({
	id,
	kind: 'image',
	alt,
	width: 2400,
	height: 1260,
	variants: [
		{ url: `/_ds/media/s1/${id}/800.jpg`, width: 800, format: 'jpeg' },
		{ url: `/_ds/media/s1/${id}/1600.jpg`, width: 1600, format: 'jpeg' },
		{ url: `/_ds/media/s1/${id}/2400.jpg`, width: 2400, format: 'jpeg' },
		{ url: `/_ds/media/s1/${id}/1600.webp`, width: 1600, format: 'webp' },
	],
});

const FAVICON = {
	id: 'f1',
	icons: [512, 32, 192, 180].map((size) => ({
		url: `/_ds/media/s1/f1/icon-${size}.png`,
		size,
		type: 'image/png' as const,
	})),
};

function seo(over: Partial<SeoConfig> = {}): SeoConfig {
	return { ...normalizeSeo(undefined), ...over };
}

function site(over: Partial<SeoConfig> = {}, data: Partial<SiteData> = {}): SiteData {
	return testSiteData({ seo: seo(over), ...data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render<C extends Component<any>>(component: C, props: ComponentProps<C>): string {
	const { head } = (renderLazy as (c: unknown, o: unknown) => { head: string })(component, { props });
	return head.replace(/<!--.*?-->/g, '');
}

const metas = (head: string, attr: 'name' | 'property', key: string): string[] =>
	[
		...head.matchAll(new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`, 'g')),
	].map((m) => m[1]!);

afterEach(() => {
	setSiteDataForTests(null);
	setPageForTests('/');
});

describe('normalizeSnapshot: seo', () => {
	it('alter Schnappschuss ohne seo: leerer Block', () => {
		expect(normalizeSnapshot({ site: { name: 'Kunde' } }).seo).toEqual({
			noindex: false,
			defaults: { title: null, description: null, image: null },
			pages: {},
			favicon: null,
		});
	});

	it('liest nachsichtig: falsche Typen und Unbekanntes fallen auf den Standard zurück', () => {
		const result = normalizeSeo({
			noindex: 'ja',
			defaults: { title: 42, description: '  Seit 2010  in\nLeipzig. ', image: { id: 'x', kind: 'video' } },
			pages: {
				'/kontakt': { title: 'Kontakt aufnehmen', description: null, image: image('a1') },
				'/angebote/[slug]': { title: 'Dynamisch' },
				kontakt: { title: 'ohne Schrägstrich' },
				'/leer': { title: '   ', description: '' },
				'/kaputt': 'x',
			},
			favicon: {
				id: 'f1',
				icons: [
					{ url: 'https://fremd.example/icon.png', size: 32, type: 'image/png' },
					{ url: '/_ds/media/s1/f1/icon.svg', size: 32, type: 'image/svg+xml' },
					{ url: '/_ds/media/s1/f1/icon-180.png', size: 180, type: 'image/png' },
					{ url: '/_ds/media/s1/f1/icon-32.png', size: 32, type: 'image/png' },
				],
			},
			geheim: true,
		});
		expect(result.noindex).toBe(false);
		expect(result.defaults).toEqual({ title: null, description: 'Seit 2010 in Leipzig.', image: null });
		expect(Object.keys(result.pages)).toEqual(['/kontakt']);
		expect(result.pages['/kontakt']!.image?.id).toBe('a1');
		expect(result.favicon?.icons.map((i) => i.url)).toEqual([
			'/_ds/media/s1/f1/icon-32.png',
			'/_ds/media/s1/f1/icon-180.png',
		]);
		expect(normalizeSeo({ noindex: true, favicon: { id: 'f', icons: [] } })).toMatchObject({
			noindex: true,
			favicon: null,
		});
	});
});

describe('Rückfall-Kette', () => {
	const own = { title: 'Kontakt – Kunde', description: 'Eigene Beschreibung', image: image('own') };

	it('Angabe der Seite im CRM vor eigener Angabe vor Vorgabe vor Name der Website, je Feld einzeln', () => {
		const data = site({
			defaults: { title: 'Vorgabe', description: 'Vorgabe-Text', image: image('def') },
			pages: { '/kontakt': { title: 'Kontakt aus dem CRM', description: null, image: null } },
		});
		const resolved = resolveSeo(data, '/kontakt', '/kontakt', own);
		expect(resolved.title).toBe('Kontakt aus dem CRM');
		expect(resolved.description).toBe('Eigene Beschreibung');
		expect(resolved.image?.url).toBe('https://kunde.de/_ds/media/s1/own/1600.jpg');
		expect(resolved.url).toBe('https://kunde.de/kontakt');

		const ohneEigenes = resolveSeo(data, '/kontakt', '/kontakt', {});
		expect(ohneEigenes.description).toBe('Vorgabe-Text');
		expect(ohneEigenes.image?.url).toContain('/def/');

		const nichts = resolveSeo(site(), '/impressum', '/impressum', {});
		expect(nichts).toMatchObject({ title: 'Kunde Immobilien', description: null, image: null });
	});

	it('Routengruppen zählen nicht; die Fehlerseite hat keine Route', () => {
		expect(seoRouteKey('/(marketing)/kontakt')).toBe('/kontakt');
		expect(seoRouteKey('/')).toBe('/');
		expect(seoRouteKey(null)).toBeNull();
	});

	it('Vorschaubild: JPEG ab 1200 px, Maße und Beschreibung', () => {
		const resolved = resolveSeo(
			site({ defaults: { title: null, description: null, image: image('a1') } }),
			'/',
			'/',
			{},
		);
		expect(resolved.image).toEqual({
			url: 'https://kunde.de/_ds/media/s1/a1/1600.jpg',
			alt: 'Bürogebäude am Markt',
			width: 1600,
			height: 840,
		});
	});
});

describe('<Seo> im fertigen HTML', () => {
	it('genau ein title und eine description, auch wenn CRM und Seite beides setzen', () => {
		setSiteDataForTests(
			site({ pages: { '/kontakt': { title: 'Aus dem CRM', description: 'CRM-Text', image: null } } }),
		);
		setPageForTests('/kontakt');
		const head = render(Seo, { title: 'Von der Seite', description: 'Seiten-Text' });
		expect(head.match(/<title>/g)).toHaveLength(1);
		expect(head).toContain('<title>Aus dem CRM</title>');
		expect(metas(head, 'name', 'description')).toEqual(['CRM-Text']);
		expect(metas(head, 'property', 'og:title')).toEqual(['Aus dem CRM']);
		expect(metas(head, 'property', 'og:url')).toEqual(['https://kunde.de/kontakt']);
		expect(metas(head, 'name', 'twitter:card')).toEqual(['summary']);
		expect(head).not.toContain('Von der Seite');
	});

	it('eine Seite mit <Seo> und eigenem <svelte:head> ohne title: nichts doppelt', () => {
		setSiteDataForTests(site());
		setPageForTests('/kontakt');
		const head = render(SeoPageHarness, {});
		expect(head.match(/<title>/g)).toHaveLength(1);
		expect(head.match(/name="description"/g)).toHaveLength(1);
		expect(head).toContain('<link rel="canonical"');
	});

	it('Skript im Titel aus dem CRM wird als Text ausgegeben', () => {
		const evil = '</title><script>alert(1)</script>"><img src=x onerror=alert(2)>';
		setSiteDataForTests(site({ defaults: { title: evil, description: evil, image: image('a1', evil) } }));
		const head = render(Seo, {});
		expect(head).not.toMatch(/<script|<img/);
		expect(head).toContain(
			'<title>&lt;/title>&lt;script>alert(1)&lt;/script>">&lt;img src=x onerror=alert(2)></title>',
		);
		expect(metas(head, 'name', 'description')[0]).toContain('&lt;/title>&lt;script>');
		expect(metas(head, 'property', 'og:image:alt')[0]).toContain('&quot;>');
	});

	it('Vorschaubild mit Beschreibung und Maßen, großes Kärtchen', () => {
		setSiteDataForTests(site({ defaults: { title: null, description: null, image: image('a1') } }));
		const head = render(Seo, { title: 'Start' });
		expect(metas(head, 'property', 'og:image')).toEqual(['https://kunde.de/_ds/media/s1/a1/1600.jpg']);
		expect(metas(head, 'property', 'og:image:alt')).toEqual(['Bürogebäude am Markt']);
		expect(metas(head, 'property', 'og:image:width')).toEqual(['1600']);
		expect(metas(head, 'property', 'og:image:height')).toEqual(['840']);
		expect(metas(head, 'name', 'twitter:card')).toEqual(['summary_large_image']);
	});
});

describe('<SiteHead>', () => {
	it('ohne Favicon im CRM: das Favicon aus dem Code, kein robots', () => {
		setSiteDataForTests(site());
		const head = render(SiteHead, { favicon: '/favicon.svg' });
		expect(head).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>');
		expect(head).not.toContain('robots');
		expect(head).not.toContain('manifest');
	});

	it('mit Favicon im CRM: 32, 180 und Web-Manifest statt des Favicons aus dem Code', () => {
		setSiteDataForTests(site({ favicon: normalizeSeo({ favicon: FAVICON }).favicon }));
		const head = render(SiteHead, { favicon: '/favicon.svg' });
		expect(head).toContain(
			'<link rel="icon" type="image/png" sizes="32x32" href="/_ds/media/s1/f1/icon-32.png"/>',
		);
		expect(head).toContain(
			'<link rel="apple-touch-icon" sizes="180x180" href="/_ds/media/s1/f1/icon-180.png"/>',
		);
		expect(head).toContain('<link rel="manifest" href="/manifest.webmanifest"/>');
		expect(head).not.toContain('favicon.svg');
	});

	it('noindex: robots-Meta auf jeder Seite, robots.txt ohne Sitemap und ohne Disallow', () => {
		setSiteDataForTests(site({ noindex: true }));
		expect(render(SiteHead, {})).toContain('<meta name="robots" content="noindex"/>');
		return robots()
			.text()
			.then((text) => expect(text).toBe('User-agent: *\nAllow: /\n'));
	});
});

describe('Web-Manifest', () => {
	it('nennt 192 und 512, nur mit Favicon', () => {
		expect(webManifest(seo(), 'Kunde')).toBeNull();
		const manifest = JSON.parse(
			webManifest(seo({ favicon: normalizeSeo({ favicon: FAVICON }).favicon }), 'Kunde')!,
		);
		expect(manifest).toEqual({
			name: 'Kunde',
			icons: [
				{ src: '/_ds/media/s1/f1/icon-192.png', sizes: '192x192', type: 'image/png' },
				{ src: '/_ds/media/s1/f1/icon-512.png', sizes: '512x512', type: 'image/png' },
			],
		});
	});
});
