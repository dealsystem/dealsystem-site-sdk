import { defineSite } from '../../src/lib/config/index.js';

export default defineSite({
	siteId: 's1',
	collections: {
		angebote: {
			source: 'cms',
			label: 'Angebote',
			route: '/angebote/:slug',
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
				{ name: 'email', type: 'email', standardField: 'email', required: true },
				{ name: 'nachricht', type: 'textarea' },
			],
		},
	},
});
