// Vertrag der Verwaltungs- und Deploy-API (Konzept 5.2, `/api/v1/websites/…`). Die CLI hängt nur an
// diesem Interface; `HttpDeployApi` ist die einzige Implementierung gegen HTTP, Tests nutzen einen Mock-Server.

export interface Website {
	id: string;
	name: string;
	slug: string;
	status: string;
	liveVersionId: string | null;
	/** Standard-Host `<slug>.<SITES_DOMAIN>`, falls der Core ihn mitliefert. */
	defaultHost: string | null;
	/** Aktive Hauptdomain, sonst `null`. */
	primaryHost: string | null;
}

export interface WebsiteDomain {
	host: string;
	kind: string;
	active: boolean;
}

export interface WebsiteDetails extends Website {
	domains: WebsiteDomain[];
	liveVersion: VersionSummary | null;
	/**
	 * Pflichtangaben für Rechtstexte, die im CRM noch fehlen (`legalProfileMissing`: `company`, `email`,
	 * `imprintHtml`, `privacyHtml`); leer = vollständig. `null`, wenn der Server das Feld nicht liefert.
	 */
	legalProfileMissing: string[] | null;
}

export interface CheckFinding {
	rule: string;
	file: string | null;
	line: number | null;
	message: string;
	fix: string | null;
}

export interface VersionCheckResult {
	passed: boolean;
	ruleSetVersion: string;
	errors: CheckFinding[];
	warnings: CheckFinding[];
}

export interface VersionSummary {
	id: string;
	number: number;
	status: string;
	trigger: string;
	message: string | null;
	createdAt: string | null;
	previewUrl: string | null;
}

export interface Version extends VersionSummary {
	checkResult: VersionCheckResult | null;
	/** Auszug aus dem Build-Log; fremder Text, nur anzeigen. */
	logExcerpt: string | null;
}

export interface PreparedUpload {
	versionId: string;
	uploadUrl: string;
	/** Laut Vertrag immer `PUT`. */
	uploadMethod: string;
	expiresAt: string | null;
	/** Header, die der signierte Upload genau so verlangt (`Content-Length` ist mitsigniert). */
	uploadHeaders: Record<string, string>;
}

/** Quellpaket einer Version (`GET …/versions/{id}/source`). */
export interface SourceDownload {
	versionId: string;
	versionNumber: number;
	/** `content` = Inhalts-Version; geliefert wird dann der Code von `codeVersion*`. */
	trigger: string;
	codeVersionId: string;
	codeVersionNumber: number | null;
	sha256: string;
	bytes: number;
	/** Signierte Adresse, kurz gültig; ohne Anmelde-Header abrufen. */
	url: string;
	expiresAt: string | null;
}

export interface ReleaseResult {
	liveVersionId: string;
	/** `false`, wenn die Version schon live war (`release: null`). */
	changed: boolean;
	url: string | null;
}

/** Workspace und Nutzer hinter dem Token (`GET /api/v1/meta/whoami`). */
export interface WhoAmI {
	workspace: { id: string; name: string };
	/** `null` bei einem API-Schlüssel ohne Nutzer. */
	user: { id: string; name: string | null; email: string | null } | null;
}

export interface DeployApi {
	/** `null`, wenn der Server den Endpunkt noch nicht kennt (älterer Core). */
	whoami(): Promise<WhoAmI | null>;
	/** Gilt die Anmeldung? (Ein älterer Core meldet unbekannte Pfade mit 401 statt 404.) */
	tokenWorks(): Promise<boolean>;
	listWebsites(): Promise<Website[]>;
	createWebsite(input: { name: string; slug: string }): Promise<Website>;
	getWebsite(id: string): Promise<WebsiteDetails>;
	getContent(id: string): Promise<unknown>;
	listVersions(id: string, limit?: number): Promise<VersionSummary[]>;
	prepareUpload(
		id: string,
		input: { sha256: string; bytes: number; message?: string },
	): Promise<PreparedUpload>;
	uploadSource(upload: PreparedUpload, body: Uint8Array): Promise<void>;
	completeUpload(id: string, versionId: string): Promise<Version>;
	getVersion(id: string, versionId: string): Promise<Version>;
	publish(id: string, versionId: string): Promise<ReleaseResult>;
	rollback(id: string, versionId?: string): Promise<ReleaseResult>;
	/** Signierte Download-Adresse des Quellpakets (Recht „Website verwalten“). */
	getSourceDownload(id: string, versionId: string): Promise<SourceDownload>;
	/** Lädt das Quellpaket; bricht ab, sobald mehr als `maxBytes` kommen. */
	downloadSource(source: SourceDownload, maxBytes: number): Promise<Uint8Array>;
	/** Website-Texte und Bild-Plätze der Seite (`GET /websites/{id}/slots`). */
	listSlots(id: string): Promise<WebsiteSlot[]>;
	/** Foto für einen Bild-Platz, Schritt 1: signierte PUT-Adresse (`POST /websites/{id}/media`). */
	prepareImageUpload(id: string, input: { slotKey: string; bytes: number }): Promise<PreparedImageUpload>;
	/** Lädt das Foto an die signierte Adresse (ohne Authorization-Header). */
	uploadImage(upload: PreparedImageUpload, body: Uint8Array): Promise<void>;
	/** Schritt 2: Foto auf den Bild-Platz setzen (`POST /websites/{id}/media/{uploadId}/complete`). */
	completeImageUpload(
		id: string,
		uploadId: string,
		input: { slotKey: string; alt: string },
	): Promise<WebsiteSlot | null>;
	/** Probe-Einsendung aus `dealsystem dev` (immer `dryRun` im Core). Antwort wird unverändert durchgereicht. */
	devLead(id: string, body: unknown): Promise<{ status: number; body: unknown }>;
	/**
	 * Terminart für `dealsystem dev` mit echten Daten (`GET /websites/{id}/dev/booking/{key}`), vor dem ersten Build
	 * über `eventType` (Slug). Antwort unverändert, in der Form der Site-API.
	 */
	devBooking(id: string, key: string, eventType: string | null, label?: string | null): Promise<RawResponse>;
	/** Freie Zeiten dazu (`…/dev/booking/{key}/slots?from=&to=`). */
	devBookingSlots(
		id: string,
		key: string,
		range: { from: string; to: string; tz?: string },
		eventType: string | null,
	): Promise<RawResponse>;
	/** Passen die Antworten zur Terminart (`POST …/dev/booking/{key}/qualify`)? Schreibt nichts. */
	devBookingQualify(id: string, key: string, body: unknown, eventType: string | null): Promise<RawResponse>;
	/** Testlauf: Einsendung oder Buchung, die nichts anlegt, im CRM festhalten (`POST /websites/{id}/test-runs`). */
	createTestRun(id: string, input: TestRunInput): Promise<RawResponse>;
}

/** Antwort der API ohne Deutung: Status und JSON-Body. */
export interface RawResponse {
	status: number;
	body: unknown;
}

/** Was `dealsystem dev` als Testlauf schickt. `payload` ist der Body der Seite ohne Captcha und Bot-Falle. */
export interface TestRunInput {
	kind: 'lead' | 'booking';
	/** Formular- bzw. Buchungsschlüssel. */
	key: string;
	eventType?: string;
	/**
	 * Formular aus der Konfiguration (Felder wie im Manifest). Der Core nutzt es nur, solange die Seite das Formular
	 * noch nicht kennt (vor dem ersten Hochladen), mit den Standard-Einstellungen eines neuen Formulars.
	 */
	funnel?: { label?: string; fields: unknown[] };
	payload: Record<string, unknown>;
}

/** Endzustände einer Version. */
export const SETTLED_VERSION_STATUSES: ReadonlySet<string> = new Set([
	'ready',
	'rejected',
	'failed',
	'expired',
]);

/** Ein Website-Text oder Bild-Platz, wie `GET /websites/{id}/slots` ihn liefert (nur, was die CLI braucht). */
export interface WebsiteSlot {
	key: string;
	type: string;
	label: string;
	inUse: boolean;
	overridden: boolean;
	mediaId: string | null;
}

export interface PreparedImageUpload {
	uploadId: string;
	url: string;
	method: string;
	headers: Record<string, string>;
	expiresAt: string | null;
}
