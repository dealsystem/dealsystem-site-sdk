// `external` aus dealsystem.config.ts: prüfen, Vorlagen auflösen, Adressen der Bausteine gegen die Deklaration
// abgleichen. Läuft im Build (Vite-Plugin, svelte.config.js), in `dealsystem check` und im Browser.

import { KEBAB_KEY_MAX_LENGTH, KEBAB_KEY_PATTERN } from '../keys.js';
import type {
	ExternalCategory,
	ExternalDef,
	ExternalDirective,
	ExternalHosts,
	ResolvedExternal,
} from '../types.js';
import {
	EXTERNAL_DIRECTIVES,
	externalUrl,
	hostSourceMatches,
	hostSourceProblem,
	isLocalPath,
	MAX_EXTERNAL_ENTRIES,
	MAX_HOSTS_PER_DIRECTIVE,
} from './hosts.js';
import { CUSTOM_EMBED, isPreset, PRESET_NAMES, PRESETS, type EmbedSettings } from './presets.js';

export const EXTERNAL_CATEGORIES: readonly ExternalCategory[] = ['statistics', 'marketing', 'media'];

const TEXT_KEYS = ['provider', 'purpose', 'privacyUrl'] as const;
const CUSTOM_KEYS = ['category', ...TEXT_KEYS, ...EXTERNAL_DIRECTIVES];

/** Höchstlänge von Anbieter und Zweck (steht im Cookie-Hinweis). */
export const EXTERNAL_TEXT_MAX = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ein Problem in `external`; `path` wie bei `validateSiteConfig`, z. B. `external.chat.script[0]`. */
export interface ExternalProblem {
	path: string;
	message: string;
}

/**
 * Prüft `external`. Leere Liste heißt gültig. Wird von `validateSiteConfig` aufgerufen; die Meldungen
 * landen in `dealsystem check` unter SEC-005, weil sie die Sicherheitsregeln der Seite bestimmen.
 */
export function validateExternal(external: unknown): ExternalProblem[] {
	const problems: ExternalProblem[] = [];
	if (external === undefined) return problems;
	if (!isRecord(external)) {
		return [
			{
				path: 'external',
				message: "external ist ein Objekt: external: { video: { preset: 'youtube' } }.",
			},
		];
	}
	const entries = Object.entries(external);
	if (entries.length > MAX_EXTERNAL_ENTRIES) {
		problems.push({
			path: 'external',
			message: `external hat ${entries.length} Einträge. Erlaubt sind höchstens ${MAX_EXTERNAL_ENTRIES}.`,
		});
	}
	for (const [id, def] of entries) {
		const path = `external.${id}`;
		if (!KEBAB_KEY_PATTERN.test(id) || id.length > KEBAB_KEY_MAX_LENGTH) {
			problems.push({
				path,
				message: `Der Schlüssel "${id}" ist ungültig. Erlaubt: Kleinbuchstaben, Ziffern und Bindestriche, z. B. "video" oder "chat".`,
			});
		}
		if (!isRecord(def)) {
			problems.push({
				path,
				message:
					"Ein fremder Dienst ist ein Objekt, z. B. { preset: 'youtube' } oder { category: 'marketing', script: ['https://…'] }.",
			});
			continue;
		}
		if ('preset' in def) {
			if (!isPreset(def.preset)) {
				problems.push({
					path: `${path}.preset`,
					message: `Die Vorlage "${String(def.preset)}" gibt es nicht. Vorhanden: ${PRESET_NAMES.join(', ')}. Andere Dienste beschreibst du selbst mit category und Hosts.`,
				});
			}
			const extra = Object.keys(def).filter((k) => k !== 'preset');
			if (extra.length > 0) {
				problems.push({
					path,
					message: `Bei einer Vorlage steht nur preset; Kategorie, Anbieter und Hosts legt die Vorlage fest. Entferne: ${extra.join(', ')}.`,
				});
			}
			continue;
		}
		const unknown = Object.keys(def).filter((k) => !CUSTOM_KEYS.includes(k));
		if (unknown.length > 0) {
			problems.push({
				path,
				message: `Unbekannte Angabe: ${unknown.join(', ')}. Erlaubt: ${CUSTOM_KEYS.join(', ')} oder nur preset.`,
			});
		}
		const category = def.category;
		if (!EXTERNAL_CATEGORIES.includes(category as ExternalCategory)) {
			const necessary =
				typeof category === 'string' && /^(necessary|notwendig|essential|required)$/i.test(category);
			problems.push({
				path: `${path}.category`,
				message: necessary
					? `"${category}" gibt es für eigene Dienste nicht: Fremdes lädt immer erst nach der Einwilligung. Wähle statistics, marketing oder media.`
					: `category fehlt oder ist unbekannt. Erlaubt: ${EXTERNAL_CATEGORIES.join(', ')} (Statistik, Marketing, externe Inhalte wie Videos).`,
			});
		}
		for (const key of TEXT_KEYS) {
			const value = def[key];
			if (value === undefined) continue;
			if (typeof value !== 'string' || value.trim() === '' || value.length > EXTERNAL_TEXT_MAX) {
				problems.push({
					path: `${path}.${key}`,
					message: `${key} ist ein Text mit höchstens ${EXTERNAL_TEXT_MAX} Zeichen.`,
				});
			} else if (key === 'privacyUrl' && !/^https:\/\/[^\s]+$/.test(value)) {
				problems.push({
					path: `${path}.privacyUrl`,
					message:
						'privacyUrl ist die Adresse der Datenschutzerklärung des Anbieters und beginnt mit https://.',
				});
			}
		}
		let hostCount = 0;
		for (const directive of EXTERNAL_DIRECTIVES) {
			const list = def[directive];
			if (list === undefined) continue;
			if (!Array.isArray(list)) {
				problems.push({
					path: `${path}.${directive}`,
					message: `${directive} ist eine Liste von Hosts, z. B. ${directive}: ['https://js.example.com'].`,
				});
				continue;
			}
			if (list.length > MAX_HOSTS_PER_DIRECTIVE) {
				problems.push({
					path: `${path}.${directive}`,
					message: `${directive} hat ${list.length} Hosts. Erlaubt sind höchstens ${MAX_HOSTS_PER_DIRECTIVE}.`,
				});
			}
			list.forEach((source, index) => {
				const problem = hostSourceProblem(source, directive);
				if (problem) problems.push({ path: `${path}.${directive}[${index}]`, message: problem });
			});
			hostCount += list.length;
		}
		if (hostCount === 0) {
			problems.push({
				path,
				message: `Der Dienst "${id}" nennt keinen Host. Trage mindestens einen ein, z. B. script: ['https://js.example.com'].`,
			});
		}
	}
	return problems;
}

function emptyHosts(): ExternalHosts {
	return { script: [], connect: [], img: [], frame: [], media: [], style: [], font: [] };
}

function sortedUnique(values: readonly unknown[] | undefined): string[] {
	return [...new Set((values ?? []).filter((v): v is string => typeof v === 'string'))].sort();
}

/**
 * Löst die Vorlagen auf und bringt jeden Eintrag in eine feste Form (alle Direktiven, sortiert). Nach `id`
 * sortiert. Erwartet eine gültige Konfiguration; ungültige Einträge werden übersprungen.
 */
export function resolveExternal(
	external: Readonly<Record<string, ExternalDef>> | undefined,
): ResolvedExternal[] {
	if (!isRecord(external)) return [];
	const out: ResolvedExternal[] = [];
	for (const [id, def] of Object.entries(external)) {
		if (!isRecord(def)) continue;
		const hosts = emptyHosts();
		if ('preset' in def) {
			if (!isPreset(def.preset)) continue;
			const preset = PRESETS[def.preset];
			for (const directive of EXTERNAL_DIRECTIVES) hosts[directive] = sortedUnique(preset.hosts[directive]);
			out.push({
				id,
				preset: def.preset,
				category: preset.category,
				provider: preset.provider,
				purpose: preset.purpose,
				privacyUrl: preset.privacyUrl,
				hosts,
			});
			continue;
		}
		const custom = def as Record<string, unknown>;
		if (!EXTERNAL_CATEGORIES.includes(custom.category as ExternalCategory)) continue;
		for (const directive of EXTERNAL_DIRECTIVES) {
			const list = custom[directive];
			hosts[directive] = Array.isArray(list) ? sortedUnique(list) : [];
		}
		const text = (key: string): string | null =>
			typeof custom[key] === 'string' && (custom[key] as string).trim() !== ''
				? (custom[key] as string).trim()
				: null;
		out.push({
			id,
			preset: null,
			category: custom.category as ExternalCategory,
			provider: text('provider'),
			purpose: text('purpose'),
			privacyUrl: text('privacyUrl'),
			hosts,
		});
	}
	return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Ergebnis für `<Embed>`: fertige Adresse des iframes oder der Grund, warum sie nicht passt. */
export type EmbedSource =
	{ ok: true; src: string; original: string; settings: EmbedSettings } | { ok: false; message: string };

/**
 * Prüft die Adresse eines `<Embed>` gegen die Deklaration. Bei einer Vorlage wird eine kopierte Adresse
 * (z. B. `https://www.youtube.com/watch?v=…`) in die Form der Einbettung gebracht.
 */
export function resolveEmbedSource(entry: ResolvedExternal, src: string): EmbedSource {
	const url = externalUrl(src);
	if (!url || url.protocol !== 'https:') {
		return { ok: false, message: `src="${src}" ist keine https-Adresse.` };
	}
	if (entry.preset) {
		const preset = PRESETS[entry.preset];
		const normalized = preset.normalize(url);
		if (!normalized) {
			return {
				ok: false,
				message: `src="${src}" passt nicht zur Vorlage ${entry.preset}. ${PRESET_SRC_HINT[entry.preset]}`,
			};
		}
		return {
			ok: true,
			src: normalized,
			original: preset.original(new URL(normalized)),
			settings: preset.embed,
		};
	}
	if (entry.hosts.frame.length === 0) {
		return {
			ok: false,
			message: `Der Dienst "${entry.id}" hat keine frame-Hosts. Trage den Host unter external.${entry.id}.frame ein.`,
		};
	}
	if (!entry.hosts.frame.some((h) => hostSourceMatches(h, url))) {
		return {
			ok: false,
			message: `src="${src}": Der Host ${url.host} steht nicht unter external.${entry.id}.frame (${entry.hosts.frame.join(', ')}).`,
		};
	}
	return { ok: true, src: url.href, original: url.href, settings: CUSTOM_EMBED };
}

const PRESET_SRC_HINT: Record<string, string> = {
	youtube:
		'Erwartet wird eine Video-Adresse von YouTube, z. B. https://www.youtube.com/watch?v=… oder https://youtu.be/….',
	vimeo: 'Erwartet wird eine Video-Adresse von Vimeo, z. B. https://vimeo.com/123456789.',
	'google-maps':
		'Erwartet wird die Adresse aus Google Maps → Teilen → Karte einbetten (https://www.google.com/maps/embed?pb=…).',
	calendly: 'Erwartet wird die Adresse deiner Calendly-Seite, z. B. https://calendly.com/name/termin.',
};

/** Prüft die Adresse eines `<ExternalScript>`: eigener Pfad aus `static/` oder ein `script`-Host der Deklaration. */
export function scriptSourceProblem(entry: ResolvedExternal, src: string): string | null {
	if (isLocalPath(src)) return null;
	const url = externalUrl(src);
	if (!url || url.protocol !== 'https:') {
		return `src="${src}" ist weder ein Pfad der Seite (/scripts/datei.js) noch eine https-Adresse.`;
	}
	if (!entry.hosts.script.some((h) => hostSourceMatches(h, url))) {
		return `src="${src}": Der Host ${url.host} steht nicht unter external.${entry.id}.script${entry.hosts.script.length ? ` (${entry.hosts.script.join(', ')})` : ''}.`;
	}
	return null;
}

/** Direktiven, die ein Eintrag öffnet, für Meldungen. */
export function directivesOf(entry: ResolvedExternal): ExternalDirective[] {
	return EXTERNAL_DIRECTIVES.filter((d) => entry.hosts[d].length > 0);
}
