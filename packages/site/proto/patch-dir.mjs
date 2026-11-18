// Prototyp „Patchen statt Bauen“: wendet patchArtifact auf ein entpacktes
// Artefakt an und misst die Zeit. Liest nur Dateien, führt nichts daraus aus.
// Aufruf: node proto/patch-dir.mjs <site-dir> <manifest.json> <snapshot.json> <out-dir>
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { patchArtifact } from '../dist/patch/index.js';

const [siteDir, manifestFile, snapshotFile, outDir] = process.argv.slice(2);

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(path)));
		else if (entry.isFile()) out.push(path);
		else throw new Error(`Kein reguläres File: ${path}`);
	}
	return out;
}

const t0 = performance.now();
const files = new Map();
for (const path of await walk(siteDir))
	files.set(relative(siteDir, path), new Uint8Array(await readFile(path)));
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
const t1 = performance.now();
const result = patchArtifact({ files, manifest, slots: snapshot.slots });
const t2 = performance.now();
if (!result.ok) {
	console.log(JSON.stringify({ ok: false, blockers: result.blockers }, null, 2));
	process.exit(2);
}
for (const [path, bytes] of result.files) {
	await mkdir(dirname(join(outDir, path)), { recursive: true });
	await writeFile(join(outDir, path), bytes);
}
const t3 = performance.now();
console.log(
	JSON.stringify({
		ok: true,
		files: files.size,
		changedFiles: result.changedFiles,
		changedSlots: result.changedSlots,
		ms: { lesen: +(t1 - t0).toFixed(1), patchen: +(t2 - t1).toFixed(1), schreiben: +(t3 - t2).toFixed(1) },
	}),
);
