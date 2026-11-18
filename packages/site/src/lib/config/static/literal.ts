// Liest Konfigurationsdateien statisch, ohne sie auszuführen. Kundencode ist nicht vertrauenswürdig (B1):
// `check` läuft auf dem Build-Host vor jedem Build und darf dabei nichts aus dem Projekt ausführen.

import ts from 'typescript';
import { LineIndex } from './lines.js';

/** Platzhalter für Ausdrücke, die sich nicht statisch auswerten lassen. */
export interface Opaque {
	readonly opaque: true;
	/** Bei Funktionsaufrufen: Name der aufgerufenen Funktion (`adapter`, `defineSite`). */
	readonly call?: string;
	readonly args?: LiteralValue[];
	readonly text: string;
	readonly line: number;
}

export type LiteralValue =
	string | number | boolean | null | undefined | Opaque | LiteralValue[] | { [key: string]: LiteralValue };

export function isOpaque(v: unknown): v is Opaque {
	return typeof v === 'object' && v !== null && (v as { opaque?: unknown }).opaque === true;
}

export function isPlainObject(v: unknown): v is { [key: string]: LiteralValue } {
	return typeof v === 'object' && v !== null && !Array.isArray(v) && !isOpaque(v);
}

export interface ParsedModule {
	source: ts.SourceFile;
	lines: LineIndex;
	/** Importierte Bezeichner → Modul (`adapter` → `@sveltejs/adapter-static`). */
	imports: Map<string, string>;
	/** Alle importierten Module mit Zeile. */
	importList: { module: string; line: number }[];
	/** Auf oberster Ebene deklarierte `const`. */
	consts: Map<string, ts.Expression>;
	/** `export default …`, falls vorhanden. */
	defaultExport: ts.Expression | null;
	/** `export const <name> = …` */
	namedExports: Map<string, ts.Expression | null>;
	/** Syntaxfehler (erste Meldung), falls die Datei nicht sauber parst. */
	syntaxError: { line: number; message: string } | null;
}

export function parseModule(fileName: string, code: string): ParsedModule {
	const kind = fileName.endsWith('.ts') || fileName.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
	const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
	const lines = new LineIndex(code);
	const imports = new Map<string, string>();
	const importList: { module: string; line: number }[] = [];
	const consts = new Map<string, ts.Expression>();
	const namedExports = new Map<string, ts.Expression | null>();
	let defaultExport: ts.Expression | null = null;

	for (const stmt of source.statements) {
		if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
			const mod = stmt.moduleSpecifier.text;
			importList.push({ module: mod, line: lines.at(stmt.getStart(source)).line });
			const clause = stmt.importClause;
			if (clause?.name) imports.set(clause.name.text, mod);
			const bindings = clause?.namedBindings;
			if (bindings && ts.isNamedImports(bindings)) {
				for (const el of bindings.elements) imports.set(el.name.text, mod);
			} else if (bindings && ts.isNamespaceImport(bindings)) {
				imports.set(bindings.name.text, mod);
			}
		} else if (ts.isVariableStatement(stmt)) {
			const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			for (const decl of stmt.declarationList.declarations) {
				if (!ts.isIdentifier(decl.name)) continue;
				if (decl.initializer) consts.set(decl.name.text, decl.initializer);
				if (exported) namedExports.set(decl.name.text, decl.initializer ?? null);
			}
		} else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
			const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			if (exported) namedExports.set(stmt.name.text, null);
		} else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
			defaultExport = stmt.expression;
		} else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
			for (const el of stmt.exportClause.elements) {
				const local = (el.propertyName ?? el.name).getText(source);
				namedExports.set(el.name.text, consts.get(local) ?? null);
			}
		}
	}

	const diagnostics = (source as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
	const first = diagnostics[0];
	const syntaxError = first
		? {
				line: lines.at(first.start ?? 0).line,
				message: ts.flattenDiagnosticMessageText(first.messageText, ' '),
			}
		: null;

	return { source, lines, imports, importList, consts, defaultExport, namedExports, syntaxError };
}

function unwrap(expr: ts.Expression): ts.Expression {
	let e = expr;
	while (
		ts.isParenthesizedExpression(e) ||
		ts.isAsExpression(e) ||
		ts.isSatisfiesExpression(e) ||
		ts.isTypeAssertionExpression(e) ||
		ts.isNonNullExpression(e)
	) {
		e = e.expression;
	}
	return e;
}

/** Wertet einen Ausdruck aus, soweit er aus Literalen und lokalen `const` besteht. */
export function evaluate(mod: ParsedModule, expr: ts.Expression, depth = 0): LiteralValue {
	const e = unwrap(expr);
	const opaque = (extra: Partial<Opaque> = {}): Opaque => ({
		opaque: true,
		text: e.getText(mod.source).slice(0, 200),
		line: mod.lines.at(e.getStart(mod.source)).line,
		...extra,
	});
	if (depth > 20) return opaque();
	if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
	if (ts.isNumericLiteral(e)) return Number(e.text);
	if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (e.kind === ts.SyntaxKind.NullKeyword) return null;
	if (
		ts.isPrefixUnaryExpression(e) &&
		e.operator === ts.SyntaxKind.MinusToken &&
		ts.isNumericLiteral(e.operand)
	) {
		return -Number(e.operand.text);
	}
	if (ts.isIdentifier(e)) {
		if (e.text === 'undefined') return undefined;
		const init = mod.consts.get(e.text);
		return init ? evaluate(mod, init, depth + 1) : opaque();
	}
	if (ts.isArrayLiteralExpression(e)) {
		return e.elements.map((el) => (ts.isSpreadElement(el) ? opaque() : evaluate(mod, el, depth + 1)));
	}
	if (ts.isObjectLiteralExpression(e)) {
		const obj: { [key: string]: LiteralValue } = {};
		for (const prop of e.properties) {
			if (ts.isPropertyAssignment(prop)) {
				const key = propertyName(prop.name);
				if (key === null) return opaque();
				obj[key] = evaluate(mod, prop.initializer, depth + 1);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				obj[prop.name.text] = evaluate(mod, prop.name, depth + 1);
			} else {
				// Spread, Methoden, Getter: nicht statisch.
				return opaque();
			}
		}
		return obj;
	}
	if (ts.isCallExpression(e)) {
		const callee = unwrap(e.expression);
		const name = ts.isIdentifier(callee)
			? callee.text
			: ts.isPropertyAccessExpression(callee)
				? callee.getText(mod.source)
				: undefined;
		return opaque({
			...(name !== undefined ? { call: name } : {}),
			args: e.arguments.map((a) => evaluate(mod, a, depth + 1)),
		});
	}
	return opaque();
}

function propertyName(name: ts.PropertyName): string | null {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
	return null;
}

/** Zeile, in der ein Schlüssel eines Objekt-Literals steht (für Meldungen). */
export function findKeyLine(mod: ParsedModule, key: string): number | null {
	let found: number | null = null;
	const visit = (node: ts.Node): void => {
		if (found !== null) return;
		if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
			const n = node.name;
			if ((ts.isIdentifier(n) || ts.isStringLiteral(n)) && n.text === key) {
				found = mod.lines.at(n.getStart(mod.source)).line;
				return;
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(mod.source);
	return found;
}
