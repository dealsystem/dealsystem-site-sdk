// Host-Quellen fremder Dienste (`external` in dealsystem.config.ts): Form prüfen und gegen Adressen abgleichen.
// Dieselben Funktionen nutzen Konfiguration, CSP-Erzeugung, Bausteine und `dealsystem check`.

import type { ExternalDirective } from '../types.js';

/** Direktiven in der Reihenfolge, in der sie im Manifest und in Meldungen stehen. */
export const EXTERNAL_DIRECTIVES: readonly ExternalDirective[] = [
	'script',
	'connect',
	'img',
	'frame',
	'media',
	'style',
	'font',
];

/** Direktiven, in denen `https://*.domain` erlaubt ist. In `script` und `frame` nie: jeder Unterhost wäre offen. */
export const WILDCARD_DIRECTIVES: readonly ExternalDirective[] = ['connect', 'img', 'media', 'style', 'font'];

/** Höchstzahl der fremden Dienste einer Seite und der Hosts je Direktive. */
export const MAX_EXTERNAL_ENTRIES = 30;
export const MAX_HOSTS_PER_DIRECTIVE = 20;

/**
 * Endungen, unter denen jeder Fremde eine Adresse bekommt (Ländervorwahlen mit zwei Teilen, Hosting-Plattformen).
 * `https://*.<endung>` würde Hosts beliebiger Dritter öffnen. Bewusst kurz: die häufigen Fälle, kein Ersatz für die
 * Public Suffix List.
 */
export const SHARED_SUFFIXES: readonly string[] = [
	'co.uk',
	'org.uk',
	'ac.uk',
	'gov.uk',
	'com.au',
	'net.au',
	'org.au',
	'co.at',
	'or.at',
	'com.br',
	'co.jp',
	'co.nz',
	'com.cn',
	'com.tr',
	'co.za',
	'com.mx',
	'github.io',
	'gitlab.io',
	'herokuapp.com',
	'vercel.app',
	'netlify.app',
	'pages.dev',
	'workers.dev',
	'web.app',
	'firebaseapp.com',
	'appspot.com',
	'cloudfront.net',
	'amazonaws.com',
	'azurewebsites.net',
	'blogspot.com',
	'dealsystem.site',
];

/** Hosts von DealSystem selbst: Die Site-API steht schon in der CSP, alles andere braucht eine Seite nicht. */
const OWN_DOMAINS = ['dealsystem.io'];

const HOST_SOURCE =
	/^https:\/\/(\*\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9])$/;

/** Zerlegt `https://*.a.de` in `{ wildcard: true, host: 'a.de' }`; `null`, wenn die Form nicht passt. */
export function parseHostSource(source: string): { wildcard: boolean; host: string } | null {
	const m = HOST_SOURCE.exec(source.trim().toLowerCase());
	if (!m) return null;
	return { wildcard: m[1] !== undefined, host: m[2]! };
}

/**
 * Warum eine Host-Quelle in dieser Direktive nicht erlaubt ist; `null`, wenn sie passt.
 * Die Meldung ist ein ganzer Satz mit Beispiel, für Agenten ohne Vorwissen.
 */
export function hostSourceProblem(source: unknown, directive: ExternalDirective): string | null {
	if (typeof source !== 'string') return 'Ein Host ist eine Zeichenkette, z. B. "https://js.example.com".';
	const raw = source.trim();
	if (raw !== source || raw.toLowerCase() !== raw)
		return `"${source}" ist nicht in der Grundform: Kleinbuchstaben, keine Leerzeichen, z. B. "${raw.toLowerCase()}".`;
	if (['*', 'https:', 'http:', 'data:', 'blob:', "'unsafe-eval'", 'unsafe-eval'].includes(raw))
		return `"${source}" würde jeden Host öffnen. Nenne die Hosts einzeln, z. B. "https://js.example.com".`;
	if (raw.startsWith('http://')) return `"${source}" ist unverschlüsselt. Nur https:// ist erlaubt.`;
	if (!raw.startsWith('https://')) return `"${source}" braucht die Form "https://host.de" (mit https://).`;
	const parsed = parseHostSource(raw);
	if (!parsed) {
		if (/^https:\/\/[^/]+\/./.test(raw) || raw.endsWith('/'))
			return `"${source}" enthält einen Pfad oder Schrägstrich am Ende. Nenne nur den Host, z. B. "${raw.replace(/^(https:\/\/[^/]+).*$/, '$1')}".`;
		if (/^https:\/\/[^/]+:\d+/.test(raw))
			return `"${source}" enthält einen Port. Erlaubt ist nur Port 443 ohne Angabe.`;
		if (raw.includes('*'))
			return `"${source}": Ein Platzhalter steht nur ganz vorn als "https://*.domain.de", nie mitten im Namen.`;
		return `"${source}" ist kein gültiger Host. Form: "https://host.de".`;
	}
	const { wildcard, host } = parsed;
	if (OWN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)))
		return `"${source}" gehört zu DealSystem. Die Site-API steht schon in den Sicherheitsregeln; trage sie nicht ein.`;
	if (wildcard) {
		if (!WILDCARD_DIRECTIVES.includes(directive))
			return `"${source}": In ${directive} sind keine Platzhalter erlaubt. Nenne jeden Host einzeln, z. B. "https://js.${host}".`;
		if (host.split('.').length < 2 || SHARED_SUFFIXES.includes(host))
			return `"${source}" würde Hosts beliebiger Dritter öffnen. Ein Platzhalter braucht eine eigene Domain des Anbieters, z. B. "https://*.anbieter.de".`;
	}
	return null;
}

/** Ob die Host-Quelle (`https://a.de` oder `https://*.a.de`) die Adresse abdeckt. Nur https, Standard-Port. */
export function hostSourceMatches(source: string, url: URL): boolean {
	const parsed = parseHostSource(source);
	if (!parsed || url.protocol !== 'https:' || url.port !== '') return false;
	const name = url.hostname.toLowerCase();
	return parsed.wildcard ? name.endsWith(`.${parsed.host}`) : name === parsed.host;
}

/** Fremde Adresse (`https://…`, `//…`) als URL; `null` für eigene Pfade, Ausdrücke und Ungültiges. */
export function externalUrl(value: string | null | undefined): URL | null {
	if (!value) return null;
	const v = value.trim();
	if (!/^(https?:)?\/\//i.test(v)) return null;
	try {
		return new URL(v.startsWith('//') ? `https:${v}` : v);
	} catch {
		return null;
	}
}

/** Eigener Pfad der Seite (`/scripts/chat.js`), kein `//host`, keine Steuerzeichen. */
export function isLocalPath(value: string): boolean {
	return /^\/(?!\/)[^\s\\]*$/.test(value) && !value.includes('/../') && !value.endsWith('/..');
}
