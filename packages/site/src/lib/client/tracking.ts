// Lädt Meta Pixel und Google Tag. Aufruf nur nach der Einwilligung
// „Marketing“ — siehe <Tracking>.
import type { TrackingConfig } from '../types.js';

const GOOGLE_TAG = /^(G|GT|AW)-[A-Z0-9-]{4,30}$/;
const META_PIXEL = /^\d{5,20}$/;

const loaded = new Set<string>();

function addScript(src: string): void {
	const script = document.createElement('script');
	script.async = true;
	script.src = src;
	document.head.append(script);
}

type Queue = ((...args: unknown[]) => void) & Record<string, unknown>;

/**
 * Bindet die im CRM eingetragenen Tracking-IDs ein. Je ID höchstens einmal.
 * Gibt die geladenen Skript-Adressen zurück.
 * @internal
 */
export function loadTracking(config: TrackingConfig): string[] {
	if (typeof window === 'undefined') return [];
	const w = window as unknown as Record<string, unknown>;
	const added: string[] = [];

	const googleTagId = config.googleTagId?.trim().toUpperCase();
	if (googleTagId && GOOGLE_TAG.test(googleTagId) && !loaded.has(googleTagId)) {
		loaded.add(googleTagId);
		const dataLayer = (w.dataLayer ??= []) as unknown[];
		// gtag erwartet das `arguments`-Objekt, kein Array.
		const gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			dataLayer.push(arguments);
		} as (...args: unknown[]) => void;
		w.gtag ??= gtag;
		gtag('js', new Date());
		gtag('config', googleTagId);
		const src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`;
		addScript(src);
		added.push(src);
	}

	const metaPixelId = config.metaPixelId?.trim();
	if (metaPixelId && META_PIXEL.test(metaPixelId) && !loaded.has(metaPixelId)) {
		loaded.add(metaPixelId);
		if (!w.fbq) {
			const fbq = function (...args: unknown[]) {
				if (typeof fbq.callMethod === 'function') {
					(fbq.callMethod as (...a: unknown[]) => void)(...args);
				} else {
					(fbq.queue as unknown[]).push(args);
				}
			} as Queue;
			fbq.push = fbq;
			fbq.loaded = true;
			fbq.version = '2.0';
			fbq.queue = [];
			w.fbq = fbq;
			w._fbq ??= fbq;
			const src = 'https://connect.facebook.net/en_US/fbevents.js';
			addScript(src);
			added.push(src);
		}
		const fbq = w.fbq as Queue;
		fbq('init', metaPixelId);
		fbq('track', 'PageView');
	}
	return added;
}

/** @internal Nur für Tests. */
export function resetTrackingForTests(): void {
	loaded.clear();
}
