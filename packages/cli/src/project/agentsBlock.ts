// Ersetzt in AGENTS.md nur den markierten DealSystem-Block; was der Kunde darum herum schreibt, bleibt.

import { AGENTS_BLOCK_END } from '../check/sdk.js';

const BLOCK_RE = /<!--\s*dealsystem:begin\s+[^\s]+\s*-->[\s\S]*?<!--\s*dealsystem:end\s*-->/;

export function renderAgentsBlock(version: string, body: string): string {
	return `<!-- dealsystem:begin ${version} -->\n${body.trim()}\n${AGENTS_BLOCK_END}`;
}

export function updateAgentsMd(current: string | null, version: string, body: string): string {
	const block = renderAgentsBlock(version, body);
	if (current === null || current.trim() === '') return `${block}\n`;
	if (BLOCK_RE.test(current)) return current.replace(BLOCK_RE, () => block);
	return `${current.replace(/\s*$/, '')}\n\n${block}\n`;
}
