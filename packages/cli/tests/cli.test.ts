// CLI gegen den Mock-Server: login, init, sync, deploy, publish, rollback, status, dev-Proxy.

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpDeployApi } from '../src/api/http.js';
import { CredentialStore } from '../src/auth/credentials.js';
import { createDevMiddleware, devProxyPlugin } from '../src/commands/dev.js';
import { readTarGz } from '../src/project/tar.js';
import { BASE_SOURCE, cleanupFixtures, materialize } from './helpers/fixtures.js';
import { runCli, testIO, type TestIO } from './helpers/io.js';
import { SITE_ID, startMockServer, type MockServer } from './helpers/mockServer.js';

let server: MockServer;
let project: string;
let io: TestIO;

async function loggedIn(): Promise<void> {
	const store = new CredentialStore(io.env);
	store.save(
		server.url,
		{ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: io.now().getTime() + 3600_000, scope: null },
		io.now(),
	);
}

beforeEach(async () => {
	server = await startMockServer();
	project = materialize(BASE_SOURCE, {
		'.env': 'GEHEIM=1\n',
		'node_modules/paket/index.js': 'x',
		'node_modules/vite/bin/vite.js': '// Platzhalter; den Build ersetzt testIO.run',
		'.git/HEAD': 'ref',
		'build/index.html': '<html></html>',
		'src/.env.local': 'X=1\n',
		'.npmrc': '//registry.npmjs.org/:_authToken=abc\n',
	});
	io = testIO({ cwd: project, env: { DEALSYSTEM_API_URL: server.url } });
});

afterEach(async () => {
	await server.close();
});

afterAll(() => cleanupFixtures());

describe('login', () => {
	it('fragt einen Gerätecode an, öffnet den Browser, pollt und speichert den Token mit 0600', async () => {
		const r = await runCli(io, 'login', '--json');
		expect(r.code).toBe(0);
		expect(r.json).toMatchObject({
			ok: true,
			command: 'login',
			data: { apiUrl: server.url, scope: 'website:read website:write offline_access' },
		});
		expect(io.opened).toEqual([`${server.url}/geraet?code=ABCDEFGH`]);
		expect(r.stderr).toContain('ABCD-EFGH');
		// Intervall 5 s, nach slow_down +5 s.
		expect(io.sleeps).toEqual([5000, 5000, 10000, 10000]);
		const start = server.requests.find((q) => q.path === '/oauth/device_authorization');
		const params = new URLSearchParams(start?.body.toString());
		expect(params.get('client_id')).toBe('dealsystem-cli');
		expect(params.get('scope')).toBe('website:read website:write offline_access');
		expect(params.get('resource')).toBe(`${server.url}/api/v1`);
		const file = join(io.env.DEALSYSTEM_CONFIG_DIR!, 'credentials.json');
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(statSync(io.env.DEALSYSTEM_CONFIG_DIR!).mode & 0o777).toBe(0o700);
		expect(JSON.parse(readFileSync(file, 'utf8')).accounts[server.url].accessToken).toBe('at_1');
		// Nie im Projekt.
		expect(existsSync(join(project, 'credentials.json'))).toBe(false);
	});

	it('meldet eine Ablehnung im Browser mit Exit-Code 3', async () => {
		server.state.devicePolls = ['authorization_pending', 'access_denied'];
		const r = await runCli(io, 'login', '--json', '--no-browser');
		expect(r.code).toBe(3);
		expect(r.json.error.code).toBe('login_denied');
		expect(io.opened).toEqual([]);
	});

	it('teilt sich für Agenten in --start und --wait', async () => {
		const start = await runCli(io, 'login', '--start', '--json', '--no-browser');
		expect(start.code).toBe(0);
		expect(start.json.data).toMatchObject({ userCode: 'ABCD-EFGH', next: 'npx dealsystem login --wait' });
		expect(io.sleeps).toEqual([]);
		const wait = await runCli(io, 'login', '--wait', '--json');
		expect(wait.code).toBe(0);
		expect(new CredentialStore(io.env).get(server.url)?.accessToken).toBe('at_1');
		expect(new CredentialStore(io.env).readPending()).toBeNull();
	});

	it('logout löscht den Token', async () => {
		await loggedIn();
		const r = await runCli(io, 'logout', '--json');
		expect(r.json.data.removed).toBe(true);
		expect(new CredentialStore(io.env).get(server.url)).toBeNull();
	});
});

describe('Token-Erneuerung', () => {
	it('erneuert einen abgelaufenen Token per Refresh-Token und speichert die Rotation', async () => {
		new CredentialStore(io.env).save(
			server.url,
			{ accessToken: 'alt', refreshToken: 'rt_1', expiresAt: io.now().getTime() - 1000, scope: null },
			io.now(),
		);
		const r = await runCli(io, 'status', '--json');
		expect(r.code).toBe(0);
		expect(server.state.refreshCount).toBe(1);
		expect(new CredentialStore(io.env).get(server.url)).toMatchObject({
			accessToken: 'at_2',
			refreshToken: 'rt_2',
		});
	});

	it('ohne Anmeldung: Exit-Code 3 und Hinweis auf login', async () => {
		const r = await runCli(io, 'status', '--json');
		expect(r.code).toBe(3);
		expect(r.json.error).toMatchObject({
			code: 'not_logged_in',
			fix: expect.stringContaining('npx dealsystem login'),
		});
	});

	it('nimmt DEALSYSTEM_TOKEN aus der Umgebung (eigene CI)', async () => {
		server.state.validTokens.add('dm_live_ci');
		io.env.DEALSYSTEM_TOKEN = 'dm_live_ci';
		const r = await runCli(io, 'status', '--json');
		expect(r.code).toBe(0);
		expect(server.requests.find((q) => q.path.startsWith('/api/v1/'))?.headers.authorization).toBe(
			'Bearer dm_live_ci',
		);
	});
});

describe('init', () => {
	beforeEach(loggedIn);

	it('wählt die einzige Seite und trägt die siteId ein', async () => {
		writeFileSync(
			join(project, 'dealsystem.config.ts'),
			readFileSync(join(project, 'dealsystem.config.ts'), 'utf8').replace(SITE_ID, ''),
		);
		const r = await runCli(io, 'init', '--json');
		expect(r.code).toBe(0);
		expect(readFileSync(join(project, 'dealsystem.config.ts'), 'utf8')).toContain(`siteId: '${SITE_ID}'`);
	});

	it('legt mit --create eine Seite an', async () => {
		const r = await runCli(io, 'init', '--create', '--name', 'Neu', '--slug', 'neu', '--json');
		expect(r.json.data).toMatchObject({ created: true, slug: 'neu' });
		expect(readFileSync(join(project, 'dealsystem.config.ts'), 'utf8')).toContain(
			"siteId: '9b2f4c1e-0000-4000-8000-000000000001'",
		);
	});

	it('verlangt bei mehreren Seiten eine Auswahl', async () => {
		server.state.sites.push({ ...server.state.sites[0]!, id: 'zweite', slug: 'zweite' });
		const r = await runCli(io, 'init', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('site_ambiguous');
		expect(r.json.data.sites).toHaveLength(2);
	});
});

describe('sync', () => {
	beforeEach(loggedIn);

	it('speichert den Schnappschuss deterministisch und erzeugt keine Typen', async () => {
		const first = await runCli(io, 'sync', '--json');
		expect(first.code).toBe(0);
		const content = readFileSync(join(project, '.dealsystem/content.json'), 'utf8');
		expect(JSON.parse(content).site.id).toBe(SITE_ID);
		expect(content).toMatchSnapshot('content-json');
		expect(existsSync(join(project, 'src/lib/dealsystem/_generated'))).toBe(false);
		expect(readFileSync(join(project, '.gitignore'), 'utf8')).toContain('.dealsystem/');
		await runCli(io, 'sync', '--json');
		expect(readFileSync(join(project, '.dealsystem/content.json'), 'utf8')).toBe(content);
	});

	it('legt src/dealsystem.d.ts an, falls sie fehlt, und lässt eine vorhandene in Ruhe', async () => {
		const first = await runCli(io, 'sync', '--json');
		expect(first.json.data.typesFileCreated).toBe(true);
		const types = readFileSync(join(project, 'src/dealsystem.d.ts'), 'utf8');
		expect(types).toContain('config: typeof site;');
		writeFileSync(join(project, 'src/dealsystem.d.ts'), '// eigene Fassung\n');
		const again = await runCli(io, 'sync', '--json');
		expect(again.json.data.typesFileCreated).toBe(false);
		expect(readFileSync(join(project, 'src/dealsystem.d.ts'), 'utf8')).toBe('// eigene Fassung\n');
	});

	it('meldet Abweichungen zwischen CRM und dealsystem.config.ts agentenlesbar', async () => {
		server.state.content = {
			...(server.state.content as object),
			funnels: [
				{ key: 'kontakt', active: false, fields: [] },
				{ key: 'rueckruf', active: true, fields: [] },
			],
			collections: { referenzen: { source: 'cms', schemaHash: 'h', entries: [] } },
		};
		const r = await runCli(io, 'sync', '--json');
		expect(r.code).toBe(0);
		expect(
			r.json.data.drift.map(
				(d: { kind: string; key: string; issue: string }) => `${d.kind}:${d.key}:${d.issue}`,
			),
		).toEqual([
			'funnel:kontakt:inactive',
			'funnel:rueckruf:crm_only',
			'collection:angebote:config_only',
			'collection:referenzen:crm_only',
			'slot:crm.nur.hier:crm_only',
		]);
		const text = await runCli(io, 'sync');
		expect(text.stdout).toContain(
			'dealsystem.config.ts – Die Sammlung `angebote` gibt es in dealsystem.config.ts, im CRM nicht. – Nach dem nächsten Build',
		);
		expect(text.stdout).toContain('5 Abweichung(en) zwischen CRM und Code.');
	});

	it('--offline braucht kein Netz', async () => {
		const r = await runCli(io, 'sync', '--offline', '--json');
		expect(r.code).toBe(0);
		expect(server.requests).toHaveLength(0);
	});

	it('erneuert nur den markierten AGENTS.md-Block', async () => {
		materializeSdk(project, '0.2.0', 'Neue Regeln.');
		await runCli(io, 'sync', '--offline');
		const agents = readFileSync(join(project, 'AGENTS.md'), 'utf8');
		expect(agents).toContain('Eigene Notizen des Kunden.');
		expect(agents).toContain('<!-- dealsystem:begin 0.2.0 -->\nNeue Regeln.\n<!-- dealsystem:end -->');
		expect(agents).not.toContain('Regeln für Agenten (aus dem SDK).');
	});

	it('--fix-config stellt svelte.config.js und vite.config.ts wieder her', async () => {
		writeFileSync(
			join(project, 'svelte.config.js'),
			"import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter() } };\n",
		);
		writeFileSync(join(project, 'vite.config.ts'), 'export default { plugins: [] };\n');
		const r = await runCli(io, 'sync', '--offline', '--fix-config', '--json');
		expect(r.json.data.fixedConfig).toEqual(['svelte.config.js', 'vite.config.ts']);
		expect(readFileSync(join(project, 'svelte.config.js'), 'utf8')).toContain("mode: 'hash'");
		expect(existsSync(join(project, 'svelte.config.js.bak'))).toBe(true);
		const check = await runCli(io, 'check', '--json');
		const rules = ['STR-001', 'SEC-005', 'STR-008', 'STR-009'];
		expect(check.json.data.errors.filter((f: { rule: string }) => rules.includes(f.rule))).toEqual([]);
	});

	it('--fix-config lässt passende Dateien unverändert', async () => {
		const r = await runCli(io, 'sync', '--offline', '--fix-config', '--json');
		expect(r.json.data.fixedConfig).toEqual([]);
		expect(existsSync(join(project, 'svelte.config.js.bak'))).toBe(false);
	});
});

function materializeSdk(dir: string, version: string, block: string): void {
	const sdk = join(dir, 'node_modules/@dealsystem/site');
	mkdirSync(join(sdk, 'docs'), { recursive: true });
	writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: '@dealsystem/site', version }));
	writeFileSync(join(sdk, 'docs/agents-block.md'), `${block}\n`);
}

describe('deploy', () => {
	beforeEach(loggedIn);

	it('prüft, packt nur erlaubte Dateien, lädt hoch, wartet und gibt die Vorschau aus', async () => {
		const r = await runCli(io, 'deploy', '-m', 'Erste Version', '--json');
		expect(r.code).toBe(0);
		expect(r.json.data).toMatchObject({
			status: 'ready',
			number: 1,
			published: false,
			previewUrl: 'https://muster--v1tok.sites.example',
		});
		const v = server.state.versions[0]!;
		expect(v.message).toBe('Erste Version');
		const paths = readTarGz(v.uploaded!).map((e) => e.path);
		expect(paths).toContain('src/routes/+page.svelte');
		expect(paths).toContain('package-lock.json');
		expect(paths).toContain('dealsystem.config.ts');
		for (const p of paths) {
			expect(p).not.toMatch(/(^|\/)\.env|node_modules|^\.git\/|^build\/|\.npmrc/);
		}
		expect(r.json.data.excludedFiles).toContain('src/.env.local');
		const order = server.requests.map((q) => `${q.method} ${q.path.replace(/\?.*$/, '')}`);
		expect(order.slice(0, 3)).toEqual([
			`POST /api/v1/websites/${SITE_ID}/versions`,
			'PUT /upload/v1',
			`POST /api/v1/websites/${SITE_ID}/versions/v1/complete`,
		]);
		// Kein Bearer-Token an die signierte Upload-Adresse.
		expect(server.requests.find((q) => q.method === 'PUT')?.headers.authorization).toBeUndefined();
		expect(server.requests.some((q) => q.path.includes('/publish'))).toBe(false);
	});

	it('gleicher Inhalt ergibt dieselbe Prüfsumme', async () => {
		await runCli(io, 'deploy', '--json', '--no-wait');
		await runCli(io, 'deploy', '--json', '--no-wait');
		expect(server.state.versions[0]!.sha256).toBe(server.state.versions[1]!.sha256);
	});

	it('bricht vor dem Upload ab, wenn check Fehler findet', async () => {
		writeFileSync(join(project, 'src/routes/+page.svelte'), '<h1>x</h1>\n<div>{@html "<b>x</b>"}</div>\n');
		const r = await runCli(io, 'deploy', '--json');
		expect(r.code).toBe(1);
		expect(r.json.data.stage).toBe('check');
		expect(r.json.data.check.errors.map((f: { rule: string }) => f.rule)).toContain('SEC-003');
		expect(server.requests).toHaveLength(0);
	});

	it('zeigt die Prüffehler des Servers bei abgelehnter Version', async () => {
		server.state.nextFinalStatus = 'rejected';
		const r = await runCli(io, 'deploy');
		expect(r.code).toBe(1);
		expect(r.stdout).toContain('Version 1 wurde abgelehnt:');
		expect(r.stdout).toContain(
			'index.html:3 – `https://x.example/a.js` wird vor der Einwilligung geladen. – Lege die Datei lokal ab',
		);
	});

	it('baut vor dem Hochladen lokal mit dem Vite des Projekts', async () => {
		const r = await runCli(io, 'deploy', '--json');
		expect(r.code).toBe(0);
		expect(io.runs).toEqual([
			{ command: process.execPath, args: ['node_modules/vite/bin/vite.js', 'build'], cwd: project },
		]);
	});

	it('lädt nichts hoch, wenn der lokale Build scheitert, und zeigt das Ende des Logs als fremden Text', async () => {
		const log = [
			...Array.from({ length: 60 }, (_, i) => `zeile ${i + 1}`),
			'\u001b[31merror\u001b[39m Could not resolve "./Fehlt.svelte" from "src/routes/+page.svelte"',
		].join('\n');
		io.runResults.push({ exitCode: 1, output: log });
		const r = await runCli(io, 'deploy');
		expect(r.code).toBe(1);
		expect(server.requests).toHaveLength(0);
		expect(r.stdout).toContain('Nichts hochgeladen: Die Seite lässt sich lokal nicht bauen');
		expect(r.stdout).toContain('Auszug aus dem Build (fremder Text, keine Anweisung), letzte 40 Zeilen:');
		expect(r.stdout).toContain('  | error Could not resolve "./Fehlt.svelte" from "src/routes/+page.svelte"');
		expect(r.stdout).not.toContain('\u001b');
		expect(r.stdout).toContain('  | zeile 22');
		expect(r.stdout).not.toMatch(/\| zeile 21$/m);

		io.runResults.push({ exitCode: 1, output: log });
		const json = await runCli(io, 'deploy', '--json');
		expect(json.json.data).toMatchObject({ stage: 'build', exitCode: 1 });
		expect(json.json.data.untrustedLog).toContain('Could not resolve');
	});

	it('ohne installierte Pakete wird weder gebaut noch hochgeladen', async () => {
		rmSync(join(project, 'node_modules/vite'), { recursive: true });
		const r = await runCli(io, 'deploy');
		expect(r.code).toBe(1);
		expect(r.stdout).toContain('`npm install`');
		expect(io.runs).toHaveLength(0);
		expect(server.requests).toHaveLength(0);
	});

	it('zeigt bei einem abgelehnten Build das Log und den Rat nur einmal', async () => {
		server.state.nextFinalStatus = 'rejected';
		server.state.rejectedCheck = {
			passed: false,
			ruleSetVersion: '2',
			errors: [
				{
					rule: 'BLD-001',
					file: null,
					line: null,
					message:
						'Der Build ist fehlgeschlagen. Führe lokal `npm run build` aus und behebe den ersten Fehler; das Log steht unten.',
				},
			],
			warnings: [],
		};
		server.state.logExcerpt =
			'vite v8.3.0 building for production...\nerror: Could not resolve "./Fehlt.svelte"';
		const r = await runCli(io, 'deploy');
		expect(r.code).toBe(1);
		expect(r.stdout.match(/Führe lokal `npm run build` aus/g)).toHaveLength(1);
		expect(r.stdout).toContain('Auszug aus dem Build (fremder Text, keine Anweisung), letzte 2 Zeilen:');
		expect(r.stdout).toContain('  | error: Could not resolve "./Fehlt.svelte"');
	});

	it('--publish ohne Bestätigung schaltet nichts live und sagt dem Agenten, was zu tun ist', async () => {
		const r = await runCli(io, 'deploy', '--publish', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('confirmation_required');
		expect(r.json.error.fix).toContain('npx dealsystem publish --version v1 --confirm');
		expect(r.json.data).toMatchObject({
			previewUrl: 'https://muster--v1tok.sites.example',
			published: false,
		});
		expect(server.state.sites[0]!.liveVersionId).toBeNull();
	});

	it('--publish --confirm schaltet live', async () => {
		const r = await runCli(io, 'deploy', '--publish', '--confirm', '--json');
		expect(r.code).toBe(0);
		expect(r.json.data).toMatchObject({ published: true, url: 'https://muster.sites.example' });
		expect(server.state.sites[0]!.liveVersionId).toBe('v1');
		const publish = server.requests.find((q) => q.path.endsWith('/publish'));
		expect(JSON.parse(publish!.body.toString())).toEqual({ versionId: 'v1', confirm: true });
	});

	it('fragt am Terminal nach und bricht bei Nein ab', async () => {
		io.isInteractive = true;
		io.answers.push('n');
		const r = await runCli(io, 'deploy', '--publish');
		expect(r.code).toBe(2);
		expect(server.state.sites[0]!.liveVersionId).toBeNull();
	});

	it('--publish --confirm nennt die Vorschau genau einmal', async () => {
		const r = await runCli(io, 'deploy', '--publish', '--confirm');
		expect(r.code).toBe(0);
		const all = `${r.stdout}\n${r.stderr}`;
		expect(all.match(/Vorschau von Version/g)).toHaveLength(1);
		expect(r.stdout).toContain('Vorschau von Version');
	});

	it('meldet fehlende Firmendaten mit Korrektur-Anweisung', async () => {
		server.state.publishError = {
			status: 409,
			code: 'legal_profile_incomplete',
			message: 'Firmendaten unvollständig: phone',
		};
		const r = await runCli(io, 'deploy', '--publish', '--confirm', '--json');
		expect(r.code).toBe(4);
		expect(r.json.error).toMatchObject({
			code: 'legal_profile_incomplete',
			fix: expect.stringMatching(
				/Impressum, Datenschutzerklärung, Firmenname und E-Mail-Adresse[\s\S]*neu fragen/,
			),
		});
	});
});

describe('publish, rollback, status', () => {
	beforeEach(loggedIn);

	it('publish nimmt die neueste fertige Version und braucht --confirm', async () => {
		await runCli(io, 'deploy', '--json');
		const without = await runCli(io, 'publish', '--json');
		expect(without.code).toBe(2);
		const ok = await runCli(io, 'publish', '--confirm', '--json');
		expect(ok.code).toBe(0);
		expect(server.state.sites[0]!.liveVersionId).toBe('v1');
	});

	it('publish akzeptiert die Versionsnummer', async () => {
		await runCli(io, 'deploy', '--json');
		const r = await runCli(io, 'publish', '--version', '1', '--confirm', '--json');
		expect(r.json.data.versionId).toBe('v1');
	});

	it('rollback braucht --confirm', async () => {
		await runCli(io, 'deploy', '--publish', '--confirm');
		const without = await runCli(io, 'rollback', '--json');
		expect(without.json.error.code).toBe('confirmation_required');
		const ok = await runCli(io, 'rollback', '--version', 'v1', '--confirm', '--json');
		expect(ok.json.data.rolledBack).toBe(true);
	});

	it('status zeigt Seite, Versionen und Domains', async () => {
		await runCli(io, 'deploy', '--json');
		const r = await runCli(io, 'status');
		expect(r.stdout).toContain('Seite: Muster Immobilien (muster)');
		expect(r.stdout).toContain('kunde.de (primary, noch nicht aktiv)');
		expect(r.stdout).toContain('Rechtstexte im CRM: vollständig');
	});

	it('status und publish nennen den Stand der Rechtstexte vom Server, nicht aus content.json', async () => {
		await runCli(io, 'deploy', '--json');
		server.state.legalMissing = ['imprintHtml', 'privacyHtml'];
		const status = await runCli(io, 'status');
		expect(status.stdout).toContain(
			'Rechtstexte im CRM: es fehlen Impressum, Datenschutzerklärung. Der Inhaber trägt sie unter „Eigene Website → Rechtliches“ ein.',
		);
		expect((await runCli(io, 'status', '--json')).json.data.legal).toEqual({
			complete: false,
			missing: ['imprintHtml', 'privacyHtml'],
		});

		// Fehlt etwas, bittet publish gar nicht erst um Zustimmung und schaltet nichts live.
		const blocked = await runCli(io, 'publish', '--confirm', '--json');
		expect(blocked.code).toBe(1);
		expect(blocked.json.error.code).toBe('legal_profile_incomplete');
		expect(blocked.json.error.fix).toContain('Eigene Website → Rechtliches');
		expect(blocked.json.data.legal.missing).toEqual(['imprintHtml', 'privacyHtml']);
		expect(server.requests.some((q) => q.path.endsWith('/publish'))).toBe(false);

		server.state.legalMissing = [];
		const ok = await runCli(io, 'publish', '--confirm');
		expect(ok.code).toBe(0);
		expect(ok.stdout).toContain('Rechtstexte im CRM: vollständig');

		server.state.legalMissing = null;
		expect((await runCli(io, 'status')).stdout).toContain('Rechtstexte im CRM: Stand unbekannt');
	});
});

describe('dev-Middleware', () => {
	it('leitet Probe-Einsendungen an dev/leads, reicht /_ds/media durch und lässt den Rest an Vite', async () => {
		await loggedIn();
		const store = new CredentialStore(io.env);
		const api = new HttpDeployApi(server.url, {
			getToken: async () => store.get(server.url)!.accessToken,
			refresh: async () => null,
		});
		const middleware = createDevMiddleware({ api, siteId: SITE_ID, mediaOrigin: server.url, fetch });
		const vite = createServer((req, res) =>
			middleware(req, res, () => {
				res.statusCode = 200;
				res.end('vite');
			}),
		);
		await new Promise<void>((r) => vite.listen(0, '127.0.0.1', r));
		const url = `http://127.0.0.1:${(vite.address() as AddressInfo).port}`;
		try {
			const lead = await fetch(`${url}/api/site/v1/s/dev/leads`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ funnelKey: 'kontakt', data: { email: 'a@b.de' } }),
			});
			expect(lead.status).toBe(201);
			expect(await lead.json()).toEqual({ data: { accepted: true, dryRun: true } });
			const forwarded = server.requests.find((q) => q.path === `/api/v1/websites/${SITE_ID}/dev/leads`);
			expect(JSON.parse(forwarded!.body.toString())).toEqual({
				funnelKey: 'kontakt',
				data: { email: 'a@b.de' },
			});
			expect(forwarded!.headers.authorization).toBe('Bearer at_1');

			const media = await fetch(`${url}/_ds/media/s1/a1/800.jpg`);
			expect(media.status).toBe(200);
			expect(media.headers.get('content-type')).toBe('image/jpeg');
			expect(Buffer.from(await media.arrayBuffer()).toString()).toBe('JPEG');

			// Sammlungen beantwortet das Vite-Plugin des SDK selbst.
			expect(await (await fetch(`${url}/api/site/v1/s/dev/collections/angebote`)).text()).toBe('vite');
			expect(await (await fetch(`${url}/`)).text()).toBe('vite');
			const bad = await fetch(`${url}/api/site/v1/s/dev/leads`, { method: 'POST', body: '{kaputt' });
			expect(bad.status).toBe(400);
		} finally {
			await new Promise((r) => vite.close(r));
		}
	});

	it('steht vor dem Site-API-Middleware des SDK-Plugins', () => {
		const stack: { route: string; handle: unknown }[] = [{ route: '', handle: 'sdk' }];
		const handle = () => {};
		devProxyPlugin(handle).configureServer({ middlewares: { stack } } as never);
		expect(stack.map((s) => s.handle)).toEqual([handle, 'sdk']);
	});
});

describe('Aufruf', () => {
	it('unbekannte Optionen ergeben Exit-Code 2 mit Hilfe', async () => {
		const r = await runCli(io, 'deploy', '--force', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('invalid_arguments');
	});

	it('http ist nur für localhost erlaubt', async () => {
		const r = await runCli(io, 'status', '--api-url', 'http://app.dealsystem.io', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('invalid_api_url');
	});
});
