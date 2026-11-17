// `dealsystem init` (Seite wählen oder anlegen, `siteId` eintragen) und `dealsystem status`.

import { writeFileSync } from 'node:fs';
import { CliError, EXIT } from '../api/errors.js';
import { legalStatus, legalStatusLine } from '../api/legal.js';
import type { Website } from '../api/types.js';
import type { CommandContext, CommandResult } from '../cli/context.js';
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
	return {
		exitCode: EXIT.ok,
		data: { siteId: site.id, name: site.name, slug: site.slug, created, configFile: SITE_CONFIG_FILE },
		text: `${created ? 'Seite angelegt' : 'Seite gewählt'}: ${site.name} (${site.slug}). \`siteId\` steht in ${SITE_CONFIG_FILE}. Nächster Schritt: \`npx dealsystem sync\`.`,
	};
}

export async function statusCommand(ctx: CommandContext): Promise<CommandResult> {
	const id = ctx.siteId();
	const api = ctx.api();
	const [site, versions] = await Promise.all([api.getWebsite(id), api.listVersions(id, 5)]);
	const live = site.liveVersion;
	const legal = legalStatus(site);
	const lines = [
		`Seite: ${site.name} (${site.slug}), Zustand ${site.status}`,
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
	return { exitCode: EXIT.ok, data: { site, versions, legal }, text: lines.join('\n') };
}
