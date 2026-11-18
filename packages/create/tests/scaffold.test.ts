import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageNameFrom, scaffold, ScaffoldError } from '../bin/scaffold.js';
import { createStarter, type StarterProject } from './helpers.js';

let project: StarterProject;

beforeAll(async () => {
	project = await createStarter();
});

afterAll(() => project.remove());

describe('npm create dealsystem-site', () => {
	it('legt alle Dateien des Starters an', async () => {
		const files = await readdir(project.dir, { recursive: true });
		expect(files).toEqual(
			expect.arrayContaining([
				'AGENTS.md',
				'CLAUDE.md',
				'README.md',
				'.gitignore',
				'package.json',
				'dealsystem.config.ts',
				'svelte.config.js',
				'vite.config.ts',
				join('.cursor', 'rules', 'dealsystem.mdc'),
				join('.claude', 'skills', 'neue-seite', 'SKILL.md'),
				join('src', 'dealsystem.d.ts'),
				join('src', 'routes', '+layout.svelte'),
				join('src', 'routes', 'kontakt', '+page.svelte'),
				join('src', 'routes', 'impressum', '+page.svelte'),
				join('src', 'routes', 'datenschutz', '+page.svelte'),
				join('src', 'routes', 'angebote', '[slug]', '+page.server.ts'),
				join('src', 'routes', 'sitemap.xml', '+server.ts'),
				join('src', 'routes', 'robots.txt', '+server.ts'),
			]),
		);
		expect(files).not.toContain('_gitignore');
	});

	it('benennt das Paket nach dem Ordner und hält Geheimnisse aus dem Repository', async () => {
		const pkg = JSON.parse(await readFile(join(project.dir, 'package.json'), 'utf8'));
		expect(pkg.name).toBe('meine-website');
		expect(pkg.private).toBe(true);
		const ignore = await readFile(join(project.dir, '.gitignore'), 'utf8');
		for (const entry of ['node_modules/', 'build/', '.env', '.dealsystem/']) expect(ignore).toContain(entry);
	});

	it('überschreibt nie einen Ordner mit Inhalt', async () => {
		const dir = join(project.dir, '..', 'belegt');
		await mkdir(dir);
		await writeFile(join(dir, 'notiz.txt'), 'wichtig');
		await expect(scaffold(dir)).rejects.toThrow(ScaffoldError);
		await expect(scaffold(dir)).rejects.toThrow(/nicht leer \(notiz\.txt\)/);
		expect(await readdir(dir)).toEqual(['notiz.txt']);
	});

	it('macht aus jedem Ordnernamen einen gültigen Paketnamen', () => {
		expect(packageNameFrom('/x/Müller & Söhne Immobilien')).toBe('mueller-soehne-immobilien');
		expect(packageNameFrom('/x/---')).toBe('meine-website');
	});
});

describe('Dateien für KI-Agenten', () => {
	it('CLAUDE.md und die Cursor-Regel verweisen nur auf AGENTS.md', async () => {
		expect(await readFile(join(project.dir, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
		const cursor = await readFile(join(project.dir, '.cursor/rules/dealsystem.mdc'), 'utf8');
		expect(cursor).toContain('alwaysApply: true');
		expect(cursor).toContain('AGENTS.md');
		// Keine zweite Fassung der Regeln, die veralten könnte.
		expect(cursor.length).toBeLessThan(600);
	});

	it('jeder Skill hat Namen und Beschreibung, und der Name passt zum Ordner', async () => {
		const root = join(project.dir, '.claude/skills');
		const skills = (await readdir(root)).sort();
		expect(skills).toEqual([
			'angebote-einbauen',
			'bild-einbauen',
			'domain-verbinden',
			'formular-anbinden',
			'neue-seite',
			'prueffehler-beheben',
			'veroeffentlichen',
		]);
		for (const skill of skills) {
			const text = await readFile(join(root, skill, 'SKILL.md'), 'utf8');
			const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
			expect(front, skill).not.toBeNull();
			expect(front![1]).toBe(skill);
			expect(front![2]!.length).toBeGreaterThan(60);
			expect(text).toContain('node_modules/@dealsystem/site/docs/');
		}
	});

	it('der Skill zum Veröffentlichen verlangt das ausdrückliche Ja', async () => {
		const text = await readFile(join(project.dir, '.claude/skills/veroeffentlichen/SKILL.md'), 'utf8');
		expect(text).toMatch(/Nur bei einem ausdrücklichen Ja/);
		expect(text).toContain('publish --confirm');
	});
});
