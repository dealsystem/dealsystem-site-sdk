import type { SiteData } from '../types.js';
import embedded from './dealsystem-site-data.js';

let override: SiteData | null = null;

/** @internal Nur für Tests des SDK. */
export function setSiteDataForTests(data: SiteData | null): void {
	override = data;
}

/** @internal */
export function getSiteData(): SiteData {
	const data = override ?? embedded;
	if (!data) {
		throw new Error(
			'[dealsystem] Das Vite-Plugin fehlt. Trage es in vite.config.ts vor sveltekit() ein:\n' +
				"  import { dealsystem } from '@dealsystem/site/vite';\n" +
				"  import site from './dealsystem.config';\n" +
				'  export default defineConfig({ plugins: [dealsystem(site), sveltekit()] });',
		);
	}
	return data;
}

/** @internal Leere Daten, z. B. als Ausgangspunkt in Tests und im Plugin. */
export function emptySiteData(): SiteData {
	return {
		api: { baseUrl: '', siteKey: 'dev' },
		site: { id: '', slug: '', name: '', primaryHost: '', locale: 'de', url: '' },
		legal: { company: '', address: '', email: '', phone: '' },
		tracking: { metaPixelId: null, googleTagId: null },
		funnels: {},
		collections: {},
		slots: {},
		richtext: {},
		seo: {
			noindex: false,
			defaults: { title: null, description: null, image: null },
			pages: {},
			favicon: null,
		},
		builtAt: 0,
		external: {},
		bookings: {},
	};
}
