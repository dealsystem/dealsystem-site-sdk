// Verbindet die Typen von @dealsystem/site mit dealsystem.config.ts: ein
// Tippfehler in `funnel="…"` oder `collection="…"` wird so zum Typfehler.
// Nicht ändern.
import type site from '../dealsystem.config';

declare global {
	interface DealsystemSiteTypes {
		config: typeof site;
	}
}

export {};
