// Inhalts-Schnappschuss für `sync`/`dev` und der Abgleich CRM ↔ dealsystem.config.ts.
// Typen erzeugt die CLI nicht: das SDK leitet sie aus `typeof site` ab (`src/dealsystem.d.ts`).

import { scanSlots } from '@dealsystem/site/vite';
import type { FileSet } from '../check/types.js';
import type { SiteConfigData } from './siteConfig.js';

export const CONTENT_FILE = '.dealsystem/content.json';
export const GLOBAL_TYPES_FILE = 'src/dealsystem.d.ts';

/** Feste Datei aus dem SDK-README: macht Formular- und Sammlungs-Schlüssel zu geprüften Typen. */
export const GLOBAL_TYPES_CONTENT = `// src/dealsystem.d.ts — macht funnel- und collection-Schlüssel zu geprüften Typen
import type site from '../dealsystem.config';

declare global {
	interface DealsystemSiteTypes {
		config: typeof site;
	}
}

export {};
`;

/** JSON mit sortierten Schlüsseln und Tabs, Zeilenumbruch am Ende: gleiche Daten → gleiche Bytes. */
export function canonicalJson(value: unknown): string {
	const sort = (v: unknown): unknown => {
		if (Array.isArray(v)) return v.map(sort);
		if (v && typeof v === 'object') {
			return Object.fromEntries(
				Object.keys(v as Record<string, unknown>)
					.sort()
					.map((k) => [k, sort((v as Record<string, unknown>)[k])]),
			);
		}
		return v;
	};
	return `${JSON.stringify(sort(value), null, '\t')}\n`;
}

/** Slot-Schlüssel, die der Code meldet (mit Aliasen), über den Scanner des SDK. Fehlerhafte Dateien zählen nicht. */
export function codeSlotKeys(files: FileSet): Set<string> {
	const keys = new Set<string>();
	for (const { path } of files.list()) {
		if (!path.startsWith('src/') || !path.endsWith('.svelte')) continue;
		try {
			for (const slot of scanSlots(files.readText(path) ?? '', path)) {
				keys.add(slot.key);
				for (const alias of slot.aliases ?? []) keys.add(alias);
			}
		} catch {
			// `check` (QUA-006) meldet den Fehler mit Fundstelle.
		}
	}
	return keys;
}

export interface DriftItem {
	/** `funnel` | `collection` | `slot` */
	kind: 'funnel' | 'collection' | 'slot';
	key: string;
	/** `config_only`, `crm_only`, `inactive` */
	issue: 'config_only' | 'crm_only' | 'inactive';
	message: string;
	fix: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/** Vergleicht den Stand im CRM (Schnappschuss) mit der Konfiguration und den Slots im Code. */
export function compareSnapshot(
	snapshot: unknown,
	config: SiteConfigData,
	slotKeys: Set<string>,
): DriftItem[] {
	const s = obj(snapshot);
	const out: DriftItem[] = [];
	const crmFunnels = new Map<string, boolean>();
	for (const f of Array.isArray(s.funnels) ? s.funnels : []) {
		const key = obj(f).key;
		if (typeof key === 'string') crmFunnels.set(key, obj(f).active !== false);
	}
	const configFunnels = new Set(config.funnels.map((f) => f.key));
	for (const key of [...configFunnels].sort()) {
		const active = crmFunnels.get(key);
		if (active === undefined) {
			out.push({
				kind: 'funnel',
				key,
				issue: 'config_only',
				message: `Das Formular \`${key}\` gibt es in dealsystem.config.ts, im CRM noch nicht.`,
				fix: 'Nichts zu tun: Es entsteht im CRM beim nächsten Build (`npx dealsystem deploy`) mit Standardverhalten.',
			});
		} else if (!active) {
			out.push({
				kind: 'funnel',
				key,
				issue: 'inactive',
				message: `Das Formular \`${key}\` ist im CRM abgeschaltet; Einsendungen werden abgelehnt.`,
				fix: 'Bitte den Inhaber, das Formular im CRM unter „Website → Formulare“ einzuschalten, oder entferne `<LeadForm>` von der Seite.',
			});
		}
	}
	for (const key of [...crmFunnels.keys()].filter((k) => !configFunnels.has(k)).sort()) {
		out.push({
			kind: 'funnel',
			key,
			issue: 'crm_only',
			message: `Das Formular \`${key}\` gibt es im CRM, aber nicht in dealsystem.config.ts.`,
			fix: `Wenn die Seite es weiter anbieten soll, lege \`funnels['${key}']\` in dealsystem.config.ts wieder an. Sonst nichts zu tun.`,
		});
	}

	const crmCollections = new Set(Object.keys(obj(s.collections)));
	const configCollections = new Set(config.collections.map((c) => c.key));
	for (const key of [...configCollections].filter((k) => !crmCollections.has(k)).sort()) {
		out.push({
			kind: 'collection',
			key,
			issue: 'config_only',
			message: `Die Sammlung \`${key}\` gibt es in dealsystem.config.ts, im CRM nicht.`,
			fix: 'Nach dem nächsten Build (`npx dealsystem deploy`) erscheint sie im CRM unter CMS. Dort Einträge anlegen und veröffentlichen.',
		});
	}
	for (const key of [...crmCollections].filter((k) => !configCollections.has(k)).sort()) {
		out.push({
			kind: 'collection',
			key,
			issue: 'crm_only',
			message: `Die Sammlung \`${key}\` gibt es im CRM, aber nicht in dealsystem.config.ts.`,
			fix: `Wenn die Seite sie zeigen soll, lege \`collections['${key}']\` in dealsystem.config.ts an.`,
		});
	}

	for (const key of Object.keys(obj(s.slots))
		.filter((k) => !slotKeys.has(k))
		.sort()) {
		out.push({
			kind: 'slot',
			key,
			issue: 'crm_only',
			message: `Der Text \`${key}\` ist im CRM gepflegt, wird im Code aber nicht verwendet.`,
			fix: `Wurde der Schlüssel umbenannt, gib dem Slot \`aliases={['${key}']}\`, damit der Text aus dem CRM erhalten bleibt. Sonst nichts zu tun.`,
		});
	}
	return out;
}
