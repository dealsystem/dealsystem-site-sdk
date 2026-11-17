// Markdown → geprüftes HTML, nur beim Build und nur für Standardtexte, die im
// Quelltext der Seite stehen (`<RichText key=… default="…">`). Richtext aus dem
// CRM rendert und bereinigt der DealSystem-Server; er kommt hier als fertiges
// HTML an und wird nie erneut geparst.
//
// Positiv-Liste wie im Core (`richtextHtml.ts`), aber ohne `img`: ein Bild aus
// Richtext käme von einer fremden Adresse und würde vor der Einwilligung laden.
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { plainParagraphs } from './escape.js';

/**
 * Obergrenze wie im Core. `marked` braucht auf präparierten Eingaben
 * quadratische Zeit; längere Texte werden nur maskiert.
 */
export const RICHTEXT_MAX_LENGTH = 20_000;

const ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'del',
	'sub',
	'sup',
	'mark',
	'small',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'a',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'th',
	'td',
	'caption',
];

const DROP_WITH_CONTENT = [
	'script',
	'style',
	'textarea',
	'option',
	'noscript',
	'iframe',
	'frame',
	'frameset',
	'object',
	'embed',
	'svg',
	'math',
	'template',
	'title',
	'xmp',
	'noembed',
	'noframes',
	'select',
];

const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		th: ['colspan', 'rowspan'],
		td: ['colspan', 'rowspan'],
	},
	allowedSchemes: ['http', 'https', 'mailto', 'tel'],
	allowedSchemesAppliedToAttributes: ['href'],
	allowProtocolRelative: false,
	disallowedTagsMode: 'discard',
	nonTextTags: DROP_WITH_CONTENT,
	transformTags: {
		// `target` nur `_blank`, und dann immer mit `rel`: sonst bekäme die
		// Zielseite über `window.opener` Zugriff auf den Tab.
		a: (tagName, attribs) => {
			const { target, rel: _rel, ...rest } = attribs;
			return target === '_blank'
				? { tagName, attribs: { ...rest, target, rel: 'noopener noreferrer' } }
				: { tagName, attribs: rest };
		},
	},
};

const markdown = new Marked({ gfm: true, breaks: false });

/**
 * Wandelt den Standardtext eines Richtext-Slots in geprüftes HTML um.
 * @internal Benutzt nur das Vite-Plugin.
 */
export function defaultRichtextToHtml(source: string | null | undefined): string {
	if (!source) return '';
	if (source.length > RICHTEXT_MAX_LENGTH) return plainParagraphs(source);
	let html: string;
	try {
		html = markdown.parse(source, { async: false });
	} catch {
		// Stack Overflow bei tief verschachtelten Zitaten oder Listen.
		return plainParagraphs(source);
	}
	return sanitizeHtml(html, OPTIONS);
}
