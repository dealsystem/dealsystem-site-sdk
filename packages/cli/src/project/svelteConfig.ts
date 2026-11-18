// Soll-Stand von svelte.config.js und vite.config.ts für `dealsystem sync --fix-config`
// (STR-001, SEC-005, STR-008, STR-009). Der Starter übernimmt diese Dateien unverändert.
// Seit Regelsatz 3 erzeugt `dealsystemCsp()` die Content-Security-Policy aus einer festen Basis und den fremden
// Diensten unter `external` in dealsystem.config.ts. Die feste Liste bis SDK 0.1 (`LEGACY_…`) bleibt gültig.

export const SVELTE_CONFIG_TEMPLATE = `import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { handleHttpError } from '@dealsystem/site/config';
import { dealsystemCsp } from '@dealsystem/site/csp';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		// 'ignore': Eine Sammlung ohne Einträge hat keine Detailseiten; das ist kein Fehler.
		prerender: { handleHttpError, handleUnseenRoutes: 'ignore' },
		// Sicherheitsregeln aus dealsystem.config.ts (external). Fremde Hosts dort eintragen, nie hier.
		csp: dealsystemCsp(),
	},
};

export default config;
`;

/** Feste CSP des Starters bis SDK 0.1 (Regelsatz 2). Besteht SEC-005 weiter; `external` wirkt damit nicht. */
export const LEGACY_SVELTE_CONFIG_TEMPLATE = `import adapter from '@sveltejs/adapter-static';
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
`;

export const VITE_CONFIG_TEMPLATE = `import { sveltekit } from '@sveltejs/kit/vite';
import { dealsystem } from '@dealsystem/site/vite';
import { defineConfig } from 'vite';
import site from './dealsystem.config.ts';

export default defineConfig({
	plugins: [dealsystem(site), sveltekit()],
});
`;
