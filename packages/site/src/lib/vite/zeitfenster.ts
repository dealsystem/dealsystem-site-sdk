// Findet `<Zeitfenster ab=… bis=…>` aus '@dealsystem/site' im Quelltext. Daraus entstehen die Grenzen im Manifest
// (`schedule`) und die Meldungen von QUA-009. Gelesen wird nur, nichts wird ausgeführt.
import { parse } from 'svelte/compiler';
import { parseZeitpunkt, type ZeitpunktFehler } from '../schedule.js';
import { staticAttribute, type Node } from './scan.js';

const PACKAGE = '@dealsystem/site';

/** Eine Grenze, wie sie im Quelltext steht. */
export interface FoundGrenze {
	name: 'ab' | 'bis';
	/** Fester Wert; `null`, wenn es ein Ausdruck ist (Variable, Berechnung). */
	value: string | null;
	/** Zeitpunkt in ms (UTC), wenn `value` gültig ist. */
	ms: number | null;
	fehler: ZeitpunktFehler | null;
	/** Offset im Quelltext. */
	start: number;
}

export interface FoundZeitfenster {
	start: number;
	grenzen: FoundGrenze[];
}

/** Alle `<Zeitfenster>` einer `.svelte`-Datei. Parst die Datei nicht, liefert eine leere Liste. */
export function scanZeitfenster(code: string): FoundZeitfenster[] {
	if (!code.includes(PACKAGE) || !code.includes('Zeitfenster')) return [];
	let ast: Record<string, unknown>;
	try {
		ast = parse(code, { modern: true }) as unknown as Record<string, unknown>;
	} catch {
		return [];
	}
	const local = new Set<string>();
	for (const key of ['instance', 'module']) {
		const script = ast[key] as { content?: { body?: Node[] } } | null | undefined;
		for (const statement of script?.content?.body ?? []) {
			if (statement.type !== 'ImportDeclaration') continue;
			if ((statement.source as { value?: unknown } | undefined)?.value !== PACKAGE) continue;
			for (const specifier of (statement.specifiers as Node[] | undefined) ?? []) {
				const imported = (specifier.imported as { name?: string } | undefined)?.name;
				const name = (specifier.local as { name?: string } | undefined)?.name;
				if (specifier.type === 'ImportSpecifier' && imported === 'Zeitfenster' && name) local.add(name);
			}
		}
	}
	if (local.size === 0) return [];

	const found: FoundZeitfenster[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value !== 'object' || value === null) return;
		const node = value as Node;
		if (node.type === 'Component' && local.has(node.name as string)) {
			const grenzen: FoundGrenze[] = [];
			for (const attribute of (node.attributes as Node[]) ?? []) {
				if (attribute.type !== 'Attribute') continue;
				const name = attribute.name as string;
				if (name !== 'ab' && name !== 'bis') continue;
				const raw = staticAttribute(attribute);
				const text = typeof raw === 'string' ? raw : null;
				const parsed = text !== null ? parseZeitpunkt(text) : null;
				grenzen.push({
					name,
					value: text,
					ms: parsed && 'ms' in parsed ? parsed.ms : null,
					fehler: parsed && 'fehler' in parsed ? parsed.fehler : null,
					start: attribute.start ?? node.start ?? 0,
				});
			}
			found.push({ start: node.start ?? 0, grenzen });
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'attributes' || key === 'parent') continue;
			if (typeof child === 'object' && child !== null) visit(child);
		}
	};
	visit(ast.fragment);
	return found;
}
