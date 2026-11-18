// Statischer Leser für Konfigurationsdateien. Liegt seit Regelsatz 3 im SDK (`@dealsystem/site/config/static`),
// weil `dealsystemCsp()` in svelte.config.js dieselbe Konfiguration lesen muss wie `check`.
export {
	evaluate,
	findKeyLine,
	isOpaque,
	isPlainObject,
	parseModule,
	type LiteralValue,
	type Opaque,
	type ParsedModule,
} from '@dealsystem/site/config/static';
