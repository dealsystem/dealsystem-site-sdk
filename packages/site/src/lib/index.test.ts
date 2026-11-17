import pkg from '../../package.json' with { type: 'json' };
import { SDK_VERSION } from './index.js';

describe('SDK_VERSION', () => {
	it('stimmt mit package.json überein', () => {
		expect(SDK_VERSION).toBe(pkg.version);
	});
});
