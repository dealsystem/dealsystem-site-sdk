---
name: termin-buchung
description: Eine Terminbuchung auf der Website einbauen (Erstgespräch, Besichtigung, Beratung), bei der Besucher selbst einen freien Termin im DealSystem-Kalender wählen. Verwenden, wenn der Kunde Termine online vergeben möchte. Nicht für Calendly oder andere fremde Dienste.
---

# Terminbuchung einbauen

Nachschlagen: `node_modules/@dealsystem/site/docs/termine.md` und `komponenten.md` (Abschnitt Booker).

## 1. Die Terminart gibt es im CRM, du erfindest keine

Dauer, Arbeitszeiten, Fragen und wer den Termin bekommt, legt der Kunde im CRM unter **Termine** fest. Erfinde
keine Terminart, keine Dauer und keine Arbeitszeiten: Frag in einem Satz, was er anbieten möchte, wenn es noch
nichts gibt.

**Welche Terminarten es gibt, zeigt nur `list_website_bookings`** im DealSystem-Konnektor, mit der `websiteId`
aus `npx dealsystem status`. Das Feld `eventTypes` (mit `slug`) sind die aktiven Terminarten im Workspace der
Seite. Nimm nicht `list_event_types`: Das zeigt den Workspace des Konnektors, und der kann ein anderer sein.
Kennt der Konnektor die Seite nicht, oder weicht sein `workspace` (aus `get_website_guide`) von
`npx dealsystem status` ab, bitte den Kunden, den Konnektor neu zu verbinden und den Workspace der Seite zu
wählen. Bis dahin schlägst du keine Terminart vor.

Passen die Workspaces, legen `create_event_type`, `upsert_schedule` und `upsert_booking_field` (Fragen beim
Buchen) an, was er dir genannt hat. Sollen die Fragen vor der Zeitwahl kommen (etwa damit nur passende Anfragen
einen Termin bekommen), stell die Terminart mit `update_event_type` auf `bookingFlow: 'contact_first'`;
`<Booker>` folgt dem von selbst. Ohne Konnektor sag ihm in einem Satz, dass er Terminart, Fragen und
Reihenfolge im CRM unter Kalender → Buchungsseiten einstellt (die Terminart heißt dort „Buchungsseite“, die Fragen „Buchungsfelder“). Die Verbindung zu Google oder Outlook richtet er selbst ein (`get_calendar_connection_link` gibt den Link).

## 2. Zuordnung in `dealsystem.config.ts`

Unter `booking` je Termin auf der Seite ein Schlüssel. `eventType` ist der `slug` aus `list_website_bookings`; ohne
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

## Bestätigungsmail an den Gast

Nach jeder Buchung bekommt der Gast eine Bestätigung. Betreff und Text stimmst du mit dem Kunden ab, wie im Skill
`formular-anbinden` (Abschnitt „Mails an Besucher“, auch zur Anrede Sie/Du, die für alle Mails der Website gilt).

- Mit dem Konnektor: `update_website_booking` mit `confirmationSubject` und `confirmationBody` (reiner Text).
  Erlaubt sind nur `{{firstName}}`, `{{lastName}}`, `{{eventName}}`, `{{dateTime}}` und `{{location}}` (Liste:
  `confirmationPlaceholders` in `list_website_bookings`); andere lehnt DealSystem ab. Ein leerer Text heißt
  Standardtext.
- Unter dem Text stehen immer Zeit, Ort und die Links zum Verschieben und Absagen. Schreib sie nicht noch einmal
  hinein.
- Prüfen: `test_website_confirmation_mail` mit `bookingKey` schickt eine Testmail nur an ihn.
- Ohne Konnektor stellt er den Text im CRM unter Eigene Website → Formulare, Abschnitt Terminbuchungen ein.

## 4. Prüfen und zeigen

1. `npm run check`, `npm run build`, `npx dealsystem check --output build`.
2. **Testlauf mit ihm:** Ist er angemeldet und die Seite verbunden, zeigt `npm run dev` die echte Terminart,
   ihre Fragen und freie Zeiten. Bitte ihn, einmal selbst zu buchen, mit seinen eigenen Angaben: Es entsteht
   kein Termin, kein Kontakt und keine Mail. Lies danach die Zusammenfassung in der Konsole von `npm run dev`.
3. Sag ihm dann: „Unter Eigene Website → Formulare, Abschnitt Testläufe sehen Sie, wie die Buchung angekommen wäre.“ Passt etwas
   nicht (Frage fehlt, falsche Reihenfolge), änderst du es an der Terminart und ihr testet noch einmal.
4. Ohne Anmeldung zeigt `npm run dev` nur Probe-Zeiten (werktags 9 bis 16 Uhr), und nichts geht ans CRM.
5. Erst auf der veröffentlichten Seite entsteht der Termin im Kalender, mit Kontakt im CRM und
   Bestätigungsmail. Sag ihm in einem Satz, dass gebuchte Termine im CRM unter Kalender erscheinen.
