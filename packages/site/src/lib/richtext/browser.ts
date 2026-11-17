// Markdown → geprüftes HTML im Browser, für Richtext, der erst zur Laufzeit
// über die Site-API kommt. Wird nur bei Bedarf nachgeladen.
import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import {
	plainParagraphs,
	RICHTEXT_ALLOWED_ATTRIBUTES,
	RICHTEXT_ALLOWED_TAGS,
	RICHTEXT_MAX_LENGTH,
} from './escape.js';

const markdown = new Marked({ gfm: true, breaks: false });
const ALLOWED_ATTR = [...new Set(Object.values(RICHTEXT_ALLOWED_ATTRIBUTES).flat())];

/**
 * Wandelt Markdown im Browser in geprüftes HTML um.
 * @internal
 */
export function richtextToHtmlInBrowser(source: string): string {
	if (!source) return '';
	if (source.length > RICHTEXT_MAX_LENGTH) return plainParagraphs(source);
	const html = markdown.parse(source, { async: false });
	const clean = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [...RICHTEXT_ALLOWED_TAGS],
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		// DOMPurify prüft damit jeden Attributwert, nicht nur Adressen: erlaubt
		// sind die vier Schemata und alles, was gar kein Schema hat.
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
		RETURN_DOM_FRAGMENT: true,
	});
	for (const link of clean.querySelectorAll('a')) {
		// Adressen ohne Schema (`//fremd.de`) zeigen auf fremde Server.
		if (link.getAttribute('href')?.trim().startsWith('//')) link.removeAttribute('href');
		if (link.getAttribute('target') === '_blank') link.setAttribute('rel', 'noopener noreferrer');
		else link.removeAttribute('target');
	}
	const holder = document.createElement('div');
	holder.append(clean);
	return holder.innerHTML;
}
