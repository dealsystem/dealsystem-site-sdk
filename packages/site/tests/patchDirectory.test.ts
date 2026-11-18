// Ein entpacktes Artefakt lesen, ohne Links zu folgen.
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readArtifactDirectory, UnsafeArtifactError } from './reference/patchDirectory.js';

let dir: string;
let outside: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'ds-patch-'));
	outside = await mkdtemp(join(tmpdir(), 'ds-geheim-'));
	await writeFile(join(outside, 'geheim.txt'), 'GEHEIM');
	await mkdir(join(dir, '_app/immutable'), { recursive: true });
	await writeFile(join(dir, 'index.html'), '<html></html>');
	await writeFile(join(dir, 'über-uns.html'), '<html>ü</html>');
	await writeFile(join(dir, '_app/immutable/a.js'), 'x');
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

it('liest alle regulären Dateien mit relativen Pfaden', async () => {
	const files = await readArtifactDirectory(dir);
	expect([...files.keys()].sort()).toEqual(['_app/immutable/a.js', 'index.html', 'über-uns.html']);
	expect(new TextDecoder().decode(files.get('über-uns.html'))).toBe('<html>ü</html>');
});

it('bricht bei einem Symlink auf eine Datei ab', async () => {
	await symlink(join(outside, 'geheim.txt'), join(dir, 'x.html'));
	await expect(readArtifactDirectory(dir)).rejects.toThrow(UnsafeArtifactError);
});

it('bricht bei einem Symlink auf einen Ordner ab, statt ihm zu folgen', async () => {
	await symlink(outside, join(dir, 'ordner'));
	await expect(readArtifactDirectory(dir)).rejects.toThrow(/keine reguläre Datei/);
});

it('bricht bei einem Hardlink ab', async () => {
	await link(join(outside, 'geheim.txt'), join(dir, 'h.html'));
	await expect(readArtifactDirectory(dir)).rejects.toThrow(/Hardlink/);
});

it('hält Grenzen für Anzahl und Größe ein', async () => {
	await expect(readArtifactDirectory(dir, { maxFiles: 2 })).rejects.toThrow(/mehr als 2 Dateien/);
	await expect(readArtifactDirectory(dir, { maxTotalBytes: 10 })).rejects.toThrow(/größer als 10/);
});

it('hält die Tiefe ein, ohne Rekursion', async () => {
	const deep = join(dir, ...Array(40).fill('d'));
	await mkdir(deep, { recursive: true });
	await writeFile(join(deep, 'x.html'), 'x');
	await expect(readArtifactDirectory(dir)).rejects.toThrow(/zu tief/);
});
