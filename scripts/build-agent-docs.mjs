#!/usr/bin/env node
// Erzeugt die Anleitungen für KI-Agenten aus dem Code:
//   packages/site/docs/*.md, packages/site/docs/llms.txt  → im Paket @dealsystem/site
//   packages/create/template/AGENTS.md                    → im Starter
//   packages/site/agent-files/**                          → Kopie der Skills und der Cursor-Regel des Starters,
//                                                           für `dealsystem sync` (z. B. nach `pull`)
// Quellen: Komponenten (`@component`-Kommentar und Props-Typen), JSDoc der
// Funktionen, Regelkatalog und Befehle der CLI, dazu die von Hand geschriebenen
// Seiten unter packages/site/docs-src/.
//
//   node scripts/build-agent-docs.mjs          schreibt die Dateien
//   node scripts/build-agent-docs.mjs --check  prüft nur; Exit-Code 1, wenn etwas veraltet ist
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'packages/site');
const LIB = join(SITE, 'src/lib');
const DOCS_SRC = join(SITE, 'docs-src');
const DOCS_OUT = join(SITE, 'docs');
const TEMPLATE = join(ROOT, 'packages/create/template');
/** Agenten-Dateien im Paket: Kopie der Ordner `AGENT_FILE_DIRS` des Starters, Punkt am Anfang weggelassen. */
const AGENT_FILES = join(SITE, 'agent-files');
const AGENT_FILES_MANIFEST = join(AGENT_FILES, 'manifest.json');
/** Diese Ordner des Starters liefert das SDK mit aus; `sync` legt fehlende Dateien daraus wieder an. */
export const AGENT_FILE_DIRS = ['.claude', '.cursor'];

/** Obergrenze der ganzen AGENTS.md des Starters (Kopf, Marker und Block), in Bytes. Der Block allein bleibt darunter. */
export const AGENTS_BLOCK_MAX_BYTES = 8192;
/** Ab hier warnt der Generator: Der Platz für künftige Regeln wird knapp. Details gehören in Skills und docs/. */
export const AGENTS_MD_WARN_BYTES = 7500;

/** Warnung, wenn AGENTS.md über `AGENTS_MD_WARN_BYTES` wächst, sonst `null`. */
export function agentsMdSizeWarning(bytes) {
	if (bytes <= AGENTS_MD_WARN_BYTES) return null;
	return (
		`Warnung: AGENTS.md des Starters hat ${bytes} Bytes (Warnschwelle ${AGENTS_MD_WARN_BYTES}, Grenze ${AGENTS_BLOCK_MAX_BYTES}). ` +
		'Verschiebe Einzelheiten in einen Skill oder nach docs/ und lass in AGENTS.md nur einen Verweis.'
	);
}
const DOCS_PATH = 'node_modules/@dealsystem/site/docs';
const GENERATED = '<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->';

/** Gruppen der Bausteine im kompakten Index von AGENTS.md. Jede Komponente steht in genau einer Gruppe. */
const COMPONENT_GROUPS = [
	['Text', ['Text', 'RichText', 'Link']],
	['Bild und Video', ['MediaImage', 'MediaVideo']],
	['Formular und Listen', ['LeadForm', 'LeadHoneypot', 'CollectionList']],
	['Karte', ['MapEmbed']],
	['Einwilligung', ['CookieBanner', 'ConsentGate', 'Tracking']],
	['Rechtliches', ['Impressum', 'Datenschutz', 'SiteFooterLegal']],
	['Google und Teilen', ['Seo', 'SiteHead']],
];

/** Skills des Starters in der Reihenfolge, in der sie meist gebraucht werden. */
const SKILLS = [
	['neue-seite', 'neue Seite oder neuer Abschnitt, Texte und austauschbare Fotos'],
	['formular-anbinden', 'Kontakt- oder Anfrageformular'],
	['funnel-mehrstufig', 'eigenes Formular in Schritten (Funnel)'],
	['angebote-einbauen', 'Angebote, Referenzen und andere Sammlungen aus dem CRM'],
	['prueffehler-beheben', 'Meldungen von `check` oder abgelehnte Version'],
	['veroeffentlichen', 'hochladen, Vorschau zeigen, nach dem Ja veröffentlichen'],
	['domain-verbinden', 'eigene Domain des Kunden'],
];

/** Reihenfolge und Gruppen der Komponenten in der Übersicht. */
const COMPONENTS = [
	'Text',
	'RichText',
	'Link',
	'MediaImage',
	'MediaVideo',
	'LeadForm',
	'LeadHoneypot',
	'CollectionList',
	'MapEmbed',
	'CookieBanner',
	'ConsentGate',
	'Tracking',
	'Impressum',
	'Datenschutz',
	'SiteFooterLegal',
	'Seo',
	'SiteHead',
];

const read = (file) => readFile(file, 'utf8');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Alle Dateien unter `dir` (relativ, mit `/`), sortiert. Links brechen ab: das Paket liefert nur echte Dateien. */
async function walkFiles(dir, base = dir) {
	const entries = await readdir(dir, { withFileTypes: true }).catch((e) => {
		if (e.code === 'ENOENT') return [];
		throw e;
	});
	const out = [];
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isSymbolicLink())
			throw new Error(`${relative(ROOT, full)} ist ein Link; erlaubt sind nur Dateien.`);
		if (e.isDirectory()) out.push(...(await walkFiles(full, base)));
		else if (e.isFile()) out.push(relative(base, full).split('\\').join('/'));
	}
	return out.sort();
}

/**
 * Skills und Cursor-Regel des Starters als Agenten-Dateien des Pakets, dazu `manifest.json`: Zielpfad im Projekt,
 * Datei im Paket, SHA-256 und die Prüfsummen früher ausgelieferter Fassungen (`previous`). Eine Projektdatei, die
 * byte-genau einer früheren Fassung gleicht, darf `sync` erneuern; alles andere hat der Kunde geändert.
 * `previous` wächst aus der Fassung auf der Platte: ändert sich eine Datei, wandert ihre alte Prüfsumme hinein.
 */
async function buildAgentFiles(files) {
	let before = { files: [] };
	try {
		before = JSON.parse(await read(AGENT_FILES_MANIFEST));
	} catch {
		// Noch keine Fassung ausgeliefert.
	}
	const old = new Map((before.files ?? []).map((f) => [f.target, f]));
	const entries = [];
	for (const dir of AGENT_FILE_DIRS) {
		for (const rel of await walkFiles(join(TEMPLATE, dir))) {
			const target = `${dir}/${rel}`;
			const source = `${dir.slice(1)}/${rel}`;
			const content = await read(join(TEMPLATE, target));
			const hash = sha256(content);
			const prev = old.get(target);
			const previous = [
				...new Set([...(prev?.previous ?? []), ...(prev && prev.sha256 !== hash ? [prev.sha256] : [])]),
			]
				.filter((h) => h !== hash)
				.sort();
			files.set(join(AGENT_FILES, source), content);
			entries.push({ target, source, sha256: hash, previous });
		}
	}
	if (entries.length === 0)
		throw new Error('Der Starter hat keine Agenten-Dateien unter .claude/ oder .cursor/.');
	files.set(AGENT_FILES_MANIFEST, `${JSON.stringify({ manifestVersion: 1, files: entries }, null, '\t')}\n`);
}

// ------------------------------------------------------------ Quellen lesen

/** `@component`-Kommentar und Typen einer Komponente. */
async function readComponent(name) {
	const source = await read(join(LIB, 'components', `${name}.svelte`));
	const doc = /<!--\s*\n@component\n([\s\S]*?)-->/.exec(source)?.[1]?.trim();
	if (!doc) throw new Error(`${name}.svelte hat keinen @component-Kommentar.`);
	const moduleScript = /<script lang="ts" module>\n([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '';
	// Nur Typen (auch die Hilfstypen, auf die sie verweisen); Konstanten gehören nicht in die Anleitung.
	const script = dedent(moduleScript);
	const types = [
		...script.matchAll(/(?:^\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?^(?:export )?(interface|type) \w+/gm),
	]
		.map((match) => {
			const offset = match[0].search(/^(?:export )?(?:interface|type) /m);
			return match[0].slice(0, offset) + declarationAt(script, match.index + offset, match[1]);
		})
		.join('\n\n');
	const summary = doc
		.split(/\n\s*\n/)[0]
		.replace(/\s+/g, ' ')
		.trim();
	return { name, doc, types, summary };
}

function dedent(text) {
	const lines = text.replace(/\t/g, '  ').split('\n');
	const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
	return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

/** Exportierte Deklarationen mit JSDoc aus einer TypeScript-Datei. `@internal` wird ausgelassen. */
async function readExports(file) {
	const source = await read(join(LIB, file));
	const out = new Map();
	const pattern =
		/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\nexport (?:declare )?(async function|function|const|interface|type) (\w+)/g;
	for (const match of source.matchAll(pattern)) {
		const [, rawDoc, kind, name] = match;
		const doc = rawDoc
			.split('\n')
			.map((line) => line.replace(/^[ \t]*\* ?/, ''))
			.join('\n')
			.trim();
		if (/@internal/.test(doc)) continue;
		const start = match.index + match[0].length - `export ${kind} ${name}`.length;
		out.set(name, { name, kind, doc, declaration: declarationAt(source, start, kind) });
	}
	return out;
}

/** Schneidet die Deklaration aus: Signatur einer Funktion, ganzer Typ bei interface/type. */
function declarationAt(source, start, kind) {
	const rest = source.slice(start);
	if (kind.endsWith('function')) {
		// Bis zur öffnenden Klammer des Rumpfs auf Klammertiefe 0.
		let depth = 0;
		for (let i = 0; i < rest.length; i++) {
			const c = rest[i];
			if (c === '(' || c === '<') depth++;
			else if (c === ')' || (c === '>' && rest[i - 1] !== '=')) depth--;
			else if (c === '{' && depth === 0) {
				// `{` in einem Objekt-Typ des Rückgabewerts überspringen: Rumpf beginnt nach `) … {` am Zeilenende.
				const line = rest.slice(0, i + 1);
				if (/\{\s*$/.test(line) && /\n/.test(rest.slice(i + 1, i + 2))) return rest.slice(0, i).trim() + ';';
			}
		}
		return rest.split('\n')[0];
	}
	if (kind === 'const') return rest.split('\n')[0].replace(/\s*=.*$/, ';');
	// interface endet mit seiner schließenden Klammer, type mit dem Semikolon außerhalb aller Klammern.
	let depth = 0;
	for (let i = 0; i < rest.length; i++) {
		const c = rest[i];
		if (c === '{' || c === '(') depth++;
		else if (c === '}' || c === ')') {
			depth--;
			if (depth === 0 && kind === 'interface') return rest.slice(0, i + 1);
		} else if (c === ';' && depth === 0) return rest.slice(0, i + 1);
	}
	return rest.split('\n')[0];
}

/** JSDoc → Markdown: Text, dann `@example` als Codeblock. */
function docToMarkdown(doc) {
	const [text, ...examples] = doc.split(/\n@example\n?/);
	const lines = text.split('\n').filter((line) => !line.startsWith('@'));
	let out = lines.join('\n').trim();
	for (const example of examples) out += `\n\n\`\`\`ts\n${example.trim()}\n\`\`\``;
	return out;
}

function entry({ name, kind, doc, declaration }) {
	const title = kind.endsWith('function') ? `${name}()` : name;
	// Bei Konstanten sagt die Deklaration nichts; dort steht alles im Kommentar.
	const code = kind === 'const' ? '' : `\n\n\`\`\`ts\n${declaration.replace(/^export /, '').trim()}\n\`\`\``;
	return `### ${title}\n\n${docToMarkdown(doc)}${code}\n`;
}

async function pick(file, names) {
	const all = await readExports(file);
	return names.map((name) => {
		const found = all.get(name);
		if (!found) throw new Error(`${file}: \`${name}\` fehlt oder hat kein JSDoc.`);
		return found;
	});
}

// ------------------------------------------------------------- Seiten bauen

async function build() {
	const site = JSON.parse(await read(join(SITE, 'package.json')));
	const version = site.version;
	const cli = await import(join(ROOT, 'packages/cli/dist/index.js'));
	const components = await Promise.all(COMPONENTS.map(readComponent));
	const files = new Map();
	const page = (name, body) => files.set(join(DOCS_OUT, name), `${body.trim()}\n`);

	// --- Von Hand geschriebene Seiten: unverändert übernehmen.
	const handwritten = (await readdir(DOCS_SRC))
		.filter((f) => f.endsWith('.md') && f !== 'agents-block.md')
		.sort();
	for (const file of handwritten) page(file, await read(join(DOCS_SRC, file)));

	// --- komponenten.md
	page(
		'komponenten.md',
		`${GENERATED}\n\n# Bausteine von @dealsystem/site ${version}\n\n` +
			"Alle Bausteine kommen aus einem Import: `import { … } from '@dealsystem/site'`.\n" +
			'Pflichtangaben sind im Typ ohne `?` notiert; fehlt eine, meldet `npm run check` einen Fehler.\n\n' +
			components
				.map(
					(c) =>
						`## ${c.name}\n\n${c.doc}\n\n` +
						(c.types ? `Eigenschaften:\n\n\`\`\`ts\n${c.types}\n\`\`\`\n` : ''),
				)
				.join('\n') +
			'\n## consent\n\n' +
			(await pick('consent/consent.svelte.ts', ['consent', 'ConsentCategory'])).map(entry).join('\n') +
			'\n## Eigene Formular-Oberfläche\n\n' +
			'Für mehrstufige Funnels, Rechner und Quiz. Vorlage: Skill `funnel-mehrstufig`.\n\n' +
			(
				await pick('client/leadClient.svelte.ts', [
					'createLeadClient',
					'LeadResult',
					'LeadFailureReason',
					'LeadFallback',
				])
			)
				.map(entry)
				.join('\n') +
			(await pick('client/funnelState.svelte.ts', ['createFunnelState', 'FunnelStep']))
				.map(entry)
				.join('\n') +
			'\n## Kampagnen-Parameter\n\n' +
			(await pick('client/attribution.ts', ['getCampaignParam'])).map(entry).join('\n') +
			'\n## Inhalte im Browser nachladen\n\n' +
			(await pick('client/collections.ts', ['loadCollection', 'loadEntry'])).map(entry).join('\n'),
	);

	// --- inhalte.md
	page(
		'inhalte.md',
		`${GENERATED}\n\n# Inhalte aus dem CRM laden (@dealsystem/site/content)\n\n` +
			'Diese Funktionen laufen nur, während die Seite erzeugt wird: in `+page.server.ts` oder\n' +
			'`+layout.server.ts` mit `export const prerender = true`. Sie lesen die Inhalte, die\n' +
			'`npx dealsystem sync` aus dem CRM geholt hat (`.dealsystem/content.json`). Nie in `+page.ts`,\n' +
			'nie in einer Komponente aufrufen. Ändert der Kunde etwas im CRM, erzeugt DealSystem die Seite neu.\n\n' +
			(
				await pick('content/index.ts', [
					'getCollection',
					'getEntry',
					'collectionEntries',
					'getSite',
					'getSlots',
					'sitemap',
					'robots',
				])
			)
				.map(entry)
				.join('\n') +
			'\n## Typen\n\n' +
			[
				...(await pick('content/index.ts', ['CollectionQuery'])),
				...(await pick('types.ts', ['CollectionEntry', 'MediaRef', 'SafeHtml', 'ContactProfile'])),
			]
				.map(entry)
				.join('\n'),
	);

	// --- konfiguration.md
	page(
		'konfiguration.md',
		`${GENERATED}\n\n# dealsystem.config.ts (@dealsystem/site/config)\n\n` +
			'Eine Datei beschreibt die Seite: ihre Kennung, die Sammlungen (Inhalte aus dem CMS) und die Formulare.\n' +
			'Felder eines Formulars stehen nur hier. Nach einer Änderung an Sammlungen: `npx dealsystem sync`.\n\n' +
			(
				await pick('config/index.ts', [
					'defineSite',
					'validateSiteConfig',
					'handleHttpError',
					'siteApiOrigin',
				])
			)
				.map(entry)
				.join('\n') +
			'\n## Typen\n\n' +
			(
				await pick('types.ts', [
					'SiteConfig',
					'FunnelDef',
					'FunnelFieldDef',
					'FieldType',
					'HiddenFieldSource',
					'FunnelCrmConfig',
					'StandardFieldKey',
					'CollectionDef',
					'CollectionFieldDef',
					'CollectionFieldType',
				])
			)
				.map(entry)
				.join('\n'),
	);

	// --- regeln.md
	const stage = (rule) =>
		rule.stages.length === 0
			? 'Build'
			: rule.stages.map((s) => (s === 'source' ? 'Quelltext' : 'fertige Seite')).join(' + ');
	const cell = (text) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
	page(
		'regeln.md',
		`${GENERATED}\n\n# Regeln von \`dealsystem check\` (Regelsatz ${cli.RULE_SET_VERSION})\n\n` +
			'`npx dealsystem check` prüft den Quelltext, `npx dealsystem check --output build` nach `npm run build`\n' +
			'zusätzlich die fertige Seite. Dieselben Regeln laufen beim Hochladen noch einmal auf dem Server; dort\n' +
			'entscheidet sich, ob die Seite angenommen wird. Ein Fehler verhindert das Hochladen, eine Warnung nicht.\n' +
			'Jede Meldung nennt Datei, Zeile und die Korrektur. Behebe die Ursache; schalte keine Regel ab.\n\n' +
			'| Regel | Art | Prüft an | Was geprüft wird | So behebst du es |\n|---|---|---|---|---|\n' +
			cli.RULES.map(
				(rule) =>
					`| \`${rule.id}\` | ${rule.severity === 'error' ? 'Fehler' : 'Warnung'} | ${stage(rule)} | ${cell(rule.title)} | ${cell(rule.fix)} |`,
			).join('\n') +
			'\n\n## Freigegebene Pakete\n\n' +
			'In `package.json` dürfen nur diese Pakete stehen (`DEP-001`). Aktuelle Liste: `npx dealsystem check --allowed`.\n\n' +
			cli.ALLOWED_PACKAGES.map((p) => `- \`${p.name}\` – ${p.reason}`).join('\n'),
	);

	// --- befehle.md
	const commands = Object.entries(cli.COMMANDS);
	page(
		'befehle.md',
		`${GENERATED}\n\n# Befehle der CLI (\`npx dealsystem …\`)\n\n` +
			'Alle Befehle laufen ohne Rückfragen. Mit `--json` kommt das Ergebnis als JSON. Weitere allgemeine\n' +
			'Optionen: `--dir <ordner>`, `--site <id>`, `--quiet`.\n\n' +
			commands
				.map(
					([, c]) =>
						`## \`${c.usage}\`\n\n${c.summary}.\n` +
						(c.flags.length > 0
							? `\n${c.flags.map((f) => `- \`${f.split('  ')[0]}\` – ${f.split('  ').slice(1).join(' ')}`).join('\n')}\n`
							: ''),
				)
				.join('\n') +
			'\n## Exit-Codes\n\n' +
			`- \`${cli.EXIT.ok}\` – in Ordnung\n` +
			`- \`${cli.EXIT.failed}\` – Prüfung oder Build fehlgeschlagen: Meldungen lesen, beheben, wiederholen\n` +
			`- \`${cli.EXIT.usage}\` – falscher Aufruf, oder der Mensch muss erst zustimmen (\`confirmation_required\`)\n` +
			`- \`${cli.EXIT.auth}\` – nicht angemeldet: \`npx dealsystem login --start\`\n` +
			`- \`${cli.EXIT.api}\` – DealSystem nicht erreichbar: später noch einmal versuchen\n`,
	);

	// --- agents-block.md
	const grouped = COMPONENT_GROUPS.flatMap(([, names]) => names);
	if (grouped.length !== COMPONENTS.length || COMPONENTS.some((name) => !grouped.includes(name))) {
		throw new Error('COMPONENT_GROUPS muss jede Komponente aus COMPONENTS genau einmal enthalten.');
	}
	const skillDirs = (await readdir(join(TEMPLATE, '.claude/skills'))).sort();
	if (JSON.stringify(SKILLS.map(([name]) => name).sort()) !== JSON.stringify(skillDirs)) {
		throw new Error(`SKILLS passt nicht zu den Skills des Starters: ${skillDirs.join(', ')}.`);
	}
	const docsIndex = [
		['ablauf.md', 'der ganze Weg bis zur veröffentlichten Seite'],
		['komponenten.md', 'alle Bausteine mit Pflichtangaben und Beispielen'],
		['inhalte.md', 'Angebote und andere Sammlungen laden'],
		['konfiguration.md', 'Formulare und Sammlungen in dealsystem.config.ts'],
		['gestaltung.md', 'Farben, Schrift, Bilder, Barrierefreiheit'],
		['rechtstexte.md', 'Impressum, Datenschutz, Cookie-Hinweis'],
		['seo.md', 'Titel, Beschreibung, Vorschaubild, Favicon, nicht bei Google'],
		['regeln.md', 'alle Prüfregeln mit Korrektur'],
		['befehle.md', 'alle Befehle mit Optionen'],
	];
	for (const [file] of docsIndex) {
		if (!files.has(join(DOCS_OUT, file)))
			throw new Error(`Der Index nennt ${file}, die Seite gibt es aber nicht.`);
	}
	const block = (await read(join(DOCS_SRC, 'agents-block.md')))
		.replaceAll('{{VERSION}}', version)
		.replaceAll('{{DOCS}}', DOCS_PATH)
		.replace(
			'{{BAUSTEINE}}',
			COMPONENT_GROUPS.map(
				([title, names]) => `- ${title}: ${names.map((name) => `\`<${name}>\``).join(', ')}`,
			).join('\n'),
		)
		.replace(
			'{{BEFEHLE}}',
			`\`npx dealsystem <befehl>\`: ${commands.map(([name]) => `\`${name}\``).join(', ')}. ` +
				'Was sie tun, Optionen und Exit-Codes: `befehle.md`.',
		)
		.replace('{{SKILLS}}', SKILLS.map(([name, text]) => `- \`${name}\` – ${text}`).join('\n'))
		.replace('{{NACHSCHLAGEN}}', docsIndex.map(([file, text]) => `- \`${file}\` – ${text}`).join('\n'))
		.trim();
	if (/\{\{[A-Z]+\}\}/.test(block)) throw new Error('In agents-block.md steht ein unbekannter Platzhalter.');
	const bytes = Buffer.byteLength(block, 'utf8');
	if (bytes > AGENTS_BLOCK_MAX_BYTES) {
		throw new Error(
			`Der AGENTS.md-Block hat ${bytes} Bytes, erlaubt sind ${AGENTS_BLOCK_MAX_BYTES}. Kürze docs-src/agents-block.md.`,
		);
	}
	page('agents-block.md', block);

	// --- llms.txt
	files.set(
		join(DOCS_OUT, 'llms.txt'),
		`# @dealsystem/site ${version}\n\n` +
			'> Bausteine, Lade-Helfer und Regeln für statische SvelteKit-Websites, die DealSystem baut und hostet. ' +
			'Geschrieben für KI-Agenten, die im Auftrag eines Kunden ohne technische Vorkenntnisse arbeiten. Sprache: Deutsch.\n\n' +
			'Beginne mit agents-block.md. Die übrigen Seiten sind Nachschlagewerke zu je einem Thema.\n\n' +
			'## Anleitung\n\n' +
			'- [agents-block.md](agents-block.md): Regeln, Ablauf und Gesprächsführung; steht auch in AGENTS.md des Projekts\n' +
			docsIndex.map(([file, text]) => `- [${file}](${file}): ${text}`).join('\n') +
			'\n',
	);

	// --- Starter: AGENTS.md mit dem Block
	const agentsMd =
		'# Anleitung für KI-Agenten\n\n' +
		'Eigene Hinweise gehören über oder unter den Block; ihn erneuert `npx dealsystem sync`.\n\n' +
		`<!-- dealsystem:begin ${version} -->\n${block}\n<!-- dealsystem:end -->\n`;
	// Agenten lesen AGENTS.md ganz; manche kürzen lange Dateien. Deshalb gilt die Grenze für die ganze Datei.
	const agentsMdBytes = Buffer.byteLength(agentsMd, 'utf8');
	if (agentsMdBytes > AGENTS_BLOCK_MAX_BYTES) {
		throw new Error(
			`AGENTS.md des Starters hat ${agentsMdBytes} Bytes, erlaubt sind ${AGENTS_BLOCK_MAX_BYTES}. Kürze docs-src/agents-block.md.`,
		);
	}
	files.set(join(TEMPLATE, 'AGENTS.md'), agentsMd);
	await buildAgentFiles(files);
	const warning = agentsMdSizeWarning(agentsMdBytes);
	if (warning) console.warn(warning);
	return { files, bytes, agentsMdBytes, version };
}

// ---------------------------------------------------------------- Ausführen

/** Baut alle Dateien und meldet, welche auf der Platte fehlen, veraltet oder überzählig sind. */
export async function diffAgentDocs() {
	const { files, bytes, agentsMdBytes, version } = await build();
	const stale = [];
	for (const [file, content] of files) {
		const current = await read(file).catch(() => null);
		if (current !== content) stale.push(relative(ROOT, file));
	}
	const expected = new Set(
		[...files.keys()].filter((f) => f.startsWith(DOCS_OUT)).map((f) => relative(DOCS_OUT, f)),
	);
	const extra = (await readdir(DOCS_OUT).catch(() => [])).filter((f) => !expected.has(f));
	const extraAgentFiles = (await walkFiles(AGENT_FILES))
		.map((f) => join(AGENT_FILES, f))
		.filter((f) => !files.has(f));
	return {
		files,
		stale,
		extra: [
			...extra.map((f) => join('packages/site/docs', f)),
			...extraAgentFiles.map((f) => relative(ROOT, f)),
		],
		bytes,
		agentsMdBytes,
		version,
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const check = process.argv.includes('--check');
	const { files, stale, extra, bytes } = await diffAgentDocs();
	if (check) {
		if (stale.length > 0 || extra.length > 0) {
			console.error(
				'Die Agenten-Anleitungen passen nicht zum Code. Führe `npm run docs` aus.\n' +
					[...stale.map((f) => `  veraltet: ${f}`), ...extra.map((f) => `  überzählig: ${f}`)].join('\n'),
			);
			process.exit(1);
		}
		console.log(`Agenten-Anleitungen sind aktuell (AGENTS.md-Block: ${bytes} Bytes).`);
	} else {
		for (const file of extra) await rm(join(ROOT, file));
		for (const [file, content] of files) {
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, content);
		}
		console.log(
			`${files.size} Dateien geschrieben (AGENTS.md-Block: ${bytes} Bytes von ${AGENTS_BLOCK_MAX_BYTES}).`,
		);
	}
}
