import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		// Fixture-Projekte liegen als Dateien vor; Tests schreiben nur in eigene Temp-Ordner.
		pool: 'threads',
		maxWorkers: 2,
	},
});
