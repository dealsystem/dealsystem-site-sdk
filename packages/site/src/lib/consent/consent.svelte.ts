// Einwilligung des Besuchers. Eine Quelle für <CookieBanner>, <ConsentGate>
// und <Tracking>. Gespeichert wird nur die Wahl selbst (technisch nötig).
import { untrack } from 'svelte';
import { syncAttribution } from '../client/attribution.js';
import { ownConsentBanner } from '../internal/consentNeed.js';
import { reloadPage } from '../internal/reload.js';

/**
 * Zwecke, für die eine Einwilligung nötig ist:
 * `statistics` (Reichweitenmessung), `marketing` (Werbe-Pixel, Kampagnen),
 * `media` (eingebettete Inhalte Dritter wie Karten oder Videos).
 */
export type ConsentCategory = 'statistics' | 'marketing' | 'media';

/** Alle Zwecke in der Reihenfolge der Anzeige. */
export const CONSENT_CATEGORIES: readonly ConsentCategory[] = ['statistics', 'marketing', 'media'];

/** @internal Eintrag in `localStorage` (Vertrag `visit-consent.v1.json`). */
export const CONSENT_STORAGE_KEY = 'ds-consent';
const STORAGE_KEY = CONSENT_STORAGE_KEY;
const STORAGE_VERSION = 1;
/** Nach zwölf Monaten wird neu gefragt. */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

type Granted = Record<ConsentCategory, boolean>;

/** Ein Anbieter, den der Cookie-Hinweis unter seinem Zweck nennt. */
export interface ConsentProvider {
	/** Name mit Sitz, z. B. „Google Ireland Limited, Irland (YouTube)“. */
	name: string;
	/** Zweck in einem Satz. */
	purpose: string | null;
	/** Datenschutzerklärung des Anbieters. */
	privacyUrl: string | null;
}

const NONE: Granted = { statistics: false, marketing: false, media: false };

const state = $state({
	/** Wahl aus dem Browser gelesen? Vorher gilt nichts als erlaubt. */
	ready: false,
	decided: false,
	/** Zeitpunkt der Wahl (ms), `null` vor der Entscheidung. */
	decidedAt: null as number | null,
	granted: { ...NONE } as Granted,
	settingsOpen: false,
	/** Wie viele Bausteine auf der Seite gerade eine Einwilligung je Zweck brauchen. */
	required: { statistics: 0, marketing: 0, media: 0 } as Record<ConsentCategory, number>,
	/** Anbieter, die Bausteine auf der Seite gerade melden (z. B. OpenStreetMap über `<MapEmbed>`), mit Zähler. */
	providers: [] as { category: ConsentCategory; provider: ConsentProvider; count: number }[],
});

function read(): { granted: Granted; at: number } | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown> | null;
		if (!parsed || parsed.v !== STORAGE_VERSION || typeof parsed.at !== 'number') return null;
		if (Date.now() - parsed.at > MAX_AGE_MS) return null;
		const stored = (parsed.granted ?? {}) as Record<string, unknown>;
		const granted = { ...NONE };
		for (const category of CONSENT_CATEGORIES) granted[category] = stored[category] === true;
		return { granted, at: parsed.at };
	} catch {
		return null;
	}
}

function decide(granted: Granted): void {
	const revoked = CONSENT_CATEGORIES.some((c) => state.granted[c] && !granted[c]);
	state.granted = { ...granted };
	state.decided = true;
	const at = Date.now();
	state.decidedAt = at;
	state.settingsOpen = false;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, at, granted }));
	} catch {
		// Speicher gesperrt: die Wahl gilt bis zum Schließen der Seite.
	}
	// Legt an, was die neue Wahl erlaubt, und löscht, was sie nicht mehr erlaubt (Klick-IDs, Besuchs-ID, Besuche).
	syncAttribution(granted);
	// Bereits geladene Skripte Dritter lassen sich nicht entladen. Nach einem
	// Widerruf wird die Seite deshalb neu geladen.
	if (revoked) reloadPage();
}

/**
 * Zustand der Einwilligung. Reaktiv: in Markup und `$derived` verwendbar.
 * Vor der Entscheidung des Besuchers ist nichts erlaubt.
 *
 * - `consent.has(zweck)` – hat der Besucher diesem Zweck zugestimmt?
 * - `consent.openSettings()` – den Hinweis erneut öffnen (Widerruf)
 * - `consent.grant(zweck)` – einem Zweck zustimmen, z. B. über „Karte anzeigen“
 * - `consent.acceptAll()`, `consent.rejectAll()`, `consent.save([zwecke])`
 * - `consent.decided` – hat der Besucher schon gewählt?
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
	/** Zeitpunkt der Wahl als ISO-Zeitpunkt, sonst `null`. Geht mit dem Lead an den Core. */
	get decidedAt(): string | null {
		// Nur zum Umwandeln in einen Text, nicht als reaktiver Zustand.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		return state.decidedAt === null ? null : new Date(state.decidedAt).toISOString();
	},
	/** Aktuelle Wahl je Zweck, als Kopie. @internal */
	granted(): Record<ConsentCategory, boolean> {
		return { ...state.granted };
	},
	/** Ist die gespeicherte Wahl schon gelesen? Erst danach erscheint der Hinweis. */
	get ready(): boolean {
		return state.ready;
	},
	/** Soll der Einstellungs-Dialog offen sein? */
	get settingsOpen(): boolean {
		return state.settingsOpen;
	},
	/**
	 * Zwecke, nach denen die Seite gerade fragen muss: was ein Baustein auf der Seite braucht
	 * (`<ConsentGate>`, `<MapEmbed>`, `<Embed>`, `<ExternalScript>`, `<Tracking>` mit Kennung) oder der
	 * Besucher schon erlaubt hat.
	 */
	get relevant(): ConsentCategory[] {
		return CONSENT_CATEGORIES.filter((c) => state.required[c] > 0 || state.granted[c]);
	},
	/**
	 * Gibt es etwas, wofür die Seite eine Einwilligung braucht oder das der Besucher widerrufen kann?
	 * Nur dann erscheinen der Hinweis und „Cookie-Einstellungen“. Ohne solche Inhalte ist keiner nötig.
	 */
	get needed(): boolean {
		return CONSENT_CATEGORIES.some((c) => state.required[c] > 0 || state.granted[c]);
	},
	/**
	 * Meldet, dass ein Baustein eine Einwilligung für diesen Zweck braucht. Gibt die Abmeldung zurück.
	 * Die Bausteine des SDK rufen das selbst auf.
	 * @internal
	 */
	require(category: ConsentCategory, provider?: ConsentProvider): () => void {
		// Ohne untrack hinge ein `$effect`, der das aufruft, von dem Zähler ab, den er selbst erhöht.
		untrack(() => {
			state.required[category] += 1;
			if (!provider) return;
			const known = state.providers.find((p) => p.category === category && p.provider.name === provider.name);
			if (known) known.count += 1;
			else state.providers.push({ category, provider: { ...provider }, count: 1 });
		});
		let released = false;
		return () => {
			if (released) return;
			released = true;
			untrack(() => {
				state.required[category] = Math.max(0, state.required[category] - 1);
				if (!provider) return;
				const index = state.providers.findIndex(
					(p) => p.category === category && p.provider.name === provider.name,
				);
				const known = state.providers[index];
				if (known && --known.count <= 0) state.providers.splice(index, 1);
			});
		};
	},
	/**
	 * Anbieter, die Bausteine auf der Seite gerade für diesen Zweck melden. Die fremden Dienste aus
	 * `dealsystem.config.ts` und die Tracking-Kennungen ergänzt `<CookieBanner>` selbst.
	 * @internal
	 */
	activeProviders(category: ConsentCategory): ConsentProvider[] {
		return state.providers.filter((p) => p.category === category).map((p) => p.provider);
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
		if (ownConsentBanner()) {
			// Eigenes Banner: Es ist die Quelle der Wahl und meldet sie mit `setConsent()` bei jedem Laden. Bis dahin
			// gilt nichts als erlaubt, und eine früher gespeicherte Wahl des DealSystem-Banners zählt nicht.
			state.ready = true;
			syncAttribution(state.granted);
			return;
		}
		const stored = read();
		if (stored) {
			state.granted = stored.granted;
			state.decided = true;
			state.decidedAt = stored.at;
		}
		state.ready = true;
		syncAttribution(state.granted);
	},
	/** @internal Nur für Tests. */
	resetForTests(): void {
		state.ready = false;
		state.decided = false;
		state.decidedAt = null;
		state.granted = { ...NONE };
		state.settingsOpen = false;
		state.required = { statistics: 0, marketing: 0, media: 0 };
		state.providers = [];
	},
};

/**
 * Meldet die Wahl eines eigenen Cookie-Banners (Cookiebot, Usercentrics …), wenn in `dealsystem.config.ts`
 * `consent: { banner: 'own' }` steht. Nur genannte Zwecke ändern sich. Bis zum ersten Aufruf gilt keine Einwilligung.
 * Die Wahl speichert das SDK nicht selbst: Das eigene Banner ruft `setConsent()` bei jedem Laden der Seite auf.
 * Ein Widerruf (`marketing: false`) löscht die Besuchs-ID sofort aus dem Browser.
 *
 * Ohne eigenes Banner wirkt der Aufruf wie eine Wahl im Banner von DealSystem (gespeichert, nach einem Widerruf
 * lädt die Seite neu).
 *
 * @example
 * // Cookiebot: nach jeder Wahl und beim Laden
 * window.addEventListener('CookiebotOnConsentReady', () => {
 * 	setConsent({ statistics: Cookiebot.consent.statistics, marketing: Cookiebot.consent.marketing });
 * });
 */
export function setConsent(choice: Partial<Record<ConsentCategory, boolean>>): void {
	if (typeof window === 'undefined') return;
	const granted: Granted = { ...state.granted };
	for (const category of CONSENT_CATEGORIES) {
		const value = choice?.[category];
		if (typeof value === 'boolean') granted[category] = value;
	}
	if (!ownConsentBanner()) {
		decide(granted);
		return;
	}
	state.granted = granted;
	state.decided = true;
	state.decidedAt = Date.now();
	state.ready = true;
	syncAttribution(granted);
}
