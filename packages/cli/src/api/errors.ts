// Fehler der CLI mit Code, Text und Korrektur-Anweisung. Exit-Codes sind Teil des Vertrags mit dem Agenten.

export const EXIT = {
	ok: 0,
	/** Prüfung oder Build mit Fehlern. */
	failed: 1,
	/** Falscher Aufruf oder fehlende Bestätigung. */
	usage: 2,
	/** Nicht angemeldet oder Anmeldung abgelaufen. */
	auth: 3,
	/** API oder Netz nicht erreichbar, unerwartete Antwort. */
	api: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly fix: string,
		readonly exitCode: ExitCode = EXIT.failed,
		readonly data?: unknown,
	) {
		super(message);
		this.name = 'CliError';
	}
}

/** Fehlerantwort der API v1: `{ error, message, status, code }`. */
export class ApiError extends CliError {
	constructor(
		readonly status: number,
		apiCode: string,
		message: string,
		fix: string,
	) {
		super(apiCode, message, fix, status === 401 ? EXIT.auth : EXIT.api);
		this.name = 'ApiError';
	}
}

export function notLoggedIn(): CliError {
	return new CliError(
		'not_logged_in',
		'Du bist nicht angemeldet.',
		'Führe `npx dealsystem login` aus und bestätige die Anmeldung im Browser.',
		EXIT.auth,
	);
}
