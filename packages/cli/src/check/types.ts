// Öffentliche Typen des Regelkatalogs. CLI und Build-Host benutzen dieselben.

/** `source` prüft den Quellcode (Q), `output` die gebaute Seite (A). `browser` ist für Phase 2 (axe, Lighthouse) reserviert. */
export type CheckStage = 'source' | 'output' | 'browser';

export type Severity = 'error' | 'warning';

/** Eine Meldung. `message` beschreibt das Problem, `fix` sagt als Anweisung, wie man es behebt. */
export interface Finding {
	rule: string;
	severity: Severity;
	/** Pfad relativ zum Projekt (Quelle) oder zum Ausgabeordner (Ausgabe), immer mit `/`. */
	file: string | null;
	/** 1-basiert. */
	line: number | null;
	/** 1-basiert. */
	column: number | null;
	message: string;
	fix: string;
}

export interface CheckResult {
	passed: boolean;
	ruleSetVersion: string;
	/** Welche Stufen gelaufen sind. */
	stages: CheckStage[];
	errors: Finding[];
	warnings: Finding[];
}

/** Ein Eintrag im Regelkatalog. */
export interface RuleMeta {
	id: string;
	/** Schweregrad, wenn nichts anderes eingestellt ist. */
	severity: Severity;
	/** Wo die Regel prüft. Leer = Meldung kommt vom Build-Host (BLD-*), nicht aus `check`. */
	stages: CheckStage[];
	/** Kurzbeschreibung, was geprüft wird. */
	title: string;
	/** Standard-Korrektur, falls die Meldung keine eigene hat. */
	fix: string;
}

/** Was eine Regel meldet; Schweregrad und Regel-ID ergänzt der Lauf. */
export interface RawFinding {
	file?: string | null;
	line?: number | null;
	column?: number | null;
	message: string;
	fix?: string;
	/** Nur für Regeln, die je Fund unterschiedlich streng sind (z. B. QUA-006). */
	severity?: Severity;
}

export interface FileEntry {
	/** Relativ, mit `/`. */
	path: string;
	size: number;
}

/** Lesezugriff auf einen Projekt- oder Ausgabeordner. Läuft ohne Netz; Tests nutzen eine Speicher-Variante. */
export interface FileSet {
	/** Alle regulären Dateien, sortiert. */
	list(): FileEntry[];
	has(path: string): boolean;
	/** Text (UTF-8) oder `null`, wenn die Datei fehlt. */
	readText(path: string): string | null;
	readBytes(path: string): Uint8Array | null;
}

export interface CheckOptions {
	/** Projektordner (Quelle). Fehlt er, läuft die Stufe `source` nicht. */
	projectDir?: string;
	/** Ausgabeordner von `vite build` (adapter-static, meist `build`). Fehlt er, läuft `output` nicht. */
	outputDir?: string;
	/** Alternativ zu den Ordnern: fertige Dateimengen (Tests, Build-Host mit eigenem Entpacker). */
	source?: FileSet;
	output?: FileSet;
	/** Nur diese Stufen. Standard: alle, für die Dateien vorliegen. */
	stages?: CheckStage[];
	/** Unterstützter Bereich von `@dealsystem/site` (Build-Job `sdkRange`). */
	sdkRange?: string;
	/** Erwartete Version des Regelkatalogs (Build-Job `ruleSetVersion`). Abweichung → Ausnahme. */
	ruleSetVersion?: string;
	/** Öffentliche Adresse der Seite; absolute Links dorthin gelten als intern. */
	siteUrl?: string;
	/** Adresse der Site-API, für die die Seite gebaut wurde (`PUBLIC_DEALSYSTEM_API`). Nur für die Ausgabe-Prüfung der CSP. */
	apiUrl?: string;
	/** Schweregrad je Regel überschreiben (neue Regeln kommen erst als Warnung). */
	severityOverrides?: Record<string, Severity>;
	/** Regeln abschalten. Nur für Tests und Werkzeuge, nie für den Build-Host. */
	disabledRules?: string[];
	/** Zusätzliche Regeln, z. B. die Browser-Stufe aus Phase 2. */
	plugins?: CheckPlugin[];
}

/** Andockpunkt für weitere Prüfungen (Phase 2: axe-core, Lighthouse in einem Browser ohne Netz). */
export interface CheckPlugin {
	meta: RuleMeta[];
	run(input: PluginInput): Promise<(RawFinding & { rule: string })[]> | (RawFinding & { rule: string })[];
}

export interface PluginInput {
	stages: CheckStage[];
	source: FileSet | null;
	output: FileSet | null;
	options: CheckOptions;
}
