// Dateimengen für den Regelkatalog: ein Ordner auf der Platte oder eine Speicher-Variante.
// Nur reguläre Dateien; Symlinks werden nie verfolgt (ein Tarball darf keine enthalten).

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileEntry, FileSet } from './types.js';

/** Ordner, die nie zur Quelle gehören (Abhängigkeiten, Build-Zwischenstände, lokale Kopien). */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'build',
	'.dealsystem',
	'.vercel',
	'.netlify',
	'.output',
]);

export interface WalkOptions {
	/** Ordnernamen, die übersprungen werden (auf jeder Ebene). Standard: keine. */
	ignoreDirs?: ReadonlySet<string>;
	/** Zusätzlicher Filter auf den relativen Pfad. */
	include?: (path: string) => boolean;
}

export interface WalkResult {
	files: FileEntry[];
	/** Symlinks und andere Sonderdateien, die übersprungen wurden. */
	skipped: string[];
}

export function walkDir(root: string, options: WalkOptions = {}): WalkResult {
	const files: FileEntry[] = [];
	const skipped: string[] = [];
	const ignore = options.ignoreDirs ?? new Set<string>();
	const visit = (abs: string, rel: string): void => {
		const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
		);
		for (const entry of entries) {
			const childRel = rel ? `${rel}/${entry.name}` : entry.name;
			const childAbs = join(abs, entry.name);
			if (entry.isSymbolicLink()) {
				skipped.push(childRel);
				continue;
			}
			if (entry.isDirectory()) {
				if (ignore.has(entry.name)) continue;
				visit(childAbs, childRel);
				continue;
			}
			if (!entry.isFile()) {
				skipped.push(childRel);
				continue;
			}
			if (options.include && !options.include(childRel)) continue;
			files.push({ path: childRel, size: lstatSync(childAbs).size });
		}
	};
	visit(root, '');
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { files, skipped };
}

/** Dateimenge über einen Ordner. Inhalte werden beim ersten Lesen zwischengespeichert. */
export function createDirFileSet(root: string, options: WalkOptions = { ignoreDirs: IGNORED_DIRS }): FileSet {
	const { files } = walkDir(root, options);
	const byPath = new Set(files.map((f) => f.path));
	const cache = new Map<string, Uint8Array>();
	const bytes = (path: string): Uint8Array | null => {
		if (!byPath.has(path)) return null;
		let data = cache.get(path);
		if (!data) {
			data = readFileSync(join(root, ...path.split('/')));
			cache.set(path, data);
		}
		return data;
	};
	return {
		list: () => files,
		has: (path) => byPath.has(path),
		readBytes: bytes,
		readText: (path) => {
			const data = bytes(path);
			return data ? Buffer.from(data).toString('utf8') : null;
		},
	};
}

/** Dateimenge aus dem Speicher (Tests, Werkzeuge). */
export function createMemoryFileSet(input: Record<string, string | Uint8Array>): FileSet {
	const entries = new Map<string, Uint8Array>();
	for (const [path, value] of Object.entries(input)) {
		entries.set(path, typeof value === 'string' ? Buffer.from(value, 'utf8') : value);
	}
	const files = [...entries.entries()]
		.map(([path, data]) => ({ path, size: data.byteLength }))
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return {
		list: () => files,
		has: (path) => entries.has(path),
		readBytes: (path) => entries.get(path) ?? null,
		readText: (path) => {
			const data = entries.get(path);
			return data ? Buffer.from(data).toString('utf8') : null;
		},
	};
}
