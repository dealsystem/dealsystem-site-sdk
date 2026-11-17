import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Zwei Projekte: `unit` läuft in Node (auch SSR-Rendering der Komponenten),
// `dom` in jsdom mit der Browser-Variante von Svelte.
export default defineConfig({
	test: {
		projects: [
			{
				plugins: [svelte()],
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
