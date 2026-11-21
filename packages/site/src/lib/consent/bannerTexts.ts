// Texte von `<CookieBanner>` in Sie- und Du-Form. Eine Quelle für das Banner und den Vertrag
// `contract/visit-consent.v1.json`. Einzelne Texte lassen sich über `texts` überschreiben.

import type { Anrede } from '../types.js';

export type { Anrede };

/** Alle Texte des Cookie-Hinweises. */
export interface CookieBannerTexts {
	title: string;
	/** Was mit Zustimmung geschieht; ohne Zustimmung nichts davon. */
	intro: string;
	/** Wie sich die Wahl ändern lässt (Widerruf). */
	change: string;
	/** Vor dem Link auf die Datenschutzerklärung, z. B. „Mehr dazu in der“. */
	privacyBefore: string;
	privacyLink: string;
	choices: string;
	necessary: string;
	necessaryHint: string;
	statistics: string;
	statisticsHint: string;
	marketing: string;
	/** Wiedererkennung von Besuchen durch DealSystem; steht immer bei „Marketing“. */
	marketingHint: string;
	/** Zusatz, wenn die Seite Werbe-Dienste einbindet (Google Tag, Meta Pixel, fremde Dienste mit `marketing`). */
	marketingAdsHint: string;
	media: string;
	mediaHint: string;
	providers: string;
	newWindow: string;
	rejectAll: string;
	acceptAll: string;
	save: string;
	settings: string;
}

/** @internal Standardtexte je Anrede. */
export const COOKIE_BANNER_TEXTS: Readonly<Record<Anrede, CookieBannerTexts>> = {
	sie: {
		title: 'Cookies und Datenschutz',
		intro:
			'Mit Ihrer Zustimmung speichert diese Website Angaben in Ihrem Browser, etwa um wiederkehrende Besuche zu erkennen, und lädt gegebenenfalls Inhalte anderer Anbieter. Ohne Ihre Zustimmung geschieht das nicht.',
		change: 'Sie können Ihre Wahl jederzeit über „Cookie-Einstellungen“ am Seitenende ändern.',
		privacyBefore: 'Mehr dazu in der',
		privacyLink: 'Datenschutzerklärung',
		choices: 'Ihre Auswahl',
		necessary: 'Notwendig',
		necessaryHint: 'Speichert Ihre Auswahl. Immer aktiv.',
		statistics: 'Statistik',
		statisticsHint: 'Hilft uns zu verstehen, wie die Website genutzt wird.',
		marketing: 'Marketing',
		marketingHint:
			'Erkennt wieder, wenn Sie die Website erneut besuchen, und ordnet Ihre Besuche Ihrer Anfrage zu.',
		marketingAdsHint: 'Misst außerdem, über welche Anzeigen und Kampagnen Besucher zu uns kommen.',
		media: 'Externe Inhalte',
		mediaHint: 'Zeigt eingebettete Inhalte anderer Anbieter, z. B. Karten und Videos.',
		providers: 'Anbieter:',
		newWindow: '(Datenschutzerklärung, neues Fenster)',
		rejectAll: 'Alle ablehnen',
		acceptAll: 'Alle akzeptieren',
		save: 'Auswahl speichern',
		settings: 'Einstellungen',
	},
	du: {
		title: 'Cookies und Datenschutz',
		intro:
			'Mit deiner Zustimmung speichert diese Website Angaben in deinem Browser, etwa um wiederkehrende Besuche zu erkennen, und lädt gegebenenfalls Inhalte anderer Anbieter. Ohne deine Zustimmung geschieht das nicht.',
		change: 'Du kannst deine Wahl jederzeit über „Cookie-Einstellungen“ am Seitenende ändern.',
		privacyBefore: 'Mehr dazu in der',
		privacyLink: 'Datenschutzerklärung',
		choices: 'Deine Auswahl',
		necessary: 'Notwendig',
		necessaryHint: 'Speichert deine Auswahl. Immer aktiv.',
		statistics: 'Statistik',
		statisticsHint: 'Hilft uns zu verstehen, wie die Website genutzt wird.',
		marketing: 'Marketing',
		marketingHint:
			'Erkennt wieder, wenn du die Website erneut besuchst, und ordnet deine Besuche deiner Anfrage zu.',
		marketingAdsHint: 'Misst außerdem, über welche Anzeigen und Kampagnen Besucher zu uns kommen.',
		media: 'Externe Inhalte',
		mediaHint: 'Zeigt eingebettete Inhalte anderer Anbieter, z. B. Karten und Videos.',
		providers: 'Anbieter:',
		newWindow: '(Datenschutzerklärung, neues Fenster)',
		rejectAll: 'Alle ablehnen',
		acceptAll: 'Alle akzeptieren',
		save: 'Auswahl speichern',
		settings: 'Einstellungen',
	},
};
