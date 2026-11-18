// Gemeinsamer Zustand eines Befehls: Optionen, Projektordner, API, Fortschrittsmeldungen.

import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { CliError, EXIT, type ExitCode } from '../api/errors.js';
import { HttpDeployApi } from '../api/http.js';
import type { DeployApi } from '../api/types.js';
import { CredentialStore } from '../auth/credentials.js';
import { createTokenProvider } from '../auth/session.js';
import { readSiteConfig, SITE_CONFIG_FILE } from '../project/siteConfig.js';
import type { CliIO } from './io.js';

export const DEFAULT_API_URL = 'https://app.dealsystem.io';

export type OptionValues = Record<string, string | boolean | undefined>;

export interface CommandResult {
	exitCode: ExitCode;
	/** Inhalt von `data` in der JSON-Ausgabe. */
	data: unknown;
	/** Textausgabe für Menschen und Agenten ohne `--json`. */
	text: string;
}

export class CommandContext {
	readonly apiUrl: string;
	readonly projectDir: string;
	readonly json: boolean;
	readonly store: CredentialStore;
	private apiInstance: DeployApi | undefined;

	constructor(
		readonly io: CliIO,
		readonly command: string,
		readonly options: OptionValues,
		readonly positionals: string[],
		private readonly apiFactory?: (ctx: CommandContext) => DeployApi,
	) {
		const apiUrl = (this.str('api-url') ?? io.env.DEALSYSTEM_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
		try {
			const u = new URL(apiUrl);
			if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
				throw new Error('https');
			}
		} catch {
			throw new CliError(
				'invalid_api_url',
				`\`${apiUrl}\` ist keine gültige API-Adresse.`,
				'Nutze https (z. B. `https://app.dealsystem.io`); http nur für localhost.',
				EXIT.usage,
			);
		}
		this.apiUrl = apiUrl;
		const dir = this.str('dir');
		this.projectDir = dir ? (isAbsolute(dir) ? dir : resolve(io.cwd, dir)) : io.cwd;
		this.json = this.options.json === true;
		this.store = new CredentialStore(io.env);
	}

	str(name: string): string | undefined {
		const v = this.options[name];
		return typeof v === 'string' ? v : undefined;
	}

	flag(name: string): boolean {
		return this.options[name] === true;
	}

	/** Fortschritt auf stderr; stdout bleibt dem Ergebnis vorbehalten (wichtig für `--json`). */
	progress(message: string): void {
		if (this.flag('quiet')) return;
		this.io.stderr(message);
	}

	api(): DeployApi {
		this.apiInstance ??= this.apiFactory
			? this.apiFactory(this)
			: new HttpDeployApi(
					this.apiUrl,
					createTokenProvider({
						apiUrl: this.apiUrl,
						env: this.io.env,
						store: this.store,
						fetch: this.io.fetch,
						now: () => this.io.now(),
					}),
					this.io.fetch,
				);
		return this.apiInstance;
	}

	path(rel: string): string {
		return join(this.projectDir, ...rel.split('/'));
	}

	readProjectFile(rel: string): string | null {
		try {
			return readFileSync(this.path(rel), 'utf8');
		} catch {
			return null;
		}
	}

	/** `--site` oder `siteId` aus dealsystem.config.ts; `null`, wenn keins von beiden da ist. */
	optionalSiteId(): { id: string; source: 'flag' | 'config' } | null {
		const fromFlag = this.str('site');
		if (fromFlag) return { id: fromFlag, source: 'flag' };
		const id = readSiteConfig(this.readProjectFile(SITE_CONFIG_FILE)).data?.siteId;
		return id ? { id, source: 'config' } : null;
	}

	/** `--site` oder `siteId` aus dealsystem.config.ts. */
	siteId(): string {
		const found = this.optionalSiteId();
		if (found) return found.id;
		const config = readSiteConfig(this.readProjectFile(SITE_CONFIG_FILE));
		throw new CliError(
			'no_site',
			config.exists
				? `In ${SITE_CONFIG_FILE} ist keine gültige \`siteId\` eingetragen.`
				: `${SITE_CONFIG_FILE} fehlt in ${this.projectDir}.`,
			'Führe `npx dealsystem init` im Projektordner aus.',
			EXIT.usage,
		);
	}

	/**
	 * Bestätigung für folgenreiche Schritte (Live schalten, Rollback). Agenten laufen ohne Terminal: sie
	 * müssen den Nutzer fragen und dann `--confirm` übergeben, wie `confirmedByUser` im MCP-Werkzeug.
	 */
	async confirm(question: string, retryCommand: string, data?: unknown): Promise<void> {
		if (this.flag('confirm')) return;
		if (this.io.isInteractive && !this.json) {
			const answer = (await this.io.prompt(`${question} [j/N] `)).trim().toLowerCase();
			if (answer === 'j' || answer === 'ja' || answer === 'y' || answer === 'yes') return;
			throw new CliError(
				'not_confirmed',
				'Abgebrochen, nichts wurde live geschaltet.',
				'Nichts zu tun.',
				EXIT.usage,
				data,
			);
		}
		throw new CliError(
			'confirmation_required',
			`${question} Dafür braucht es die ausdrückliche Zustimmung des Nutzers.`,
			`Frage den Nutzer genau das. Nur wenn er zustimmt: \`${retryCommand} --confirm\`.`,
			EXIT.usage,
			data,
		);
	}
}
