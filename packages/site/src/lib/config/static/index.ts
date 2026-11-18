// `@dealsystem/site/config/static`: liest `dealsystem.config.ts` und andere Konfigurationsdateien statisch, ohne sie
// auszuführen. Nutzer: `dealsystem check` (auch auf dem Build-Host) und `dealsystemCsp()`. Braucht `typescript`.

export { LineIndex, type Position } from './lines.js';
export {
	evaluate,
	findKeyLine,
	isOpaque,
	isPlainObject,
	parseModule,
	type LiteralValue,
	type Opaque,
	type ParsedModule,
} from './literal.js';
export {
	findPathLine,
	readSiteConfig,
	SITE_CONFIG_FILE,
	type ConfigProblem,
	type ConfigProblemKind,
	type SiteConfigData,
	type SiteConfigResult,
} from './siteConfig.js';
