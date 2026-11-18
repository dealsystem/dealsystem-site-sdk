// `dealsystem init` (Seite wählen oder anlegen, `siteId` eintragen) und `dealsystem status`.

import { writeFileSync } from 'node:fs';
import { ApiError, CliError, EXIT } from '../api/errors.js';
import { legalStatus, legalStatusLine } from '../api/legal.js';
import type { VersionSummary, Website, WebsiteDetails } from '../api/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
import {
	lookupWorkspace,
	lookupWorkspaceQuietly,
	userLine,
	workspaceData,
	workspaceLine,
	workspaceName,
	workspaceSentence,
	type WorkspaceLookup,
} from '../cli/workspace.js';
import { defaultSiteConfig, SITE_CONFIG_FILE, writeSiteIdIntoConfig } from '../project/siteConfig.js';

function siteLine(s: Website): string {
	return `${s.id}  ${s.slug}  ${s.name}`;
}

async function chooseSite(ctx: CommandContext): Promise<{ site: Website; created: boolean }> {
	const api = ctx.api();
	if (ctx.flag('create')) {
		const name = ctx.str('name');
		const slug = ctx.str('slug');
		if (!name || !slug) {
			throw new CliError(
				'missing_arguments',
				'`--create` braucht `--name` und `--slug`.',
				'Beispiel: `npx dealsystem init --create --name "Muster Immobilien" --slug muster-immobilien`.',
				EXIT.usage,
			);
		}
		return { site: await api.createWebsite({ name, slug }), created: true };
	}
	return { site: await selectExistingSite(ctx, 'init'), created: false };
}

/**
 * Vorhandene Seite: `--site <id|slug>`, sonst die einzige des Workspaces; bei mehreren ein Fehler mit
 * Liste (für `init` und `pull`).
 */
export async function selectExistingSite(ctx: CommandContext, command: 'init' | 'pull'): Promise<Website> {
	const sites = await ctx.api().listWebsites();
	const wanted = ctx.str('site');
	if (wanted) {
		const site = sites.find((s) => s.id === wanted || s.slug === wanted);
		if (!site) {
			throw new CliError(
				'site_not_found',
				`Die Seite \`${wanted}\` gibt es in diesem Workspace nicht.`,
				command === 'init'
					? 'Wähle eine der Seiten aus `data.sites` oder lege eine an mit `--create --name … --slug …`.'
					: 'Wähle eine der Seiten aus `data.sites`.',
				EXIT.usage,
				{ sites },
			);
		}
		return site;
	}
	if (sites.length === 1) return sites[0]!;
	if (sites.length === 0) {
		throw new CliError(
			'no_sites',
			'In diesem Workspace gibt es noch keine Seite.',
			'Lege eine an: `npx dealsystem init --create --name "<Name>" --slug <adresse>`.',
			EXIT.usage,
			{ sites },
		);
	}
	throw new CliError(
		'site_ambiguous',
		`Es gibt mehrere Seiten:\n${sites.map(siteLine).join('\n')}`,
		`Wähle eine mit \`npx dealsystem ${command} --site <id oder slug>\`.`,
		EXIT.usage,
		{ sites },
	);
}

export async function initCommand(ctx: CommandContext): Promise<CommandResult> {
	const { site, created } = await chooseSite(ctx);
	const current = ctx.readProjectFile(SITE_CONFIG_FILE);
	let next: string | null;
	if (current === null) next = defaultSiteConfig(site.id);
	else next = writeSiteIdIntoConfig(current, site.id);
	if (next === null) {
		throw new CliError(
			'config_unreadable',
			`In ${SITE_CONFIG_FILE} lässt sich \`siteId\` nicht eintragen.`,
			`Schreibe \`siteId: '${site.id}'\` in \`defineSite({ … })\`.`,
			EXIT.failed,
			{ siteId: site.id },
		);
	}
	if (next !== current) writeFileSync(ctx.path(SITE_CONFIG_FILE), next);
	const lookup = await lookupWorkspaceQuietly(ctx);
	const { workspace } = workspaceData(lookup);
	return {
		exitCode: EXIT.ok,
		data: {
			siteId: site.id,
			name: site.name,
			slug: site.slug,
			created,
			configFile: SITE_CONFIG_FILE,
			workspace,
		},
		text: `${created ? 'Seite angelegt' : 'Seite gewählt'}: ${site.name} (${site.slug}).${workspaceSentence(lookup)} \`siteId\` steht in ${SITE_CONFIG_FILE}. Nächster Schritt: \`npx dealsystem sync\`.`,
	};
}

export async function statusCommand(ctx: CommandContext): Promise<CommandResult> {
	const local = ctx.optionalSiteId();
	const origin = local?.source === 'flag' ? '--site' : SITE_CONFIG_FILE;
	let lookup: WorkspaceLookup;
	try {
		lookup = await lookupWorkspace(ctx);
	} catch (e) {
		if (e instanceof CliError && e.exitCode === EXIT.auth) {
			throw new CliError(
				e.code,
				`${e.message} Workspace und Nutzer sind deshalb unbekannt.${local ? ` Seite laut ${origin}: ${local.id}.` : ''}`,
				`${e.fix} Danach mit \`npx dealsystem status\` den Workspace prüfen.`,
				EXIT.auth,
				{ loggedIn: false, workspace: null, user: null, siteId: local?.id ?? null },
			);
		}
		throw e;
	}
	const head = [workspaceLine(lookup), userLine(lookup, Boolean(ctx.io.env.DEALSYSTEM_TOKEN?.trim()))].filter(
		(l): l is string => l !== null,
	);
	const base = { ...workspaceData(lookup), siteId: local?.id ?? null, siteSource: local?.source ?? null };

	if (!local) {
		return {
			exitCode: EXIT.ok,
			data: { ...base, site: null, versions: [], legal: null },
			text: [
				...head,
				`Seite: noch keine gewählt (keine \`siteId\` in ${SITE_CONFIG_FILE}).`,
				'Stimmt der Workspace, wählt oder legt `npx dealsystem init` die Seite darin an.',
			].join('\n'),
		};
	}

	const api = ctx.api();
	let site: WebsiteDetails;
	let versions: VersionSummary[];
	try {
		[site, versions] = await Promise.all([api.getWebsite(local.id), api.listVersions(local.id, 5)]);
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) {
			const where =
				lookup.state === 'known'
					? `im Workspace ${workspaceName(lookup.workspace)}`
					: 'im Workspace dieser Anmeldung';
			throw new CliError(
				'site_not_in_workspace',
				`Die Seite ${local.id} (laut ${origin}) gibt es ${where} nicht. Vermutlich gehört sie zu einem anderen Workspace.`,
				'Frage den Nutzer, in welchem Workspace die Seite liegen soll. Ist die Anmeldung im falschen Workspace: `npx dealsystem logout`, dann `npx dealsystem login` und im Browser den richtigen Workspace wählen. Soll die Seite in diesen Workspace: `npx dealsystem init`.',
				EXIT.usage,
				base,
			);
		}
		throw e;
	}
	const live = site.liveVersion;
	const legal = legalStatus(site);
	const lines = [
		...head,
		`Seite: ${site.name} (${site.slug}), ID ${site.id} aus ${origin}, Zustand ${site.status}`,
		`Adresse: ${site.primaryHost ?? site.defaultHost ?? '–'}`,
		`Live: ${live ? `Version ${live.number}` : 'noch nichts live'}`,
		legalStatusLine(legal),
		'Letzte Versionen:',
		...(versions.length
			? versions.map((v) => `  ${v.number}  ${v.status}  ${v.previewUrl ?? ''}  ${v.message ?? ''}`.trimEnd())
			: ['  keine']),
		'Domains:',
		...(site.domains.length
			? site.domains.map((d) => `  ${d.host} (${d.kind}${d.active ? ', aktiv' : ', noch nicht aktiv'})`)
			: ['  keine']),
	];
	return { exitCode: EXIT.ok, data: { ...base, site, versions, legal }, text: lines.join('\n') };
}
