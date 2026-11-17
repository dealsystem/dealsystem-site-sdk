// Die eine Stelle, an der „Überschreibung, sonst Standard“ entschieden wird.
// Passt eine Überschreibung nicht zum Typ des Slots, gilt der Standard: ein
// Kunde kann seine Seite über das CRM nicht kaputt schreiben.
import { normalizeMediaRef } from './snapshot.js';
import type { ContentSlotLinkValue, MediaRef, SlotOverride } from './types.js';

type Overrides = Record<string, SlotOverride>;

function find(
	overrides: Overrides,
	key: string,
	aliases: readonly string[] | undefined,
): SlotOverride | null {
	for (const candidate of [key, ...(aliases ?? [])]) {
		if (Object.prototype.hasOwnProperty.call(overrides, candidate)) return overrides[candidate] ?? null;
	}
	return null;
}

/** Text eines `text`-, `textarea`- oder `richtext`-Slots, sonst `null`. */
export function resolveTextSlot(
	overrides: Overrides,
	key: string,
	aliases?: readonly string[],
): string | null {
	const hit = find(overrides, key, aliases);
	if (!hit || hit.type === 'link' || hit.type === 'image') return null;
	return typeof hit.value === 'string' ? hit.value : null;
}

/** Wert eines `link`-Slots, sonst `null`. */
export function resolveLinkSlot(
	overrides: Overrides,
	key: string,
	aliases?: readonly string[],
): ContentSlotLinkValue | null {
	const hit = find(overrides, key, aliases);
	if (!hit || hit.type !== 'link') return null;
	const value = hit.value as Record<string, unknown> | null;
	if (!value || typeof value.href !== 'string' || typeof value.label !== 'string') return null;
	if (!/^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i.test(value.href)) return null;
	return { href: value.href, label: value.label, newTab: value.newTab === true };
}

/** Bild eines `image`-Slots, sonst `null`. */
export function resolveImageSlot(
	overrides: Overrides,
	key: string,
	aliases?: readonly string[],
): MediaRef | null {
	const hit = find(overrides, key, aliases);
	if (!hit || hit.type !== 'image') return null;
	const ref = normalizeMediaRef(hit.value);
	return ref && ref.kind === 'image' && ref.variants.length > 0 ? ref : null;
}
