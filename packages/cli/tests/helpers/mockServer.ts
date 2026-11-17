// Mock des Core: OAuth-Gerätecode (RFC 8628), `/api/v1/websites/…` nach Konzept 5.2 und ein signierter
// Upload-Endpunkt wie im Object Storage. Zeichnet jede Anfrage auf.

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
	method: string;
	path: string;
	headers: IncomingMessage['headers'];
	body: Buffer;
}

export interface MockVersion {
	id: string;
	number: number;
	status: string;
	trigger: string;
	message: string | null;
	previewUrl: string | null;
	checkResult: unknown;
	sha256: string;
	bytes: number;
	uploaded: Buffer | null;
	/** Wie viele GETs bis zum Endzustand. */
	pollsUntilSettled: number;
	finalStatus: 'ready' | 'rejected' | 'failed';
}

export interface MockState {
	/** Antworten auf Token-Polls in dieser Reihenfolge, danach Tokens. */
	devicePolls: ('authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token')[];
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	/** Tokens, die der Server annimmt. */
	validTokens: Set<string>;
	sites: {
		id: string;
		name: string;
		slug: string;
		status: string;
		liveVersionId: string | null;
		defaultHost: string;
		primaryHost: string | null;
	}[];
	content: unknown;
	versions: MockVersion[];
	nextFinalStatus: 'ready' | 'rejected' | 'failed';
	rejectedCheck: unknown;
	publishError: { status: number; code: string; message: string; [extra: string]: unknown } | null;
	refreshCount: number;
}

export interface MockServer {
	url: string;
	state: MockState;
	requests: RecordedRequest[];
	close(): Promise<void>;
}

export const SITE_ID = '3f1c2b9a-6d4e-4c1a-9b7e-2a5d8c0f1e23';

export async function startMockServer(): Promise<MockServer> {
	const requests: RecordedRequest[] = [];
	const state: MockState = {
		devicePolls: ['authorization_pending', 'slow_down', 'authorization_pending'],
		accessToken: 'at_1',
		refreshToken: 'rt_1',
		expiresIn: 3600,
		validTokens: new Set(['at_1']),
		sites: [
			{
				id: SITE_ID,
				name: 'Muster Immobilien',
				slug: 'muster',
				status: 'active',
				liveVersionId: null,
				defaultHost: 'muster.sites.example',
				primaryHost: null,
			},
		],
		content: {
			snapshotVersion: 1,
			site: {
				id: SITE_ID,
				slug: 'muster',
				name: 'Muster Immobilien',
				primaryHost: 'muster.sites.example',
				locale: 'de',
			},
			funnels: [{ key: 'kontakt', active: true, fields: [] }],
			slots: {
				'start.hero.titel': { type: 'text', value: 'Aus dem CRM' },
				'crm.nur.hier': { type: 'text', value: 'x' },
			},
			collections: {
				angebote: {
					source: 'cms',
					schemaHash: 'h',
					entries: [
						{ slug: 'altbau', publishedAt: '2026-11-01T00:00:00Z', data: { titel: 'Altbau' }, media: {} },
					],
				},
			},
		},
		versions: [],
		nextFinalStatus: 'ready',
		rejectedCheck: {
			passed: false,
			ruleSetVersion: '1',
			errors: [
				{
					rule: 'PRV-001',
					file: 'index.html',
					line: 3,
					message: '`https://x.example/a.js` wird vor der Einwilligung geladen.',
				},
			],
			warnings: [],
		},
		publishError: null,
		refreshCount: 0,
	};
	let deviceIssued = false;

	const server: Server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			const body = Buffer.concat(chunks);
			const url = new URL(req.url ?? '/', 'http://x');
			requests.push({
				method: req.method ?? 'GET',
				path: url.pathname + url.search,
				headers: req.headers,
				body,
			});
			const reply = (status: number, payload: unknown): void => {
				res.writeHead(status, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(payload));
			};
			const form = (): URLSearchParams => new URLSearchParams(body.toString('utf8'));
			const jsonBody = (): Record<string, unknown> =>
				body.length ? (JSON.parse(body.toString('utf8')) as Record<string, unknown>) : {};
			// Fehlerform der API v1: `{ error, message, status, code? }` plus Zusatzfelder.
			const error = (
				status: number,
				code: string,
				message: string,
				extra: Record<string, unknown> = {},
			): void =>
				reply(status, { error: status === 409 ? 'Conflict' : 'Error', message, status, code, ...extra });

			// ---------------------------------------------------------------- OAuth
			if (url.pathname === '/oauth/device_authorization' && req.method === 'POST') {
				const p = form();
				if (p.get('client_id') !== 'dealsystem-cli')
					return reply(401, { error: 'invalid_client', error_description: 'Unknown client' });
				deviceIssued = true;
				return reply(200, {
					device_code: 'dev_code_1',
					user_code: 'ABCDEFGH',
					verification_uri: `${base()}/geraet`,
					verification_uri_complete: `${base()}/geraet?code=ABCDEFGH`,
					expires_in: 900,
					interval: 5,
				});
			}
			if (url.pathname === '/oauth/token' && req.method === 'POST') {
				const p = form();
				const tokens = (): void => {
					state.validTokens.add(state.accessToken);
					reply(200, {
						access_token: state.accessToken,
						refresh_token: state.refreshToken,
						token_type: 'Bearer',
						expires_in: state.expiresIn,
						scope: 'website:read website:write offline_access',
					});
				};
				if (p.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
					if (!deviceIssued || p.get('device_code') !== 'dev_code_1')
						return reply(400, { error: 'invalid_grant' });
					const next = state.devicePolls.shift();
					if (next) return reply(400, { error: next });
					return tokens();
				}
				if (p.get('grant_type') === 'refresh_token') {
					if (p.get('refresh_token') !== state.refreshToken) return reply(400, { error: 'invalid_grant' });
					state.refreshCount += 1;
					state.accessToken = `at_${state.refreshCount + 1}`;
					state.refreshToken = `rt_${state.refreshCount + 1}`;
					return tokens();
				}
				return reply(400, { error: 'unsupported_grant_type' });
			}
			if (url.pathname === '/oauth/revoke') return reply(200, {});

			if (url.pathname.startsWith('/_ds/media/') && req.method === 'GET') {
				res.writeHead(200, {
					'Content-Type': 'image/jpeg',
					'Cache-Control': 'public, max-age=31536000, immutable',
				});
				return res.end('JPEG');
			}

			// ---------------------------------------------------------------- Upload (signiert)
			const up = /^\/upload\/([^/]+)$/.exec(url.pathname);
			if (up && req.method === 'PUT') {
				const v = state.versions.find((x) => x.id === up[1]);
				if (!v || url.searchParams.get('sig') !== 'ok') return error(403, 'signature', 'bad signature');
				if (Number(req.headers['content-length']) !== v.bytes)
					return error(400, 'length', 'Content-Length passt nicht');
				if (req.headers['x-amz-meta-site'] !== 'muster')
					return error(403, 'signature', 'signierter Header fehlt');
				v.uploaded = body;
				res.writeHead(200);
				return res.end();
			}

			// ---------------------------------------------------------------- API v1
			if (!url.pathname.startsWith('/api/v1/')) return error(404, 'not_found', 'Nicht gefunden');
			const auth = req.headers.authorization ?? '';
			if (!auth.startsWith('Bearer ') || !state.validTokens.has(auth.slice(7)))
				return error(401, 'invalid_token', 'Token ungültig');
			const parts = url.pathname.slice('/api/v1/'.length).split('/');
			if (parts[0] !== 'websites') return error(404, 'not_found', 'Nicht gefunden');
			if (parts.length === 1) {
				if (req.method === 'GET') return reply(200, { data: state.sites });
				if (req.method === 'POST') {
					const b = jsonBody();
					const site = {
						id: '9b2f4c1e-0000-4000-8000-000000000001',
						name: String(b.name),
						slug: String(b.slug),
						status: 'active',
						liveVersionId: null,
						defaultHost: `${String(b.slug)}.sites.example`,
						primaryHost: null,
					};
					state.sites.push(site);
					return reply(201, { data: site });
				}
			}
			const site = state.sites.find((s) => s.id === parts[1]);
			if (!site) return error(404, 'not_found', 'Seite nicht gefunden');
			const rest = parts.slice(2);
			if (rest.length === 0 && req.method === 'GET') {
				const live = state.versions.find((v) => v.id === site.liveVersionId) ?? null;
				return reply(200, {
					data: {
						...site,
						domains: [{ host: 'kunde.de', kind: 'primary', activatedAt: null }],
						liveVersion: live && summary(live),
					},
				});
			}
			if (rest[0] === 'content' && req.method === 'GET') return reply(200, { data: state.content });
			if (rest[0] === 'versions' && rest.length === 1) {
				if (req.method === 'GET') return reply(200, { data: [...state.versions].reverse().map(summary) });
				if (req.method === 'POST') {
					const b = jsonBody();
					const id = `v${state.versions.length + 1}`;
					const v: MockVersion = {
						id,
						number: state.versions.length + 1,
						status: 'awaiting_upload',
						trigger: 'upload',
						message: typeof b.message === 'string' ? b.message : null,
						previewUrl: null,
						checkResult: null,
						sha256: String(b.sha256),
						bytes: Number(b.bytes),
						uploaded: null,
						pollsUntilSettled: 2,
						finalStatus: state.nextFinalStatus,
					};
					state.versions.push(v);
					return reply(201, {
						data: {
							versionId: id,
							uploadUrl: `${base()}/upload/${id}?sig=ok`,
							uploadMethod: 'PUT',
							uploadHeaders: { 'Content-Length': String(v.bytes), 'x-amz-meta-site': 'muster' },
							expiresAt: '2026-11-17T12:15:00Z',
							version: full(v),
						},
					});
				}
			}
			const version = rest[0] === 'versions' ? state.versions.find((v) => v.id === rest[1]) : undefined;
			if (rest[0] === 'versions' && !version) return error(404, 'not_found', 'Version nicht gefunden');
			if (version && rest[2] === 'complete' && req.method === 'POST') {
				if (!version.uploaded) return error(409, 'upload_missing', 'Nichts hochgeladen');
				if (createHash('sha256').update(version.uploaded).digest('hex') !== version.sha256)
					return error(409, 'checksum', 'Prüfsumme passt nicht');
				version.status = 'queued';
				return reply(200, { data: full(version) });
			}
			if (version && rest.length === 2 && req.method === 'GET') {
				if (version.status === 'queued' || version.status === 'building') {
					version.pollsUntilSettled -= 1;
					version.status = version.pollsUntilSettled <= 0 ? version.finalStatus : 'building';
					if (version.status === 'ready')
						version.previewUrl = `https://muster--${version.id}tok.sites.example`;
					if (version.status === 'rejected') version.checkResult = state.rejectedCheck;
					if (version.status === 'ready')
						version.checkResult = { passed: true, ruleSetVersion: '1', errors: [], warnings: [] };
				}
				return reply(200, { data: full(version) });
			}
			if ((rest[0] === 'publish' || rest[0] === 'rollback') && req.method === 'POST') {
				const b = jsonBody();
				if (b.confirm !== true) return error(400, 'confirmation_required', 'confirm fehlt');
				if (state.publishError) {
					const { status: st, code, message, ...extra } = state.publishError;
					return error(st, code, message, extra);
				}
				const target =
					rest[0] === 'publish'
						? state.versions.find((v) => v.id === b.versionId)
						: (state.versions.find((v) => v.id === b.versionId) ??
							state.versions.filter((v) => v.status === 'ready')[0]);
				if (!target || target.status !== 'ready')
					return error(409, 'version_not_ready', 'Version nicht bereit', {
						versionStatus: target?.status ?? 'unknown',
					});
				const unchanged = site.liveVersionId === target.id;
				site.liveVersionId = target.id;
				return reply(200, {
					data: {
						site,
						release: unchanged
							? null
							: { versionId: target.id, kind: rest[0], createdAt: '2026-11-17T10:00:00Z' },
					},
				});
			}
			if (rest[0] === 'dev' && rest[1] === 'leads' && req.method === 'POST') {
				return reply(201, { data: { accepted: true, dryRun: true } });
			}
			return error(404, 'not_found', 'Nicht gefunden');
		});
	});

	function summary(v: MockVersion): Record<string, unknown> {
		return {
			id: v.id,
			number: v.number,
			status: v.status,
			trigger: v.trigger,
			message: v.message,
			createdAt: '2026-11-17T10:00:00Z',
			previewUrl: v.previewUrl,
		};
	}
	function full(v: MockVersion): Record<string, unknown> {
		return {
			...summary(v),
			checkResult: v.checkResult,
			logExcerpt: v.status === 'rejected' ? 'vite build: Fehler' : null,
		};
	}

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as AddressInfo).port;
	const base = (): string => `http://127.0.0.1:${port}`;
	return {
		url: base(),
		state,
		requests,
		close: () =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}
