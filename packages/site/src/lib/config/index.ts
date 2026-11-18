import { FIELD_NAME_PATTERN, KEBAB_KEY_MAX_LENGTH, KEBAB_KEY_PATTERN } from '../keys.js';
import { validateExternal } from '../external/resolve.js';
import { LEADMAGNET_CRM_HINT, LEADMAGNET_LABEL_MAX } from '../leadmagnet.js';
import type { CollectionFieldType, FieldType, SiteConfig, StandardFieldKey } from '../types.js';

export type {
	CollectionDef,
	CollectionFieldDef,
	CollectionFieldType,
	ExternalCategory,
	ExternalCustomDef,
	ExternalDef,
	ExternalDirective,
	ExternalHosts,
	ExternalPreset,
	ExternalPresetDef,
	FieldType,
	FunnelDef,
	FunnelCrmConfig,
	FunnelLeadmagnetConfig,
	ResolvedExternal,
	FunnelFieldDef,
	HiddenFieldSource,
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
	'hidden',
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

/** Grenzen von `funnels.<schlüssel>.crm` (Vertrag mit dem Core, Paket C2). */
export const FUNNEL_CRM_LIMITS = {
	name: 100,
	dealName: 200,
	tags: 20,
	tag: 50,
	subject: 200,
	body: 5000,
	hiddenValue: 500,
} as const;
/** Platzhalter im Deal-Namen (wie `renderDealName` im Core). */
export const DEAL_NAME_PLACEHOLDERS = ['firstName', 'lastName', 'email', 'phone', 'adresse'] as const;
/** Platzhalter in der Eingangsbestätigung (wie `SELF_SITE_CONFIRMATION_PLACEHOLDERS` im Core). */
export const CONFIRMATION_PLACEHOLDERS = ['firstName', 'lastName', 'formName'] as const;
const CRM_KEYS = [
	'createDeal',
	'pipeline',
	'stage',
	'dealName',
	'tags',
	'leadSource',
	'confirmation',
] as const;
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

function checkPlaceholders(
	text: string,
	allowed: readonly string[],
	path: string,
	problems: ConfigProblem[],
): void {
	for (const match of text.matchAll(PLACEHOLDER)) {
		if (!allowed.includes(match[1]!)) {
			problems.push({
				path,
				message: `Den Platzhalter {{${match[1]}}} gibt es nicht. Erlaubt: ${allowed.map((p) => `{{${p}}}`).join(', ')}.`,
			});
		}
	}
}

function checkText(
	value: unknown,
	max: number,
	path: string,
	problems: ConfigProblem[],
	allowEmpty = false,
): boolean {
	if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
		problems.push({ path, message: 'Erwartet wird ein Text.' });
		return false;
	}
	if (value.length > max) {
		problems.push({ path, message: `Höchstens ${max} Zeichen (jetzt ${value.length}).` });
		return false;
	}
	return true;
}

/** Prüft `funnels.<schlüssel>.crm`. Fail-closed: unbekannte Angaben sind ein Fehler, keine stillen Tippfehler. */
function checkCrm(crm: unknown, path: string, problems: ConfigProblem[]): void {
	if (crm === undefined) return;
	if (!isRecord(crm)) {
		problems.push({
			path,
			message: 'crm ist ein Objekt, z. B. crm: { createDeal: true, pipeline: "Verkäufer" }.',
		});
		return;
	}
	for (const key of Object.keys(crm)) {
		if (!(CRM_KEYS as readonly string[]).includes(key)) {
			problems.push({
				path: `${path}.${key}`,
				message: `Unbekannte Angabe "${key}". Erlaubt: ${CRM_KEYS.join(', ')}.`,
			});
		}
	}
	const L = FUNNEL_CRM_LIMITS;
	if (crm.createDeal !== undefined && typeof crm.createDeal !== 'boolean') {
		problems.push({ path: `${path}.createDeal`, message: 'createDeal ist true oder false.' });
	}
	for (const key of ['pipeline', 'stage', 'leadSource'] as const) {
		if (crm[key] !== undefined) checkText(crm[key], L.name, `${path}.${key}`, problems);
	}
	if (crm.stage !== undefined && crm.pipeline === undefined) {
		problems.push({
			path: `${path}.stage`,
			message: 'Eine Phase gehört zu einer Pipeline: Gib auch pipeline an.',
		});
	}
	if ((crm.pipeline !== undefined || crm.dealName !== undefined) && crm.createDeal !== true) {
		problems.push({
			path: `${path}.createDeal`,
			message: 'pipeline und dealName wirken nur mit createDeal: true.',
		});
	}
	if (crm.dealName !== undefined && checkText(crm.dealName, L.dealName, `${path}.dealName`, problems)) {
		checkPlaceholders(crm.dealName as string, DEAL_NAME_PLACEHOLDERS, `${path}.dealName`, problems);
	}
	if (crm.tags !== undefined) {
		if (!Array.isArray(crm.tags))
			problems.push({ path: `${path}.tags`, message: 'tags ist eine Liste: tags: ["Website"].' });
		else {
			if (crm.tags.length > L.tags)
				problems.push({ path: `${path}.tags`, message: `Höchstens ${L.tags} Tags.` });
			crm.tags.forEach((tag, i) => checkText(tag, L.tag, `${path}.tags[${i}]`, problems));
		}
	}
	const confirmation = crm.confirmation;
	if (confirmation !== undefined) {
		const at = `${path}.confirmation`;
		if (!isRecord(confirmation) || typeof confirmation.enabled !== 'boolean') {
			problems.push({ path: at, message: 'confirmation ist ein Objekt mit enabled: true oder false.' });
		} else {
			for (const key of Object.keys(confirmation)) {
				if (!['enabled', 'subject', 'body'].includes(key))
					problems.push({
						path: `${at}.${key}`,
						message: `Unbekannte Angabe "${key}". Erlaubt: enabled, subject, body.`,
					});
			}
			for (const [key, max] of [
				['subject', L.subject],
				['body', L.body],
			] as const) {
				const value = confirmation[key];
				if (value === undefined) continue;
				if (!checkText(value, max, `${at}.${key}`, problems)) continue;
				checkPlaceholders(value as string, CONFIRMATION_PLACEHOLDERS, `${at}.${key}`, problems);
				if (/https?:\/\/|www\.|<[a-z!/]/i.test(value as string)) {
					problems.push({
						path: `${at}.${key}`,
						message: 'Die Bestätigung ist Klartext ohne Links und ohne HTML.',
					});
				}
			}
		}
	}
}

/** Schlüssel, die nach Datei oder Link aussehen. Die Datei gehört ins CRM, nie in den Code. */
const LEADMAGNET_FILE_KEY =
	/url|uri|href|link|src|file|datei|pdf|path|pfad|download|attachment|anhang|asset|media/i;
/** Ein Link im Namen der Datei: `https://…`, `//…`, `www.…`. */
const LEADMAGNET_LINK_IN_LABEL = /[a-z][a-z0-9+.-]*:\/\/|^\/\/|\bwww\./i;

/** Prüft `funnels.<schlüssel>.leadmagnet`. Nur die Ankündigung; Datei, Pfad oder Link sind ein Fehler. */
function checkLeadmagnet(leadmagnet: unknown, path: string, problems: ConfigProblem[]): void {
	if (leadmagnet === undefined) return;
	if (!isRecord(leadmagnet)) {
		problems.push({
			path,
			message: `leadmagnet ist ein Objekt, z. B. leadmagnet: { label: "Ratgeber Immobilienverkauf" }. ${LEADMAGNET_CRM_HINT}`,
		});
		return;
	}
	for (const key of Object.keys(leadmagnet)) {
		if (key === 'label') continue;
		problems.push({
			path: `${path}.${key}`,
			message: LEADMAGNET_FILE_KEY.test(key)
				? `Im Code steht keine Datei und kein Link, nur label. ${LEADMAGNET_CRM_HINT}`
				: `Unbekannte Angabe "${key}". Erlaubt ist nur label.`,
		});
	}
	const label = leadmagnet.label;
	if (typeof label !== 'string' || label.trim() === '') {
		problems.push({
			path: `${path}.label`,
			message: 'label fehlt: Wie heißt die Datei für Besucher? Z. B. label: "Ratgeber Immobilienverkauf".',
		});
		return;
	}
	const trimmed = label.trim();
	if (trimmed.length > LEADMAGNET_LABEL_MAX) {
		problems.push({
			path: `${path}.label`,
			message: `Höchstens ${LEADMAGNET_LABEL_MAX} Zeichen (jetzt ${trimmed.length}).`,
		});
	} else if (LEADMAGNET_LINK_IN_LABEL.test(trimmed)) {
		problems.push({
			path: `${path}.label`,
			message: `label ist der Name der Datei, kein Link. ${LEADMAGNET_CRM_HINT}`,
		});
	}
}

/** Prüft `from` eines versteckten Feldes. */
function checkHidden(field: Record<string, unknown>, path: string, problems: ConfigProblem[]): void {
	const from = field.from;
	const example =
		'z. B. from: { query: "partner" }, from: { utm: "campaign" } oder from: { value: "Bewertungsrechner" }';
	if (!isRecord(from) || Object.keys(from).length !== 1) {
		problems.push({
			path: `${path}.from`,
			message: `Ein verstecktes Feld braucht genau eine Quelle, ${example}.`,
		});
		return;
	}
	const source = from as Partial<Record<'query' | 'utm' | 'value', unknown>>;
	if ('query' in source) {
		if (typeof source.query !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(source.query))
			problems.push({
				path: `${path}.from.query`,
				message: 'Der Name des URL-Parameters: Buchstaben, Ziffern, _ . -, höchstens 64 Zeichen.',
			});
		else if (/^utm_/.test(source.query))
			problems.push({
				path: `${path}.from.query`,
				message: `UTM-Angaben holst du mit from: { utm: "${source.query.slice(4)}" }.`,
			});
	} else if ('utm' in source) {
		if (!(UTM_KEYS as readonly unknown[]).includes(source.utm))
			problems.push({ path: `${path}.from.utm`, message: `Erlaubt: ${UTM_KEYS.join(', ')}.` });
	} else if ('value' in source) {
		checkText(source.value, FUNNEL_CRM_LIMITS.hiddenValue, `${path}.from.value`, problems);
	} else {
		problems.push({ path: `${path}.from`, message: `Unbekannte Quelle. ${example}.` });
	}
	if (field.standardField !== undefined) {
		problems.push({
			path: `${path}.standardField`,
			message: 'Ein verstecktes Feld füllt nie ein Kontaktfeld.',
		});
	}
	if (field.required !== undefined) {
		problems.push({
			path: `${path}.required`,
			message: 'Ein verstecktes Feld kann nicht Pflicht sein; der Besucher sieht es nicht.',
		});
	}
}

/**
 * So viele Felder eines Formulars übernimmt der Core aus dem Manifest (`normalizeFieldDefs` in
 * `src/lib/domain/selfSite.ts`, Vertrag `contract/funnel-code-config.md`). Weitere Felder kommen mit der Anfrage
 * zwar an, werden aber nicht geprüft und lassen sich keinem Feld im CRM zuordnen; sie landen nur in der Notiz.
 * Versteckte Felder zählen mit. `dealsystem check` warnt darüber (`QUA-010`).
 */
export const FUNNEL_MANIFEST_MAX_FIELDS = 50;

/**
 * Höchstzahl der Werte einer Anfrage (`SITE_LEAD_MAX_FIELDS` im Core, `data` in `site-api.v1.json`). Mehr nimmt
 * die Site-API nicht an (422). Darüber ist die Konfiguration ein Fehler (`STR-005`).
 */
export const MAX_FUNNEL_FIELDS = 60;

/** Höchstzahl der Terminbuchungen je Seite (`SELF_SITE_MANIFEST_BOOKINGS_MAX` im Core; mehr übernimmt er nicht). */
export const MAX_BOOKINGS = 20;
/** Länge eines Buchungs-Schlüssels (`SELF_SITE_BOOKING_KEY_PATTERN` im Core: höchstens 50 Zeichen). */
export const BOOKING_KEY_MAX_LENGTH = 50;
/** Länge von `label` einer Buchung. */
export const BOOKING_LABEL_MAX_LENGTH = 100;

/** Prüft `booking` in `dealsystem.config.ts`. */
function validateBooking(booking: unknown): ConfigProblem[] {
	const problems: ConfigProblem[] = [];
	if (booking === undefined) return problems;
	if (!isRecord(booking)) {
		return [
			{
				path: 'booking',
				message: 'booking ist ein Objekt: booking: { erstgespraech: { label: "Erstgespräch" } }.',
			},
		];
	}
	const entries = Object.entries(booking);
	if (entries.length > MAX_BOOKINGS) {
		problems.push({ path: 'booking', message: `Höchstens ${MAX_BOOKINGS} Terminbuchungen je Seite.` });
	}
	for (const [key, def] of entries) {
		const path = `booking.${key}`;
		if (!KEBAB_KEY_PATTERN.test(key) || key.length > BOOKING_KEY_MAX_LENGTH) {
			problems.push({
				path,
				message: `Der Buchungs-Schlüssel "${key}" ist ungültig. Erlaubt: Kleinbuchstaben, Ziffern und Bindestriche, höchstens ${BOOKING_KEY_MAX_LENGTH} Zeichen, z. B. "erstgespraech".`,
			});
		}
		if (!isRecord(def)) {
			problems.push({
				path,
				message: 'Eine Buchung ist ein Objekt, z. B. { label: "Erstgespräch", eventType: "erstgespraech" }.',
			});
			continue;
		}
		for (const name of Object.keys(def)) {
			if (name !== 'label' && name !== 'eventType') {
				problems.push({
					path: `${path}.${name}`,
					message: `Unbekannte Angabe "${name}". Erlaubt: label, eventType.`,
				});
			}
		}
		if (
			def.label !== undefined &&
			(typeof def.label !== 'string' ||
				def.label.trim() === '' ||
				def.label.length > BOOKING_LABEL_MAX_LENGTH)
		) {
			problems.push({
				path: `${path}.label`,
				message: `label ist ein Text mit 1 bis ${BOOKING_LABEL_MAX_LENGTH} Zeichen, z. B. label: "Erstgespräch".`,
			});
		}
		if (
			def.eventType !== undefined &&
			(typeof def.eventType !== 'string' ||
				!KEBAB_KEY_PATTERN.test(def.eventType) ||
				def.eventType.length > 100)
		) {
			problems.push({
				path: `${path}.eventType`,
				message: 'eventType ist der Kurzname (Slug) einer Terminart aus dem CRM, z. B. "erstgespraech".',
			});
		}
	}
	return problems;
}

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
				message: `Der Feldname "${String(name)}" ist ungültig. Erlaubt: Buchstaben, Ziffern und _, beginnend mit einem Buchstaben, höchstens 64 Zeichen.`,
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
			fields.forEach((field, index) => {
				if (field.type === 'hidden') checkHidden(field, `${path}.fields[${index}]`, problems);
				else if (field.from !== undefined)
					problems.push({
						path: `${path}.fields[${index}].from`,
						message: 'from gibt es nur bei type: "hidden".',
					});
			});
			checkCrm(funnel.crm, `${path}.crm`, problems);
			checkLeadmagnet(funnel.leadmagnet, `${path}.leadmagnet`, problems);
			for (const field of fields) {
				const standard = field.standardField;
				if (standard !== undefined && !STANDARD_FIELDS.includes(standard as StandardFieldKey)) {
					problems.push({
						path: `${path}.fields`,
						message: `standardField "${String(standard)}" am Feld "${String(field.name)}" ist unbekannt. Erlaubt: ${STANDARD_FIELDS.join(', ')}.`,
					});
				}
			}
			if (fields.length > MAX_FUNNEL_FIELDS) {
				problems.push({
					path: `${path}.fields`,
					message: `Das Formular "${key}" hat ${fields.length} Felder. Erlaubt sind höchstens ${MAX_FUNNEL_FIELDS}.`,
				});
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
	problems.push(...validateExternal(config.external));
	problems.push(...validateBooking(config.booking));
	return problems;
}

/**
 * Beschreibt die Seite: Kennung, Sammlungen, Formulare und fremde Dienste (`external`). Steht in
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

/** Adresse der Site-API, wenn der Build keine nennt. */
export const DEFAULT_API_ORIGIN = 'https://app.dealsystem.io';

/**
 * Für `connect-src` in der Content-Security-Policy von `svelte.config.js`:
 * die Adresse, unter der die Seite ihre Formulare an DealSystem schickt. Der
 * Server, der die Seite erzeugt, nennt sie in `PUBLIC_DEALSYSTEM_API`; ohne
 * Angabe gilt die Adresse von DealSystem. So passt die Seite auch dann, wenn
 * sie für eine Test-Umgebung erzeugt wird.
 *
 * @example
 * // svelte.config.js
 * import { siteApiOrigin } from '@dealsystem/site/config';
 *
 * // … in kit.csp.directives:
 * // 'connect-src': ['self', siteApiOrigin()],
 */
export function siteApiOrigin(): string {
	const value = process.env.PUBLIC_DEALSYSTEM_API?.trim();
	if (!value) return DEFAULT_API_ORIGIN;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : DEFAULT_API_ORIGIN;
	} catch {
		return DEFAULT_API_ORIGIN;
	}
}

// Fremde Dienste: dieselben Funktionen nutzen Vite-Plugin, `dealsystemCsp()` und `dealsystem check`.
export {
	EXTERNAL_CATEGORIES,
	directivesOf,
	resolveEmbedSource,
	resolveExternal,
	scriptSourceProblem,
	validateExternal,
	type EmbedSource,
	type ExternalProblem,
} from '../external/resolve.js';
export {
	EXTERNAL_DIRECTIVES,
	SHARED_SUFFIXES,
	WILDCARD_DIRECTIVES,
	externalUrl,
	hostSourceMatches,
	hostSourceProblem,
	isLocalPath,
	parseHostSource,
} from '../external/hosts.js';
export {
	EXTERNAL_PRESETS_CONTRACT_VERSION,
	PRESETS,
	PRESET_NAMES,
	externalPresetsContract,
	externalPresetsContractText,
	isPreset,
	type EmbedSettings,
	type PresetContractEntry,
	type PresetDef,
} from '../external/presets.js';
export {
	CSP_DIRECTIVE,
	GOOGLE_ADS_CSP,
	MAP_EMBED_ORIGIN,
	TRACKING_CSP,
	buildCspDirectives,
	isGoogleAdsId,
} from '../external/csp.js';
