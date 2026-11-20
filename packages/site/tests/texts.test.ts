// Texte für Besucher: je Baustein eine Quelle in Sie- und Du-Form, Anrede aus dem CRM, einzelne Texte überschreibbar.
import { COOKIE_BANNER_TEXTS } from '../src/lib/consent/bannerTexts.js';
import { setSiteDataForTests } from '../src/lib/internal/siteData.js';
import { EMBED_TEXTS, MAP_EMBED_TEXTS, MEDIA_VIDEO_TEXTS } from '../src/lib/texts/embeds.js';
import { FORM_TEXTS } from '../src/lib/texts/form.js';
import { COLLECTION_LIST_TEXTS } from '../src/lib/texts/list.js';
import { REQUEST_TEXTS } from '../src/lib/texts/request.js';
import { fillText, pickTexts, siteSalutation } from '../src/lib/texts/resolve.js';
import { validateField } from '../src/lib/client/validation.js';
import { leadmagnetSuccessMessage } from '../src/lib/leadmagnet.js';
import { testSiteData } from './helpers.js';

const SOURCES = {
	CookieBanner: COOKIE_BANNER_TEXTS,
	LeadForm: FORM_TEXTS,
	SiteApi: REQUEST_TEXTS,
	MapEmbed: MAP_EMBED_TEXTS,
	Embed: EMBED_TEXTS,
	MediaVideo: MEDIA_VIDEO_TEXTS,
	CollectionList: COLLECTION_LIST_TEXTS,
} as const;

const SIE = /\b(Sie|Ihnen|Ihre?[nrms]?)\b/;
const DU = /\b(du|dich|dir|dein\w*)\b/i;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function withSalutation(salutation: 'sie' | 'du' | null) {
	if (salutation === null) return setSiteDataForTests(null);
	const data = testSiteData();
	setSiteDataForTests({ ...data, site: { ...data.site, salutation } });
}

afterEach(() => setSiteDataForTests(null));

describe('Textquellen', () => {
	for (const [name, source] of Object.entries(SOURCES)) {
		it(`${name}: gleiche Texte und Platzhalter in Sie und Du, keine falsche Anrede`, () => {
			const sie = source.sie as unknown as Record<string, string>;
			const du = source.du as unknown as Record<string, string>;
			expect(Object.keys(du).sort()).toEqual(Object.keys(sie).sort());
			for (const key of Object.keys(sie)) {
				expect(sie[key]!.trim(), key).not.toBe('');
				expect(du[key]!.trim(), key).not.toBe('');
				expect(placeholders(du[key]!), key).toEqual(placeholders(sie[key]!));
				expect(du[key], key).not.toMatch(SIE);
				expect(sie[key], key).not.toMatch(DU);
			}
		});
	}
});

describe('Anrede und Überschreiben', () => {
	it('folgt site.salutation; ohne Seitendaten Sie', () => {
		withSalutation(null);
		expect(siteSalutation()).toBe('sie');
		expect(pickTexts(FORM_TEXTS).success).toBe(FORM_TEXTS.sie.success);
		withSalutation('du');
		expect(pickTexts(FORM_TEXTS).success).toBe(FORM_TEXTS.du.success);
		expect(pickTexts(FORM_TEXTS, null, 'sie').success).toBe(FORM_TEXTS.sie.success);
	});

	it('übernimmt nur nicht leere Texte zu bekannten Schlüsseln', () => {
		withSalutation('du');
		const t = pickTexts(FORM_TEXTS, { success: 'Danke!', submit: '  ', fremd: 'x' } as never);
		expect(t.success).toBe('Danke!');
		expect(t.submit).toBe(FORM_TEXTS.du.submit);
		expect(t).not.toHaveProperty('fremd');
	});

	it('setzt Platzhalter ein und lässt unbekannte stehen', () => {
		expect(fillText('„{label}“ höchstens {max}, {x}', { label: 'E-Mail', max: 5 })).toBe(
			'„E-Mail“ höchstens 5, {x}',
		);
	});

	it('Prüfung, Fehler der Site-API und Download-Hinweis folgen der Anrede', () => {
		withSalutation('du');
		const email = { name: 'email', type: 'email', label: 'E-Mail', required: true } as const;
		expect(validateField(email, '')).toBe('Bitte fülle das Feld „E-Mail“ aus.');
		expect(validateField(email, 'x')).toBe(
			'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
		);
		expect(validateField({ ...email, maxLength: 3 }, 'a@b.de')).toBe(
			'„E-Mail“ ist zu lang. Erlaubt sind höchstens 3 Zeichen.',
		);
		expect(pickTexts(REQUEST_TEXTS).conflict).toBe(
			'Diese Zeit ist leider nicht mehr frei. Bitte wähle eine andere.',
		);
		expect(leadmagnetSuccessMessage('Ratgeber')).toContain('„Ratgeber“ schicken wir dir per E-Mail.');
	});
});
