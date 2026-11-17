// Test-Umgebung für die CLI: Ausgabe sammeln, Uhr und Warten simulieren, Browser und Prompt ersetzen.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../../src/cli/main.js';
import type { CliIO, ProcessResult } from '../../src/cli/io.js';

export interface TestIO extends CliIO {
	out: string[];
	err: string[];
	opened: string[];
	sleeps: number[];
	answers: string[];
	/** Gestartete Prozesse (lokaler Build). */
	runs: { command: string; args: string[]; cwd: string }[];
	/** Antwort auf den nächsten Prozess; Standard: Erfolg ohne Ausgabe. */
	runResults: ProcessResult[];
}

export function testIO(opts: {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	interactive?: boolean;
	start?: number;
}): TestIO {
	let clock = opts.start ?? Date.parse('2026-11-17T10:00:00Z');
	const io: TestIO = {
		cwd: opts.cwd,
		env: { DEALSYSTEM_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ds-cli-config-')), ...opts.env },
		out: [],
		err: [],
		opened: [],
		sleeps: [],
		answers: [],
		runs: [],
		runResults: [],
		stdout: (t) => io.out.push(t),
		stderr: (t) => io.err.push(t),
		isInteractive: opts.interactive ?? false,
		prompt: async () => io.answers.shift() ?? '',
		openBrowser: async (url) => {
			io.opened.push(url);
			return true;
		},
		fetch: (input, init) => fetch(input, init),
		now: () => new Date(clock),
		sleep: async (ms) => {
			io.sleeps.push(ms);
			clock += ms;
		},
		run: async (command, args, options) => {
			io.runs.push({ command, args, cwd: options.cwd });
			return io.runResults.shift() ?? { exitCode: 0, output: '' };
		},
	};
	return io;
}

export async function runCli(
	io: TestIO,
	...argv: string[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tests greifen frei auf die JSON-Ausgabe zu
): Promise<{ code: number; stdout: string; stderr: string; json: any }> {
	io.out.length = 0;
	io.err.length = 0;
	const code = await run(argv, io);
	const stdout = io.out.join('\n');
	let json: unknown = null;
	if (argv.includes('--json')) json = JSON.parse(stdout);
	return { code, stdout, stderr: io.err.join('\n'), json };
}
