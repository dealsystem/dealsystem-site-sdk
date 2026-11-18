// Falsche Verwendung im Markup muss ein Typfehler sein. `@ts-expect-error`
// gibt es im Svelte-Markup nicht, deshalb läuft svelte-check hier über eine
// Datei mit Absicht falscher Aufrufe.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

function svelteCheck(tsconfig: string): Promise<string> {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[
				join(root, '../../node_modules/svelte-check/bin/svelte-check'),
				'--output',
				'machine',
				'--tsconfig',
				tsconfig,
			],
			{ cwd: root },
			(_error, stdout) => resolve(stdout),
		);
	});
}

describe('Typfehler im Markup', () => {
	it('meldet jede falsche Verwendung in Invalid.svelte und nichts sonst', async () => {
		const output = await svelteCheck('./tests/types-invalid/tsconfig.json');
		const errors = output
			.split('\n')
			.map((line) => /ERROR "tests\/types-invalid\/Invalid\.svelte" (\d+):\d+ "(.*)"$/.exec(line))
			.filter((match) => match !== null)
			.map((match) => ({ line: Number(match[1]), message: match[2]! }));

		// Zeilen über ihren Inhalt finden, damit ein Umformatieren den Test nicht bricht.
		const source = (await readFile(join(root, 'tests/types-invalid/Invalid.svelte'), 'utf8')).split('\n');
		const lineOf = (markup: string) => source.findIndex((text) => text.includes(markup)) + 1;

		const expected: [markup: string, message: RegExp][] = [
			['<MediaImage src="/haus.jpg" />', /Property 'alt' is missing/],
			['<MediaImage src="/haus.jpg" alt="" />', /Property 'decorative' is missing/],
			['<MediaImage key="start.hero.bild" default="/hero.jpg" />', /Property 'alt' is missing/],
			['<MediaImage src="/haus.jpg" alt="Haus" decorative />', /'true' is not assignable to type 'false'/],
			['<LeadForm funnel="kontakd" />', /"kontakd\\"' is not assignable to type '\\"kontakt/],
			['<CollectionList collection="angebot">', /"angebot\\"' is not assignable to type '\\"angebote/],
			['<ConsentGate category="werbung">', /"werbung\\"' is not assignable/],
			['<MediaVideo media={null} />', /Property 'title' is missing/],
			['<Text key="start.titel" />', /Property 'default' is missing/],
			['<Embed id="vidoe"', /"vidoe\\"' is not assignable to type '\\"video/],
			['<Embed id="video" src="https://youtu.be/aqz-KE-bpKQ" />', /Property 'title' is missing/],
		];
		for (const [markup, message] of expected) {
			const line = lineOf(markup);
			expect(line, markup).toBeGreaterThan(0);
			const hit = errors.find((error) => error.line === line);
			expect(hit, `${markup}: erwarteter Typfehler fehlt\n${output}`).toBeDefined();
			expect(hit!.message).toMatch(message);
		}
		// Die gültige Zeile und alles außerhalb der Datei bleiben fehlerfrei.
		expect(errors).toHaveLength(expected.length);
		expect(output).toMatch(/COMPLETED \d+ FILES 11 ERRORS/);
	}, 60_000);
});
