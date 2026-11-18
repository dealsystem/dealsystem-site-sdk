// Formate der Schlüssel. Dieselben Muster prüft der Core beim Speichern.

/** Slot-Schlüssel, z. B. `start.hero.titel`. */
export const SLOT_KEY_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/;
/** Formular- und Sammlungs-Schlüssel in kebab-case, z. B. `kontakt`. */
export const KEBAB_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Feldnamen, z. B. `nachricht` oder `firstName`. */
export const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const SLOT_KEY_MAX_LENGTH = 120;
export const KEBAB_KEY_MAX_LENGTH = 100;

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Warum ein Slot-Schlüssel ungültig ist und welcher gültige ihm am nächsten kommt. Die häufigste Falle: Der
 * erste Teil kommt vom Seitennamen (`ueber-uns`), darf aber keinen Bindestrich enthalten (`ueberuns`).
 * `null`, wenn der Schlüssel gültig ist.
 * @internal
 */
export function explainSlotKey(key: string): { reasons: string[]; suggestion: string | null } | null {
	if (SLOT_KEY_PATTERN.test(key) && key.length <= SLOT_KEY_MAX_LENGTH) return null;
	const reasons: string[] = [];
	const parts = key.split('.');
	const first = parts[0] ?? '';
	if (/[A-ZÄÖÜ]/.test(key)) reasons.push('Großbuchstaben sind nicht erlaubt');
	if (/[-_]/.test(first)) reasons.push('Bindestrich oder Unterstrich im ersten Teil ist nicht erlaubt');
	const odd = [...new Set(key.toLowerCase().replace(/[a-z0-9.\-_]/g, ''))];
	if (odd.length > 0)
		reasons.push(`nicht erlaubt: ${odd.map((c) => (c === ' ' ? 'Leerzeichen' : `„${c}“`)).join(', ')}`);
	if (parts.some((p) => p === ''))
		reasons.push('leerer Teil (zwei Punkte hintereinander oder Punkt am Rand)');
	const filled = parts.filter((p) => p !== '');
	if (filled.length < 2) reasons.push('es braucht mindestens zwei Teile, getrennt durch Punkte');
	if (filled.length > 5) reasons.push('höchstens fünf Teile');
	if (key.length > SLOT_KEY_MAX_LENGTH) reasons.push(`höchstens ${SLOT_KEY_MAX_LENGTH} Zeichen`);
	if (reasons.length === 0) reasons.push('Format passt nicht');

	const clean = (part: string) =>
		part
			.toLowerCase()
			.replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
			.replace(/[\s_]+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-{2,}/g, '-')
			.replace(/^-|-$/g, '');
	const fixed = filled.map(clean).filter((p) => p !== '');
	if (fixed.length > 0) fixed[0] = fixed[0]!.replace(/-/g, '');
	const candidate = fixed.slice(0, 5).join('.');
	const suggestion =
		candidate !== key && SLOT_KEY_PATTERN.test(candidate) && candidate.length <= SLOT_KEY_MAX_LENGTH
			? candidate
			: null;
	return { reasons, suggestion };
}

/** Kurzform der Grammatik für Meldungen. @internal */
export const SLOT_KEY_RULE =
	'Erster Teil nur Kleinbuchstaben und Ziffern (Seite „Über uns“ → `ueberuns`), danach ein bis vier weitere Teile mit Kleinbuchstaben, Ziffern und Bindestrichen, alle durch Punkte getrennt, z. B. `ueberuns.team.titel`.';
