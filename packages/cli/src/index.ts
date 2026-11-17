// Paket `dealsystem`: CLI und Regelkatalog. Für den Build-Host ist `dealsystem/check` der Einstieg.

export * from './check/index.js';
export { run, helpText, COMMANDS } from './cli/main.js';
export { nodeIO, type CliIO } from './cli/io.js';
export { EXIT, CliError, ApiError } from './api/errors.js';
export type { DeployApi } from './api/types.js';
export { HttpDeployApi } from './api/http.js';
export { selectUploadFiles, isUploadPath, UPLOAD_MAX_BYTES } from './project/uploadFiles.js';
export { createTarGz, readTarGz } from './project/tar.js';
export { readSiteConfig } from './project/siteConfig.js';
export { canonicalJson, compareSnapshot, type DriftItem } from './project/snapshot.js';
