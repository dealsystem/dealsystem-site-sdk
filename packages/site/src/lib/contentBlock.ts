// Inhaltsblock: die Werte der Content-Slots stehen genau einmal je Seite als
// `<script type="application/json" id="ds-content">` im HTML. Der Server
// schreibt ihn (über `<SiteHead>`), der Browser liest ihn beim Start. Damit
// stehen die Texte aus dem CRM nicht im JS-Bundle, und eine fertige Seite
// lässt sich ohne neuen Build auf neue Texte umstellen („Patchen statt Bauen“).
//
// Reines Modul ohne Svelte und ohne Node-APIs: Vite-Plugin, Komponenten und
// die Patch-Funktion im Core benutzen dieselbe Serialisierung.
import type { SlotOverride } from './types.js';

/** `id` des Blocks im HTML. Vertrag zwischen SDK, Build-Host und Core. */
export const CONTENT_BLOCK_ID = 'ds-content';

/** Format des Blocks. Steigt, wenn sich die Form ändert. */
export const CONTENT_BLOCK_VERSION = 1;

/** Inhalt des Blocks. Nur Öffentliches: was ohnehin auf der Seite steht. */
export interface ContentBlock {
	v: typeof CONTENT_BLOCK_VERSION;
	/** Überschreibungen aus dem CRM, wie im Schnappschuss. */
	slots: Record<string, SlotOverride>;
	/** Fertiges, geprüftes HTML je Richtext-Slot. */
	richtext: Record<string, string>;
}

/**
 * JSON, das in einem `<script>`-Element sicher ist: `<`, `>` und `&` werden
 * als `\u003c` usw. geschrieben, damit kein Wert `</script>` oder `<!--`
 * bilden kann. U+2028/U+2029 ebenso (ältere Parser).
 */
export function serializeContentBlock(block: ContentBlock): string {
	return JSON.stringify(block)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/** Das fertige Element für den Kopf der Seite. */
export function contentBlockTag(block: ContentBlock): string {
	return `<script type="application/json" id="${CONTENT_BLOCK_ID}">${serializeContentBlock(block)}</script>`;
}

/** Findet den Block in einer HTML-Datei: Anfang und Ende des ganzen Elements. */
export const CONTENT_BLOCK_PATTERN = /<script type="application\/json" id="ds-content">([^<]*)<\/script>/g;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Liest den Block. Alles, was nicht passt, wird verworfen: dann gelten die
 * Standardwerte aus dem Code, die Seite bleibt benutzbar.
 */
export function parseContentBlock(text: string | null | undefined): ContentBlock | null {
	if (!text) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(raw) || raw.v !== CONTENT_BLOCK_VERSION) return null;
	const slots: Record<string, SlotOverride> = {};
	if (isRecord(raw.slots)) {
		for (const [key, value] of Object.entries(raw.slots)) {
			if (isRecord(value) && typeof value.type === 'string') {
				slots[key] = { type: value.type as SlotOverride['type'], value: value.value };
			}
		}
	}
	const richtext: Record<string, string> = {};
	if (isRecord(raw.richtext)) {
		for (const [key, value] of Object.entries(raw.richtext)) {
			if (typeof value === 'string') richtext[key] = value;
		}
	}
	return { v: CONTENT_BLOCK_VERSION, slots, richtext };
}
