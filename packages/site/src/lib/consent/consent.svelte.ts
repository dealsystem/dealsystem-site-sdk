// Einwilligung des Besuchers. Eine Quelle für <CookieBanner>, <ConsentGate>
// und <Tracking>. Gespeichert wird nur die Wahl selbst (technisch nötig).
import { captureFirstTouch, forgetStoredFirstTouch } from '../client/attribution.js';
import { reloadPage } from '../internal/reload.js';

/**
 * Zwecke, für die eine Einwilligung nötig ist:
 * `statistics` (Reichweitenmessung), `marketing` (Werbe-Pixel, Kampagnen),
 * `media` (eingebettete Inhalte Dritter wie Karten oder Videos).
 */
export type ConsentCategory = 'statistics' | 'marketing' | 'media';

/** Alle Zwecke in der Reihenfolge der Anzeige. */
export const CONSENT_CATEGORIES: readonly ConsentCategory[] = ['statistics', 'marketing', 'media'];

const STORAGE_KEY = 'ds-consent';
const STORAGE_VERSION = 1;
/** Nach zwölf Monaten wird neu gefragt. */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

type Granted = Record<ConsentCategory, boolean>;

const NONE: Granted = { statistics: false, marketing: false, media: false };

const state = $state({
	/** Wahl aus dem Browser gelesen? Vorher gilt nichts als erlaubt. */
	ready: false,
	decided: false,
	granted: { ...NONE } as Granted,
	settingsOpen: false,
});

function read(): { granted: Granted } | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown> | null;
		if (!parsed || parsed.v !== STORAGE_VERSION || typeof parsed.at !== 'number') return null;
		if (Date.now() - parsed.at > MAX_AGE_MS) return null;
		const stored = (parsed.granted ?? {}) as Record<string, unknown>;
		const granted = { ...NONE };
		for (const category of CONSENT_CATEGORIES) granted[category] = stored[category] === true;
		return { granted };
	} catch {
		return null;
	}
}

function decide(granted: Granted): void {
	const revoked = CONSENT_CATEGORIES.some((c) => state.granted[c] && !granted[c]);
	state.granted = { ...granted };
	state.decided = true;
	state.settingsOpen = false;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, at: Date.now(), granted }));
	} catch {
		// Speicher gesperrt: die Wahl gilt bis zum Schließen der Seite.
	}
	if (granted.marketing) captureFirstTouch(true);
	else forgetStoredFirstTouch();
	// Bereits geladene Skripte Dritter lassen sich nicht entladen. Nach einem
	// Widerruf wird die Seite deshalb neu geladen.
	if (revoked) reloadPage();
}

/**
 * Zustand der Einwilligung. Reaktiv: in Markup und `$derived` verwendbar.
 * Vor der Entscheidung des Besuchers ist nichts erlaubt.
 *
 * @example
 * <script>
 * 	import { consent } from '@dealsystem/site';
 * </script>
 *
 * <button type="button" onclick={() => consent.openSettings()}>Cookie-Einstellungen</button>
 * {#if consent.has('media')}<p>Karte wird angezeigt.</p>{/if}
 */
export const consent = {
	/** Hat der Besucher schon gewählt? Im Server-Rendering immer `false`. */
	get decided(): boolean {
		return state.decided;
	},
	/** Ist die gespeicherte Wahl schon gelesen? Erst danach erscheint der Hinweis. */
	get ready(): boolean {
		return state.ready;
	},
	/** Soll der Einstellungs-Dialog offen sein? */
	get settingsOpen(): boolean {
		return state.settingsOpen;
	},
	/** `true` nur, wenn der Besucher diesem Zweck zugestimmt hat. */
	has(category: ConsentCategory): boolean {
		return state.ready && state.granted[category] === true;
	},
	/** Stimmt den genannten Zwecken zu, allen anderen nicht. */
	save(categories: readonly ConsentCategory[]): void {
		const granted = { ...NONE };
		for (const category of categories) if (category in granted) granted[category] = true;
		decide(granted);
	},
	/** Stimmt den genannten Zwecken zu (Standard: allen). */
	acceptAll(categories: readonly ConsentCategory[] = CONSENT_CATEGORIES): void {
		this.save(categories);
	},
	/** Lehnt alles ab. Gleichwertig zu `acceptAll`, nur mit anderem Ergebnis. */
	rejectAll(): void {
		decide({ ...NONE });
	},
	/** Stimmt einem weiteren Zweck zu, ohne die übrige Wahl zu ändern. */
	grant(category: ConsentCategory): void {
		decide({ ...state.granted, [category]: true });
	},
	/** Öffnet die Einstellungen erneut (Widerruf), z. B. über einen Link im Footer. */
	openSettings(): void {
		state.settingsOpen = true;
	},
	/** Schließt die Einstellungen ohne Änderung. */
	closeSettings(): void {
		state.settingsOpen = false;
	},
	/**
	 * Liest die gespeicherte Wahl. Rufen die Komponenten nach dem Mount auf.
	 * @internal
	 */
	init(): void {
		if (state.ready || typeof window === 'undefined') return;
		const stored = read();
		if (stored) {
			state.granted = stored.granted;
			state.decided = true;
		}
		state.ready = true;
		captureFirstTouch(state.granted.marketing);
	},
	/** @internal Nur für Tests. */
	resetForTests(): void {
		state.ready = false;
		state.decided = false;
		state.granted = { ...NONE };
		state.settingsOpen = false;
	},
};
