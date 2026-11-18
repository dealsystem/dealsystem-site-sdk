<!--
@component
Zeigt seinen Inhalt nur in einem Zeitraum, z. B. eine Anmeldung bis zum Beginn
eines Webinars. `ab` gehört dazu, `bis` nicht mehr. Eine Grenze reicht.

Zeitpunkte immer mit Zeitzone: `+01:00` im Winter, `+02:00` im Sommer (deutsche
Zeit), oder `Z` für UTC. Ohne Zeitzone bricht der Build ab (`QUA-009`).

```svelte
<Zeitfenster bis="2026-12-01T18:00:00+01:00">
	<Text key="start.webinar.anmeldung" default="Jetzt anmelden: Webinar am 1. Dezember" />
</Zeitfenster>
<Zeitfenster ab="2026-12-01T18:00:00+01:00" bis="2026-12-01T19:30:00+01:00">
	<Text key="start.webinar.live" default="Das Webinar läuft gerade" />
</Zeitfenster>
```

So wirkt es: Beim Bauen entscheidet die Uhrzeit des Builds, was im HTML steht.
Im Browser schaltet der Baustein sofort um, wenn eine Grenze erreicht ist.
DealSystem baut die Seite zu jeder Grenze neu, damit auch das HTML (Google,
Vorschauen) nach wenigen Minuten stimmt. Dafür müssen `ab` und `bis` feste
Zeichenketten sein, keine Variablen.
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface ZeitfensterProps {
		/** Ab diesem Zeitpunkt sichtbar, mit Zeitzone, z. B. `2026-12-01T18:00:00+01:00`. */
		ab?: string;
		/** Bis zu diesem Zeitpunkt sichtbar (ausschließlich), mit Zeitzone. */
		bis?: string;
		/** Inhalt im Zeitraum. */
		children: Snippet;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { getSiteData } from '../internal/siteData.js';
	import { usageError } from '../internal/usage.js';
	import { imZeitfenster, naechsteGrenze, parseZeitpunkt, zeitpunktFehlerText } from '../schedule.js';

	let { ab, bis, children }: ZeitfensterProps = $props();

	function read(name: 'ab' | 'bis', value: string | undefined): number | null {
		if (value === undefined) return null;
		const parsed = parseZeitpunkt(String(value));
		if ('fehler' in parsed) {
			usageError(`<Zeitfenster> ${zeitpunktFehlerText(name, String(value), parsed.fehler)}`);
			return null;
		}
		return parsed.ms;
	}

	const start = $derived(read('ab', ab));
	const ende = $derived(read('bis', bis));

	$effect.pre(() => {
		if (ab === undefined && bis === undefined) usageError('<Zeitfenster> braucht ab oder bis.');
		else if (start !== null && ende !== null && start >= ende)
			usageError(`<Zeitfenster ab="${ab}" bis="${bis}">: ab muss vor bis liegen.`);
	});

	// Erst die Zeit des Builds, damit der Browser beim Übernehmen dasselbe zeigt wie das HTML; danach die Uhr
	// des Besuchers.
	const builtAt = getSiteData().builtAt;
	let now = $state(builtAt > 0 ? builtAt : Date.now());
	const sichtbar = $derived(imZeitfenster(now, start, ende));

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = () => {
			now = Date.now();
			clearTimeout(timer);
			const next = naechsteGrenze(now, [start, ende]);
			// setTimeout verträgt höchstens etwa 24 Tage; danach einfach neu stellen.
			if (next !== null) timer = setTimeout(tick, Math.min(next - now + 50, 2 ** 31 - 1));
		};
		tick();
		// Nach dem Ruhezustand des Geräts laufen Timer verspätet: beim Zurückkehren neu prüfen.
		const onVisible = () => document.visibilityState === 'visible' && tick();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

{#if sichtbar}
	{@render children()}
{/if}
