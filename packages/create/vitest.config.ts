import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Der Starter wird wirklich gebaut und geprüft.
		testTimeout: 180_000,
		hookTimeout: 180_000,
	},
});
