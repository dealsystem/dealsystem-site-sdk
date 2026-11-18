// Ein Prüflauf: Regeln je Stufe ausführen, Funde normalisieren und stabil sortieren.

import { getRule, RULE_SET_VERSION, RULES } from './catalog.js';
import { OutputContext, SourceContext } from './context.js';
import { cspForm } from './util/csp.js';
import { createDirFileSet, IGNORED_DIRS } from './fileset.js';
import type { RuleImpl } from './rule.js';
import { a11yOutputRules, a11ySourceRules } from './rules/a11y.js';
import { privacyOutputRules, privacySourceRules } from './rules/privacy.js';
import { qualityOutputRules, qualitySourceRules } from './rules/quality.js';
import { securityOutputRules, securitySourceRules } from './rules/security.js';
import { structureRules } from './rules/structure.js';
import type {
	CheckOptions,
	CheckResult,
	CheckStage,
	FileSet,
	Finding,
	RawFinding,
	RuleMeta,
	Severity,
} from './types.js';

export const RULE_IMPLEMENTATIONS: readonly RuleImpl[] = [
	...structureRules,
	...securitySourceRules,
	...privacySourceRules,
	...a11ySourceRules,
	...qualitySourceRules,
	...securityOutputRules,
	...privacyOutputRules,
	...a11yOutputRules,
	...qualityOutputRules,
];

export class RuleSetMismatchError extends Error {
	constructor(
		readonly expected: string,
		readonly actual: string,
	) {
		super(`Regelkatalog ${actual} passt nicht zur erwarteten Version ${expected}.`);
		this.name = 'RuleSetMismatchError';
	}
}

function compareFindings(a: Finding, b: Finding): number {
	const key = (f: Finding): [string, number, number, string, string] => [
		f.file ?? '',
		f.line ?? 0,
		f.column ?? 0,
		f.rule,
		f.message,
	];
	const ka = key(a);
	const kb = key(b);
	for (let i = 0; i < ka.length; i++) {
		const x = ka[i]!;
		const y = kb[i]!;
		if (x < y) return -1;
		if (x > y) return 1;
	}
	return 0;
}

function normalize(meta: RuleMeta, raw: RawFinding, severity: Severity): Finding {
	return {
		rule: meta.id,
		severity,
		file: raw.file ?? null,
		line: raw.line ?? null,
		column: raw.column ?? null,
		message: raw.message,
		fix: raw.fix ?? meta.fix,
	};
}

/** Meldung einer Regel, die selbst abgestürzt ist: nie still verschlucken, aber den Lauf nicht abbrechen. */
function crashFinding(meta: RuleMeta, error: unknown): RawFinding {
	return {
		message: `Die Prüfung ${meta.id} ist mit einem internen Fehler abgebrochen: ${(error as Error)?.message ?? String(error)}`,
		fix: 'Melde den Fehler an DealSystem. Bis dahin hilft es oft, die zuletzt geänderte Datei zu prüfen.',
	};
}

/**
 * Führt den Regelkatalog aus. Läuft ohne Netz und ohne Browser; liest nur Dateien, führt nichts aus dem
 * Projekt aus. Der Build-Host ruft dieselbe Funktion auf (Quelle vor dem Build, Ausgabe danach).
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
	if (options.ruleSetVersion !== undefined && options.ruleSetVersion !== RULE_SET_VERSION) {
		throw new RuleSetMismatchError(options.ruleSetVersion, RULE_SET_VERSION);
	}
	const source: FileSet | null =
		options.source ??
		(options.projectDir ? createDirFileSet(options.projectDir, { ignoreDirs: IGNORED_DIRS }) : null);
	const output: FileSet | null =
		options.output ?? (options.outputDir ? createDirFileSet(options.outputDir, {}) : null);
	const available: CheckStage[] = [
		...(source ? (['source'] as const) : []),
		...(output ? (['output'] as const) : []),
	];
	const stages = options.stages ? available.filter((s) => options.stages!.includes(s)) : available;
	const disabled = new Set(options.disabledRules ?? []);

	const findings: Finding[] = [];
	const severityOf = (meta: RuleMeta, raw: RawFinding): Severity =>
		options.severityOverrides?.[meta.id] ?? raw.severity ?? meta.severity;

	const sourceCtx = source && stages.includes('source') ? new SourceContext(source, options) : null;
	const outputCtx = output && stages.includes('output') ? new OutputContext(output, options) : null;
	if (outputCtx) {
		if (options.external) outputCtx.declared = { external: options.external, strict: true };
		else if (source) {
			// Lokal (`check --output build`): Die Deklaration steht in der Quelle, auch wenn nur die Ausgabe läuft.
			const src = sourceCtx ?? new SourceContext(source, options);
			outputCtx.declared = {
				external: src.siteConfig().data?.external ?? [],
				strict: cspForm(src)?.kind === 'dealsystem',
			};
		}
	}
	for (const impl of RULE_IMPLEMENTATIONS) {
		if (disabled.has(impl.id)) continue;
		const meta = getRule(impl.id);
		if (!meta) throw new Error(`Regel ${impl.id} fehlt im Katalog.`);
		let raws: RawFinding[];
		try {
			if (impl.stage === 'source') {
				if (!sourceCtx) continue;
				raws = impl.run(sourceCtx);
			} else {
				if (!outputCtx) continue;
				raws = impl.run(outputCtx);
			}
		} catch (error) {
			raws = [crashFinding(meta, error)];
		}
		for (const raw of raws) findings.push(normalize(meta, raw, severityOf(meta, raw)));
	}

	for (const plugin of options.plugins ?? []) {
		const metas = new Map(plugin.meta.map((m) => [m.id, m]));
		const raws = await plugin.run({ stages, source, output, options });
		for (const raw of raws) {
			const meta = metas.get(raw.rule) ?? getRule(raw.rule);
			if (!meta || disabled.has(meta.id)) continue;
			findings.push(normalize(meta, raw, severityOf(meta, raw)));
		}
	}

	findings.sort(compareFindings);
	// Gleiche Meldung an gleicher Stelle nur einmal.
	const unique = findings.filter(
		(f, i) =>
			i === 0 || compareFindings(f, findings[i - 1]!) !== 0 || f.severity !== findings[i - 1]!.severity,
	);
	const errors = unique.filter((f) => f.severity === 'error');
	const warnings = unique.filter((f) => f.severity === 'warning');
	return { passed: errors.length === 0, ruleSetVersion: RULE_SET_VERSION, stages, errors, warnings };
}

export { RULES };
