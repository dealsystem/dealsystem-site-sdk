// Hilfen für Prüfungen am Code: Kommentare ausblenden (Offsets bleiben gleich), Fundstellen per Muster.

import ts from 'typescript';
import { LineIndex } from './lines.js';

const SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs', '.mts', '.cts'];

export function isScriptFile(path: string): boolean {
	return SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext)) && !path.endsWith('.d.ts');
}

export function isSvelteFile(path: string): boolean {
	return path.endsWith('.svelte');
}

function blank(text: string, start: number, end: number, out: string[]): void {
	for (let i = start; i < end; i++) {
		const ch = text[i];
		out[i] = ch === '\n' || ch === '\r' ? ch : ' ';
	}
}

/** Nach diesen Token ist `/` eine Division, sonst beginnt ein Regex-Literal. */
function endsExpression(kind: ts.SyntaxKind): boolean {
	return (
		kind === ts.SyntaxKind.Identifier ||
		kind === ts.SyntaxKind.NumericLiteral ||
		kind === ts.SyntaxKind.StringLiteral ||
		kind === ts.SyntaxKind.BigIntLiteral ||
		kind === ts.SyntaxKind.RegularExpressionLiteral ||
		kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
		kind === ts.SyntaxKind.TemplateTail ||
		kind === ts.SyntaxKind.CloseParenToken ||
		kind === ts.SyntaxKind.CloseBracketToken ||
		kind === ts.SyntaxKind.CloseBraceToken ||
		kind === ts.SyntaxKind.ThisKeyword ||
		kind === ts.SyntaxKind.PlusPlusToken ||
		kind === ts.SyntaxKind.MinusMinusToken
	);
}

/** Ersetzt JS/TS-Kommentare durch Leerzeichen. Zeilenumbrüche bleiben, damit Zeilennummern stimmen. */
export function blankJsComments(code: string): string {
	const out = code.split('');
	const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
	// Der Scanner allein kennt keinen Kontext: Template-Fortsetzungen nach `}` und Regex-Literale
	// müssen nachgescannt werden, sonst gilt `//` in `https://…` als Kommentar.
	const templateDepth: number[] = [];
	let prev: ts.SyntaxKind = ts.SyntaxKind.Unknown;
	let token = scanner.scan();
	while (token !== ts.SyntaxKind.EndOfFileToken) {
		if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
			blank(code, scanner.getTokenStart(), scanner.getTokenEnd(), out);
		} else if (token !== ts.SyntaxKind.WhitespaceTrivia && token !== ts.SyntaxKind.NewLineTrivia) {
			if (token === ts.SyntaxKind.TemplateHead) templateDepth.push(0);
			else if (token === ts.SyntaxKind.OpenBraceToken && templateDepth.length > 0) {
				templateDepth[templateDepth.length - 1]! += 1;
			} else if (token === ts.SyntaxKind.CloseBraceToken && templateDepth.length > 0) {
				if (templateDepth[templateDepth.length - 1] === 0) {
					token = scanner.reScanTemplateToken(false);
					if (token === ts.SyntaxKind.TemplateTail) templateDepth.pop();
				} else {
					templateDepth[templateDepth.length - 1]! -= 1;
				}
			} else if (
				(token === ts.SyntaxKind.SlashToken || token === ts.SyntaxKind.SlashEqualsToken) &&
				!endsExpression(prev)
			) {
				token = scanner.reScanSlashToken();
			}
			prev = token;
		}
		token = scanner.scan();
	}
	return out.join('');
}

/** Svelte-Datei: HTML-Kommentare und Kommentare in `<script>`-Blöcken ausblenden. */
export function blankSvelteComments(code: string): string {
	const out = code.split('');
	for (const m of code.matchAll(/<!--[\s\S]*?-->/g)) {
		blank(code, m.index, m.index + m[0].length, out);
	}
	let text = out.join('');
	for (const m of text.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g)) {
		const start = m.index + (m[1]?.length ?? 0);
		const inner = m[2] ?? '';
		const cleaned = blankJsComments(inner);
		text = text.slice(0, start) + cleaned + text.slice(start + inner.length);
	}
	return text;
}

/** Text mit ausgeblendeten Kommentaren je nach Dateityp. */
export function codeWithoutComments(path: string, code: string): string {
	if (isSvelteFile(path)) return blankSvelteComments(code);
	if (isScriptFile(path)) return blankJsComments(code);
	if (path.endsWith('.html')) return code.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
	if (path.endsWith('.css')) return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
	return code;
}

export interface Match {
	line: number;
	column: number;
	text: string;
	index: number;
}

/** Alle Treffer eines Musters (das Muster braucht das Flag `g`). */
export function findAll(text: string, pattern: RegExp, lines?: LineIndex): Match[] {
	const index = lines ?? new LineIndex(text);
	const out: Match[] = [];
	for (const m of text.matchAll(pattern)) {
		const pos = index.at(m.index);
		out.push({ line: pos.line, column: pos.column, text: m[0], index: m.index });
	}
	return out;
}

/** Kürzt einen Fund für Meldungen (fremder Text, B10). */
export function excerpt(text: string, max = 80): string {
	const oneLine = text.replace(/\s+/g, ' ').trim();
	return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
