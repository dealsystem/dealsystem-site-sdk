// Tokens liegen im Benutzerprofil, nie im Projekt (sonst landen sie im Upload oder im Git).
// Datei 0600, Ordner 0700. Geschrieben wird atomar (temporäre Datei + rename).

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TokenSet } from '../api/oauth.js';

export interface StoredAccount extends TokenSet {
	apiUrl: string;
	savedAt: string;
}

interface CredentialsFile {
	version: 1;
	accounts: Record<string, StoredAccount>;
}

export interface PendingLogin {
	apiUrl: string;
	deviceCode: string;
	userCode: string;
	verificationUriComplete: string;
	interval: number;
	/** Unix-Millisekunden. */
	expiresAt: number;
}

export function configDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
	if (env.DEALSYSTEM_CONFIG_DIR) return env.DEALSYSTEM_CONFIG_DIR;
	if (platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'dealsystem');
	if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'dealsystem');
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'dealsystem');
}

function writePrivate(path: string, content: string): void {
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, content, { mode: 0o600 });
	chmodSync(tmp, 0o600);
	renameSync(tmp, path);
	chmodSync(path, 0o600);
}

function ensureDir(dir: string): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(dir, 0o700);
	} catch {
		// Windows kennt keine Unix-Rechte.
	}
}

function normalizeApiUrl(apiUrl: string): string {
	return apiUrl.replace(/\/+$/, '');
}

export class CredentialStore {
	readonly dir: string;

	constructor(env: NodeJS.ProcessEnv) {
		this.dir = configDir(env);
	}

	get credentialsPath(): string {
		return join(this.dir, 'credentials.json');
	}

	get pendingPath(): string {
		return join(this.dir, 'pending-login.json');
	}

	private read(): CredentialsFile {
		try {
			const data = JSON.parse(readFileSync(this.credentialsPath, 'utf8')) as Partial<CredentialsFile>;
			if (data.version === 1 && data.accounts && typeof data.accounts === 'object')
				return data as CredentialsFile;
		} catch {
			// fehlt oder kaputt → leer
		}
		return { version: 1, accounts: {} };
	}

	get(apiUrl: string): StoredAccount | null {
		return this.read().accounts[normalizeApiUrl(apiUrl)] ?? null;
	}

	save(apiUrl: string, tokens: TokenSet, now: Date): StoredAccount {
		ensureDir(this.dir);
		const file = this.read();
		const account: StoredAccount = { ...tokens, apiUrl: normalizeApiUrl(apiUrl), savedAt: now.toISOString() };
		file.accounts[account.apiUrl] = account;
		writePrivate(this.credentialsPath, `${JSON.stringify(file, null, '\t')}\n`);
		return account;
	}

	remove(apiUrl: string): boolean {
		const file = this.read();
		const key = normalizeApiUrl(apiUrl);
		if (!file.accounts[key]) return false;
		delete file.accounts[key];
		if (Object.keys(file.accounts).length === 0) rmSync(this.credentialsPath, { force: true });
		else writePrivate(this.credentialsPath, `${JSON.stringify(file, null, '\t')}\n`);
		return true;
	}

	savePending(pending: PendingLogin): void {
		ensureDir(this.dir);
		writePrivate(this.pendingPath, `${JSON.stringify(pending, null, '\t')}\n`);
	}

	readPending(): PendingLogin | null {
		if (!existsSync(this.pendingPath)) return null;
		try {
			return JSON.parse(readFileSync(this.pendingPath, 'utf8')) as PendingLogin;
		} catch {
			return null;
		}
	}

	clearPending(): void {
		rmSync(this.pendingPath, { force: true });
	}
}
