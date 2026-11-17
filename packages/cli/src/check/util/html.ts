// Kleiner HTML-Baum für die Ausgabe-Regeln. Liest gebautes HTML, führt nichts aus.

import { Parser } from 'htmlparser2';
import { LineIndex } from './lines.js';

export interface HtmlElement {
	tag: string;
	attrs: Record<string, string>;
	children: HtmlNode[];
	parent: HtmlElement | null;
	/** Zeichen-Offset des öffnenden Tags. */
	start: number;
}

export interface HtmlText {
	text: string;
	parent: HtmlElement | null;
	start: number;
}

export type HtmlNode = HtmlElement | HtmlText;

export interface HtmlDoc {
	root: HtmlElement;
	lines: LineIndex;
	/** Alle Elemente in Dokument-Reihenfolge. */
	elements: HtmlElement[];
}

export function isElement(node: HtmlNode): node is HtmlElement {
	return 'tag' in node;
}

export function parseHtml(html: string): HtmlDoc {
	const root: HtmlElement = { tag: '#root', attrs: {}, children: [], parent: null, start: 0 };
	const elements: HtmlElement[] = [];
	let current = root;
	const parser: Parser = new Parser(
		{
			onopentag(name, attrs) {
				const el: HtmlElement = { tag: name, attrs, children: [], parent: current, start: parser.startIndex };
				current.children.push(el);
				elements.push(el);
				current = el;
			},
			ontext(text) {
				current.children.push({ text, parent: current, start: parser.startIndex });
			},
			onclosetag() {
				current = current.parent ?? root;
			},
		},
		{ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: true },
	);
	parser.write(html);
	parser.end();
	return { root, lines: new LineIndex(html), elements };
}

/** Sichtbarer Text eines Elements (ohne `script`, `style`, `template`). */
export function textContent(el: HtmlElement): string {
	let out = '';
	for (const child of el.children) {
		if (isElement(child)) {
			if (child.tag === 'script' || child.tag === 'style' || child.tag === 'template') continue;
			out += textContent(child);
		} else {
			out += child.text;
		}
	}
	return out;
}

export function ancestors(el: HtmlElement): HtmlElement[] {
	const out: HtmlElement[] = [];
	let p = el.parent;
	while (p && p.tag !== '#root') {
		out.push(p);
		p = p.parent;
	}
	return out;
}

/** Element oder ein Vorfahre ist für Hilfstechnik versteckt. */
export function isHidden(el: HtmlElement): boolean {
	for (const node of [el, ...ancestors(el)]) {
		if (node.attrs['aria-hidden'] === 'true' || 'hidden' in node.attrs || 'inert' in node.attrs) return true;
		if (node.tag === 'template' || node.tag === 'noscript') return true;
	}
	return false;
}

export function lineOf(doc: HtmlDoc, el: { start: number }): number {
	return doc.lines.at(el.start).line;
}
