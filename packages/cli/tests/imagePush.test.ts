// `dealsystem image push` gegen den Mock-Server: Foto bearbeiten (Metadaten weg), über `/media` und `complete` in den
// Bild-Platz setzen, danach `.dealsystem/content.json` neu holen. Verständliche Meldungen ohne Anmeldung, mit
// falschem Platz und ohne Alternativtext — in diesen Fällen geht nichts ins Netz bzw. nichts in den Platz.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialStore } from '../src/auth/credentials.js';
import { BASE_SOURCE, cleanupFixtures, materialize } from './helpers/fixtures.js';
import { withPhoneExif } from './helpers/exif.js';
import { runCli, testIO, type TestIO } from './helpers/io.js';
import { startMockServer, type MockServer } from './helpers/mockServer.js';

let server: MockServer;
let project: string;
let downloads: string;
let io: TestIO;
let photo: string;

const login = () =>
	new CredentialStore(io.env).save(
		server.url,
		{ accessToken: 'at_1', refreshToken: 'rt_1', expiresAt: io.now().getTime() + 3600_000, scope: null },
		io.now(),
	);

const mediaRequests = () =>
	server.requests
		.filter((r) => r.path.includes('/media') || r.path.includes('/slots'))
		.map((r) => r.method + ' ' + r.path);

beforeEach(async () => {
	server = await startMockServer();
	project = materialize(BASE_SOURCE);
	downloads = mkdtempSync(join(tmpdir(), 'ds-push-'));
	io = testIO({ cwd: project, env: { DEALSYSTEM_API_URL: server.url } });
	login();
	photo = join(downloads, 'IMG_2041.JPG');
	writeFileSync(
		photo,
		await withPhoneExif(
			await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#7a5' } })
				.jpeg()
				.toBuffer(),
			6,
		),
	);
});

afterEach(async () => {
	await server.close();
	cleanupFixtures();
	rmSync(downloads, { recursive: true, force: true });
});

describe('image push', () => {
	it('bearbeitet, lädt hoch, setzt den Platz und holt die Inhalte für dev', async () => {
		const r = await runCli(
			io,
			'image',
			'push',
			photo,
			'--slot',
			'ueber.foto',
			'--alt',
			'Das Team im Büro',
			'--json',
		);
		expect(r.code).toBe(0);
		expect(r.json.data).toMatchObject({
			slotKey: 'ueber.foto',
			mediaId: 'aaaaaaaa-0000-4000-8000-000000000001',
			width: 1920,
			height: 2560,
			format: 'jpeg',
			removed: { exif: true, gps: true },
			contentFile: '.dealsystem/content.json',
		});

		// Was beim Speicher ankam: ohne Metadaten, gedreht und verkleinert.
		const sent = server.requests.find((q) => q.method === 'PUT' && q.path.startsWith('/media-upload/'))!;
		const meta = await sharp(sent.body).metadata();
		expect(meta.exif).toBeUndefined();
		expect([meta.width, meta.height]).toEqual([1920, 2560]);
		expect(sent.headers.authorization).toBeUndefined();

		expect(server.state.slots.find((s) => s.key === 'ueber.foto')!.value).toEqual({
			mediaId: 'aaaaaaaa-0000-4000-8000-000000000001',
			alt: 'Das Team im Büro',
		});
		const content = JSON.parse(readFileSync(join(project, '.dealsystem/content.json'), 'utf8'));
		expect(content.slots['ueber.foto'].value.variants[0].url).toMatch(/^\/_ds\/media\//);
		// Nichts im Projekt selbst geschrieben (das wäre `add`).
		expect(existsSync(join(project, 'src/lib/assets/bilder'))).toBe(false);
	});

	it('Text sagt, dass es ohne Freigabe live geht und wie man zurückkommt', async () => {
		const r = await runCli(io, 'image', 'push', photo, '--slot', 'ueber.foto', '--alt', 'Team');
		expect(r.code).toBe(0);
		expect(r.stdout).toContain('Gesetzt: Bild-Platz ueber.foto');
		expect(r.stdout).toContain('ohne weitere Freigabe');
		expect(r.stdout).toContain('npx dealsystem dev');
		expect(r.stdout).toContain('Auf Standard zurücksetzen');
	});

	it.each([
		['ohne --alt', ['--slot', 'ueber.foto'], 'invalid_arguments', 'Alternativtext'],
		[
			'nur Leerzeichen als --alt',
			['--slot', 'ueber.foto', '--alt', '   '],
			'invalid_arguments',
			'Alternativtext',
		],
		['ohne --slot', ['--alt', 'Team'], 'invalid_arguments', 'Bild-Platz'],
		['Schlüssel ungültig', ['--slot', 'Über Uns', '--alt', 'Team'], 'invalid_arguments', 'kein Schlüssel'],
	])('%s: Meldung vor jedem Netzaufruf', async (_name, flags, code, text) => {
		const r = await runCli(io, 'image', 'push', photo, ...flags, '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe(code);
		expect(`${r.json.error.message} ${r.json.error.fix}`).toContain(text);
		expect(mediaRequests()).toEqual([]);
	});

	it('unbekannter Platz: nennt die vorhandenen Bild-Plätze, lädt nichts hoch', async () => {
		const r = await runCli(io, 'image', 'push', photo, '--slot', 'team.foto', '--alt', 'Team', '--json');
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('slot_not_found');
		expect(r.json.error.fix).toContain('ueber.foto');
		expect(r.json.error.fix).toContain('npx dealsystem deploy');
		expect(mediaRequests()).toEqual([`GET /api/v1/websites/${server.state.sites[0]!.id}/slots`]);
	});

	it('Text-Platz statt Bild-Platz: eigene Meldung', async () => {
		const r = await runCli(
			io,
			'image',
			'push',
			photo,
			'--slot',
			'start.hero.titel',
			'--alt',
			'Team',
			'--json',
		);
		expect(r.code).toBe(2);
		expect(r.json.error.code).toBe('slot_not_image');
		expect(r.json.error.fix).toContain('ueber.foto');
	});

	it('ohne Anmeldung: verständliche Meldung, Exit 3, nichts gesetzt', async () => {
		io = testIO({ cwd: project, env: { DEALSYSTEM_API_URL: server.url } });
		const r = await runCli(io, 'image', 'push', photo, '--slot', 'ueber.foto', '--alt', 'Team', '--json');
		expect(r.code).toBe(3);
		expect(r.json.error.code).toBe('not_logged_in');
		expect(r.json.error.fix).toContain('dealsystem login');
		expect(server.state.slots.find((s) => s.key === 'ueber.foto')!.value).toBeNull();
	});

	it('kein Bild: lokale Meldung, nichts ins Netz', async () => {
		writeFileSync(photo, 'hallo');
		const r = await runCli(io, 'image', 'push', photo, '--slot', 'ueber.foto', '--alt', 'Team', '--json');
		expect(r.json.error.code).toBe('image_unreadable');
		expect(mediaRequests()).toEqual([]);
	});

	it('AVIF geht als WebP an DealSystem (der Core nimmt JPEG, PNG, WebP)', async () => {
		const avif = join(downloads, 'foto.avif');
		writeFileSync(
			avif,
			await sharp({ create: { width: 600, height: 400, channels: 3, background: '#a57' } })
				.avif()
				.toBuffer(),
		);
		const r = await runCli(io, 'image', 'push', avif, '--slot', 'ueber.foto', '--alt', 'Team', '--json');
		expect(r.code).toBe(0);
		expect(r.json.data.format).toBe('webp');
		const sent = server.requests.find((q) => q.method === 'PUT' && q.path.startsWith('/media-upload/'))!;
		expect((await sharp(sent.body).metadata()).format).toBe('webp');
	});
});
