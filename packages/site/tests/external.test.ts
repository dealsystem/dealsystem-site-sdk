// `external` in dealsystem.config.ts: Prüfung, Vorlagen, CSP aus der Deklaration, Manifest.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSiteConfig } from '../src/lib/config/index.js';
import { readSiteConfig } from '../src/lib/config/static/index.js';
import { dealsystemCsp } from '../src/lib/csp/index.js';
import { buildCspDirectives } from '../src/lib/external/csp.js';
import { hostSourceMatches, hostSourceProblem } from '../src/lib/external/hosts.js';
import {
	resolveEmbedSource,
	resolveExternal,
	scriptSourceProblem,
	validateExternal,
} from '../src/lib/external/resolve.js';
import { buildManifest } from '../src/lib/vite/index.js';
import type { ExternalDef } from '../src/lib/types.js';

const CHAT: ExternalDef = {
	category: 'marketing',
	provider: 'HubSpot, Inc., USA',
	purpose: 'Live-Chat',
	privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
	script: ['https://js.hs-scripts.com'],
	connect: ['https://*.hubspot.com', 'https://*.hs-analytics.net'],
	img: ['https://*.hubspot.com'],
};

describe('Hosts', () => {
	it.each([
		['https://js.hs-scripts.com', 'script'],
		['https://*.hubspot.com', 'connect'],
		['https://*.hubspot.com', 'img'],
	] as const)('%s in %s ist erlaubt', (source, directive) => {
		expect(hostSourceProblem(source, directive)).toBeNull();
	});

	it.each([
		['*', 'connect'],
		['https:', 'connect'],
		['data:', 'img'],
		['blob:', 'script'],
		["'unsafe-eval'", 'script'],
		['http://js.example.com', 'script'],
		['js.example.com', 'script'],
		['https://js.example.com/', 'script'],
		['https://js.example.com/x.js', 'script'],
		['https://js.example.com:8443', 'script'],
		['https://JS.example.com', 'script'],
		['https://*.example.com', 'script'],
		['https://*.example.com', 'frame'],
		['https://a.*.example.com', 'connect'],
		['https://*.co.uk', 'connect'],
		['https://*.github.io', 'connect'],
		['https://*.dealsystem.site', 'connect'],
		['https://*.com', 'connect'],
		['https://app.dealsystem.io', 'connect'],
	] as const)('%s in %s ist verboten', (source, directive) => {
		expect(hostSourceProblem(source, directive)).toEqual(expect.any(String));
	});

	it('Platzhalter decken nur Unterhosts, nicht ähnlich klingende Namen', () => {
		expect(hostSourceMatches('https://*.hubspot.com', new URL('https://api.hubspot.com/x'))).toBe(true);
		expect(hostSourceMatches('https://*.hubspot.com', new URL('https://evilhubspot.com/x'))).toBe(false);
		expect(hostSourceMatches('https://js.a.de', new URL('https://js.a.de.evil.com/x'))).toBe(false);
		expect(hostSourceMatches('https://js.a.de', new URL('http://js.a.de/x'))).toBe(false);
		expect(hostSourceMatches('https://js.a.de', new URL('https://js.a.de:444/x'))).toBe(false);
	});
});

describe('validateExternal', () => {
	it('nimmt Vorlagen und eigene Dienste an', () => {
		expect(validateExternal({ video: { preset: 'youtube' }, chat: CHAT })).toEqual([]);
	});

	it('kennt keine Kategorie „notwendig“ und sagt warum', () => {
		const [p] = validateExternal({ chat: { ...CHAT, category: 'necessary' } });
		expect(p?.path).toBe('external.chat.category');
		expect(p?.message).toMatch(/erst nach der Einwilligung/);
	});

	it('neben preset steht nichts, auch keine zusätzlichen Hosts', () => {
		expect(
			validateExternal({ video: { preset: 'youtube', script: ['https://evil.example.com'] } }),
		).toHaveLength(1);
	});

	it('meldet Pfad und Grund für jeden ungültigen Host', () => {
		const problems = validateExternal({
			chat: { category: 'marketing', script: ['https://*.x.de', 'http://a.de'] },
		});
		expect(problems.map((p) => p.path)).toEqual(['external.chat.script[0]', 'external.chat.script[1]']);
	});

	it('ist Teil von validateSiteConfig', () => {
		const problems = validateSiteConfig({ siteId: 'x', external: { 'Video 1': { preset: 'youtube' } } });
		expect(problems.some((p) => p.path === 'external.Video 1')).toBe(true);
	});
});

describe('Vorlagen und Adressen', () => {
	const [video, rundgang, maps, termin] = resolveExternal({
		a: { preset: 'youtube' },
		b: { preset: 'vimeo' },
		c: { preset: 'google-maps' },
		d: { preset: 'calendly' },
	});

	it('löst Vorlagen vollständig auf (Kategorie, Anbieter, Hosts)', () => {
		expect(video).toMatchObject({
			id: 'a',
			preset: 'youtube',
			category: 'media',
			hosts: { frame: ['https://www.youtube-nocookie.com'], script: [], connect: [] },
		});
		expect(video?.provider).toMatch(/Google/);
	});

	it.each([
		[
			'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s',
			'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90',
		],
		['https://youtu.be/aqz-KE-bpKQ', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
		['https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
	])('YouTube: %s → %s', (src, expected) => {
		const r = resolveEmbedSource(video!, src);
		expect(r.ok && r.src).toBe(expected);
	});

	it('Vimeo bekommt dnt=1', () => {
		const r = resolveEmbedSource(rundgang!, 'https://vimeo.com/76979871');
		expect(r.ok && r.src).toBe('https://player.vimeo.com/video/76979871?dnt=1');
	});

	it('Google Maps nur mit der Einbettungs-Adresse, Calendly nur mit Seitenpfad', () => {
		expect(resolveEmbedSource(maps!, 'https://www.google.com/maps/embed?pb=!1m18').ok).toBe(true);
		expect(resolveEmbedSource(maps!, 'https://www.google.com/search?q=x').ok).toBe(false);
		expect(resolveEmbedSource(termin!, 'https://calendly.com/makler/erstgespraech').ok).toBe(true);
		expect(resolveEmbedSource(termin!, 'https://calendly.com.evil.example/makler').ok).toBe(false);
	});

	it('lehnt fremde Hosts, falsche IDs und http ab', () => {
		expect(resolveEmbedSource(video!, 'https://evil.example.com/watch?v=aqz-KE-bpKQ').ok).toBe(false);
		expect(resolveEmbedSource(video!, 'https://www.youtube.com/watch?v=<script>').ok).toBe(false);
		expect(resolveEmbedSource(video!, 'http://www.youtube.com/watch?v=aqz-KE-bpKQ').ok).toBe(false);
	});

	it('Skripte: Host aus script oder eigener Pfad, sonst nicht', () => {
		const [chat] = resolveExternal({ chat: CHAT });
		expect(scriptSourceProblem(chat!, 'https://js.hs-scripts.com/123.js')).toBeNull();
		expect(scriptSourceProblem(chat!, '/scripts/chat.js')).toBeNull();
		// connect-Hosts sind keine Skript-Hosts.
		expect(scriptSourceProblem(chat!, 'https://api.hubspot.com/x.js')).toEqual(expect.any(String));
		expect(scriptSourceProblem(chat!, '//evil.example.com/x.js')).toEqual(expect.any(String));
		expect(scriptSourceProblem(chat!, '/scripts/../../x.js')).toEqual(expect.any(String));
		expect(scriptSourceProblem(chat!, 'javascript:alert(1)')).toEqual(expect.any(String));
	});
});

describe('CSP aus der Deklaration', () => {
	const base = buildCspDirectives([], 'https://app.dealsystem.io');

	it('Basis wie die feste CSP bis SDK 0.1, dazu media-src', () => {
		expect(base['script-src']).toEqual([
			'self',
			'https://www.googletagmanager.com',
			'https://connect.facebook.net',
		]);
		expect(base['connect-src']).toContain('https://app.dealsystem.io');
		expect(base['frame-src']).toEqual(['self', 'https://www.openstreetmap.org']);
		expect(base['media-src']).toEqual(['self']);
		expect(base['object-src']).toEqual(['none']);
		expect(base['form-action']).toEqual(['self']);
		for (const sources of Object.values(base)) {
			expect(sources).not.toContain('unsafe-eval');
			expect(sources).not.toContain('wasm-unsafe-eval');
		}
	});

	it('jede Liste öffnet genau ihre Direktive, sortiert und ohne Doppel', () => {
		const csp = buildCspDirectives(
			resolveExternal({ chat: CHAT, video: { preset: 'youtube' } }),
			'https://app.dealsystem.io',
		);
		expect(csp['script-src']).toEqual([...base['script-src']!, 'https://js.hs-scripts.com']);
		expect(csp['connect-src']).toEqual([
			...base['connect-src']!,
			'https://*.hs-analytics.net',
			'https://*.hubspot.com',
		]);
		expect(csp['frame-src']).toEqual([...base['frame-src']!, 'https://www.youtube-nocookie.com']);
		expect(csp['img-src']).toContain('https://*.hubspot.com');
		// Was nicht deklariert ist, bleibt zu.
		expect(csp['frame-src']).not.toContain('https://js.hs-scripts.com');
		expect(csp['font-src']).toEqual(['self']);
	});

	it('dealsystemCsp() liest dealsystem.config.ts statisch, ohne sie auszuführen', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ds-csp-'));
		const cwd = process.cwd();
		try {
			writeFileSync(join(dir, 'package.json'), '{}');
			writeFileSync(
				join(dir, 'dealsystem.config.ts'),
				"import { defineSite } from '@dealsystem/site/config';\n" +
					'globalThis.__ausgefuehrt = true;\n' +
					"export default defineSite({ siteId: '', external: { video: { preset: 'youtube' } } });\n",
			);
			process.chdir(dir);
			const csp = dealsystemCsp();
			expect(csp.mode).toBe('hash');
			expect(csp.directives?.['frame-src']).toContain('https://www.youtube-nocookie.com');
			expect((globalThis as Record<string, unknown>).__ausgefuehrt).toBeUndefined();
		} finally {
			process.chdir(cwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('dealsystemCsp() bricht bei einer ungültigen Deklaration ab, statt sie still wegzulassen', () => {
		const dir = mkdtempSync(join(tmpdir(), 'ds-csp-'));
		const cwd = process.cwd();
		try {
			writeFileSync(join(dir, 'package.json'), '{}');
			writeFileSync(
				join(dir, 'dealsystem.config.ts'),
				"export default defineSite({ siteId: '', external: { chat: { category: 'marketing', script: ['*'] } } });\n",
			);
			process.chdir(dir);
			expect(() => dealsystemCsp()).toThrow(/external.chat.script\[0\]/);
		} finally {
			process.chdir(cwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	describe('Google Ads (Kennung AW-… im CRM)', () => {
		const run = (googleTagId: string | null, env?: string) => {
			const dir = mkdtempSync(join(tmpdir(), 'ds-csp-'));
			const cwd = process.cwd();
			const before = process.env.DEALSYSTEM_CONTENT_FILE;
			try {
				writeFileSync(join(dir, 'package.json'), '{}');
				writeFileSync(join(dir, 'dealsystem.config.ts'), "export default defineSite({ siteId: '' });\n");
				const snapshot = JSON.stringify({ tracking: { metaPixelId: null, googleTagId } });
				if (env) {
					writeFileSync(join(dir, env), snapshot);
					process.env.DEALSYSTEM_CONTENT_FILE = join(dir, env);
				} else {
					mkdirSync(join(dir, '.dealsystem'));
					writeFileSync(join(dir, '.dealsystem/content.json'), snapshot);
				}
				process.chdir(dir);
				return dealsystemCsp().directives!;
			} finally {
				process.chdir(cwd);
				if (before === undefined) delete process.env.DEALSYSTEM_CONTENT_FILE;
				else process.env.DEALSYSTEM_CONTENT_FILE = before;
				rmSync(dir, { recursive: true, force: true });
			}
		};

		it('mit AW-Kennung: Hosts für Ads-Conversions in script-, img-, connect- und frame-src', () => {
			const d = run('AW-123456789');
			expect(d['script-src']).toEqual(expect.arrayContaining(['https://www.googleadservices.com']));
			expect(d['img-src']).toEqual(expect.arrayContaining(['https://googleads.g.doubleclick.net']));
			expect(d['connect-src']).toEqual(
				expect.arrayContaining([
					'https://www.googleadservices.com',
					'https://googleads.g.doubleclick.net',
					'https://ad.doubleclick.net',
				]),
			);
			expect(d['frame-src']).toContain('https://www.googletagmanager.com');
		});

		it('auch über DEALSYSTEM_CONTENT_FILE (Build-Host)', () => {
			expect(run('AW-123456789', 'schnappschuss.json')['connect-src']).toContain(
				'https://googleads.g.doubleclick.net',
			);
		});

		it('ohne AW-Kennung (G-…, keine, keine Datei): keine Ads-Hosts', () => {
			for (const id of ['G-ABCDEF1234', null]) {
				const d = run(id);
				const all = Object.values(d).flat();
				expect(all).not.toContain('https://www.googleadservices.com');
				expect(all).not.toContain('https://googleads.g.doubleclick.net');
				expect(d['frame-src']).not.toContain('https://www.googletagmanager.com');
			}
			expect(Object.values(buildCspDirectives([], 'https://app.dealsystem.io')).flat()).not.toContain(
				'https://www.googleadservices.com',
			);
		});
	});

	it('nicht feste Werte kommen nicht in die CSP', () => {
		const result = readSiteConfig(
			"export default defineSite({ siteId: '', external: { chat: { category: 'marketing', script: [HOST] } } });\n",
		);
		expect(result.data?.external).toEqual([]);
		expect(result.problems.some((p) => p.kind === 'external')).toBe(true);
	});
});

describe('Manifest', () => {
	it('enthält external aufgelöst und nach id sortiert', () => {
		const manifest = buildManifest(
			{ siteId: 's', external: { video: { preset: 'youtube' }, chat: CHAT } },
			[],
			['/'],
		);
		expect(manifest.manifestVersion).toBe(1);
		expect(manifest.external.map((e) => e.id)).toEqual(['chat', 'video']);
		expect(manifest.external[0]).toEqual({
			id: 'chat',
			preset: null,
			category: 'marketing',
			provider: 'HubSpot, Inc., USA',
			purpose: 'Live-Chat',
			privacyUrl: 'https://legal.hubspot.com/de/privacy-policy',
			hosts: {
				script: ['https://js.hs-scripts.com'],
				connect: ['https://*.hs-analytics.net', 'https://*.hubspot.com'],
				img: ['https://*.hubspot.com'],
				frame: [],
				media: [],
				style: [],
				font: [],
			},
		});
		expect(buildManifest({ siteId: 's' }, [], ['/']).external).toEqual([]);
	});
});
