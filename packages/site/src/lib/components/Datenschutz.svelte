<!--
@component
Die Datenschutzerklärung als Vorlage, erzeugt aus den Firmendaten und den
Funktionen der Seite (Formulare, Tracking). Gehört auf
`src/routes/datenschutz/+page.svelte`.

Die Vorlage ersetzt keine Rechtsberatung. Verarbeitet die Seite weitere Daten
(z. B. eine eingebettete Karte), ergänze dafür einen Abschnitt als Inhalt.

```svelte
<svelte:head><title>Datenschutz</title></svelte:head>
<Datenschutz>
	<h2>Karte von OpenStreetMap</h2>
	<p>Die Karte wird erst nach Ihrer Einwilligung geladen. …</p>
</Datenschutz>
```
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface DatenschutzProps {
		/** Ebene der Überschrift „Datenschutzerklärung“. Standard 1 (die `h1` der Seite). */
		headingLevel?: 1 | 2;
		/** Weitere Abschnitte vor „Ihre Rechte“. */
		children?: Snippet;
		class?: string;
	}
</script>

<script lang="ts">
	import { consent } from '../consent/consent.svelte.js';
	import { getSiteData } from '../internal/siteData.js';
	import { addressLines, MISSING, telHref } from './legal.js';

	let { headingLevel = 1, children, class: className }: DatenschutzProps = $props();

	const site = getSiteData();
	const legal = site.legal;
	const hasForms = Object.keys(site.funnels).length > 0;
	const h = $derived(`h${headingLevel}`);
	const sub = $derived(`h${headingLevel + 1}`);
</script>

<section class={['ds-legal', className]} data-ds-datenschutz>
	<svelte:element this={h}>Datenschutzerklärung</svelte:element>

	<svelte:element this={sub}>Verantwortlicher</svelte:element>
	<address>
		{legal.company || MISSING}<br />
		{#each addressLines(legal.address) as line, index (index)}
			{line}<br />
		{:else}
			{MISSING}<br />
		{/each}
	</address>
	<p>
		Telefon:
		{#if legal.phone}<a href={telHref(legal.phone)}>{legal.phone}</a>{:else}{MISSING}{/if}<br />
		E-Mail:
		{#if legal.email}<a href="mailto:{legal.email}">{legal.email}</a>{:else}{MISSING}{/if}
	</p>

	<svelte:element this={sub}>Aufruf der Website</svelte:element>
	<p>
		Diese Website wird über die Plattform DealSystem auf Servern in der Europäischen Union bereitgestellt. Bei
		jedem Aufruf verarbeitet der Server technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, die
		aufgerufene Seite, die zuvor besuchte Seite sowie Angaben zu Browser und Betriebssystem. Die Verarbeitung
		ist nötig, um die Website auszuliefern und ihre Sicherheit zu gewährleisten (Art. 6 Abs. 1 Buchst. f
		DSGVO). Schriften und Bilder liegen auf demselben Server; ohne Ihre Einwilligung werden keine Inhalte von
		anderen Anbietern geladen.
	</p>

	{#if hasForms}
		<svelte:element this={sub}>Formulare</svelte:element>
		<p>
			Wenn Sie uns über ein Formular schreiben, verarbeiten wir Ihre Angaben, um Ihre Anfrage zu bearbeiten
			und zu beantworten (Art. 6 Abs. 1 Buchst. b DSGVO, bei allgemeinen Anfragen Buchst. f). Die Angaben
			werden in unserem Kundenverwaltungssystem DealSystem gespeichert. Mit der Anfrage übermitteln wir
			außerdem, über welche Kampagne oder verweisende Website Sie zu uns gekommen sind, soweit das aus der
			aufgerufenen Adresse hervorgeht. Wir löschen die Daten, sobald sie für die Bearbeitung nicht mehr
			erforderlich sind und keine gesetzlichen Aufbewahrungspflichten bestehen.
		</p>
	{/if}

	{#if hasForms}
		<svelte:element this={sub}>Schutz vor Missbrauch</svelte:element>
		<p>
			Zum Schutz unserer Formulare vor automatisierten Einsendungen löst Ihr Browser eine kleine Rechenaufgabe
			im Hintergrund, sobald Sie ein Formular verwenden. Die Aufgabe kommt von demselben System, das auch Ihre
			Anfrage entgegennimmt. Dabei werden keine Daten an andere Anbieter übertragen und keine Cookies gesetzt.
			Rechtsgrundlage ist unser berechtigtes Interesse am Schutz vor Missbrauch (Art. 6 Abs. 1 Buchst. f
			DSGVO).
		</p>
	{/if}

	<svelte:element this={sub}>Einwilligung und lokale Speicherung</svelte:element>
	<p>
		Ihre Auswahl im Cookie-Hinweis speichern wir im Speicher Ihres Browsers, damit wir Sie nicht bei jedem
		Besuch erneut fragen (§ 25 Abs. 2 Nr. 2 TDDDG). Alle weiteren Speicherungen und Übertragungen an andere
		Anbieter erfolgen nur mit Ihrer Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 Buchst. a DSGVO). Sie
		können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft ändern oder widerrufen:
		<button type="button" class="ds-legal__link" onclick={() => consent.openSettings()}>
			Cookie-Einstellungen öffnen
		</button>
	</p>

	{#if site.tracking.googleTagId}
		<svelte:element this={sub}>Google Tag</svelte:element>
		<p>
			Mit Ihrer Einwilligung nutzen wir Dienste von Google (Google Ireland Limited, Gordon House, Barrow
			Street, Dublin 4, Irland), um die Nutzung der Website und den Erfolg von Anzeigen zu messen. Dabei
			werden Cookies gesetzt und Nutzungsdaten an Google übertragen; eine Übermittlung in die USA ist möglich.
			Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 Buchst. a DSGVO).
		</p>
	{/if}

	{#if site.tracking.metaPixelId}
		<svelte:element this={sub}>Meta Pixel</svelte:element>
		<p>
			Mit Ihrer Einwilligung nutzen wir das Meta Pixel (Meta Platforms Ireland Limited, Merrion Road, Dublin
			4, Irland), um den Erfolg von Anzeigen auf Facebook und Instagram zu messen. Dabei werden Cookies
			gesetzt und Nutzungsdaten an Meta übertragen; eine Übermittlung in die USA ist möglich. Rechtsgrundlage
			ist Ihre Einwilligung (Art. 6 Abs. 1 Buchst. a DSGVO).
		</p>
	{/if}

	{@render children?.()}

	<svelte:element this={sub}>Ihre Rechte</svelte:element>
	<p>
		Sie haben das Recht auf Auskunft über Ihre bei uns gespeicherten Daten, auf Berichtigung, Löschung,
		Einschränkung der Verarbeitung und Datenübertragbarkeit sowie das Recht, einer Verarbeitung zu
		widersprechen (Art. 15 bis 21 DSGVO). Wenden Sie sich dafür an die oben genannte Adresse. Außerdem können
		Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
	</p>
</section>

<style>
	address {
		font-style: normal;
	}
	.ds-legal :global(a) {
		text-decoration: underline;
	}
	.ds-legal__link {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.ds-legal__link:focus-visible {
		outline: 3px solid var(--ds-color-focus, #1a56db);
		outline-offset: 2px;
	}
</style>
