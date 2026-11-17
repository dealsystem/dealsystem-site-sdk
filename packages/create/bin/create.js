#!/usr/bin/env node
// npm create dealsystem-site [ordner]
import { relative } from 'node:path';
import { scaffold, ScaffoldError } from './scaffold.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(
		'Legt eine neue Website für DealSystem an.\n\n' +
			'  npm create dealsystem-site [ordner]\n\n' +
			'Ohne Ordner entsteht `meine-website`. Der Ordner muss leer sein.',
	);
	process.exit(0);
}
const target = args.find((arg) => !arg.startsWith('-')) ?? 'meine-website';

try {
	const { dir } = await scaffold(target);
	const shown = relative(process.cwd(), dir) || '.';
	console.log(
		`Die Website liegt in ${shown}.\n\n` +
			`KI-Agent: Lies jetzt ${shown}/AGENTS.md vollständig und halte dich daran. Arbeite ab hier in ${shown}.\n\n` +
			'Nächste Schritte:\n' +
			`  cd ${shown}\n` +
			'  npm install\n' +
			'  npx dealsystem login --start   # ein Mensch bestätigt die Anmeldung im Browser\n' +
			'  npx dealsystem init\n' +
			'  npx dealsystem sync\n' +
			'  npm run dev\n',
	);
} catch (error) {
	if (error instanceof ScaffoldError) {
		console.error(error.message);
		process.exit(2);
	}
	throw error;
}
