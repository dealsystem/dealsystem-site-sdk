// Gerätecode-Login (RFC 8628) gegen den Core: `/oauth/device_authorization` und `/oauth/token`.
// Vorgaben: docs/entscheidungen/geraetecode-login.md und Konzept 5.2 (Client `dealsystem-cli`).

import { CliError, EXIT } from './errors.js';
import type { FetchLike } from './http.js';

export const CLI_CLIENT_ID = 'dealsystem-cli';
export const CLI_SCOPES = 'website:read website:write offline_access';

export interface DeviceAuthorization {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	verificationUriComplete: string;
	expiresIn: number;
	interval: number;
}

export interface TokenSet {
	accessToken: string;
	refreshToken: string | null;
	/** Unix-Millisekunden. */
	expiresAt: number;
	scope: string | null;
}

export type PollResult =
	| { kind: 'pending' }
	| { kind: 'slow_down' }
	| { kind: 'denied' }
	| { kind: 'expired' }
	| { kind: 'tokens'; tokens: TokenSet };

function base(apiUrl: string): string {
	return apiUrl.replace(/\/+$/, '');
}

/** Audience der CLI-Tokens: `<issuer>/api/v1`. */
export function apiResource(apiUrl: string): string {
	return `${base(apiUrl)}/api/v1`;
}

async function postForm(
	fetchImpl: FetchLike,
	url: string,
	params: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
			body: new URLSearchParams(params).toString(),
		});
	} catch (e) {
		throw new CliError(
			'network_error',
			`${url} ist nicht erreichbar (${(e as Error).message}).`,
			'Prüfe die Internetverbindung und versuche es erneut.',
			EXIT.api,
		);
	}
	let json: Record<string, unknown> = {};
	try {
		const parsed = (await res.json()) as unknown;
		if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
	} catch {
		// leer lassen
	}
	return { status: res.status, json };
}

function toTokens(json: Record<string, unknown>, now: number): TokenSet {
	const access = json.access_token;
	if (typeof access !== 'string' || !access) {
		throw new CliError(
			'bad_response',
			'Der Server hat keinen Zugangstoken geliefert.',
			'Führe `npx dealsystem login` erneut aus.',
			EXIT.api,
		);
	}
	const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
	return {
		accessToken: access,
		refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
		expiresAt: now + expiresIn * 1000,
		scope: typeof json.scope === 'string' ? json.scope : null,
	};
}

function oauthFailure(json: Record<string, unknown>, status: number): CliError {
	const error = typeof json.error === 'string' ? json.error : `http_${status}`;
	const description =
		typeof json.error_description === 'string' ? json.error_description : `Status ${status}`;
	const fix =
		error === 'unauthorized_client' || error === 'invalid_client'
			? 'Der Server kennt den CLI-Zugang noch nicht. Prüfe `--api-url` oder melde es an DealSystem.'
			: error === 'temporarily_unavailable' || status === 429
				? 'Warte eine Minute und versuche es erneut.'
				: 'Führe `npx dealsystem login` erneut aus.';
	return new CliError(`oauth_${error}`, `Anmeldung fehlgeschlagen: ${description}.`, fix, EXIT.auth);
}

export async function startDeviceAuthorization(
	apiUrl: string,
	fetchImpl: FetchLike,
): Promise<DeviceAuthorization> {
	const { status, json } = await postForm(fetchImpl, `${base(apiUrl)}/oauth/device_authorization`, {
		client_id: CLI_CLIENT_ID,
		scope: CLI_SCOPES,
		resource: apiResource(apiUrl),
	});
	if (status !== 200) throw oauthFailure(json, status);
	const s = (k: string): string => (typeof json[k] === 'string' ? (json[k] as string) : '');
	const n = (k: string, d: number): number => (typeof json[k] === 'number' ? (json[k] as number) : d);
	if (!s('device_code') || !s('user_code')) throw oauthFailure(json, status);
	return {
		deviceCode: s('device_code'),
		userCode: s('user_code'),
		verificationUri: s('verification_uri'),
		verificationUriComplete: s('verification_uri_complete') || s('verification_uri'),
		expiresIn: n('expires_in', 900),
		interval: n('interval', 5),
	};
}

export async function pollDeviceToken(
	apiUrl: string,
	deviceCode: string,
	fetchImpl: FetchLike,
	now: number,
): Promise<PollResult> {
	const { status, json } = await postForm(fetchImpl, `${base(apiUrl)}/oauth/token`, {
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		device_code: deviceCode,
		client_id: CLI_CLIENT_ID,
	});
	if (status === 200) return { kind: 'tokens', tokens: toTokens(json, now) };
	switch (json.error) {
		case 'authorization_pending':
			return { kind: 'pending' };
		case 'slow_down':
			return { kind: 'slow_down' };
		case 'access_denied':
			return { kind: 'denied' };
		case 'expired_token':
			return { kind: 'expired' };
		default:
			throw oauthFailure(json, status);
	}
}

export async function refreshTokens(
	apiUrl: string,
	refreshToken: string,
	fetchImpl: FetchLike,
	now: number,
): Promise<TokenSet | null> {
	const { status, json } = await postForm(fetchImpl, `${base(apiUrl)}/oauth/token`, {
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: CLI_CLIENT_ID,
		resource: apiResource(apiUrl),
	});
	if (status !== 200) return null;
	const tokens = toTokens(json, now);
	// Refresh-Rotation: ohne neuen Refresh-Token bleibt der alte gültig.
	return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
