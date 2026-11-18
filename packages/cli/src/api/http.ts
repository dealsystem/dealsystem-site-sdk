// Dünne HTTP-Schicht für `/api/v1/websites/…`. Normalisiert Antworten defensiv, damit kleine Abweichungen
// im Core (zusätzliche Felder, fehlende optionale Felder) die CLI nicht brechen.

import { ApiError, CliError, EXIT } from './errors.js';
import type {
	CheckFinding,
	DeployApi,
	PreparedUpload,
	PreparedImageUpload,
	RawResponse,
	TestRunInput,
	ReleaseResult,
	SourceDownload,
	Version,
	VersionCheckResult,
	VersionSummary,
	Website,
	WebsiteDetails,
	WebsiteDomain,
	WebsiteSlot,
	WhoAmI,
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
	source_not_uploaded:
		'Diese Version wurde nie vollständig hochgeladen. Wähle eine andere mit `--version <nummer>` (Liste: `npx dealsystem status --site <id>`).',
	source_expired:
		'Der Quellcode dieser Version ist nach der Aufbewahrungsfrist gelöscht. Nimm die Live-Version (ohne `--version`) oder eine neuere.',
	source_unavailable:
		'Der Quellcode dieser Version ist nicht mehr vorhanden. Nimm die Live-Version (ohne `--version`) oder eine neuere.',
	rate_limited: 'Zu viele Abrufe in kurzer Zeit. Warte eine Minute und versuche es erneut.',
	slot_not_found:
		'Diesen Bild-Platz kennt DealSystem nicht. Die Schlüssel stehen im Code als <MediaImage key="…">; ein neuer Platz ist erst nach `npx dealsystem deploy` bekannt.',
	type_changed: 'Dieser Platz ist kein Bild-Platz. Nimm den Schlüssel eines <MediaImage key="…">.',
	missing_alt: 'Gib mit `--alt "…"` an, was auf dem Bild zu sehen ist.',
	unsupported_type: 'Erlaubt sind JPEG, PNG und WebP.',
	too_many_pixels: 'Das Bild hat zu viele Pixel. Verkleinere es und versuche es erneut.',
	storage_unavailable: 'Bilder lassen sich gerade nicht speichern. Versuche es später erneut.',
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

function normalizeSlot(raw: unknown): WebsiteSlot {
	const o = obj(raw);
	const value = obj(o.value);
	return {
		key: str(o.key) ?? '',
		type: str(o.type) ?? 'text',
		label: str(o.label) ?? str(o.key) ?? '',
		inUse: o.inUse !== false,
		overridden: o.overridden === true,
		mediaId: str(value.mediaId),
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

	/** Gilt die Anmeldung? Prüft mit einem Pfad, den jeder Core kennt. */
	async tokenWorks(): Promise<boolean> {
		try {
			await this.call('GET', '/websites');
			return true;
		} catch {
			return false;
		}
	}

	async whoami(): Promise<WhoAmI | null> {
		let raw: unknown;
		try {
			raw = await this.call('GET', '/meta/whoami');
		} catch (e) {
			// Älterer Core ohne den Endpunkt: fail-open, der Aufrufer zeigt den Rest.
			if (e instanceof ApiError && [404, 405, 501].includes(e.status)) return null;
			// Ein Core ohne den Pfad antwortet mit dem CLI-Token 401 („Invalid API key format“) statt 404. Gilt die
			// Anmeldung sonst, fehlt nur der Endpunkt.
			if (e instanceof ApiError && e.status === 401 && (await this.tokenWorks())) return null;
			throw e;
		}
		const o = obj(raw);
		const ws = obj(o.workspace);
		const wsId = str(ws.id);
		if (!wsId) return null;
		const u = obj(o.user);
		const userId = str(u.id);
		return {
			workspace: { id: wsId, name: str(ws.name) ?? '' },
			user: userId ? { id: userId, name: str(u.name), email: str(u.email) } : null,
		};
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

	async listSlots(id: string): Promise<WebsiteSlot[]> {
		const o = obj(await this.call('GET', `/websites/${encodeURIComponent(id)}/slots`));
		return arr(o.slots).map(normalizeSlot);
	}

	async prepareImageUpload(
		id: string,
		input: { slotKey: string; bytes: number },
	): Promise<PreparedImageUpload> {
		const o = obj(await this.call('POST', `/websites/${encodeURIComponent(id)}/media`, input));
		const upload = obj(o.upload);
		const uploadId = str(o.uploadId);
		const url = str(upload.url);
		if (!uploadId || !url) {
			throw new CliError(
				'bad_response',
				'Die API hat keine Upload-Adresse geliefert.',
				'Versuche es erneut.',
				EXIT.api,
			);
		}
		return {
			uploadId,
			url,
			method: str(upload.method) ?? 'PUT',
			headers: Object.fromEntries(
				Object.entries(obj(upload.headers)).filter((e): e is [string, string] => typeof e[1] === 'string'),
			),
			expiresAt: str(upload.expiresAt),
		};
	}

	async uploadImage(upload: PreparedImageUpload, body: Uint8Array): Promise<void> {
		let res: Response;
		try {
			// Signierte URL wie beim Quellpaket: kein Authorization-Header, `Content-Length` setzt fetch selbst.
			const headers = Object.fromEntries(
				Object.entries(upload.headers).filter(([k]) => !['content-length', 'host'].includes(k.toLowerCase())),
			);
			res = await this.fetchImpl(upload.url, { method: upload.method, headers, body });
		} catch (e) {
			throw new CliError(
				'upload_failed',
				`Hochladen des Fotos fehlgeschlagen (${(e as Error).message}).`,
				'Führe den Befehl erneut aus.',
				EXIT.api,
			);
		}
		if (!res.ok) {
			throw new CliError(
				'upload_failed',
				`Hochladen des Fotos fehlgeschlagen (Status ${res.status}).`,
				'Führe den Befehl erneut aus; die Upload-Adresse gilt nur 15 Minuten.',
				EXIT.api,
			);
		}
	}

	async completeImageUpload(
		id: string,
		uploadId: string,
		input: { slotKey: string; alt: string },
	): Promise<WebsiteSlot | null> {
		const o = obj(
			await this.call(
				'POST',
				`/websites/${encodeURIComponent(id)}/media/${encodeURIComponent(uploadId)}/complete`,
				input,
			),
		);
		return o.slot ? normalizeSlot(o.slot) : null;
	}

	async getSourceDownload(id: string, versionId: string): Promise<SourceDownload> {
		const o = obj(
			await this.call(
				'GET',
				`/websites/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/source`,
			),
		);
		const download = obj(o.download);
		const url = str(download.url);
		const sha256 = str(o.sha256);
		const bytes = num(o.bytes);
		if (!url || !sha256 || !/^[0-9a-f]{64}$/.test(sha256) || bytes === null) {
			throw new CliError(
				'bad_response',
				'Die API hat keine gültige Download-Adresse geliefert.',
				'Versuche es erneut.',
				EXIT.api,
			);
		}
		return {
			versionId: str(o.versionId) ?? versionId,
			versionNumber: num(o.versionNumber) ?? 0,
			trigger: str(o.trigger) ?? 'upload',
			codeVersionId: str(o.codeVersionId) ?? versionId,
			codeVersionNumber: num(o.codeVersionNumber),
			sha256,
			bytes,
			url,
			expiresAt: str(download.expiresAt),
		};
	}

	async downloadSource(source: SourceDownload, maxBytes: number): Promise<Uint8Array> {
		// Nur https (http allein für localhost wie bei der API-Adresse): die Antwort wird entpackt.
		let target: URL;
		try {
			target = new URL(source.url);
		} catch {
			target = new URL('invalid:');
		}
		const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
		if (target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback)) {
			throw new CliError(
				'bad_response',
				'Die API hat eine unsichere Download-Adresse geliefert.',
				'Versuche es erneut. Bleibt der Fehler, melde ihn an DealSystem.',
				EXIT.api,
			);
		}
		const tooLarge = (): CliError =>
			new CliError(
				'download_too_large',
				`Das Quellpaket ist größer als erwartet (mehr als ${maxBytes} Bytes).`,
				'Nichts wurde geschrieben. Versuche es erneut; bleibt der Fehler, melde ihn an DealSystem.',
				EXIT.api,
			);
		let res: Response;
		try {
			// Signierte Adresse: kein Authorization-Header (der Token gehört nicht zum Speicher).
			res = await this.fetchImpl(target.toString(), { method: 'GET', redirect: 'error' });
		} catch (e) {
			throw new CliError(
				'download_failed',
				`Herunterladen fehlgeschlagen (${(e as Error).message}).`,
				'Führe `npx dealsystem pull` erneut aus.',
				EXIT.api,
			);
		}
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			throw new CliError(
				'download_failed',
				`Herunterladen fehlgeschlagen (Status ${res.status}).`,
				res.status === 403
					? 'Die Download-Adresse ist abgelaufen. Führe `npx dealsystem pull` erneut aus.'
					: 'Führe `npx dealsystem pull` erneut aus.',
				EXIT.api,
			);
		}
		const announced = Number(res.headers.get('content-length') ?? NaN);
		if (Number.isFinite(announced) && announced > maxBytes) {
			await res.body?.cancel().catch(() => {});
			throw tooLarge();
		}
		const chunks: Uint8Array[] = [];
		let total = 0;
		const reader = res.body?.getReader();
		if (reader) {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel().catch(() => {});
					throw tooLarge();
				}
				chunks.push(value);
			}
		}
		const out = new Uint8Array(total);
		let at = 0;
		for (const c of chunks) {
			out.set(c, at);
			at += c.byteLength;
		}
		return out;
	}

	async devBooking(
		id: string,
		key: string,
		eventType: string | null,
		label: string | null = null,
	): Promise<RawResponse> {
		// `label` gilt im Core nur zusammen mit `eventType` (vor dem ersten Build).
		const params = new URLSearchParams();
		if (eventType) {
			params.set('eventType', eventType);
			const oneLine = label?.replace(/\s+/g, ' ').trim().slice(0, 120);
			if (oneLine) params.set('label', oneLine);
		}
		const query = params.size ? `?${params.toString()}` : '';
		const { status, json } = await this.request(
			'GET',
			`/websites/${encodeURIComponent(id)}/dev/booking/${encodeURIComponent(key)}${query}`,
		);
		return { status, body: json };
	}

	async devBookingSlots(
		id: string,
		key: string,
		range: { from: string; to: string; tz?: string },
		eventType: string | null,
	): Promise<RawResponse> {
		const query = new URLSearchParams({ from: range.from, to: range.to });
		if (range.tz) query.set('tz', range.tz);
		if (eventType) query.set('eventType', eventType);
		const { status, json } = await this.request(
			'GET',
			`/websites/${encodeURIComponent(id)}/dev/booking/${encodeURIComponent(key)}/slots?${query.toString()}`,
		);
		return { status, body: json };
	}

	async devBookingQualify(
		id: string,
		key: string,
		body: unknown,
		eventType: string | null,
	): Promise<RawResponse> {
		const query = eventType ? `?eventType=${encodeURIComponent(eventType)}` : '';
		const { status, json } = await this.request(
			'POST',
			`/websites/${encodeURIComponent(id)}/dev/booking/${encodeURIComponent(key)}/qualify${query}`,
			body,
		);
		return { status, body: json };
	}

	async createTestRun(id: string, input: TestRunInput): Promise<RawResponse> {
		const { status, json } = await this.request(
			'POST',
			`/websites/${encodeURIComponent(id)}/test-runs`,
			input,
		);
		return { status, body: json };
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
