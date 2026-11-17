import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { handleHttpError, siteApiOrigin } from '@dealsystem/site/config';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		// 'ignore': Eine Sammlung ohne Einträge hat keine Detailseiten; das ist kein Fehler.
		prerender: { handleHttpError, handleUnseenRoutes: 'ignore' },
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://www.googletagmanager.com', 'https://connect.facebook.net'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'https://www.googletagmanager.com', 'https://www.facebook.com'],
				'font-src': ['self'],
				'connect-src': [
					'self',
					// Adresse der Site-API aus PUBLIC_DEALSYSTEM_API (Formular und Captcha); sonst app.dealsystem.io.
					siteApiOrigin(),
					'https://*.google-analytics.com',
					'https://*.analytics.google.com',
					'https://www.googletagmanager.com',
					'https://www.facebook.com',
				],
				// Karte über <MapEmbed> aus dem SDK (OpenStreetMap), nur nach Einwilligung.
				'frame-src': ['self', 'https://www.openstreetmap.org'],
				'worker-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
			},
		},
	},
};

export default config;
