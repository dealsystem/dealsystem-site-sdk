// Findet Content-Slots im Quelltext: <Text key=… default=…>, <RichText key=…>,
// <Link key=…> und <MediaImage key=…> aus '@dealsystem/site'. Gelesen wird der Quelltext,
// nichts wird ausgeführt.
import { parse } from 'svelte/compiler';
import { explainSlotKey, SLOT_KEY_RULE } from '../keys.js';
import type { ContentSlotDef, ContentSlotLinkValue, ContentSlotType } from '../types.js';

const PACKAGE = '@dealsystem/site';
const SLOT_COMPONENTS = ['Text', 'RichText', 'MediaImage', 'Link'] as const;
type SlotComponent = (typeof SLOT_COMPONENTS)[number];

/** Ein Fehler im Quelltext, mit Fundstelle und Korrektur. */
export class SlotScanError extends Error {
	constructor(
		readonly file: string,
		readonly line: number,
		detail: string,
	) {
		super(`[dealsystem] ${file}:${line} ${detail}`);
		this.name = 'SlotScanError';
	}
}

/** Ein gefundener Slot mit Fundstelle. */
export interface FoundSlot extends ContentSlotDef {
	file: string;
	line: number;
	/**
	 * Bild-Slots: woher das Standardbild kommt, wenn der Quelltext es sicher sagt. `static`: Pfad unter
	 * `static/` (`default="/bilder/haus.jpg"`); `module`: Datei im Projekt, relativ zur Wurzel
	 * (`import bild from '$lib/bilder/haus.jpg'`). Den Pfad im Artefakt löst das Vite-Plugin beim Build auf.
	 */
	imageSource?: { kind: 'static' | 'module'; path: string; width?: number; height?: number };
}

export type Node = Record<string, unknown> & { type: string; start?: number };

function isNode(value: unknown): value is Node {
	return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

/** Standard-Importe von Dateien (`import bild from '$lib/bilder/haus.jpg'`): lokaler Name → Quelle. */
function defaultImports(ast: Record<string, unknown>): Map<string, string> {
	const imports = new Map<string, string>();
	for (const scriptKey of ['instance', 'module']) {
		const script = ast[scriptKey] as { content?: { body?: Node[] } } | null | undefined;
		for (const statement of script?.content?.body ?? []) {
			if (statement.type !== 'ImportDeclaration') continue;
			const source = (statement.source as { value?: unknown } | undefined)?.value;
			if (typeof source !== 'string') continue;
			for (const specifier of (statement.specifiers as Node[] | undefined) ?? []) {
				const local = (specifier.local as { name?: string } | undefined)?.name;
				if (specifier.type === 'ImportDefaultSpecifier' && local) imports.set(local, source);
			}
		}
	}
	return imports;
}

const IMAGE_FILE = /\.(?:jpe?g|png|webp|avif|gif|svg)$/i;

/** Datei im Projekt zu einem Import, relativ zur Wurzel. `null` bei Paketen, Abfragen (`?enhanced`) und Unklarem. */
function projectFileOf(source: string, file: string): string | null {
	if (!IMAGE_FILE.test(source)) return null;
	let path: string;
	if (source.startsWith('$lib/')) path = `src/lib/${source.slice(5)}`;
	else if (source.startsWith('./') || source.startsWith('../')) {
		path = `${file.split('/').slice(0, -1).join('/')}/${source}`;
	} else return null;
	const parts: string[] = [];
	for (const part of path.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (parts.length === 0) return null;
			parts.pop();
		} else parts.push(part);
	}
	return parts.join('/');
}

/** Lokale Namen der Slot-Komponenten, wie die Datei sie importiert. */
function importedNames(ast: Record<string, unknown>): Map<string, SlotComponent> {
	const names = new Map<string, SlotComponent>();
	for (const scriptKey of ['instance', 'module']) {
		const script = ast[scriptKey] as { content?: { body?: Node[] } } | null | undefined;
		for (const statement of script?.content?.body ?? []) {
			if (statement.type !== 'ImportDeclaration') continue;
			if ((statement.source as { value?: unknown } | undefined)?.value !== PACKAGE) continue;
			for (const specifier of (statement.specifiers as Node[] | undefined) ?? []) {
				if (specifier.type !== 'ImportSpecifier') continue;
				const imported = (specifier.imported as { name?: string } | undefined)?.name;
				const local = (specifier.local as { name?: string } | undefined)?.name;
				if (local && SLOT_COMPONENTS.includes(imported as SlotComponent)) {
					names.set(local, imported as SlotComponent);
				}
			}
		}
	}
	return names;
}

const DYNAMIC = Symbol('dynamic');
type Static = string | number | boolean | string[] | { [key: string]: Static } | typeof DYNAMIC;

function staticExpression(expression: Node): Static {
	if (expression.type === 'Literal') {
		const value = expression.value;
		return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
			? value
			: DYNAMIC;
	}
	if (expression.type === 'TemplateLiteral' && (expression.expressions as unknown[]).length === 0) {
		const quasis = expression.quasis as { value: { cooked: string } }[];
		return quasis.map((q) => q.value.cooked).join('');
	}
	if (expression.type === 'ArrayExpression') {
		const items = (expression.elements as (Node | null)[]).map((e) => (e ? staticExpression(e) : DYNAMIC));
		return items.every((item): item is string => typeof item === 'string') ? items : DYNAMIC;
	}
	if (expression.type === 'ObjectExpression') {
		const out: { [key: string]: Static } = {};
		for (const property of expression.properties as Node[]) {
			const key = property.key as Node | undefined;
			if (property.type !== 'Property' || property.computed || !key) return DYNAMIC;
			const name = key.type === 'Identifier' ? (key.name as string) : staticExpression(key);
			const value = staticExpression(property.value as Node);
			if (typeof name !== 'string' || value === DYNAMIC) return DYNAMIC;
			out[name] = value;
		}
		return out;
	}
	return DYNAMIC;
}

/** Wert eines Attributs, wenn er fest im Quelltext steht. */
/** @internal */
export function staticAttribute(attribute: Node): Static {
	const value = attribute.value;
	if (value === true) return true;
	if (Array.isArray(value)) {
		if (value.every((part) => isNode(part) && part.type === 'Text')) {
			return (value as { data: string }[]).map((part) => part.data).join('');
		}
		if (value.length === 1 && isNode(value[0]) && value[0].type === 'ExpressionTag') {
			return staticExpression(value[0].expression as Node);
		}
		return DYNAMIC;
	}
	if (isNode(value) && value.type === 'ExpressionTag') return staticExpression(value.expression as Node);
	return DYNAMIC;
}

function lineOf(code: string, offset: number): number {
	return code.slice(0, offset).split('\n').length;
}

/** Route einer Datei unter `src/routes`, in SvelteKit-Schreibweise. */
export function routeOfFile(file: string): string | undefined {
	const normalized = file.replace(/\\/g, '/');
	const match = /(?:^|\/)src\/routes(\/.*)?\/\+(?:page|layout)(?:@[^.]*)?\.svelte$/.exec(normalized);
	if (!match) return undefined;
	const segments = (match[1] ?? '').split('/').filter((s) => s && !/^\(.*\)$/.test(s));
	return `/${segments.join('/')}`;
}

/**
 * Liest die Slots einer `.svelte`-Datei. Wirft `SlotScanError`, wenn ein
 * Schlüssel nicht fest im Quelltext steht oder das Format nicht passt.
 */
export function scanSlots(code: string, file: string): FoundSlot[] {
	if (!code.includes(PACKAGE)) return [];
	let ast: Record<string, unknown>;
	try {
		ast = parse(code, { modern: true, filename: file }) as unknown as Record<string, unknown>;
	} catch {
		// Syntaxfehler meldet der Svelte-Compiler selbst, mit besserer Meldung.
		return [];
	}
	const names = importedNames(ast);
	if (names.size === 0) return [];
	const imports = defaultImports(ast);

	const route = routeOfFile(file);
	const found: FoundSlot[] = [];

	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value !== 'object' || value === null) return;
		const node = value as Node;
		if (node.type === 'Component' && names.has(node.name as string)) {
			const slot = readSlot(node, names.get(node.name as string)!);
			if (slot) found.push(slot);
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'attributes' || key === 'parent') continue;
			if (typeof child === 'object' && child !== null) visit(child);
		}
	};

	const readSlot = (node: Node, component: SlotComponent): FoundSlot | null => {
		const line = lineOf(code, node.start ?? 0);
		const attributes = new Map<string, Node>();
		for (const attribute of (node.attributes as Node[]) ?? []) {
			if (attribute.type === 'SpreadAttribute') {
				throw new SlotScanError(
					file,
					line,
					`<${String(node.name)}> verwendet {...props}. Schreibe key und default direkt an die Komponente, damit der Build sie lesen kann.`,
				);
			}
			if (attribute.type === 'Attribute') attributes.set(attribute.name as string, attribute);
		}
		const keyAttribute = attributes.get('key');
		if (!keyAttribute) return null; // <MediaImage src=…>, <RichText content=…>: kein Slot

		const key = staticAttribute(keyAttribute);
		if (typeof key !== 'string') {
			throw new SlotScanError(
				file,
				line,
				`<${String(node.name)}>: key muss eine feste Zeichenkette sein, z. B. key="start.hero.titel". Variablen und zusammengesetzte Werte gehen nicht.`,
			);
		}
		const invalid = explainSlotKey(key);
		if (invalid) {
			const proposal = invalid.suggestion ? ` Nimm "${invalid.suggestion}".` : '';
			throw new SlotScanError(
				file,
				line,
				`Der Schlüssel "${key}" ist ungültig: ${invalid.reasons.join('; ')}.${proposal} ${SLOT_KEY_RULE}`,
			);
		}

		const text = (name: string): string | undefined => {
			const attribute = attributes.get(name);
			if (!attribute) return undefined;
			const value = staticAttribute(attribute);
			if (typeof value !== 'string') {
				throw new SlotScanError(
					file,
					line,
					`Slot "${key}": ${name} muss eine feste Zeichenkette sein, damit der Build den Wert ans CRM melden kann.`,
				);
			}
			return value;
		};

		let type: ContentSlotType;
		let fallback: string | ContentSlotLinkValue | null;
		if (component === 'MediaImage') {
			type = 'image';
			fallback = null;
		} else if (component === 'Link') {
			type = 'link';
			const attribute = attributes.get('default');
			const value = attribute ? staticAttribute(attribute) : undefined;
			if (
				typeof value !== 'object' ||
				Array.isArray(value) ||
				typeof value.href !== 'string' ||
				typeof value.label !== 'string'
			) {
				throw new SlotScanError(
					file,
					line,
					`Slot "${key}": default muss ein festes Objekt mit href und label sein, z. B. default={{ href: '/kontakt', label: 'Kontakt aufnehmen' }}.`,
				);
			}
			fallback = { href: value.href, label: value.label, ...(value.newTab === true ? { newTab: true } : {}) };
		} else {
			const multiline = attributes.get('multiline');
			type =
				component === 'RichText'
					? 'richtext'
					: multiline && staticAttribute(multiline) !== false
						? 'textarea'
						: 'text';
			const value = text('default');
			if (value === undefined) {
				throw new SlotScanError(
					file,
					line,
					`Slot "${key}": default fehlt. Gib den Standardtext an, z. B. default="Ihr Meisterbetrieb für Bad und Heizung".`,
				);
			}
			fallback = value;
		}

		const slot: FoundSlot = { key, type, default: fallback, file, line };
		const label = text('label');
		const group = text('group');
		const help = text('help');
		if (label !== undefined) slot.label = label;
		if (group !== undefined) slot.group = group;
		if (help !== undefined) slot.help = help;
		if (route !== undefined) slot.route = route;
		if (component === 'MediaImage') {
			const source = imageSourceOf(attributes, imports);
			if (source) slot.imageSource = source;
		}

		const maxLength = attributes.get('maxLength');
		if (maxLength) {
			const value = staticAttribute(maxLength);
			if (typeof value === 'number' && Number.isInteger(value) && value > 0) slot.maxLength = value;
		}
		const required = attributes.get('required');
		if (required && staticAttribute(required) === true) slot.required = true;
		const aliases = attributes.get('aliases');
		if (aliases) {
			const value = staticAttribute(aliases);
			if (!Array.isArray(value)) {
				throw new SlotScanError(
					file,
					line,
					`Slot "${key}": aliases muss eine feste Liste sein, z. B. aliases={['start.titel']}.`,
				);
			}
			slot.aliases = value;
		}
		return slot;
	};

	visit(ast.fragment);
	return found;

	/** Woher das Standardbild eines Bild-Slots kommt, wenn der Quelltext es sicher sagt. */
	function imageSourceOf(
		attributes: Map<string, Node>,
		imported: Map<string, string>,
	): FoundSlot['imageSource'] | undefined {
		const attribute = attributes.get('default');
		if (!attribute) return undefined;
		let source: FoundSlot['imageSource'] | undefined;
		const value = staticAttribute(attribute);
		if (typeof value === 'string') {
			// Pfad unter `static/`; fremde Adressen und `//host` zählen nicht.
			if (/^\/(?!\/)[^?#]*$/.test(value) && IMAGE_FILE.test(value) && !value.includes('..'))
				source = { kind: 'static', path: value };
		} else {
			const raw = attribute.value;
			const tag = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
			const expression = isNode(tag) && tag.type === 'ExpressionTag' ? (tag.expression as Node) : undefined;
			const name = expression?.type === 'Identifier' ? (expression.name as string) : undefined;
			const from = name ? imported.get(name) : undefined;
			const path = from ? projectFileOf(from, file) : null;
			if (path) source = { kind: 'module', path };
		}
		if (!source) return undefined;
		for (const dimension of ['width', 'height'] as const) {
			const dim = attributes.get(dimension);
			const size = dim ? staticAttribute(dim) : undefined;
			if (typeof size === 'number' && Number.isInteger(size) && size > 0) source[dimension] = size;
		}
		return source;
	}
}

/**
 * Führt die Slots aller Dateien zusammen. Derselbe Schlüssel darf mehrfach
 * vorkommen, aber nur mit demselben Typ und demselben Standardwert.
 */
export function mergeSlots(found: readonly FoundSlot[]): ContentSlotDef[] {
	const byKey = new Map<string, FoundSlot>();
	for (const slot of found) {
		const first = byKey.get(slot.key);
		if (!first) {
			byKey.set(slot.key, slot);
			continue;
		}
		const where = `${first.file}:${first.line}`;
		if (first.type !== slot.type) {
			throw new SlotScanError(
				slot.file,
				slot.line,
				`Der Schlüssel "${slot.key}" wird schon in ${where} verwendet, dort als ${first.type}, hier als ${slot.type}. Vergib einen eigenen Schlüssel.`,
			);
		}
		if (JSON.stringify(first.default) !== JSON.stringify(slot.default)) {
			throw new SlotScanError(
				slot.file,
				slot.line,
				`Der Schlüssel "${slot.key}" wird schon in ${where} verwendet, dort mit einem anderen Standardwert. Gleiche die Werte an oder vergib einen eigenen Schlüssel.`,
			);
		}
	}
	return [...byKey.values()]
		.sort((a, b) => a.key.localeCompare(b.key))
		.map(({ file: _file, line: _line, imageSource: _source, ...slot }) => slot);
}
