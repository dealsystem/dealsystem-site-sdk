// Snapshot der Ausgabe von `check` (Text und JSON) und Stabilität der Bibliotheks-Schnittstelle.

import type { CheckResult } from '../src/check/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import {
	checkResultToJson,
	createMemoryFileSet,
	formatCheckText,
	RULE_SET_VERSION,
	RuleSetMismatchError,
	runCheck,
	toBuildReportCheck,
	type CheckPlugin,
} from '../src/check/index.js';
import { isUploadPath } from '../src/project/uploadFiles.js';
import { createTarGz, readTarGz } from '../src/project/tar.js';
import { BASE_OUTPUT, BASE_SOURCE, cleanupFixtures, homePage, materialize } from './helpers/fixtures.js';
import { runCli, testIO } from './helpers/io.js';

afterAll(() => cleanupFixtures());

const BROKEN: Record<string, string | null> = {
	'src/routes/+page.svelte': homePage(
		'<h1>Hallo</h1>\n<img src="https://bilder.example.com/haus.jpg" />\n<div>{@html text}</div>',
		"\tconst text = '<b>x</b>';\n",
	),
	'src/hooks.server.ts': 'export const handle = ({ event, resolve }) => resolve(event);\n',
	'src/lib/merken.ts': "export const merken = (v: string) => localStorage.setItem('x', v);\n",
};

describe('Ausgabe von check', () => {
	it('Text: „Datei:Zeile – Problem – Korrektur“ je Fund, stabil sortiert', async () => {
		const dir = materialize(BASE_SOURCE, BROKEN);
		const io = testIO({ cwd: dir });
		const r = await runCli(io, 'check');
		expect(r.code).toBe(1);
		expect(r.stdout).toMatchSnapshot();
	});

	it('JSON: feste Feldreihenfolge und Form', async () => {
		const dir = materialize(BASE_SOURCE, BROKEN);
		const io = testIO({ cwd: dir });
		const r = await runCli(io, 'check', '--json');
		expect(r.code).toBe(1);
		expect(Object.keys(r.json)).toEqual(['ok', 'command', 'data']);
		expect(Object.keys(r.json.data)).toEqual(['passed', 'ruleSetVersion', 'stages', 'errors', 'warnings']);
		expect(Object.keys(r.json.data.errors[0])).toEqual([
			'rule',
			'severity',
			'file',
			'line',
			'column',
			'message',
			'fix',
		]);
		expect(r.stdout).toMatchSnapshot();
	});

	it('bestandene Prüfung mit Ausgabe-Ordner', async () => {
		const io = testIO({ cwd: BASE_SOURCE });
		const r = await runCli(io, 'check', '--output', BASE_OUTPUT, '--json');
		expect(r.code).toBe(0);
		expect(r.json.data).toEqual({
			passed: true,
			ruleSetVersion: RULE_SET_VERSION,
			stages: ['source', 'output'],
			errors: [],
			warnings: [],
		});
	});

	it('--rules und --allowed listen Katalog und Positiv-Liste', async () => {
		const io = testIO({ cwd: BASE_SOURCE });
		const rules = await runCli(io, 'check', '--rules', '--json');
		expect(rules.json.data.rules.map((r: { id: string }) => r.id)).toContain('SEC-003');
		const allowed = await runCli(io, 'check', '--allowed');
		expect(allowed.stdout).toContain('@dealsystem/site');
	});
});

describe('Bibliothek für den Build-Host', () => {
	it('läuft auf Dateimengen im Speicher, Quelle und Ausgabe getrennt', async () => {
		const output = createMemoryFileSet({
			'index.html': '<html><head><title>x</title></head><body><img src="a.jpg"></body></html>',
		});
		const result = await runCheck({ output, stages: ['output'] });
		expect(result.stages).toEqual(['output']);
		expect(result.errors.map((f) => f.rule)).toEqual(
			expect.arrayContaining(['A11Y-001', 'A11Y-002', 'PRV-004', 'QUA-004']),
		);
	});

	it('lehnt einen abweichenden Regelkatalog ab', async () => {
		await expect(runCheck({ source: createMemoryFileSet({}), ruleSetVersion: '99' })).rejects.toBeInstanceOf(
			RuleSetMismatchError,
		);
	});

	it('Schweregrad überschreibbar (neue Regel erst als Warnung)', async () => {
		const dir = materialize(BASE_SOURCE, {
			'src/routes/+page.svelte': homePage('<h1>A</h1>\n<form></form>'),
		});
		const result = await runCheck({ projectDir: dir, severityOverrides: { 'SEC-007': 'warning' } });
		expect(result.passed).toBe(true);
		expect(result.warnings.map((f) => f.rule)).toContain('SEC-007');
	});

	it('Andockpunkt für Phase 2: Browser-Prüfungen als Plugin', async () => {
		const axe: CheckPlugin = {
			meta: [
				{
					id: 'AXE-001',
					severity: 'error',
					stages: ['browser'],
					title: 'axe-core',
					fix: 'Behebe den axe-Fund.',
				},
			],
			run: ({ output }) =>
				output ? [{ rule: 'AXE-001', file: 'index.html', message: 'Kontrast zu gering (axe).' }] : [],
		};
		const result = await runCheck({ outputDir: BASE_OUTPUT, plugins: [axe] });
		expect(result.errors).toEqual([
			{
				rule: 'AXE-001',
				severity: 'error',
				file: 'index.html',
				line: null,
				column: null,
				message: 'Kontrast zu gering (axe).',
				fix: 'Behebe den axe-Fund.',
			},
		]);
	});

	it('Build-Report: Quelle und Ausgabe zusammengeführt, mit Korrektur je Fund', async () => {
		const dir = materialize(BASE_SOURCE, BROKEN);
		const source = await runCheck({ projectDir: dir });
		const output = await runCheck({ outputDir: BASE_OUTPUT });
		const report = toBuildReportCheck([source, output]);
		expect(report.ruleSetVersion).toBe(RULE_SET_VERSION);
		expect(Object.keys(report.errors[0]!)).toEqual(['rule', 'file', 'line', 'message', 'fix']);
		expect(report.errors.every((f) => f.fix.length > 0)).toBe(true);
		expect(checkResultToJson(source).passed).toBe(false);
		expect(formatCheckText(output)).toBe(
			'Fertige Seite geprüft: 0 Fehler, 0 Warnungen. Der Quelltext ist nicht geprüft.',
		);
	});

	it('„Prüfung bestanden“ steht nur da, wenn Quelltext und fertige Seite geprüft sind', () => {
		const result = (stages: CheckResult['stages']): CheckResult => ({
			passed: true,
			ruleSetVersion: RULE_SET_VERSION,
			stages,
			errors: [],
			warnings: [],
		});
		expect(formatCheckText(result(['source', 'output']))).toBe(
			'Prüfung bestanden: Quelltext und fertige Seite geprüft, 0 Fehler, 0 Warnungen.',
		);
		const sourceOnly = formatCheckText(result(['source']));
		expect(sourceOnly).not.toContain('bestanden');
		expect(sourceOnly).toContain('Die fertige Seite ist noch NICHT geprüft');
		expect(sourceOnly).toContain('npx dealsystem check --output build');
	});
});

describe('Upload', () => {
	it('Positiv-Liste der Dateien', () => {
		for (const ok of [
			'package.json',
			'package-lock.json',
			'svelte.config.js',
			'dealsystem.config.ts',
			'src/app.html',
			'static/bild.jpg',
			'static/.well-known/security.txt',
			'AGENTS.md',
		]) {
			expect(isUploadPath(ok), ok).toBe(true);
		}
		for (const no of [
			'.env',
			'src/.env',
			'src/.env.production',
			'.npmrc',
			'node_modules/a/index.js',
			'src/node_modules/x.js',
			'.git/HEAD',
			'build/index.html',
			'.svelte-kit/x',
			'.dealsystem/content.json',
			'notizen.txt',
			'src/.DS_Store',
			'static/.htaccess',
			'svelte.config.js.bak',
			'../x',
		]) {
			expect(isUploadPath(no), no).toBe(false);
		}
	});

	it('Tarball ist deterministisch und lesbar', () => {
		const entries = [
			{ path: 'b.txt', data: Buffer.from('b') },
			{ path: `src/${'x'.repeat(120)}/datei.svelte`, data: Buffer.from('<h1>x</h1>') },
			{ path: 'a.txt', data: Buffer.from('a') },
		];
		const one = createTarGz(entries);
		const two = createTarGz([...entries].reverse());
		expect(one.equals(two)).toBe(true);
		expect(readTarGz(one).map((e) => [e.path, Buffer.from(e.data).toString()])).toEqual([
			['a.txt', 'a'],
			['b.txt', 'b'],
			[`src/${'x'.repeat(120)}/datei.svelte`, '<h1>x</h1>'],
		]);
		expect(() => createTarGz([{ path: '../boese', data: Buffer.from('') }])).toThrow();
	});
});
