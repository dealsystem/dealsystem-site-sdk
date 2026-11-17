// Fixture-Projekte: eine vollständige, gültige Basis (Quelle und Ausgabe) plus je Regel eine kleine
// Änderung, die sie bestehen bzw. scheitern lässt. Jede Variante wird als echter Ordner angelegt.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const BASE_SOURCE = join(FIXTURES, 'base');
export const BASE_OUTPUT = join(FIXTURES, 'output-base');

/** Pfad → neuer Inhalt; `null` löscht die Datei. */
export type Overlay = Record<string, string | null>;

const created: string[] = [];

export function materialize(base: string, overlay: Overlay = {}): string {
	const dir = mkdtempSync(join(tmpdir(), 'ds-cli-fixture-'));
	created.push(dir);
	cpSync(base, dir, { recursive: true });
	for (const [path, content] of Object.entries(overlay)) {
		const abs = join(dir, ...path.split('/'));
		if (content === null) {
			rmSync(abs, { force: true, recursive: true });
		} else {
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, content);
		}
	}
	return dir;
}

export function cleanupFixtures(): void {
	for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Eine Ausgabe-Seite im Stil der Basis-Fixture. */
export function page(opts: {
	title?: string;
	h1?: string;
	body?: string;
	lang?: string;
	head?: string;
	footer?: boolean;
	cookie?: boolean;
	base?: string;
}): string {
	const base = opts.base ?? './';
	const footer =
		opts.footer === false
			? ''
			: `<footer><a href="${base}impressum">Impressum</a> <a href="${base}datenschutz">Datenschutz</a></footer>`;
	const cookie = opts.cookie === false ? '' : '<div data-ds-cookie-banner></div>';
	return `<!doctype html><html${opts.lang === '' ? '' : ` lang="${opts.lang ?? 'de'}"`}><head><title>${opts.title ?? 'Testseite'}</title><meta name="description" content="Beschreibung" />${opts.head ?? ''}</head><body><main>${opts.h1 === '' ? '' : `<h1>${opts.h1 ?? 'Überschrift'}</h1>`}${opts.body ?? ''}</main>${footer}${cookie}</body></html>`;
}

/** Svelte-Startseite mit eigenem Inhalt, Kopf wie in der Basis. */
export function homePage(body: string, script = ''): string {
	return `<script lang="ts">\n\timport { LeadForm, MediaImage, Text, RichText, Link, ConsentGate, Tracking, MediaVideo, CollectionList, Seo } from '@dealsystem/site';\n${script}</script>\n\n<Seo title="Muster" />\n\n${body}\n`;
}
