// A11Y-*: statisch prüfbare Teile von WCAG 2.1 AA. axe-core folgt in Phase 2 (Stufe `browser`).

import type { SourceContext } from '../context.js';
import { routeOfPage } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import { COMPONENT } from '../sdk.js';
import type { RawFinding } from '../types.js';
import { findAll } from '../util/code.js';
import { contrastRatio, parseColor } from '../util/color.js';
import {
	ancestors,
	isHidden,
	lineOf,
	parseHtml,
	textContent,
	type HtmlDoc,
	type HtmlElement,
} from '../util/html.js';
import { getAttr, hasSpread } from '../util/svelte.js';

// ------------------------------------------------------------------ A11Y-001

function htmlLangMissing(doc: HtmlDoc): HtmlElement | 'no-html' | null {
	const html = doc.elements.find((e) => e.tag === 'html');
	if (!html) return 'no-html';
	return (html.attrs.lang ?? '').trim() ? null : html;
}

const a11y001Source = sourceRule('A11Y-001', (ctx) => {
	const path = 'src/app.html';
	const text = ctx.text(path);
	if (text === null)
		return [
			{
				file: path,
				message: '`src/app.html` fehlt.',
				fix: 'Stelle `src/app.html` aus dem Starter wieder her.',
			},
		];
	const doc = parseHtml(text);
	const missing = htmlLangMissing(doc);
	if (!missing) return [];
	return [
		{
			file: path,
			line: missing === 'no-html' ? null : lineOf(doc, missing),
			message: '`<html>` hat kein `lang`-Attribut.',
		},
	];
});

const a11y001Output = outputRule('A11Y-001', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.pages()) {
		const missing = htmlLangMissing(ctx.html(page));
		if (missing)
			out.push({ file: page, message: `Die Seite \`${routeOfPage(page)}\` hat kein \`<html lang>\`.` });
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-002

const a11y002Source = sourceRule('A11Y-002', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (el.kind === 'element' && el.name === 'img') {
				out.push(ctx.at(path, el.start, `\`${path}\` nutzt \`<img>\` statt \`<MediaImage>\`.`));
			} else if (
				(el.name === 'enhanced:img' || (el.kind === 'component' && el.name === COMPONENT.mediaImage)) &&
				!hasSpread(el)
			) {
				if (el.name === COMPONENT.mediaImage && getAttr(el, 'media')) continue; // Alternativtext kommt aus dem CMS.
				const alt = getAttr(el, 'alt');
				if (!alt) {
					out.push(
						ctx.at(
							path,
							el.start,
							`\`<${el.name}>\` in \`${path}\` hat kein \`alt\`.`,
							'Beschreibe das Bild in `alt="…"`. Rein dekorativ: `alt="" decorative`.',
						),
					);
				} else if (alt.value === '' && !getAttr(el, 'decorative')) {
					out.push(
						ctx.at(
							path,
							el.start,
							`\`<${el.name}>\` in \`${path}\` hat ein leeres \`alt\` ohne \`decorative\`.`,
							'Beschreibe das Bild in `alt="…"` oder ergänze `decorative`, wenn es rein dekorativ ist.',
						),
					);
				}
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		const doc = parseHtml(ctx.code(path));
		for (const el of doc.elements.filter((e) => e.tag === 'img' && e.attrs.alt === undefined)) {
			out.push({ file: path, line: lineOf(doc, el), message: `\`<img>\` in \`${path}\` hat kein \`alt\`.` });
		}
	}
	return out;
});

const a11y002Output = outputRule('A11Y-002', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.pages()) {
		const doc = ctx.html(page);
		for (const el of doc.elements) {
			const needsAlt =
				el.tag === 'img' ||
				el.tag === 'area' ||
				(el.tag === 'input' && (el.attrs.type ?? '').toLowerCase() === 'image');
			if (needsAlt && el.attrs.alt === undefined && el.attrs['aria-label'] === undefined && !isHidden(el)) {
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `Ein Bild auf \`${routeOfPage(page)}\` hat kein \`alt\` (\`${el.attrs.src ?? ''}\`).`,
				});
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-003

const a11y003 = outputRule('A11Y-003', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.contentPages()) {
		const doc = ctx.html(page);
		const route = routeOfPage(page);
		const headings = doc.elements.filter((e) => /^h[1-6]$/.test(e.tag) && !isHidden(e));
		const h1 = headings.filter((h) => h.tag === 'h1');
		if (h1.length !== 1) {
			out.push({
				file: page,
				line: h1[1] ? lineOf(doc, h1[1]) : null,
				message: `Die Seite \`${route}\` hat ${h1.length} \`<h1>\`, erwartet ist genau eine.`,
				fix:
					h1.length === 0
						? 'Gib der Seite eine Hauptüberschrift `<h1>`.'
						: 'Mache die weiteren `<h1>` zu `<h2>`.',
			});
		}
		let prev = 0;
		for (const h of headings) {
			const level = Number(h.tag.slice(1));
			if (prev > 0 && level > prev + 1) {
				out.push({
					file: page,
					line: lineOf(doc, h),
					message: `Seite \`${route}\`: Überschriften springen von h${prev} auf h${level}.`,
					fix: `Nutze \`<h${prev + 1}>\` (die nächste Ebene) und gestalte die Größe per CSS.`,
				});
			}
			prev = level;
		}
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-004

const UNLABELED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

const a11y004 = outputRule('A11Y-004', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.pages()) {
		const doc = ctx.html(page);
		const labelFor = new Set(
			doc.elements.filter((e) => e.tag === 'label' && e.attrs.for).map((e) => e.attrs.for),
		);
		for (const el of doc.elements) {
			if (!['input', 'select', 'textarea'].includes(el.tag)) continue;
			if (el.tag === 'input' && UNLABELED_INPUT_TYPES.has((el.attrs.type ?? 'text').toLowerCase())) continue;
			if (isHidden(el)) continue;
			const labelled =
				(el.attrs['aria-label'] ?? '').trim() !== '' ||
				(el.attrs['aria-labelledby'] ?? '').trim() !== '' ||
				(el.attrs.title ?? '').trim() !== '' ||
				(el.attrs.id !== undefined && labelFor.has(el.attrs.id)) ||
				ancestors(el).some((a) => a.tag === 'label');
			if (!labelled) {
				const name = el.attrs.name ?? el.attrs.id ?? el.tag;
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `Das Feld \`${name}\` auf \`${routeOfPage(page)}\` hat keine Beschriftung.`,
				});
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-005

const VAGUE_LINK_TEXTS = new Set([
	'hier',
	'hier klicken',
	'klick hier',
	'klicke hier',
	'klicken sie hier',
	'click here',
	'here',
	'link',
	'mehr',
	'more',
]);

function accessibleName(el: HtmlElement): string {
	const aria = (el.attrs['aria-label'] ?? '').trim();
	if (aria) return aria;
	if ((el.attrs['aria-labelledby'] ?? '').trim()) return '(aria-labelledby)';
	const text = textContent(el).replace(/\s+/g, ' ').trim();
	if (text) return text;
	const collect = (node: HtmlElement): string[] =>
		node.children.flatMap((c) =>
			'tag' in c
				? [
						...(c.tag === 'img' || c.tag === 'svg' ? [c.attrs.alt ?? c.attrs['aria-label'] ?? ''] : []),
						...collect(c),
					]
				: [],
		);
	const alt = collect(el).join(' ').trim();
	if (alt) return alt;
	return (el.attrs.title ?? '').trim();
}

const a11y005 = outputRule('A11Y-005', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.pages()) {
		const doc = ctx.html(page);
		for (const el of doc.elements) {
			const isLink = el.tag === 'a' && el.attrs.href !== undefined;
			if ((!isLink && el.tag !== 'button') || isHidden(el)) continue;
			const name = accessibleName(el);
			const what = isLink ? `Der Link \`${el.attrs.href ?? ''}\`` : 'Eine Schaltfläche';
			if (!name) {
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `${what} auf \`${routeOfPage(page)}\` hat keinen Text.`,
				});
			} else if (isLink && VAGUE_LINK_TEXTS.has(name.toLowerCase().replace(/[.!:…]+$/, ''))) {
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `${what} auf \`${routeOfPage(page)}\` hat nur den Text „${name}“.`,
					fix: 'Beschreibe das Ziel im Linktext, z. B. „Alle Angebote ansehen“.',
				});
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-006

const CUSTOM_PROP = /(--color-[a-z0-9-]+)\s*:\s*([^;}]+)/gi;

function collectTokens(ctx: SourceContext): Map<string, { value: string; file: string; line: number }> {
	const tokens = new Map<string, { value: string; file: string; line: number }>();
	const scan = (file: string, text: string, offset: number): void => {
		for (const m of text.matchAll(CUSTOM_PROP)) {
			const name = (m[1] ?? '').toLowerCase();
			if (!tokens.has(name))
				tokens.set(name, {
					value: (m[2] ?? '').trim(),
					file,
					line: ctx.lines(file).at(offset + m.index).line,
				});
		}
	};
	for (const path of ctx.cssFiles()) scan(path, ctx.code(path), 0);
	for (const path of ctx.svelteFiles())
		for (const s of ctx.svelte(path)?.styles ?? []) scan(path, s.content, s.start);
	return tokens;
}

function resolveToken(tokens: Map<string, { value: string }>, name: string, depth = 0): string | null {
	const v = tokens.get(name)?.value;
	if (!v || depth > 5) return null;
	const ref = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(v);
	return ref?.[1] ? resolveToken(tokens, ref[1].toLowerCase(), depth + 1) : v;
}

/** Text-auf-Hintergrund-Paare: `--color-on-<x>` auf `--color-<x>`, `--color-text` auf `--color-background`. */
function tokenPairs(tokens: Map<string, unknown>): [string, string][] {
	const pairs: [string, string][] = [];
	for (const name of tokens.keys()) {
		const m = /^--color-on-(.+)$/.exec(name);
		if (m && tokens.has(`--color-${m[1]}`)) pairs.push([name, `--color-${m[1]}`]);
	}
	const bg = ['--color-background', '--color-bg', '--color-surface'].find((n) => tokens.has(n));
	for (const fg of [
		'--color-text',
		'--color-foreground',
		'--color-fg',
		'--color-text-muted',
		'--color-muted',
	]) {
		if (bg && tokens.has(fg)) pairs.push([fg, bg]);
	}
	return pairs;
}

const a11y006 = sourceRule('A11Y-006', (ctx) => {
	const tokens = collectTokens(ctx);
	const out: RawFinding[] = [];
	for (const [fg, bg] of tokenPairs(tokens)) {
		const a = parseColor(resolveToken(tokens, fg) ?? '');
		const b = parseColor(resolveToken(tokens, bg) ?? '');
		if (!a || !b) continue;
		const ratio = contrastRatio(a, b);
		if (ratio >= 4.5) continue;
		const at = tokens.get(fg);
		out.push({
			file: at?.file ?? null,
			line: at?.line ?? null,
			message: `Kontrast ${ratio.toFixed(2).replace('.', ',')}:1 zwischen \`${fg}\` und \`${bg}\` reicht nicht. Mindestens 4,5:1.`,
			fix: `Mache \`${fg}\` dunkler oder heller, bis der Kontrast zu \`${bg}\` mindestens 4,5:1 beträgt.`,
		});
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-007

const OUTLINE_NONE = /outline\s*:\s*(?:none|0(?:px)?)\s*(?:!important)?\s*[;}]/gi;

const a11y007 = sourceRule('A11Y-007', (ctx) => {
	const out: RawFinding[] = [];
	const cssChunks: { file: string; text: string; offset: number }[] = [];
	for (const path of ctx.cssFiles()) cssChunks.push({ file: path, text: ctx.code(path), offset: 0 });
	for (const path of ctx.svelteFiles())
		for (const s of ctx.svelte(path)?.styles ?? [])
			cssChunks.push({ file: path, text: s.content, offset: s.start });
	for (const chunk of cssChunks) {
		if (/:focus-visible/.test(chunk.text)) continue; // Ersatz für den Fokus vorhanden.
		for (const m of chunk.text.matchAll(OUTLINE_NONE)) {
			out.push(
				ctx.at(
					chunk.file,
					chunk.offset + m.index,
					`\`outline: none\` in \`${chunk.file}\` ohne \`:focus-visible\`-Ersatz.`,
					'Entferne `outline: none` oder ergänze eine sichtbare `:focus-visible`-Regel in derselben Datei.',
				),
			);
		}
	}
	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			const t = getAttr(el, 'tabindex');
			if (t && typeof t.value === 'string' && Number(t.value) > 0) {
				out.push(
					ctx.at(
						path,
						t.start,
						`\`tabindex="${t.value}"\` in \`${path}\` verändert die Tab-Reihenfolge.`,
						'Nutze `tabindex="0"` oder `-1`, nie größer als 0.',
					),
				);
			}
		}
	}
	for (const path of ctx.htmlFiles()) {
		for (const m of findAll(ctx.code(path), /tabindex\s*=\s*["']?[1-9]/gi, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${m.text}\` in \`${path}\` verändert die Tab-Reihenfolge.`,
				fix: 'Nutze `tabindex="0"` oder `-1`.',
			});
		}
		for (const m of findAll(
			ctx.code(path),
			/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?\b/gi,
			ctx.lines(path),
		)) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${m.text}\` in \`${path}\` verhindert das Zoomen.`,
				fix: 'Setze `<meta name="viewport" content="width=device-width, initial-scale=1" />`.',
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-008

const a11y008 = outputRule('A11Y-008', (ctx) => {
	const out: RawFinding[] = [];
	const titles = new Map<string, string[]>();
	for (const page of ctx.contentPages()) {
		const doc = ctx.html(page);
		const route = routeOfPage(page);
		const titleEl = doc.elements.find((e) => e.tag === 'title' && !ancestors(e).some((a) => a.tag === 'svg'));
		const title = titleEl ? textContent(titleEl).replace(/\s+/g, ' ').trim() : '';
		if (!title) {
			out.push({
				file: page,
				message: `Die Seite \`${route}\` hat keinen Titel.`,
				fix: 'Ergänze `<svelte:head><title>…</title></svelte:head>` in der Seite.',
			});
		} else {
			titles.set(title, [...(titles.get(title) ?? []), route]);
		}
		const desc = doc.elements.find(
			(e) => e.tag === 'meta' && (e.attrs.name ?? '').toLowerCase() === 'description',
		);
		if (!(desc?.attrs.content ?? '').trim()) {
			out.push({
				file: page,
				message: `Die Seite \`${route}\` hat keine Beschreibung (\`meta description\`).`,
				fix: 'Ergänze `<meta name="description" content="…" />` in `<svelte:head>`.',
			});
		}
	}
	for (const [title, routes] of titles) {
		if (routes.length < 2) continue;
		out.push({
			file: null,
			message: `Der Titel „${title}“ steht auf mehreren Seiten: ${routes.join(', ')}.`,
			fix: 'Gib jeder Seite einen eigenen Titel.',
		});
	}
	return out;
});

// ------------------------------------------------------------------ A11Y-009

const a11y009Source = sourceRule('A11Y-009', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		for (const el of ctx.svelte(path)?.elements ?? []) {
			if (el.kind === 'element' && el.name === 'video') {
				out.push(ctx.at(path, el.start, `\`${path}\` nutzt \`<video>\` statt \`<MediaVideo>\`.`));
			} else if (
				el.kind === 'component' &&
				el.name === COMPONENT.mediaVideo &&
				!getAttr(el, 'title') &&
				!hasSpread(el)
			) {
				out.push(
					ctx.at(
						path,
						el.start,
						`\`<MediaVideo>\` in \`${path}\` hat keinen \`title\`.`,
						'Gib `title="…"` an, z. B. `title="Rundgang durch die Wohnung"`.',
					),
				);
			}
		}
	}
	return out;
});

const a11y009Output = outputRule('A11Y-009', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.pages()) {
		const doc = ctx.html(page);
		for (const el of doc.elements) {
			if (el.tag === 'video' && 'autoplay' in el.attrs && !('muted' in el.attrs)) {
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `Ein Video auf \`${routeOfPage(page)}\` startet automatisch mit Ton.`,
					fix: 'Entferne `autoplay` oder ergänze `muted`.',
				});
			}
			if (el.tag === 'iframe' && !(el.attrs.title ?? '').trim() && !isHidden(el)) {
				out.push({
					file: page,
					line: lineOf(doc, el),
					message: `Ein \`<iframe>\` auf \`${routeOfPage(page)}\` hat keinen \`title\`.`,
					fix: 'Nutze `<MediaVideo>` und gib `title` an.',
				});
			}
		}
	}
	return out;
});

export const a11ySourceRules: SourceRule[] = [a11y001Source, a11y002Source, a11y006, a11y007, a11y009Source];
export const a11yOutputRules: OutputRule[] = [
	a11y001Output,
	a11y002Output,
	a11y003,
	a11y004,
	a11y005,
	a11y008,
	a11y009Output,
];
