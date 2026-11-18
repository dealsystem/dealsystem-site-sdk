import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `$app/state` gibt es nur in SvelteKit. In den Tests steht dafür eine Attrappe, die die Route vorgibt.
const alias = [
	{
		find: '$app/state',
		replacement: fileURLToPath(new URL('./tests/fixtures/appState.svelte.ts', import.meta.url)),
	},
	// Vorlagen aus dem Starter (der Beispiel-Funnel im Skill) importieren das Paket unter seinem Namen.
	{ find: /^@dealsystem\/site$/, replacement: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)) },
];

// Zwei Projekte: `unit` läuft in Node (auch SSR-Rendering der Komponenten),
// `dom` in jsdom mit der Browser-Variante von Svelte.
export default defineConfig({
	test: {
		projects: [
			{
				plugins: [svelte()],
				resolve: { alias },
				test: {
					name: 'unit',
					globals: true,
					environment: 'node',
					include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
					exclude: ['**/*.dom.test.ts'],
				},
			},
			{
				plugins: [svelte(), svelteTesting()],
				resolve: { alias },
				test: {
					name: 'dom',
					globals: true,
					environment: 'jsdom',
					include: ['src/**/*.dom.test.ts', 'tests/**/*.dom.test.ts'],
					setupFiles: ['./tests/setup.dom.ts'],
				},
			},
		],
	},
});
