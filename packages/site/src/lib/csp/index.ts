// `@dealsystem/site/csp`: die Content-Security-Policy der Seite für `kit.csp` in svelte.config.js.

import type { Config } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { siteApiOrigin } from '../config/index.js';
import { readSiteConfig, SITE_CONFIG_FILE } from '../config/static/index.js';
import { buildCspDirectives } from '../external/csp.js';

type KitCsp = NonNullable<NonNullable<Config['kit']>['csp']>;

/** Sucht `dealsystem.config.ts` im Arbeitsordner und darüber bis zum Projektordner (erste `package.json`). */
function findSiteConfig(start: string): string | null {
	let dir = start;
	for (;;) {
		const file = join(dir, SITE_CONFIG_FILE);
		if (existsSync(file)) return file;
		const parent = dirname(dir);
		if (existsSync(join(dir, 'package.json')) || parent === dir) return null;
		dir = parent;
	}
}

/**
 * Sicherheitsregeln (Content-Security-Policy) der Seite für `kit.csp` in `svelte.config.js`. Sie entstehen aus
 * einer festen Basis und den fremden Diensten unter `external` in `dealsystem.config.ts`; die Datei wird dafür
 * gelesen, nicht ausgeführt. Was dort nicht steht, lässt der Browser nicht zu. Die Funktion nimmt bewusst keine
 * Argumente: Hosts trägst du in `external` ein, nie hier.
 *
 * Die Adresse der Site-API kommt aus `PUBLIC_DEALSYSTEM_API` (wie bei `siteApiOrigin()`).
 *
 * @example
 * // svelte.config.js
 * import adapter from '@sveltejs/adapter-static';
 * import { handleHttpError } from '@dealsystem/site/config';
 * import { dealsystemCsp } from '@dealsystem/site/csp';
 *
 * export default {
 * 	kit: {
 * 		adapter: adapter({ fallback: '404.html' }),
 * 		prerender: { handleHttpError, handleUnseenRoutes: 'ignore' },
 * 		csp: dealsystemCsp(),
 * 	},
 * };
 */
export function dealsystemCsp(): KitCsp {
	const file = findSiteConfig(process.cwd());
	const result = readSiteConfig(file ? readFileSync(file, 'utf8') : null);
	const problems = result.problems.filter((p) => p.kind === 'external');
	if (problems.length > 0) {
		const lines = problems.map((p) => `  - ${p.path}${p.line ? ` (Zeile ${p.line})` : ''}: ${p.message}`);
		throw new Error(`[dealsystem] external in ${SITE_CONFIG_FILE} ist ungültig:\n${lines.join('\n')}`);
	}
	const directives = buildCspDirectives(result.data?.external ?? [], siteApiOrigin());
	return { mode: 'hash', directives: directives as KitCsp['directives'] };
}

export { buildCspDirectives } from '../external/csp.js';
