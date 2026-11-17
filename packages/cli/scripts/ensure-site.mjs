// Die CLI nutzt `@dealsystem/site/config` und `/vite` (Workspace-Paket, Exporte zeigen auf `dist/`).
// npm führt Workspace-Skripte alphabetisch aus, `cli` also vor `site`: fehlt der Build des SDK, wird er hier nachgeholt.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const need = ['config/index.js', 'vite/index.js'].map(
	(f) => new URL(`../../site/dist/${f}`, import.meta.url),
);
if (!need.every((u) => existsSync(u))) {
	console.error('[dealsystem] Baue zuerst @dealsystem/site …');
	execFileSync('npm', ['run', 'build', '-w', '@dealsystem/site'], {
		cwd: new URL('../../..', import.meta.url),
		stdio: 'inherit',
	});
}
