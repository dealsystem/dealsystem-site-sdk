// Dünne HTTP-Schicht für `/api/v1/websites/…`. Normalisiert Antworten defensiv, damit kleine Abweichungen
// im Core (zusätzliche Felder, fehlende optionale Felder) die CLI nicht brechen.

import { ApiError, CliError, EXIT } from './errors.js';
import type {
	CheckFinding,
	DeployApi,
	PreparedUpload,
	ReleaseResult,
	Version,
	VersionCheckResult,
	VersionSummary,
	Website,
	WebsiteDetails,
	WebsiteDomain,
} from './types.js';

export interface TokenProvider {
	getToken(): Promise<string>;
	/** Erneuert den Token nach einer 401. `null`, wenn das nicht geht (z. B. API-Schlüssel aus der Umgebung). */
	refresh(): Promise<string | null>;
}

export type FetchLike = typeof fetch;

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseJson(text: string): unknown {
	if (!text) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

/** Was zu tun ist, wenn Rechtstexte oder Firmendaten fehlen (Server-Fehler und Vorprüfung in `publish`). */
export const LEGAL_PROFILE_FIX =
	'Bitte den Inhaber, im CRM unter „Eigene Website → Rechtliches“ die fehlenden Angaben einzutragen: Impressum, Datenschutzerklärung, Firmenname und E-Mail-Adresse. Diese Texte schreibt er selbst. Danach `npx dealsystem sync`, neu hochladen, die neue Vorschau zeigen und neu fragen.';

/** Korrektur-Anweisungen für bekannte Fehlercodes der API. */
const FIXES: Record<string, string> = {
	legal_profile_incomplete: LEGAL_PROFILE_FIX,
	plan_limit_reached:
		'Das Limit des Abos ist erreicht. Bitte den Inhaber, das Abo zu erweitern, oder lösche alte Seiten.',
	app_disabled:
		'Die App „Eigene Website“ ist im Workspace nicht freigeschaltet. Bitte den Inhaber, sie freizuschalten.',
	forbidden: 'Dir fehlt das Recht dafür. Bitte einen Admin des Workspaces, es dir zu geben.',
	plan_limit:
		'Das Limit des Abos ist erreicht. Bitte den Inhaber, das Abo zu erweitern, oder lösche alte Versionen bzw. Seiten.',
	user_bound_key_required:
		'Live schalten braucht einen Menschen: melde dich mit `npx dealsystem login` an statt mit einem API-Schlüssel ohne Nutzer.',
	live_changed:
		'Jemand hat gerade eine andere Version live geschaltet. Prüfe mit `npx dealsystem status` und versuche es erneut.',
	upload_missing: 'Das Archiv ist nicht angekommen. Führe `npx dealsystem deploy` erneut aus.',
	upload_size_mismatch: 'Das Archiv kam unvollständig an. Führe `npx dealsystem deploy` erneut aus.',
	insufficient_scope: 'Die Anmeldung reicht dafür nicht. Führe `npx dealsystem login` erneut aus.',
	not_found: 'Prüfe die `siteId` in dealsystem.config.ts oder führe `npx dealsystem init` aus.',
	version_not_ready:
		'Die Version ist noch nicht fertig gebaut. Warte mit `npx dealsystem status`, bis sie `ready` ist.',
	invalid_token: 'Führe `npx dealsystem login` aus.',
};

function fixFor(status: number, code: string): string {
	if (FIXES[code]) return FIXES[code];
	if (status === 401) return FIXES.invalid_token!;
	if (status === 403) return FIXES.forbidden!;
	if (status === 404) return FIXES.not_found!;
	if (status === 429) return 'Zu viele Anfragen. Warte eine Minute und versuche es erneut.';
	if (status >= 500) return 'Der DealSystem-Server hat ein Problem. Versuche es in ein paar Minuten erneut.';
	return 'Prüfe die Eingaben und versuche es erneut.';
}

export function normalizeWebsite(raw: unknown): Website {
	const o = obj(raw);
	return {
		id: str(o.id) ?? '',
		name: str(o.name) ?? '',
		slug: str(o.slug) ?? '',
		status: str(o.status) ?? 'active',
		liveVersionId: str(o.liveVersionId),
		defaultHost: str(o.defaultHost),
		primaryHost: str(o.primaryHost),
	};
}

function normalizeFinding(raw: unknown): CheckFinding | null {
	const o = obj(raw);
	const rule = str(o.rule);
	const message = str(o.message);
	if (!rule || !message) return null;
	return { rule, file: str(o.file), line: num(o.line), message, fix: str(o.fix) };
}

function normalizeCheck(raw: unknown): VersionCheckResult | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = obj(raw);
	const errors = arr(o.errors)
		.map(normalizeFinding)
		.filter((f): f is CheckFinding => f !== null);
	return {
		passed: errors.length === 0,
		ruleSetVersion: str(o.ruleSetVersion) ?? '',
		errors,
		warnings: arr(o.warnings)
			.map(normalizeFinding)
			.filter((f): f is CheckFinding => f !== null),
	};
}

export function normalizeVersionSummary(raw: unknown): VersionSummary {
	const o = obj(raw);
	return {
		id: str(o.id) ?? str(o.versionId) ?? '',
		number: num(o.number) ?? 0,
		status: str(o.status) ?? 'unknown',
		trigger: str(o.trigger) ?? 'upload',
		message: str(o.message),
		createdAt: str(o.createdAt),
		previewUrl: str(o.previewUrl),
	};
}

export function normalizeVersion(raw: unknown): Version {
	const o = obj(raw);
	return {
		...normalizeVersionSummary(raw),
		checkResult: normalizeCheck(o.checkResult),
		logExcerpt: str(o.logExcerpt) ?? str(o.log),
	};
}

function normalizeDomain(raw: unknown): WebsiteDomain {
	const o = obj(raw);
	return {
		host: str(o.host) ?? '',
		kind: str(o.kind) ?? 'primary',
		active: o.active === true || str(o.activatedAt) !== null,
	};
}

export class HttpDeployApi implements DeployApi {
	private readonly base: string;

	constructor(
		apiUrl: string,
		private readonly tokens: TokenProvider,
		private readonly fetchImpl: FetchLike = fetch,
	) {
		this.base = apiUrl.replace(/\/+$/, '');
	}

	private async request(
		method: string,
		path: string,
		body?: unknown,
	): Promise<{ status: number; json: unknown }> {
		const send = async (token: string): Promise<Response> => {
			try {
				return await this.fetchImpl(`${this.base}/api/v1${path}`, {
					method,
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/json',
						...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
					},
					...(body !== undefined ? { body: JSON.stringify(body) } : {}),
				});
			} catch (e) {
				throw new CliError(
					'network_error',
					`${this.base} ist nicht erreichbar (${(e as Error).message}).`,
					'Prüfe die Internetverbindung und versuche es erneut.',
					EXIT.api,
				);
			}
		};
		let res = await send(await this.tokens.getToken());
		if (res.status === 401) {
			const fresh = await this.tokens.refresh();
			if (fresh) res = await send(fresh);
		}
		return { status: res.status, json: parseJson(await res.text()) };
	}

	private async call(method: string, path: string, body?: unknown): Promise<unknown> {
		const { status, json } = await this.request(method, path, body);
		if (status >= 200 && status < 300) return obj(json).data ?? json;
		const o = obj(json);
		const code = str(o.code) ?? str(o.error) ?? `http_${status}`;
		let message = str(o.message) ?? `Die API antwortet mit Status ${status}.`;
		const versionStatus = str(o.versionStatus);
		if (versionStatus) message += ` (Zustand der Version: ${versionStatus})`;
		const fields = arr(o.fields).filter((f): f is string => typeof f === 'string');
		if (fields.length) message += ` (fehlt: ${fields.join(', ')})`;
		let fix = fixFor(status, code);
		if (status === 403 && /\/(publish|rollback)$/.test(path) && !FIXES[code]) {
			fix =
				'Live schalten und Rollback brauchen das Recht „Website veröffentlichen“. Bitte einen Admin des Workspaces darum.';
		}
		throw new ApiError(status, code, message, fix);
	}

	async listWebsites(): Promise<Website[]> {
		return arr(await this.call('GET', '/websites')).map(normalizeWebsite);
	}

	async createWebsite(input: { name: string; slug: string }): Promise<Website> {
		return normalizeWebsite(await this.call('POST', '/websites', input));
	}

	async getWebsite(id: string): Promise<WebsiteDetails> {
		const raw = await this.call('GET', `/websites/${encodeURIComponent(id)}`);
		const o = obj(raw);
		return {
			...normalizeWebsite(raw),
			domains: arr(o.domains).map(normalizeDomain),
			liveVersion: o.liveVersion ? normalizeVersionSummary(o.liveVersion) : null,
			legalProfileMissing: Array.isArray(o.legalProfileMissing)
				? o.legalProfileMissing.filter((f): f is string => typeof f === 'string')
				: null,
		};
	}

	async getContent(id: string): Promise<unknown> {
		return this.call('GET', `/websites/${encodeURIComponent(id)}/content`);
	}

	async listVersions(id: string, limit = 10): Promise<VersionSummary[]> {
		return arr(await this.call('GET', `/websites/${encodeURIComponent(id)}/versions?limit=${limit}`)).map(
			normalizeVersionSummary,
		);
	}

	async prepareUpload(
		id: string,
		input: { sha256: string; bytes: number; message?: string },
	): Promise<PreparedUpload> {
		const o = obj(await this.call('POST', `/websites/${encodeURIComponent(id)}/versions`, input));
		const versionId = str(o.versionId);
		const uploadUrl = str(o.uploadUrl);
		if (!versionId || !uploadUrl) {
			throw new CliError(
				'bad_response',
				'Die API hat keine Upload-Adresse geliefert.',
				'Versuche es erneut.',
				EXIT.api,
			);
		}
		const headers = Object.fromEntries(
			Object.entries(obj(o.uploadHeaders)).filter((e): e is [string, string] => typeof e[1] === 'string'),
		);
		return {
			versionId,
			uploadUrl,
			uploadMethod: str(o.uploadMethod) ?? 'PUT',
			expiresAt: str(o.expiresAt),
			uploadHeaders: headers,
		};
	}

	async uploadSource(upload: PreparedUpload, body: Uint8Array): Promise<void> {
		let res: Response;
		try {
			// Signierte URL: kein Authorization-Header, genau die vorgegebenen Header. `Content-Length` ist
			// mitsigniert; fetch setzt ihn selbst aus dem Body (gleicher Wert), doppelt setzen geht nicht.
			const headers = Object.fromEntries(
				Object.entries(upload.uploadHeaders).filter(
					([k]) => !['content-length', 'host'].includes(k.toLowerCase()),
				),
			);
			const expected = upload.uploadHeaders['Content-Length'] ?? upload.uploadHeaders['content-length'];
			if (expected !== undefined && Number(expected) !== body.byteLength) {
				throw new Error(`Größe passt nicht zur Ankündigung (${body.byteLength} statt ${expected} Bytes)`);
			}
			res = await this.fetchImpl(upload.uploadUrl, { method: upload.uploadMethod, headers, body });
		} catch (e) {
			throw new CliError(
				'upload_failed',
				`Hochladen fehlgeschlagen (${(e as Error).message}).`,
				'Führe `npx dealsystem deploy` erneut aus.',
				EXIT.api,
			);
		}
		if (!res.ok) {
			throw new CliError(
				'upload_failed',
				`Hochladen fehlgeschlagen (Status ${res.status}).`,
				res.status === 403
					? 'Die Upload-Adresse ist abgelaufen. Führe `npx dealsystem deploy` erneut aus.'
					: 'Führe `npx dealsystem deploy` erneut aus.',
				EXIT.api,
			);
		}
	}

	async completeUpload(id: string, versionId: string): Promise<Version> {
		return normalizeVersion(
			await this.call(
				'POST',
				`/websites/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/complete`,
				{},
			),
		);
	}

	async getVersion(id: string, versionId: string): Promise<Version> {
		return normalizeVersion(
			await this.call('GET', `/websites/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
		);
	}

	/** Antwort `{ site, release }`; `release` ist `null`, wenn die Version schon live war. */
	private release(raw: unknown, fallbackVersion: string): ReleaseResult {
		const o = obj(raw);
		const site = normalizeWebsite(o.site);
		return {
			liveVersionId: site.liveVersionId ?? fallbackVersion,
			changed: o.release !== null,
			url: site.primaryHost
				? `https://${site.primaryHost}`
				: site.defaultHost
					? `https://${site.defaultHost}`
					: null,
		};
	}

	async publish(id: string, versionId: string): Promise<ReleaseResult> {
		const raw = await this.call('POST', `/websites/${encodeURIComponent(id)}/publish`, {
			versionId,
			confirm: true,
		});
		return this.release(raw, versionId);
	}

	async rollback(id: string, versionId?: string): Promise<ReleaseResult> {
		const raw = await this.call('POST', `/websites/${encodeURIComponent(id)}/rollback`, {
			...(versionId ? { versionId } : {}),
			confirm: true,
		});
		return this.release(raw, versionId ?? '');
	}

	async devLead(id: string, body: unknown): Promise<{ status: number; body: unknown }> {
		const { status, json } = await this.request(
			'POST',
			`/websites/${encodeURIComponent(id)}/dev/leads`,
			body,
		);
		return { status, body: json };
	}
}
