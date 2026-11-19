// Reihenfolge der Content-Slots, wie sie beim Rendern erscheinen (`position` im Manifest). Statisch aus dem
// Quelltext, nichts wird ausgeführt: je Route das Haupt-Layout, die verschachtelten Layouts und an der Stelle von
// `{@render children()}` die Seite; eigene Komponenten (`$lib/…`, relative Importe) dort, wo sie stehen. Routen in
// der Reihenfolge von `manifest.routes`; ein Slot zählt bei seinem ersten Vorkommen. Was von keiner Route aus
// erreichbar ist, folgt danach in Datei- und Quelltext-Reihenfolge. Gleiche Dateien ergeben immer dieselben Zahlen.
import { parse } from 'svelte/compiler';
import { routeOfFile, type FoundSlot, type Node } from './scan.js';

type OutlineItem =
	| { kind: 'slot'; key: string; at: number }
	| { kind: 'component'; file: string; at: number }
	| { kind: 'children'; at: number };

/** Eine Datei des Projekts: Pfad relativ zur Wurzel (`src/routes/+page.svelte`), Quelltext, gefundene Slots. */
export interface OrderInput {
	file: string;
	code: string;
	slots: readonly FoundSlot[];
}

/** `$lib/…` oder relativer Import einer `.svelte`-Datei als Pfad relativ zur Wurzel, sonst `null`. */
function componentFileOf(source: string, from: string): string | null {
	if (!source.endsWith('.svelte')) return null;
	let path: string;
	if (source.startsWith('$lib/')) path = `src/lib/${source.slice(5)}`;
	else if (source.startsWith('./') || source.startsWith('../'))
		path = `${from.split('/').slice(0, -1).join('/')}/${source}`;
	else return null;
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

/** `{@render children()}`, `{@render children?.()}` oder `{@render props.children()}`. */
function rendersChildren(node: Node): boolean {
	let expression = node.expression as Node | undefined;
	if (expression?.type === 'ChainExpression') expression = expression.expression as Node;
	if (expression?.type !== 'CallExpression') return false;
	const callee = expression.callee as Node;
	if (callee.type === 'Identifier') return callee.name === 'children';
	return callee.type === 'MemberExpression' && (callee.property as Node)?.name === 'children';
}

/** Slots, eigene Komponenten und die Stelle der Kind-Seite einer Datei, nach Stelle im Quelltext. */
export function outlineFile(input: OrderInput): OutlineItem[] {
	const items: OutlineItem[] = input.slots.map((s) => ({ kind: 'slot', key: s.key, at: s.offset ?? 0 }));
	let ast: Record<string, unknown>;
	try {
		ast = parse(input.code, { modern: true, filename: input.file }) as unknown as Record<string, unknown>;
	} catch {
		return items;
	}
	const components = new Map<string, string>();
	for (const scriptKey of ['instance', 'module']) {
		const script = ast[scriptKey] as { content?: { body?: Node[] } } | null | undefined;
		for (const statement of script?.content?.body ?? []) {
			if (statement.type !== 'ImportDeclaration') continue;
			const source = (statement.source as { value?: unknown } | undefined)?.value;
			const file = typeof source === 'string' ? componentFileOf(source, input.file) : null;
			if (!file) continue;
			for (const specifier of (statement.specifiers as Node[] | undefined) ?? []) {
				const local = (specifier.local as { name?: string } | undefined)?.name;
				if (specifier.type === 'ImportDefaultSpecifier' && local) components.set(local, file);
			}
		}
	}
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value !== 'object' || value === null) return;
		const node = value as Node;
		const at = node.start ?? 0;
		if (node.type === 'Component' && components.has(node.name as string)) {
			items.push({ kind: 'component', file: components.get(node.name as string)!, at });
		} else if (node.type === 'RenderTag' && rendersChildren(node)) {
			items.push({ kind: 'children', at });
		} else if (node.type === 'SlotElement' && !(node.attributes as Node[] | undefined)?.length) {
			items.push({ kind: 'children', at });
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'parent') continue;
			if (typeof child === 'object' && child !== null) visit(child);
		}
	};
	visit(ast.fragment);
	// Bei gleicher Stelle (Slot-Komponente ist kein eigener Import) bleibt die Reihenfolge stabil.
	return items.sort((a, b) => a.at - b.at);
}

const PAGE = /^src\/routes(?:\/.*)?\/\+page(?:@[^.]*)?\.svelte$/;

/** Layouts von außen nach innen, die für eine Seite gelten, dann die Seite selbst. */
function chainOf(page: string, known: ReadonlySet<string>): string[] {
	const dirs = page.split('/').slice(0, -1);
	const chain: string[] = [];
	for (let i = 2; i <= dirs.length; i++) {
		const layout = `${dirs.slice(0, i).join('/')}/+layout.svelte`;
		if (known.has(layout)) chain.push(layout);
	}
	chain.push(page);
	return chain;
}

/**
 * `position` je Slot-Schlüssel, ab 1, lückenlos: Reihenfolge des ersten Vorkommens beim Rendern. Siehe Kopf der Datei.
 */
export function slotPositions(inputs: readonly OrderInput[]): Map<string, number> {
	const byFile = new Map(inputs.map((input) => [input.file, input]));
	const outlines = new Map<string, OutlineItem[]>();
	const outline = (file: string): OutlineItem[] => {
		let items = outlines.get(file);
		if (!items) {
			const input = byFile.get(file);
			items = input ? outlineFile(input) : [];
			outlines.set(file, items);
		}
		return items;
	};

	const positions = new Map<string, number>();
	const place = (key: string): void => {
		if (!positions.has(key)) positions.set(key, positions.size + 1);
	};
	const emit = (file: string, rest: readonly string[], stack: Set<string>): void => {
		if (stack.has(file)) return; // Komponente bindet sich selbst ein
		stack.add(file);
		let childrenRendered = rest.length === 0;
		for (const item of outline(file)) {
			if (item.kind === 'slot') place(item.key);
			else if (item.kind === 'component') emit(item.file, [], stack);
			else if (!childrenRendered) {
				childrenRendered = true;
				emit(rest[0]!, rest.slice(1), stack);
			}
		}
		// Layout ohne `{@render children()}`: die Seite trotzdem mitzählen, hinten.
		if (!childrenRendered) emit(rest[0]!, rest.slice(1), stack);
		stack.delete(file);
	};

	const known = new Set(byFile.keys());
	const pages = inputs
		.map((input) => input.file)
		.filter((file) => PAGE.test(file))
		.map((file) => ({ file, route: routeOfFile(file) ?? '' }))
		.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.file < b.file ? -1 : 1));
	for (const page of pages) {
		const [first, ...rest] = chainOf(page.file, known);
		emit(first!, rest, new Set());
	}

	// Von keiner Route aus erreichbar (Fehlerseite, nicht eingebundene Komponente): Datei, dann Stelle.
	const rest = [...inputs]
		.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
		.flatMap((input) => [...input.slots].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0)));
	for (const slot of rest) place(slot.key);
	return positions;
}
