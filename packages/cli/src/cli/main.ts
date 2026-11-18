// Einstieg der CLI: Argumente lesen, Befehl ausführen, Ergebnis als Text oder JSON ausgeben.
// Alles läuft ohne Rückfragen; die einzige Ausnahme ist die Bestätigung beim Live-Schalten am Terminal.

import { readFileSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CliError, EXIT, type ExitCode } from '../api/errors.js';
import type { DeployApi } from '../api/types.js';
import { checkCommand } from '../commands/check.js';
import { deployCommand, publishCommand, rollbackCommand } from '../commands/deploy.js';
import { devCommand } from '../commands/dev.js';
import { loginCommand, logoutCommand } from '../commands/login.js';
import { pullCommand } from '../commands/pull.js';
import { initCommand, statusCommand } from '../commands/site.js';
import { syncCommand } from '../commands/sync.js';
import { CommandContext, type CommandResult, type OptionValues } from './context.js';
import type { CliIO } from './io.js';

type Options = NonNullable<ParseArgsConfig['options']>;

const GLOBAL_OPTIONS: Options = {
	json: { type: 'boolean' },
	'api-url': { type: 'string' },
	dir: { type: 'string' },
	site: { type: 'string' },
	quiet: { type: 'boolean' },
	help: { type: 'boolean', short: 'h' },
};

interface CommandDef {
	summary: string;
	usage: string;
	options: Options;
	flags: string[];
	run: (ctx: CommandContext) => Promise<CommandResult>;
	positionals?: boolean;
}

export const COMMANDS: Record<string, CommandDef> = {
	login: {
		summary: 'Anmelden per Gerätecode (Bestätigung im Browser)',
		usage: 'dealsystem login [--start | --wait] [--no-browser]',
		options: { start: { type: 'boolean' }, wait: { type: 'boolean' }, 'no-browser': { type: 'boolean' } },
		flags: [
			'--start  Code anfordern und sofort beenden (für Agenten)',
			'--wait  auf die Bestätigung einer mit --start begonnenen Anmeldung warten',
			'--no-browser  Browser nicht automatisch öffnen',
		],
		run: loginCommand,
	},
	logout: {
		summary: 'Abmelden und Token löschen',
		usage: 'dealsystem logout',
		options: {},
		flags: [],
		run: logoutCommand,
	},
	init: {
		summary: 'Seite wählen oder anlegen, `siteId` in dealsystem.config.ts eintragen',
		usage: 'dealsystem init [--site <id|slug>] [--create --name <Name> --slug <adresse>]',
		options: { create: { type: 'boolean' }, name: { type: 'string' }, slug: { type: 'string' } },
		flags: [
			'--site <id|slug>  vorhandene Seite wählen',
			'--create --name <Name> --slug <adresse>  neue Seite anlegen',
		],
		run: initCommand,
	},
	sync: {
		summary:
			'Inhalte holen, CRM mit dealsystem.config.ts abgleichen, AGENTS.md-Block erneuern, fehlende Skills wiederherstellen',
		usage: 'dealsystem sync [--offline] [--fix-config]',
		options: { offline: { type: 'boolean' }, 'fix-config': { type: 'boolean' } },
		flags: [
			'--offline  nicht ins Netz; Abgleich mit der vorhandenen .dealsystem/content.json',
			'--fix-config  svelte.config.js und vite.config.ts aus dem Starter wiederherstellen',
		],
		run: syncCommand,
	},
	dev: {
		summary: 'Dev-Server starten; Formulare gehen als Probe an das CRM',
		usage: 'dealsystem dev [--port <port>] [--media-origin <https://…>]',
		options: { port: { type: 'string' }, 'media-origin': { type: 'string' } },
		flags: [
			'--port <port>  Port des Vite-Dev-Servers',
			'--media-origin <url>  woher /_ds/media/* kommt (Standard: Hauptadresse der Seite)',
		],
		run: devCommand,
	},
	check: {
		summary: 'Regeln lokal prüfen (Exit-Code 1 bei Fehlern)',
		usage: 'dealsystem check [--output build] [--allowed] [--rules]',
		options: { output: { type: 'string' }, allowed: { type: 'boolean' }, rules: { type: 'boolean' } },
		flags: [
			'--output <ordner>  zusätzlich die gebaute Seite prüfen (nach `npm run build`)',
			'--allowed  freigegebene Pakete anzeigen',
			'--rules  Regelkatalog anzeigen',
		],
		run: checkCommand,
	},
	deploy: {
		summary: 'Prüfen, lokal bauen, hochladen, Vorschau-URL ausgeben',
		usage: 'dealsystem deploy [-m <Notiz>] [--publish [--confirm]] [--no-wait] [--timeout <s>]',
		options: {
			message: { type: 'string', short: 'm' },
			publish: { type: 'boolean' },
			confirm: { type: 'boolean' },
			'no-wait': { type: 'boolean' },
			timeout: { type: 'string' },
		},
		flags: [
			'-m, --message <Notiz>  Notiz zur Version',
			'--publish  danach live schalten (nur mit Bestätigung)',
			'--confirm  der Nutzer hat dem Live-Schalten zugestimmt',
			'--no-wait  nach dem Hochladen nicht auf den Build warten',
			'--timeout <s>  höchstens so lange warten (Standard 600)',
		],
		run: deployCommand,
	},
	publish: {
		summary: 'Eine fertige Version live schalten (mit Bestätigung)',
		usage: 'dealsystem publish [--version <id|nummer>] [--confirm]',
		options: { version: { type: 'string' }, confirm: { type: 'boolean' } },
		flags: [
			'--version <id|nummer>  Standard: neueste fertige Version',
			'--confirm  der Nutzer hat zugestimmt',
		],
		run: publishCommand,
	},
	rollback: {
		summary: 'Auf eine frühere Version zurückschalten (mit Bestätigung)',
		usage: 'dealsystem rollback [--version <id|nummer>] [--confirm]',
		options: { version: { type: 'string' }, confirm: { type: 'boolean' } },
		flags: ['--version <id|nummer>  Standard: die vorige Freigabe', '--confirm  der Nutzer hat zugestimmt'],
		run: rollbackCommand,
	},
	pull: {
		summary:
			'Quellcode einer Version in einen neuen Ordner holen (z. B. auf einem neuen Rechner); Standard: die Live-Version',
		usage: 'dealsystem pull [ordner] [--site <id|slug>] [--version <nummer|id>]',
		options: { version: { type: 'string' } },
		flags: [
			'[ordner]  neuer oder leerer Ordner (Standard: ./<slug der Seite>); vorhandene Dateien werden nie überschrieben',
			'--site <id|slug>  Seite wählen, wenn der Workspace mehrere hat',
			'--version <nummer|id>  diese Version statt der Live-Version',
		],
		run: pullCommand,
		positionals: true,
	},
	status: {
		summary: 'Seite, Live-Version, Rechtstexte, letzte Versionen, Domains',
		usage: 'dealsystem status',
		options: {},
		flags: [],
		run: statusCommand,
	},
};

const GLOBAL_FLAGS = [
	'--json  Ergebnis als JSON auf stdout',
	'--dir <ordner>  Projektordner (Standard: aktueller Ordner)',
	'--site <id>  Seite statt der siteId aus dealsystem.config.ts',
	'--api-url <url>  DealSystem-Adresse (Standard: https://app.dealsystem.io, Umgebung DEALSYSTEM_API_URL)',
	'--quiet  keine Fortschrittsmeldungen auf stderr',
];

export function cliVersion(): string {
	try {
		const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
			version?: string;
		};
		return pkg.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

export function helpText(command?: string): string {
	const def = command ? COMMANDS[command] : undefined;
	if (def) {
		return [
			`${def.summary}`,
			'',
			`Aufruf: ${def.usage}`,
			'',
			...(def.flags.length ? ['Optionen:', ...def.flags.map((f) => `  ${f}`), ''] : []),
			'Allgemein:',
			...GLOBAL_FLAGS.map((f) => `  ${f}`),
		].join('\n');
	}
	return [
		`dealsystem ${cliVersion()} – eigene Website auf DealSystem bauen und veröffentlichen`,
		'',
		'Befehle:',
		...Object.entries(COMMANDS).map(([name, d]) => `  ${name.padEnd(9)} ${d.summary}`),
		'',
		'Allgemein:',
		...GLOBAL_FLAGS.map((f) => `  ${f}`),
		'',
		'Hilfe zu einem Befehl: dealsystem <befehl> --help',
		'Exit-Codes: 0 ok, 1 Prüfung/Build fehlgeschlagen, 2 falscher Aufruf oder Bestätigung nötig, 3 nicht angemeldet, 4 API nicht erreichbar',
	].join('\n');
}

export interface RunOptions {
	/** Für Tests: eigene API statt HTTP. */
	apiFactory?: (ctx: CommandContext) => DeployApi;
}

function emitError(io: CliIO, json: boolean, command: string, error: CliError): ExitCode {
	if (json) {
		io.stdout(
			JSON.stringify({
				ok: false,
				command,
				error: { code: error.code, message: error.message, fix: error.fix },
				...(error.data !== undefined ? { data: error.data } : {}),
			}),
		);
	} else {
		io.stderr(`Fehler: ${error.message} – ${error.fix}`);
	}
	return error.exitCode;
}

/** Führt die CLI aus und liefert den Exit-Code. Wirft nie. */
export async function run(argv: string[], io: CliIO, options: RunOptions = {}): Promise<ExitCode> {
	const [first, ...rest] = argv;
	const wantsJson = argv.includes('--json');
	if (!first || first === 'help' || first === '--help' || first === '-h') {
		const topic = first === 'help' ? rest[0] : undefined;
		io.stdout(helpText(topic));
		return EXIT.ok;
	}
	if (first === '--version' || first === '-v' || first === 'version') {
		io.stdout(
			wantsJson
				? JSON.stringify({ ok: true, command: 'version', data: { version: cliVersion() } })
				: cliVersion(),
		);
		return EXIT.ok;
	}
	const def = COMMANDS[first];
	if (!def) {
		return emitError(
			io,
			wantsJson,
			first,
			new CliError(
				'unknown_command',
				`Unbekannter Befehl \`${first}\`.`,
				`Verfügbar: ${Object.keys(COMMANDS).join(', ')}. Hilfe: \`npx dealsystem --help\`.`,
				EXIT.usage,
			),
		);
	}

	let values: OptionValues;
	let positionals: string[];
	try {
		const parsed = parseArgs({
			args: rest,
			options: { ...GLOBAL_OPTIONS, ...def.options },
			strict: true,
			allowPositionals: def.positionals === true,
		});
		values = parsed.values as OptionValues;
		positionals = parsed.positionals;
	} catch (e) {
		return emitError(
			io,
			wantsJson,
			first,
			new CliError(
				'invalid_arguments',
				(e as Error).message,
				`Aufruf: ${def.usage}. Hilfe: \`npx dealsystem ${first} --help\`.`,
				EXIT.usage,
			),
		);
	}
	if (values.help === true) {
		io.stdout(helpText(first));
		return EXIT.ok;
	}

	const json = values.json === true;
	try {
		const ctx = new CommandContext(io, first, values, positionals, options.apiFactory);
		const result = await def.run(ctx);
		if (json)
			io.stdout(JSON.stringify({ ok: result.exitCode === EXIT.ok, command: first, data: result.data }));
		else io.stdout(result.text);
		return result.exitCode;
	} catch (e) {
		if (e instanceof CliError) return emitError(io, json, first, e);
		return emitError(
			io,
			json,
			first,
			new CliError(
				'internal_error',
				`Unerwarteter Fehler: ${(e as Error)?.message ?? String(e)}`,
				'Führe den Befehl erneut aus. Bleibt der Fehler, melde ihn an DealSystem.',
				EXIT.failed,
			),
		);
	}
}
