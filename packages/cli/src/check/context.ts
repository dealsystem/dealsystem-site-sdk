// Gemeinsamer, zwischengespeicherter Zugriff der Regeln auf Quelle und Ausgabe.

import { buildCspDirectives, type ResolvedExternal } from '@dealsystem/site/config';
import { readSiteConfig, SITE_CONFIG_FILE, type SiteConfigResult } from '../project/siteConfig.js';
import { codeWithoutComments, isScriptFile, isSvelteFile } from './util/code.js';
import { parseHtml, type HtmlDoc } from './util/html.js';
import { LineIndex } from './util/lines.js';
import { parseModule, type ParsedModule } from './util/literal.js';
import { parseSvelte, type ParsedSvelte } from './util/svelte.js';
import type { CheckOptions, FileSet, RawFinding } from './types.js';

function isProbablyText(bytes: Uint8Array): boolean {
	const n = Math.min(bytes.length, 8000);
	for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
	return true;
}

const TEXT_EXTENSIONS = [
	'.svelte',
	'.ts',
	'.js',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
	'.json',
	'.html',
	'.htm',
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.md',
	'.txt',
	'.xml',
	'.svg',
	'.webmanifest',
	'.yml',
	'.yaml',
	'.env',
];

export function isTextPath(path: string): boolean {
	const base = path.split('/').pop() ?? path;
	return base.startsWith('.env') || TEXT_EXTENSIONS.some((ext) => base.endsWith(ext));
}

abstract class BaseContext {
	private readonly texts = new Map<string, string | null>();
	private readonly lineIndexes = new Map<string, LineIndex>();

	constructor(
		readonly files: FileSet,
		readonly options: CheckOptions,
	) {}

	paths(): string[] {
		return this.files.list().map((f) => f.path);
	}

	text(path: string): string | null {
		if (!this.texts.has(path)) this.texts.set(path, this.files.readText(path));
		return this.texts.get(path) ?? null;
	}

	/**
	 * Alle Textdateien (nach Endung; Binärdateien werden übersprungen). Mit `anyExtension` zählt jede Datei
	 * ohne Null-Bytes bis 5 MB (für die Secret-Suche: Schlüssel stehen auch in `.pem` oder ohne Endung).
	 */
	textFiles(filter: (path: string) => boolean = () => true, anyExtension = false): string[] {
		return this.files
			.list()
			.filter((entry) => {
				const p = entry.path;
				if (!filter(p)) return false;
				if (anyExtension ? entry.size > 5 * 1024 * 1024 : !isTextPath(p)) return false;
				const bytes = this.files.readBytes(p);
				return bytes !== null && isProbablyText(bytes);
			})
			.map((entry) => entry.path);
	}

	lines(path: string): LineIndex {
		let idx = this.lineIndexes.get(path);
		if (!idx) {
			idx = new LineIndex(this.text(path) ?? '');
			this.lineIndexes.set(path, idx);
		}
		return idx;
	}

	/** Fund an einem Zeichen-Offset. */
	at(path: string, offset: number, message: string, fix?: string): RawFinding {
		const pos = this.lines(path).at(offset);
		return { file: path, line: pos.line, column: pos.column, message, ...(fix !== undefined ? { fix } : {}) };
	}
}

export class SourceContext extends BaseContext {
	private readonly codes = new Map<string, string>();
	private readonly svelteAsts = new Map<string, ParsedSvelte | null>();
	private readonly modules = new Map<string, ParsedModule>();
	private siteConfigResult: SiteConfigResult | undefined;

	/** Text mit ausgeblendeten Kommentaren. */
	code(path: string): string {
		let c = this.codes.get(path);
		if (c === undefined) {
			c = codeWithoutComments(path, this.text(path) ?? '');
			this.codes.set(path, c);
		}
		return c;
	}

	svelte(path: string): ParsedSvelte | null {
		if (!this.svelteAsts.has(path)) this.svelteAsts.set(path, parseSvelte(this.text(path) ?? ''));
		return this.svelteAsts.get(path) ?? null;
	}

	module(path: string): ParsedModule | null {
		const text = this.text(path);
		if (text === null) return null;
		let mod = this.modules.get(path);
		if (!mod) {
			mod = parseModule(path, text);
			this.modules.set(path, mod);
		}
		return mod;
	}

	/** Svelte-Dateien unter `src/`. */
	svelteFiles(): string[] {
		return this.paths().filter((p) => p.startsWith('src/') && isSvelteFile(p));
	}

	/** Skript- und Svelte-Dateien unter `src/` (ohne erzeugte Typen). */
	codeFiles(): string[] {
		return this.paths().filter(
			(p) => p.startsWith('src/') && (isSvelteFile(p) || isScriptFile(p)) && !p.includes('/_generated/'),
		);
	}

	/** HTML-Dateien der Quelle (`src/app.html`, `static/**.html`). */
	htmlFiles(): string[] {
		return this.paths().filter(
			(p) => p.endsWith('.html') && (p.startsWith('src/') || p.startsWith('static/')),
		);
	}

	/** CSS-Dateien der Quelle. */
	cssFiles(): string[] {
		return this.paths().filter((p) => /\.(css|scss|sass|less)$/.test(p));
	}

	siteConfig(): SiteConfigResult {
		this.siteConfigResult ??= readSiteConfig(this.text(SITE_CONFIG_FILE));
		return this.siteConfigResult;
	}

	svelteConfigPath(): string | null {
		return ['svelte.config.js', 'svelte.config.ts'].find((p) => this.files.has(p)) ?? null;
	}

	json(path: string): { data: Record<string, unknown> | null; error: string | null } {
		const text = this.text(path);
		if (text === null) return { data: null, error: 'fehlt' };
		try {
			const data = JSON.parse(text) as unknown;
			if (typeof data !== 'object' || data === null || Array.isArray(data))
				return { data: null, error: 'kein Objekt' };
			return { data: data as Record<string, unknown>, error: null };
		} catch (e) {
			return { data: null, error: (e as Error).message };
		}
	}

	/** Installierte Version von `@dealsystem/site` laut Lockfile. */
	sdkVersion(): string | null {
		const lock = this.json('package-lock.json').data;
		const packages = lock?.packages as Record<string, { version?: unknown }> | undefined;
		const version = packages?.['node_modules/@dealsystem/site']?.version;
		return typeof version === 'string' ? version : null;
	}
}

export class OutputContext extends BaseContext {
	private readonly docs = new Map<string, HtmlDoc>();

	/**
	 * Deklaration für die erwartete CSP: aus `options.external` (Build-Host, aus dem Manifest) oder aus der Quelle
	 * desselben Laufs. `strict`: Abweichungen sind Fehler (neues SDK), sonst Warnungen. `null`: unbekannt.
	 */
	declared: { external: readonly ResolvedExternal[]; strict: boolean } | null = null;

	/** Erwartete CSP der fertigen Seiten; `null`, wenn die Deklaration unbekannt ist. */
	expectedCsp(apiOrigin: string): { csp: Record<string, string[]>; strict: boolean } | null {
		if (!this.declared) return null;
		return { csp: buildCspDirectives(this.declared.external, apiOrigin), strict: this.declared.strict };
	}

	html(path: string): HtmlDoc {
		let doc = this.docs.get(path);
		if (!doc) {
			doc = parseHtml(this.text(path) ?? '');
			this.docs.set(path, doc);
		}
		return doc;
	}

	/** Alle HTML-Seiten der Ausgabe. */
	pages(): string[] {
		return this.paths().filter((p) => p.endsWith('.html'));
	}

	/** Seiten ohne Fehler- und Ausweichseiten (404.html, 200.html, index.html der SPA-Ausweiche). */
	contentPages(): string[] {
		return this.pages().filter((p) => !['404.html', '200.html', 'fallback.html'].includes(p));
	}

	/** Host der Seite, falls bekannt. */
	siteHost(): string | null {
		if (!this.options.siteUrl) return null;
		try {
			return new URL(this.options.siteUrl).host.toLowerCase();
		} catch {
			return null;
		}
	}
}

/** Route einer Ausgabe-Datei: `index.html` → `/`, `a/index.html` und `a.html` → `/a`. */
export function routeOfPage(path: string): string {
	let p = path.replace(/\.html$/, '');
	if (p === 'index') return '/';
	if (p.endsWith('/index')) p = p.slice(0, -'/index'.length);
	return `/${p}`;
}

/** Route einer Quell-Datei unter `src/routes` ohne Gruppen: `src/routes/(app)/a/+page.svelte` → `/a`. */
export function routeOfSource(path: string): string {
	const parts = path
		.split('/')
		.slice(2, -1)
		.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
	return `/${parts.join('/')}`;
}
