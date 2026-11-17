// SEC-*: Secrets, private Umgebungsvariablen, {@html}, API-Zugriffe, CSP, eval, eigene Formulare, Einbettungen.

import type { OutputContext, SourceContext } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import type { RawFinding } from '../types.js';
import { excerpt, findAll, isSvelteFile } from '../util/code.js';
import { COMPONENT, CONFIG_MODULE, SDK_PACKAGE, SITE_API_ORIGIN_FN } from '../sdk.js';
import { lineOf } from '../util/html.js';
import { evaluate, isOpaque, isPlainObject, type LiteralValue, type ParsedModule } from '../util/literal.js';

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
	// Karte über `<MapEmbed>` aus dem SDK, nur nach Einwilligung.
	'www.openstreetmap.org',
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

/** Platzhalter für `siteApiOrigin()` in einer Quellenliste: die Adresse der Site-API, erst beim Build bekannt. */
const SITE_API_SOURCE = '<site-api>';

/**
 * Quellenliste einer CSP-Direktive. Erlaubt sind feste Zeichenketten und der Aufruf `siteApiOrigin()` aus
 * `@dealsystem/site/config`; alles andere (Variablen, andere Aufrufe) ergibt `null`.
 */
function cspSourceList(mod: ParsedModule, value: LiteralValue): string[] | null {
	if (!Array.isArray(value)) return null;
	const out: string[] = [];
	for (const item of value) {
		if (typeof item === 'string') out.push(item);
		else if (
			isOpaque(item) &&
			item.call === SITE_API_ORIGIN_FN &&
			(item.args?.length ?? 0) === 0 &&
			mod.imports.get(item.call) === CONFIG_MODULE
		)
			out.push(SITE_API_SOURCE);
		else return null;
	}
	return out;
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
	const list = (v: LiteralValue): string[] | null => cspSourceList(mod, v)?.map(unquote) ?? null;
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

// ------------------------------------------------------------------ SEC-008

/** Herkunft der Karte, die `<MapEmbed>` aus dem SDK einbettet. Muss zu packages/site passen. */
export const MAP_EMBED_ORIGIN = 'https://www.openstreetmap.org';

/** Welche CSP-Direktive über das Laden eines Elements entscheidet. */
const EMBED_DIRECTIVE: Readonly<Record<string, string>> = {
	iframe: 'frame-src',
	frame: 'frame-src',
	embed: 'frame-src',
	object: 'frame-src',
	script: 'script-src',
};

type Csp = Record<string, string[]>;

function externalUrl(value: string | null | undefined): URL | null {
	if (!value) return null;
	const v = value.trim();
	if (!/^(https?:)?\/\//i.test(v)) return null;
	try {
		return new URL(v.startsWith('//') ? `https:${v}` : v);
	} catch {
		return null;
	}
}

/** Ob eine Host-Quelle der CSP (`https://a.de`, `*.a.de`, `http://localhost:5173`) zu `url` passt. */
function hostSourceMatches(source: string, url: URL): boolean {
	const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?(?:\/.*)?$/i.exec(source);
	if (!m) return false;
	const [, scheme, wildcard, host, port] = m;
	if (scheme && `${scheme.toLowerCase()}:` !== url.protocol) return false;
	const name = url.hostname.toLowerCase();
	const wanted = host!.toLowerCase();
	if (wildcard ? !name.endsWith(`.${wanted}`) : name !== wanted) return false;
	if (port === undefined || port === '*') return port === '*' || url.port === '';
	return port === (url.port || (url.protocol === 'https:' ? '443' : '80'));
}

/** Ob die Direktive (sonst `default-src`) das Laden von `url` erlaubt. Ohne beide Direktiven ist alles erlaubt. */
function cspAllows(csp: Csp, directive: string, url: URL): boolean {
	const sources = csp[directive] ?? csp['default-src'];
	if (!sources) return true;
	return sources.some((raw) => {
		const source = unquote(raw).toLowerCase();
		return source === '*' || source === url.protocol || hostSourceMatches(source, url);
	});
}

function blockedMessage(tag: string, url: URL, directive: string): string {
	return (
		`\`<${tag}>\` lädt \`${excerpt(url.href, 80)}\`, aber die Sicherheitsregeln der Seite (\`${directive}\`) ` +
		`erlauben \`${url.host}\` nicht. Der Browser blockiert den Inhalt, auch nach der Einwilligung.`
	);
}

function blockedFix(tag: string): string {
	return tag === 'script'
		? 'Entferne das Skript. Fremde Skripte lassen sich auf dieser Seite nicht einbinden; Tracking läuft über `<Tracking />`. Lockere nicht die Regeln in svelte.config.js.'
		: 'Für eine Karte nutze `<MapEmbed lat={…} lon={…} title="…" />` aus `@dealsystem/site` (OpenStreetMap). Jeden anderen fremden Inhalt ersetzt du durch einen gewöhnlichen Link `<a href="…">` zum Anbieter und sagst dem Kunden, dass sich dieser Dienst hier nicht einbetten lässt. Lockere nicht die Regeln in svelte.config.js.';
}

/** `kit.csp.directives` aus svelte.config.js, soweit sie als feste Listen dastehen. */
function sourceCsp(ctx: SourceContext): { path: string; csp: Csp } | null {
	const path = ctx.svelteConfigPath();
	const mod = path ? ctx.module(path) : null;
	if (!path || !mod) return null;
	const config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
	const kit = isPlainObject(config) ? config.kit : undefined;
	const directives = isPlainObject(kit) && isPlainObject(kit.csp) ? kit.csp.directives : undefined;
	if (!isPlainObject(directives)) return null;
	const csp: Csp = {};
	for (const [name, value] of Object.entries(directives)) {
		const sources = cspSourceList(mod, value);
		if (sources) csp[name] = sources;
	}
	return { path, csp };
}

const sec008Source = sourceRule('SEC-008', (ctx) => {
	const found = sourceCsp(ctx);
	if (!found) return []; // SEC-005 meldet die fehlende oder unlesbare CSP.
	const out: RawFinding[] = [];
	// Formular und Captcha sprechen die Site-API an. Welche Adresse das ist, steht erst beim Build fest
	// (PUBLIC_DEALSYSTEM_API): Eine fest eingetragene Adresse passt nur für eine Umgebung.
	const connect = found.csp['connect-src'] ?? found.csp['default-src'];
	if (connect && !connect.includes(SITE_API_SOURCE) && !connect.some((s) => unquote(s) === '*')) {
		out.push({
			file: found.path,
			message:
				'`connect-src` in svelte.config.js nennt die Adresse der Site-API nicht über `siteApiOrigin()`. Wird die Seite für eine andere Umgebung erzeugt, blockiert der Browser Formular und Captcha.',
			fix: "Schreibe in `kit.csp.directives`: `'connect-src': ['self', siteApiOrigin(), …]` mit `import { siteApiOrigin } from '@dealsystem/site/config'`, oder führe `npx dealsystem sync --fix-config` aus.",
		});
	}
	for (const path of ctx.svelteFiles()) {
		const ast = ctx.svelte(path);
		if (!ast) continue;
		const usesSdk = ctx.code(path).includes(SDK_PACKAGE);
		for (const el of ast.elements) {
			if (el.kind === 'component') {
				// `<MapEmbed>` bettet OpenStreetMap ein: Die Vorlage der CSP erlaubt das, eine ältere oder veränderte nicht.
				if (
					usesSdk &&
					el.name === COMPONENT.map &&
					!cspAllows(found.csp, 'frame-src', new URL(MAP_EMBED_ORIGIN))
				) {
					out.push(
						ctx.at(
							path,
							el.start,
							`\`<${COMPONENT.map}>\` bettet eine Karte von \`${MAP_EMBED_ORIGIN}\` ein, aber \`frame-src\` in svelte.config.js erlaubt das nicht. Die Karte bliebe leer.`,
							'Führe `npx dealsystem sync --fix-config` aus: Die Vorlage von svelte.config.js erlaubt die Karte.',
						),
					);
				}
				continue;
			}
			const tag = el.name.toLowerCase();
			const directive = EMBED_DIRECTIVE[tag];
			if (!directive) continue;
			const attr = el.attributes.find(
				(a) => a.kind === 'attribute' && a.name.toLowerCase() === (tag === 'object' ? 'data' : 'src'),
			);
			const url = externalUrl(typeof attr?.value === 'string' ? attr.value : null);
			if (url && !cspAllows(found.csp, directive, url)) {
				out.push(ctx.at(path, el.start, blockedMessage(tag, url, directive), blockedFix(tag)));
			}
		}
	}
	return out;
});

/** CSP aus dem `<meta http-equiv="content-security-policy">` einer fertigen Seite. */
function metaCsp(content: string): Csp {
	const csp: Csp = {};
	for (const part of content.split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (name) csp[name.toLowerCase()] = sources;
	}
	return csp;
}

const sec008Output = outputRule('SEC-008', (ctx) => {
	const out: RawFinding[] = [];
	const api = externalUrl(ctx.options.apiUrl);
	let apiReported = false;
	for (const path of ctx.pages()) {
		const doc = ctx.html(path);
		const meta = doc.elements.find(
			(el) => el.tag === 'meta' && el.attrs['http-equiv']?.toLowerCase() === 'content-security-policy',
		);
		if (!meta?.attrs.content) continue;
		const csp = metaCsp(meta.attrs.content);
		// Die Seite schickt Formular und Captcha an die Site-API: Die CSP der fertigen Seite muss sie erlauben.
		if (api && !apiReported && !cspAllows(csp, 'connect-src', api)) {
			apiReported = true;
			out.push({
				file: path,
				line: lineOf(doc, meta),
				message: `Die Sicherheitsregeln der fertigen Seite (\`connect-src\`) erlauben die Site-API \`${api.origin}\` nicht. Der Browser blockiert Formular und Captcha.`,
				fix: "Schreibe in svelte.config.js `'connect-src': ['self', siteApiOrigin(), …]` (`npx dealsystem sync --fix-config`) und erzeuge die Seite neu, mit derselben `PUBLIC_DEALSYSTEM_API` wie beim Hochladen.",
			});
		}
		for (const el of doc.elements) {
			const directive = EMBED_DIRECTIVE[el.tag];
			if (!directive) continue;
			const url = externalUrl(el.attrs[el.tag === 'object' ? 'data' : 'src']);
			if (url && !cspAllows(csp, directive, url)) {
				out.push({
					file: path,
					line: lineOf(doc, el),
					message: blockedMessage(el.tag, url, directive),
					fix: blockedFix(el.tag),
				});
			}
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
	sec008Source,
];
export const securityOutputRules: OutputRule[] = [sec001Output, sec008Output];
