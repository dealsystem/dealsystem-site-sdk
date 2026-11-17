/** @internal Eigene Datei, damit Tests das Neuladen ersetzen können. */
export function reloadPage(): void {
	if (typeof window !== 'undefined') window.location.reload();
}
