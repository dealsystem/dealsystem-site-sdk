// Eine Quelle: Skills und Cursor-Regel des Starters liegen byte-gleich unter `agent-files/` im Paket, das
// Manifest nennt genau diese Dateien mit ihrer Prüfsumme. Ändert jemand nur eine Seite, wird das hier rot
// (und `npm run docs:check` meldet die Datei als veraltet).

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(SITE, '../create/template');
const AGENT_FILES = join(SITE, 'agent-files');

function filesUnder(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile())
		.map((e) =>
			join(e.parentPath, e.name)
				.slice(dir.length + 1)
				.split('\\')
				.join('/'),
		)
		.sort();
}

interface Manifest {
	files: { target: string; source: string; sha256: string; previous: string[] }[];
}

const manifest = JSON.parse(readFileSync(join(AGENT_FILES, 'manifest.json'), 'utf8')) as Manifest;

it('agent-files enthält genau .claude/ und .cursor/ des Starters, byte-gleich', () => {
	const template = [
		...filesUnder(join(TEMPLATE, '.claude')).map((f) => `.claude/${f}`),
		...filesUnder(join(TEMPLATE, '.cursor')).map((f) => `.cursor/${f}`),
	];
	expect(manifest.files.map((f) => f.target)).toEqual(template);
	for (const f of manifest.files) {
		expect(f.source, f.target).toBe(f.target.slice(1));
		const shipped = readFileSync(join(AGENT_FILES, f.source));
		expect(shipped.equals(readFileSync(join(TEMPLATE, f.target))), f.target).toBe(true);
		expect(createHash('sha256').update(shipped).digest('hex'), f.target).toBe(f.sha256);
		expect(f.previous, f.target).not.toContain(f.sha256);
	}
	expect(filesUnder(AGENT_FILES)).toEqual(['manifest.json', ...manifest.files.map((f) => f.source)].sort());
});

it('das Paket liefert agent-files aus', () => {
	expect(pkg.files).toContain('agent-files');
});
