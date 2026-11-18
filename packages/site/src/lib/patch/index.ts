// „Patchen statt Bauen“ (Prototyp): schreibt neue Slot-Werte aus dem CRM in eine
// fertig gebaute Seite, ohne Kundencode auszuführen. Reine Funktion: Dateien
// rein, Dateien raus. Entpacken, Packen, sha256 und Speichern macht der Aufrufer.
//
// Voraussetzung ist eine Seite, deren Texte im Inhaltsblock je Seite stehen
// (`<SiteHead>` im Haupt-Layout, `manifest.contentPatch.delivery === 'dom'`).
// Dann steht jeder Slot-Wert an genau zwei Stellen jeder HTML-Datei: im
// Inhaltsblock und im Element mit `data-ds-slot`. Beide werden ersetzt, sonst
// nichts. Passt etwas nicht genau zum erwarteten Aufbau, kommt kein halb
// gepatchtes Artefakt heraus, sondern die Gründe, warum doch gebaut werden muss.
import { Parser } from 'htmlparser2';
import {
	CONTENT_BLOCK_PATTERN,
	CONTENT_BLOCK_VERSION,
	contentBlockTag,
	parseContentBlock,
	type ContentBlock,
} from '../contentBlock.js';
import { resolveMediaImage } from '../internal/mediaImage.js';
import { sanitizeRichtextHtml } from '../richtext/server.js';
import { resolveImageSlot, resolveLinkSlot, resolveTextSlot } from '../slots.js';
import type { ContentSlotDef, MediaRef, SiteManifest, SlotOverride } from '../types.js';

/** Warum nicht gepatcht werden kann. Dann baut der Core wie bisher neu. */
export interface PatchBlocker {
	code:
		| 'not-patchable'
		| 'bad-path'
		| 'bad-encoding'
		| 'block-missing'
		| 'blocks-differ'
		| 'markup-unknown'
		| 'richtext-empty'
		| 'image-reset'
		| 'image-alt'
		| 'image-sizes'
		| 'link-changed'
		| 'value-elsewhere';
	message: string;
	key?: string;
	file?: string;
}

export interface PatchInput {
	/** Alle Dateien des Artefakts, Pfad relativ ohne führenden Schrägstrich. */
	files: ReadonlyMap<string, Uint8Array>;
	/** Manifest der Version, die gepatcht wird (vom Build gemeldet). */
	manifest: SiteManifest;
	/** Neue Überschreibungen aus dem CRM, wie `snapshot.slots`. */
	slots: Record<string, SlotOverride>;
}

export type PatchResult =
	| {
			ok: true;
			/** Neues Artefakt: alle Dateien, geänderte ersetzt. */
			files: Map<string, Uint8Array>;
			/** Geänderte Dateien. Leer: Der Inhalt ist schon so, keine neue Version nötig. */
			changedFiles: string[];
			/** Slots, deren sichtbarer Wert sich ändert. */
			changedSlots: string[];
	  }
	| { ok: false; blockers: PatchBlocker[] };

// ------------------------------------------------------------ wie Svelte SSR

/** Maskierung wie `escape_html` in Svelte: Inhalt `&` und `<`, Attribut zusätzlich `"`. */
export function escapeHtml(value: string, isAttr = false): string {
	return value.replace(isAttr ? /[&"<]/g : /[&<]/g, (ch) =>
		ch === '&' ? '&amp;' : ch === '"' ? '&quot;' : '&lt;',
	);
}

/** Prüfsumme, die Svelte vor `{@html}` schreibt (nur in der Entwicklung geprüft). */
export function svelteHash(value: string): string {
	const str = value.replace(/\r/g, '');
	let hash = 5381;
	let i = str.length;
	while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
	return (hash >>> 0).toString(36);
}

const attr = (name: string, value: string | number | undefined) =>
	value === undefined ? '' : ` ${name}="${escapeHtml(String(value), true)}"`;

// ------------------------------------------------------------ Werte der Slots

interface SlotState {
	def: ContentSlotDef;
	text?: string;
	richtext?: string;
	image?: MediaRef | null;
	link?: string;
}

function stateOf(def: ContentSlotDef, block: ContentBlock): SlotState {
	const aliases = def.aliases;
	switch (def.type) {
		case 'text':
		case 'textarea':
			return {
				def,
				text:
					resolveTextSlot(block.slots, def.key, aliases) ??
					(typeof def.default === 'string' ? def.default : ''),
			};
		case 'richtext':
			return { def, richtext: block.richtext[def.key] ?? '' };
		case 'image':
			return { def, image: resolveImageSlot(block.slots, def.key, aliases) };
		case 'link':
			return { def, link: JSON.stringify(resolveLinkSlot(block.slots, def.key, aliases)) };
	}
}

/** Der Inhaltsblock, wie ihn ein frischer Build mit diesen Werten schreiben würde. */
export function buildContentBlock(manifest: SiteManifest, slots: Record<string, SlotOverride>): ContentBlock {
	const richtext: Record<string, string> = {};
	const defaults = manifest.contentPatch?.richtextDefaults ?? {};
	for (const def of manifest.slots) {
		if (def.type !== 'richtext') continue;
		// Wie `buildSiteData`: Text aus dem CRM gegen die Positiv-Liste, sonst der Standard aus dem Build.
		const override = resolveTextSlot(slots, def.key, def.aliases);
		if (override !== null) richtext[def.key] = sanitizeRichtextHtml(override);
		else if (defaults[def.key] !== undefined) richtext[def.key] = defaults[def.key]!;
	}
	return { v: CONTENT_BLOCK_VERSION, slots, richtext };
}

// ------------------------------------------------------------ HTML lesen

interface SlotElement {
	key: string;
	tag: string;
	/** Index direkt hinter `>` des öffnenden Tags. */
	innerStart: number;
	/** Index von `<` des schließenden Tags. */
	innerEnd: number;
}

/** Alle Elemente mit `data-ds-slot`, mit Lage ihres Inhalts im Quelltext. */
function findSlotElements(html: string): SlotElement[] | null {
	const found: SlotElement[] = [];
	const stack: { tag: string; key: string | undefined; innerStart: number }[] = [];
	let broken = false;
	const parser = new Parser(
		{
			onopentag(name, attribs) {
				stack.push({ tag: name, key: attribs['data-ds-slot'], innerStart: parser.endIndex + 1 });
			},
			onclosetag(name, isImplied) {
				const open = stack.pop();
				if (!open || open.tag !== name) {
					broken = true;
					return;
				}
				if (open.key === undefined) return;
				if (isImplied) {
					broken = true;
					return;
				}
				found.push({ key: open.key, tag: name, innerStart: open.innerStart, innerEnd: parser.startIndex });
			},
		},
		{ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
	);
	parser.write(html);
	parser.end();
	return broken ? null : found;
}

function readAttributes(tag: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const match of tag.matchAll(/\s([a-z-]+)="([^"]*)"/g)) {
		out.set(
			match[1]!,
			match[2]!
				.replace(/&quot;/g, '"')
				.replace(/&lt;/g, '<')
				.replace(/&amp;/g, '&'),
		);
	}
	return out;
}

// ------------------------------------------------------------ Ersetzen

const TEXT_INNER = /^([^<]*)((?:<!---->)?)$/;
const RICHTEXT_INNER = /^<!--([a-z0-9]*)-->([\s\S]*)<!---->$/;
const IMAGE_INNER = /^<!--\[-->((?:<source [^<>]*\/>)*)<!--\]--> <img( [^<>]*)\/>$/;

function renderImage(
	inner: string,
	key: string,
	media: MediaRef,
	codeAltKnown: boolean,
	blockers: PatchBlocker[],
	file: string,
): string | null {
	const match = IMAGE_INNER.exec(inner);
	if (!match) {
		blockers.push({
			code: 'markup-unknown',
			key,
			file,
			message: `Aufbau von <MediaImage key="${key}"> unbekannt.`,
		});
		return null;
	}
	const img = readAttributes(match[2]!);
	const sources = [...match[1]!.matchAll(/<source [^<>]*\/>/g)].map((m) => readAttributes(m[0]));
	const sizes = img.get('sizes') ?? sources[0]?.get('sizes');
	if (sizes === undefined) {
		blockers.push({ code: 'image-sizes', key, file, message: `Bildgrößen (sizes) von "${key}" unbekannt.` });
		return null;
	}
	const oldAlt = img.get('alt') ?? '';
	// Leerer Alternativtext heißt dekorativ: `<MediaImage>` lässt sonst keinen leeren zu.
	const decorative = oldAlt === '';
	let alt = '';
	if (!decorative) {
		if (media.alt) alt = media.alt;
		else if (codeAltKnown) alt = oldAlt;
		else {
			blockers.push({
				code: 'image-alt',
				key,
				file,
				message: `Das neue Bild für "${key}" hat keinen Alternativtext, und der aus dem Code ist nicht bekannt.`,
			});
			return null;
		}
	}
	const resolved = resolveMediaImage(media, alt);
	if (!resolved) return null;
	const sourceTags = resolved.sources
		.map((s) => `<source${attr('type', s.type)}${attr('srcset', s.srcset)}${attr('sizes', sizes)}/>`)
		.join('');
	const imgTag =
		'<img' +
		attr('class', img.get('class')) +
		attr('src', resolved.src) +
		attr('srcset', resolved.srcset) +
		attr('sizes', sizes) +
		attr('width', resolved.width) +
		attr('height', resolved.height) +
		attr('alt', resolved.alt) +
		attr('loading', img.get('loading')) +
		attr('fetchpriority', img.get('fetchpriority')) +
		attr('decoding', img.get('decoding')) +
		attr('data-ds-image', img.get('data-ds-image')) +
		'/>';
	return `<!--[-->${sourceTags}<!--]--> ${imgTag}`;
}

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._\-/@%+~ ]+$/;

/**
 * Schreibt neue Slot-Werte in ein fertiges Artefakt. Führt nichts aus, liest
 * nur HTML und JSON als Text.
 */
export function patchArtifact(input: PatchInput): PatchResult {
	const { files, manifest } = input;
	const blockers: PatchBlocker[] = [];
	const info = manifest.contentPatch;
	if (
		!info ||
		info.version !== CONTENT_BLOCK_VERSION ||
		info.delivery !== 'dom' ||
		info.blockers.length > 0
	) {
		return {
			ok: false,
			blockers: [
				{
					code: 'not-patchable',
					message: `Die Seite trägt keinen Inhaltsblock oder liest Slots im Code (${info?.blockers.join(', ') || 'kein contentPatch im Manifest'}).`,
				},
			],
		};
	}

	const decoder = new TextDecoder('utf-8', { fatal: true });
	const html = new Map<string, string>();
	const otherText = new Map<string, string>();
	for (const [path, bytes] of files) {
		if (!SAFE_PATH.test(path)) {
			blockers.push({
				code: 'bad-path',
				file: path,
				message: `Ungültiger Pfad im Artefakt: ${JSON.stringify(path)}`,
			});
			continue;
		}
		const isHtml = path.endsWith('.html');
		const isData = path.endsWith('.json') || path.endsWith('.js');
		if (!isHtml && !isData) continue;
		try {
			(isHtml ? html : otherText).set(path, decoder.decode(bytes));
		} catch {
			blockers.push({ code: 'bad-encoding', file: path, message: `${path} ist kein UTF-8.` });
		}
	}
	if (blockers.length > 0) return { ok: false, blockers };

	// Alter Block: in allen Seiten gleich.
	let oldBlockText: string | null = null;
	for (const [path, text] of html) {
		for (const match of text.matchAll(CONTENT_BLOCK_PATTERN)) {
			if (oldBlockText === null) oldBlockText = match[1]!;
			else if (oldBlockText !== match[1]) {
				blockers.push({
					code: 'blocks-differ',
					file: path,
					message: 'Die Seiten tragen verschiedene Inhaltsblöcke.',
				});
			}
		}
	}
	const oldBlock = parseContentBlock(oldBlockText);
	if (!oldBlock) {
		blockers.push({ code: 'block-missing', message: 'Kein lesbarer Inhaltsblock im Artefakt.' });
	}
	if (!oldBlock || blockers.length > 0) return { ok: false, blockers };

	const newBlock = buildContentBlock(manifest, input.slots);

	// Was ändert sich sichtbar?
	const changed = new Map<string, { before: SlotState; after: SlotState }>();
	for (const def of manifest.slots) {
		const before = stateOf(def, oldBlock);
		const after = stateOf(def, newBlock);
		if (JSON.stringify(before) === JSON.stringify(after)) continue;
		if (def.type === 'richtext' && (before.richtext === '') !== (after.richtext === '')) {
			// `<RichText>` gibt bei leerem Text gar kein Element aus.
			blockers.push({
				code: 'richtext-empty',
				key: def.key,
				message: `"${def.key}" wird leer oder ist es bisher.`,
			});
		}
		if (def.type === 'image' && !after.image) {
			blockers.push({
				code: 'image-reset',
				key: def.key,
				message: `"${def.key}" zurück auf das Bild aus dem Code: dessen Varianten kennt nur der Build.`,
			});
		}
		if (def.type === 'link') {
			blockers.push({
				code: 'link-changed',
				key: def.key,
				message: `Link "${def.key}": im Prototyp nicht gepatcht.`,
			});
		}
		changed.set(def.key, { before, after });
	}
	if (blockers.length > 0) return { ok: false, blockers };

	const newTag = contentBlockTag(newBlock);
	const out = new Map(files);
	const changedFiles: string[] = [];
	const encoder = new TextEncoder();

	for (const [path, source] of html) {
		const elements = findSlotElements(source);
		if (elements === null) {
			blockers.push({
				code: 'markup-unknown',
				file: path,
				message: `${path} lässt sich nicht sauber lesen.`,
			});
			continue;
		}
		const edits: { start: number; end: number; text: string }[] = [];
		for (const element of elements) {
			const change = changed.get(element.key);
			if (!change) continue;
			const inner = source.slice(element.innerStart, element.innerEnd);
			const { def } = change.after;
			if (def.type === 'text' || def.type === 'textarea') {
				const match = TEXT_INNER.exec(inner);
				if (!match) {
					blockers.push({
						code: 'markup-unknown',
						key: def.key,
						file: path,
						message: `Aufbau von <Text key="${def.key}"> unbekannt.`,
					});
					continue;
				}
				edits.push({
					start: element.innerStart,
					end: element.innerEnd,
					text: escapeHtml(change.after.text!) + match[2]!,
				});
			} else if (def.type === 'richtext') {
				const parts = RICHTEXT_INNER.exec(inner);
				if (!parts) {
					blockers.push({
						code: 'markup-unknown',
						key: def.key,
						file: path,
						message: `Aufbau von <RichText key="${def.key}"> unbekannt.`,
					});
					continue;
				}
				const value = change.after.richtext!;
				edits.push({
					start: element.innerStart,
					end: element.innerEnd,
					// Produktions-Builds schreiben eine leere Prüfsumme (`<!---->`), Server-Render in Tests eine echte.
					text: `<!--${parts[1] === '' ? '' : svelteHash(value)}-->${value}<!---->`,
				});
			} else if (def.type === 'image') {
				const rendered = renderImage(
					inner,
					def.key,
					change.after.image!,
					// War bisher kein Bild aus dem CRM gesetzt, steht der Alternativtext aus dem Code im HTML.
					change.before.image === null,
					blockers,
					path,
				);
				if (rendered !== null)
					edits.push({ start: element.innerStart, end: element.innerEnd, text: rendered });
			}
		}

		// Inhaltsblock ersetzen, samt Prüfsumme davor; Seiten ohne Server-Rendering (404-Rückfall) bekommen ihn.
		let blockFound = false;
		const blockPattern =
			/(?:<!--([a-z0-9]+)-->)?<script type="application\/json" id="ds-content">[^<]*<\/script>/g;
		for (const match of source.matchAll(blockPattern)) {
			blockFound = true;
			edits.push({
				start: match.index!,
				end: match.index! + match[0].length,
				text: (match[1] !== undefined && match[1] !== '' ? `<!--${svelteHash(newTag)}-->` : '') + newTag,
			});
		}
		if (!blockFound) {
			if (elements.length > 0) {
				blockers.push({
					code: 'block-missing',
					file: path,
					message: `${path} hat Slots, aber keinen Inhaltsblock.`,
				});
				continue;
			}
			const head = source.indexOf('</head>');
			if (head < 0) {
				blockers.push({ code: 'block-missing', file: path, message: `${path} hat kein </head>.` });
				continue;
			}
			edits.push({ start: head, end: head, text: newTag });
		}

		edits.sort((a, b) => b.start - a.start);
		let next = source;
		for (const edit of edits) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
		if (next !== source) {
			html.set(path, next);
			out.set(path, encoder.encode(next));
			changedFiles.push(path);
		}
	}

	// Gegenprobe: Ein alter Wert, der noch woanders steht (Titel, Code, Ladedaten), heißt, die Seite
	// benutzt ihn auf eine Weise, die nur ein Build richtig nachzieht.
	for (const [key, { before }] of changed) {
		const needles: { text: string; where: 'html' | 'data' }[] = [];
		if (before.text !== undefined && before.text.trim().length >= 12) {
			needles.push({ text: escapeHtml(before.text), where: 'html' });
			// Im Bundle stehen die Standardtexte ohnehin (als Props); ein Text aus dem CRM darf dort nie stehen.
			const def = before.def;
			if (resolveTextSlot(oldBlock.slots, def.key, def.aliases) !== null) {
				needles.push({ text: JSON.stringify(before.text).slice(1, -1), where: 'data' });
			}
		}
		for (const needle of needles) {
			const haystacks = needle.where === 'html' ? html : otherText;
			for (const [path, text] of haystacks) {
				const visible = needle.where === 'html' ? withoutSlots(text) : text;
				if (visible !== null && visible.includes(needle.text)) {
					blockers.push({
						code: 'value-elsewhere',
						key,
						file: path,
						message: `Der bisherige Wert von "${key}" steht in ${path} außerhalb des Slots.`,
					});
				}
			}
		}
	}
	if (blockers.length > 0) return { ok: false, blockers };

	return {
		ok: true,
		files: out,
		changedFiles: changedFiles.sort(),
		changedSlots: [...changed.keys()].sort(),
	};
}

/** HTML ohne Inhaltsblock und ohne den Inhalt der Slot-Elemente. */
function withoutSlots(source: string): string | null {
	const elements = findSlotElements(source);
	if (elements === null) return null;
	// Bereiche zusammenfassen (verschachtelte Slots), dann von hinten herausschneiden.
	const ranges: [number, number][] = [];
	for (const { innerStart, innerEnd } of [...elements].sort((a, b) => a.innerStart - b.innerStart)) {
		const last = ranges.at(-1);
		if (last && innerStart <= last[1]) last[1] = Math.max(last[1], innerEnd);
		else ranges.push([innerStart, innerEnd]);
	}
	let text = source;
	for (const [start, end] of ranges.reverse()) text = text.slice(0, start) + text.slice(end);
	return text.replace(CONTENT_BLOCK_PATTERN, '');
}
