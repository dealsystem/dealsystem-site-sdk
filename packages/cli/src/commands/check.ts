// `dealsystem check` — Regelkatalog lokal auf genau den Dateien, die hochgeladen würden.

import { isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { CliError, EXIT } from '../api/errors.js';
import { ALLOWED_PACKAGES } from '../check/allowlist.js';
import { RULES, RULE_SET_VERSION } from '../check/catalog.js';
import { createDirFileSet } from '../check/fileset.js';
import { checkResultToJson, formatCheckText } from '../check/format.js';
import { runCheck } from '../check/run.js';
import type { CheckResult } from '../check/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { createUploadFileSet } from '../project/uploadFiles.js';

export async function runLocalCheck(ctx: CommandContext, outputDir?: string): Promise<CheckResult> {
	if (!existsSync(ctx.path('package.json')) && !existsSync(ctx.path('dealsystem.config.ts'))) {
		throw new CliError(
			'not_a_project',
			`${ctx.projectDir} ist kein Website-Projekt (package.json fehlt).`,
			'Wechsle in den Projektordner oder gib ihn mit `--dir <ordner>` an.',
			EXIT.usage,
		);
	}
	return runCheck({
		source: createUploadFileSet(ctx.projectDir),
		...(outputDir ? { output: createDirFileSet(outputDir, {}) } : {}),
	});
}

export async function checkCommand(ctx: CommandContext): Promise<CommandResult> {
	if (ctx.flag('allowed')) {
		return {
			exitCode: EXIT.ok,
			data: { packages: ALLOWED_PACKAGES },
			text: ['Freigegebene Pakete:', ...ALLOWED_PACKAGES.map((p) => `  ${p.name} – ${p.reason}`)].join('\n'),
		};
	}
	if (ctx.flag('rules')) {
		return {
			exitCode: EXIT.ok,
			data: { ruleSetVersion: RULE_SET_VERSION, rules: RULES },
			text: [
				`Regelkatalog ${RULE_SET_VERSION}:`,
				...RULES.map((r) => `  ${r.id} (${r.severity === 'error' ? 'Fehler' : 'Warnung'}) – ${r.title}`),
			].join('\n'),
		};
	}
	const output = ctx.str('output');
	let outputDir: string | undefined;
	if (output) {
		outputDir = isAbsolute(output) ? output : resolve(ctx.projectDir, output);
		if (!existsSync(outputDir)) {
			throw new CliError(
				'output_missing',
				`Der Ausgabeordner ${output} existiert nicht.`,
				'Führe zuerst `npm run build` aus.',
				EXIT.usage,
			);
		}
	}
	const result = await runLocalCheck(ctx, outputDir);
	return {
		exitCode: result.passed ? EXIT.ok : EXIT.failed,
		data: checkResultToJson(result),
		text: formatCheckText(result),
	};
}
