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
