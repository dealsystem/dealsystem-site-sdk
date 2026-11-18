// `dealsystem.config.ts`: Der statische Leser liegt im SDK (`@dealsystem/site/config/static`), damit
// `dealsystemCsp()` und `check` dieselbe Konfiguration sehen. Hier nur, was allein die CLI braucht.

export {
	findPathLine,
	readSiteConfig,
	SITE_CONFIG_FILE,
	type ConfigProblem,
	type ConfigProblemKind,
	type SiteConfigData,
	type SiteConfigResult,
} from '@dealsystem/site/config/static';

/** Setzt `siteId` in der Konfiguration (für `init`). Gibt den neuen Text zurück. */
export function writeSiteIdIntoConfig(code: string, siteId: string): string | null {
	const re = /(\bsiteId\s*:\s*)(['"`])[^'"`]*\2/;
	if (re.test(code)) return code.replace(re, `$1'${siteId}'`);
	const call = /(defineSite\(\s*\{)/;
	if (call.test(code)) return code.replace(call, `$1\n\tsiteId: '${siteId}',`);
	return null;
}

/** Konfiguration für eine neue Seite, falls noch keine existiert. */
export function defaultSiteConfig(siteId: string): string {
	return [
		"import { defineSite } from '@dealsystem/site/config';",
		'',
		'export default defineSite({',
		`\tsiteId: '${siteId}',`,
		'\tfunnels: {',
		'\t\tkontakt: {',
		"\t\t\tlabel: 'Kontakt',",
		'\t\t\tfields: [',
		"\t\t\t\t{ name: 'firstName', type: 'text', label: 'Vorname', standardField: 'firstName' },",
		"\t\t\t\t{ name: 'lastName', type: 'text', label: 'Nachname', standardField: 'lastName' },",
		"\t\t\t\t{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },",
		"\t\t\t\t{ name: 'nachricht', type: 'textarea', label: 'Nachricht' },",
		'\t\t\t],',
		'\t\t},',
		'\t},',
		'});',
		'',
	].join('\n');
}
