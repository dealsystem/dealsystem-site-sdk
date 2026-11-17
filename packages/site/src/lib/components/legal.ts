/** Telefonnummer für `tel:`-Links. */
export function telHref(phone: string): string {
	return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

/**
 * Ordnet die Überschriften eines Rechtstexts unter die Überschrift der Seite
 * ein. Die Komponente setzt die Hauptüberschrift selbst; die Überschriften im
 * Text des Kunden beginnen deshalb eine Ebene darunter und folgen ohne Lücke
 * aufeinander (h1, h3 im Text wird h2, h3 auf der Seite). So bleibt es bei
 * einer Hauptüberschrift je Seite, egal wie der Text formatiert ist.
 */
export function nestHeadings(html: string, topLevel: number): string {
	const used = [...new Set([...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1])))].sort();
	if (used.length === 0) return html;
	const target = new Map(used.map((level, index) => [level, Math.min(6, topLevel + index)]));
	return html.replace(/<(\/?)h([1-6])(?=[\s>])/gi, (_all, slash: string, level: string) => {
		return `<${slash}h${target.get(Number(level))}`;
	});
}

/** Ob bereinigtes HTML sichtbaren Text enthält. */
export function hasVisibleText(html: string): boolean {
	return (
		html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.trim() !== ''
	);
}
