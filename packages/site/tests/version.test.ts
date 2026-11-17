import pkg from '../package.json' with { type: 'json' };
import { SDK_VERSION } from '../src/lib/version.js';

it('SDK_VERSION stimmt mit package.json überein', () => {
	expect(SDK_VERSION).toBe(pkg.version);
});
