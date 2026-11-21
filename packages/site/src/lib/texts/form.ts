// Texte von `<LeadForm>` und `createLeadClient()` in Sie- und Du-Form: Prüfmeldungen, Fehler, Erfolg. Eine Quelle
// für Formular, Client und Prüfung (`client/validation.ts`). Einzelne Texte überschreibt `texts`.
import type { Anrede } from '../types.js';

/** Alle Texte eines Formulars. Platzhalter in geschweiften Klammern setzt das SDK ein. */
export interface FormTexts {
	/** Schaltfläche, wenn `submitLabel` fehlt. */
	submit: string;
	/** Hinweis über den Feldern; `{star}` wird zum Sternchen. */
	requiredHint: string;
	/** Erste Auswahl in einer Liste. */
	choose: string;
	/** Vor dem Link auf die Datenschutzerklärung. */
	privacy: string;
	privacyLink: string;
	/** Pflichtfeld zum Bestätigen leer. `{label}` */
	confirmRequired: string;
	/** Pflicht-Auswahl leer oder ungültig. `{label}` */
	chooseRequired: string;
	/** Pflichtfeld leer. `{label}` */
	fillRequired: string;
	/** Zu lang. `{label}`, `{max}` */
	tooLong: string;
	invalidEmail: string;
	invalidPhone: string;
	/** `{label}` */
	invalidDate: string;
	/** Der Server hat das Feld abgelehnt. `{label}` */
	checkField: string;
	/** Über den Feldern bei genau einem Fehler. */
	errorOne: string;
	/** Bei mehreren Fehlern. `{count}` */
	errorMany: string;
	/** Angaben passen nicht (ganzes Formular). */
	checkInputs: string;
	/** Weder E-Mail noch Telefon. */
	reachable: string;
	captchaRunning: string;
	sending: string;
	/** Fett vor der Ursache. */
	notSent: string;
	/** Sicherheitsprüfung ließ sich im Browser nicht durchführen. */
	captcha: string;
	/** Der Server hat die Lösung abgelehnt; ein neuer Versuch geht sofort. */
	captchaFailed: string;
	network: string;
	rateLimited: string;
	/** Formular im CRM ausgeschaltet oder nicht vorhanden. */
	unavailable: string;
	/** Sonstiger Fehler. */
	failed: string;
	/** Vor Telefon und E-Mail aus dem CRM. */
	contactDirect: string;
	/** Zwischen Telefon und E-Mail. */
	contactOr: string;
	/** Ohne JavaScript. */
	noScript: string;
	success: string;
	/** Erfolg mit Datei (`leadmagnet`). `{label}` */
	successLeadmagnet: string;
	/** Nur in der Vorschau. */
	dryRun: string;
}

/** @internal Standardtexte je Anrede. */
export const FORM_TEXTS: Readonly<Record<Anrede, FormTexts>> = {
	sie: {
		submit: 'Absenden',
		requiredHint: 'Pflichtfelder sind mit {star} markiert.',
		choose: 'Bitte wählen',
		privacy: 'Ihre Angaben verwenden wir, um Ihre Anfrage zu bearbeiten. Mehr dazu in der',
		privacyLink: 'Datenschutzerklärung',
		confirmRequired: 'Bitte bestätigen Sie „{label}“.',
		chooseRequired: 'Bitte wählen Sie bei „{label}“ etwas aus.',
		fillRequired: 'Bitte füllen Sie das Feld „{label}“ aus.',
		tooLong: '„{label}“ ist zu lang. Erlaubt sind höchstens {max} Zeichen.',
		invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
		invalidPhone: 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0341 1234567.',
		invalidDate: 'Bitte geben Sie bei „{label}“ ein Datum an.',
		checkField: 'Bitte prüfen Sie Ihre Angabe bei „{label}“.',
		errorOne: 'Bitte prüfen Sie das markierte Feld.',
		errorMany: 'Bitte prüfen Sie die {count} markierten Felder.',
		checkInputs: 'Bitte prüfen Sie Ihre Angaben.',
		reachable: 'Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an.',
		captchaRunning: 'Die Sicherheitsprüfung läuft. Ihre Anfrage wird gleich gesendet.',
		sending: 'Ihre Anfrage wird gesendet.',
		notSent: 'Ihre Anfrage wurde nicht gesendet.',
		captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuchen Sie es später erneut.',
		captchaFailed: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
		network:
			'Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
		rateLimited: 'Im Moment gehen zu viele Anfragen ein. Bitte versuchen Sie es in ein paar Minuten erneut.',
		unavailable: 'Dieses Formular ist zurzeit nicht verfügbar.',
		failed: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
		contactDirect: 'Sie erreichen uns auch direkt:',
		contactOr: 'oder',
		noScript: 'Das Formular braucht JavaScript.',
		success: 'Vielen Dank. Ihre Anfrage ist bei uns angekommen.',
		successLeadmagnet:
			'Vielen Dank. Ihre Anfrage ist bei uns angekommen. „{label}“ schicken wir Ihnen per E-Mail. Falls nichts ankommt, sehen Sie bitte im Spam-Ordner nach oder sprechen Sie uns an.',
		dryRun: 'Vorschau: Diese Anfrage wurde geprüft, aber nicht gespeichert.',
	},
	du: {
		submit: 'Absenden',
		requiredHint: 'Pflichtfelder sind mit {star} markiert.',
		choose: 'Bitte wählen',
		privacy: 'Deine Angaben verwenden wir, um deine Anfrage zu bearbeiten. Mehr dazu in der',
		privacyLink: 'Datenschutzerklärung',
		confirmRequired: 'Bitte bestätige „{label}“.',
		chooseRequired: 'Bitte wähle bei „{label}“ etwas aus.',
		fillRequired: 'Bitte fülle das Feld „{label}“ aus.',
		tooLong: '„{label}“ ist zu lang. Erlaubt sind höchstens {max} Zeichen.',
		invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
		invalidPhone: 'Bitte gib eine gültige Telefonnummer ein, z. B. 0341 1234567.',
		invalidDate: 'Bitte gib bei „{label}“ ein Datum an.',
		checkField: 'Bitte prüfe deine Angabe bei „{label}“.',
		errorOne: 'Bitte prüfe das markierte Feld.',
		errorMany: 'Bitte prüfe die {count} markierten Felder.',
		checkInputs: 'Bitte prüfe deine Angaben.',
		reachable: 'Bitte gib eine E-Mail-Adresse oder eine Telefonnummer an.',
		captchaRunning: 'Die Sicherheitsprüfung läuft. Deine Anfrage wird gleich gesendet.',
		sending: 'Deine Anfrage wird gesendet.',
		notSent: 'Deine Anfrage wurde nicht gesendet.',
		captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuche es später erneut.',
		captchaFailed: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut.',
		network:
			'Die Verbindung ist fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es erneut.',
		rateLimited: 'Im Moment gehen zu viele Anfragen ein. Bitte versuche es in ein paar Minuten erneut.',
		unavailable: 'Dieses Formular ist zurzeit nicht verfügbar.',
		failed: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.',
		contactDirect: 'Du erreichst uns auch direkt:',
		contactOr: 'oder',
		noScript: 'Das Formular braucht JavaScript.',
		success: 'Vielen Dank. Deine Anfrage ist bei uns angekommen.',
		successLeadmagnet:
			'Vielen Dank. Deine Anfrage ist bei uns angekommen. „{label}“ schicken wir dir per E-Mail. Falls nichts ankommt, sieh bitte im Spam-Ordner nach oder sprich uns an.',
		dryRun: 'Vorschau: Diese Anfrage wurde geprüft, aber nicht gespeichert.',
	},
};
