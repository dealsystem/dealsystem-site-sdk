// Liest `dealsystem.config.ts` statisch (ohne Ausführen: Kundencode ist nicht vertrauenswürdig, B1) und prüft
// den Inhalt mit `validateSiteConfig` aus `@dealsystem/site/config` — dieselbe Prüfung, die `defineSite` beim
// Build macht. Eigene Regeln stehen hier nur, wo das SDK nichts weiß (feste Werte, Form der `siteId`).

import { validateSiteConfig } from '@dealsystem/site/config';
import ts from 'typescript';
import {
	evaluate,
	findKeyLine,
	isOpaque,
	isPlainObject,
	parseModule,
	type LiteralValue,
	type ParsedModule,
} from '../check/util/literal.js';

export const SITE_CONFIG_FILE = 'dealsystem.config.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Welche Regel einen Fund meldet: STR-005 (Konfiguration), QUA-005 (E-Mail/Telefon), QUA-006 (Schlüssel). */
export type ConfigProblemKind = 'structure' | 'reachability' | 'key';

export interface ConfigProblem {
	kind: ConfigProblemKind;
	/** Stelle in der Konfiguration wie beim SDK, z. B. `funnels.kontakt.fields[1].type`. */
	path: string;
	line: number | null;
	message: string;
	fix?: string;
}

export interface SiteConfigData {
	siteId: string | null;
	funnels: { key: string; fields: { name: string; standardField: string | null }[] }[];
	collections: { key: string }[];
}

export interface SiteConfigResult {
	exists: boolean;
	data: SiteConfigData | null;
	problems: ConfigProblem[];
}

/**
 * Ordnet Meldungen des SDK den Regeln zu. Die Texte stammen aus `validateSiteConfig`; ändert das SDK sie,
 * fallen sie auf STR-005 zurück (nie verloren). Ein Test hält die Zuordnung fest.
 */
function kindOf(message: string): ConfigProblemKind {
	if (/E-Mail- oder Telefonfeld/.test(message)) return 'reachability';
	if (/-Schlüssel ".*" ist ungültig/.test(message)) return 'key';
	return 'structure';
}

/** Zeile zu einem Pfad wie `funnels.kontakt.fields[1].type` im Objekt-Literal von `defineSite({ … })`. */
export function findPathLine(mod: ParsedModule, path: string): number | null {
	let node: ts.Node | undefined = mod.defaultExport ?? undefined;
	const unwrap = (n: ts.Node | undefined): ts.Node | undefined => {
		let e = n;
		while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))) {
			e = e.expression;
		}
		if (e && ts.isCallExpression(e) && e.arguments.length === 1) return unwrap(e.arguments[0]);
		if (e && ts.isIdentifier(e)) return unwrap(mod.consts.get(e.text));
		return e;
	};
	node = unwrap(node);
	if (!node) return null;
	let line = mod.lines.at(node.getStart(mod.source)).line;
	const segments = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
	for (const seg of segments) {
		const current = unwrap(node);
		let next: ts.Node | undefined;
		if (seg.startsWith('[') && current && ts.isArrayLiteralExpression(current)) {
			next = current.elements[Number(seg.slice(1, -1))];
		} else if (current && ts.isObjectLiteralExpression(current)) {
			const prop = current.properties.find(
				(p) =>
					(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
					(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
					p.name.text === seg,
			);
			if (prop) {
				line = mod.lines.at(prop.getStart(mod.source)).line;
				next = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
			}
		}
		if (!next) break;
		line = mod.lines.at(next.getStart(mod.source)).line;
		node = next;
	}
	return line;
}

export function readSiteConfig(code: string | null): SiteConfigResult {
	if (code === null) {
		return {
			exists: false,
			data: null,
			problems: [{ kind: 'structure', path: '', line: null, message: `${SITE_CONFIG_FILE} fehlt.` }],
		};
	}
	const mod = parseModule(SITE_CONFIG_FILE, code);
	const fail = (line: number | null, message: string, fix: string): SiteConfigResult => ({
		exists: true,
		data: null,
		problems: [{ kind: 'structure', path: '', line, message, fix }],
	});
	if (mod.syntaxError) {
		return fail(
			mod.syntaxError.line,
			`${SITE_CONFIG_FILE} hat einen Syntaxfehler: ${mod.syntaxError.message}`,
			'Korrigiere die Syntax; die Datei enthält nur `export default defineSite({ … })`.',
		);
	}
	if (!mod.defaultExport) {
		return fail(
			null,
			`${SITE_CONFIG_FILE} hat keinen \`export default\`.`,
			"Schreibe `export default defineSite({ siteId: '…' })` mit `import { defineSite } from '@dealsystem/site/config'`.",
		);
	}
	let root = evaluate(mod, mod.defaultExport);
	if (isOpaque(root) && root.call === 'defineSite' && root.args?.length === 1)
		root = root.args[0] as LiteralValue;
	if (!isPlainObject(root)) {
		return fail(
			isOpaque(root) ? root.line : null,
			`${SITE_CONFIG_FILE} muss ein festes Objekt exportieren.`,
			'Schreibe `export default defineSite({ … })` nur mit festen Werten (keine Funktionen, Variablen aus anderen Dateien oder Spreads).',
		);
	}

	const problems: ConfigProblem[] = [];
	const opaquePaths: string[] = [];
	// Nicht auswertbare Werte melden: die Konfiguration wird gelesen, ohne sie auszuführen.
	const reportOpaque = (value: LiteralValue, path: string): void => {
		if (isOpaque(value)) {
			opaquePaths.push(path);
			problems.push({
				kind: 'structure',
				path,
				line: value.line,
				message: `\`${path}\` ist kein fester Wert (\`${value.text.slice(0, 60)}\`).`,
				fix: 'Trage den Wert direkt ein. Die Konfiguration wird gelesen, ohne sie auszuführen.',
			});
		} else if (Array.isArray(value)) {
			value.forEach((v, i) => reportOpaque(v, `${path}[${i}]`));
		} else if (isPlainObject(value)) {
			for (const [k, v] of Object.entries(value)) reportOpaque(v, path ? `${path}.${k}` : k);
		}
	};
	reportOpaque(root, '');

	for (const p of validateSiteConfig(root)) {
		// Folgefehler eines nicht festen Werts nicht doppelt melden.
		if (opaquePaths.some((o) => p.path === o || p.path.startsWith(`${o}.`) || p.path.startsWith(`${o}[`)))
			continue;
		problems.push({
			kind: kindOf(p.message),
			path: p.path,
			line: findPathLine(mod, p.path),
			message: p.message,
		});
	}
	if (typeof root.siteId === 'string' && root.siteId.trim() && !UUID_PATTERN.test(root.siteId)) {
		problems.push({
			kind: 'structure',
			path: 'siteId',
			line: findKeyLine(mod, 'siteId'),
			message: `\`siteId\` ist keine gültige Kennung: \`${root.siteId.slice(0, 60)}\`.`,
			fix: 'Führe `npx dealsystem init` aus.',
		});
	}

	const record = (v: LiteralValue | undefined): Record<string, LiteralValue> => (isPlainObject(v) ? v : {});
	const funnels = Object.entries(record(root.funnels)).map(([key, def]) => ({
		key,
		fields: (Array.isArray(record(def).fields) ? (record(def).fields as LiteralValue[]) : []).map((f) => ({
			name: typeof record(f).name === 'string' ? (record(f).name as string) : '',
			standardField: typeof record(f).standardField === 'string' ? (record(f).standardField as string) : null,
		})),
	}));
	const collections = Object.keys(record(root.collections)).map((key) => ({ key }));
	const siteId =
		typeof root.siteId === 'string' && UUID_PATTERN.test(root.siteId) ? root.siteId.toLowerCase() : null;
	return { exists: true, data: { siteId, funnels, collections }, problems };
}

/** Setzt `siteId` in der Konfiguration (für `init`). Gibt den neuen Text zurück. */
export function writeSiteIdIntoConfig(code: string, siteId: string): string | null {
	const re = /(\bsiteId\s*:\s*)(['"`])[^'"`]*\2/;
	if (re.test(code)) return code.replace(re, `$1'${siteId}'`);
	const call = /(defineSite\(\s*\{)/;
	if (call.test(code)) return code.replace(call, `$1\n\tsiteId: '${siteId}',`);
	return null;
}

/** Konfiguration für eine neue Seite, falls noch keine existiert. */
export function defaultSiteConfig(siteId: string): string {
	return [
		"import { defineSite } from '@dealsystem/site/config';",
		'',
		'export default defineSite({',
		`\tsiteId: '${siteId}',`,
		'\tfunnels: {',
		'\t\tkontakt: {',
		"\t\t\tlabel: 'Kontakt',",
		'\t\t\tfields: [',
		"\t\t\t\t{ name: 'firstName', type: 'text', label: 'Vorname', standardField: 'firstName' },",
		"\t\t\t\t{ name: 'lastName', type: 'text', label: 'Nachname', standardField: 'lastName' },",
		"\t\t\t\t{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },",
		"\t\t\t\t{ name: 'nachricht', type: 'textarea', label: 'Nachricht' },",
		'\t\t\t],',
		'\t\t},',
		'\t},',
		'});',
		'',
	].join('\n');
}
