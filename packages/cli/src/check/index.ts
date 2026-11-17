// Einstiegspunkt `dealsystem/check`: Regelkatalog als Bibliothek für CLI und Build-Host.
// Ohne Netz, ohne Browser, ohne Ausführen von Projektcode.

export { runCheck, RuleSetMismatchError, RULE_IMPLEMENTATIONS } from './run.js';
export { RULES, RULE_SET_VERSION, DEFAULT_SDK_RANGE, getRule } from './catalog.js';
export { ALLOWED_PACKAGES, ALTERNATIVES, isAllowedPackage } from './allowlist.js';
export { createDirFileSet, createMemoryFileSet, IGNORED_DIRS } from './fileset.js';
export {
	checkResultToJson,
	findingToJson,
	formatCheckText,
	formatFinding,
	toBuildReportCheck,
	type BuildReportCheck,
	type BuildReportFinding,
} from './format.js';
export { SECRET_PATTERNS } from './rules/security.js';
export { OUTPUT_LIMITS } from './rules/quality.js';
export type {
	CheckOptions,
	CheckPlugin,
	CheckResult,
	CheckStage,
	FileEntry,
	FileSet,
	Finding,
	PluginInput,
	RawFinding,
	RuleMeta,
	Severity,
} from './types.js';
