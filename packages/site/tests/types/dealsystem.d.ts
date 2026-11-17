// So sieht `src/dealsystem.d.ts` in einer Kundenseite aus.
import type site from './dealsystem.config.js';

declare global {
	interface DealsystemSiteTypes {
		config: typeof site;
	}
}

export {};
