// Die Anleitungen für Agenten werden aus dem Code erzeugt. Dieser Test wird rot,
// wenn sie nicht mehr zum Code passen oder der Block in AGENTS.md zu groß wird.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, RULES } from 'dealsystem';
import { AGENTS_BLOCK_MAX_BYTES, diffAgentDocs } from '../../../scripts/build-agent-docs.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const docs = (file: string) => readFile(join(ROOT, 'packages/site/docs', file), 'utf8');

interface Diff {
	stale: string[];
	extra: string[];
	bytes: number;
	version: string;
}

let diff: Diff;
let block: string;

beforeAll(async () => {
	diff = (await diffAgentDocs()) as Diff;
	block = await docs('agents-block.md');
});

describe('erzeugte Anleitungen', () => {
	it('passen zum Code (sonst: npm run docs)', () => {
		expect(diff.stale).toEqual([]);
		expect(diff.extra).toEqual([]);
	});

	it('der Block für AGENTS.md bleibt unter 8 KB', () => {
		expect(AGENTS_BLOCK_MAX_BYTES).toBe(8192);
		expect(diff.bytes).toBeLessThanOrEqual(AGENTS_BLOCK_MAX_BYTES);
		expect(Buffer.byteLength(block.trim(), 'utf8')).toBe(diff.bytes);
	});

	it('AGENTS.md des Starters trägt den Block mit der Version des Pakets zwischen den Markern', async () => {
		const agents = await readFile(join(ROOT, 'packages/create/template/AGENTS.md'), 'utf8');
		const site = JSON.parse(await readFile(join(ROOT, 'packages/site/package.json'), 'utf8'));
		expect(diff.version).toBe(site.version);
		const match = /<!-- dealsystem:begin (\S+) -->\n([\s\S]*?)\n<!-- dealsystem:end -->/.exec(agents);
		expect(match).not.toBeNull();
		expect(match![1]).toBe(site.version);
		expect(match![2]).toBe(block.trim());
	});
});

describe('Inhalt des Blocks', () => {
	it('verlangt, die lokalen Anleitungen statt des Vorwissens zu nutzen', () => {
		expect(block).toMatch(
			/Lies vor jeder Aufgabe die passende Datei unter `node_modules\/@dealsystem\/site\/docs\/`/,
		);
		expect(block).toContain('nicht nach deinem Vorwissen');
	});

	it('nennt die Gesprächsregeln für Laien', () => {
		expect(block).toContain('höchstens eine Rückfrage');
		expect(block).toContain('ohne Fachbegriffe');
		expect(block).toMatch(/Melde nach jedem größeren Schritt in einem Satz/);
		expect(block).toContain('Erfinde nichts über das Unternehmen');
	});

	it('beschreibt den festen Ablauf in der richtigen Reihenfolge', () => {
		const steps = [
			'login --start',
			'login --wait',
			'dealsystem init',
			'dealsystem sync',
			'dealsystem check',
			'dealsystem deploy',
			'publish --confirm',
		];
		const positions = steps.map((step) => block.indexOf(step));
		expect(positions.every((p) => p >= 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		expect(block).toMatch(/nur nach einem ausdrücklichen Ja/);
	});

	it('nennt, was nur der Mensch kann', () => {
		const section = block.slice(
			block.indexOf('### Was nur der Mensch kann'),
			block.indexOf('### Regeln, die immer gelten'),
		);
		for (const text of [
			'Anmeldung im Browser',
			'Veröffentlichen zustimmen',
			'Impressum und Datenschutzerklärung',
			'Domain-Anbieter',
		]) {
			expect(section).toContain(text);
		}
		expect(section).toContain('Diese Texte schreibst du nicht');
	});

	it('führt jeden Baustein, jeden Befehl und jede Detailseite auf, die es wirklich gibt', async () => {
		const site = await import('@dealsystem/site/package.json', { with: { type: 'json' } });
		expect(site.default.name).toBe('@dealsystem/site');
		const index = await readFile(join(ROOT, 'packages/site/src/lib/index.ts'), 'utf8');
		const exported = [...index.matchAll(/export \{ default as (\w+)/g)].map((m) => m[1]!);
		expect(exported.length).toBeGreaterThan(10);
		for (const name of exported) expect(block, name).toContain(`\`<${name}>\``);
		for (const name of Object.keys(COMMANDS)) expect(block, name).toContain(`npx dealsystem ${name}`);
		for (const file of [...block.matchAll(/^- `([a-z-]+\.md)`/gm)].map((m) => m[1]!)) {
			expect((await docs(file)).length, file).toBeGreaterThan(500);
		}
	});
});

describe('Detailseiten', () => {
	it('regeln.md nennt jede Regel des Katalogs mit ihrer Korrektur', async () => {
		const page = await docs('regeln.md');
		for (const rule of RULES) expect(page, rule.id).toContain(`\`${rule.id}\``);
	});

	it('komponenten.md nennt zu jedem Baustein Beschreibung, Beispiel und Eigenschaften', async () => {
		const page = await docs('komponenten.md');
		for (const name of ['LeadForm', 'MediaImage', 'Text', 'RichText', 'CollectionList', 'ConsentGate']) {
			const start = page.indexOf(`## ${name}\n`);
			expect(start, name).toBeGreaterThanOrEqual(0);
			const section = page.slice(start, page.indexOf('\n## ', start + 5));
			expect(section, name).toContain('```svelte');
			expect(section, name).toContain(`${name}Props`);
		}
	});

	it('gibt auch verzweigte Typen vollständig wieder', async () => {
		const page = await docs('komponenten.md');
		const richText = page.slice(page.indexOf('## RichText\n'), page.indexOf('## Link\n'));
		expect(richText).toContain('content: SafeHtml | null | undefined;');
		expect(richText).toContain('default: string;');
		const image = page.slice(page.indexOf('## MediaImage\n'), page.indexOf('## MediaVideo\n'));
		for (const part of [
			'src: EnhancedPicture | string;',
			'media: MediaRef | null | undefined;',
			'decorative: true;',
		]) {
			expect(image).toContain(part);
		}
	});

	it('llms.txt verweist nur auf vorhandene Seiten', async () => {
		const index = await docs('llms.txt');
		const links = [...index.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
		expect(links.length).toBeGreaterThan(5);
		for (const link of links) expect((await docs(link)).length, link).toBeGreaterThan(100);
	});

	it('enthält keine vorformulierten Rechtstexte', async () => {
		const page = await docs('rechtstexte.md');
		expect(page).toContain('du schreibst auch\nkeine');
		expect(page).not.toMatch(/Art\. 6 Abs\.|§ 5 DDG|Verantwortlicher im Sinne/);
	});
});
