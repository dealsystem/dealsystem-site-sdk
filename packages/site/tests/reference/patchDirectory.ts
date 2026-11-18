// Referenz für den Core (E1c), nicht im Paket. Liest ein entpacktes Artefakt für `patchArtifact`, ohne Links zu folgen: Nur reguläre Dateien
// und Ordner zählen, ein Symlink, eine Gerätedatei oder ein Hardlink bricht ab. Grenzen wie in
// `PATCH_LIMITS`. Das Artefakt ist nicht vertrauenswürdig: Hier wird nur gelesen, nie ausgeführt.
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PATCH_LIMITS, unsafeArtifactPath, type PatchLimits } from './patch.js';

export class UnsafeArtifactError extends Error {
	constructor(
		readonly path: string,
		reason: string,
	) {
		super(`[dealsystem] Artefakt nicht lesbar: ${path} (${reason})`);
		this.name = 'UnsafeArtifactError';
	}
}

/**
 * Alle Dateien unter `root` als `Map<Pfad, Bytes>`, Pfade relativ mit `/`. Wirft
 * `UnsafeArtifactError`, sobald etwas nicht passt; dann baut der Aufrufer neu.
 */
export async function readArtifactDirectory(
	root: string,
	limits: Partial<PatchLimits> = {},
): Promise<Map<string, Uint8Array>> {
	const max = { ...PATCH_LIMITS, ...limits };
	const files = new Map<string, Uint8Array>();
	let total = 0;
	// Ohne Rekursion: eine Liste offener Ordner, Tiefe über die Pfadprüfung begrenzt.
	const pending: string[] = [''];
	while (pending.length > 0) {
		const relativeDir = pending.pop()!;
		const entries = await readdir(join(root, relativeDir), { withFileTypes: true });
		for (const entry of entries) {
			const path = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			const unsafe = unsafeArtifactPath(path, max);
			if (unsafe) throw new UnsafeArtifactError(path, unsafe);
			if (entry.isDirectory()) {
				pending.push(path);
				continue;
			}
			if (!entry.isFile()) throw new UnsafeArtifactError(path, 'keine reguläre Datei');
			if (files.size >= max.maxFiles) throw new UnsafeArtifactError(path, `mehr als ${max.maxFiles} Dateien`);
			const full = join(root, path);
			const info = await lstat(full);
			if (!info.isFile()) throw new UnsafeArtifactError(path, 'keine reguläre Datei');
			if (info.nlink > 1) throw new UnsafeArtifactError(path, 'Hardlink');
			total += info.size;
			if (total > max.maxTotalBytes)
				throw new UnsafeArtifactError(path, `größer als ${max.maxTotalBytes} Bytes`);
			// Kein Link folgen, auch wenn zwischen lstat und open einer entsteht (O_NOFOLLOW, wo es das gibt).
			const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
			try {
				const stat = await handle.stat();
				if (!stat.isFile() || stat.ino !== info.ino || stat.size !== info.size)
					throw new UnsafeArtifactError(path, 'während des Lesens verändert');
				const bytes = new Uint8Array(stat.size);
				let read = 0;
				while (read < bytes.length) {
					const { bytesRead } = await handle.read(bytes, read, bytes.length - read, read);
					if (bytesRead === 0) break;
					read += bytesRead;
				}
				if (read !== bytes.length) throw new UnsafeArtifactError(path, 'kürzer als angegeben');
				files.set(path, bytes);
			} finally {
				await handle.close();
			}
		}
	}
	return files;
}
