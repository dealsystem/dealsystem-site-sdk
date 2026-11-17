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

export interface ReleaseResult {
	liveVersionId: string;
	/** `false`, wenn die Version schon live war (`release: null`). */
	changed: boolean;
	url: string | null;
}

export interface DeployApi {
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
	/** Probe-Einsendung aus `dealsystem dev` (immer `dryRun` im Core). Antwort wird unverändert durchgereicht. */
	devLead(id: string, body: unknown): Promise<{ status: number; body: unknown }>;
}

/** Endzustände einer Version. */
export const SETTLED_VERSION_STATUSES: ReadonlySet<string> = new Set([
	'ready',
	'rejected',
	'failed',
	'expired',
]);
