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
);
