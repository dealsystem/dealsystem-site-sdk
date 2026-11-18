// Vertrag der Vorlagen für fremde Dienste: `contract/external-presets.v1.json`. Der Core hält eine byte-gleiche
// Kopie und prüft `SELF_SITE_EXTERNAL_PRESETS` dagegen. Neu schreiben:
// UPDATE_CONTRACT=1 npx vitest run tests/externalPresetsContract.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveExternal } from '../src/lib/external/resolve.js';
import {
	externalPresetsContract,
	externalPresetsContractText,
	PRESET_NAMES,
} from '../src/lib/external/presets.js';
import type { ExternalDef } from '../src/lib/types.js';

const FILE = new URL('../contract/external-presets.v1.json', import.meta.url);
if (process.env.UPDATE_CONTRACT) writeFileSync(FILE, externalPresetsContractText());

it('die Datei passt byte-gleich zu den Vorlagen im Code (sonst: UPDATE_CONTRACT=1)', () => {
	expect(readFileSync(FILE, 'utf8')).toBe(externalPresetsContractText());
});

it('enthält jede Vorlage, nach Namen sortiert, mit allen sieben Direktiven', () => {
	const { version, presets } = externalPresetsContract();
	expect(version).toBe(1);
	expect(Object.keys(presets)).toEqual([...PRESET_NAMES].sort());
	for (const entry of Object.values(presets)) {
		expect(Object.keys(entry)).toEqual(['category', 'provider', 'hosts']);
		expect(Object.keys(entry.hosts)).toEqual(['script', 'connect', 'img', 'frame', 'media', 'style', 'font']);
	}
});

it('Hosts und Kategorie im Vertrag = was ein Manifest-Eintrag mit dieser Vorlage meldet', () => {
	const { presets } = externalPresetsContract();
	for (const name of PRESET_NAMES) {
		const [entry] = resolveExternal({ x: { preset: name } } as Record<string, ExternalDef>);
		expect(entry?.hosts, name).toEqual(presets[name]!.hosts);
		expect(entry?.category, name).toBe(presets[name]!.category);
		expect(entry?.provider, name).toBe(presets[name]!.provider);
	}
});
