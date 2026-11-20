// Vertrag `contract/visit-consent.v1.json`: wann das SDK nach der Wiedererkennung von Besuchen fragt, was mit
// Zustimmung im Browser liegt, wie ein eigenes Banner die Wahl meldet und welchen Baustein der Core unter
// „Rechtliches“ zum Übernehmen anbietet. Das SDK zeigt den Baustein nie selbst an.
// Neu schreiben: UPDATE_CONTRACT=1 npx vitest run tests/visitConsentContract.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import {
	ATTRIBUTION_CONSENT,
	ATTRIBUTION_RETENTION_DAYS,
	ATTRIBUTION_STORAGE_KEY,
} from '../src/lib/client/attribution.js';
import { COOKIE_BANNER_TEXTS, type Anrede } from '../src/lib/consent/bannerTexts.js';
import { CONSENT_CATEGORIES, CONSENT_STORAGE_KEY } from '../src/lib/consent/consent.svelte.js';
import { DEALSYSTEM_VISITS } from '../src/lib/internal/providers.js';

/** Zwecke, die die Besuchs-ID erlauben (Liste wie `ATTRIBUTION_CONSENT`; heute nur „Marketing“). */
const VISITOR_ID_CATEGORY = ATTRIBUTION_CONSENT.visitorId;

const FILE = new URL('../contract/visit-consent.v1.json', import.meta.url);

/** Überschrift des Bausteins. Der Core erkennt an ihr, ob der Baustein im Datenschutztext steht. */
const MARKER = 'Wiedererkennung von Besuchen (DealSystem)';
const MONTHS = Math.round(ATTRIBUTION_RETENTION_DAYS.visitorId / 30.4);

/** Baustein für die Datenschutzerklärung des Kunden, nur aus Fakten (wie „Hosting durch DealSystem“). */
function privacyHtml(anrede: Anrede): string {
	const w =
		anrede === 'sie'
			? {
					agree: 'Wenn Sie',
					agreeVerb: 'zustimmen',
					your: 'Ihres',
					you: 'Sie',
					send: 'senden',
					can: 'Sie können Ihre',
					yourB: 'Ihrem',
				}
			: {
					agree: 'Wenn du',
					agreeVerb: 'zustimmst',
					your: 'deines',
					you: 'du',
					send: 'sendest',
					can: 'Du kannst deine',
					yourB: 'deinem',
				};
	return [
		`<h2>${MARKER}</h2>`,
		`<p>${w.agree} im Cookie-Hinweis dieser Website „Marketing“ ${w.agreeVerb}, speichert die Website im lokalen ` +
			`Speicher ${w.your} Browsers (localStorage, Eintrag „${ATTRIBUTION_STORAGE_KEY}“) eine zufällige Besuchs-ID, ` +
			'den ersten und letzten Besuch sowie Kampagnen-Angaben wie Klick-IDs von Anzeigen. Damit erkennt sie ' +
			`wiederkehrende Besuche und ordnet sie einer Anfrage zu, die ${w.you} über ein Formular dieser Website ${w.send}. ` +
			'DealSystem verarbeitet diese Daten in unserem Auftrag.</p>',
		`<p>Die Besuchs-ID wird höchstens ${MONTHS} Monate (${ATTRIBUTION_RETENTION_DAYS.visitorId} Tage) verwendet, ` +
			`Besuche und Klick-IDs ${ATTRIBUTION_RETENTION_DAYS.clickIds} Tage. Ohne Zustimmung wird nichts davon ` +
			`gespeichert. ${w.can} Zustimmung jederzeit in den Cookie-Einstellungen dieser Website widerrufen; dann ` +
			`werden diese Angaben aus ${w.yourB} Browser gelöscht.</p>`,
	].join('\n');
}

function generate() {
	return {
		$comment:
			'Vertrag Wiedererkennung von Besuchen (Fassung 1). Quelle: SDK packages/site (consent/, client/attribution.ts, components/CookieBanner.svelte), erzeugt von tests/visitConsentContract.test.ts (UPDATE_CONTRACT=1). Der Core hält eine byte-gleiche Kopie und bietet privacyBlock unter „Rechtliches“ an.',
		banner: {
			when: 'always',
			whenRule:
				"Jede Seite mit <SiteHead /> fragt nach „Marketing“ für die Wiedererkennung von Besuchen, auch ohne Tracking-Kennung. Ausnahme: consent.banner = 'own' in dealsystem.config.ts, dann fragt das eigene Banner.",
			provider: DEALSYSTEM_VISITS,
			adds: ['marketing'],
			rules: {
				rejectAllEqualToAcceptAll: true,
				rejectAllFirst: true,
				preselected: false,
				blocksPage: false,
				ariaModal: false,
				escapeClosesUndecided: false,
				wcag: 'AA',
				revoke: '„Cookie-Einstellungen“ in <SiteFooterLegal /> auf jeder Seite und in <Datenschutz />',
				revokeReloads: true,
			},
			anrede: {
				source:
					'site.salutation im Inhalts-Schnappschuss (GET /api/v1/websites/{id}/content), beim Build gelesen',
				values: Object.keys(COOKIE_BANNER_TEXTS),
				default: 'sie',
				rule: "Nur 'du' weicht ab; fehlt das Feld oder ist der Wert unbekannt, gilt 'sie'.",
				override: { prop: 'anrede', rule: 'Nur ausnahmsweise; geht vor der Einstellung im CRM.' },
			},
			overrides: { prop: 'texts', keys: Object.keys(COOKIE_BANNER_TEXTS.sie) },
			texts: COOKIE_BANNER_TEXTS,
		},
		consent: {
			categories: CONSENT_CATEGORIES,
			storage: { type: 'localStorage', key: CONSENT_STORAGE_KEY },
			visitorId: {
				category: VISITOR_ID_CATEGORY,
				storage: 'localStorage',
				storageKey: ATTRIBUTION_STORAGE_KEY,
				durationDays: ATTRIBUTION_RETENTION_DAYS.visitorId,
				sentWith: ['POST /s/{key}/track', 'POST /s/{key}/leads (attribution.visitorId)'],
				rule: 'Der Seitenaufruf (track) und die Anfrage tragen eine visitorId nur mit Einwilligung „Marketing“, auch wenn noch eine alte im Speicher liegt.',
			},
			withoutConsent:
				'Nur der aktuelle Besuch im Arbeitsspeicher; keine Besuchs-ID, nichts im Browser-Speicher. Seitenaufrufe zählt der Core ohne Wiedererkennung.',
		},
		own: {
			config: { key: 'consent.banner', values: ['dealsystem', 'own'], default: 'dealsystem' },
			api: 'setConsent(choice: Partial<Record<"statistics" | "marketing" | "media", boolean>>): void',
			rules: [
				'Mit eigenem Banner zeigt das SDK weder <CookieBanner> noch „Cookie-Einstellungen“.',
				'Bis zur ersten Meldung gilt nichts als erlaubt; eine frühere Wahl des DealSystem-Banners zählt nicht.',
				'Das eigene Banner meldet die Wahl bei jedem Laden und bei jeder Änderung; das SDK speichert sie nicht.',
				'Fehlende Zwecke in choice bleiben, wie sie sind.',
			],
		},
		revoke: {
			rule: 'Wird „Marketing“ zurückgenommen, löscht das SDK die Besuchs-ID sofort aus ds-attr; mit dem Banner von DealSystem lädt die Seite danach neu.',
			deletes: [`${ATTRIBUTION_STORAGE_KEY}.visitorId`],
		},
		privacyBlock: {
			renderedBySdk: false,
			shownIn:
				'CRM: Eigene Website → Rechtliches, Knopf „Übernehmen“; Hinweis auch im Website-Status (MCP), nie blockierend',
			showWhen:
				"Die Seite nutzt das Banner von DealSystem oder consent.banner = 'own', und der Datenschutztext enthält marker nicht.",
			marker: MARKER,
			facts: {
				provider: 'DealSystem',
				role: 'Auftragsverarbeiter',
				purpose: DEALSYSTEM_VISITS.purpose,
				storage: 'localStorage',
				storageKey: ATTRIBUTION_STORAGE_KEY,
				durationDays: ATTRIBUTION_RETENTION_DAYS.visitorId,
				category: VISITOR_ID_CATEGORY,
			},
			htmlRules:
				'Nur <h2>, <p>, <ul>, <li>, <strong>, ohne Attribute und Links; beginnt mit <h2>{marker}</h2>. Der Core erkennt den Baustein am Marker (Tags entfernt, Groß-/Kleinschreibung und Leerraum egal).',
			html: { sie: privacyHtml('sie'), du: privacyHtml('du') },
		},
	};
}

const generated = generate();
if (process.env.UPDATE_CONTRACT) writeFileSync(FILE, `${JSON.stringify(generated, null, '\t')}\n`);
const contract = JSON.parse(readFileSync(FILE, 'utf8')) as typeof generated;

describe('Vertrag visit-consent.v1', () => {
	it('die Datei passt zum SDK (sonst: UPDATE_CONTRACT=1)', () => {
		expect(contract).toEqual(generated);
	});

	it('der Baustein nennt Speicherort, Dauer und Widerruf und beginnt mit dem Marker', () => {
		for (const anrede of ['sie', 'du'] as const) {
			const html = contract.privacyBlock.html[anrede];
			expect(html.startsWith(`<h2>${contract.privacyBlock.marker}</h2>`)).toBe(true);
			expect(html).toContain('„ds-attr“');
			expect(html).toContain('395 Tage');
			expect(html).toContain('widerrufen');
			// Nur Fakten, keine Rechtsgrundlagen (wie „Hosting durch DealSystem“ im Core).
			expect(html).not.toMatch(/Art\.\s*6|TDDDG|lit\./);
		}
		expect(contract.privacyBlock.html.du).not.toMatch(/\b(Sie|Ihre?[nrms]?)\b/);
		expect(contract.privacyBlock.html.sie).not.toMatch(/\b(du|dein\w*)\b/);
	});

	it('die Besuchs-ID braucht genau „Marketing“', () => {
		expect(ATTRIBUTION_CONSENT.visitorId).toEqual(['marketing']);
		expect(contract.privacyBlock.facts.category).toEqual(['marketing']);
		expect(contract.consent.visitorId.category).toEqual(['marketing']);
	});

	it('der Baustein nutzt nur Tags, die der Core beim Speichern behält, ohne Attribute', () => {
		for (const html of Object.values(contract.privacyBlock.html)) {
			const tags = [...html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)];
			for (const [, name, attrs] of tags) {
				expect(['h2', 'p', 'ul', 'li', 'strong'], name).toContain(name);
				expect(attrs!.trim(), name).toBe('');
			}
			expect(html).not.toMatch(/https?:|href/);
		}
	});
});
