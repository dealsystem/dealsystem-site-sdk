// Prototyp „Patchen statt Bauen“: baut den Starter mehrmals mit verschiedenen
// Schnappschüssen und legt jedes Ergebnis samt Manifest in <out>/<name> ab.
// Aufruf: node proto/build-variants.mjs <out> <name>=<snapshot.json> ...
import { execFile } from 'node:child_process';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createStarter, packageDir, simulateInstallAndInit, writeSnapshot } from '../tests/helpers.ts';

const run = promisify(execFile);
const [out, ...variants] = process.argv.slice(2);
if (!out || variants.length === 0)
	throw new Error('Aufruf: build-variants.mjs <out> <name>=<snapshot.json> ...');

const project = await createStarter();
try {
	await simulateInstallAndInit(project.dir);
	// Ein Bild-Slot auf der Startseite und eine zweite Seite mit Text-Slot für den Seitenwechsel.
	const pageFile = join(project.dir, 'src/routes/+page.svelte');
	let page = await readFile(pageFile, 'utf8');
	page = page
		.replace(
			"import { RichText, Seo, Text } from '@dealsystem/site';",
			"import { MediaImage, RichText, Seo, Text } from '@dealsystem/site';",
		)
		.replace(
			'<a class="button" href={resolve(\'/kontakt\')}>',
			'<MediaImage key="start.hero.bild" default="/favicon.svg" width={64} height={64} alt="Logo der Firma" label="Titelbild" group="Startseite" sizes="(min-width: 60rem) 50vw, 100vw" />\n\t\t<a class="button" href={resolve(\'/kontakt\')}>',
		);
	await writeFile(pageFile, page);
	// SvelteKit schreibt sonst Date.now() als Version in einen Chunk: Jeder Build hätte andere Dateinamen.
	// Mit fester Version zeigt der Vergleich, was der Inhalt allein ändert.
	if (process.env.FIXED_KIT_VERSION) {
		const svelteConfig = join(project.dir, 'svelte.config.js');
		const config = await readFile(svelteConfig, 'utf8');
		await writeFile(
			svelteConfig,
			config.replace(
				'kit: {',
				`kit: {\n\t\tversion: { name: ${JSON.stringify(process.env.FIXED_KIT_VERSION)} },`,
			),
		);
	}
	const vite = join(packageDir('vite', project.dir), 'bin/vite.js');
	for (const variant of variants) {
		const [name, file] = variant.split('=');
		await writeSnapshot(project.dir, JSON.parse(await readFile(file, 'utf8')));
		const started = performance.now();
		await run(process.execPath, [vite, 'build'], {
			cwd: project.dir,
			env: {
				...process.env,
				PUBLIC_DEALSYSTEM_API: 'https://app.dealsystem.io',
				PUBLIC_DEALSYSTEM_SITE_KEY: 'dsp_abcd1234_abcdefghijklmnopqrstuvwx',
				PUBLIC_DEALSYSTEM_SITE_URL: 'https://muster-immobilien.de',
			},
		});
		const ms = Math.round(performance.now() - started);
		await rm(join(out, name), { recursive: true, force: true });
		await cp(join(project.dir, 'build'), join(out, name, 'site'), { recursive: true });
		await cp(join(project.dir, '.dealsystem/manifest.json'), join(out, name, 'manifest.json'));
		console.log(`${name}: vite build ${ms} ms`);
	}
} finally {
	await project.remove();
}
