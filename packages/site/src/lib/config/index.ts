import { FIELD_NAME_PATTERN, KEBAB_KEY_MAX_LENGTH, KEBAB_KEY_PATTERN } from '../keys.js';
import type { CollectionFieldType, FieldType, SiteConfig, StandardFieldKey } from '../types.js';

export type {
	CollectionDef,
	CollectionFieldDef,
	CollectionFieldType,
	FieldType,
	FunnelDef,
	FunnelFieldDef,
	SiteConfig,
	StandardFieldKey,
} from '../types.js';

const FIELD_TYPES: readonly FieldType[] = [
	'text',
	'email',
	'tel',
	'textarea',
	'select',
	'multiselect',
	'checkbox',
	'date',
];
const COLLECTION_FIELD_TYPES: readonly CollectionFieldType[] = [
	'text',
	'textarea',
	'richtext',
	'number',
	'url',
	'date',
	'checkbox',
	'select',
	'multiselect',
	'image',
	'gallery',
	'file',
];
const STANDARD_FIELDS: readonly StandardFieldKey[] = [
	'firstName',
	'lastName',
	'email',
	'phone',
	'address1',
	'postalCode',
	'city',
];

/** Ein Fehler in `dealsystem.config.ts`. */
export interface ConfigProblem {
	/** Stelle in der Konfiguration, z. B. `funnels.kontakt.fields[1].type`. */
	path: string;
	/** Was falsch ist und wie es richtig geht. */
	message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKey(kind: string, key: string, path: string, problems: ConfigProblem[]): void {
	if (!KEBAB_KEY_PATTERN.test(key) || key.length > KEBAB_KEY_MAX_LENGTH) {
		problems.push({
			path,
			message: `Der ${kind}-Schlüssel "${key}" ist ungültig. Erlaubt: Kleinbuchstaben, Ziffern und Bindestriche, z. B. "kontakt-anfrage".`,
		});
	}
}

function checkFields(
	fields: unknown,
	allowedTypes: readonly string[],
	path: string,
	problems: ConfigProblem[],
): Record<string, unknown>[] {
	if (!Array.isArray(fields) || fields.length === 0) {
		problems.push({ path, message: 'Trage mindestens ein Feld ein: fields: [{ name: "…", type: "text" }].' });
		return [];
	}
	const seen = new Set<string>();
	const valid: Record<string, unknown>[] = [];
	fields.forEach((field, index) => {
		const at = `${path}[${index}]`;
		if (!isRecord(field)) {
			problems.push({ path: at, message: 'Ein Feld ist ein Objekt mit name und type.' });
			return;
		}
		const { name, type, options } = field;
		if (typeof name !== 'string' || !FIELD_NAME_PATTERN.test(name)) {
			problems.push({
				path: `${at}.name`,
				message: `Der Feldname "${String(name)}" ist ungültig. Erlaubt: Buchstaben, Ziffern und _, beginnend mit einem Buchstaben.`,
			});
			return;
		}
		if (seen.has(name)) {
			problems.push({ path: `${at}.name`, message: `Der Feldname "${name}" kommt doppelt vor.` });
		}
		seen.add(name);
		if (typeof type !== 'string' || !allowedTypes.includes(type)) {
			problems.push({
				path: `${at}.type`,
				message: `Der Feldtyp "${String(type)}" ist unbekannt. Erlaubt: ${allowedTypes.join(', ')}.`,
			});
			return;
		}
		if ((type === 'select' || type === 'multiselect') && (!Array.isArray(options) || options.length === 0)) {
			problems.push({
				path: `${at}.options`,
				message: `Das Feld "${name}" braucht Auswahlwerte: options: ["…", "…"].`,
			});
		}
		valid.push(field);
	});
	return valid;
}

/**
 * Prüft eine Konfiguration und liefert alle Probleme als Liste.
 * Leere Liste heißt: gültig. `defineSite` ruft das auf und wirft; nur eine
 * fehlende `siteId` lässt es durch, damit die Seite vor `dealsystem init` läuft.
 *
 * @example
 * const problems = validateSiteConfig(config);
 * if (problems.length > 0) console.log(problems[0].message);
 */
export function validateSiteConfig(config: unknown): ConfigProblem[] {
	const problems: ConfigProblem[] = [];
	if (!isRecord(config)) {
		return [{ path: '', message: 'defineSite erwartet ein Objekt: defineSite({ siteId: "…" }).' }];
	}
	if (typeof config.siteId !== 'string' || config.siteId.trim() === '') {
		problems.push({ path: 'siteId', message: 'siteId fehlt. Führe `npx dealsystem init` aus.' });
	}

	const funnels = config.funnels ?? {};
	if (!isRecord(funnels)) {
		problems.push({ path: 'funnels', message: 'funnels ist ein Objekt: funnels: { kontakt: { … } }.' });
	} else {
		for (const [key, funnel] of Object.entries(funnels)) {
			const path = `funnels.${key}`;
			checkKey('Formular', key, path, problems);
			if (!isRecord(funnel)) {
				problems.push({ path, message: 'Ein Formular ist ein Objekt mit label und fields.' });
				continue;
			}
			if (typeof funnel.label !== 'string' || funnel.label.trim() === '') {
				problems.push({ path: `${path}.label`, message: 'label fehlt, z. B. label: "Kontakt".' });
			}
			const fields = checkFields(funnel.fields, FIELD_TYPES, `${path}.fields`, problems);
			for (const field of fields) {
				const standard = field.standardField;
				if (standard !== undefined && !STANDARD_FIELDS.includes(standard as StandardFieldKey)) {
					problems.push({
						path: `${path}.fields`,
						message: `standardField "${String(standard)}" am Feld "${String(field.name)}" ist unbekannt. Erlaubt: ${STANDARD_FIELDS.join(', ')}.`,
					});
				}
			}
			const reachable = fields.some((f) => f.standardField === 'email' || f.standardField === 'phone');
			if (fields.length > 0 && !reachable) {
				problems.push({
					path: `${path}.fields`,
					message: `Das Formular "${key}" braucht ein E-Mail- oder Telefonfeld, sonst kann kein Kontakt entstehen. Ergänze z. B. { name: "email", type: "email", standardField: "email", required: true }.`,
				});
			}
		}
	}

	const collections = config.collections ?? {};
	if (!isRecord(collections)) {
		problems.push({
			path: 'collections',
			message: 'collections ist ein Objekt: collections: { angebote: { … } }.',
		});
	} else {
		for (const [key, collection] of Object.entries(collections)) {
			const path = `collections.${key}`;
			checkKey('Sammlungs', key, path, problems);
			if (!isRecord(collection)) {
				problems.push({ path, message: 'Eine Sammlung ist ein Objekt mit label, route und fields.' });
				continue;
			}
			if (collection.source !== undefined && collection.source !== 'cms') {
				problems.push({ path: `${path}.source`, message: 'source kann nur "cms" sein.' });
			}
			if (typeof collection.label !== 'string' || collection.label.trim() === '') {
				problems.push({ path: `${path}.label`, message: 'label fehlt, z. B. label: "Angebote".' });
			}
			if (typeof collection.route !== 'string' || !/^\/.*:slug/.test(collection.route)) {
				problems.push({
					path: `${path}.route`,
					message: 'route fehlt oder enthält kein :slug, z. B. route: "/angebote/:slug".',
				});
			}
			if (collection.indexRoute !== undefined) {
				if (typeof collection.indexRoute !== 'string' || !collection.indexRoute.startsWith('/')) {
					problems.push({
						path: `${path}.indexRoute`,
						message: 'indexRoute beginnt mit /, z. B. "/angebote".',
					});
				}
			}
			const fields = checkFields(collection.fields, COLLECTION_FIELD_TYPES, `${path}.fields`, problems);
			if (collection.slugFrom !== undefined && !fields.some((f) => f.name === collection.slugFrom)) {
				problems.push({
					path: `${path}.slugFrom`,
					message: `slugFrom "${String(collection.slugFrom)}" ist kein Feld dieser Sammlung.`,
				});
			}
		}
	}
	return problems;
}

/**
 * Beschreibt die Seite: Kennung, Sammlungen und Formulare. Steht in
 * `dealsystem.config.ts` im Projektordner. Aus dem Rückgabetyp entstehen die
 * Typen für `funnel` und `collection` — ein Tippfehler ist ein Typfehler.
 * Wirft mit einer Liste aller Probleme, wenn die Konfiguration ungültig ist.
 *
 * @example
 * import { defineSite } from '@dealsystem/site/config';
 *
 * export default defineSite({
 * 	siteId: '…',
 * 	funnels: {
 * 		kontakt: {
 * 			label: 'Kontakt',
 * 			fields: [
 * 				{ name: 'email', type: 'email', standardField: 'email', required: true },
 * 				{ name: 'nachricht', type: 'textarea' },
 * 			],
 * 		},
 * 	},
 * });
 */
export function defineSite<const T extends SiteConfig>(config: T): T {
	// Eine fehlende siteId meldet erst `dealsystem check` (STR-005): vor
	// `dealsystem init` soll die Seite lokal schon laufen.
	const problems = validateSiteConfig(config).filter((p) => p.path !== 'siteId');
	if (problems.length > 0) {
		const lines = problems.map((p) => `  - ${p.path ? `${p.path}: ` : ''}${p.message}`);
		throw new Error(`[dealsystem] dealsystem.config.ts ist ungültig:\n${lines.join('\n')}`);
	}
	return config;
}

/** Pfad, unter dem der Edge die Medien aus dem CRM ausliefert. */
export const MEDIA_PATH_PREFIX = '/_ds/';

/**
 * Für `kit.prerender.handleHttpError` in `svelte.config.js`. Bilder aus dem CRM
 * (`/_ds/media/…`) liefert erst der DealSystem-Server aus; beim Build gibt es
 * sie nicht. Diese Funktion lässt genau das durch und bricht bei jedem anderen
 * toten Link weiter mit einer Fehlermeldung ab.
 *
 * @example
 * // svelte.config.js
 * import adapter from '@sveltejs/adapter-static';
 * import { handleHttpError } from '@dealsystem/site/config';
 *
 * export default {
 * 	kit: {
 * 		adapter: adapter({ fallback: '404.html' }),
 * 		prerender: { handleHttpError },
 * 	},
 * };
 */
export function handleHttpError(details: {
	status: number;
	path: string;
	referrer: string | null;
	message: string;
}): void {
	if (details.path.startsWith(MEDIA_PATH_PREFIX)) return;
	throw new Error(
		`[dealsystem] ${details.message}\n` +
			`Der Link ${details.path}${details.referrer ? ` auf der Seite ${details.referrer}` : ''} führt ins Leere. ` +
			'Lege die Seite an oder korrigiere den Link.',
	);
}
