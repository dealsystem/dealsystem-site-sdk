// Welche Dateien hochgeladen werden: Positiv-Liste. Alles andere bleibt lokal
// (insbesondere `.env*`, `node_modules`, `.git`, `.svelte-kit`, `build`, `.npmrc`).
// `check` prüft lokal genau diese Menge, damit lokal und auf dem Build-Host dasselbe Ergebnis entsteht.

import { createDirFileSet, IGNORED_DIRS, walkDir } from '../check/fileset.js';
import type { FileEntry, FileSet } from '../check/types.js';

/** Einzelne Dateien im Projektordner. */
export const UPLOAD_ROOT_FILES: ReadonlySet<string> = new Set([
	'package.json',
	'package-lock.json',
	'svelte.config.js',
	'svelte.config.ts',
	'vite.config.js',
	'vite.config.ts',
	'dealsystem.config.ts',
	'tsconfig.json',
	'jsconfig.json',
	'AGENTS.md',
	'README.md',
]);

/** Ordner, die vollständig mitgehen. */
export const UPLOAD_DIRS: readonly string[] = ['src', 'static'];

/** Grenzen laut Konzept 5.2. */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** Punkt-Dateien und -Ordner gehen nicht mit; `.well-known` unter `static/` ist die Ausnahme. */
function isAllowedDotSegment(segments: string[]): boolean {
	return segments.every(
		(seg, i) => !seg.startsWith('.') || (seg === '.well-known' && i === 1 && segments[0] === 'static'),
	);
}

export function isUploadPath(path: string): boolean {
	const segments = path.split('/');
	if (segments.some((s) => s === '' || s === '..' || s === '.')) return false;
	if (segments.some((s) => s.startsWith('.env'))) return false;
	if (segments.length === 1) return UPLOAD_ROOT_FILES.has(path);
	if (!UPLOAD_DIRS.includes(segments[0] ?? '')) return false;
	if (segments.some((s) => IGNORED_DIRS.has(s))) return false;
	return isAllowedDotSegment(segments);
}

export interface UploadSelection {
	files: FileEntry[];
	/** Dateien, die nicht mitgehen, obwohl sie in einem Upload-Ordner liegen (Symlinks, Punkt-Dateien, `.env`). */
	excluded: string[];
	totalBytes: number;
}

export function selectUploadFiles(projectDir: string): UploadSelection {
	const all = walkDir(projectDir, { ignoreDirs: IGNORED_DIRS });
	const files = all.files.filter((f) => isUploadPath(f.path));
	const excluded = [
		...all.skipped,
		...all.files
			.filter((f) => !isUploadPath(f.path) && UPLOAD_DIRS.includes(f.path.split('/')[0] ?? ''))
			.map((f) => f.path),
	].sort();
	return { files, excluded, totalBytes: files.reduce((n, f) => n + f.size, 0) };
}

/** Dateimenge genau der Upload-Dateien (für `check` lokal). */
export function createUploadFileSet(projectDir: string): FileSet {
	return createDirFileSet(projectDir, { ignoreDirs: IGNORED_DIRS, include: isUploadPath });
}
