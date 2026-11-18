// Vorlagen für fremde Dienste: von DealSystem gepflegt und geprüft. Eine Vorlage legt Kategorie, Anbieter,
// Zweck, Datenschutz-Link, Hosts und die Einstellungen des iframes fest. Neue Vorlagen nur nach Prüfung:
// kein Laden vor der Einwilligung, kein Bedarf an `unsafe-eval`, Hosts so eng wie möglich.
//
// Auch Nocookie-Modus und `dnt=1` ersetzen die Einwilligung nicht (Konzept Phase 2, Abschnitt 4): Alle
// Vorlagen laden erst nach „Externe Inhalte“ (`media`).

import type { ExternalCategory, ExternalDirective, ExternalHosts, ExternalPreset } from '../types.js';
import { EXTERNAL_DIRECTIVES } from './hosts.js';

/** Wie `<Embed>` einen Dienst als iframe einbettet. */
export interface EmbedSettings {
	/** Werte für `sandbox`. Nie `allow-top-navigation`: ein Rahmen darf die Seite nicht wegleiten. */
	sandbox: string;
	/** Werte für `allow` (Permissions Policy). */
	allow: string;
	allowFullscreen: boolean;
	referrerPolicy: 'no-referrer' | 'strict-origin-when-cross-origin';
	/** Beschriftung der Schaltfläche im Platzhalter. */
	loadLabel: string;
	/** Was eingebettet ist, für den Text im Platzhalter („Das Video kommt von …“). */
	noun: string;
	/** Seitenverhältnis (`aspect-ratio`), wenn keine Höhe vorgegeben ist. */
	aspect: string | null;
	/** Feste Höhe, z. B. für Terminbuchung. */
	height: string | null;
}

export interface PresetDef {
	category: ExternalCategory;
	provider: string;
	purpose: string;
	privacyUrl: string;
	hosts: Partial<Record<ExternalDirective, readonly string[]>>;
	embed: EmbedSettings;
	/** Bringt eine vom Kunden kopierte Adresse in die Form der Einbettung; `null`, wenn sie nicht passt. */
	normalize(src: URL): string | null;
	/** Adresse für den Link „beim Anbieter öffnen“. */
	original(embedSrc: URL): string;
}

const VIDEO_EMBED: Omit<EmbedSettings, 'loadLabel' | 'noun'> = {
	sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
	allow:
		'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
	allowFullscreen: true,
	// YouTube spielt ohne Referrer nicht ab (Fehler 153).
	referrerPolicy: 'strict-origin-when-cross-origin',
	aspect: '16 / 9',
	height: null,
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = [
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
];
const YOUTUBE_PARAMS = [
	'start',
	'end',
	'list',
	'loop',
	'playlist',
	'rel',
	'controls',
	'cc_load_policy',
	'hl',
];

function youtubeSeconds(value: string | null): string | null {
	if (!value) return null;
	if (/^\d+$/.test(value)) return value;
	const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
	if (!m || (!m[1] && !m[2] && !m[3])) return null;
	return String(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
}

function normalizeYoutube(url: URL): string | null {
	const host = url.hostname.toLowerCase();
	const parts = url.pathname.split('/').filter(Boolean);
	let id: string | null = null;
	if (host === 'youtu.be') id = parts[0] ?? null;
	else if (YOUTUBE_HOSTS.includes(host)) {
		if (parts[0] === 'watch') id = url.searchParams.get('v');
		else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
	}
	if (!id || (id !== 'videoseries' && !YOUTUBE_ID.test(id))) return null;
	if (id === 'videoseries' && !url.searchParams.get('list')) return null;
	const out = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
	for (const key of YOUTUBE_PARAMS) {
		const value = url.searchParams.get(key);
		if (value && /^[A-Za-z0-9_,-]{1,64}$/.test(value)) out.searchParams.set(key, value);
	}
	const t = youtubeSeconds(url.searchParams.get('t'));
	if (t && !out.searchParams.has('start')) out.searchParams.set('start', t);
	return out.href;
}

function normalizeVimeo(url: URL): string | null {
	const host = url.hostname.toLowerCase();
	const parts = url.pathname.split('/').filter(Boolean);
	let id: string | undefined;
	let hash: string | null = url.searchParams.get('h');
	if (host === 'player.vimeo.com' && parts[0] === 'video') id = parts[1];
	else if (host === 'vimeo.com' || host === 'www.vimeo.com') {
		id = parts[0];
		if (parts[1] && /^[0-9a-f]{6,20}$/.test(parts[1])) hash = parts[1];
	}
	if (!id || !/^\d{1,12}$/.test(id)) return null;
	const out = new URL(`https://player.vimeo.com/video/${id}`);
	if (hash && /^[0-9a-f]{6,20}$/.test(hash)) out.searchParams.set('h', hash);
	// Vimeo erfasst mit dnt=1 keine Sitzungsdaten; die Einwilligung ersetzt das nicht.
	out.searchParams.set('dnt', '1');
	return out.href;
}

export const PRESETS: Readonly<Record<ExternalPreset, PresetDef>> = {
	youtube: {
		category: 'media',
		provider: 'Google Ireland Limited, Irland (YouTube)',
		purpose: 'Zeigt eingebettete Videos von YouTube.',
		privacyUrl: 'https://policies.google.com/privacy',
		hosts: { frame: ['https://www.youtube-nocookie.com'] },
		embed: { ...VIDEO_EMBED, loadLabel: 'Video laden', noun: 'Das Video' },
		normalize: normalizeYoutube,
		original: (src) => {
			const id = src.pathname.split('/').filter(Boolean)[1] ?? '';
			const list = src.searchParams.get('list');
			return id === 'videoseries' && list
				? `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`
				: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
		},
	},
	vimeo: {
		category: 'media',
		provider: 'Vimeo.com, Inc., USA',
		purpose: 'Zeigt eingebettete Videos von Vimeo.',
		privacyUrl: 'https://vimeo.com/privacy',
		hosts: { frame: ['https://player.vimeo.com'] },
		embed: {
			...VIDEO_EMBED,
			allow: 'autoplay; fullscreen; picture-in-picture; clipboard-write',
			loadLabel: 'Video laden',
			noun: 'Das Video',
		},
		normalize: normalizeVimeo,
		original: (src) => `https://vimeo.com/${src.pathname.split('/').filter(Boolean)[1] ?? ''}`,
	},
	'google-maps': {
		category: 'media',
		provider: 'Google Ireland Limited, Irland (Google Maps)',
		purpose: 'Zeigt eine Karte von Google Maps.',
		privacyUrl: 'https://policies.google.com/privacy',
		hosts: { frame: ['https://www.google.com'] },
		embed: {
			sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
			allow: 'fullscreen',
			allowFullscreen: true,
			referrerPolicy: 'strict-origin-when-cross-origin',
			loadLabel: 'Karte laden',
			noun: 'Die Karte',
			aspect: '4 / 3',
			height: null,
		},
		// Nur die Adresse aus „Teilen → Karte einbetten“ (ohne API-Schlüssel).
		normalize: (url) =>
			url.hostname === 'www.google.com' && url.pathname === '/maps/embed' && url.searchParams.has('pb')
				? `https://www.google.com/maps/embed?pb=${encodeURIComponent(url.searchParams.get('pb') ?? '')}`
				: null,
		original: () => 'https://www.google.com/maps',
	},
	calendly: {
		category: 'media',
		provider: 'Calendly LLC, USA',
		purpose: 'Zeigt die Terminbuchung von Calendly.',
		privacyUrl: 'https://calendly.com/privacy',
		hosts: { frame: ['https://calendly.com'] },
		embed: {
			sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
			allow: 'payment',
			allowFullscreen: false,
			referrerPolicy: 'strict-origin-when-cross-origin',
			loadLabel: 'Terminbuchung laden',
			noun: 'Die Terminbuchung',
			aspect: null,
			height: '700px',
		},
		normalize: (url) => {
			if (url.hostname !== 'calendly.com') return null;
			const parts = url.pathname.split('/').filter(Boolean);
			if (parts.length < 1 || parts.length > 2 || !parts.every((p) => /^[A-Za-z0-9_-]{1,100}$/.test(p)))
				return null;
			const out = new URL(`https://calendly.com/${parts.join('/')}`);
			out.searchParams.set('embed_type', 'Inline');
			// Den eigenen Hinweis von Calendly braucht es nicht: Eingewilligt ist schon.
			out.searchParams.set('hide_gdpr_banner', '1');
			return out.href;
		},
		original: (src) => `https://calendly.com${src.pathname}`,
	},
};

/** Einstellungen für einen eigenen Dienst mit `frame`-Hosts (kein Preset). */
export const CUSTOM_EMBED: EmbedSettings = {
	sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
	allow: '',
	allowFullscreen: false,
	referrerPolicy: 'strict-origin-when-cross-origin',
	loadLabel: 'Inhalt laden',
	noun: 'Der Inhalt',
	aspect: '16 / 9',
	height: null,
};

export const PRESET_NAMES = Object.keys(PRESETS) as ExternalPreset[];

export function isPreset(value: unknown): value is ExternalPreset {
	return typeof value === 'string' && (PRESET_NAMES as string[]).includes(value);
}

/** Fassung von `contract/external-presets.v1.json`. */
export const EXTERNAL_PRESETS_CONTRACT_VERSION = 1;

/** Eine Vorlage, wie sie der Core kennt: ohne Einbettung und ohne Normalisierung. */
export interface PresetContractEntry {
	category: ExternalCategory;
	provider: string;
	/** Alle sieben Direktiven, je sortiert, wie im Manifest. */
	hosts: ExternalHosts;
}

/**
 * Inhalt von `contract/external-presets.v1.json`, aus `PRESETS` erzeugt. Der Core hält eine byte-gleiche Kopie und
 * prüft seine Vorlagen dagegen: Ein Manifest-Eintrag zählt dort nur als Vorlage, wenn er genau diese Hosts trägt.
 */
export function externalPresetsContract(): {
	version: number;
	presets: Record<string, PresetContractEntry>;
} {
	const presets: Record<string, PresetContractEntry> = {};
	for (const name of [...PRESET_NAMES].sort()) {
		const preset = PRESETS[name];
		const hosts = Object.fromEntries(
			EXTERNAL_DIRECTIVES.map((d) => [d, [...new Set(preset.hosts[d] ?? [])].sort()]),
		) as ExternalHosts;
		presets[name] = { category: preset.category, provider: preset.provider, hosts };
	}
	return { version: EXTERNAL_PRESETS_CONTRACT_VERSION, presets };
}

/** Text der Vertragsdatei (JSON mit Tabulator, Zeilenende am Schluss). */
export function externalPresetsContractText(): string {
	return `${JSON.stringify(externalPresetsContract(), null, '\t')}\n`;
}
