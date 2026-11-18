// Welcher Workspace und welcher Nutzer hinter der Anmeldung stehen (`GET /api/v1/meta/whoami`).
// Fail-open: Kennt der Server den Endpunkt nicht oder antwortet er nicht, laufen die Befehle weiter.

import { CliError, EXIT } from '../api/errors.js';
import type { WhoAmI } from '../api/types.js';
import type { CommandContext } from './context.js';

export type WorkspaceLookup =
	| ({ state: 'known' } & WhoAmI)
	/** Der Server nennt den Workspace noch nicht (Endpunkt fehlt). */
	| { state: 'unsupported' }
	/** Abfrage fehlgeschlagen (Netz, Serverfehler). */
	| { state: 'unavailable'; message: string };

/** Fragt Workspace und Nutzer ab. Fehlende Anmeldung (Exit-Code 3) wird weitergeworfen, alles andere nicht. */
export async function lookupWorkspace(ctx: CommandContext): Promise<WorkspaceLookup> {
	try {
		const who = await ctx.api().whoami();
		return who ? { state: 'known', ...who } : { state: 'unsupported' };
	} catch (e) {
		if (e instanceof CliError && e.exitCode === EXIT.auth) throw e;
		return { state: 'unavailable', message: (e as Error)?.message ?? String(e) };
	}
}

/** Wie `lookupWorkspace`, schluckt aber jeden Fehler (für Zusatzangaben nach `login` und `init`). */
export async function lookupWorkspaceQuietly(ctx: CommandContext): Promise<WorkspaceLookup> {
	try {
		return await lookupWorkspace(ctx);
	} catch (e) {
		return { state: 'unavailable', message: (e as Error)?.message ?? String(e) };
	}
}

export function workspaceName(w: { id: string; name: string }): string {
	return w.name ? `„${w.name}“` : `ID ${w.id}`;
}

export function workspaceLine(lookup: WorkspaceLookup): string {
	if (lookup.state === 'known')
		return `Workspace: ${lookup.workspace.name || '–'} (ID ${lookup.workspace.id})`;
	if (lookup.state === 'unsupported') {
		return 'Workspace: unbekannt, dieser DealSystem-Server nennt den Workspace noch nicht';
	}
	return `Workspace: konnte nicht abgefragt werden (${lookup.message})`;
}

export function userLine(lookup: WorkspaceLookup, viaEnvToken: boolean): string | null {
	if (lookup.state !== 'known') return null;
	const u = lookup.user;
	if (!u) return `Angemeldet: per API-Schlüssel${viaEnvToken ? ' aus DEALSYSTEM_TOKEN' : ''}, ohne Nutzer`;
	const who = [u.name, u.email ? `<${u.email}>` : null].filter(Boolean).join(' ');
	return `Angemeldet als: ${who || '–'} (ID ${u.id})`;
}

/** Ein Satz für die Textausgabe von `login` und `init`; leer, wenn der Workspace unbekannt ist. */
export function workspaceSentence(lookup: WorkspaceLookup): string {
	return lookup.state === 'known' ? ` Workspace: ${workspaceName(lookup.workspace)}.` : '';
}

/** Für `--json`: Workspace und Nutzer, sonst `null`. */
export function workspaceData(lookup: WorkspaceLookup): {
	workspace: WhoAmI['workspace'] | null;
	user: WhoAmI['user'];
	workspaceLookup: WorkspaceLookup['state'];
} {
	return lookup.state === 'known'
		? { workspace: lookup.workspace, user: lookup.user, workspaceLookup: 'known' }
		: { workspace: null, user: null, workspaceLookup: lookup.state };
}
