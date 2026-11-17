// QUA-*, CNT-*: Größe, Links, Pflichtdateien, Formular- und Slot-Schlüssel, Agenten-Anleitung, Content-Slots.

import { gzipSync } from 'node:zlib';
import { mergeSlots, scanSlots, SlotScanError, type FoundSlot } from '@dealsystem/site/vite';
import type { OutputContext, SourceContext } from '../context.js';
import { routeOfPage, routeOfSource } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import { AGENTS_BLOCK_BEGIN, COMPONENT } from '../sdk.js';
import type { RawFinding } from '../types.js';
import { excerpt, findAll } from '../util/code.js';
import { lineOf } from '../util/html.js';
import { getAttr } from '../util/svelte.js';
import { resolveHref } from './privacy.js';

export const OUTPUT_LIMITS = {
	totalBytes: 200 * 1024 * 1024,
	files: 10_000,
	fileBytes: 25 * 1024 * 1024,
	jsGzipBytesPerPage: 300 * 1024,
} as const;

const MB = 1024 * 1024;
const mb = (n: number): string => (n / MB).toFixed(1).replace('.', ',');

// ------------------------------------------------------------------ QUA-001

const qua001 = outputRule('QUA-001', (ctx) => {
	const files = ctx.files.list();
	const total = files.reduce((n, f) => n + f.size, 0);
	const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
	const top = largest.map((f) => `${f.path} (${mb(f.size)} MB)`).join(', ');
	const out: RawFinding[] = [];
	if (total > OUTPUT_LIMITS.totalBytes) {
		out.push({
			file: null,
			message: `Die Seite ist zu groß (${mb(total)} MB, erlaubt 200 MB). Größte Dateien: ${top}.`,
		});
	}
	if (files.length > OUTPUT_LIMITS.files) {
		out.push({
			file: null,
			message: `Die Seite hat zu viele Dateien (${files.length}, erlaubt 10 000).`,
			fix: 'Fasse Dateien zusammen oder entferne ungenutzte Dateien aus `static/`.',
		});
	}
	for (const f of files.filter((x) => x.size > OUTPUT_LIMITS.fileBytes)) {
		out.push({
			file: f.path,
			message: `\`${f.path}\` ist zu groß (${mb(f.size)} MB, erlaubt 25 MB je Datei).`,
		});
	}
	return out;
});

// ------------------------------------------------------------------ QUA-002

function resolveAsset(ctx: OutputContext, ref: string, pageRoute: string): string | null {
	const path = resolveHref(ref, pageRoute);
	if (!path) return null;
	const rel = path.replace(/^\/+/, '');
	return ctx.files.has(rel) ? rel : null;
}

const IMPORT_CALL = /import\(\s*["']([^"']+\.js)["']\s*\)/g;

const qua002 = outputRule('QUA-002', (ctx) => {
	const sizes = new Map<string, number>();
	const gz = (path: string): number => {
		let n = sizes.get(path);
		if (n === undefined) {
			const bytes = ctx.files.readBytes(path);
			n = bytes ? gzipSync(bytes).byteLength : 0;
			sizes.set(path, n);
		}
		return n;
	};
	const out: RawFinding[] = [];
	for (const page of ctx.contentPages()) {
		const doc = ctx.html(page);
		const route = routeOfPage(page);
		const scripts = new Set<string>();
		for (const el of doc.elements) {
			const ref =
				el.tag === 'script'
					? el.attrs.src
					: el.tag === 'link' && (el.attrs.rel ?? '').includes('modulepreload')
						? el.attrs.href
						: undefined;
			if (ref) {
				const p = resolveAsset(ctx, ref, route);
				if (p) scripts.add(p);
			}
			if (el.tag === 'script' && !el.attrs.src) {
				const inline = el.children.map((c) => ('text' in c ? c.text : '')).join('');
				for (const m of inline.matchAll(IMPORT_CALL)) {
					const p = resolveAsset(ctx, m[1] ?? '', route);
					if (p) scripts.add(p);
				}
			}
		}
		const total = [...scripts].reduce((n, p) => n + gz(p), 0);
		if (total > OUTPUT_LIMITS.jsGzipBytesPerPage) {
			out.push({
				file: page,
				message: `Die Seite \`${route}\` lädt ${Math.round(total / 1024)} KB JavaScript (gzip, empfohlen höchstens 300 KB).`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ QUA-003

/** Pfade, die der Edge selbst ausliefert (Medien aus dem CRM). */
const EDGE_PREFIXES = ['/_ds/'];

function targetExists(ctx: OutputContext, path: string): boolean {
	const rel = path.replace(/^\/+/, '').replace(/\/+$/, '');
	if (rel === '') return ctx.files.has('index.html');
	return ctx.files.has(rel) || ctx.files.has(`${rel}.html`) || ctx.files.has(`${rel}/index.html`);
}

const qua003 = outputRule('QUA-003', (ctx) => {
	const out: RawFinding[] = [];
	if (!ctx.files.has('404.html')) {
		out.push({
			file: null,
			message: '`404.html` fehlt in der gebauten Seite.',
			fix: "Setze in svelte.config.js `adapter: adapter({ fallback: '404.html' })` wie im Starter.",
		});
	}
	const siteHost = ctx.siteHost();
	for (const page of ctx.pages()) {
		const doc = ctx.html(page);
		const route = routeOfPage(page);
		const seen = new Set<string>();
		for (const el of doc.elements) {
			if (el.tag !== 'a' || el.attrs.href === undefined) continue;
			let href = el.attrs.href.trim();
			if (siteHost) {
				const m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(href);
				if (m && m[1]?.toLowerCase() === siteHost) href = m[2] ?? '/';
			}
			const path = resolveHref(href.replace(/[?#].*$/, ''), route);
			if (path === null || href.startsWith('#') || EDGE_PREFIXES.some((p) => path.startsWith(p))) continue;
			if (targetExists(ctx, path) || seen.has(path)) continue;
			seen.add(path);
			out.push({
				file: page,
				line: lineOf(doc, el),
				message: `Der Link \`${excerpt(href, 100)}\` auf \`${route}\` führt ins Leere.`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ QUA-004

const qua004 = outputRule('QUA-004', (ctx) =>
	['sitemap.xml', 'robots.txt']
		.filter((f) => !ctx.files.has(f))
		.map((f) => ({ file: null, message: `\`${f}\` fehlt in der gebauten Seite.` })),
);

// ------------------------------------------------------------------ QUA-005

const configFindings = (ctx: SourceContext, kind: 'reachability' | 'key'): RawFinding[] =>
	ctx
		.siteConfig()
		.problems.filter((p) => p.kind === kind)
		.map((p) => ({
			file: 'dealsystem.config.ts',
			line: p.line,
			message: p.message,
			...(p.fix ? { fix: p.fix } : {}),
		}));

const qua005 = sourceRule('QUA-005', (ctx) => configFindings(ctx, 'reachability'));

// ------------------------------------------------------------------ QUA-006

const COLLECTION_CALL = /\b(getCollection|getEntry|collectionEntries)\s*\(\s*(['"`])([^'"`]*)\2/g;

/** `[dealsystem] datei:12 Text` → `Text` */
function slotErrorText(error: SlotScanError): string {
	return error.message.replace(/^\[dealsystem\]\s+\S+:\d+\s+/, '');
}

const qua006 = sourceRule('QUA-006', (ctx) => {
	const config = ctx.siteConfig();
	const out: RawFinding[] = configFindings(ctx, 'key');
	const funnelKeys = config.data ? new Set(config.data.funnels.map((f) => f.key)) : null;
	const collectionKeys = config.data ? new Set(config.data.collections.map((c) => c.key)) : null;
	const known = (set: Set<string> | null): string =>
		set && set.size > 0 ? [...set].map((k) => `\`${k}\``).join(', ') : 'keine';

	// Slots: dieselbe Prüfung wie das Vite-Plugin beim Build (`scanSlots`, `mergeSlots` aus dem SDK).
	const slots: FoundSlot[] = [];
	for (const path of ctx.svelteFiles()) {
		try {
			slots.push(...scanSlots(ctx.text(path) ?? '', path));
		} catch (error) {
			if (!(error instanceof SlotScanError)) continue; // Parse-Fehler meldet der Build (BLD-001).
			out.push({ file: path, line: error.line, message: slotErrorText(error) });
		}
	}
	try {
		mergeSlots(slots);
	} catch (error) {
		if (error instanceof SlotScanError)
			out.push({ file: error.file, line: error.line, message: slotErrorText(error) });
	}

	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (el.kind !== 'component') continue;
			const ref =
				el.name === COMPONENT.leadForm
					? { attr: getAttr(el, 'funnel'), keys: funnelKeys, kind: 'Das Formular', section: 'funnels' }
					: el.name === COMPONENT.collectionList
						? {
								attr: getAttr(el, 'collection'),
								keys: collectionKeys,
								kind: 'Die Sammlung',
								section: 'collections',
							}
						: null;
			if (!ref?.attr || typeof ref.attr.value !== 'string' || !ref.keys || ref.keys.has(ref.attr.value))
				continue;
			out.push(
				ctx.at(
					path,
					ref.attr.start,
					`${ref.kind} \`${ref.attr.value}\` gibt es in dealsystem.config.ts nicht (vorhanden: ${known(ref.keys)}).`,
					`Nutze einen vorhandenen Schlüssel oder lege \`${ref.section}['${ref.attr.value}']\` in dealsystem.config.ts an.`,
				),
			);
		}
	}
	if (collectionKeys) {
		for (const path of ctx.codeFiles()) {
			for (const m of ctx.code(path).matchAll(COLLECTION_CALL)) {
				const key = m[3] ?? '';
				if (collectionKeys.has(key)) continue;
				out.push(
					ctx.at(
						path,
						m.index,
						`\`${m[1]}('${key}')\`: Die Sammlung \`${key}\` gibt es in dealsystem.config.ts nicht (vorhanden: ${known(collectionKeys)}).`,
						`Nutze einen vorhandenen Schlüssel oder lege \`collections['${key}']\` in dealsystem.config.ts an.`,
					),
				);
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ QUA-007

const AGENTS_BLOCK_BEGIN_G = new RegExp(AGENTS_BLOCK_BEGIN.source, 'g');

const qua007 = sourceRule('QUA-007', (ctx) => {
	const sdk = ctx.sdkVersion();
	const text = ctx.text('AGENTS.md');
	if (text === null)
		return [
			{ file: 'AGENTS.md', message: 'AGENTS.md fehlt; dein Agent kennt die Regeln dieser Seite nicht.' },
		];
	const m = AGENTS_BLOCK_BEGIN.exec(text);
	if (!m)
		return [
			{
				file: 'AGENTS.md',
				message: 'AGENTS.md enthält keinen DealSystem-Block (`<!-- dealsystem:begin … -->`).',
			},
		];
	if (sdk && m[1] !== sdk) {
		return [
			{
				file: 'AGENTS.md',
				line: findAll(text, AGENTS_BLOCK_BEGIN_G)[0]?.line ?? null,
				message: `Die Agenten-Anleitung gehört zu SDK ${m[1]}, installiert ist ${sdk}.`,
			},
		];
	}
	return [];
});

// ------------------------------------------------------------------ CNT-001

/** Ab dieser Länge sollte ein Text im CRM änderbar sein. */
export const CONTENT_SLOT_MIN_LENGTH = 120;
const NON_CONTENT_ANCESTORS = new Set([
	'script',
	'style',
	'svelte:head',
	'title',
	'code',
	'pre',
	'svg',
	COMPONENT.text,
	COMPONENT.richText,
	COMPONENT.impressum,
	COMPONENT.datenschutz,
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const cnt001 = sourceRule('CNT-001', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		if (path.startsWith('src/routes/') && ['/impressum', '/datenschutz'].includes(routeOfSource(path)))
			continue;
		for (const t of ctx.svelte(path)?.texts ?? []) {
			const text = t.data.replace(/\s+/g, ' ').trim();
			if (t.ancestors.some((a) => NON_CONTENT_ANCESTORS.has(a))) continue;
			const offset = t.start + (t.data.length - t.data.trimStart().length);
			// Überschriften gliedern die Seite: Der Kunde will sie umbenennen können, auch wenn sie kurz sind.
			const heading = t.ancestors.findLast((a) => HEADINGS.has(a));
			if (heading && /\p{L}{2,}/u.test(text)) {
				out.push(
					ctx.at(
						path,
						offset,
						`Feste Überschrift in \`${path}\`: „${excerpt(text, 60)}“ ist im CRM nicht änderbar.`,
						`Schreibe sie als Slot: \`<Text key="seite.bereich.titel" default="${excerpt(text, 40)}" as="${heading}" />\`.`,
					),
				);
				continue;
			}
			if (text.length < CONTENT_SLOT_MIN_LENGTH) continue;
			out.push(
				ctx.at(path, offset, `Fester Text in \`${path}\`: „${excerpt(text, 60)}“ ist im CRM nicht änderbar.`),
			);
		}
	}
	return out;
});

// ------------------------------------------------------------------ CNT-002

/** Muster für Firmendaten, die aus dem CRM kommen sollen. Bewusst eng: lieber ein Fund zu wenig als Fehlalarme. */
const COMPANY_DATA: readonly { label: string; pattern: RegExp }[] = [
	{ label: 'E-Mail-Adresse', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
	{ label: 'Adresse', pattern: /\b[0-9]{5}\s+\p{Lu}\p{Ll}{2,}/u },
	{
		label: 'Telefonnummer',
		pattern: /(?:\+49|0049|\(0|(?<![0-9.,:])0)[1-9][0-9]{1,4}\)?[\s/-]{0,3}[0-9]{2,}(?:[\s-]?[0-9]{2,})*/,
	},
];
const COMPANY_DATA_IGNORED = new Set(['script', 'style', 'svelte:head', 'title', 'code', 'pre', 'svg']);

const cnt002 = sourceRule('CNT-002', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		if (path.startsWith('src/routes/') && ['/impressum', '/datenschutz'].includes(routeOfSource(path)))
			continue;
		const ast = ctx.svelte(path);
		if (!ast) continue;
		for (const t of ast.texts) {
			if (t.ancestors.some((a) => COMPANY_DATA_IGNORED.has(a))) continue;
			for (const { label, pattern } of COMPANY_DATA) {
				const m = pattern.exec(t.data);
				if (!m) continue;
				// Telefonnummern haben mindestens sieben Ziffern; Jahreszahlen und Preise nicht.
				if (label === 'Telefonnummer' && m[0].replace(/\D/g, '').length < 7) continue;
				out.push(
					ctx.at(
						path,
						t.start + m.index,
						`Feste ${label} in \`${path}\`: „${excerpt(m[0].trim(), 60)}“. Ändert der Kunde sie im CRM, bleibt hier die alte stehen.`,
					),
				);
				break;
			}
		}
		for (const el of ast.elements) {
			if (el.kind !== 'element' || el.name.toLowerCase() !== 'a') continue;
			const href = el.attributes.find((a) => a.kind === 'attribute' && a.name.toLowerCase() === 'href');
			if (typeof href?.value !== 'string') continue;
			const m = /^(mailto|tel):(.+)/i.exec(href.value.trim());
			if (!m) continue;
			out.push(
				ctx.at(
					path,
					el.start,
					`Feste ${m[1]!.toLowerCase() === 'tel' ? 'Telefonnummer' : 'E-Mail-Adresse'} im Link in \`${path}\`: „${excerpt(m[2]!, 60)}“. Ändert der Kunde sie im CRM, bleibt hier die alte stehen.`,
				),
			);
		}
	}
	return out;
});

export const qualitySourceRules: SourceRule[] = [qua005, qua006, qua007, cnt001, cnt002];
export const qualityOutputRules: OutputRule[] = [qua001, qua002, qua003, qua004];
