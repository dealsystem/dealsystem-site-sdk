// Legt aus der Vorlage ein neues Projekt an. Ohne Abhängigkeiten, ohne Netz.
import { cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ordner mit der Vorlage. */
export const TEMPLATE_DIR = fileURLToPath(new URL('../template', import.meta.url));

/** Ein Fehler, den der Aufrufer dem Menschen so zeigen kann. */
export class ScaffoldError extends Error {}

/** Macht aus einem Ordnernamen einen gültigen Paketnamen. */
export function packageNameFrom(dir) {
	const name = basename(resolve(dir))
		.toLowerCase()
		.replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c])
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return name || 'meine-website';
}

/**
 * Kopiert die Vorlage nach `targetDir`. Der Ordner muss leer sein oder fehlen;
 * vorhandene Dateien werden nie überschrieben.
 *
 * @param {string} targetDir
 * @returns {Promise<{ dir: string; name: string }>}
 */
export async function scaffold(targetDir) {
	const dir = resolve(targetDir);
	let existing = [];
	try {
		existing = await readdir(dir);
	} catch {
		// Ordner fehlt: wird angelegt.
	}
	const blocking = existing.filter((entry) => entry !== '.git');
	if (blocking.length > 0) {
		throw new ScaffoldError(
			`Der Ordner ${dir} ist nicht leer (${blocking.slice(0, 3).join(', ')}${blocking.length > 3 ? ', …' : ''}). ` +
				'Wähle einen neuen Ordnernamen, z. B. `npm create dealsystem-site meine-website`.',
		);
	}
	await mkdir(dir, { recursive: true });
	await cp(TEMPLATE_DIR, dir, { recursive: true });
	// npm lässt `.gitignore` beim Veröffentlichen weg, deshalb liegt sie unter anderem Namen in der Vorlage.
	await rename(join(dir, '_gitignore'), join(dir, '.gitignore'));

	const name = packageNameFrom(dir);
	const packageFile = join(dir, 'package.json');
	const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
	pkg.name = name;
	await writeFile(packageFile, `${JSON.stringify(pkg, null, '\t')}\n`);
	return { dir, name };
}
