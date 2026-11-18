---
name: funnel-mehrstufig
description: Ein mehrstufiges Formular mit eigener Oberfläche bauen (Funnel, Rechner, Quiz), z. B. eine Anfrage in Schritten oder ein Angebotsrechner; Beispiel unten: „Immobilie bewerten lassen“. Verwenden, wenn der Kunde mehr will als ein einfaches Kontaktformular, etwa Schritte mit Fortschrittsanzeige.
---

# Mehrstufiges Formular (Funnel)

Nachschlagen: `node_modules/@dealsystem/site/docs/komponenten.md` (Abschnitte „createLeadClient“,
„createFunnelState“, „LeadHoneypot“) und `konfiguration.md` (Felder, `hidden`, `crm`).

Für ein einfaches Formular reicht `<LeadForm>` (Skill `formular-anbinden`). Eine eigene Oberfläche baust du
mit `createLeadClient()` und `createFunnelState()`. Nie mit eigenem `fetch`, nie mit eigenem Captcha.

## Ablauf

1. Formular in `dealsystem.config.ts` unter `funnels` anlegen, mit allen Feldern aller Schritte. Ein Feld mit
   `standardField: 'email'` oder `'phone'` ist Pflicht. Versteckte Felder (`type: 'hidden'`) füllt das SDK
   selbst, z. B. `{ name: 'partner', type: 'hidden', from: { query: 'partner' } }` für `?partner=…`.
2. Optional `crm` am Formular: Vorschlag, was im CRM passiert (`createDeal`, `pipeline`, `stage`,
   `dealName`, `tags`, `leadSource`, `confirmation`). Namen müssen so im CRM existieren; das CRM legt nichts an
   und meldet Unbekanntes beim Hochladen. Der Kunde kann jede Angabe im CRM ändern, dann gilt seine.
3. Die Oberfläche als Komponente unter `src/lib/` bauen, nach dem Beispiel `BewertungFunnel.svelte` in diesem
   Ordner. Pflicht darin:
   - `createLeadClient('<schlüssel>')` und `onMount(() => () => lead.destroy())`
   - `lead.prepare()` beim ersten Feld (startet die Sicherheitsprüfung unsichtbar im Hintergrund)
   - `<LeadHoneypot client={lead} />` (Bot-Falle)
   - bei jedem Fehler außer `validation` den Text `result.message` und den Ausweichkontakt `result.fallback`
     zeigen (`QUA-008` warnt sonst)
   - bei `result.dryRun` (Vorschau) einen Hinweis „geprüft, aber nicht gespeichert“
4. Barrierefreiheit:
   - Jeder Schritt hat eine Überschrift mit `tabindex="-1"`; nach „Weiter“ und „Zurück“ bekommt sie den Fokus.
   - Fortschritt sichtbar und vorlesbar: „Schritt 2 von 4“ und `<progress>`.
   - „Zurück“ auf jedem Schritt außer dem ersten. Die Antworten bleiben erhalten (`funnel.values`).
   - Fehler am Feld (`aria-invalid`, `aria-describedby`), Fokus auf das erste fehlerhafte Feld.
   - Status in einem `aria-live="polite"`-Bereich (`lead.status`: `captcha`, `sending`).
   - Jeder Schritt darf ein eigenes `<form onsubmit={…}>` sein: Enter sendet bzw. geht weiter, der Browser prüft
     `required`. Ohne `action` (oder `action="#"`), kein `method="post"`, kein `target`; abgeschickt wird nur im
     Code mit `lead.submit()` (`SEC-007`). Beispiel: Abschnitt „createLeadClient“ in `komponenten.md`.
5. Danach eine Seite, die die Komponente zeigt, mit `<Seo>`, genau einer `h1` und Texten als `<Text>`.
6. Prüfen und hochladen wie im Skill `veroeffentlichen`. Nach dem Hochladen steht das Formular im CRM unter
   Eigene Website → Formulare.

## Immobilie bewerten lassen

**Rechne keinen Wert aus und erfinde keine Spanne.** DealSystem liefert keine Marktdaten. Am Ende steht ehrlich
„Wir melden uns mit einer Einschätzung“. Will der Kunde eine Spanne zeigen, muss er eigene Werte liefern
(z. B. Quadratmeterpreise je PLZ als Sammlung im CMS) und den Hinweis „unverbindliche Orientierung des Anbieters“
akzeptieren; frag ihn dann zuerst.

Formular für das Beispiel (`dealsystem.config.ts`, unter `funnels`):

```ts
bewertung: {
	label: 'Bewertung',
	fields: [
		{ name: 'objektart', type: 'select', label: 'Art der Immobilie', required: true,
			options: ['Wohnung', 'Haus', 'Mehrfamilienhaus', 'Grundstück'] },
		{ name: 'wohnflaeche', type: 'text', label: 'Wohnfläche in m²', required: true, maxLength: 6, placeholder: 'z. B. 85' },
		{ name: 'plz', type: 'text', label: 'Postleitzahl', required: true, maxLength: 5 },
		{ name: 'zustand', type: 'select', label: 'Zustand', required: true,
			options: ['Neuwertig', 'Gepflegt', 'Renovierungsbedürftig', 'Sanierungsbedürftig'] },
		{ name: 'baujahr', type: 'text', label: 'Baujahr (ungefähr)', maxLength: 4 },
		{ name: 'firstName', type: 'text', label: 'Vorname', standardField: 'firstName' },
		{ name: 'lastName', type: 'text', label: 'Nachname', standardField: 'lastName', required: true },
		{ name: 'email', type: 'email', label: 'E-Mail', standardField: 'email', required: true },
		{ name: 'phone', type: 'tel', label: 'Telefon', standardField: 'phone' },
		{ name: 'quelle', type: 'hidden', from: { value: 'Bewertungsrechner' } },
		{ name: 'partner', type: 'hidden', from: { query: 'partner' } },
	],
	crm: { createDeal: true, dealName: 'Bewertung {{lastName}}', tags: ['Bewertung'] },
},
```

Seite `src/routes/bewertung/+page.svelte`:

```svelte
<script lang="ts">
	import { Seo, Text } from '@dealsystem/site';
	import BewertungFunnel from '$lib/BewertungFunnel.svelte';
</script>

<Seo
	title="Immobilie bewerten lassen"
	description="In vier kurzen Schritten zur persönlichen Einschätzung."
/>
<section class="section">
	<div class="page">
		<Text
			key="bewertung.titel"
			default="Was ist Ihre Immobilie wert?"
			as="h1"
			label="Überschrift"
			group="Bewertung"
		/>
		<BewertungFunnel />
	</div>
</section>
```

`pipeline` und `stage` setzt du nur, wenn der Kunde sie genau so benannt hat; sonst lässt du sie weg und er
wählt sie im CRM. Erfinde keine Namen.
