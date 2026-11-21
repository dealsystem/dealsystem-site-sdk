// `dealsystem dev` — startet den Vite-Dev-Server des Projekts. Die Site-API für den Schlüssel `dev` beantwortet
// das Vite-Plugin `dealsystem(site)` selbst (Sammlungen aus `.dealsystem/content.json`). Die CLI setzt davor nur
// eine Middleware: Probe-Einsendungen (`…/leads`) gehen an `/api/v1/websites/{id}/dev/leads` (im Core immer
// `dryRun`), und `/_ds/media/*` wird an die Seite im Netz durchgereicht, damit CMS-Bilder lokal erscheinen.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ApiError, CliError, EXIT } from '../api/errors.js';
import type { FetchLike } from '../api/http.js';
import type { DeployApi, RawResponse, TestRunInput } from '../api/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { lookupWorkspaceQuietly } from '../cli/workspace.js';
import { readSiteConfig, SITE_CONFIG_FILE } from '../project/siteConfig.js';
import { canonicalJson, CONTENT_FILE } from '../project/snapshot.js';

const MAX_BODY_BYTES = 64 * 1024;
const LEADS_PATH = /^\/api\/site\/v1\/s\/[^/]+\/leads\/?$/;
/** `GET …/booking/{key}` und `…/booking/{key}/slots`. */
const BOOKING_PATH = /^\/api\/site\/v1\/s\/[^/]+\/booking\/([^/]+)(\/slots)?\/?$/;
const BOOKINGS_PATH = /^\/api\/site\/v1\/s\/[^/]+\/booking\/([^/]+)\/bookings\/?$/;
const QUALIFY_PATH = /^\/api\/site\/v1\/s\/[^/]+\/booking\/([^/]+)\/qualify\/?$/;
const MEDIA_PREFIX = '/_ds/media/';

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export interface DevMiddlewareOptions {
	api: DeployApi;
	siteId: string;
	/** Herkunft der Medien, z. B. `https://kunde.de`. `null`: Medien lokal nicht verfügbar. */
	mediaOrigin: string | null;
	fetch: FetchLike;
	log?: (message: string) => void;
	/**
	 * Echte Daten: Terminart und freie Zeiten aus dem CRM, Einsendungen und Buchungen als Testlauf. `null`: das
	 * Vite-Plugin des SDK antwortet mit Beispieldaten, nichts geht ans CRM.
	 */
	live: {
		eventTypes: Record<string, string | null>;
		/** `booking.<key>.label` aus der Konfiguration (geht vor dem ersten Build mit `eventType` an den Core). */
		labels?: Record<string, string | null>;
		/** Formular aus der Konfiguration für den Testlauf vor dem ersten Hochladen; `null`, wenn unbekannt. */
		funnel?: (key: string) => { label?: string; fields: unknown[] } | null;
		/** Fester Link auf die Testläufe im CRM, wenn der Workspace bekannt ist. */
		testRunsUrl?: string | null;
		/** Testmail: die echte Bestätigung an die Person hinter der Anmeldung (`--testmail`). */
		testMail?: boolean;
	} | null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(body));
}

function apiError(res: ServerResponse, status: number, code: string, message: string): void {
	sendJson(res, status, { error: code, message, status, code });
}

async function readBody(req: IncomingMessage): Promise<string | null> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of req as AsyncIterable<Buffer>) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) return null;
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** Body der Seite ohne Captcha (Testläufe rechnen, als wäre es gelöst). Die Bot-Falle `website` bleibt. */
function testRunPayload(body: Json): Json {
	const rest: Json = { ...body };
	delete rest.captcha;
	return rest;
}

/** HTTP-Status, mit dem die Site-API einen Fehlercode meldet; so zeigt die Seite im Testlauf dasselbe wie live. */
const REJECTION_STATUS: Record<string, number> = {
	validation_error: 422,
	not_qualified: 422,
	slot_taken: 409,
	funnel_not_found: 404,
	booking_unavailable: 404,
	rate_limited: 429,
};

/** `outcome: "rejected"` eines Testlaufs als Fehlerantwort der Site-API. */
export function rejectionResponse(rejection: Json): { status: number; body: Json } {
	const code = typeof rejection.code === 'string' ? rejection.code : 'rejected';
	const status = REJECTION_STATUS[code] ?? 422;
	return {
		status,
		body: {
			error: code,
			message: typeof rejection.message === 'string' ? rejection.message : 'Abgelehnt',
			status,
			code,
			...(Array.isArray(rejection.details) ? { details: rejection.details } : {}),
		},
	};
}

/**
 * Kennt der Server den Endpunkt nicht (älterer Core)? 404 ohne eigenen Fehlercode bzw. mit dem allgemeinen
 * `not_found`. Eigene Codes wie `booking_unavailable` sind echte Antworten und gehen an die Seite.
 */
function endpointMissing(status: number, body: unknown): boolean {
	if (status === 405 || status === 501) return true;
	if (status !== 404) return false;
	const code = isRecord(body) ? body.code : undefined;
	return code === undefined || code === 'not_found' || code === 'http_404';
}

const text = (v: unknown): string | null =>
	typeof v === 'string' && v.trim()
		? v
				.replace(/[\r\n\t]+/g, ' ')
				.trim()
				.slice(0, 300)
		: null;
const named = (v: unknown): string | null => (isRecord(v) ? text(v.name) : null);

/**
 * Kann der Core keine Testmail schicken, warum (Text für die Konsole), sonst `null`. Nur zwei Fälle: ein älterer
 * Core kennt `sendMail` nicht (422, unbekannter Schlüssel genau dieses Namens), oder hinter der Anmeldung steht
 * keine Person (400 `test_mail_no_user`). Jede andere 422 ist ein echter Fehler und bleibt sichtbar.
 */
export function testMailUnavailable(r: RawResponse): string | null {
	const body = isRecord(r.body) ? r.body : {};
	if (r.status === 400 && body.code === 'test_mail_no_user')
		return 'Hinter dieser Anmeldung steht keine Person im Workspace (z. B. ein API-Schlüssel ohne Nutzer).';
	if (r.status !== 422 || !Array.isArray(body.details)) return null;
	const unknownKey = body.details.some(
		(d) => isRecord(d) && (d.path === '' || d.path === 'sendMail') && /\bsendMail\b/.test(String(d.message)),
	);
	return unknownKey ? 'Dieser DealSystem-Server kennt die Testmail noch nicht.' : null;
}

/** Zusammenfassung eines Testlaufs für die Konsole, aus `data` von `POST …/test-runs`. */
export function testRunSummary(body: unknown, testRunsUrl: string | null = null): string {
	const run = isRecord(body) && isRecord(body.data) ? body.data : {};
	const lines: string[] = [];
	const rejection = isRecord(run.rejection) ? run.rejection : null;
	if (run.outcome === 'rejected' && rejection?.code === 'honeypot')
		lines.push(
			'Bot-Falle ausgelöst (Feld „website“ gefüllt): Die Seite meldet Erfolg, gespeichert wäre nichts worden.',
		);
	else if (run.outcome === 'rejected')
		lines.push(
			`Abgelehnt (${text(rejection?.code) ?? 'unbekannt'}): ${text(rejection?.message) ?? ''}`.trimEnd(),
		);
	const lead = isRecord(run.lead) ? run.lead : null;
	const booking = isRecord(run.booking) ? run.booking : null;
	const contact = isRecord(lead?.contact)
		? lead.contact
		: isRecord(booking?.contact)
			? booking.contact
			: null;
	if (contact) lines.push(`Kontakt: ${contact.match === 'existing' ? 'schon vorhanden' : 'neu'}`);
	if (lead) {
		const funnel = isRecord(lead.funnel) ? lead.funnel : null;
		if (funnel?.source === 'config')
			lines.push('Was unter `crm` in dealsystem.config.ts steht, gilt erst nach dem Hochladen.');
		const deal = isRecord(lead.deal) ? lead.deal : null;
		if (deal)
			lines.push(
				`Deal: ${text(deal.name) ?? '–'} in ${named(deal.pipeline) ?? '–'} → ${named(deal.stage) ?? '–'}`,
			);
		const tags = Array.isArray(lead.tags) ? lead.tags.map(named).filter(Boolean) : [];
		if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);
		if (named(lead.contactList)) lines.push(`Liste: ${named(lead.contactList)}`);
	}
	if (booking) {
		const et = isRecord(booking.eventType) ? booking.eventType : null;
		lines.push(
			`Terminart: ${text(et?.title) ?? text(et?.slug) ?? '–'}${booking.source === 'event_type' ? ' (aus eventType in dealsystem.config.ts)' : ''}`,
		);
		if (booking.slotFree === false) lines.push('Die Zeit wäre nicht mehr frei gewesen.');
		const q = isRecord(booking.qualification) ? booking.qualification : null;
		if (q && q.qualified === false) {
			lines.push(`Nicht passend: ${text(q.headline) ?? ''} ${text(q.message) ?? ''}`.trim());
			if (text(q.redirectUrl)) lines.push(`Weiterleitung an ${text(q.redirectUrl)}`);
		}
	}
	const mail = isRecord(run.mail) ? run.mail : null;
	if (mail && text(mail.sentTo))
		lines.push(
			`Testmail an ${text(mail.sentTo)} verschickt${mail.via === 'mailbox' ? ' (über dein Postfach)' : mail.via === 'dealsystem' ? ' (über DealSystem)' : ''}`,
		);
	else if (mail)
		lines.push(`Keine Testmail: ${text(mail.message) ?? text(mail.notSent) ?? 'unbekannter Grund'}`);
	const confirmation = isRecord(lead?.confirmation)
		? lead.confirmation
		: isRecord(booking?.confirmation)
			? booking.confirmation
			: null;
	if (confirmation) {
		lines.push(
			confirmation.wouldSend === true
				? `Bestätigungsmail an ${text(confirmation.to) ?? 'den Besucher'}`
				: `Keine Bestätigungsmail${text(confirmation.blocker) ? ` (${text(confirmation.blocker)})` : ''}`,
		);
		if (text(confirmation.note)) lines.push(text(confirmation.note)!);
	}
	return [
		`[dealsystem] Testlauf: nichts angelegt${mail && text(mail.sentTo) ? ', nur die Testmail an dich verschickt' : ', keine Mail verschickt'}. ${text(run.summary) ?? ''}`.trimEnd(),
		...lines.map((l) => `  - ${l}`),
		testRunsUrl
			? `  So wäre es angekommen: ${testRunsUrl}`
			: '  So wäre es angekommen: im CRM unter Eigene Website → Formulare, Abschnitt Testläufe',
	].join('\n');
}

/** Middleware vor dem Vite-Plugin des SDK. Alles andere geht unverändert weiter (`next()`). */
export function createDevMiddleware(options: DevMiddlewareOptions): Middleware {
	const log = options.log ?? (() => {});
	const { api, siteId, live } = options;
	let testMail = live?.testMail === true;
	const warned = new Set<string>();
	/** Echte Daten nicht zu haben: einmal sagen, dann Beispieldaten des SDK. */
	const fallBack = (what: string, reason: string, next: () => void): void => {
		if (!warned.has(what)) {
			warned.add(what);
			log(`[dealsystem] ${what}: ${reason} Es laufen Beispieldaten, nichts geht ans CRM.`);
		}
		next();
	};
	/** Fehler der echten Terminbuchung einmal je Schlüssel und Code erklären (falscher Slug, Buchung aus). */
	const warnBooking = (key: string, eventType: string | null, body: unknown): void => {
		const code = isRecord(body) && typeof body.code === 'string' ? body.code : 'error';
		if (warned.has(`booking:${key}:${code}`)) return;
		warned.add(`booking:${key}:${code}`);
		const message = isRecord(body) && typeof body.message === 'string' ? ` (${body.message})` : '';
		const hint =
			code === 'event_type_not_found'
				? `Die Terminart \`${eventType ?? ''}\` aus booking.${key}.eventType gibt es im Workspace nicht oder mehrfach. Den richtigen Slug nennt list_website_bookings.`
				: code === 'booking_not_found'
					? `Die Seite kennt \`${key}\` noch nicht. Trag unter booking.${key} in dealsystem.config.ts einen eventType ein (Slug aus list_website_bookings) oder lade einmal hoch.`
					: `Die Terminbuchung \`${key}\` nimmt gerade nichts an${message}.`;
		log(`[dealsystem] ${hint}`);
	};
	/**
	 * Fehlt der Endpunkt im Core? 404/405/501 wie gewohnt; ein älterer Core meldet unbekannte Pfade mit dem
	 * CLI-Token aber als 401. Dann einmal prüfen, ob die Anmeldung sonst gilt (Ergebnis gemerkt).
	 */
	let unknownPaths401: Promise<boolean> | null = null;
	const missing = async (r: { status: number; body: unknown }): Promise<boolean> => {
		if (endpointMissing(r.status, r.body)) return true;
		if (r.status !== 401) return false;
		unknownPaths401 ??= api.tokenWorks().then((works) => {
			if (!works) {
				unknownPaths401 = null;
				log(
					'[dealsystem] Die Anmeldung ist abgelaufen: `npx dealsystem login`, dann `npm run dev` neu starten.',
				);
			}
			return works;
		});
		return unknownPaths401;
	};
	const relay = (res: ServerResponse, r: { status: number; body: unknown }): void =>
		sendJson(res, r.status, r.body ?? { error: 'empty', message: 'Leere Antwort', status: r.status });

	return (req, res, next) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const path = url.pathname;
		const booking = BOOKING_PATH.exec(path);

		if (live && booking && req.method === 'GET') {
			const key = decodeURIComponent(booking[1]!);
			const eventType = live.eventTypes[key] ?? null;
			void (async () => {
				const r =
					booking[2] === '/slots'
						? await api.devBookingSlots(
								siteId,
								key,
								{
									from: url.searchParams.get('from') ?? '',
									to: url.searchParams.get('to') ?? '',
									...(url.searchParams.get('tz') ? { tz: url.searchParams.get('tz')! } : {}),
								},
								eventType,
							)
						: await api.devBooking(siteId, key, eventType, live.labels?.[key] ?? null);
				if (await missing(r))
					return fallBack(
						'Terminbuchung',
						'Dieser DealSystem-Server liefert noch keine echten Termine.',
						next,
					);
				if (r.status >= 400) warnBooking(key, eventType, r.body);
				relay(res, r);
			})().catch((e: unknown) =>
				fallBack('Terminbuchung', `Echte Termine nicht abrufbar (${(e as Error).message}).`, next),
			);
			return;
		}

		const qualify = req.method === 'POST' ? QUALIFY_PATH.exec(path) : null;
		if (live && qualify) {
			const key = decodeURIComponent(qualify[1]!);
			void (async () => {
				const raw = await readBody(req);
				let body: unknown;
				try {
					body = raw === null ? undefined : (JSON.parse(raw || '{}') as unknown);
				} catch {
					body = undefined;
				}
				if (!isRecord(body)) return apiError(res, 400, 'invalid_body', 'Ungültiger JSON-Body');
				const r = await api.devBookingQualify(siteId, key, body, live.eventTypes[key] ?? null);
				// Älterer Core: jede Antwort passt (wie die Beispieldaten).
				if (await missing(r)) return sendJson(res, 200, { data: { qualified: true } });
				relay(res, r);
			})().catch((e: unknown) => apiError(res, 502, 'dev_proxy_error', (e as Error).message));
			return;
		}

		const isLead = req.method === 'POST' && LEADS_PATH.test(path);
		const isBooking = req.method === 'POST' && BOOKINGS_PATH.test(path);
		if (live && (isLead || isBooking)) {
			void (async () => {
				const raw = await readBody(req);
				let body: unknown;
				try {
					body = raw === null ? undefined : (JSON.parse(raw || '{}') as unknown);
				} catch {
					body = undefined;
				}
				if (!isRecord(body)) return apiError(res, 400, 'invalid_body', 'Ungültiger JSON-Body');
				const kind = isBooking ? 'booking' : 'lead';
				const key = isBooking
					? decodeURIComponent(BOOKINGS_PATH.exec(path)![1]!)
					: typeof body.funnelKey === 'string'
						? body.funnelKey
						: '';
				const eventType = isBooking ? (live.eventTypes[key] ?? null) : null;
				const funnel = !isBooking && key ? (live.funnel?.(key) ?? null) : null;
				const input: TestRunInput = {
					kind,
					key,
					...(eventType ? { eventType } : {}),
					...(funnel ? { funnel } : {}),
					payload: testRunPayload(body),
				};
				let r = await api.createTestRun(siteId, testMail ? { ...input, sendMail: true } : input);
				const noMail = testMail ? testMailUnavailable(r) : null;
				if (noMail) {
					// Ohne Testmail weiter, für den Rest der Sitzung: Der Testlauf selbst soll nicht daran scheitern.
					testMail = false;
					log(`[dealsystem] Keine Testmail: ${noMail} Testläufe laufen ohne Mail weiter.`);
					r = await api.createTestRun(siteId, input);
				}
				if (await missing(r)) {
					if (kind === 'lead') {
						// Älterer Core ohne Testläufe: Probe-Einsendung wie bisher (geprüft, nicht gespeichert).
						const old = await api.devLead(siteId, body);
						log(
							`[dealsystem] Probe-Einsendung an das CRM geprüft, nicht gespeichert (Status ${old.status}).`,
						);
						return relay(res, old);
					}
					log(
						'[dealsystem] Dieser DealSystem-Server kennt noch keine Testläufe; die Buchung wurde nur lokal geprüft.',
					);
					return sendJson(res, 200, {
						data: { booked: true, dryRun: true, start: body.start ?? null, end: null },
					});
				}
				if (r.status < 200 || r.status >= 300) {
					log(`[dealsystem] Testlauf abgelehnt (Status ${r.status}); die Seite zeigt die Meldung.`);
					return relay(res, r);
				}
				log(testRunSummary(r.body, live.testRunsUrl ?? null));
				const run = isRecord(r.body) && isRecord(r.body.data) ? r.body.data : {};
				// Wäre es live abgelehnt worden, sieht die Seite denselben Fehler.
				const rejection = isRecord(run.rejection) ? run.rejection : {};
				// Bot-Falle: live meldet die Site-API Erfolg und speichert nichts; die Seite sieht dasselbe.
				if (run.outcome === 'rejected' && rejection.code !== 'honeypot')
					return relay(res, rejectionResponse(rejection));
				const data = isRecord(run.booking) ? run.booking : {};
				// Die Seite sieht dasselbe wie auf einer Vorschau: geprüft, nichts angelegt.
				return sendJson(
					res,
					200,
					kind === 'booking'
						? {
								data: {
									booked: true,
									dryRun: true,
									start: typeof data.start === 'string' ? data.start : (body.start ?? null),
									end: typeof data.end === 'string' ? data.end : null,
								},
							}
						: { data: { accepted: true, dryRun: true } },
				);
			})().catch((e: unknown) => apiError(res, 502, 'dev_proxy_error', (e as Error).message));
			return;
		}

		if ((req.method === 'GET' || req.method === 'HEAD') && path.startsWith(MEDIA_PREFIX)) {
			if (!options.mediaOrigin)
				return apiError(res, 404, 'media_unavailable', 'Keine Seiten-Adresse für Medien bekannt.');
			void (async () => {
				const upstream = await options.fetch(`${options.mediaOrigin}${req.url ?? path}`, {
					method: req.method,
				});
				res.statusCode = upstream.status;
				for (const h of ['content-type', 'cache-control', 'etag', 'content-length']) {
					const v = upstream.headers.get(h);
					if (v) res.setHeader(h, v);
				}
				res.end(req.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer()));
			})().catch((e: unknown) => apiError(res, 502, 'media_proxy_error', (e as Error).message));
			return;
		}
		next();
	};
}

/** Vite-Plugin, das die Middleware **vor** die des SDK-Plugins stellt (beide `enforce: 'pre'`). */
export function devProxyPlugin(middleware: Middleware): {
	name: string;
	enforce: 'pre';
	configureServer(server: { middlewares: { stack: { route: string; handle: Middleware }[] } }): void;
} {
	return {
		name: 'dealsystem-cli-dev',
		enforce: 'pre',
		configureServer(server) {
			// Das SDK-Plugin registriert seine Site-API früher in derselben Phase; vorne einhängen.
			server.middlewares.stack.unshift({ route: '', handle: middleware });
		},
	};
}

interface ViteModule {
	createServer(config: Record<string, unknown>): Promise<{
		listen(): Promise<unknown>;
		printUrls(): void;
		close(): Promise<void>;
	}>;
}

/** Lädt Vite aus dem Projekt (nicht aus der CLI), damit Version und Plugins des Projekts gelten. */
async function loadProjectVite(projectDir: string): Promise<ViteModule> {
	try {
		const require = createRequire(join(projectDir, 'package.json'));
		const pkgPath = require.resolve('vite/package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
			exports?: unknown;
			module?: string;
			main?: string;
		};
		const root = (pkg.exports as Record<string, unknown> | undefined)?.['.'];
		const pick = (v: unknown): string | undefined =>
			typeof v === 'string'
				? v
				: v && typeof v === 'object'
					? pick((v as Record<string, unknown>).import ?? (v as Record<string, unknown>).default)
					: undefined;
		const entry = pick(root) ?? pkg.module ?? pkg.main ?? 'index.js';
		return (await import(pathToFileURL(join(dirname(pkgPath), entry)).href)) as ViteModule;
	} catch (e) {
		throw new CliError(
			'vite_missing',
			`Vite ist im Projekt nicht installiert (${(e as Error).message}).`,
			'Führe `npm install` im Projektordner aus.',
			EXIT.usage,
		);
	}
}

function mediaOriginFrom(snapshot: unknown): string | null {
	const host = (snapshot as { site?: { primaryHost?: unknown } } | null)?.site?.primaryHost;
	return typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

/** Ob `dev` echte Daten nutzt, und wenn nicht, warum. */
export type DevMode = { live: true; siteId: string } | { live: false; reason: string; siteId: string | null };

/** Prüft Seite, Anmeldung und Netz. Wirft nie: Ohne echte Daten läuft `dev` mit Beispieldaten. */
export async function detectDevMode(ctx: CommandContext): Promise<DevMode> {
	const local = ctx.optionalSiteId();
	if (!local) {
		return {
			live: false,
			siteId: null,
			reason: `Keine Seite verbunden (keine \`siteId\` in ${SITE_CONFIG_FILE}); für echte Daten \`npx dealsystem init\`.`,
		};
	}
	try {
		await ctx.api().getWebsite(local.id);
		return { live: true, siteId: local.id };
	} catch (e) {
		const reason =
			e instanceof CliError && e.exitCode === EXIT.auth
				? 'Nicht angemeldet; für echte Daten `npx dealsystem login`.'
				: e instanceof ApiError && e.status === 404
					? 'Die Seite gehört nicht zum Workspace der Anmeldung (`npx dealsystem status`).'
					: e instanceof CliError && e.code === 'network_error'
						? 'DealSystem ist nicht erreichbar (offline?).'
						: `Echte Daten nicht abrufbar (${(e as Error).message}).`;
		return { live: false, siteId: local.id, reason };
	}
}

/** Manifest, das das Vite-Plugin auch unter `vite dev` schreibt (Formulare wie im Build). */
const MANIFEST_FILE = '.dealsystem/manifest.json';

/** Fester Link auf die Testläufe im CRM. */
export function testRunsLink(apiUrl: string, workspaceId: string, siteId: string): string {
	return `${apiUrl.replace(/\/+$/, '')}/t/${encodeURIComponent(workspaceId)}/website/${encodeURIComponent(siteId)}/formulare#website-test-runs`;
}

/**
 * Formular `key` aus dem Manifest für den Testlauf vor dem ersten Hochladen: `{ label, fields }`, höchstens 50
 * Felder. Bei jedem Abruf neu gelesen (der Dev-Server schreibt es nach jeder Änderung der Konfiguration neu).
 */
export function manifestFunnel(file: string, key: string): { label?: string; fields: unknown[] } | null {
	try {
		const manifest = JSON.parse(readFileSync(file, 'utf8')) as { funnels?: unknown };
		const funnels = Array.isArray(manifest.funnels) ? manifest.funnels : [];
		const funnel = funnels.find((f): f is Json => isRecord(f) && f.key === key);
		if (!funnel || !Array.isArray(funnel.fields)) return null;
		const fields = funnel.fields.filter(isRecord).slice(0, 50);
		const label =
			typeof funnel.label === 'string' && funnel.label.trim() ? funnel.label.trim().slice(0, 255) : undefined;
		return { ...(label ? { label } : {}), fields };
	} catch {
		return null;
	}
}

export async function devCommand(ctx: CommandContext): Promise<CommandResult> {
	const mode = await detectDevMode(ctx);
	const api = ctx.api();
	const contentFile = ctx.path(CONTENT_FILE);
	let snapshot: unknown = null;
	if (existsSync(contentFile)) {
		snapshot = JSON.parse(readFileSync(contentFile, 'utf8')) as unknown;
	} else if (mode.live) {
		ctx.progress('Hole Inhalte aus dem CRM …');
		snapshot = await api.getContent(mode.siteId);
		mkdirSync(dirname(contentFile), { recursive: true });
		writeFileSync(contentFile, canonicalJson(snapshot));
	}
	const mediaOrigin = ctx.str('media-origin') ?? mediaOriginFrom(snapshot);
	const config = readSiteConfig(ctx.readProjectFile(SITE_CONFIG_FILE)).data;
	const eventTypes = Object.fromEntries((config?.bookings ?? []).map((b) => [b.key, b.eventType]));
	const labels = Object.fromEntries((config?.bookings ?? []).map((b) => [b.key, b.label]));
	let testRunsUrl: string | null = null;
	if (mode.live) {
		const lookup = await lookupWorkspaceQuietly(ctx);
		if (lookup.state === 'known') testRunsUrl = testRunsLink(ctx.apiUrl, lookup.workspace.id, mode.siteId);
	}
	// Testmail nur auf ausdrücklichen Wunsch: `--testmail` oder `DEALSYSTEM_TEST_MAIL=1`.
	const testMail = ctx.flag('testmail') || ctx.io.env.DEALSYSTEM_TEST_MAIL === '1';
	const middleware = createDevMiddleware({
		api,
		siteId: mode.siteId ?? '',
		mediaOrigin,
		fetch: ctx.io.fetch,
		log: (m) => ctx.progress(m),
		live: mode.live
			? {
					eventTypes,
					labels,
					testRunsUrl,
					testMail,
					funnel: (key) => manifestFunnel(ctx.path(MANIFEST_FILE), key),
				}
			: null,
	});

	const vite = await loadProjectVite(ctx.projectDir);
	// Nur setzen, wenn es die Datei gibt: Sonst zeigt das SDK Standardtexte (Beispieldaten ohne `sync`), statt
	// abzubrechen.
	if (existsSync(contentFile)) process.env.DEALSYSTEM_CONTENT_FILE = contentFile;
	const port = ctx.str('port');
	const server = await vite.createServer({
		root: ctx.projectDir,
		plugins: [devProxyPlugin(middleware)],
		...(port ? { server: { port: Number(port), strictPort: true } } : {}),
	});
	await server.listen();
	server.printUrls();
	ctx.progress(
		mode.live
			? `Echte Daten aus dem CRM: Terminart, Fragen und freie Zeiten. Formulare und Buchungen legen nichts an und verschicken keine Mail an Besucher; DealSystem hält sie als Testlauf fest (Eigene Website → Formulare, Abschnitt Testläufe).${testMail ? ' Testmail an: Die Bestätigung kommt als „[Test]“-Mail an dich (höchstens 10 je Stunde).' : ''} Beenden mit Strg+C.`
			: `Beispieldaten: ${mode.reason} Formulare und Buchungen gehen nicht ans CRM.${testMail ? ' Ohne echte Daten gibt es keine Testmail.' : ''} Beenden mit Strg+C.`,
	);
	await new Promise<void>((resolve) => {
		process.once('SIGINT', () => resolve());
		process.once('SIGTERM', () => resolve());
	});
	await server.close();
	return { exitCode: EXIT.ok, data: { mediaOrigin, live: mode.live }, text: 'Dev-Server beendet.' };
}
