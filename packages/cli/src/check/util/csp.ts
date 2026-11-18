// Content-Security-Policy für die Regeln: Form in svelte.config.js erkennen, erwartete CSP berechnen, Quellen
// gegen Adressen abgleichen, Meta-Tag der Ausgabe gegen die erwartete CSP vergleichen.

import { buildCspDirectives, parseHostSource, type ResolvedExternal } from '@dealsystem/site/config';
import type { SourceContext } from '../context.js';
import { CONFIG_MODULE, CSP_MODULE, DEALSYSTEM_CSP_FN, SITE_API_ORIGIN_FN } from '../sdk.js';
import type { Severity } from '../types.js';
import {
	evaluate,
	isOpaque,
	isPlainObject,
	type LiteralValue,
	type Opaque,
	type ParsedModule,
} from './literal.js';

export type Csp = Record<string, string[]>;

/** Platzhalter für die Adresse der Site-API in einer Quellenliste: erst beim Build bekannt. */
export const SITE_API_SOURCE = '<site-api>';

/** SvelteKit schreibt Schlüsselwörter ohne Anführungszeichen (`'self'` → `['self']`); beide Formen zählen. */
export const unquote = (v: string): string => v.trim().replace(/^'(.*)'$/, '$1');

/**
 * Wie `kit.csp` in svelte.config.js steht:
 * - `dealsystem`: `csp: dealsystemCsp()` aus `@dealsystem/site/csp` (Regelsatz 3, Starter ab SDK 0.2)
 * - `legacy`: feste Liste wie im Starter bis SDK 0.1
 * - `other`: etwas anderes (fehlt, anderer Aufruf, Variable)
 */
export type CspForm =
	| { kind: 'dealsystem'; path: string; mod: ParsedModule; call: Opaque }
	| { kind: 'legacy'; path: string; mod: ParsedModule; csp: { [key: string]: LiteralValue } }
	| { kind: 'other'; path: string; mod: ParsedModule; csp: LiteralValue }
	| null;

const forms = new WeakMap<SourceContext, CspForm>();

export function cspForm(ctx: SourceContext): CspForm {
	if (forms.has(ctx)) return forms.get(ctx)!;
	let form: CspForm = null;
	const path = ctx.svelteConfigPath();
	const mod = path ? ctx.module(path) : null;
	if (path && mod) {
		const config = mod.defaultExport ? evaluate(mod, mod.defaultExport) : undefined;
		const kit = isPlainObject(config) ? config.kit : undefined;
		const csp = isPlainObject(kit) ? kit.csp : undefined;
		if (isOpaque(csp) && csp.call === DEALSYSTEM_CSP_FN) form = { kind: 'dealsystem', path, mod, call: csp };
		else if (isPlainObject(csp)) form = { kind: 'legacy', path, mod, csp };
		else form = { kind: 'other', path, mod, csp };
	}
	forms.set(ctx, form);
	return form;
}

/** Ob `dealsystemCsp()` richtig importiert und ohne Argumente aufgerufen ist. */
export function isValidDealsystemCall(form: CspForm): boolean {
	return (
		form?.kind === 'dealsystem' &&
		(form.call.args?.length ?? 0) === 0 &&
		form.mod.imports.get(DEALSYSTEM_CSP_FN) === CSP_MODULE
	);
}

/**
 * Schweregrad für Verschärfungen in Regelsatz 3: Fehler für Seiten mit `dealsystemCsp()` (neues SDK), Warnung
 * für die Altform. So baut eine unveränderte Live-Seite weiter (Konzept Phase 2, Abschnitt 3).
 */
export function tighteningSeverity(ctx: SourceContext): Severity {
	return cspForm(ctx)?.kind === 'dealsystem' ? 'error' : 'warning';
}

/** Fremde Dienste aus dealsystem.config.ts, statisch gelesen. Nur gültige Einträge. */
export function declaredExternal(ctx: SourceContext): ResolvedExternal[] {
	return ctx.siteConfig().data?.external ?? [];
}

/**
 * Quellenliste einer CSP-Direktive. Erlaubt sind feste Zeichenketten und `siteApiOrigin()` aus
 * `@dealsystem/site/config`; alles andere ergibt `null`.
 */
export function cspSourceList(mod: ParsedModule, value: LiteralValue): string[] | null {
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

/**
 * CSP, wie sie beim Build entsteht: bei `dealsystemCsp()` aus Basis und Deklaration, bei der Altform aus den
 * festen Listen. `null`, wenn sie sich nicht lesen lässt (SEC-005 meldet das).
 */
export function sourceCsp(
	ctx: SourceContext,
): { path: string; csp: Csp; kind: 'dealsystem' | 'legacy' } | null {
	const form = cspForm(ctx);
	if (!form) return null;
	if (form.kind === 'dealsystem') {
		return {
			path: form.path,
			csp: buildCspDirectives(declaredExternal(ctx), SITE_API_SOURCE),
			kind: 'dealsystem',
		};
	}
	if (form.kind !== 'legacy' || !isPlainObject(form.csp.directives)) return null;
	const csp: Csp = {};
	for (const [name, value] of Object.entries(form.csp.directives)) {
		const sources = cspSourceList(form.mod, value);
		if (sources) csp[name] = sources;
	}
	return { path: form.path, csp, kind: 'legacy' };
}

/** Ob eine Host-Quelle (`https://a.de`, `*.a.de`, `http://localhost:5173`) zu `url` passt. */
export function hostSourceMatches(source: string, url: URL): boolean {
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
export function cspAllows(csp: Csp, directive: string, url: URL): boolean {
	const sources = csp[directive] ?? csp['default-src'];
	if (!sources) return true;
	return sources.some((raw) => {
		const source = unquote(raw).toLowerCase();
		if (source === SITE_API_SOURCE) return false;
		return source === '*' || source === url.protocol || hostSourceMatches(source, url);
	});
}

/** CSP aus dem `<meta http-equiv="content-security-policy">` einer fertigen Seite. */
export function metaCsp(content: string): Csp {
	const csp: Csp = {};
	for (const part of content.split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/);
		if (name) csp[name.toLowerCase()] = sources;
	}
	return csp;
}

/** Fetch-Direktiven, deren Quellen die Seite einschränken. */
const FETCH_DIRECTIVES = [
	'default-src',
	'script-src',
	'script-src-elem',
	'script-src-attr',
	'style-src',
	'style-src-elem',
	'style-src-attr',
	'img-src',
	'font-src',
	'connect-src',
	'frame-src',
	'child-src',
	'media-src',
	'worker-src',
	'object-src',
	'manifest-src',
];
/** Weitere Direktiven, die nicht lockerer sein dürfen als erwartet. Fehlen sie, gilt nichts. */
const NAVIGATION_DIRECTIVES = ['base-uri', 'form-action'];
/** Direktiven, die die Seite gar nicht setzen darf: Berichte gingen an fremde Hosts. */
const FORBIDDEN_DIRECTIVES = ['report-uri', 'report-to'];

/** Welche Quellen wirklich gelten (CSP-Rückfall-Kette). `undefined` = keine Einschränkung. */
function effective(csp: Csp, directive: string): string[] | undefined {
	const chain: Record<string, string[]> = {
		'script-src-elem': ['script-src', 'default-src'],
		'script-src-attr': ['script-src', 'default-src'],
		'style-src-elem': ['style-src', 'default-src'],
		'style-src-attr': ['style-src', 'default-src'],
		'worker-src': ['child-src', 'script-src', 'default-src'],
		'frame-src': ['child-src', 'default-src'],
		'default-src': [],
	};
	if (csp[directive]) return csp[directive];
	for (const next of chain[directive] ?? ['default-src']) if (csp[next]) return csp[next];
	return undefined;
}

const DEALSYSTEM_API = /^https:\/\/(?:[a-z0-9-]+\.)*dealsystem\.io$/;
const LOCAL_API = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

/**
 * Was am Meta-Tag einer fertigen Seite lockerer ist als die erwartete CSP. Strenger ist erlaubt (dann bleibt nur
 * etwas auf der eigenen Seite leer, das melden die Einbettungs-Prüfungen). `apiOrigin`: Adresse der Site-API, für
 * die gebaut wurde; ohne Angabe gilt jede Adresse von DealSystem und ein lokaler Entwicklungsserver.
 */
export function cspLooserThan(
	meta: Csp,
	expected: Csp,
	apiOrigin: string | null,
	/** Fehlende Direktiven melden (`default-src`, `base-uri`, `form-action`). Nur, wenn die Deklaration bekannt ist. */
	requireAll = true,
): string[] {
	const problems: string[] = [];
	for (const name of FORBIDDEN_DIRECTIVES) {
		if (meta[name])
			problems.push(`\`${name}\` ist gesetzt (Berichte gingen an \`${meta[name]!.join(' ')}\`).`);
	}
	const norm = (s: string) => unquote(s).toLowerCase();
	const allowedIn = (directive: string, source: string): boolean => {
		const s = norm(source);
		if (s === 'none') return true;
		// SvelteKit trägt die Prüfsummen seiner eigenen Inline-Skripte und -Styles ein.
		if (/^(?:sha256|sha384|sha512)-[A-Za-z0-9+/=_-]+$/i.test(s) && /^(?:script|style)-src/.test(directive))
			return true;
		const list = (effective(expected, directive) ?? []).map(norm);
		if (list.includes(s)) return true;
		// Site-API: jede Adresse von DealSystem (eigene Domain, kein fremder Empfänger); ein lokaler Server nur,
		// wenn die Seite für ihn gebaut wurde oder die Adresse unbekannt ist.
		if (directive === 'connect-src' || directive === 'default-src') {
			if (DEALSYSTEM_API.test(s)) return true;
			if (LOCAL_API.test(s) && (!apiOrigin || LOCAL_API.test(apiOrigin.toLowerCase()))) return true;
		}
		const host = parseHostSource(s);
		return list.some((e) => {
			const wanted = parseHostSource(e);
			return Boolean(wanted?.wildcard && host && host.host.endsWith(`.${wanted.host}`));
		});
	};
	for (const name of [...FETCH_DIRECTIVES, ...NAVIGATION_DIRECTIVES]) {
		// Ohne bekannte Deklaration nur, was der Meta-Tag selbst setzt (eine knappe, ältere CSP bleibt still).
		const sources = FETCH_DIRECTIVES.includes(name) && requireAll ? effective(meta, name) : meta[name];
		if (sources === undefined) {
			if (requireAll && (name === 'default-src' || NAVIGATION_DIRECTIVES.includes(name)))
				problems.push(`\`${name}\` fehlt, damit gilt dafür keine Einschränkung.`);
			continue;
		}
		if (!FETCH_DIRECTIVES.includes(name) && !meta[name]) continue;
		const looser = sources.filter((s) => !allowedIn(name, s));
		if (looser.length > 0) {
			problems.push(`\`${name}\` erlaubt zusätzlich \`${looser.join(' ')}\`.`);
		}
	}
	return [...new Set(problems)];
}
