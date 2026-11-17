/** Maskiert Text für die Ausgabe als HTML. */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Text als maskierte Absätze. Rückfall, wenn kein geprüftes HTML vorliegt. */
export function plainParagraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
		.join('');
}

/** Obergrenze für Markdown. Längere Texte werden nicht geparst, nur maskiert. */
export const RICHTEXT_MAX_LENGTH = 100_000;

/** Erlaubte Tags im Richtext. Eine Liste für Build und Browser. */
export const RICHTEXT_ALLOWED_TAGS: readonly string[] = [
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

/** Erlaubte Attribute je Tag. */
export const RICHTEXT_ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
	a: ['href', 'title', 'target', 'rel'],
	th: ['colspan', 'rowspan', 'scope'],
	td: ['colspan', 'rowspan'],
};
