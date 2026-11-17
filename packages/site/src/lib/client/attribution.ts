// First-Touch-Zuordnung („erste UTM gewinnt“). Ohne Einwilligung bleibt der
// Wert nur im Arbeitsspeicher der geöffneten Seite. Erst mit der Einwilligung
// „Marketing“ wird er in sessionStorage gelegt (TDDDG § 25).
import type { LeadAttribution } from './siteApi.js';

const STORAGE_KEY = 'ds-first-touch';
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
const MAX_LENGTH = 200;

let memory: LeadAttribution | null = null;

function clip(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, MAX_LENGTH) : undefined;
}

function referrerHost(): string | undefined {
	try {
		if (!document.referrer) return undefined;
		const host = new URL(document.referrer).host.toLowerCase();
		const own = window.location.host.toLowerCase();
		if (!host || host === own || host === `www.${own}` || `www.${host}` === own) return undefined;
		return host.slice(0, 255);
	} catch {
		return undefined;
	}
}

function readStored(): LeadAttribution | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		return typeof parsed === 'object' && parsed !== null ? (parsed as LeadAttribution) : null;
	} catch {
		return null;
	}
}

/**
 * Hält den ersten Aufruf mit Kampagnen-Angaben fest. Mehrfach aufrufbar.
 * @internal
 */
export function captureFirstTouch(persist: boolean): void {
	if (typeof window === 'undefined') return;
	if (!memory && persist) memory = readStored();
	if (!memory) {
		const params = new URL(window.location.href).searchParams;
		const touch: LeadAttribution = {};
		for (const key of UTM_KEYS) {
			const value = clip(params.get(`utm_${key}`));
			if (value) touch[`utm${key[0]!.toUpperCase()}${key.slice(1)}` as keyof LeadAttribution] = value;
		}
		const host = referrerHost();
		if (host) touch.referrerHost = host;
		if (Object.keys(touch).length === 0) return;
		touch.capturedAt = new Date().toISOString();
		memory = touch;
	}
	if (persist) {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
		} catch {
			// Speicher voll oder gesperrt: die Zuordnung bleibt im Arbeitsspeicher.
		}
	}
}

/** @internal */
export function getFirstTouch(): LeadAttribution | undefined {
	return memory ?? undefined;
}

/** @internal Entfernt die gespeicherte Zuordnung, z. B. nach einem Widerruf. */
export function forgetStoredFirstTouch(): void {
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// nichts zu tun
	}
}

/** @internal Nur für Tests. */
export function resetFirstTouchForTests(): void {
	memory = null;
}
