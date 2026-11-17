// Alles, was die CLI von außen braucht. Tests ersetzen es; `nodeIO()` ist die echte Umgebung.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import type { FetchLike } from '../api/http.js';

export interface CliIO {
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdout(text: string): void;
	stderr(text: string): void;
	/** Mensch am Terminal (stdin und stdout sind TTY). Agenten laufen ohne. */
	isInteractive: boolean;
	prompt(question: string): Promise<string>;
	/** Öffnet die Adresse im Standard-Browser. `false`, wenn das nicht ging. */
	openBrowser(url: string): Promise<boolean>;
	fetch: FetchLike;
	now(): Date;
	sleep(ms: number): Promise<void>;
}

function browserCommand(url: string): [string, string[]] {
	if (process.platform === 'darwin') return ['open', [url]];
	if (process.platform === 'win32') return ['cmd', ['/c', 'start', '""', url]];
	return ['xdg-open', [url]];
}

export function nodeIO(): CliIO {
	return {
		cwd: process.cwd(),
		env: process.env,
		stdout: (text) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`),
		stderr: (text) => process.stderr.write(text.endsWith('\n') ? text : `${text}\n`),
		isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
		async prompt(question) {
			const rl = createInterface({ input: process.stdin, output: process.stderr });
			try {
				return await rl.question(question);
			} finally {
				rl.close();
			}
		},
		openBrowser(url) {
			return new Promise((resolve) => {
				try {
					const [cmd, args] = browserCommand(url);
					const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
					child.on('error', () => resolve(false));
					child.on('spawn', () => {
						child.unref();
						resolve(true);
					});
				} catch {
					resolve(false);
				}
			});
		},
		fetch: (input, init) => fetch(input, init),
		now: () => new Date(),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
	};
}
