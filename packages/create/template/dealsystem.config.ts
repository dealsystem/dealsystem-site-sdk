import { defineSite } from '@dealsystem/site/config';

// Beschreibt die Seite: ihre Kennung im CRM, die Sammlungen (Inhalte aus dem
// CMS) und die Formulare. Neue Felder eines Formulars oder einer Sammlung
// werden hier eingetragen, nirgends sonst.
export default defineSite({
	// Trägt `npx dealsystem init` ein.
	siteId: '',
	collections: {
		angebote: {
			source: 'cms',
			label: 'Angebote',
			route: '/angebote/:slug',
			indexRoute: '/angebote',
			slugFrom: 'titel',
			fields: [
				{ name: 'titel', type: 'text', label: 'Titel', required: true },
				{ name: 'kurztext', type: 'textarea', label: 'Kurztext für die Übersicht' },
				{ name: 'ort', type: 'text', label: 'Ort' },
				{ name: 'preis', type: 'text', label: 'Preis' },
				{ name: 'beschreibung', type: 'richtext', label: 'Beschreibung' },
				{ name: 'bilder', type: 'gallery', label: 'Bilder' },
			],
		},
	},
	funnels: {
		kontakt: {
			label: 'Kontakt',
			fields: [
				{ name: 'firstName', type: 'text', label: 'Vorname', standardField: 'firstName' },
				{ name: 'lastName', type: 'text', label: 'Nachname', standardField: 'lastName', required: true },
				{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },
				{ name: 'phone', type: 'tel', label: 'Telefon', standardField: 'phone' },
				{ name: 'nachricht', type: 'textarea', label: 'Nachricht', required: true },
			],
		},
	},
});
