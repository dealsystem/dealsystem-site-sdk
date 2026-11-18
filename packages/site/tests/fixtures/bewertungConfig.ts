// Das Formular „bewertung“ genau so, wie es im Skill `funnel-mehrstufig` steht: aus SKILL.md gelesen, damit die
// Anleitung und der getestete Stand nicht auseinanderlaufen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FunnelDef } from '../../src/lib/types.js';

// Pfad statt URL: Unter jsdom ist `URL` die Klasse von jsdom, die `node:fs` nicht annimmt.
export const SKILL_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../../create/template/.claude/skills/funnel-mehrstufig',
);

export function bewertungConfig(): FunnelDef {
	const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
	const snippet = /```ts\n(bewertung: \{[\s\S]*?\n\},)\n```/.exec(skill)?.[1];
	if (!snippet) throw new Error('SKILL.md enthält das Formular „bewertung“ nicht mehr.');
	// Ein Objekt-Literal aus der eigenen Anleitung, kein fremder Code.
	return (new Function(`return { ${snippet} };`)() as { bewertung: FunnelDef }).bewertung;
}
