// Formate der Schlüssel. Dieselben Muster prüft der Core beim Speichern.

/** Slot-Schlüssel, z. B. `start.hero.titel`. */
export const SLOT_KEY_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/;
/** Formular- und Sammlungs-Schlüssel in kebab-case, z. B. `kontakt`. */
export const KEBAB_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Feldnamen, z. B. `nachricht` oder `firstName`. */
export const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const SLOT_KEY_MAX_LENGTH = 120;
export const KEBAB_KEY_MAX_LENGTH = 100;
