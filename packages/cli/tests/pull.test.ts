// `dealsystem pull` gegen den Mock-Server: Live-Version und `--version`, nur in neue oder leere Ordner,
// Prüfsumme, Größengrenzen, bösartige Archive. Nach jedem Fehler liegt nichts im Arbeitsordner.

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialStore } from '../src/auth/credentials.js';
import { PULL_LIMITS } from '../src/commands/pull.js';
import { createTarGz } from '../src/project/tar.js';
import { runCli, testIO, type TestIO } from './helpers/io.js';
import { SITE_ID, startMockServer, type MockServer, type MockVersion } from './helpers/mockServer.js';
import { rawTarGz } from './helpers/rawTar.js';

let server: MockServer;
let cwd: string;
let io: TestIO;

const CONFIG_OHNE_ID = `import { defineSite } from '@dealsystem/site/config';\n\nexport default defineSite({\n\tsiteId: '',\n\tfunnels: {},\n});\n`;

function archive(config = CONFIG_OHNE_ID): Buffer {
	return createTarGz([
		{ path: 'package.json', data: Buffer.from('{"name":"muster"}') },
		{ path: 'dealsystem.config.ts', data: Buffer.from(config) },
		{ path: 'src/routes/+page.svelte', data: Buffer.from('<h1>Muster</h1>') },
		{ path: 'AGENTS.md', data: Buffer.from('# Anleitung') },
	]);
}

function addVersion(v: Partial<MockVersion> & { id: string; number: number }): MockVersion {
	const full: MockVersion = {
		status: 'ready',
		trigger: 'upload',
		message: null,
		previewUrl: null,
		checkResult: null,
		sha256: '',
		bytes: 0,
		uploaded: null,
		pollsUntilSettled: 0,
		finalStatus: 'ready',
		...v,
	};
	server.state.versions.push(full);
	return full;
}

/** Nur das Ziel darf entstehen; keine Temp-Ordner, nichts außerhalb. */
function cwdEntries(): string[] {
	return readdirSync(cwd).sort();
}

const pulls = (): string[] =>
	server.requests
		.filter((r) => r.path.includes('/source') || r.path.startsWith('/download/'))
		.map((r) => r.path);

beforeEach(async () => {
	server = await startMockServer();
	cwd = mkdtempSync(join(tmpdir(), 'ds-cli-pull-'));
	io = testIO({ cwd, env: { DEALSYSTEM_API_URL: server.url } });
	new CredentialStore(io.env).save(
		server.url,
		{ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: io.now().getTime() + 3600_000, scope: null },
		io.now(),
	);
	addVersion({ id: 'v1', number: 1 });
	server.state.sources.v1 = { archive: archive() };
	server.state.sites[0]!.liveVersionId = 'v1';
});

afterEach(async () => {
	await server.close();
	rmSync(cwd, { recursive: true, force: true });
	PULL_LIMITS.maxDownloadBytes = 50 * 1024 * 1024;
});

describe('pull', () => {
	it('holt die Live-Version nach ./<slug>, setzt die siteId und nennt die nächsten Schritte', async () => {
		const r = await runCli(io, 'pull');
		expect(r.code).toBe(0);
		expect(cwdEntries()).toEqual(['muster']);
		const dir = join(cwd, 'muster');
		expect(readFileSync(join(dir, 'src', 'routes', '+page.svelte'), 'utf8')).toBe('<h1>Muster</h1>');
		expect(readFileSync(join(dir, 'dealsystem.config.ts'), 'utf8')).toContain(`siteId: '${SITE_ID}'`);
		expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.dealsystem/');
		expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
		expect(r.stdout).toContain('cd muster');
		expect(r.stdout).toContain('npm install');
		expect(r.stdout).toContain('npx dealsystem sync');
		// Die signierte Adresse bekommt keinen Token.
		const download = server.requests.find((q) => q.path.startsWith('/download/'));
		expect(download?.headers.authorization).toBeUndefined();
	});

	it('danach findet deploy die Seite (siteId aus der Konfiguration)', async () => {
		await runCli(io, 'pull');
		const next = testIO({ cwd: join(cwd, 'muster'), env: io.env });
		const r = await runCli(next, 'status', '--json');
		expect(r.code).toBe(0);
		expect(r.json.data.site.id).toBe(SITE_ID);
	});

	it('--version mit Nummer; eine Inhalts-Version liefert den Code ihrer Code-Version', async () => {
		addVersion({ id: 'v2', number: 2, trigger: 'content' });
		server.state.sources.v2 = { archive: archive(), codeVersionId: 'v1', codeVersionNumber: 1 };
		const r = await runCli(io, 'pull', 'neu', '--version', '2', '--json');
		expect(r.code).toBe(0);
		expect(r.json.data).toMatchObject({
			versionId: 'v2',
			versionNumber: 2,
			trigger: 'content',
			codeVersionId: 'v1',
			siteIdSet: true,
			directory: join(cwd, 'neu'),
		});
		expect(pulls()).toContain('/api/v1/websites/' + SITE_ID + '/versions/v2/source');
		expect(existsSync(join(cwd, 'neu', 'package.json'))).toBe(true);
	});

	it('nimmt einen leeren vorhandenen Ordner', async () => {
		mkdirSync(join(cwd, 'leer'));
		const r = await runCli(io, 'pull', 'leer');
		expect(r.code).toBe(0);
		expect(existsSync(join(cwd, 'leer', 'package.json'))).toBe(true);
		expect(cwdEntries()).toEqual(['leer']);
	});

	it('bricht bei einem nicht leeren Ordner ab, bevor etwas geladen oder geschrieben wird', async () => {
		mkdirSync(join(cwd, 'muster'));
		writeFileSync(join(cwd, 'muster', 'package.json'), 'MEINS');
		const r = await runCli(io, 'pull', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('target_not_empty');
		expect(readFileSync(join(cwd, 'muster', 'package.json'), 'utf8')).toBe('MEINS');
		expect(readdirSync(join(cwd, 'muster'))).toEqual(['package.json']);
		expect(pulls()).toEqual([]);
	});

	it('ohne Live-Version: klare Meldung mit Hinweis auf --version', async () => {
		server.state.sites[0]!.liveVersionId = null;
		const r = await runCli(io, 'pull', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('no_live_version');
		expect(r.json.error.fix).toContain('--version');
		expect(cwdEntries()).toEqual([]);
	});

	it('bei mehreren Seiten ohne --site eine Liste', async () => {
		server.state.sites.push({ ...server.state.sites[0]!, id: 'zweite', slug: 'zweite' });
		const r = await runCli(io, 'pull', '--json');
		expect(r.json.error.code).toBe('site_ambiguous');
		expect(r.json.error.fix).toContain('pull --site');
	});

	it('abgelaufenes Quellpaket: Fehlercode und Rat vom Server', async () => {
		server.state.sourceError = { status: 410, code: 'source_expired', message: 'Quellpaket gelöscht' };
		const r = await runCli(io, 'pull', '--json');
		expect(r.json.error.code).toBe('source_expired');
		expect(r.json.error.fix).toContain('Live-Version');
		expect(cwdEntries()).toEqual([]);
	});

	it('falsche Prüfsumme: nichts wird geschrieben', async () => {
		server.state.sources.v1!.sha256 = 'a'.repeat(64);
		const r = await runCli(io, 'pull', '--json');
		expect(r.json.error.code).toBe('checksum_mismatch');
		expect(cwdEntries()).toEqual([]);
	});

	it('angekündigt zu groß: kein Download', async () => {
		PULL_LIMITS.maxDownloadBytes = 100;
		const r = await runCli(io, 'pull', '--json');
		expect(r.json.error.code).toBe('download_too_large');
		expect(pulls().some((p) => p.startsWith('/download/'))).toBe(false);
		expect(cwdEntries()).toEqual([]);
	});

	it('liefert der Speicher mehr als angekündigt, bricht der Download ab', async () => {
		const src = server.state.sources.v1!;
		src.served = Buffer.concat([src.archive, Buffer.alloc(4096, 7)]);
		const r = await runCli(io, 'pull', '--json');
		expect(r.json.error.code).toBe('download_too_large');
		expect(cwdEntries()).toEqual([]);
	});

	it.each([
		['Pfad mit ..', [{ name: '../boese.txt', data: 'x' }]],
		['absoluter Pfad', [{ name: '/tmp/ds-pull-boese.txt', data: 'x' }]],
		[
			'Symlink nach außen',
			[
				{ name: 'link', type: '2', linkname: '..' },
				{ name: 'link/boese.txt', data: 'x' },
			],
		],
		['Hardlink', [{ name: 'passwd', type: '1', linkname: '/etc/passwd' }]],
	])('bösartiges Archiv (%s): Abbruch, nichts geschrieben', async (_, entries) => {
		server.state.sources.v1 = { archive: rawTarGz([{ name: 'package.json', data: '{}' }, ...entries]) };
		const r = await runCli(io, 'pull', '--json');
		expect(r.code).toBe(1);
		expect(r.json.error.code).toBe('unsafe_archive');
		expect(cwdEntries()).toEqual([]);
		expect(existsSync('/tmp/ds-pull-boese.txt')).toBe(false);
	});

	it('steht in der Hilfe', async () => {
		const r = await runCli(io, 'pull', '--help');
		expect(r.stdout).toContain('dealsystem pull [ordner]');
	});
});
