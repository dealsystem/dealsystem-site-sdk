// Liefert einen gültigen Token: aus `DEALSYSTEM_TOKEN` (API-Schlüssel für eigene CI) oder aus dem
// gespeicherten Login, bei Bedarf per Refresh-Token erneuert.

import { notLoggedIn } from '../api/errors.js';
import type { FetchLike, TokenProvider } from '../api/http.js';
import { refreshTokens } from '../api/oauth.js';
import type { CredentialStore } from './credentials.js';

/** Token gilt als abgelaufen, wenn er in weniger als einer Minute abläuft. */
const EXPIRY_MARGIN_MS = 60_000;

export interface SessionDeps {
	apiUrl: string;
	env: NodeJS.ProcessEnv;
	store: CredentialStore;
	fetch: FetchLike;
	now: () => Date;
}

export function createTokenProvider(deps: SessionDeps): TokenProvider {
	const fromEnv = deps.env.DEALSYSTEM_TOKEN?.trim();
	if (fromEnv) {
		return { getToken: async () => fromEnv, refresh: async () => null };
	}
	// Refresh-Rotation: ein Refresh-Token gilt genau einmal. Parallele Anfragen dürfen deshalb nur eine
	// Auffrischung auslösen und teilen sich deren Ergebnis.
	let inflight: Promise<string | null> | null = null;
	const doRefresh = async (): Promise<string | null> => {
		const account = deps.store.get(deps.apiUrl);
		if (!account?.refreshToken) return null;
		const now = deps.now();
		const tokens = await refreshTokens(deps.apiUrl, account.refreshToken, deps.fetch, now.getTime());
		if (!tokens) return null;
		deps.store.save(deps.apiUrl, tokens, now);
		return tokens.accessToken;
	};
	const refresh = (): Promise<string | null> => {
		inflight ??= doRefresh().finally(() => {
			inflight = null;
		});
		return inflight;
	};
	return {
		async getToken() {
			const account = deps.store.get(deps.apiUrl);
			if (!account) throw notLoggedIn();
			if (account.expiresAt - EXPIRY_MARGIN_MS > deps.now().getTime()) return account.accessToken;
			const fresh = await refresh();
			if (!fresh) throw notLoggedIn();
			return fresh;
		},
		refresh,
	};
}
