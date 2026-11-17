// SEC-*: Secrets, private Umgebungsvariablen, {@html}, API-Zugriffe, CSP, eval, eigene Formulare.

import type { OutputContext, SourceContext } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import type { RawFinding } from '../types.js';
import { excerpt, findAll, isSvelteFile } from '../util/code.js';
import { evaluate, isOpaque, isPlainObject, type LiteralValue } from '../util/literal.js';

// ------------------------------------------------------------------ SEC-001

/** Erkennungsmuster für Zugangsschlüssel (Teilmenge dessen, was gitleaks auf dem Build-Host prüft). */
export const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
	{ name: 'DealSystem-API-Schlüssel', pattern: /\bdm_live_[0-9a-zA-Z]{16,}/g },
	{ name: 'DealSystem-Admin-Schlüssel', pattern: /\bdm_admin_[0-9a-zA-Z]{8,}/g },
	{ name: 'DealSystem-Client-Secret', pattern: /\bdm_cs_[0-9a-zA-Z]{8,}/g },
	{ name: 'DealSystem-Seiten-Schlüssel', pattern: /\bdms_site_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{16,}/g },
	{ name: 'privater Schlüssel', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
	{ name: 'AWS-Zugangsschlüssel', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
	{ name: 'Stripe-Schlüssel', pattern: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/g },
	{ name: 'GitHub-Token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g },
	{ name: 'Slack-Token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
	{ name: 'Google-API-Schlüssel', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{
		name: 'OpenAI-Schlüssel',
		pattern: /\bsk-(?:proj-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20})/g,
	},
	{ name: 'Anthropic-Schlüssel', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
	{ name: 'SendGrid-Schlüssel', pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
	{ name: 'Mailchimp-Schlüssel', pattern: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g },
];

function mask(secret: string): string {
	return `${secret.slice(0, Math.min(10, Math.floor(secret.length / 2)))}…`;
}

function scanSecrets(ctx: SourceContext | OutputContext, paths: string[]): RawFinding[] {
	const out: RawFinding[] = [];
	for (const path of paths) {
		const text = ctx.text(path);
		if (!text) continue;
		for (const { name, pattern } of SECRET_PATTERNS) {
			for (const m of findAll(text, pattern, ctx.lines(path))) {
				out.push({
					file: path,
					line: m.line,
					column: m.column,
					message: `In \`${path}:${m.line}\` steht ein Zugangsschlüssel (${name}, \`${mask(m.text)}\`).`,
				});
			}
		}
	}
	return out;
}

const sec001Source = sourceRule('SEC-001', (ctx) =>
	// Das Lockfile enthält nur Prüfsummen; Registry-Herkunft prüft DEP-002.
	scanSecrets(
		ctx,
		ctx.textFiles((p) => p !== 'package-lock.json', true),
	),
);

const sec001Output = outputRule('SEC-001', (ctx) =>
	scanSecrets(
		ctx,
		ctx.textFiles(() => true, true),
	),
);

// ------------------------------------------------------------------ SEC-002

const PRIVATE_ENV = /\$env\/(?:static|dynamic)\/private/g;

const sec002 = sourceRule('SEC-002', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.paths()) {
		const base = path.split('/').pop() ?? '';
		if (base.startsWith('.env') && base !== '.env.example') {
			out.push({
				file: path,
				message: `\`${path}\` darf nicht hochgeladen werden.`,
				fix: 'Lösche die Datei. Eine statische Seite braucht keine Umgebungsvariablen mit Secrets.',
			});
		}
	}
	for (const path of ctx.codeFiles()) {
		for (const m of findAll(ctx.code(path), PRIVATE_ENV, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` importiert \`${m.text}\`.`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-003

const sec003 = sourceRule('SEC-003', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		const ast = ctx.svelte(path);
		for (const tag of ast?.htmlTags ?? []) {
			out.push(
				ctx.at(
					path,
					tag.start,
					`\`{@html …}\` in \`${path}\` ist nicht erlaubt (Gefahr von Cross-Site-Scripting).`,
				),
			);
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-004

const API_PATH = /['"`][^'"`\n]*\/api\/(?:site|v1|internal)\/[^'"`\n]*['"`]?/g;

const sec004 = sourceRule('SEC-004', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.codeFiles()) {
		for (const m of findAll(ctx.code(path), API_PATH, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` spricht die DealSystem-API direkt an (\`${excerpt(m.text, 60)}\`).`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-005

// SvelteKit schreibt Schlüsselwörter ohne Anführungszeichen (`'self'` → `['self']`); beide Formen zählen.
const LOOSE_SCRIPT_SOURCES = ['unsafe-inline', 'unsafe-hashes', '*', 'data:', 'http:', 'https:', 'blob:'];
const unquote = (v: string): string => v.trim().replace(/^'(.*)'$/, '$1');

/**
 * Fremde Hosts, die die CSP nennen darf: nur hinter der Einwilligung (über `<Tracking>`) Google Tag und Meta Pixel,
 * dazu die Site-API von DealSystem. Das Captcha (ALTCHA) ist im SDK gebündelt und braucht keinen fremden Host.

 */
export const CSP_ALLOWED_HOSTS: readonly string[] = [
	'app.dealsystem.io',
	'*.dealsystem.io',
	'www.googletagmanager.com',
	'*.google-analytics.com',
	'*.analytics.google.com',
	'connect.facebook.net',
	'www.facebook.com',
];
const HOST_CHECKED_DIRECTIVES = [
	'default-src',
	'script-src',
	'connect-src',
	'frame-src',
	'img-src',
	'style-src',
	'font-src',
];

function cspHost(source: string): string | null {
	const m = /^(?:https:\/\/)?((?:\*\.)?[a-z0-9.-]+\.[a-z]{2,})(?::\d+)?(?:\/.*)?$/i.exec(source);
	return m?.[1]?.toLowerCase() ?? null;
}

function isAllowedCspHost(host: string): boolean {
	// `*.x` deckt `a.x` und `*.x`, nicht aber `x` selbst.
	return CSP_ALLOWED_HOSTS.some((h) => h === host || (h.startsWith('*.') && host.endsWith(h.slice(1))));
}

const sec005 = sourceRule('SEC-005', (ctx) => {
	const path = ctx.svelteConfigPath();
	if (!path) return []; // STR-001 meldet die fehlende Datei.
	const mod = ctx.module(path);
	if (!mod) return [];
	const config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
	const kit = isPlainObject(config) ? config.kit : undefined;
	const csp = isPlainObject(kit) ? kit.csp : undefined;
	const problem = (message: string, line?: number | null): RawFinding[] => [
		{ file: path, line: line ?? null, message },
	];
	if (!isPlainObject(csp)) return problem('In svelte.config.js fehlt `kit.csp` (Content-Security-Policy).');
	if (csp.mode !== 'hash') {
		return problem(
			`\`kit.csp.mode\` muss \`'hash'\` sein, ist \`${isOpaque(csp.mode) ? csp.mode.text : String(csp.mode)}\`.`,
		);
	}
	const directives = csp.directives;
	if (!isPlainObject(directives)) return problem('`kit.csp.directives` fehlt oder ist kein festes Objekt.');
	const list = (v: LiteralValue): string[] | null =>
		Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]).map(unquote) : null;
	const out: RawFinding[] = [];
	for (const [name, value] of Object.entries(directives)) {
		const values = list(value);
		if (values === null) {
			out.push({ file: path, message: `\`kit.csp.directives['${name}']\` muss eine feste Liste sein.` });
			continue;
		}
		if (values.includes('unsafe-eval') || values.includes('wasm-unsafe-eval')) {
			out.push({ file: path, message: `\`${name}\` erlaubt \`unsafe-eval\`.` });
		}
		if (!HOST_CHECKED_DIRECTIVES.includes(name)) continue;
		for (const source of values) {
			const host = cspHost(source);
			if (host && !isAllowedCspHost(host)) {
				out.push({
					file: path,
					message: `\`${name}\` erlaubt den fremden Host \`${source}\`.`,
					fix: 'Entferne den Host. Erlaubt sind nur Google Tag und Meta Pixel (über `<Tracking>` hinter `<ConsentGate>`) und die DealSystem-API. Schriften, Bilder und Skripte gehören lokal ins Projekt.',
				});
			}
		}
	}
	const scriptKey = directives['script-src'] !== undefined ? 'script-src' : 'default-src';
	const script = list(directives[scriptKey] ?? null);
	if (!script) {
		out.push({ file: path, message: 'In `kit.csp.directives` fehlt `script-src`.' });
	} else {
		for (const loose of LOOSE_SCRIPT_SOURCES) {
			if (script.includes(loose)) {
				out.push({ file: path, message: `\`${scriptKey}\` ist gelockert: \`${loose}\`.` });
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-006

const DYNAMIC_CODE: readonly { pattern: RegExp; label: string }[] = [
	{ pattern: /\beval\s*\(/g, label: 'eval()' },
	{ pattern: /\bnew\s+Function\s*\(/g, label: 'new Function()' },
	{ pattern: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/g, label: 'setTimeout/setInterval mit Zeichenkette' },
	{ pattern: /\.setAttribute\s*\(\s*['"`]on[a-z]+['"`]/g, label: 'Event-Handler als Attribut' },
];
const INLINE_HANDLER_HTML = /<[a-z][^>]*\son[a-z]+\s*=\s*["'][^"']*["']/gi;

const sec006 = sourceRule('SEC-006', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.codeFiles()) {
		for (const { pattern, label } of DYNAMIC_CODE) {
			for (const m of findAll(ctx.code(path), pattern, ctx.lines(path))) {
				out.push({ file: path, line: m.line, column: m.column, message: `\`${path}\` nutzt ${label}.` });
			}
		}
		if (isSvelteFile(path)) {
			for (const el of ctx.svelte(path)?.elements ?? []) {
				if (el.kind !== 'element') continue;
				for (const attr of el.attributes) {
					if (attr.kind === 'attribute' && /^on[a-z]+$/.test(attr.name) && typeof attr.value === 'string') {
						out.push(
							ctx.at(
								path,
								attr.start,
								`\`<${el.name} ${attr.name}="…">\` ist ein Inline-Event-Handler als Zeichenkette.`,
								`Schreibe \`${attr.name}={() => …}\` statt einer Zeichenkette.`,
							),
						);
					}
				}
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		for (const m of findAll(ctx.code(path), INLINE_HANDLER_HTML, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` enthält einen Inline-Event-Handler.`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-007

const sec007 = sourceRule('SEC-007', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (el.kind === 'element' && el.name === 'form') {
				out.push(ctx.at(path, el.start, `\`${path}\` enthält ein eigenes \`<form>\`.`));
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		for (const m of findAll(ctx.code(path), /<form\b/gi, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` enthält ein eigenes \`<form>\`.`,
			});
		}
	}
	return out;
});

export const securitySourceRules: SourceRule[] = [
	sec001Source,
	sec002,
	sec003,
	sec004,
	sec005,
	sec006,
	sec007,
];
export const securityOutputRules: OutputRule[] = [sec001Output];
