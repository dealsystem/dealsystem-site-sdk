// `dealsystem login` — Gerätecode-Login. Der einzige Schritt, den ein Mensch selbst macht: im Browser bestätigen.
// Für Agenten, deren Shell erst nach Ende des Befehls Ausgabe zeigt: `login --start`, dann `login --wait`.

import { CliError, EXIT } from '../api/errors.js';
import { pollDeviceToken, startDeviceAuthorization, CLI_CLIENT_ID } from '../api/oauth.js';
import type { PendingLogin } from '../auth/credentials.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import { lookupWorkspaceQuietly, workspaceData, workspaceSentence } from '../cli/workspace.js';

async function begin(ctx: CommandContext): Promise<PendingLogin> {
	const auth = await startDeviceAuthorization(ctx.apiUrl, ctx.io.fetch);
	const pending: PendingLogin = {
		apiUrl: ctx.apiUrl,
		deviceCode: auth.deviceCode,
		userCode: auth.userCode,
		verificationUriComplete: auth.verificationUriComplete,
		interval: auth.interval,
		expiresAt: ctx.io.now().getTime() + auth.expiresIn * 1000,
	};
	ctx.store.savePending(pending);
	return pending;
}

function formatCode(code: string): string {
	return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

async function wait(ctx: CommandContext, pending: PendingLogin): Promise<CommandResult> {
	let interval = Math.max(1, pending.interval) * 1000;
	for (;;) {
		if (ctx.io.now().getTime() >= pending.expiresAt) {
			ctx.store.clearPending();
			throw new CliError(
				'login_expired',
				'Der Anmeldecode ist abgelaufen (15 Minuten).',
				'Führe `npx dealsystem login` erneut aus und bestätige zügig im Browser.',
				EXIT.auth,
			);
		}
		await ctx.io.sleep(interval);
		const result = await pollDeviceToken(
			pending.apiUrl,
			pending.deviceCode,
			ctx.io.fetch,
			ctx.io.now().getTime(),
		);
		if (result.kind === 'pending') continue;
		if (result.kind === 'slow_down') {
			interval += 5000;
			continue;
		}
		ctx.store.clearPending();
		if (result.kind === 'denied') {
			throw new CliError(
				'login_denied',
				'Die Anmeldung wurde im Browser abgelehnt.',
				'Führe `npx dealsystem login` erneut aus, wenn du dich anmelden willst.',
				EXIT.auth,
			);
		}
		if (result.kind === 'expired') {
			throw new CliError(
				'login_expired',
				'Der Anmeldecode ist abgelaufen.',
				'Führe `npx dealsystem login` erneut aus.',
				EXIT.auth,
			);
		}
		const account = ctx.store.save(pending.apiUrl, result.tokens, ctx.io.now());
		const envHint = ctx.io.env.DEALSYSTEM_TOKEN
			? ' Achtung: DEALSYSTEM_TOKEN ist gesetzt und hat Vorrang.'
			: '';
		// Den im Browser gewählten Workspace nennen, damit Nutzer und Agent ihn bestätigen können.
		const lookup = await lookupWorkspaceQuietly(ctx);
		const { workspace, user } = workspaceData(lookup);
		return {
			exitCode: EXIT.ok,
			data: {
				apiUrl: account.apiUrl,
				scope: account.scope,
				expiresAt: new Date(account.expiresAt).toISOString(),
				credentialsFile: ctx.store.credentialsPath,
				workspace,
				user,
			},
			text: `Angemeldet bei ${account.apiUrl}.${workspaceSentence(lookup)}${envHint} Nächster Schritt: \`npx dealsystem init\` im Projektordner.`,
		};
	}
}

export async function loginCommand(ctx: CommandContext): Promise<CommandResult> {
	if (ctx.flag('wait')) {
		const pending = ctx.store.readPending();
		if (!pending || pending.apiUrl !== ctx.apiUrl) {
			throw new CliError(
				'no_pending_login',
				'Es läuft keine Anmeldung.',
				'Starte sie mit `npx dealsystem login --start`.',
				EXIT.usage,
			);
		}
		return wait(ctx, pending);
	}

	const pending = await begin(ctx);
	const code = formatCode(pending.userCode);
	const opened = ctx.flag('no-browser') ? false : await ctx.io.openBrowser(pending.verificationUriComplete);
	const instruction = `Öffne ${pending.verificationUriComplete} und bestätige den Code ${code}. Nur bestätigen, wenn du die Anmeldung gerade selbst gestartet hast.`;

	if (ctx.flag('start')) {
		return {
			exitCode: EXIT.ok,
			data: {
				userCode: code,
				verificationUri: pending.verificationUriComplete,
				expiresAt: new Date(pending.expiresAt).toISOString(),
				browserOpened: opened,
				clientId: CLI_CLIENT_ID,
				next: 'npx dealsystem login --wait',
			},
			text: `${instruction}\n${opened ? 'Der Browser wurde geöffnet. ' : ''}Danach: \`npx dealsystem login --wait\`.`,
		};
	}

	ctx.progress(instruction);
	if (opened) ctx.progress('Der Browser wurde geöffnet. Warte auf die Bestätigung …');
	return wait(ctx, pending);
}

export async function logoutCommand(ctx: CommandContext): Promise<CommandResult> {
	const account = ctx.store.get(ctx.apiUrl);
	if (account?.refreshToken) {
		// Best effort: Refresh-Token beim Core widerrufen. Lokal wird in jedem Fall gelöscht.
		try {
			await ctx.io.fetch(`${ctx.apiUrl}/oauth/revoke`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					token: account.refreshToken,
					token_type_hint: 'refresh_token',
					client_id: CLI_CLIENT_ID,
				}).toString(),
			});
		} catch {
			// offline: lokal trotzdem abmelden
		}
	}
	const removed = ctx.store.remove(ctx.apiUrl);
	ctx.store.clearPending();
	return {
		exitCode: EXIT.ok,
		data: { apiUrl: ctx.apiUrl, removed },
		text: removed ? `Abgemeldet von ${ctx.apiUrl}.` : `Es war keine Anmeldung für ${ctx.apiUrl} gespeichert.`,
	};
}
