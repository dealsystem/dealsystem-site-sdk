// Terminart und freie Zeiten einer Probe-Buchung, wie die Site-API sie liefert (`site-api.v1.json`).

export const INFO = {
	key: 'erstgespraech',
	label: 'Erstgespräch',
	title: 'Erstgespräch 30 min',
	description: null,
	durationMinutes: 30,
	timezone: 'Europe/Berlin',
	locations: [
		{ type: 'phone', label: 'Telefon' },
		{ type: 'google_meet', label: 'Google Meet' },
	],
	questions: [
		{
			key: 'anliegen',
			label: 'Worum geht es?',
			type: 'textarea',
			required: true,
			options: null,
			placeholder: null,
		},
		{
			key: 'objekt',
			label: 'Objektart',
			type: 'select',
			required: false,
			options: ['Wohnung', 'Haus'],
			placeholder: null,
		},
	],
};
export const SLOTS = [
	{ start: '2026-12-01T08:00:00.000Z', end: '2026-12-01T08:30:00.000Z' },
	{ start: '2026-12-01T08:30:00.000Z', end: '2026-12-01T09:00:00.000Z' },
];
