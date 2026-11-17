import { BROWSER, DEV } from 'esm-env';

/**
 * Meldet einen Bedienfehler des SDK. Beim Build und in der Entwicklung wird
 * geworfen, damit der Fehler auffällt. Im Browser der fertigen Seite nur
 * protokolliert: ein Besucher soll deswegen keine kaputte Seite sehen.
 * @internal
 */
export function usageError(message: string): void {
	const text = `[dealsystem] ${message}`;
	if (!BROWSER || DEV) throw new Error(text);
	console.error(text);
}
