// QUA-009: Zeitpunkte in `<Zeitfenster>`. Nur mit fester Zeichenkette und Zeitzone kann DealSystem zur Grenze neu
// bauen, und nur mit Zeitzone ist klar, welche Uhrzeit gemeint ist.

import { scanZeitfenster, zeitpunktFehlerText } from '@dealsystem/site/vite';
import { sourceRule, type SourceRule } from '../rule.js';
import type { RawFinding } from '../types.js';

const qua009 = sourceRule('QUA-009', (ctx) => {
	const out: RawFinding[] = [];
	for (const path of ctx.svelteFiles()) {
		for (const fenster of scanZeitfenster(ctx.text(path) ?? '')) {
			if (fenster.grenzen.length === 0) {
				out.push(
					ctx.at(path, fenster.start, '`<Zeitfenster>` ohne `ab` und `bis` zeigt seinen Inhalt immer.'),
				);
				continue;
			}
			for (const grenze of fenster.grenzen) {
				if (grenze.value === null) {
					out.push(
						ctx.at(
							path,
							grenze.start,
							`\`<Zeitfenster ${grenze.name}={…}>\` ist keine feste Zeichenkette. Im Browser schaltet es um, aber DealSystem kann zu dieser Grenze nicht neu bauen: Im HTML (Google, Vorschauen) bleibt der alte Stand bis zum nächsten Hochladen.`,
						),
					);
				} else if (grenze.fehler) {
					out.push(
						ctx.at(
							path,
							grenze.start,
							`\`<Zeitfenster>\`: ${zeitpunktFehlerText(grenze.name, grenze.value, grenze.fehler)}`,
						),
					);
				}
			}
			const ab = fenster.grenzen.find((g) => g.name === 'ab')?.ms ?? null;
			const bis = fenster.grenzen.find((g) => g.name === 'bis')?.ms ?? null;
			if (ab !== null && bis !== null && ab >= bis) {
				out.push(
					ctx.at(
						path,
						fenster.start,
						'`<Zeitfenster>`: `ab` liegt nicht vor `bis`, der Inhalt erscheint nie.',
					),
				);
			}
		}
	}
	return out;
});

export const scheduleSourceRules: SourceRule[] = [qua009];
