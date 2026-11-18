import adapter from '@sveltejs/adapter-static';
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
