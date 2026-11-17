<!--
@component
Eine Karte von OpenStreetMap mit einer Markierung, z. B. für die Anfahrt. Das
ist die eine freigegebene Karte: Andere Kartendienste lassen sich auf der Seite
nicht einbetten. Die Karte lädt erst, wenn der Besucher zustimmt; vorher steht
dort ein Hinweis mit der Schaltfläche „Karte anzeigen“. Der Link „Karte in
OpenStreetMap öffnen“ funktioniert immer.

`lat` und `lon` sind die Koordinaten des Ortes als Dezimalzahlen. Kennst du sie
nicht, frag den Kunden danach oder verlinke stattdessen die Adresse; rate sie nie.

```svelte
<MapEmbed lat={53.8676} lon={10.6866} title="Unser Büro in der Lübecker Altstadt" />
```
-->
<script lang="ts" module>
	export interface MapEmbedProps {
		/** Breitengrad des Ortes, z. B. `53.8676`. */
		lat: number;
		/** Längengrad des Ortes, z. B. `10.6866`. */
		lon: number;
		/** Was die Karte zeigt, z. B. „Unser Büro in der Lübecker Altstadt“. Für Vorleseprogramme. */
		title: string;
		/** Zoomstufe von 3 (Kontinent) bis 18 (Hausnummer). Standard 16. */
		zoom?: number;
		class?: string;
	}

	/** Adresse der Einbettung. Die CSP des Starters erlaubt genau diese Herkunft. */
	const ORIGIN = 'https://www.openstreetmap.org';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { consent } from '../consent/consent.svelte.js';
	import { usageError } from '../internal/usage.js';

	let { lat, lon, title, zoom = 16, class: className }: MapEmbedProps = $props();

	const valid = $derived.by(() => {
		const ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
		if (!ok) {
			usageError(
				`<MapEmbed lat={${String(lat)}} lon={${String(lon)}}>: lat und lon müssen Koordinaten als Zahlen sein, ` +
					'z. B. lat={53.8676} lon={10.6866}.',
			);
		}
		if (typeof title !== 'string' || title.trim() === '') {
			usageError('<MapEmbed> braucht einen title, z. B. title="Unser Büro in der Lübecker Altstadt".');
		}
		return ok;
	});

	const level = $derived(Math.min(18, Math.max(3, Math.round(zoom))));
	const embedUrl = $derived.by(() => {
		// Ausschnitt um den Ort: je Zoomstufe halbiert sich die Breite.
		const lonSpan = 720 / 2 ** level;
		const latSpan = lonSpan / 2;
		const bbox = [lon - lonSpan / 2, lat - latSpan / 2, lon + lonSpan / 2, lat + latSpan / 2]
			.map((value) => value.toFixed(5))
			.join(',');
		return `${ORIGIN}/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
	});
	const linkUrl = $derived(`${ORIGIN}/?mlat=${lat}&mlon=${lon}#map=${level}/${lat}/${lon}`);

	onMount(() => consent.init());
</script>

{#if valid}
	<div class={['ds-map', className]} data-ds-map>
		{#if consent.has('media')}
			<iframe {title} src={embedUrl} loading="lazy" referrerpolicy="no-referrer"></iframe>
		{:else if consent.ready}
			<div class="ds-map__gate">
				<p>
					Die Karte kommt von OpenStreetMap. Beim Anzeigen werden Daten, zum Beispiel Ihre IP-Adresse, an
					OpenStreetMap übertragen.
				</p>
				<button type="button" onclick={() => consent.grant('media')}>Karte anzeigen</button>
			</div>
		{/if}
		<p class="ds-map__link">
			<a href={linkUrl} target="_blank" rel="noopener noreferrer">
				Karte in OpenStreetMap öffnen<span class="ds-map__hint"> (neues Fenster): {title}</span>
			</a>
		</p>
	</div>
{/if}

<style>
	.ds-map {
		color: var(--ds-color-text, #1a1a1a);
		line-height: 1.5;
	}
	iframe {
		display: block;
		width: 100%;
		height: 22rem;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		border-radius: var(--ds-radius, 4px);
	}
	.ds-map__gate {
		padding: 1rem;
		border: 1px solid var(--ds-color-border, #6b6b6b);
		border-radius: var(--ds-radius, 4px);
	}
	.ds-map__gate p {
		margin: 0 0 0.75rem;
	}
	button {
		min-height: 44px;
		padding: 0.5rem 1.25rem;
		border: 2px solid var(--ds-color-primary, #1a1a1a);
		border-radius: var(--ds-radius, 4px);
		background: var(--ds-color-primary, #1a1a1a);
		color: var(--ds-color-on-primary, #ffffff);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.ds-map__link {
		margin: 0.5rem 0 0;
	}
	.ds-map__link a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: inherit;
		text-decoration: underline;
	}
	.ds-map__hint {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
