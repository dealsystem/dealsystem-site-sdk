// Ausgabe des Prüfergebnisses: als Text („Datei:Zeile – Problem – so behebst du es“), als stabiles JSON und
// als `check`-Teil des Build-Reports an den Core (5.3).

import type { CheckResult, Finding } from './types.js';

export function formatLocation(f: Pick<Finding, 'file' | 'line'>): string {
	if (!f.file) return '(Projekt)';
	return f.line ? `${f.file}:${f.line}` : f.file;
}

/** Eine Zeile je Fund. */
export function formatFinding(f: Finding): string {
	const tag = f.severity === 'error' ? 'Fehler' : 'Warnung';
	return `${formatLocation(f)} – ${f.message} – ${f.fix} [${f.rule}, ${tag}]`;
}

export function formatCheckText(result: CheckResult): string {
	const lines: string[] = [];
	for (const f of [...result.errors, ...result.warnings]) lines.push(formatFinding(f));
	const warnings = `${result.warnings.length} Warnung${result.warnings.length === 1 ? '' : 'en'}`;
	const both = result.stages.includes('source') && result.stages.includes('output');
	if (!result.passed) {
		lines.push(`Prüfung fehlgeschlagen: ${result.errors.length} Fehler, ${warnings}.`);
	} else if (both) {
		// Die eine Zeile, die ein Agent zitieren darf, wenn er „geprüft“ sagt.
		lines.push(`Prüfung bestanden: Quelltext und fertige Seite geprüft, 0 Fehler, ${warnings}.`);
	} else if (result.stages.includes('source')) {
		lines.push(
			`Quelltext geprüft: 0 Fehler, ${warnings}. Die fertige Seite ist noch NICHT geprüft. ` +
				'Vollständig geprüft ist erst nach `npm run build` und `npx dealsystem check --output build`.',
		);
	} else {
		lines.push(`Fertige Seite geprüft: 0 Fehler, ${warnings}. Der Quelltext ist nicht geprüft.`);
	}
	return lines.join('\n');
}

/** Feste Feldreihenfolge, damit `--json` zwischen Läufen und Versionen gleich aussieht. */
export function findingToJson(f: Finding): Finding {
	return {
		rule: f.rule,
		severity: f.severity,
		file: f.file,
		line: f.line,
		column: f.column,
		message: f.message,
		fix: f.fix,
	};
}

export function checkResultToJson(result: CheckResult): CheckResult {
	return {
		passed: result.passed,
		ruleSetVersion: result.ruleSetVersion,
		stages: [...result.stages],
		errors: result.errors.map(findingToJson),
		warnings: result.warnings.map(findingToJson),
	};
}

export interface BuildReportFinding {
	rule: string;
	file: string | null;
	line: number | null;
	message: string;
	fix: string;
}

export interface BuildReportCheck {
	ruleSetVersion: string;
	errors: BuildReportFinding[];
	warnings: BuildReportFinding[];
}

/**
 * `check`-Teil von `POST /api/internal/self-site/build/{versionId}/report`. Mehrere Läufe (Quelle vor dem
 * Build, Ausgabe danach) werden zusammengeführt. Höchstens `limit` Funde je Liste (Core kappt bei 200).
 */
export function toBuildReportCheck(results: CheckResult[], limit = 200): BuildReportCheck {
	const pick = (f: Finding): BuildReportFinding => ({
		rule: f.rule,
		file: f.file,
		line: f.line,
		message: f.message,
		fix: f.fix,
	});
	return {
		ruleSetVersion: results[0]?.ruleSetVersion ?? '',
		errors: results
			.flatMap((r) => r.errors)
			.slice(0, limit)
			.map(pick),
		warnings: results
			.flatMap((r) => r.warnings)
			.slice(0, limit)
			.map(pick),
	};
}
