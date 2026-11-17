// STR-*, DEP-*: statischer Build, Projektaufbau, Abhängigkeiten.

import semver from 'semver';
import { DEFAULT_SDK_RANGE } from '../catalog.js';
import { ALTERNATIVES, isAllowedPackage } from '../allowlist.js';
import type { SourceContext } from '../context.js';
import { sourceRule, type SourceRule } from '../rule.js';
import { CONFIG_MODULE, CONTENT_MODULE, SDK_PACKAGE, VITE_MODULE } from '../sdk.js';
import type { RawFinding } from '../types.js';
import { findAll, isSvelteFile } from '../util/code.js';
import { evaluate, isOpaque, isPlainObject, type LiteralValue, type ParsedModule } from '../util/literal.js';

const ROUTES = 'src/routes/';
const SERVER_ENDPOINT = /\/\+server\.(ts|js)$/;
const SERVER_LOAD = /\/\+(page|layout)\.server\.(ts|js)$/;
const CONTENT_IMPORT = /from\s+['"]@dealsystem\/site\/content['"]/g;
/** Die einzigen erlaubten Endpunkte: vorgerenderte Dateien aus dem Starter. */
const ALLOWED_ENDPOINTS = new Set([
	'src/routes/sitemap.xml/+server.ts',
	'src/routes/sitemap.xml/+server.js',
	'src/routes/robots.txt/+server.ts',
	'src/routes/robots.txt/+server.js',
]);

function exportedValue(mod: ParsedModule, name: string): LiteralValue | 'missing' {
	if (!mod.namedExports.has(name)) return 'missing';
	const init = mod.namedExports.get(name);
	return init ? evaluate(mod, init) : undefined;
}

function exportsPrerenderTrue(ctx: SourceContext, path: string): boolean {
	const mod = ctx.module(path);
	return mod !== null && exportedValue(mod, 'prerender') === true;
}

/** `prerender = true` in der Datei selbst oder in einem Layout darüber (SvelteKit vererbt die Option). */
function prerenderedViaLayout(ctx: SourceContext, path: string): boolean {
	if (exportsPrerenderTrue(ctx, path)) return true;
	const dirs = path.split('/').slice(0, -1);
	while (dirs.length >= 2) {
		const dir = dirs.join('/');
		for (const name of ['+layout.ts', '+layout.js', '+layout.server.ts', '+layout.server.js']) {
			const p = `${dir}/${name}`;
			if (p !== path && ctx.files.has(p) && exportsPrerenderTrue(ctx, p)) return true;
		}
		dirs.pop();
		if (dirs.join('/') === 'src') break;
	}
	return false;
}

function lineOfExport(ctx: SourceContext, path: string, name: string): number | null {
	const text = ctx.text(path) ?? '';
	const idx = text.search(new RegExp(`export\\s+(const|let|var|function|async\\s+function)\\s+${name}\\b`));
	return idx >= 0 ? ctx.lines(path).at(idx).line : null;
}

const str001 = sourceRule('STR-001', (ctx) => {
	const path = ctx.svelteConfigPath();
	if (!path) {
		return [
			{
				file: 'svelte.config.js',
				message: 'svelte.config.js fehlt.',
				fix: 'Lege svelte.config.js wie im Starter an, mit `adapter: adapter()` aus `@sveltejs/adapter-static`.',
			},
		];
	}
	const mod = ctx.module(path);
	if (!mod) return [];
	const config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
	const kit = isPlainObject(config) ? config.kit : undefined;
	const adapter = isPlainObject(kit) ? kit.adapter : undefined;
	const adapterModule = isOpaque(adapter) && adapter.call ? mod.imports.get(adapter.call) : undefined;
	if (adapterModule === '@sveltejs/adapter-static') return [];
	const found = adapterModule ? ` Gefunden: \`${adapterModule}\`.` : '';
	return [
		{
			file: path,
			line: isOpaque(adapter) ? adapter.line : null,
			message: `Diese Seite muss statisch gebaut werden.${found}`,
		},
	];
});

const str002 = sourceRule('STR-002', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.paths()) {
		if (path.startsWith(ROUTES) && SERVER_ENDPOINT.test(path)) {
			if (ALLOWED_ENDPOINTS.has(path) && exportsPrerenderTrue(ctx, path)) continue;
			out.push(
				ALLOWED_ENDPOINTS.has(path)
					? {
							file: path,
							message: `\`${path}\` wird nicht vorgerendert.`,
							fix: 'Ergänze `export const prerender = true` in der Datei.',
						}
					: { file: path, message: `\`${path}\` braucht einen Server.` },
			);
		} else if (/^src\/hooks\.server\.(ts|js)$/.test(path)) {
			out.push({ file: path, message: `\`${path}\` braucht einen Server.` });
		} else if (path.startsWith(ROUTES) && /\/\+page\.server\.(ts|js)$/.test(path)) {
			const mod = ctx.module(path);
			if (mod?.namedExports.has('actions')) {
				out.push({
					file: path,
					line: lineOfExport(ctx, path, 'actions'),
					message: `\`${path}\` enthält Form-Actions; die brauchen einen Server.`,
					fix: 'Entferne `export const actions`. Formulare gehen über `<LeadForm>`.',
				});
			}
		}
	}
	return out;
});

const str003 = sourceRule('STR-003', (ctx) => {
	const out: RawFinding[] = ctx
		.paths()
		.filter((p) => p.startsWith(ROUTES) && SERVER_LOAD.test(p))
		.filter((p) => !prerenderedViaLayout(ctx, p))
		.map((p) => ({ file: p, message: `\`${p}\` läuft nur beim Build, wenn die Seite vorgerendert wird.` }));
	// Die Lade-Helfer lesen beim Build eine Datei; im Browser gibt es sie nicht.
	for (const path of ctx.codeFiles()) {
		// Serverseitig beim Build: `+page.server.ts`, `+server.ts`, `*.server.ts` und `$lib/server/`.
		if (
			SERVER_LOAD.test(path) ||
			SERVER_ENDPOINT.test(path) ||
			/\.server\.(ts|js)$/.test(path) ||
			path.startsWith('src/lib/server/')
		)
			continue;
		const mod = isSvelteFile(path) ? null : ctx.module(path);
		const imports = mod
			? mod.importList.filter((i) => i.module === CONTENT_MODULE)
			: findAll(ctx.code(path), CONTENT_IMPORT, ctx.lines(path)).map((m) => ({
					module: CONTENT_MODULE,
					line: m.line,
				}));
		for (const imp of imports) {
			const target = path.replace(/\/\+(page|layout)\.(ts|js)$/, '/+$1.server.$2');
			out.push({
				file: path,
				line: imp.line,
				message: `\`${path}\` importiert \`${CONTENT_MODULE}\`; die Lade-Helfer laufen nur beim Build auf dem Server.`,
				fix:
					target !== path
						? `Benenne die Datei in \`${target}\` um (mit \`export const prerender = true\` dort oder im Layout).`
						: `Lade die Daten in \`+page.server.ts\` (mit \`export const prerender = true\`) und gib sie über \`data\` an die Seite.`,
			});
		}
	}
	return out;
});

const str004 = sourceRule('STR-004', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.paths().filter((p) => p.startsWith(ROUTES) && p.endsWith('/+page.svelte'))) {
		const dir = page.slice(0, -'/+page.svelte'.length);
		const segments = dir.split('/').slice(2);
		if (!segments.some((s) => s.includes('['))) continue;
		const candidates = ['+page.ts', '+page.js', '+page.server.ts', '+page.server.js'].map(
			(n) => `${dir}/${n}`,
		);
		const hasEntries = candidates.some((p) => ctx.files.has(p) && ctx.module(p)?.namedExports.has('entries'));
		if (hasEntries) continue;
		const route = `/${segments.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/')}`;
		out.push({
			file: page,
			message: `Die Route \`${route}\` kann nicht vorgerendert werden: \`entries\` fehlt.`,
			fix: `Exportiere in \`${dir}/+page.server.ts\` \`export const entries = () => collectionEntries('<key>')\` (Import aus \`@dealsystem/site/content\`, dazu \`prerender = true\`).`,
		});
	}
	return out;
});

const str005 = sourceRule('STR-005', (ctx) =>
	ctx
		.siteConfig()
		.problems.filter((p) => p.kind === 'structure')
		.map((p) => ({
			file: 'dealsystem.config.ts',
			line: p.line,
			message: p.message,
			...(p.fix ? { fix: p.fix } : {}),
		})),
);

function dependencyMap(pkg: Record<string, unknown> | null, field: string): Record<string, string> {
	const v = pkg?.[field];
	if (!v || typeof v !== 'object') return {};
	return Object.fromEntries(
		Object.entries(v as Record<string, unknown>).filter(
			(e): e is [string, string] => typeof e[1] === 'string',
		),
	);
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

function lineOfKey(ctx: SourceContext, path: string, key: string): number | null {
	const text = ctx.text(path) ?? '';
	const idx = text.indexOf(`"${key}"`);
	return idx >= 0 ? ctx.lines(path).at(idx).line : null;
}

const str006 = sourceRule('STR-006', (ctx) => {
	const pkg = ctx.json('package.json').data;
	if (!pkg) return [];
	const declared = DEP_FIELDS.some((f) => dependencyMap(pkg, f)[SDK_PACKAGE] !== undefined);
	if (!declared) {
		return [
			{
				file: 'package.json',
				message: `\`${SDK_PACKAGE}\` fehlt in package.json.`,
				fix: `Installiere das SDK: \`npm install ${SDK_PACKAGE}@latest\` und führe \`npx dealsystem sync\` aus.`,
			},
		];
	}
	const version = ctx.sdkVersion();
	if (!version) return []; // STR-007 meldet das fehlende oder unpassende Lockfile.
	const range = ctx.options.sdkRange ?? DEFAULT_SDK_RANGE;
	if (semver.valid(version) && semver.satisfies(version, range, { includePrerelease: true })) return [];
	return [
		{
			file: 'package-lock.json',
			line: lineOfKey(ctx, 'package-lock.json', `node_modules/${SDK_PACKAGE}`),
			message: `\`${SDK_PACKAGE}\` ${version} wird nicht unterstützt (erlaubt: ${range}).`,
		},
	];
});

const str007 = sourceRule('STR-007', (ctx) => {
	const pkg = ctx.json('package.json');
	if (!pkg.data) {
		return [
			{
				file: 'package.json',
				message:
					pkg.error === 'fehlt'
						? 'package.json fehlt.'
						: `package.json ist kein gültiges JSON (${pkg.error}).`,
				fix: 'Stelle package.json aus dem Starter wieder her und führe `npm install` aus.',
			},
		];
	}
	const lock = ctx.json('package-lock.json');
	if (!lock.data) {
		return [
			{
				file: 'package-lock.json',
				message:
					lock.error === 'fehlt'
						? 'package-lock.json fehlt.'
						: `package-lock.json ist kein gültiges JSON (${lock.error}).`,
			},
		];
	}
	const version = lock.data.lockfileVersion;
	if (typeof version !== 'number' || version < 2) {
		return [{ file: 'package-lock.json', message: 'package-lock.json ist zu alt (lockfileVersion < 2).' }];
	}
	const root = (lock.data.packages as Record<string, Record<string, unknown>> | undefined)?.[''] ?? null;
	const out: RawFinding[] = [];
	for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
		const want = dependencyMap(pkg.data, field);
		const have = dependencyMap(root, field);
		const names = [...new Set([...Object.keys(want), ...Object.keys(have)])].sort();
		for (const name of names) {
			if (want[name] === have[name]) continue;
			out.push({
				file: 'package-lock.json',
				message:
					want[name] === undefined
						? `package-lock.json enthält \`${name}\`, package.json nicht.`
						: have[name] === undefined
							? `\`${name}\` steht in package.json, aber nicht in package-lock.json.`
							: `\`${name}\`: package.json verlangt \`${want[name]}\`, package-lock.json hat \`${have[name]}\`.`,
			});
		}
	}
	return out;
});

const dep001 = sourceRule('DEP-001', (ctx) => {
	const pkg = ctx.json('package.json').data;
	if (!pkg) return [];
	const out: RawFinding[] = [];
	for (const field of DEP_FIELDS) {
		for (const name of Object.keys(dependencyMap(pkg, field)).sort()) {
			if (isAllowedPackage(name)) continue;
			const alt = ALTERNATIVES[name];
			out.push({
				file: 'package.json',
				line: lineOfKey(ctx, 'package.json', name),
				message: `Das Paket \`${name}\` ist nicht freigegeben.`,
				fix: alt
					? `Entferne es mit \`npm uninstall ${name}\` und nutze ${alt}. Freigegebene Pakete: \`npx dealsystem check --allowed\`.`
					: `Entferne es mit \`npm uninstall ${name}\`. Freigegebene Pakete: \`npx dealsystem check --allowed\`.`,
			});
		}
	}
	return out;
});

const REGISTRY = 'https://registry.npmjs.org/';
const NON_REGISTRY_SPEC =
	/^(git\+|git:|github:|gitlab:|bitbucket:|gist:|https?:|file:|link:|workspace:|npm:|\.{0,2}\/)/;

const dep002 = sourceRule('DEP-002', (ctx) => {
	const out: RawFinding[] = [];
	const pkg = ctx.json('package.json').data;
	for (const field of DEP_FIELDS) {
		for (const [name, spec] of Object.entries(dependencyMap(pkg, field))) {
			// `user/repo` ist die Kurzform für GitHub.
			if (NON_REGISTRY_SPEC.test(spec) || /^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec)) {
				out.push({
					file: 'package.json',
					line: lineOfKey(ctx, 'package.json', name),
					message: `\`${name}\` kommt nicht aus der npm-Registry (\`${spec.slice(0, 80)}\`).`,
					fix: `Installiere die veröffentlichte Version: \`npm install ${name}@latest\`.`,
				});
			}
		}
	}
	const lock = ctx.json('package-lock.json').data;
	const packages = (lock?.packages as Record<string, Record<string, unknown>> | undefined) ?? {};
	for (const [key, entry] of Object.entries(packages)) {
		if (!key.startsWith('node_modules/')) continue;
		const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
		const resolved = typeof entry.resolved === 'string' ? entry.resolved : null;
		const bad =
			entry.link === true ||
			(resolved !== null && !resolved.startsWith(REGISTRY)) ||
			(typeof entry.version === 'string' && NON_REGISTRY_SPEC.test(entry.version));
		if (!bad) continue;
		out.push({
			file: 'package-lock.json',
			line: lineOfKey(ctx, 'package-lock.json', key),
			message: `\`${name}\` kommt nicht aus der npm-Registry (\`${(resolved ?? String(entry.version ?? 'link')).slice(0, 80)}\`).`,
			fix: `Installiere die veröffentlichte Version: \`npm install ${name}@latest\`, dann erneut \`npm install\`.`,
		});
	}
	return out;
});

function kitSection(ctx: SourceContext): { path: string; mod: ParsedModule; kit: LiteralValue } | null {
	const path = ctx.svelteConfigPath();
	const mod = path ? ctx.module(path) : null;
	if (!path || !mod) return null;
	const config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
	return { path, mod, kit: isPlainObject(config) ? config.kit : undefined };
}

const str008 = sourceRule('STR-008', (ctx) => {
	const section = kitSection(ctx);
	if (!section) return []; // STR-001 meldet die fehlende Datei.
	const prerender = isPlainObject(section.kit) ? section.kit.prerender : undefined;
	const handler = isPlainObject(prerender) ? prerender.handleHttpError : undefined;
	if (isOpaque(handler) && !handler.call && section.mod.imports.get(handler.text) === CONFIG_MODULE)
		return [];
	return [
		{
			file: section.path,
			line: isOpaque(handler) ? handler.line : null,
			message: `In svelte.config.js fehlt \`kit.prerender.handleHttpError\` aus \`${CONFIG_MODULE}\`; ohne sie scheitert der Build an Bildern unter \`/_ds/media/\`.`,
		},
	];
});

const str009 = sourceRule('STR-009', (ctx) => {
	const path = ['vite.config.ts', 'vite.config.js'].find((p) => ctx.files.has(p));
	if (!path) return [{ file: 'vite.config.ts', message: 'vite.config.ts fehlt.' }];
	const mod = ctx.module(path);
	if (!mod) return [];
	let config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
	if (isOpaque(config) && config.call === 'defineConfig' && config.args?.length === 1)
		config = config.args[0];
	const plugins = isPlainObject(config) && Array.isArray(config.plugins) ? config.plugins : [];
	const index = (module: string): number =>
		plugins.findIndex((p) => isOpaque(p) && p.call !== undefined && mod.imports.get(p.call) === module);
	const ds = index(VITE_MODULE);
	const kit = index('@sveltejs/kit/vite');
	if (ds >= 0 && (kit < 0 || ds < kit)) return [];
	return [
		{
			file: path,
			message:
				ds < 0
					? `In ${path} fehlt das Plugin \`dealsystem(site)\` aus \`${VITE_MODULE}\`.`
					: `In ${path} steht \`dealsystem(site)\` hinter \`sveltekit()\`.`,
		},
	];
});

export const structureRules: SourceRule[] = [
	str001,
	str002,
	str003,
	str004,
	str005,
	str008,
	str009,
	str006,
	str007,
	dep001,
	dep002,
];
