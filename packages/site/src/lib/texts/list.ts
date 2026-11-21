// Texte von `<CollectionList>` in Sie- und Du-Form (heute gleich). Einzelne Texte überschreibt `texts`.
import type { Anrede } from '../types.js';

/** Texte von `<CollectionList>`. */
export interface CollectionListTexts {
	/** Keine Einträge (wenn kein `empty`-Snippet gesetzt ist). */
	empty: string;
	loading: string;
	failed: string;
	retry: string;
}

const TEXTS: CollectionListTexts = {
	empty: 'Zurzeit gibt es hier keine Einträge.',
	loading: 'Einträge werden geladen.',
	failed: 'Die Einträge konnten nicht geladen werden.',
	retry: 'Erneut versuchen',
};

/** @internal */
export const COLLECTION_LIST_TEXTS: Readonly<Record<Anrede, CollectionListTexts>> = { sie: TEXTS, du: TEXTS };
