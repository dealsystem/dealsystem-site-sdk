// Die Anleitungen für Agenten werden aus dem Code erzeugt. Dieser Test wird rot,
// wenn sie nicht mehr zum Code passen oder der Block in AGENTS.md zu groß wird.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, RULES } from 'dealsystem';
import {
	AGENTS_BLOCK_MAX_BYTES,
	AGENTS_MD_WARN_BYTES,
	agentsMdSizeWarning,
	diffAgentDocs,
} from '../../../scripts/build-agent-docs.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const docs = (file: string) => readFile(join(ROOT, 'packages/site/docs', file), 'utf8');

interface Diff {
	stale: string[];
	extra: string[];
	bytes: number;
	agentsMdBytes: number;
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

	it('die ganze AGENTS.md des Starters bleibt unter 8 KB', async () => {
		const agents = await readFile(join(ROOT, 'packages/create/template/AGENTS.md'));
		expect(agents.byteLength).toBe(diff.agentsMdBytes);
		expect(agents.byteLength).toBeLessThanOrEqual(AGENTS_BLOCK_MAX_BYTES);
	});

	it('warnt ab 7500 Bytes, bevor die Grenze erreicht ist', () => {
		expect(AGENTS_MD_WARN_BYTES).toBe(7500);
		expect(agentsMdSizeWarning(7500)).toBeNull();
		expect(agentsMdSizeWarning(7501)).toMatch(
			/Warnung: AGENTS\.md des Starters hat 7501 Bytes.*Skill oder nach docs\//,
		);
		// Heute ist Platz: Die Datei liegt unter der Warnschwelle.
		expect(agentsMdSizeWarning(diff.agentsMdBytes)).toBeNull();
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
		expect(block).toContain('Eine Nachricht, höchstens eine Frage');
		expect(block).toContain('nie eine Frage neben einer Bitte');
		expect(block).toContain('ohne Fachbegriffe');
		expect(block).toMatch(/Melde nach jedem größeren Schritt in einem Satz/);
		expect(block).toContain('Erfinde nichts über das Unternehmen');
		expect(block).toContain('keine Leistungsversprechen');
		expect(block).toContain('erfinde keine Bereiche');
	});

	it('beschreibt den festen Ablauf in der richtigen Reihenfolge', () => {
		const steps = [
			// Zuerst fragen, wie der Kunde vorgehen will; dann anmelden, lokal zeigen, erst danach hochladen.
			'Wie möchtest du vorgehen',
			'login --start',
			'login --wait',
			'dealsystem init',
			'dealsystem sync',
			'npm run dev',
			'dealsystem check',
			'Okay zum lokalen Stand',
			'dealsystem deploy',
			'publish --confirm',
		];
		// `sync` steht zusätzlich am Anfang (zu Beginn jeder Sitzung); die Schritte suchen der Reihe nach.
		const positions: number[] = [];
		for (const step of steps) positions.push(block.indexOf(step, (positions.at(-1) ?? -1) + 1));
		expect(positions.every((p) => p >= 0)).toBe(true);
		expect(block).toContain('Zu Beginn jeder Sitzung `npx dealsystem sync` ausführen');
		expect(block).toMatch(/nur nach einem ausdrücklichen Ja/);
		// Die Zustimmung gilt nur der Vorschau, die der Mensch gesehen hat.
		expect(block).toContain('Jede neue Vorschau braucht ein neues Ja');
		// „Geprüft“ ist an die eine Erfolgszeile von check gebunden.
		expect(block).toContain('Prüfung bestanden: Quelltext und fertige Seite geprüft');
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
		const befehle = block.slice(block.indexOf('### Befehle'), block.indexOf('### Nachschlagen'));
		expect(befehle).toContain('`npx dealsystem <befehl>`');
		expect(befehle).toContain('`befehle.md`');
		for (const name of Object.keys(COMMANDS)) expect(befehle, name).toContain(`\`${name}\``);
		for (const file of [...block.matchAll(/^- `([a-z-]+\.md)`/gm)].map((m) => m[1]!)) {
			expect((await docs(file)).length, file).toBeGreaterThan(500);
		}
	});
});

describe('Wegweiser', () => {
	it('nennt jeden Skill des Starters mit Pfad', async () => {
		const skills = await readdir(join(ROOT, 'packages/create/template/.claude/skills'));
		expect(skills.length).toBeGreaterThan(4);
		expect(block).toContain('.claude/skills/<name>/SKILL.md');
		const section = block.slice(block.indexOf('### Skills'), block.indexOf('### Bausteine'));
		for (const name of skills) expect(section, name).toMatch(new RegExp(`^- \`${name}\` – `, 'm'));
	});

	it('verweist für ausgelagerte Einzelheiten auf die Stelle, wo sie stehen', async () => {
		// Slot-Schlüssel: Regel im Skill und in komponenten.md, in AGENTS.md nur der Verweis.
		expect(block).toContain('Schlüssel-Regeln: `komponenten.md`');
		expect(await docs('komponenten.md')).toContain('`ueberuns.team.titel`');
		const neueSeite = await readFile(
			join(ROOT, 'packages/create/template/.claude/skills/neue-seite/SKILL.md'),
			'utf8',
		);
		expect(neueSeite).toContain('`ueberuns.team.titel`');
		// Fotos zum Selbst-Tauschen: gestaltung.md.
		expect(block).toContain('Eigene Website → Inhalte');
		expect(await docs('gestaltung.md')).toContain('Eigene Website → Inhalte');
		// Ausnahmen beim Server-Code, Barrierefreiheit, Anmelden mit init-Optionen.
		expect(await docs('regeln.md')).toContain('außer sitemap.xml/robots.txt');
		expect(await docs('gestaltung.md')).toContain('Tastatur');
		expect(await docs('ablauf.md')).toContain('--create --name');
	});

	it('nennt die Rechtstexte nur unter „Eigene Website → Rechtliches“', () => {
		expect(block).toContain('unter Eigene Website → Rechtliches eintragen');
		expect(block).not.toMatch(/Website → Einstellungen ein/);
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

	it('Ablauf und Skills: erst eine Frage, dann lokal zeigen, hochladen erst nach dem Okay; Ausnahme ohne localhost', async () => {
		const skill = (name: string) =>
			readFile(join(ROOT, `packages/create/template/.claude/skills/${name}/SKILL.md`), 'utf8');
		const ablauf = await docs('ablauf.md');
		const entwurf = await skill('erster-entwurf');
		for (const text of [ablauf, entwurf]) {
			expect(text).toContain('Wie möchtest du vorgehen? (a) Wir besprechen kurz deine Seite');
			expect(text).toMatch(/je eine pro Nachricht/);
			expect(text).toMatch(/sichtbare[rn]? Platzhalter/);
			expect(text).toMatch(/nur wenn er die Adresse nennt/);
			expect(text).toMatch(/andere[rn]? Chats/);
			expect(text).toContain('http://localhost:5173');
			expect(text).toMatch(/nicht auf seinem Rechner/i);
			expect(text).toContain('<name>.dealsystem.site');
		}
		for (const text of [ablauf, entwurf, await skill('veroeffentlichen')]) {
			expect(text).toMatch(/ausdrücklichen Okay|ausdrücklich Ja sagt/);
			expect(text).toContain('„passt, zeig es online“');
		}
		// Im Ablauf steht die erste Frage vor dem Anlegen, das lokale Zeigen vor dem Hochladen.
		expect(ablauf.indexOf('## 0. Erste Nachricht')).toBeLessThan(ablauf.indexOf('## 1. Neues Projekt'));
		expect(ablauf.indexOf('## 4. Bauen und lokal zeigen')).toBeLessThan(ablauf.indexOf('## 6. Hochladen'));
	});

	it('sagt in Ablauf, Rechtstexten und Skill gleichlautend: jede neue Vorschau braucht ein neues Ja', async () => {
		const skill = await readFile(
			join(ROOT, 'packages/create/template/.claude/skills/veroeffentlichen/SKILL.md'),
			'utf8',
		);
		for (const text of [await docs('ablauf.md'), skill]) {
			expect(text).toMatch(/Jede neue Vorschau braucht ein neues ausdrückliches Ja/);
		}
		expect(await docs('rechtstexte.md')).toMatch(/Jede neue Vorschau braucht ein neues ausdrückliches Ja/);
	});

	it('die Erfolgszeile, die die Anleitung zitiert, ist die der CLI', async () => {
		const { formatCheckText, RULE_SET_VERSION } = await import('dealsystem/check');
		const line = formatCheckText({
			passed: true,
			ruleSetVersion: RULE_SET_VERSION,
			stages: ['source', 'output'],
			errors: [],
			warnings: [],
		});
		expect(line).toContain('Prüfung bestanden: Quelltext und fertige Seite geprüft');
		expect(await docs('ablauf.md')).toContain('Prüfung bestanden: Quelltext und fertige Seite geprüft');
	});

	it('nennt die Karte ohne Eintrag und den Weg für andere fremde Dienste', async () => {
		const gestaltung = await docs('gestaltung.md');
		expect(gestaltung).toContain('<MapEmbed lat=');
		expect(gestaltung).toContain('extern.md');
		const extern = await docs('extern.md');
		expect(extern).toContain("external: { video: { preset: 'youtube' } }");
		expect(extern).toContain('<ExternalScript');
		expect(extern).toContain('csp: dealsystemCsp()');
		expect(await docs('komponenten.md')).toContain('## Embed');
		expect(await docs('komponenten.md')).toContain('## MapEmbed');
		expect(await docs('regeln.md')).toContain('`SEC-008`');
	});

	it('enthält keine vorformulierten Rechtstexte', async () => {
		const page = await docs('rechtstexte.md');
		expect(page).toContain('du schreibst auch\nkeine');
		expect(page).not.toMatch(/Art\. 6 Abs\.|§ 5 DDG|Verantwortlicher im Sinne/);
	});
});
