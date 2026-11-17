// Liest Svelte-Komponenten über den Svelte-Parser (kein Kompilieren, kein Ausführen).

import { parse } from 'svelte/compiler';
import { LineIndex } from './lines.js';

export interface SvelteAttr {
	name: string;
	/** `attribute` (`alt="…"`), `spread` (`{...props}`), `directive` (`bind:`, `on:`, `class:` …). */
	kind: 'attribute' | 'spread' | 'directive';
	/** Fester Wert; `true` bei Attribut ohne Wert; `null`, wenn der Wert ein Ausdruck ist. */
	value: string | true | null;
	start: number;
}

export interface SvelteElement {
	kind: 'element' | 'component';
	name: string;
	start: number;
	end: number;
	attributes: SvelteAttr[];
	/** Namen der umschließenden Elemente und Komponenten, außen zuerst. */
	ancestors: string[];
}

export interface SvelteText {
	data: string;
	start: number;
	ancestors: string[];
}

export interface ParsedSvelte {
	lines: LineIndex;
	elements: SvelteElement[];
	/** `{@html …}` */
	htmlTags: { start: number; ancestors: string[] }[];
	texts: SvelteText[];
	/** Inhalt der `<style>`-Blöcke mit Start-Offset. */
	styles: { content: string; start: number }[];
}

type AnyNode = { type?: string; start?: number; end?: number; [key: string]: unknown };

const ELEMENT_TYPES = new Set([
	'RegularElement',
	'SvelteElement',
	'SlotElement',
	'TitleElement',
	'SvelteHead',
	'SvelteBody',
	'SvelteWindow',
	'SvelteDocument',
	'SvelteFragment',
	'SvelteBoundary',
]);

function attrValue(value: unknown): string | true | null {
	if (value === true) return true;
	const parts = Array.isArray(value) ? value : [value];
	let out = '';
	for (const part of parts as AnyNode[]) {
		if (part?.type === 'Text') out += String(part.data ?? '');
		else return null;
	}
	return out;
}

function toAttrs(list: unknown): SvelteAttr[] {
	if (!Array.isArray(list)) return [];
	return (list as AnyNode[]).map((a) => {
		if (a.type === 'Attribute') {
			return { name: String(a.name), kind: 'attribute', value: attrValue(a.value), start: a.start ?? 0 };
		}
		if (a.type === 'SpreadAttribute')
			return { name: '...', kind: 'spread', value: null, start: a.start ?? 0 };
		return { name: String(a.name ?? a.type), kind: 'directive', value: null, start: a.start ?? 0 };
	});
}

/** Liefert `null`, wenn die Datei nicht parst (dann scheitert ohnehin der Build, BLD-001). */
export function parseSvelte(code: string): ParsedSvelte | null {
	let ast: AnyNode;
	try {
		ast = parse(code, { modern: true }) as unknown as AnyNode;
	} catch {
		return null;
	}
	const result: ParsedSvelte = {
		lines: new LineIndex(code),
		elements: [],
		htmlTags: [],
		texts: [],
		styles: [],
	};
	const seen = new Set<unknown>();
	const visit = (node: unknown, ancestors: string[]): void => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child, ancestors);
			return;
		}
		const n = node as AnyNode;
		let inner = ancestors;
		if (n.type === 'Component' || ELEMENT_TYPES.has(n.type ?? '')) {
			const name = n.type === 'SvelteHead' ? 'svelte:head' : String(n.name ?? n.type);
			result.elements.push({
				kind: n.type === 'Component' ? 'component' : 'element',
				name,
				start: n.start ?? 0,
				end: n.end ?? 0,
				attributes: toAttrs(n.attributes),
				ancestors,
			});
			inner = [...ancestors, name];
		} else if (n.type === 'HtmlTag') {
			result.htmlTags.push({ start: n.start ?? 0, ancestors });
		} else if (n.type === 'Text' && typeof n.data === 'string') {
			result.texts.push({ data: n.data, start: n.start ?? 0, ancestors });
		} else if (n.type === 'StyleSheet') {
			const content = n.content as { styles?: string; start?: number } | undefined;
			if (content?.styles !== undefined)
				result.styles.push({ content: content.styles, start: content.start ?? 0 });
			return;
		}
		for (const [key, value] of Object.entries(n)) {
			if (key === 'attributes' || key === 'metadata') continue;
			if (value && typeof value === 'object') visit(value, inner);
		}
	};
	visit(ast.fragment, []);
	visit(ast.css, []);
	return result;
}

export function getAttr(el: SvelteElement, name: string): SvelteAttr | undefined {
	return el.attributes.find((a) => a.name === name);
}

export function hasSpread(el: SvelteElement): boolean {
	return el.attributes.some((a) => a.kind === 'spread');
}
