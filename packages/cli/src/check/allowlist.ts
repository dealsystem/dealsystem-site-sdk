// Positiv-Liste der direkten Abhängigkeiten (DEP-001). Versioniert im SDK-Repo; der Build-Host nimmt die
// Liste aus seinem eigenen Image. Neue Einträge nur nach Prüfung: kein Laufzeit-Netzverkehr zu Dritten,
// keine Installationsskripte, die für den Build nötig wären (`npm ci --ignore-scripts`).

export interface AllowedPackage {
	/** Paketname oder Präfix mit `*` am Ende (`@fontsource/*`). */
	name: string;
	reason: string;
}

export const ALLOWED_PACKAGES: readonly AllowedPackage[] = [
	{ name: '@dealsystem/site', reason: 'DealSystem-SDK' },
	{ name: 'dealsystem', reason: 'DealSystem-CLI' },
	{ name: '@sveltejs/kit', reason: 'SvelteKit' },
	{ name: '@sveltejs/adapter-static', reason: 'statischer Build' },
	{ name: '@sveltejs/vite-plugin-svelte', reason: 'Svelte für Vite' },
	{ name: '@sveltejs/enhanced-img', reason: 'Bilder in WebP/AVIF mit srcset' },
	{ name: 'svelte', reason: 'Svelte' },
	{ name: 'vite', reason: 'Build' },
	{ name: 'typescript', reason: 'Typen' },
	{ name: 'tslib', reason: 'Typen' },
	{ name: 'svelte-check', reason: 'Typprüfung' },
	{ name: '@types/node', reason: 'Typen' },
	{ name: 'tailwindcss', reason: 'CSS' },
	{ name: '@tailwindcss/vite', reason: 'CSS' },
	{ name: '@tailwindcss/typography', reason: 'CSS' },
	{ name: '@tailwindcss/forms', reason: 'CSS' },
	{ name: 'postcss', reason: 'CSS' },
	{ name: 'autoprefixer', reason: 'CSS' },
	{ name: 'sass', reason: 'CSS' },
	{ name: 'clsx', reason: 'CSS-Klassen' },
	{ name: 'tailwind-merge', reason: 'CSS-Klassen' },
	{ name: '@fontsource/*', reason: 'lokale Schriften' },
	{ name: '@fontsource-variable/*', reason: 'lokale Schriften' },
	{ name: '@lucide/svelte', reason: 'Icons' },
	{ name: 'lucide-svelte', reason: 'Icons' },
	{ name: '@iconify/svelte', reason: 'Icons (nur mit lokal gebündelten Icons)' },
	{ name: 'embla-carousel', reason: 'Karussell' },
	{ name: 'embla-carousel-svelte', reason: 'Karussell' },
	{ name: 'date-fns', reason: 'Datumsformat' },
	{ name: 'prettier', reason: 'Formatierung' },
	{ name: 'prettier-plugin-svelte', reason: 'Formatierung' },
	{ name: 'prettier-plugin-tailwindcss', reason: 'Formatierung' },
	{ name: 'eslint', reason: 'Linter' },
	{ name: '@eslint/js', reason: 'Linter' },
	{ name: 'eslint-plugin-svelte', reason: 'Linter' },
	{ name: 'typescript-eslint', reason: 'Linter' },
	{ name: 'globals', reason: 'Linter' },
];

/** Häufige Pakete, die nicht freigegeben sind, mit Alternative für die Meldung. */
export const ALTERNATIVES: Readonly<Record<string, string>> = {
	'@sveltejs/adapter-auto': '`@sveltejs/adapter-static`',
	'@sveltejs/adapter-node': '`@sveltejs/adapter-static`',
	'@sveltejs/adapter-vercel': '`@sveltejs/adapter-static`',
	'@sveltejs/adapter-netlify': '`@sveltejs/adapter-static`',
	'@sveltejs/adapter-cloudflare': '`@sveltejs/adapter-static`',
	axios: 'nichts: die Seite ruft keine APIs auf. Formulare über `<LeadForm>`, Inhalte über `getCollection()`',
	'node-fetch': 'nichts: die Seite ruft keine APIs auf',
	dotenv: 'nichts: eine statische Seite hat keine Secrets',
	react: 'Svelte',
	'react-dom': 'Svelte',
	vue: 'Svelte',
	jquery: 'Svelte',
	bootstrap: '`tailwindcss`',
	marked: '`<RichText>`',
	'markdown-it': '`<RichText>`',
	dompurify: '`<RichText>`',
	'@emailjs/browser': '`<LeadForm>`',
	'@formspree/svelte': '`<LeadForm>`',
	webfontloader: '`@fontsource/<name>`',
	'google-fonts': '`@fontsource/<name>`',
	'react-ga': '`<ConsentGate><Tracking /></ConsentGate>`',
	'react-ga4': '`<ConsentGate><Tracking /></ConsentGate>`',
	'svelte-gtag': '`<ConsentGate><Tracking /></ConsentGate>`',
	swiper: '`embla-carousel-svelte`',
	'lucide-react': '`@lucide/svelte`',
	moment: '`date-fns`',
};

export function isAllowedPackage(name: string): boolean {
	return ALLOWED_PACKAGES.some((p) =>
		p.name.endsWith('/*') ? name.startsWith(p.name.slice(0, -1)) : p.name === name,
	);
}
