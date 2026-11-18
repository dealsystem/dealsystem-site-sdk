---
name: termin-buchung
description: Eine Terminbuchung auf der Website einbauen (Erstgespräch, Besichtigung, Beratung), bei der Besucher selbst einen freien Termin im DealSystem-Kalender wählen. Verwenden, wenn der Kunde Termine online vergeben möchte. Nicht für Calendly oder andere fremde Dienste.
---

# Terminbuchung einbauen

Nachschlagen: `node_modules/@dealsystem/site/docs/termine.md` und `komponenten.md` (Abschnitt Booker).

## 1. Die Terminart gibt es im CRM, du erfindest keine

Dauer, Arbeitszeiten, Fragen und wer den Termin bekommt, legt der Kunde im CRM unter **Termine** fest. Mit dem
DealSystem-Konnektor kannst du das für ihn tun: `list_event_types` zeigt, was es gibt (mit `slug`),
`create_event_type`, `upsert_schedule` und `upsert_booking_field` legen an, was er dir genannt hat. Erfinde keine
Terminart, keine Dauer und keine Arbeitszeiten: Frag in einem Satz, was er anbieten möchte, wenn es noch nichts
gibt. Die Verbindung zu Google oder Outlook richtet er selbst ein (`get_calendar_connection_link` gibt den Link).

## 2. Zuordnung in `dealsystem.config.ts`

Unter `booking` je Termin auf der Seite ein Schlüssel. `eventType` ist der `slug` aus `list_event_types`; ohne
ihn wählt der Kunde die Terminart nach dem Hochladen im CRM.

```ts
erstgespraech: { label: 'Erstgespräch', eventType: 'erstgespraech' },
```

## 3. Baustein auf der Seite

```svelte
<script lang="ts">
	import { Booker, Seo, Text } from '@dealsystem/site';
</script>

<Seo title="Termin vereinbaren" description="Wählen Sie einen freien Termin für ein Erstgespräch." />

<h1><Text key="termin.titel" default="Termin vereinbaren" /></h1>
<Booker booking="erstgespraech" />
```

`<Booker>` bringt Tag- und Zeitauswahl, die Fragen der Terminart, Spam-Schutz, Fehlertexte und den
Ausweichkontakt mit. Zeiten erscheinen in der Zeitzone des Besuchers, die des Kalenders steht als Hinweis dabei.
Kein iframe, kein Calendly, kein eigenes `fetch`. Eigene Oberfläche: `createBookingClient()` (`termine.md`), dann
selbst Ausweichkontakt, `<LeadHoneypot client={termin} />` und `slot_taken` (Zeiten neu laden) behandeln.

## 4. Prüfen und zeigen

1. `npm run check`, `npm run build`, `npx dealsystem check --output build`.
2. `npm run dev` zeigt Probe-Zeiten (werktags 9 bis 16 Uhr); eine Buchung wird nur geprüft.
3. Auf der Vorschau nach dem Hochladen sind die Zeiten echt, eine Buchung wird geprüft, aber nicht angelegt. Erst
   auf der veröffentlichten Seite entsteht der Termin im Kalender, mit Kontakt im CRM und Bestätigungsmail.
4. Sag dem Kunden in einem Satz, dass gebuchte Termine im CRM unter Termine erscheinen.
