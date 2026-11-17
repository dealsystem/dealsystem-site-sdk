// Server-Rendering: das ist, was beim Build im fertigen HTML landet.
import type { Component, ComponentProps } from 'svelte';
import { render as renderLazy } from 'svelte/server';
import Datenschutz from '../src/lib/components/Datenschutz.svelte';
import Impressum from '../src/lib/components/Impressum.svelte';
import LeadForm from '../src/lib/components/LeadForm.svelte';
import Link from '../src/lib/components/Link.svelte';
import MediaImage from '../src/lib/components/MediaImage.svelte';
import MediaVideo from '../src/lib/components/MediaVideo.svelte';
import RichText from '../src/lib/components/RichText.svelte';
import SiteFooterLegal from '../src/lib/components/SiteFooterLegal.svelte';
import Text from '../src/lib/components/Text.svelte';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import type { MediaRef, SafeHtml } from '../src/lib/types.js';
import GateHarness from './fixtures/GateHarness.svelte';
import LayoutHarness from './fixtures/LayoutHarness.svelte';
import ListHarness from './fixtures/ListHarness.svelte';
import { testSiteData } from './helpers.js';

const media: MediaRef = {
	id: 'a1',
	kind: 'image',
	alt: 'Fassade des Altbaus',
	width: 1600,
	height: 1067,
	variants: [
		{ url: '/_ds/media/s1/a1/1600.jpg', width: 1600, format: 'jpeg' },
		{ url: '/_ds/media/s1/a1/480.jpg', width: 480, format: 'jpeg' },
		{ url: '/_ds/media/s1/a1/480.webp', width: 480, format: 'webp' },
		{ url: '/_ds/media/s1/a1/1600.webp', width: 1600, format: 'webp' },
		{ url: '/_ds/media/s1/a1/1600.avif', width: 1600, format: 'avif' },
	],
};

/** Rendert sofort und entfernt die Hydrations-Kommentare von Svelte. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render<C extends Component<any>>(component: C, options: { props: ComponentProps<C> }) {
	const result = (renderLazy as (c: unknown, o: unknown) => { body: string; head: string })(
		component,
		options,
	);
	const strip = (html: string) => html.replace(/<!--.*?-->/g, '');
	return { body: strip(result.body), head: strip(result.head) };
}

beforeEach(() => setSiteDataForTests(testSiteData()));
afterEach(() => setSiteDataForTests(null));

describe('ohne Vite-Plugin', () => {
	it('erklärt, was in vite.config.ts fehlt', () => {
		setSiteDataForTests(null);
		expect(() => render(Text, { props: { key: 'a.b', default: 'x' } })).toThrow(
			/Das Vite-Plugin fehlt[\s\S]*dealsystem\(site\)/,
		);
	});
});

describe('<Text>', () => {
	it('zeigt den Standard, wenn das CRM nichts überschreibt', () => {
		const { body } = render(Text, {
			props: { key: 'start.hero.titel', default: 'Wir kaufen Ihr Haus', as: 'h1' },
		});
		expect(body).toMatch(/<h1[^>]*>Wir kaufen Ihr Haus<\/h1>/);
	});

	it('zeigt den Wert aus dem Schnappschuss, auch unter einem früheren Schlüssel', () => {
		setSiteDataForTests(
			testSiteData({
				slots: {
					'start.hero.titel': { type: 'text', value: 'Aus dem CRM <b>' },
					'start.alt': { type: 'text', value: 'Umbenannt' },
				},
			}),
		);
		expect(render(Text, { props: { key: 'start.hero.titel', default: 'Standard' } }).body).toContain(
			'Aus dem CRM &lt;b>',
		);
		expect(
			render(Text, { props: { key: 'start.neu', default: 'Standard', aliases: ['start.alt'] } }).body,
		).toContain('Umbenannt');
	});
});

describe('<RichText>', () => {
	it('gibt den beim Build umgewandelten Standardtext des Slots aus', () => {
		setSiteDataForTests(
			testSiteData({ richtext: { 'start.ueber-uns': '<p>Seit <strong>2010</strong></p>' } }),
		);
		const { body } = render(RichText, { props: { key: 'start.ueber-uns', default: 'Seit **2010**' } });
		expect(body).toContain('<p>Seit <strong>2010</strong></p>');
		expect(body).toContain('data-ds-richtext');
	});

	it('zeigt den Text aus dem CRM als bereinigtes HTML vom Server, auch unter einem früheren Schlüssel', () => {
		setSiteDataForTests(
			testSiteData({
				richtext: { 'start.ueber-uns': '<p>Standard</p>' },
				slots: { 'start.alt': { type: 'richtext', value: '<p>Aus dem <em>CRM</em></p>' } },
			}),
		);
		const { body } = render(RichText, {
			props: { key: 'start.ueber-uns', default: 'Standard', aliases: ['start.alt'] },
		});
		expect(body).toContain('<p>Aus dem <em>CRM</em></p>');
		expect(body).not.toContain('Standard');
	});

	it('maskiert den Standardtext, wenn der Build den Slot nicht kennt', () => {
		const { body } = render(RichText, {
			props: { key: 'start.x', default: '<img src=x onerror=alert(1)> **a**' },
		});
		expect(body).toContain('&lt;img src=x onerror=alert(1)&gt; **a**');
		expect(body).not.toContain('<img');
	});

	it('gibt das bereinigte HTML eines Eintrags aus und für ein leeres Feld nichts', () => {
		const html = '<p><em>fertig</em></p>' as SafeHtml;
		expect(render(RichText, { props: { content: html } }).body).toContain('<em>fertig</em>');
		expect(render(RichText, { props: { content: null } }).body).not.toContain('ds-richtext');
		expect(render(RichText, { props: { content: '' as SafeHtml } }).body).not.toContain('ds-richtext');
	});
});

describe('<Link>', () => {
	const props = { key: 'start.hero.knopf', default: { href: '/kontakt', label: 'Kontakt aufnehmen' } };

	it('zeigt den Standard, sonst den Wert aus dem CRM', () => {
		expect(render(Link, { props }).body).toMatch(/<a href="\/kontakt"[^>]*>Kontakt aufnehmen<\/a>/);

		setSiteDataForTests(
			testSiteData({
				slots: {
					'start.hero.knopf': {
						type: 'link',
						value: { href: 'https://termin.test', label: 'Termin', newTab: true },
					},
				},
			}),
		);
		const { body } = render(Link, { props });
		expect(body).toContain('href="https://termin.test"');
		expect(body).toContain('target="_blank"');
		expect(body).toContain('rel="noopener noreferrer"');
		expect(body).toContain('>Termin</a>');
	});

	it('fällt bei einem gefährlichen oder kaputten Wert auf den Standard zurück', () => {
		for (const value of [{ href: 'javascript:alert(1)', label: 'x' }, { href: '/a' }, 'kaputt']) {
			setSiteDataForTests(testSiteData({ slots: { 'start.hero.knopf': { type: 'link', value } } }));
			expect(render(Link, { props }).body).toMatch(/<a href="\/kontakt"[^>]*>Kontakt aufnehmen<\/a>/);
		}
	});
});

describe('<MediaImage>', () => {
	it('baut aus einem MediaRef picture, srcset je Format und feste Maße', () => {
		const { body } = render(MediaImage, { props: { media, sizes: '50vw' } });
		expect(body).toContain('<picture');
		expect(body).toMatch(
			/<source type="image\/avif" srcset="\/_ds\/media\/s1\/a1\/1600\.avif 1600w" sizes="50vw"/,
		);
		expect(body).toMatch(
			/<source type="image\/webp" srcset="\/_ds\/media\/s1\/a1\/480\.webp 480w, \/_ds\/media\/s1\/a1\/1600\.webp 1600w"/,
		);
		expect(body).toContain('src="/_ds/media/s1/a1/1600.jpg"');
		expect(body).toContain('srcset="/_ds/media/s1/a1/480.jpg 480w, /_ds/media/s1/a1/1600.jpg 1600w"');
		expect(body).toContain('width="1600"');
		expect(body).toContain('height="1067"');
		expect(body).toContain('alt="Fassade des Altbaus"');
		expect(body).toContain('loading="lazy"');
		expect(body.indexOf('image/avif')).toBeLessThan(body.indexOf('image/webp'));
	});

	it('lädt das wichtigste Bild sofort', () => {
		const { body } = render(MediaImage, { props: { media, priority: true } });
		expect(body).toContain('loading="eager"');
		expect(body).toContain('fetchpriority="high"');
	});

	it('behandelt einen leeren Alternativtext aus dem CMS als dekorativ und ein fehlendes Bild als nichts', () => {
		expect(render(MediaImage, { props: { media: { ...media, alt: '' } } }).body).toContain('alt=""');
		expect(render(MediaImage, { props: { media: undefined } }).body).not.toContain('<img');
		expect(render(MediaImage, { props: { media: { ...media, variants: [] } } }).body).not.toContain('<img');
	});

	it('gibt ein lokales Bild aus enhanced-img mit allen Formaten aus', () => {
		const picture = {
			sources: { avif: '/a-400.avif 400w, /a-800.avif 800w', webp: '/a-400.webp 400w' },
			img: { src: '/a-800.jpg', w: 800, h: 600 },
		};
		const { body } = render(MediaImage, { props: { src: picture, alt: 'Sanierter Altbau in Leipzig' } });
		expect(body).toContain('<source type="image/avif" srcset="/a-400.avif 400w, /a-800.avif 800w"');
		expect(body).toContain('src="/a-800.jpg"');
		expect(body).toContain('width="800"');
		expect(body).toContain('alt="Sanierter Altbau in Leipzig"');
	});

	it('scheitert beim Build mit einer Anleitung, wenn der Alternativtext fehlt', () => {
		expect(() => render(MediaImage, { props: { src: '/haus.jpg', alt: '   ' as never } })).toThrow(
			/hat keinen Alternativtext[\s\S]*decorative/,
		);
		expect(() => render(MediaImage, { props: { src: '/haus.jpg' } as never })).toThrow(/Alternativtext/);
		expect(render(MediaImage, { props: { src: '/muster.svg', alt: '', decorative: true } }).body).toContain(
			'alt=""',
		);
	});

	it('zeigt beim Bild-Slot das Bild aus dem CRM, sonst den Standard', () => {
		const props = { key: 'start.hero.bild', default: '/hero.jpg', alt: 'Haus mit Garten' } as const;
		expect(render(MediaImage, { props }).body).toContain('src="/hero.jpg"');

		setSiteDataForTests(testSiteData({ slots: { 'start.hero.bild': { type: 'image', value: media } } }));
		const { body } = render(MediaImage, { props });
		expect(body).toContain('src="/_ds/media/s1/a1/1600.jpg"');
		expect(body).toContain('alt="Fassade des Altbaus"');
	});
});

describe('<MediaVideo>', () => {
	const video: MediaRef = {
		id: 'v1',
		kind: 'video',
		alt: '',
		width: null,
		height: null,
		variants: [],
		video: {
			provider: 'bunny',
			playbackUrl: 'https://video.example/v1/play.mp4',
			posterUrl: 'https://video.example/v1.jpg',
		},
	};

	it('lädt ein Video eines anderen Anbieters nicht ohne Einwilligung', () => {
		const { body } = render(MediaVideo, { props: { media: video, title: 'Rundgang' } });
		expect(body).not.toContain('video.example');
		expect(body).not.toContain('<video');
	});

	it('gibt ein Video vom eigenen Ursprung mit Bedienelementen und ohne Autoplay aus', () => {
		const own = {
			...video,
			video: { provider: 'bunny' as const, playbackUrl: '/_ds/media/s1/v1/play.mp4', posterUrl: '' },
		};
		const { body } = render(MediaVideo, { props: { media: own, title: 'Rundgang' } });
		expect(body).toContain('<video');
		expect(body).toContain('controls');
		expect(body).toContain('aria-label="Rundgang"');
		expect(body).not.toContain('autoplay');
	});
});

describe('Einwilligung im fertigen HTML', () => {
	it('<ConsentGate> erzeugt seinen Inhalt beim Build nicht', () => {
		for (const withFallback of [false, true]) {
			const { body, head } = render(GateHarness, { props: { category: 'media', withFallback } });
			expect(body + head).not.toContain('maps.example');
			expect(body).not.toContain('<iframe');
		}
	});

	it('die ganze Seite enthält vor der Einwilligung keine fremde Adresse', () => {
		setSiteDataForTests(
			testSiteData({ tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' } }),
		);
		const { body, head } = render(LayoutHarness, { props: {} });
		const html = head + body;
		expect(html).not.toMatch(/https?:\/\//);
		expect(html).not.toMatch(/<script|<iframe|facebook|google/i);
		// Marker für `dealsystem check`, auch wenn der Hinweis selbst erst im Browser erscheint.
		expect(body).toContain('data-ds-cookie-banner');
		expect(body).toContain('data-ds-footer-legal');
	});
});

describe('Rechtstexte', () => {
	it('<Impressum> nennt die Firmendaten aus dem CRM', () => {
		const { body } = render(Impressum, { props: {} });
		expect(body).toContain('data-ds-impressum');
		expect(body).toMatch(/<h1[^>]*>Impressum<\/h1>/);
		expect(body).toContain('Kunde Immobilien GmbH');
		expect(body).toContain('Musterstraße 1');
		expect(body).toContain('04109 Leipzig');
		expect(body).toContain('Vertreten durch: Erika Muster');
		expect(body).toContain('href="tel:03411234567"');
		expect(body).toContain('href="mailto:info@kunde.de"');
		expect(body).not.toContain('Angabe fehlt');
	});

	it('<Impressum> zeigt fehlende Angaben sichtbar an, statt sie zu verschweigen', () => {
		setSiteDataForTests(testSiteData({ legal: { ...testSiteData().legal, company: '', phone: '' } }));
		const { body } = render(Impressum, { props: { headingLevel: 2 } });
		expect(body.match(/Angabe fehlt/g)).toHaveLength(2);
		expect(body).toMatch(/<h2[^>]*>Impressum<\/h2>/);
		expect(body).toMatch(/<h3[^>]*>Kontakt<\/h3>/);
	});

	it('<Datenschutz> beschreibt nur, was die Seite nutzt', () => {
		const plain = render(Datenschutz, { props: {} }).body;
		expect(plain).toContain('data-ds-datenschutz');
		expect(plain).toContain('Kunde Immobilien GmbH');
		expect(plain).toContain('Formulare');
		expect(plain).not.toContain('Friendly Captcha');
		expect(plain).not.toContain('Meta Pixel');
		expect(plain).not.toContain('Google');

		setSiteDataForTests(
			testSiteData({
				funnels: {},
				captcha: { provider: 'friendly-captcha', siteKey: 'FC' },
				tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' },
			}),
		);
		const full = render(Datenschutz, { props: {} }).body;
		expect(full).toContain('Friendly Captcha');
		expect(full).toContain('Meta Pixel');
		expect(full).toContain('Google Tag');
		expect(full).not.toMatch(/<h2[^>]*>Formulare/);
	});

	it('<SiteFooterLegal> verlinkt Impressum und Datenschutz und bietet den Widerruf an', () => {
		const { body } = render(SiteFooterLegal, { props: {} });
		expect(body).toContain('href="/impressum"');
		expect(body).toContain('href="/datenschutz"');
		expect(body).toMatch(/<button[^>]*>Cookie-Einstellungen<\/button>/);
		expect(body).toContain('aria-label="Rechtliches"');
	});
});

describe('<LeadForm> im fertigen HTML', () => {
	it('rendert jedes Feld mit verknüpfter Beschriftung und den Honeypot', () => {
		const { body } = render(LeadForm, { props: { funnel: 'kontakt', submitLabel: 'Anfrage senden' } });
		for (const name of ['firstName', 'email', 'nachricht', 'website']) {
			const id = new RegExp(`id="([^"]*-${name})"`).exec(body)?.[1];
			expect(id, name).toBeTruthy();
			expect(body).toContain(`for="${id}"`);
		}
		expect(body).toContain('autocomplete="email"');
		expect(body).toContain('autocomplete="given-name"');
		expect(body).toMatch(/<button[^>]*type="submit"[^>]*>\s*Anfrage senden\s*<\/button>/);
		expect(body).toContain('href="/datenschutz"');
		expect(body).toContain('novalidate');
		expect(body).toContain('aria-live="polite"');
		// Ohne JavaScript bleibt der direkte Kontakt.
		expect(body).toMatch(/<noscript[^>]*>[\s\S]*info@kunde\.de[\s\S]*<\/noscript>/);
		expect(body).not.toMatch(/https?:\/\//);
	});

	it('nennt bei einem unbekannten Formular die vorhandenen Schlüssel', () => {
		expect(() => render(LeadForm, { props: { funnel: 'kontakd' } })).toThrow(
			/<LeadForm funnel="kontakd">[\s\S]*Vorhanden: kontakt/,
		);
	});

	it('zeigt bei einem im CRM abgeschalteten Formular den direkten Kontakt', () => {
		const site = testSiteData();
		site.funnels.kontakt!.active = false;
		setSiteDataForTests(site);
		const { body } = render(LeadForm, { props: { funnel: 'kontakt' } });
		expect(body).toContain('zurzeit nicht verfügbar');
		expect(body).toContain('0341 1234567');
		expect(body).not.toContain('<form');
	});
});

describe('<CollectionList>', () => {
	const entries = [
		{
			slug: 'a',
			publishedAt: '',
			data: { titel: 'Altbau', beschreibung: '<p>Hell</p>' },
			media: {},
		},
		{ slug: 'b', publishedAt: '', data: { titel: 'Neubau', beschreibung: null }, media: {} },
		{ slug: 'c', publishedAt: '', data: { titel: 'Dritte' }, media: {} },
	];

	it('rendert übergebene Einträge beim Build als Liste und beachtet limit', () => {
		const { body } = render(ListHarness, { props: { entries, limit: 2 } });
		expect(body.match(/<li/g)).toHaveLength(2);
		expect(body).toContain('href="/angebote/a"');
		expect(body).toContain('Altbau');
		expect(body).toContain('<p>Hell</p>');
		expect(body).not.toContain('Dritte');
	});

	it('zeigt bei leerer Liste einen Hinweis', () => {
		expect(render(ListHarness, { props: { entries: [] } }).body).toContain(
			'Zurzeit gibt es hier keine Einträge.',
		);
	});
});
