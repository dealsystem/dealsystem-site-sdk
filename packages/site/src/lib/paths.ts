// Dateien, über die Build-Host, CLI und SDK Daten austauschen.

/** Umgebungsvariable mit dem Pfad des Schnappschusses (setzt der Build-Host). */
export const CONTENT_FILE_ENV = 'DEALSYSTEM_CONTENT_FILE';
/** Lokale Kopie des Schnappschusses, geschrieben von `dealsystem sync`. */
export const LOCAL_CONTENT_FILE = '.dealsystem/content.json';
/** Umgebungsvariable mit dem Zielpfad des Manifests (setzt der Build-Host). */
export const MANIFEST_FILE_ENV = 'DEALSYSTEM_MANIFEST_FILE';
/** Zielpfad des Manifests ohne Umgebungsvariable. */
export const LOCAL_MANIFEST_FILE = '.dealsystem/manifest.json';
