// Texte der Platzhalter vor fremden Inhalten in Sie- und Du-Form: `<MapEmbed>`, `<Embed>`, `<MediaVideo>`.
// Je Baustein eine Quelle; einzelne Texte überschreibt `texts`.
import type { Anrede } from '../types.js';

/** Texte von `<MapEmbed>`. */
export interface MapEmbedTexts {
	/** Bevor die Karte geladen ist. */
	notice: string;
	show: string;
	/** Link zur Karte bei OpenStreetMap. */
	open: string;
	newWindow: string;
}

/** Texte von `<Embed>`. Platzhalter: `{noun}` („Das Video“ …), `{provider}`, `{category}`. */
export interface EmbedTexts {
	/** `{noun}`, `{provider}` */
	notice: string;
	/** Wenn der Dienst keinen Anbieter nennt. */
	unknownProvider: string;
	/** Wenn die Vorlage nichts nennt. */
	noun: string;
	load: string;
	privacyLink: string;
	open: string;
	newWindow: string;
	/** Unter den Knöpfen. `{category}` */
	consentNote: string;
}

/** Texte von `<MediaVideo>`. `{title}` */
export interface MediaVideoTexts {
	notice: string;
	load: string;
}

/** @internal */
export const MAP_EMBED_TEXTS: Readonly<Record<Anrede, MapEmbedTexts>> = {
	sie: {
		notice:
			'Die Karte kommt von OpenStreetMap. Beim Anzeigen werden Daten, zum Beispiel Ihre IP-Adresse, an OpenStreetMap übertragen.',
		show: 'Karte anzeigen',
		open: 'Karte in OpenStreetMap öffnen',
		newWindow: '(neues Fenster)',
	},
	du: {
		notice:
			'Die Karte kommt von OpenStreetMap. Beim Anzeigen werden Daten, zum Beispiel deine IP-Adresse, an OpenStreetMap übertragen.',
		show: 'Karte anzeigen',
		open: 'Karte in OpenStreetMap öffnen',
		newWindow: '(neues Fenster)',
	},
};

/** @internal */
export const EMBED_TEXTS: Readonly<Record<Anrede, EmbedTexts>> = {
	sie: {
		notice:
			'{noun} kommt von {provider}. Beim Laden werden Daten, zum Beispiel Ihre IP-Adresse, dorthin übertragen.',
		unknownProvider: 'einem anderen Anbieter',
		noun: 'Der Inhalt',
		load: 'Inhalt laden',
		privacyLink: 'Datenschutzerklärung des Anbieters',
		open: 'Beim Anbieter öffnen',
		newWindow: '(neues Fenster)',
		consentNote:
			'Damit stimmen Sie „{category}“ zu. Ändern können Sie das jederzeit über „Cookie-Einstellungen“.',
	},
	du: {
		notice:
			'{noun} kommt von {provider}. Beim Laden werden Daten, zum Beispiel deine IP-Adresse, dorthin übertragen.',
		unknownProvider: 'einem anderen Anbieter',
		noun: 'Der Inhalt',
		load: 'Inhalt laden',
		privacyLink: 'Datenschutzerklärung des Anbieters',
		open: 'Beim Anbieter öffnen',
		newWindow: '(neues Fenster)',
		consentNote:
			'Damit stimmst du „{category}“ zu. Ändern kannst du das jederzeit über „Cookie-Einstellungen“.',
	},
};

/** @internal */
export const MEDIA_VIDEO_TEXTS: Readonly<Record<Anrede, MediaVideoTexts>> = {
	sie: {
		notice:
			'Das Video „{title}“ wird von einem anderen Anbieter geladen. Dabei werden Daten an diesen Anbieter übertragen.',
		load: 'Video laden',
	},
	du: {
		notice:
			'Das Video „{title}“ wird von einem anderen Anbieter geladen. Dabei werden Daten an diesen Anbieter übertragen.',
		load: 'Video laden',
	},
};
