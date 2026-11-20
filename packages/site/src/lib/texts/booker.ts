// Texte von `<Booker>` und `createBookingClient()` in Sie- und Du-Form: Schritte, Hinweise, Prüfmeldungen, Fehler.
// Eine Quelle für Baustein und Client. Einzelne Texte überschreibt `texts`.
import type { Anrede } from '../types.js';

/** Alle Texte der Terminbuchung. Platzhalter in geschweiften Klammern setzt das SDK ein. */
export interface BookerTexts {
	/** Schaltfläche, wenn `submitLabel` fehlt. */
	submit: string;
	/** Schaltfläche während des Buchens. */
	booking: string;
	loading: string;
	/** Für Vorleseprogramme beim Laden. */
	loadingLive: string;
	/** `{label}` = Name der Terminart */
	pickHeading: string;
	detailsHeading: string;
	/** Angaben vor der Zeitwahl (`contact_first`). `{label}` */
	detailsHeadingFirst: string;
	confirmHeading: string;
	bookedHeading: string;
	dryRunHeading: string;
	/** `{minutes}` */
	minutes: string;
	/** Angaben vor der Zeitwahl. `{minutes}` */
	durationThenPick: string;
	/** `{zone}` */
	zoneOnly: string;
	/** Zeitzone wie der Kalender. `{zone}` */
	zoneSame: string;
	/** `{zone}`, `{calendarZone}` */
	zoneDiffers: string;
	/** Name und E-Mail des Gasts. `{details}` */
	yourDetails: string;
	/** `{details}` */
	forPerson: string;
	changeDetails: string;
	otherTime: string;
	/** Beschriftung der Tagesauswahl. */
	chooseDay: string;
	/** Schaltfläche eines Tages für Vorleseprogramme. `{day}`, `{count}` */
	dayLabel: string;
	moreSlots: string;
	loadingMore: string;
	/** Nach „Weitere Termine“. `{count}` */
	moreDays: string;
	noSlots: string;
	noSlotsNext: string;
	/** `{star}` wird zum Sternchen. */
	requiredHint: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	street: string;
	postalCode: string;
	city: string;
	locationLegend: string;
	/** Nur eine Ort-Art. `{location}` */
	locationSingle: string;
	addressLegend: string;
	choose: string;
	/** Schaltfläche, während die Antworten geprüft werden. */
	qualifying: string;
	toTimes: string;
	checking: string;
	privacy: string;
	privacyLink: string;
	notBooked: string;
	captchaRunning: string;
	sendingLive: string;
	/** `{when}` */
	bookedLive: string;
	/** `{when}` */
	dryRunLive: string;
	confirmationMail: string;
	dryRunNote: string;
	/** Link nach einer Absage mit Weiterleitung. */
	continue: string;
	errorOne: string;
	/** `{count}` */
	errorMany: string;
	contactDirect: string;
	contactOr: string;
	noScript: string;
	firstNameRequired: string;
	emailRequired: string;
	phoneRequired: string;
	/** Adressfeld leer. `{label}` */
	addressRequired: string;
	invalidPostalCode: string;
	/** `{label}` */
	confirmRequired: string;
	/** `{label}` */
	chooseRequired: string;
	/** `{label}` */
	fillRequired: string;
	/** `{label}`, `{max}` */
	tooLong: string;
	invalidEmail: string;
	invalidPhone: string;
	/** `{label}` */
	invalidNumber: string;
	/** `{label}` */
	invalidDate: string;
	/** Der Server hat die Angabe abgelehnt. `{label}` */
	checkField: string;
	checkInputs: string;
	pickTime: string;
	captcha: string;
	unavailable: string;
	slotTaken: string;
	/** Überschrift, wenn die Antworten nicht passen und das CRM keine eigene nennt. */
	notQualifiedHeadline: string;
	notQualified: string;
	rangeInvalid: string;
}

const SAME = {
	submit: 'Termin buchen',
	booking: 'Wird gebucht …',
	loading: 'Freie Termine werden geladen …',
	loadingLive: 'Freie Termine werden geladen.',
	pickHeading: '{label}: Tag und Uhrzeit wählen',
	confirmHeading: 'Termin bestätigen',
	dryRunHeading: 'Vorschau: Termin geprüft',
	minutes: '{minutes} Minuten',
	forPerson: 'Für {details}',
	changeDetails: 'Angaben ändern',
	otherTime: 'Andere Zeit wählen',
	chooseDay: 'Tag wählen',
	dayLabel: '{day}, {count} freie Zeiten',
	moreSlots: 'Weitere Termine',
	loadingMore: 'Termine werden geladen …',
	moreDays: '{count} weitere Tage mit freien Terminen.',
	noSlots: 'In diesem Zeitraum ist kein Termin frei.',
	noSlotsNext: 'Im nächsten Zeitraum ist kein Termin frei.',
	requiredHint: 'Pflichtfelder sind mit {star} markiert.',
	firstName: 'Vorname',
	lastName: 'Nachname',
	email: 'E-Mail',
	phone: 'Telefon',
	street: 'Straße und Hausnummer',
	postalCode: 'PLZ',
	city: 'Ort',
	locationLegend: 'Wie findet der Termin statt?',
	locationSingle: 'Ort: {location}',
	addressLegend: 'Wo findet der Termin statt?',
	choose: 'Bitte wählen',
	qualifying: 'Wird geprüft …',
	toTimes: 'Weiter zur Terminwahl',
	privacyLink: 'Datenschutzerklärung',
	notBooked: 'Der Termin wurde nicht gebucht.',
	bookedLive: 'Termin gebucht: {when}.',
	dryRunLive: 'Vorschau: Termin am {when} geprüft, nicht gebucht.',
	dryRunNote: 'Vorschau: Die Buchung wurde geprüft, aber nicht angelegt. Es geht keine Mail raus.',
	continue: 'Weiter',
	contactOr: 'oder',
	noScript: 'Die Terminbuchung braucht JavaScript.',
	tooLong: '„{label}“ ist zu lang. Erlaubt sind höchstens {max} Zeichen.',
	unavailable: 'Die Terminbuchung ist zurzeit nicht verfügbar.',
	notQualifiedHeadline: 'Dafür bieten wir leider keinen Termin an',
	rangeInvalid: 'Der Zeitraum ist ungültig.',
} as const satisfies Partial<BookerTexts>;

/** @internal Standardtexte je Anrede. */
export const BOOKER_TEXTS: Readonly<Record<Anrede, BookerTexts>> = {
	sie: {
		...SAME,
		detailsHeading: 'Ihre Angaben',
		detailsHeadingFirst: '{label}: Ihre Angaben',
		bookedHeading: 'Ihr Termin ist gebucht',
		durationThenPick: '{minutes} Minuten. Danach wählen Sie Tag und Uhrzeit.',
		zoneOnly: 'Zeiten in Ihrer Zeitzone: {zone}.',
		zoneSame: 'Zeiten in Ihrer Zeitzone: {zone}, wie der Kalender des Anbieters.',
		zoneDiffers: 'Zeiten in Ihrer Zeitzone: {zone}. Der Kalender des Anbieters führt {calendarZone}.',
		yourDetails: 'Ihre Angaben: {details}',
		checking: 'Ihre Angaben werden geprüft.',
		privacy: 'Ihre Angaben verwenden wir, um den Termin zu vereinbaren. Mehr dazu in der',
		captchaRunning: 'Die Sicherheitsprüfung läuft. Ihr Termin wird gleich gebucht.',
		sendingLive: 'Ihr Termin wird gebucht.',
		confirmationMail:
			'Sie erhalten gleich eine Bestätigung per E-Mail, darin auch Links zum Absagen oder Verschieben.',
		errorOne: 'Bitte prüfen Sie das markierte Feld.',
		errorMany: 'Bitte prüfen Sie die {count} markierten Felder.',
		contactDirect: 'Sie erreichen uns auch direkt:',
		firstNameRequired: 'Bitte geben Sie Ihren Vornamen an.',
		emailRequired: 'Bitte geben Sie Ihre E-Mail-Adresse an.',
		phoneRequired: 'Bitte geben Sie Ihre Telefonnummer an.',
		addressRequired: 'Bitte geben Sie „{label}“ an.',
		invalidPostalCode: 'Bitte geben Sie eine gültige Postleitzahl an, z. B. 04109.',
		confirmRequired: 'Bitte bestätigen Sie „{label}“.',
		chooseRequired: 'Bitte wählen Sie bei „{label}“ etwas aus.',
		fillRequired: 'Bitte füllen Sie das Feld „{label}“ aus.',
		invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
		invalidPhone: 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0341 1234567.',
		invalidNumber: 'Bitte geben Sie bei „{label}“ eine Zahl an.',
		invalidDate: 'Bitte geben Sie bei „{label}“ ein Datum an.',
		checkField: 'Bitte prüfen Sie Ihre Angabe bei „{label}“.',
		checkInputs: 'Bitte prüfen Sie Ihre Angaben.',
		pickTime: 'Bitte wählen Sie eine Zeit.',
		captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuchen Sie es später erneut.',
		slotTaken: 'Diese Zeit ist leider nicht mehr frei. Bitte wählen Sie eine andere.',
		notQualified:
			'Für diesen Termin passt Ihre Anfrage leider nicht. Bitte nehmen Sie direkt Kontakt auf, wir helfen gern weiter.',
	},
	du: {
		...SAME,
		detailsHeading: 'Deine Angaben',
		detailsHeadingFirst: '{label}: Deine Angaben',
		bookedHeading: 'Dein Termin ist gebucht',
		durationThenPick: '{minutes} Minuten. Danach wählst du Tag und Uhrzeit.',
		zoneOnly: 'Zeiten in deiner Zeitzone: {zone}.',
		zoneSame: 'Zeiten in deiner Zeitzone: {zone}, wie der Kalender des Anbieters.',
		zoneDiffers: 'Zeiten in deiner Zeitzone: {zone}. Der Kalender des Anbieters führt {calendarZone}.',
		yourDetails: 'Deine Angaben: {details}',
		checking: 'Deine Angaben werden geprüft.',
		privacy: 'Deine Angaben verwenden wir, um den Termin zu vereinbaren. Mehr dazu in der',
		captchaRunning: 'Die Sicherheitsprüfung läuft. Dein Termin wird gleich gebucht.',
		sendingLive: 'Dein Termin wird gebucht.',
		confirmationMail:
			'Du erhältst gleich eine Bestätigung per E-Mail, darin auch Links zum Absagen oder Verschieben.',
		errorOne: 'Bitte prüfe das markierte Feld.',
		errorMany: 'Bitte prüfe die {count} markierten Felder.',
		contactDirect: 'Du erreichst uns auch direkt:',
		firstNameRequired: 'Bitte gib deinen Vornamen an.',
		emailRequired: 'Bitte gib deine E-Mail-Adresse an.',
		phoneRequired: 'Bitte gib deine Telefonnummer an.',
		addressRequired: 'Bitte gib „{label}“ an.',
		invalidPostalCode: 'Bitte gib eine gültige Postleitzahl an, z. B. 04109.',
		confirmRequired: 'Bitte bestätige „{label}“.',
		chooseRequired: 'Bitte wähle bei „{label}“ etwas aus.',
		fillRequired: 'Bitte fülle das Feld „{label}“ aus.',
		invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
		invalidPhone: 'Bitte gib eine gültige Telefonnummer ein, z. B. 0341 1234567.',
		invalidNumber: 'Bitte gib bei „{label}“ eine Zahl an.',
		invalidDate: 'Bitte gib bei „{label}“ ein Datum an.',
		checkField: 'Bitte prüfe deine Angabe bei „{label}“.',
		checkInputs: 'Bitte prüfe deine Angaben.',
		pickTime: 'Bitte wähle eine Zeit.',
		captcha: 'Die Sicherheitsprüfung konnte nicht durchgeführt werden. Bitte versuche es später erneut.',
		slotTaken: 'Diese Zeit ist leider nicht mehr frei. Bitte wähle eine andere.',
		notQualified:
			'Für diesen Termin passt deine Anfrage leider nicht. Bitte nimm direkt Kontakt auf, wir helfen gern weiter.',
	},
};
