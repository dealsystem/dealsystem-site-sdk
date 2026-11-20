// Fehlertexte der Site-API (`client/siteApi.ts`) in Sie- und Du-Form. Formular und Terminbuchung zeigen sie,
// wenn sie keinen eigenen Text für den Fall haben.
import type { SiteApiErrorKind } from '../client/siteApi.js';
import type { Anrede } from '../types.js';

/** Ein Text je Fehlerart der Site-API. */
export type RequestTexts = Record<SiteApiErrorKind, string>;

/** @internal Standardtexte je Anrede. */
export const REQUEST_TEXTS: Readonly<Record<Anrede, RequestTexts>> = {
	sie: {
		network:
			'Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
		rate_limited: 'Im Moment gehen zu viele Anfragen ein. Bitte versuchen Sie es in ein paar Minuten erneut.',
		validation: 'Bitte prüfen Sie Ihre Angaben.',
		captcha_failed: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
		rejected: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
		not_found: 'Der angefragte Inhalt ist nicht verfügbar.',
		conflict: 'Diese Zeit ist leider nicht mehr frei. Bitte wählen Sie eine andere.',
		gone: 'Dieser Termin hat bereits begonnen oder ist vorbei.',
		forbidden: 'Die Anfrage wurde abgelehnt.',
		server: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
		invalid_response: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
	},
	du: {
		network:
			'Die Verbindung ist fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es erneut.',
		rate_limited: 'Im Moment gehen zu viele Anfragen ein. Bitte versuche es in ein paar Minuten erneut.',
		validation: 'Bitte prüfe deine Angaben.',
		captcha_failed: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut.',
		rejected: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.',
		not_found: 'Der angefragte Inhalt ist nicht verfügbar.',
		conflict: 'Diese Zeit ist leider nicht mehr frei. Bitte wähle eine andere.',
		gone: 'Dieser Termin hat bereits begonnen oder ist vorbei.',
		forbidden: 'Die Anfrage wurde abgelehnt.',
		server: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.',
		invalid_response: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.',
	},
};
