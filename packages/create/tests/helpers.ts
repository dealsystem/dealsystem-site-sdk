import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../bin/scaffold.js';

/** Ordner eines installierten Pakets, gesucht wie Node es tut: von `from` aufwärts durch `node_modules`. */
export function packageDir(name: string, from: string): string {
	for (let dir = from; ; dir = dirname(dir)) {
		const candidate = join(dir, 'node_modules', name);
		if (existsSync(join(candidate, 'package.json'))) return candidate;
		if (dirname(dir) === dir) throw new Error(`Paket ${name} ist nicht installiert.`);
	}
}

/** Arbeitsordner im Paket: so findet Node die Abhängigkeiten des Workspaces. */
const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));

export interface StarterProject {
	dir: string;
	remove(): Promise<void>;
}

/** Legt den Starter in einem frischen Ordner an, so wie `npm create dealsystem-site`. */
export async function createStarter(): Promise<StarterProject> {
	await mkdir(TMP, { recursive: true });
	const parent = await mkdtemp(join(TMP, 'starter-'));
	const { dir } = await scaffold(join(parent, 'meine-website'));
	return { dir, remove: () => rm(parent, { recursive: true, force: true }) };
}

/**
 * Stellt den Zustand nach `npm install` und `npx dealsystem init` her, ohne Netz:
 * trägt eine Seiten-Kennung ein und schreibt ein Lockfile, wie npm es für die
 * Abhängigkeiten des Starters erzeugt. Die Pakete selbst kommen aus dem Workspace.
 */
export async function simulateInstallAndInit(dir: string): Promise<void> {
	const configFile = join(dir, 'dealsystem.config.ts');
	const config = await readFile(configFile, 'utf8');
	if (!config.includes("siteId: ''")) throw new Error('Der Starter hat keine leere siteId mehr.');
	await writeFile(configFile, config.replace("siteId: ''", "siteId: '11111111-1111-4111-8111-111111111111'"));

	const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
		name: string;
		version: string;
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
	};
	const packages: Record<string, unknown> = {
		'': {
			name: pkg.name,
			version: pkg.version,
			dependencies: pkg.dependencies,
			devDependencies: pkg.devDependencies,
		},
	};
	for (const [name, dev] of [
		...Object.keys(pkg.dependencies).map((n) => [n, false] as const),
		...Object.keys(pkg.devDependencies).map((n) => [n, true] as const),
	]) {
		const installed = JSON.parse(await readFile(join(packageDir(name, dir), 'package.json'), 'utf8')) as {
			version: string;
		};
		const base = name.split('/').pop();
		packages[`node_modules/${name}`] = {
			version: installed.version,
			resolved: `https://registry.npmjs.org/${name}/-/${base}-${installed.version}.tgz`,
			integrity: 'sha512-nur-fuer-den-test',
			...(dev ? { dev: true } : {}),
		};
	}
	await writeFile(
		join(dir, 'package-lock.json'),
		`${JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages }, null, '\t')}\n`,
	);
}

/** Inhalte, wie `npx dealsystem sync` sie aus dem CRM holt. */
export async function writeSnapshot(dir: string, snapshot: unknown): Promise<void> {
	await mkdir(join(dir, '.dealsystem'), { recursive: true });
	await writeFile(join(dir, '.dealsystem/content.json'), JSON.stringify(snapshot));
}

export const FILLED_SNAPSHOT = {
	snapshotVersion: 1,
	site: {
		id: '11111111-1111-4111-8111-111111111111',
		slug: 'muster',
		name: 'Muster Immobilien',
		primaryHost: 'muster-immobilien.de',
		locale: 'de',
	},
	legal: {
		company: 'Muster Immobilien GmbH',
		address: 'Musterstraße 1, 04109 Leipzig',
		email: 'info@muster-immobilien.de',
		phone: null,
		imprintHtml: '<h2>Anbieter</h2><p>Muster Immobilien GmbH, Musterstraße 1, 04109 Leipzig</p>',
		privacyHtml: '<h2>Verantwortlicher</h2><p>Muster Immobilien GmbH</p>',
	},
	tracking: { metaPixelId: '1234567890', googleTagId: 'G-ABCDEF1234' },
	funnels: [{ key: 'kontakt', active: true, fields: [] }],
	slots: {
		'start.hero.titel': { type: 'text', source: 'override', value: 'Wir kaufen Ihr Haus in Leipzig' },
		'start.hero.text': { type: 'textarea', source: 'default', value: null },
	},
	collections: {
		angebote: {
			source: 'cms',
			schemaHash: 'abc',
			entries: [
				{
					slug: 'altbau-suedvorstadt',
					publishedAt: '2026-11-01T09:00:00.000Z',
					data: {
						titel: 'Sanierter Altbau in der Südvorstadt',
						kurztext: 'Drei Zimmer, Balkon, ruhige Lage.',
						ort: 'Leipzig',
						preis: '320.000 €',
						beschreibung: '<p>Helle Wohnung mit <strong>Balkon</strong>.</p>',
					},
					media: {
						bilder: [
							{
								id: 'a1',
								kind: 'image',
								alt: 'Fassade des Altbaus mit Stuck',
								width: 1600,
								height: 1067,
								variants: [
									{ url: '/_ds/media/s1/a1/480.jpg', width: 480, format: 'jpeg' },
									{ url: '/_ds/media/s1/a1/1600.jpg', width: 1600, format: 'jpeg' },
								],
							},
						],
					},
				},
				{
					slug: 'baugrundstueck-markkleeberg',
					publishedAt: '2026-10-01T09:00:00.000Z',
					data: {
						titel: 'Baugrundstück in Markkleeberg',
						kurztext: null,
						ort: null,
						preis: null,
						beschreibung: null,
					},
					media: { bilder: [] },
				},
			],
		},
	},
	// „Google und Teilen“: Titel für /kontakt, Vorgabe-Beschreibung, Favicon, nicht bei Google.
	seo: {
		noindex: true,
		defaults: { title: 'Vorgabe-Titel', description: 'Vorgabe aus dem CRM <b>fett</b>', image: null },
		pages: {
			'/kontakt': { title: 'Jetzt anfragen <script>alert(1)</script>', description: null, image: null },
		},
		favicon: {
			id: 'f1',
			icons: [32, 180, 192, 512].map((size) => ({
				url: `/_ds/media/s1/f1/icon-${size}.png`,
				size,
				type: 'image/png',
			})),
		},
	},
};
