// Vertrag `contract/attribution-params.v1.json`: welche eigenen URL-Parameter das SDK unter `attribution.params`
// schickt. Der Core prüft damit beim Speichern einer Zuordnung (Parameter → Kontaktfeld), dass das SDK den Parameter
// überhaupt schicken kann. Neu schreiben: UPDATE_CONTRACT=1 npx vitest run tests/attributionParamsContract.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import {
	ATTRIBUTION_LIMITS,
	CLICK_PARAMS,
	isSensitiveParamName,
	PARAM_KEY,
	paramNameParts,
	readParams,
	SENSITIVE_PARAM_WORDS,
} from '../src/lib/client/attribution.js';

const FILE = new URL('../contract/attribution-params.v1.json', import.meta.url);

/** Durchgelassen: auch Namen, die einen heiklen Begriff nur als Teilwort enthalten. */
const KEPT = [
	'partner',
	'kampagne',
	'ref',
	'aff_id',
	'keyword',
	'promocode',
	'gutscheincode',
	'filialname',
	'hotel',
	'design',
	'newsletter',
	'standort',
	'sigma',
	'monkey',
	'passage',
	'utmost',
];
/** Verworfen: heikler Wortteil, auch in camelCase, mit Punkt oder Bindestrich. */
const DROPPED = [
	'email',
	'e-mail',
	'token',
	'auth_token',
	'access_token',
	'accessToken',
	'api_key',
	'apiKey',
	'API_KEY',
	'session',
	'sessionId',
	'user.name',
	'firstName',
	'firstname',
	'vorname',
	'nachname',
	'telefon',
	'phone_number',
	'tel',
	'oauth_code',
	'code',
	'promo_code',
	'password',
	'x-signature',
	'sig',
	'iban',
];
/** Gehen aus anderem Grund nie als eigene Parameter mit. */
const RESERVED = ['utm_source', 'utm_campaign', 'gclid', 'fbclid', '_fbp', 'ab c', 'k'.repeat(65)];

function generate() {
	const sent = (name: string) => name in readParams(`?${encodeURIComponent(name)}=x`);
	return {
		$comment:
			'Vertrag eigene URL-Parameter (attribution.params, Fassung 2). Quelle: SDK packages/site/src/lib/client/attribution.ts, erzeugt von tests/attributionParamsContract.test.ts (UPDATE_CONTRACT=1). Der Core lehnt beim Speichern einer Zuordnung Parameter ab, die das SDK nie schickt.',
		key: { pattern: PARAM_KEY.source, maxLength: ATTRIBUTION_LIMITS.paramKey },
		limits: { params: ATTRIBUTION_LIMITS.params, valueMaxLength: ATTRIBUTION_LIMITS.paramValue },
		excluded: {
			prefix: ['utm_'],
			names: [...Object.keys(CLICK_PARAMS), '_fbp'],
		},
		sensitive: {
			rule: 'Der Name wird in Wortteile zerlegt; ist ein Wortteil (klein geschrieben) genau einer der Begriffe, geht der Parameter nie mit. Teilwörter zählen nicht.',
			split: [
				'Grenze vor einem Großbuchstaben, der auf einen Kleinbuchstaben oder eine Ziffer folgt (apiKey → api, key)',
				'Grenze vor einem Großbuchstaben, auf den ein Kleinbuchstabe folgt, wenn davor ein Großbuchstabe steht (URLParam → url, param)',
				'Trenner: Unterstrich, Punkt, Bindestrich',
				'danach alles klein geschrieben, leere Teile entfallen',
			],
			words: [...SENSITIVE_PARAM_WORDS],
		},
		examples: {
			sent: KEPT.map((name) => ({ name, parts: paramNameParts(name) })),
			dropped: DROPPED.map((name) => ({ name, parts: paramNameParts(name) })),
			reserved: RESERVED,
		},
		check: { sentAll: KEPT.every(sent), droppedNone: DROPPED.every((n) => !sent(n)) },
	};
}

const generated = generate();
if (process.env.UPDATE_CONTRACT) writeFileSync(FILE, `${JSON.stringify(generated, null, '\t')}\n`);
const contract = JSON.parse(readFileSync(FILE, 'utf8')) as typeof generated;

describe('Vertrag attribution-params.v1', () => {
	it('die Datei passt zum SDK (sonst: UPDATE_CONTRACT=1)', () => {
		expect(contract).toEqual(generated);
	});

	it('nur ganze Wortteile zählen: harmlose Namen mit einem Begriff als Teilwort gehen mit', () => {
		for (const name of KEPT) {
			expect(isSensitiveParamName(name), name).toBe(false);
			expect(readParams(`?${name}=x`), name).toEqual({ [name]: 'x' });
		}
	});

	it('heikle Wortteile fallen, auch in camelCase, mit Punkt, Bindestrich oder zusammengeschrieben', () => {
		for (const name of DROPPED) {
			expect(isSensitiveParamName(name), name).toBe(true);
			expect(readParams(`?${encodeURIComponent(name)}=x`), name).toEqual({});
		}
	});

	it('utm_*, Klick-IDs, _fbp und ungültige Namen gehen nie als eigene Parameter mit', () => {
		for (const name of RESERVED) expect(readParams(`?${encodeURIComponent(name)}=x`), name).toEqual({});
		expect(contract.check).toEqual({ sentAll: true, droppedNone: true });
	});

	it('Wortteile', () => {
		expect(paramNameParts('apiKey')).toEqual(['api', 'key']);
		expect(paramNameParts('URLParam')).toEqual(['url', 'param']);
		expect(paramNameParts('user.first_name-2')).toEqual(['user', 'first', 'name', '2']);
		expect(paramNameParts('Lead2Go')).toEqual(['lead2', 'go']);
	});
});
