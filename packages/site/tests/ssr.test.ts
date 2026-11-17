// Server-Rendering: das ist, was beim Build im fertigen HTML landet.
import type { Component, ComponentProps } from 'svelte';
import { render as renderLazy } from 'svelte/server';
import Datenschutz from '../src/lib/components/Datenschutz.svelte';
import Impressum from '../src/lib/components/Impressum.svelte';
import LeadForm from '../src/lib/components/LeadForm.svelte';
import MapEmbed from '../src/lib/components/MapEmbed.svelte';
import Link from '../src/lib/components/Link.svelte';
import MediaImage from '../src/lib/components/MediaImage.svelte';
import MediaVideo from '../src/lib/components/MediaVideo.svelte';
import RichText from '../src/lib/components/RichText.svelte';
import SiteFooterLegal from '../src/lib/components/SiteFooterLegal.svelte';
import Text from '../src/lib/components/Text.svelte';
import { setImprintForTests } from '../src/lib/internal/imprint.js';
import { setPrivacyForTests } from '../src/lib/internal/privacy.js';
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
afterEach(() => {
	setSiteDataForTests(null);
	setImprintForTests(null);
	setPrivacyForTests(null);
});

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

	it('zeigt den Text aus dem CRM so, wie der Build ihn abgelegt hat', () => {
		setSiteDataForTests(
			testSiteData({ richtext: { 'start.ueber-uns': '<p>a &amp; b aus dem <em>CRM</em></p>' } }),
		);
		const { body } = render(RichText, { props: { key: 'start.ueber-uns', default: 'Standard' } });
		expect(body).toContain('<p>a &amp; b aus dem <em>CRM</em></p>');
		expect(body).not.toContain('Standard');
		expect(body).not.toContain('&amp;amp;');
	});

	it('gibt einen Text aus dem CRM auch aus, wenn der Build den Slot nicht kennt', () => {
		setSiteDataForTests(
			testSiteData({ slots: { 'start.alt': { type: 'richtext', value: '<p>Aus dem <em>CRM</em></p>' } } }),
		);
		const { body } = render(RichText, {
			props: { key: 'start.neu', default: '**Standard**', aliases: ['start.alt'] },
		});
		expect(body).toContain('<p>Aus dem <em>CRM</em></p>');
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

describe('<MapEmbed>', () => {
	const props = { lat: 53.8676, lon: 10.6866, title: 'Unser Büro in der Lübecker Altstadt' };

	it('lädt beim Build keine Karte, bietet aber den Link zur Karte an', () => {
		const { body } = render(MapEmbed, { props });
		expect(body).toContain('data-ds-map');
		expect(body).not.toContain('<iframe');
		expect(body).not.toContain('export/embed.html');
		expect(body).toContain(
			'href="https://www.openstreetmap.org/?mlat=53.8676&amp;mlon=10.6866#map=16/53.8676/10.6866"',
		);
		expect(body).toContain('rel="noopener noreferrer"');
		expect(body).toContain('Karte in OpenStreetMap öffnen');
	});

	it('scheitert beim Build mit einer Anleitung, wenn Koordinaten oder Titel fehlen', () => {
		expect(() => render(MapEmbed, { props: { ...props, lat: Number.NaN } })).toThrow(
			/lat und lon müssen Koordinaten/,
		);
		expect(() => render(MapEmbed, { props: { ...props, lat: 153 } })).toThrow(/Koordinaten/);
		expect(() => render(MapEmbed, { props: { ...props, lat: '53.8' as never } })).toThrow(/Koordinaten/);
		expect(() => render(MapEmbed, { props: { ...props, title: ' ' } })).toThrow(/braucht einen title/);
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
	it('<Impressum> gibt den Text des Kunden aus dem CRM aus und erzeugt keinen eigenen', () => {
		setImprintForTests(
			'<p>Kunde Immobilien GmbH, Musterstraße 1</p><p>Vertreten durch <strong>Erika Muster</strong></p>',
		);
		const { body } = render(Impressum, { props: {} });
		expect(body).toContain('data-ds-impressum');
		expect(body).toMatch(/<h1[^>]*>Impressum<\/h1>/);
		expect(body).toContain('<p>Kunde Immobilien GmbH, Musterstraße 1</p>');
		expect(body).toContain('<strong>Erika Muster</strong>');
		expect(body).not.toContain('fehlt');
		// Kein Text, den der Kunde nicht geschrieben hat.
		expect(body).not.toMatch(/§|DDG|Angaben gemäß/);
	});

	it('<Datenschutz> gibt den Text des Kunden aus und bietet den Widerruf der Einwilligung an', () => {
		setPrivacyForTests('<p>Wir verarbeiten Ihre Daten nur zur Bearbeitung Ihrer Anfrage.</p>');
		const { body } = render(Datenschutz, { props: {} });
		expect(body).toContain('data-ds-datenschutz');
		expect(body).toMatch(/<h1[^>]*>Datenschutzerklärung<\/h1>/);
		expect(body).toContain('<p>Wir verarbeiten Ihre Daten nur zur Bearbeitung Ihrer Anfrage.</p>');
		expect(body).toMatch(/<button[^>]*>\s*Cookie-Einstellungen öffnen\s*<\/button>/);
		expect(body).not.toMatch(/Art\. 6|DSGVO|Friendly|Google|Meta/);
	});

	it.each([
		['Impressum', Impressum, 'Der Impressumstext fehlt.', 'imprint'],
		['Datenschutz', Datenschutz, 'Der Datenschutztext fehlt.', 'privacy'],
	] as const)(
		'<%s> sagt in der Vorschau, wo der fehlende Text einzutragen ist',
		(_name, component, text, marker) => {
			for (const empty of ['', '<p> </p>', '<p>&nbsp;</p><br>']) {
				setImprintForTests(empty);
				setPrivacyForTests(empty);
				const { body } = render(component, { props: {} });
				expect(body).toContain(text);
				expect(body).toContain('im CRM unter Website → Einstellungen');
				expect(body).toContain(`data-ds-legal-missing="${marker}"`);
			}
		},
	);

	it('ordnet die Überschriften im Text des Kunden unter die Überschrift der Seite ein', () => {
		setImprintForTests('<h1>Anbieter</h1><p>a</p><h3 class="x">Kontakt</h3><p>b</p><h1>Haftung</h1>');
		const { body } = render(Impressum, { props: {} });
		expect(body.match(/<h1/g)).toHaveLength(1);
		expect(body).toContain('<h2>Anbieter</h2>');
		expect(body).toContain('<h3 class="x">Kontakt</h3>');
		expect(body).toContain('<h2>Haftung</h2>');

		const nested = render(Impressum, { props: { headingLevel: 2 } }).body;
		expect(nested).toMatch(/<h2[^>]*>Impressum<\/h2>/);
		expect(nested).toContain('<h3>Anbieter</h3>');
		expect(nested).toContain('<h4 class="x">Kontakt</h4>');
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
