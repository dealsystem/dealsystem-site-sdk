import { emptySiteData } from '../src/lib/internal/siteData.js';
import type { SiteData } from '../src/lib/types.js';

/** Daten einer Beispielseite für Tests. */
export function testSiteData(overrides: Partial<SiteData> = {}): SiteData {
	return {
		...emptySiteData(),
		api: { baseUrl: 'https://core.test', siteKey: 'dsp_TEST1234_abcdefghijklmnopqrstuvwx' },
		site: {
			id: 's1',
			slug: 'kunde',
			name: 'Kunde Immobilien',
			primaryHost: 'kunde.de',
			locale: 'de',
			salutation: 'sie',
			url: 'https://kunde.de',
		},
		legal: {
			company: 'Kunde Immobilien GmbH',
			address: 'Musterstraße 1, 04109 Leipzig',
			email: 'info@kunde.de',
			phone: '0341 1234567',
		},
		funnels: {
			kontakt: {
				label: 'Kontakt',
				active: true,
				fields: [
					{ name: 'firstName', type: 'text', label: 'Vorname', standardField: 'firstName' },
					{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },
					{ name: 'nachricht', type: 'textarea', label: 'Nachricht' },
				],
			},
		},
		collections: {
			angebote: {
				route: '/angebote/:slug',
				fields: [
					{ name: 'titel', type: 'text', required: true },
					{ name: 'beschreibung', type: 'richtext' },
					{ name: 'bilder', type: 'gallery' },
				],
			},
		},
		bookings: { erstgespraech: { label: 'Erstgespräch', eventType: 'erstgespraech' } },
		...overrides,
	};
}

/** Antwort im Format der Site-API. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});
}
