// Markdown → geprüftes HTML, beim Build in Node. Positiv-Liste: nur übliche
// Formatierung bleibt. Bilder sind nicht erlaubt (sie kämen ohne Alternativtext
// und von fremden Adressen); Bilder laufen über <MediaImage>.
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import {
	plainParagraphs,
	RICHTEXT_ALLOWED_ATTRIBUTES,
	RICHTEXT_ALLOWED_TAGS,
	RICHTEXT_MAX_LENGTH,
} from './escape.js';

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
	allowedTags: [...RICHTEXT_ALLOWED_TAGS],
	allowedAttributes: Object.fromEntries(
		Object.entries(RICHTEXT_ALLOWED_ATTRIBUTES).map(([tag, attrs]) => [tag, [...attrs]]),
	),
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
 * Wandelt Markdown in geprüftes HTML um. Läuft nur beim Build.
 * @internal
 */
export function richtextToHtml(source: string | null | undefined): string {
	if (!source) return '';
	if (source.length > RICHTEXT_MAX_LENGTH) return plainParagraphs(source);
	const html = markdown.parse(source, { async: false });
	return sanitizeHtml(html, OPTIONS);
}
