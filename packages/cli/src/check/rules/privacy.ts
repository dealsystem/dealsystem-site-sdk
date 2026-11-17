// PRV-*: keine Drittanbieter-Requests vor der Einwilligung, lokale Schriften, kein eigenes Tracking,
// Pflichtseiten, Cookie-Hinweis.

import type { OutputContext, SourceContext } from '../context.js';
import { routeOfPage, routeOfSource } from '../context.js';
import { outputRule, sourceRule, type OutputRule, type SourceRule } from '../rule.js';
import { COMPONENT, MARKER } from '../sdk.js';
import type { RawFinding } from '../types.js';
import { excerpt, findAll } from '../util/code.js';
import { lineOf, parseHtml, type HtmlDoc } from '../util/html.js';

/** Schrift- und Skript-CDNs (PRV-002). */
export const CDN_HOSTS: readonly string[] = [
	'fonts.googleapis.com',
	'fonts.gstatic.com',
	'use.typekit.net',
	'p.typekit.net',
	'fonts.bunny.net',
	'use.fontawesome.com',
	'kit.fontawesome.com',
	'fast.fonts.net',
	'cdn.jsdelivr.net',
	'unpkg.com',
	'cdnjs.cloudflare.com',
	'ajax.googleapis.com',
	'code.jquery.com',
	'stackpath.bootstrapcdn.com',
	'maxcdn.bootstrapcdn.com',
	'cdn.tailwindcss.com',
	'esm.sh',
	'cdn.skypack.dev',
];
const FONT_HOSTS = new Set([
	'fonts.googleapis.com',
	'fonts.gstatic.com',
	'use.typekit.net',
	'p.typekit.net',
	'fonts.bunny.net',
	'fast.fonts.net',
]);

function hostOf(url: string): string | null {
	const u = url.trim();
	if (!/^(https?:)?\/\//i.test(u)) return null;
	try {
		return new URL(u.startsWith('//') ? `https:${u}` : u).host.toLowerCase();
	} catch {
		return null;
	}
}

function isCdnHost(host: string): boolean {
	return CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Externe Adresse, die nicht zur Seite selbst gehört und nicht von PRV-002 gemeldet wird. */
function externalHost(url: string, siteHost: string | null): string | null {
	const host = hostOf(url);
	if (!host || host === siteHost || isCdnHost(host)) return null;
	return host;
}

const LOADING_LINK_RELS = new Set([
	'stylesheet',
	'preload',
	'modulepreload',
	'prefetch',
	'preconnect',
	'dns-prefetch',
	'icon',
	'shortcut',
	'apple-touch-icon',
	'manifest',
]);

/** URLs, die ein Element beim Laden abruft. */
function loadedUrls(tag: string, attrs: Record<string, string | null>): string[] {
	const get = (name: string): string | null => attrs[name] ?? null;
	const urls: string[] = [];
	const push = (v: string | null): void => {
		if (v) urls.push(v);
	};
	const srcset = (v: string | null): void => {
		if (v) for (const part of v.split(',')) push(part.trim().split(/\s+/)[0] ?? null);
	};
	switch (tag) {
		case 'script':
		case 'iframe':
		case 'frame':
		case 'embed':
		case 'audio':
		case 'track':
			push(get('src'));
			break;
		case 'img':
		case 'source':
			push(get('src'));
			srcset(get('srcset'));
			break;
		case 'video':
			push(get('src'));
			push(get('poster'));
			break;
		case 'input':
			if ((get('type') ?? '').toLowerCase() === 'image') push(get('src'));
			break;
		case 'object':
			push(get('data'));
			break;
		case 'link': {
			const rels = (get('rel') ?? '').toLowerCase().split(/\s+/);
			if (rels.some((r) => LOADING_LINK_RELS.has(r))) push(get('href'));
			break;
		}
	}
	return urls;
}

const CSS_URL = /(?:@import\s+(?:url\(\s*)?|url\(\s*)['"]?((?:https?:)?\/\/[^'")\s]+)/gi;

function cssExternal(text: string): { url: string; index: number }[] {
	return [...text.matchAll(CSS_URL)].map((m) => ({ url: m[1] ?? '', index: m.index }));
}

function prv001Message(url: string, where: string): string {
	return `\`${excerpt(url, 100)}\` wird vor der Einwilligung geladen (${where}).`;
}

function htmlDocExternal(doc: HtmlDoc, path: string, siteHost: string | null): RawFinding[] {
	const out: RawFinding[] = [];
	for (const el of doc.elements) {
		for (const url of loadedUrls(el.tag, el.attrs)) {
			if (externalHost(url, siteHost))
				out.push({ file: path, line: lineOf(doc, el), message: prv001Message(url, `<${el.tag}>`) });
		}
		if (el.tag === 'style') {
			const css = el.children.map((c) => ('text' in c ? c.text : '')).join('');
			for (const hit of cssExternal(css)) {
				if (externalHost(hit.url, siteHost))
					out.push({ file: path, line: lineOf(doc, el), message: prv001Message(hit.url, 'CSS') });
			}
		}
	}
	return out;
}

const prv001Source = sourceRule('PRV-001', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		const ast = ctx.svelte(path);
		if (!ast) continue;
		for (const el of ast.elements) {
			if (el.kind !== 'element' || el.ancestors.includes(COMPONENT.consentGate)) continue;
			const attrs: Record<string, string | null> = {};
			for (const a of el.attributes)
				if (a.kind === 'attribute')
					attrs[a.name.toLowerCase()] = typeof a.value === 'string' ? a.value : null;
			for (const url of loadedUrls(el.name, attrs)) {
				if (externalHost(url, null))
					out.push(ctx.at(path, el.start, prv001Message(url, `<${el.name}> in ${path}`)));
			}
		}
		for (const style of ast.styles) {
			for (const hit of cssExternal(style.content)) {
				if (externalHost(hit.url, null))
					out.push(ctx.at(path, style.start + hit.index, prv001Message(hit.url, 'CSS')));
			}
		}
	}
	for (const path of ctx.cssFiles()) {
		for (const hit of cssExternal(ctx.code(path))) {
			if (externalHost(hit.url, null)) out.push(ctx.at(path, hit.index, prv001Message(hit.url, 'CSS')));
		}
	}
	for (const path of ctx.htmlFiles()) {
		out.push(...htmlDocExternal(parseHtml(ctx.code(path)), path, null));
	}
	return out;
});

const prv001Output = outputRule('PRV-001', (ctx) => {
	const out: RawFinding[] = [];
	const siteHost = ctx.siteHost();
	for (const path of ctx.pages()) out.push(...htmlDocExternal(ctx.html(path), path, siteHost));
	for (const path of ctx.paths().filter((p) => p.endsWith('.css'))) {
		const text = ctx.text(path) ?? '';
		for (const hit of cssExternal(text)) {
			if (externalHost(hit.url, siteHost)) out.push(ctx.at(path, hit.index, prv001Message(hit.url, 'CSS')));
		}
	}
	return out;
});

// ------------------------------------------------------------------ PRV-002

const CDN_PATTERN = new RegExp(
	`(?:https?:)?//(?:[a-z0-9-]+\\.)*(?:${CDN_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})\\b[^\\s'"\`)<>]*`,
	'gi',
);

function scanCdn(
	ctx: SourceContext | OutputContext,
	paths: string[],
	text: (p: string) => string,
): RawFinding[] {
	const out: RawFinding[] = [];
	for (const path of paths) {
		for (const m of findAll(text(path), CDN_PATTERN, ctx.lines(path))) {
			const host = hostOf(m.text) ?? '';
			const font = FONT_HOSTS.has(host) || /font/i.test(m.text);
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: font
					? `\`${excerpt(m.text, 100)}\` lädt eine Schrift von einem fremden Server.`
					: `\`${excerpt(m.text, 100)}\` lädt Code von einem CDN.`,
				...(font
					? {}
					: {
							fix: 'Installiere das Paket per npm (falls freigegeben) und importiere es, statt es vom CDN zu laden.',
						}),
			});
		}
	}
	return out;
}

const prv002Source = sourceRule('PRV-002', (ctx) =>
	scanCdn(
		ctx,
		ctx.textFiles((p) => p.startsWith('src/') || p.startsWith('static/')),
		(p) => ctx.code(p),
	),
);

const prv002Output = outputRule('PRV-002', (ctx) =>
	scanCdn(
		ctx,
		ctx.textFiles((p) => /\.(html|css|js)$/.test(p)),
		(p) => ctx.text(p) ?? '',
	),
);

// ------------------------------------------------------------------ PRV-003

const TRACKING_PATTERNS: readonly { pattern: RegExp; name: string }[] = [
	{ pattern: /connect\.facebook\.net/g, name: 'Meta Pixel' },
	{ pattern: /\bfbq\s*\(/g, name: 'Meta Pixel' },
	{ pattern: /googletagmanager\.com/g, name: 'Google Tag Manager' },
	{ pattern: /google-analytics\.com/g, name: 'Google Analytics' },
	{ pattern: /\bgtag\s*\(/g, name: 'Google Tag' },
	{ pattern: /\bdataLayer\.push\s*\(/g, name: 'Google Tag Manager' },
	{ pattern: /static\.hotjar\.com/g, name: 'Hotjar' },
	{ pattern: /\bclarity\.ms\b/g, name: 'Microsoft Clarity' },
	{ pattern: /snap\.licdn\.com/g, name: 'LinkedIn Insight' },
	{ pattern: /analytics\.tiktok\.com/g, name: 'TikTok Pixel' },
	{ pattern: /\bttq\.(?:load|page|track)\s*\(/g, name: 'TikTok Pixel' },
	{ pattern: /\b_paq\.push\s*\(/g, name: 'Matomo' },
	{ pattern: /plausible\.io\/js/g, name: 'Plausible' },
];

const prv003 = sourceRule('PRV-003', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of [...ctx.codeFiles(), ...ctx.htmlFiles()]) {
		for (const { pattern, name } of TRACKING_PATTERNS) {
			for (const m of findAll(ctx.code(path), pattern, ctx.lines(path))) {
				out.push({
					file: path,
					line: m.line,
					column: m.column,
					message: `\`${path}\` enthält ein eigenes Tracking-Snippet (${name}).`,
				});
			}
		}
	}
	return out;
});

// ------------------------------------------------------------------ PRV-004

const LEGAL_PAGES = [
	{ route: '/impressum', component: COMPONENT.impressum, marker: MARKER.impressum },
	{ route: '/datenschutz', component: COMPONENT.datenschutz, marker: MARKER.datenschutz },
] as const;

function usesComponent(ctx: SourceContext, path: string, name: string): boolean {
	return ctx.svelte(path)?.elements.some((e) => e.kind === 'component' && e.name === name) ?? false;
}

const prv004Source = sourceRule('PRV-004', (ctx) => {
	const out: RawFinding[] = [];
	const pages = ctx.paths().filter((p) => p.startsWith('src/routes/') && p.endsWith('/+page.svelte'));
	for (const legal of LEGAL_PAGES) {
		const page = pages.find((p) => routeOfSource(p) === legal.route);
		const fix = `Lege \`src/routes${legal.route}/+page.svelte\` mit \`<${legal.component} />\` an (Import aus \`@dealsystem/site\`).`;
		if (!page)
			out.push({
				file: `src/routes${legal.route}/+page.svelte`,
				message: `Die Seite \`${legal.route}\` fehlt.`,
				fix,
			});
		else if (!usesComponent(ctx, page, legal.component)) {
			out.push({
				file: page,
				message: `Die Seite \`${legal.route}\` nutzt nicht \`<${legal.component} />\`.`,
				fix,
			});
		}
	}
	return out;
});

function hasMarker(doc: HtmlDoc, marker: string): boolean {
	return doc.elements.some((e) => marker in e.attrs);
}

const prv004Output = outputRule('PRV-004', (ctx) => {
	const out: RawFinding[] = [];
	for (const legal of LEGAL_PAGES) {
		const page = ctx.pages().find((p) => routeOfPage(p) === legal.route);
		const fix = `Lege \`src/routes${legal.route}/+page.svelte\` mit \`<${legal.component} />\` an.`;
		if (!page)
			out.push({ file: null, message: `Die gebaute Seite enthält keine Route \`${legal.route}\`.`, fix });
		else if (!hasMarker(ctx.html(page), legal.marker)) {
			out.push({ file: page, message: `\`${legal.route}\` enthält nicht \`<${legal.component} />\`.`, fix });
		}
	}
	return out;
});

// ------------------------------------------------------------------ PRV-005

const prv005Source = sourceRule('PRV-005', (ctx) => {
	const layout = 'src/routes/+layout.svelte';
	if (!ctx.files.has(layout)) {
		return [{ file: layout, message: '`src/routes/+layout.svelte` fehlt.' }];
	}
	const missing = [COMPONENT.siteFooterLegal, COMPONENT.cookieBanner].filter(
		(c) => !usesComponent(ctx, layout, c),
	);
	return missing.map((c) => ({ file: layout, message: `\`<${c} />\` fehlt im Haupt-Layout.` }));
});

/** Löst einen Link relativ zur Seite auf; `null` für externe Ziele. */
export function resolveHref(href: string, pageRoute: string): string | null {
	const h = href.trim();
	if (!h || h.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//')) return null;
	try {
		// Wie der Browser: relativ zur Adresse der Seite (SvelteKit: ohne Schrägstrich am Ende).
		return decodeURIComponent(new URL(h, `https://site.invalid${pageRoute}`).pathname);
	} catch {
		return null;
	}
}

function normalizeRoute(path: string): string {
	return path.length > 1 ? path.replace(/\/+$/, '').replace(/\.html$/, '') : path;
}

const prv005Output = outputRule('PRV-005', (ctx) => {
	const out: RawFinding[] = [];
	for (const page of ctx.contentPages()) {
		const doc = ctx.html(page);
		const route = routeOfPage(page);
		const targets = new Set(
			doc.elements
				.filter((e) => e.tag === 'a' && e.attrs.href !== undefined)
				.map((e) => resolveHref(e.attrs.href ?? '', route))
				.filter((r): r is string => r !== null)
				.map(normalizeRoute),
		);
		for (const legal of ['/impressum', '/datenschutz']) {
			if (route === legal || targets.has(legal)) continue;
			out.push({ file: page, message: `Die Seite \`${route}\` verlinkt nicht auf \`${legal}\`.` });
		}
		if (!hasMarker(doc, MARKER.cookieBanner)) {
			out.push({
				file: page,
				message: `Die Seite \`${route}\` enthält keinen Cookie-Hinweis (\`<CookieBanner />\`).`,
			});
		}
	}
	return out;
});

// ------------------------------------------------------------------ PRV-006

const STORAGE = /\b(?:document\.cookie|localStorage|sessionStorage)\b/g;

const prv006 = sourceRule('PRV-006', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.codeFiles()) {
		for (const m of findAll(ctx.code(path), STORAGE, ctx.lines(path))) {
			out.push({
				file: path,
				line: m.line,
				column: m.column,
				message: `\`${path}\` speichert Daten im Browser (\`${m.text}\`).`,
			});
		}
	}
	return out;
});

export const privacySourceRules: SourceRule[] = [
	prv001Source,
	prv002Source,
	prv003,
	prv004Source,
	prv005Source,
	prv006,
];
export const privacyOutputRules: OutputRule[] = [prv001Output, prv002Output, prv004Output, prv005Output];
export { normalizeRoute };
