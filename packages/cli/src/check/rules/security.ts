// SEC-*: Secrets, private Umgebungsvariablen, {@html}, API-Zugriffe, CSP, eval, eigene Formulare, Einbettungen.

import ts from 'typescript';
import { routeOfSource, type OutputContext, type SourceContext } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import type { RawFinding } from '../types.js';
import {
	buildCspDirectives,
	externalUrl,
	resolveEmbedSource,
	scriptSourceProblem,
} from '@dealsystem/site/config';
import { excerpt, findAll, isSvelteFile } from '../util/code.js';
import { COMPONENT, CSP_MODULE, DEALSYSTEM_CSP_FN, MARKER, SDK_PACKAGE } from '../sdk.js';
import { lineOf, type HtmlDoc } from '../util/html.js';
import {
	cspAllows,
	cspForm,
	cspLooserThan,
	cspSourceList,
	declaredExternal,
	isValidDealsystemCall,
	metaCsp,
	SITE_API_SOURCE,
	sourceCsp,
	tighteningSeverity,
	unquote,
	type Csp,
} from '../util/csp.js';
import { getAttr, type SvelteElement } from '../util/svelte.js';
import { isOpaque, isPlainObject, type LiteralValue } from '../util/literal.js';

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

const LOOSE_SCRIPT_SOURCES = ['unsafe-inline', 'unsafe-hashes', '*', 'data:', 'http:', 'https:', 'blob:'];

/**
 * Fremde Hosts, die die feste CSP der Altform (Starter bis SDK 0.1) nennen darf: Google Tag und Meta Pixel (nur
 * über `<Tracking>`), die Site-API und OpenStreetMap (`<MapEmbed>`). Ab Regelsatz 3 kommen weitere Hosts nur über
 * `external` in dealsystem.config.ts und `dealsystemCsp()`.
 */
export const CSP_ALLOWED_HOSTS: readonly string[] = [
	'app.dealsystem.io',
	'*.dealsystem.io',
	'www.googletagmanager.com',
	'*.google-analytics.com',
	'*.analytics.google.com',
	'connect.facebook.net',
	'www.facebook.com',
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
	'media-src',
];

function cspHost(source: string): string | null {
	const m = /^(?:https:\/\/)?((?:\*\.)?[a-z0-9.-]+\.[a-z]{2,})(?::\d+)?(?:\/.*)?$/i.exec(source);
	return m?.[1]?.toLowerCase() ?? null;
}

function isAllowedCspHost(host: string): boolean {
	// `*.x` deckt `a.x` und `*.x`, nicht aber `x` selbst.
	return CSP_ALLOWED_HOSTS.some((h) => h === host || (h.startsWith('*.') && host.endsWith(h.slice(1))));
}

const FIX_CSP =
	"Schreibe in svelte.config.js `csp: dealsystemCsp()` mit `import { dealsystemCsp } from '@dealsystem/site/csp'` (oder `npx dealsystem sync --fix-config`) und trage fremde Hosts unter `external` in dealsystem.config.ts ein (extern.md).";

/** Probleme in `external` (dealsystem.config.ts): Sie bestimmen die Sicherheitsregeln, daher SEC-005. */
function externalConfigFindings(ctx: SourceContext): RawFinding[] {
	return ctx
		.siteConfig()
		.problems.filter((p) => p.kind === 'external')
		.map((p) => ({
			file: 'dealsystem.config.ts',
			line: p.line,
			message: `${p.path}: ${p.message}`,
			fix: p.fix ?? 'Korrigiere den Eintrag unter `external` in dealsystem.config.ts. Anleitung: extern.md.',
		}));
}

const sec005 = sourceRule('SEC-005', (ctx) => {
	const out = externalConfigFindings(ctx);
	const form = cspForm(ctx);
	if (!form) return out; // STR-001 meldet die fehlende Datei.
	const { path, mod } = form;
	const problem = (message: string, line?: number | null, fix?: string): RawFinding => ({
		file: path,
		line: line ?? null,
		message,
		...(fix ? { fix } : {}),
	});

	if (form.kind === 'dealsystem') {
		if ((form.call.args?.length ?? 0) > 0) {
			out.push(
				problem(
					'`dealsystemCsp()` nimmt keine Argumente. Fremde Hosts gehören unter `external` in dealsystem.config.ts.',
					form.call.line,
				),
			);
		}
		if (!isValidDealsystemCall(form) && mod.imports.get(DEALSYSTEM_CSP_FN) !== CSP_MODULE) {
			out.push(
				problem(
					`\`${DEALSYSTEM_CSP_FN}\` kommt nicht aus \`${CSP_MODULE}\`.`,
					form.call.line,
					`Schreibe \`import { dealsystemCsp } from '${CSP_MODULE}'\`.`,
				),
			);
		}
		// Neben der Konfiguration darf svelte.config.js nichts ausführen: Eine nachträgliche Änderung der CSP
		// (`config.kit.csp.directives[…].push(…)`) oder ein Ordnerwechsel sähe die statische Prüfung sonst nicht.
		for (const stmt of mod.source.statements) {
			const ok =
				ts.isImportDeclaration(stmt) ||
				ts.isVariableStatement(stmt) ||
				ts.isExportAssignment(stmt) ||
				ts.isFunctionDeclaration(stmt) ||
				ts.isTypeAliasDeclaration(stmt) ||
				ts.isInterfaceDeclaration(stmt) ||
				ts.isEmptyStatement(stmt);
			if (!ok) {
				out.push(
					problem(
						`svelte.config.js führt eigenen Code aus (\`${excerpt(stmt.getText(mod.source), 60)}\`). Neben der Konfiguration ist nichts erlaubt.`,
						mod.lines.at(stmt.getStart(mod.source)).line,
						'Entferne die Anweisung oder stelle die Datei mit `npx dealsystem sync --fix-config` wieder her.',
					),
				);
			}
		}
		return out;
	}

	if (form.kind === 'other') {
		if (isOpaque(form.csp)) {
			out.push(
				problem(
					`\`kit.csp\` ist \`${form.csp.text.slice(0, 60)}\`. Erlaubt ist nur \`dealsystemCsp()\` oder die feste Liste des Starters.`,
					form.csp.line,
					FIX_CSP,
				),
			);
		} else out.push(problem('In svelte.config.js fehlt `kit.csp` (Content-Security-Policy).', null, FIX_CSP));
		return out;
	}

	// Altform: feste Liste wie im Starter bis SDK 0.1. Bleibt gültig, öffnet aber keine fremden Hosts.
	const csp = form.csp;
	if (csp.mode !== 'hash') {
		out.push(
			problem(
				`\`kit.csp.mode\` muss \`'hash'\` sein, ist \`${isOpaque(csp.mode) ? csp.mode.text : String(csp.mode)}\`.`,
			),
		);
		return out;
	}
	const directives = csp.directives;
	if (!isPlainObject(directives)) {
		out.push(problem('`kit.csp.directives` fehlt oder ist kein festes Objekt.'));
		return out;
	}
	const list = (v: LiteralValue): string[] | null => cspSourceList(mod, v)?.map(unquote) ?? null;
	for (const [name, value] of Object.entries(directives)) {
		const values = list(value);
		if (values === null) {
			out.push(problem(`\`kit.csp.directives['${name}']\` muss eine feste Liste sein.`));
			continue;
		}
		if (values.includes('unsafe-eval') || values.includes('wasm-unsafe-eval')) {
			out.push(problem(`\`${name}\` erlaubt \`unsafe-eval\`.`));
		}
		if (!HOST_CHECKED_DIRECTIVES.includes(name)) continue;
		for (const source of values) {
			const host = cspHost(source);
			if (host && !isAllowedCspHost(host)) {
				out.push(problem(`\`${name}\` erlaubt den fremden Host \`${source}\`.`, null, FIX_CSP));
			}
		}
	}
	const scriptKey = directives['script-src'] !== undefined ? 'script-src' : 'default-src';
	const script = list(directives[scriptKey] ?? null);
	if (!script) {
		out.push(problem('In `kit.csp.directives` fehlt `script-src`.'));
	} else {
		for (const loose of LOOSE_SCRIPT_SOURCES) {
			if (script.includes(loose)) out.push(problem(`\`${scriptKey}\` ist gelockert: \`${loose}\`.`));
		}
	}
	if (declaredExternal(ctx).length > 0) {
		out.push(
			problem(
				'dealsystem.config.ts nennt fremde Dienste unter `external`, aber svelte.config.js hat noch die feste Liste. Die Dienste blieben gesperrt.',
				null,
				"Schreibe `csp: dealsystemCsp()` mit `import { dealsystemCsp } from '@dealsystem/site/csp'` oder führe `npx dealsystem sync --fix-config` aus.",
			),
		);
	}
	return out;
});

// ------------------------------------------------------------------ SEC-006

const DYNAMIC_CODE: readonly { pattern: RegExp; label: string; tightened?: boolean }[] = [
	{ pattern: /\beval\s*\(/g, label: 'eval()' },
	{ pattern: /\bnew\s+Function\s*\(/g, label: 'new Function()' },
	{ pattern: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/g, label: 'setTimeout/setInterval mit Zeichenkette' },
	{ pattern: /\.setAttribute\s*\(\s*['"`]on[a-z]+['"`]/g, label: 'Event-Handler als Attribut' },
	// Regelsatz 3: ohne `wasm-unsafe-eval` läuft keine WebAssembly (sperrt die gängigen Krypto-Miner).
	{
		pattern:
			/\bWebAssembly\.(?:instantiate|instantiateStreaming|compile|compileStreaming|Module|Instance)\b/g,
		label: 'WebAssembly',
		tightened: true,
	},
	{ pattern: /['"`]wasm-unsafe-eval['"`]/g, label: '`wasm-unsafe-eval`', tightened: true },
];
const INLINE_HANDLER_HTML = /<[a-z][^>]*\son[a-z]+\s*=\s*["'][^"']*["']/gi;
/** Datenblöcke führen nichts aus und unterliegen nicht `script-src` (z. B. strukturierte Daten für Google). */
const DATA_SCRIPT_TYPES = ['application/ld+json', 'application/json', 'importmap'];
const INLINE_SCRIPT_HTML = /<script\b([^>]*)>/gi;

const INLINE_FIX =
	'Lege den Code als Datei in `static/scripts/` ab und lade sie mit `<ExternalScript id="…" src="/scripts/datei.js" />` (extern.md), oder schreibe ihn als Svelte-Code in die Komponente.';

const sec006 = sourceRule('SEC-006', (ctx) => {
	const out: RawFinding[] = [];
	const tightened = tighteningSeverity(ctx);
	for (const path of ctx.codeFiles()) {
		for (const { pattern, label, tightened: isNew } of DYNAMIC_CODE) {
			for (const m of findAll(ctx.code(path), pattern, ctx.lines(path))) {
				out.push({
					file: path,
					line: m.line,
					column: m.column,
					message: `\`${path}\` nutzt ${label}.`,
					...(isNew ? { severity: tightened } : {}),
				});
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
				// Inline-Skript im Markup (z. B. in `<svelte:head>`): Die CSP der Seite sperrt es ohnehin.
				if (el.name.toLowerCase() === 'script' && !getAttr(el, 'src')) {
					const type = getAttr(el, 'type')?.value;
					if (typeof type === 'string' && DATA_SCRIPT_TYPES.includes(type.trim().toLowerCase())) continue;
					out.push({
						...ctx.at(
							path,
							el.start,
							`\`${path}\` enthält ein Inline-Skript (\`<script>\` ohne \`src\`).`,
							INLINE_FIX,
						),
						severity: tightened,
					});
				}
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		const code = ctx.code(path);
		for (const m of findAll(code, INLINE_HANDLER_HTML, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` enthält einen Inline-Event-Handler.`,
			});
		}
		for (const m of code.matchAll(INLINE_SCRIPT_HTML)) {
			const attrs = m[1] ?? '';
			if (/\bsrc\s*=/i.test(attrs)) continue;
			const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
			if (type && DATA_SCRIPT_TYPES.includes(type)) continue;
			out.push({
				...ctx.at(
					path,
					m.index,
					`\`${path}\` enthält ein Inline-Skript (\`<script>\` ohne \`src\`).`,
					INLINE_FIX,
				),
				severity: tightened,
			});
		}
		// Inhaltsblock des SDK auch nicht in eigenen HTML-Dateien (`src/app.html`, `static/`).
		for (const m of code.matchAll(/<[a-z]+\b[^>]*\bid\s*=\s*["']?ds-content\b[^>]*>/gi)) {
			out.push(
				ctx.at(
					path,
					m.index,
					`\`${path}\` enthält den Inhaltsblock \`ds-content\` des SDK.`,
					CONTENT_BLOCK_FIX,
				),
			);
		}
	}
	out.push(...contentBlockOwnership(ctx));
	return out;
});

// Inhaltsblock `ds-content` (Patchen statt Bauen): Ihn schreibt nur `<SiteHead>` aus dem SDK. Ein eigener
// Block oder Code, der ihn liest oder schreibt, würde beim Patchen alte und neue Texte mischen.
// Regelsatz 3: Fehler (in feature/p2-content-block zunächst Warnung). Es gibt keinen legitimen Grund dafür.
const CONTENT_BLOCK_ID = /(['"`])ds-content\1/g;
const CONTENT_BLOCK_FIX =
	'Lass den Block weg: `<SiteHead>` im Haupt-Layout schreibt ihn. Texte aus dem CRM gehören in `<Text>`, `<RichText>` oder `<MediaImage key>`.';

function contentBlockOwnership(ctx: SourceContext): RawFinding[] {
	const out: RawFinding[] = [];
	const fix = CONTENT_BLOCK_FIX;
	for (const path of ctx.codeFiles()) {
		const reported = new Set<number>();
		if (isSvelteFile(path)) {
			for (const el of ctx.svelte(path)?.elements ?? []) {
				if (el.kind !== 'element') continue;
				const id = el.attributes.find((a) => a.kind === 'attribute' && a.name === 'id');
				if (id?.value !== 'ds-content') continue;
				const finding = ctx.at(
					path,
					id.start,
					`\`<${el.name} id="ds-content">\` ist der Inhaltsblock des SDK.`,
					fix,
				);
				reported.add(finding.line ?? -1);
				out.push(finding);
			}
		}
		for (const m of findAll(ctx.code(path), CONTENT_BLOCK_ID, ctx.lines(path))) {
			if (reported.has(m.line)) continue;
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` nennt den Inhaltsblock \`ds-content\` des SDK.`,
				fix,
			});
		}
	}
	return out;
}

// ------------------------------------------------------------------ SEC-007

// Regelsatz 3: Ein eigenes `<form>` ist erlaubt (Enter zum Absenden, native Validierung, Semantik für
// Vorleseprogramme), solange es nichts selbst abschickt: Das Absenden läuft im Code über `createLeadClient()`.
// Zweite Schranke: `form-action 'self'` in der CSP.

const FORM_FIX =
	'Lass `action` weg (oder `action="#"`), schreib `<form onsubmit={senden}>` und schick die Daten in `senden` mit `createLeadClient()` ab; oder nimm `<LeadForm funnel="…" />`. Formulardaten gehen nur über DealSystem in dein CRM.';

/** Ob `action` auf dieselbe Seite zeigt: leer, `#…`, `.` oder der Pfad der Seite selbst. */
export function isSamePageAction(value: string, route: string | null): boolean {
	const v = value.trim();
	if (v === '' || v.startsWith('#') || v === '.' || v === './') return true;
	if (route === null || !v.startsWith('/') || v.startsWith('//')) return false;
	const path = v.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
	return path === (route.replace(/\/+$/, '') || '/');
}

interface FormLike {
	/** `undefined`: fehlt; `null`: Ausdruck; sonst der feste Wert. */
	action: string | null | undefined;
	method: string | null | undefined;
	target: string | null | undefined;
}

/** Probleme eines `<form>` (oder eines Knopfs mit `formaction`). */
function formProblems(form: FormLike, route: string | null, what: string): string[] {
	const problems: string[] = [];
	const method = typeof form.method === 'string' ? form.method.trim().toLowerCase() : form.method;
	if (form.action !== undefined) {
		if (form.action === null)
			problems.push(
				`${what}: \`action\` ist ein Ausdruck; wohin das Formular geht, lässt sich nicht prüfen.`,
			);
		else if (!isSamePageAction(form.action, route))
			problems.push(`${what} schickt an \`${excerpt(form.action, 60)}\`, eine andere Adresse.`);
		if (method === 'post' || method === null) problems.push(`${what} hat \`method="post"\` mit \`action\`.`);
	}
	if (form.target !== undefined) {
		const t = typeof form.target === 'string' ? form.target.trim().toLowerCase() : null;
		if (t !== '_self' && t !== '')
			problems.push(`${what} öffnet das Ergebnis in einem anderen Fenster (\`target\`).`);
	}
	return problems;
}

const attrValue = (el: SvelteElement, name: string): string | null | undefined => {
	const a = getAttr(el, name);
	if (!a) return undefined;
	return a.value === true ? '' : a.value;
};

/** `name="wert"` aus einem HTML-Tag; `undefined`, wenn das Attribut fehlt. */
function htmlAttr(tag: string, name: string): string | undefined {
	const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
	if (!m) return new RegExp(`\\s${name}(?=[\\s>/])`, 'i').test(tag) ? '' : undefined;
	return m[1] ?? m[2] ?? m[3] ?? '';
}

const sec007 = sourceRule('SEC-007', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		const route = /^src\/routes\/(?:.*\/)?\+page\.svelte$/.test(path) ? routeOfSource(path) : null;
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (el.kind !== 'element') continue;
			// Knöpfe und Eingaben können das Ziel des Formulars überschreiben.
			if (getAttr(el, 'formaction') || getAttr(el, 'formtarget') || getAttr(el, 'formmethod')) {
				const problems = formProblems(
					{
						action: attrValue(el, 'formaction'),
						method: attrValue(el, 'formmethod'),
						target: attrValue(el, 'formtarget'),
					},
					route,
					`\`<${el.name} formaction>\` in \`${path}\``,
				);
				for (const message of problems) out.push(ctx.at(path, el.start, message, FORM_FIX));
			}
			if (el.name !== 'form') continue;
			const what = `Das \`<form>\` in \`${path}\``;
			if (el.attributes.some((a) => a.kind === 'spread')) {
				out.push(
					ctx.at(
						path,
						el.start,
						`${what} hat \`{...}\`; ob es eine \`action\` bekommt, lässt sich nicht prüfen.`,
						'Schreibe die Attribute des `<form>` einzeln aus, ohne `{...}`.',
					),
				);
				continue;
			}
			const method = attrValue(el, 'method');
			if (typeof method === 'string' && method.trim().toLowerCase() === 'dialog') continue;
			const problems = formProblems(
				{ action: attrValue(el, 'action'), method, target: attrValue(el, 'target') },
				route,
				what,
			);
			for (const message of problems) out.push(ctx.at(path, el.start, message, FORM_FIX));
			if (!getAttr(el, 'onsubmit')) {
				out.push(
					ctx.at(
						path,
						el.start,
						`${what} hat kein \`onsubmit\`. Beim Absenden lädt die Seite neu, und die Eingaben stehen in der Adresse.`,
						FORM_FIX,
					),
				);
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		const code = ctx.code(path);
		for (const m of code.matchAll(/<form\b[^>]*>/gi)) {
			const tag = m[0];
			if ((htmlAttr(tag, 'method') ?? '').trim().toLowerCase() === 'dialog') continue;
			const problems = formProblems(
				{ action: htmlAttr(tag, 'action'), method: htmlAttr(tag, 'method'), target: htmlAttr(tag, 'target') },
				null,
				`Das \`<form>\` in \`${path}\``,
			);
			for (const message of problems) out.push({ ...ctx.at(path, m.index, message), fix: FORM_FIX });
		}
		for (const m of code.matchAll(/<[a-z]+\b[^>]*\bform(?:action|target|method)\s*=[^>]*>/gi)) {
			const tag = m[0];
			const problems = formProblems(
				{
					action: htmlAttr(tag, 'formaction'),
					method: htmlAttr(tag, 'formmethod'),
					target: htmlAttr(tag, 'formtarget'),
				},
				null,
				`\`formaction\` in \`${path}\``,
			);
			for (const message of problems) out.push({ ...ctx.at(path, m.index, message), fix: FORM_FIX });
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

function blockedMessage(tag: string, url: URL, directive: string): string {
	return (
		`\`<${tag}>\` lädt \`${excerpt(url.href, 80)}\`, aber die Sicherheitsregeln der Seite (\`${directive}\`) ` +
		`erlauben \`${url.host}\` nicht. Der Browser blockiert den Inhalt, auch nach der Einwilligung.`
	);
}

function blockedFix(tag: string): string {
	return tag === 'script'
		? 'Trage den Dienst unter `external` in dealsystem.config.ts ein (mit Host unter `script`) und lade das Skript mit `<ExternalScript id="…" src="…" />`. Anleitung: extern.md. Lockere nicht die Regeln in svelte.config.js.'
		: 'Trage den Dienst unter `external` in dealsystem.config.ts ein (YouTube: `{ preset: \'youtube\' }`) und bette ihn mit `<Embed id="…" src="…" title="…" />` ein. Anleitung: extern.md. Lockere nicht die Regeln in svelte.config.js.';
}

const RAW_EMBED_FIX: Record<string, string> = {
	script:
		'Lade Skripte nur mit `<ExternalScript id="…" src="…" />` aus `@dealsystem/site`: Es wartet auf die Einwilligung und lädt nach einem Widerruf neu. Anleitung: extern.md.',
	frame:
		'Bette fremde Inhalte nur mit `<Embed id="…" src="…" title="…" />` aus `@dealsystem/site` ein: Es zeigt vor der Einwilligung einen Platzhalter. Anleitung: extern.md.',
};

function staticAttr(el: SvelteElement, name: string): string | null {
	const attr = getAttr(el, name);
	return attr && typeof attr.value === 'string' ? attr.value : null;
}

/** Prüft `<Embed>` und `<ExternalScript>` mit festen Angaben gegen Deklaration und CSP. */
function componentFindings(
	ctx: SourceContext,
	path: string,
	el: SvelteElement,
	csp: Csp,
	kind: 'dealsystem' | 'legacy',
): RawFinding[] {
	const isEmbed = el.name === COMPONENT.embed;
	const id = staticAttr(el, 'id');
	const src = staticAttr(el, 'src');
	if (id === null) return []; // Ausdruck: Das SDK prüft beim Build selbst.
	const entry = declaredExternal(ctx).find((e) => e.id === id);
	const tag = `<${el.name} id="${id}">`;
	if (!entry) {
		return [
			ctx.at(
				path,
				el.start,
				`\`${tag}\` in \`${path}\`: "${id}" steht nicht unter \`external\` in dealsystem.config.ts. Ohne Deklaration lässt die Seite den Dienst nicht zu.`,
				isEmbed
					? `Trage den Dienst ein, z. B. \`external: { ${id}: { preset: 'youtube' } }\` (Vorlagen: youtube, vimeo, google-maps, calendly). Anleitung: extern.md.`
					: `Trage den Dienst mit \`category\`, \`provider\`, \`purpose\`, \`privacyUrl\` und dem Host unter \`script\` ein, z. B. \`external: { ${id}: { category: 'marketing', …, script: ['https://js.anbieter.de'] } }\`. Anleitung: extern.md.`,
			),
		];
	}
	if (src === null) return [];
	if (isEmbed) {
		const resolved = resolveEmbedSource(entry, src);
		if (!resolved.ok) return [ctx.at(path, el.start, `\`${tag}\` in \`${path}\`: ${resolved.message}`)];
		const url = new URL(resolved.src);
		if (kind === 'legacy' && !cspAllows(csp, 'frame-src', url))
			return [ctx.at(path, el.start, blockedMessage(el.name, url, 'frame-src'), blockedFix('iframe'))];
		return [];
	}
	const problem = scriptSourceProblem(entry, src);
	if (problem) {
		return [
			ctx.at(
				path,
				el.start,
				`\`${tag}\` in \`${path}\`: ${problem}`,
				`Trage den Host unter \`external.${id}.script\` in dealsystem.config.ts ein (nur \`https://host\`, ohne Pfad) oder lege die Datei unter \`static/\` ab.`,
			),
		];
	}
	const url = externalUrl(src);
	if (url && kind === 'legacy' && !cspAllows(csp, 'script-src', url))
		return [ctx.at(path, el.start, blockedMessage(el.name, url, 'script-src'), blockedFix('script'))];
	return [];
}

const sec008Source = sourceRule('SEC-008', (ctx) => {
	const found = sourceCsp(ctx);
	if (!found) return []; // SEC-005 meldet die fehlende oder unlesbare CSP.
	const out: RawFinding[] = [];
	const tightened = tighteningSeverity(ctx);
	// Formular und Captcha sprechen die Site-API an. Welche Adresse das ist, steht erst beim Build fest
	// (PUBLIC_DEALSYSTEM_API): Eine fest eingetragene Adresse passt nur für eine Umgebung.
	const connect = found.csp['connect-src'] ?? found.csp['default-src'];
	if (connect && !connect.includes(SITE_API_SOURCE) && !connect.some((s) => unquote(s) === '*')) {
		out.push({
			file: found.path,
			message:
				'`connect-src` in svelte.config.js nennt die Adresse der Site-API nicht über `siteApiOrigin()`. Wird die Seite für eine andere Umgebung erzeugt, blockiert der Browser Formular und Captcha.',
			fix: "Schreibe in svelte.config.js `csp: dealsystemCsp()` mit `import { dealsystemCsp } from '@dealsystem/site/csp'`, oder führe `npx dealsystem sync --fix-config` aus.",
		});
	}
	for (const path of ctx.svelteFiles()) {
		const ast = ctx.svelte(path);
		if (!ast) continue;
		const usesSdk = ctx.code(path).includes(SDK_PACKAGE);
		for (const el of ast.elements) {
			if (el.kind === 'component') {
				if (!usesSdk) continue;
				// `<MapEmbed>` bettet OpenStreetMap ein: Die Vorlage der CSP erlaubt das, eine ältere oder veränderte nicht.
				if (el.name === COMPONENT.map && !cspAllows(found.csp, 'frame-src', new URL(MAP_EMBED_ORIGIN))) {
					out.push(
						ctx.at(
							path,
							el.start,
							`\`<${COMPONENT.map}>\` bettet eine Karte von \`${MAP_EMBED_ORIGIN}\` ein, aber \`frame-src\` in svelte.config.js erlaubt das nicht. Die Karte bliebe leer.`,
							'Führe `npx dealsystem sync --fix-config` aus: Die Vorlage von svelte.config.js erlaubt die Karte.',
						),
					);
				}
				if (el.name === COMPONENT.embed || el.name === COMPONENT.externalScript) {
					out.push(...componentFindings(ctx, path, el, found.csp, found.kind));
				}
				continue;
			}
			const tag = el.name.toLowerCase();
			const directive = EMBED_DIRECTIVE[tag];
			if (!directive) continue;
			const value = staticAttr(el, tag === 'object' ? 'data' : 'src');
			const url = externalUrl(value);
			if (url && !cspAllows(found.csp, directive, url)) {
				out.push(ctx.at(path, el.start, blockedMessage(tag, url, directive), blockedFix(tag)));
			} else if (url || (tag === 'script' && value !== null)) {
				// Regelsatz 3: fremde Rahmen und jedes Skript nur über die Bausteine des SDK.
				out.push({
					...ctx.at(
						path,
						el.start,
						`\`<${tag}>\` in \`${path}\` lädt \`${excerpt(value ?? '', 80)}\` ohne Baustein des SDK.`,
						RAW_EMBED_FIX[tag === 'script' ? 'script' : 'frame'],
					),
					severity: tightened,
				});
			}
		}
	}
	return out;
});

/** Adressen, die eine fertige Seite lädt oder nach der Einwilligung laden wird, mit Direktive. */
function pageLoads(
	doc: HtmlDoc,
): { el: HtmlDoc['elements'][number]; url: URL; directive: string; tag: string }[] {
	const out: { el: HtmlDoc['elements'][number]; url: URL; directive: string; tag: string }[] = [];
	for (const el of doc.elements) {
		const direct = EMBED_DIRECTIVE[el.tag];
		if (direct) {
			const url = externalUrl(el.attrs[el.tag === 'object' ? 'data' : 'src']);
			if (url) out.push({ el, url, directive: direct, tag: el.tag });
		}
		// Platzhalter von `<Embed>` und Marker von `<ExternalScript>`: Laden erst nach der Einwilligung.
		const marked =
			MARKER.embed in el.attrs ? 'frame-src' : MARKER.externalScript in el.attrs ? 'script-src' : null;
		const src = el.attrs[MARKER.src];
		if (marked && src) {
			const url = externalUrl(src);
			if (url)
				out.push({ el, url, directive: marked, tag: marked === 'frame-src' ? 'Embed' : 'ExternalScript' });
		}
	}
	return out;
}

const sec008Output = outputRule('SEC-008', (ctx) => {
	const out: RawFinding[] = [];
	const api = externalUrl(ctx.options.apiUrl);
	// Unbekannte Deklaration (Build-Host, älteres SDK ohne `external` im Manifest): gegen die Basis, nur als Warnung.
	const known = ctx.expectedCsp(api?.origin ?? SITE_API_SOURCE);
	const expected = known?.csp ?? buildCspDirectives([], api?.origin ?? SITE_API_SOURCE, { googleAds: true });
	const looserSeverity = known?.strict ? 'error' : 'warning';
	let apiReported = false;
	for (const path of ctx.pages()) {
		const doc = ctx.html(path);
		const meta = doc.elements.find(
			(el) => el.tag === 'meta' && el.attrs['http-equiv']?.toLowerCase() === 'content-security-policy',
		);
		if (!meta?.attrs.content) continue;
		const csp = metaCsp(meta.attrs.content);
		// Die fertige Seite darf nicht mehr erlauben, als Basis und Deklaration ergeben.
		const looser = cspLooserThan(csp, expected, api?.origin ?? null, known?.strict ?? false);
		if (looser.length > 0) {
			out.push({
				file: path,
				line: lineOf(doc, meta),
				message: `Die Sicherheitsregeln der fertigen Seite weichen von dealsystem.config.ts ab: ${looser.join(' ')}`,
				severity: looserSeverity,
				fix: 'Schreibe in svelte.config.js nur `csp: dealsystemCsp()` und ändere die Regeln nirgends sonst. Fremde Hosts gehören unter `external` in dealsystem.config.ts (extern.md); `npx dealsystem sync --fix-config` stellt svelte.config.js wieder her.',
			});
		}
		// Die Seite schickt Formular und Captcha an die Site-API: Die CSP der fertigen Seite muss sie erlauben.
		if (api && !apiReported && !cspAllows(csp, 'connect-src', api)) {
			apiReported = true;
			out.push({
				file: path,
				line: lineOf(doc, meta),
				message: `Die Sicherheitsregeln der fertigen Seite (\`connect-src\`) erlauben die Site-API \`${api.origin}\` nicht. Der Browser blockiert Formular und Captcha.`,
				fix: 'Schreibe in svelte.config.js `csp: dealsystemCsp()` (`npx dealsystem sync --fix-config`) und erzeuge die Seite neu, mit derselben `PUBLIC_DEALSYSTEM_API` wie beim Hochladen.',
			});
		}
		for (const load of pageLoads(doc)) {
			if (!cspAllows(csp, load.directive, load.url)) {
				out.push({
					file: path,
					line: lineOf(doc, load.el),
					message: blockedMessage(load.tag, load.url, load.directive),
					fix: blockedFix(load.directive === 'script-src' ? 'script' : 'iframe'),
				});
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-009

const PASSWORD_FIX =
	'Entferne das Passwortfeld. Eine Seite auf DealSystem hat keine Anmeldung; ein Passwortfeld wirkt wie eine nachgebaute Login-Seite und kann die Seite sperren lassen.';

// Neu in Regelsatz 3: Fehler für Seiten mit `dealsystemCsp()`, Warnung für die Altform (unveränderte Live-Seiten).
const sec009Source = sourceRule('SEC-009', (ctx) => {
	const out: RawFinding[] = [];
	const severity = tighteningSeverity(ctx);
	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (
				el.kind === 'element' &&
				el.name === 'input' &&
				staticAttr(el, 'type')?.trim().toLowerCase() === 'password'
			)
				out.push({
					...ctx.at(path, el.start, `\`${path}\` enthält ein Passwortfeld.`, PASSWORD_FIX),
					severity,
				});
		}
	}
	for (const path of ctx.htmlFiles()) {
		for (const m of ctx.code(path).matchAll(/<input\b[^>]*\btype\s*=\s*["']?password\b/gi))
			out.push({
				...ctx.at(path, m.index, `\`${path}\` enthält ein Passwortfeld.`),
				fix: PASSWORD_FIX,
				severity,
			});
	}
	return out;
});

const sec009Output = outputRule('SEC-009', (ctx) => {
	const out: RawFinding[] = [];
	const severity = ctx.declared?.strict ? 'error' : 'warning';
	for (const path of ctx.pages()) {
		const doc = ctx.html(path);
		for (const el of doc.elements) {
			if (el.tag === 'input' && el.attrs.type?.trim().toLowerCase() === 'password')
				out.push({
					file: path,
					line: lineOf(doc, el),
					message: `\`${path}\` enthält ein Passwortfeld.`,
					fix: PASSWORD_FIX,
					severity,
				});
		}
	}
	return out;
});

// ------------------------------------------------------------------ SEC-011

/**
 * Eigene Skripte auf einer Seite, die nur unter dem Standard-Host (`<name>.dealsystem.site`) läuft, solange die
 * Domain nicht auf der Public Suffix List steht: Ein Skript könnte Cookies für alle Seiten setzen. Nur der
 * Build-Host kennt die Hosts der Seite (`CheckOptions.hosting`); lokal bleibt die Regel still.
 */
const sec011 = outputRule('SEC-011', (ctx) => {
	const hosting = ctx.options.hosting;
	if (!hosting?.standardHostOnly || hosting.sitesDomainOnPsl) return [];
	const pages = ctx
		.pages()
		.filter((p) => ctx.html(p).elements.some((el) => MARKER.externalScript in el.attrs));
	if (pages.length === 0) return [];
	return [
		{
			file: pages[0]!,
			message: `\`<ExternalScript>\` läuft hier nur unter der Adresse von DealSystem (${pages.length === 1 ? 'eine Seite' : `${pages.length} Seiten`}). Eigene Skripte gehen dort noch nicht, weil sich Seiten verschiedener Kunden diese Adresse teilen.`,
			fix: 'Verbinde eine eigene Domain (Eigene Website → Domains) oder nimm `<ExternalScript>` heraus. Videos über `<Embed>` und Tracking über `<Tracking />` gehen auch ohne eigene Domain.',
		},
	];
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
	sec009Source,
];
export const securityOutputRules: OutputRule[] = [sec001Output, sec008Output, sec009Output, sec011];
