import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		// Fixture-Projekte der CLI sind Prüfgegenstand von `dealsystem check`, kein Code dieses Repos.
		ignores: [
			'**/dist/',
			'**/node_modules/',
			'**/.svelte-kit/',
			'**/coverage/',
			'**/.tmp/',
			'packages/cli/tests/fixtures/',
		],
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte'],
			},
		},
	},
	{
		// Die Bausteine des SDK sind eine Bibliothek: Ziele kommen als Eigenschaft oder aus dem CRM, `resolve()`
		// gehört in die Seite, die sie benutzt. Seit SvelteKit im Paket liegt (für `$app/state`), greift die Regel.
		files: ['packages/site/src/lib/**/*.svelte', 'packages/site/tests/**/*.svelte'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' },
	},
	{
		// Attrappe für `$app/state`: Die Adresse wird nur als Ganzes ersetzt, wie in SvelteKit.
		files: ['packages/site/tests/fixtures/appState.svelte.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' },
	},
);
