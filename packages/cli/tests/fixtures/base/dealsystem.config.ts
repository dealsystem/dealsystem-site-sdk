import { defineSite } from '@dealsystem/site/config';

export default defineSite({
	siteId: '3f1c2b9a-6d4e-4c1a-9b7e-2a5d8c0f1e23',
	collections: {
		angebote: {
			source: 'cms',
			label: 'Angebote',
			route: '/angebote/:slug',
			indexRoute: '/angebote',
			fields: [
				{ name: 'titel', type: 'text', required: true },
				{ name: 'preis', type: 'number' },
				{ name: 'beschreibung', type: 'richtext' },
				{ name: 'bilder', type: 'gallery' },
			],
		},
	},
	funnels: {
		kontakt: {
			label: 'Kontakt',
			fields: [
				{ name: 'firstName', type: 'text', standardField: 'firstName' },
				{ name: 'email', type: 'email', standardField: 'email', required: true },
				{ name: 'nachricht', type: 'textarea' },
			],
		},
	},
});
