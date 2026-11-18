# Terminbuchung: `<Booker>` und `createBookingClient`

Besucher wählen auf der Seite einen freien Termin aus dem DealSystem-Kalender. Der Termin landet im Kalender
des Kunden, der Kontakt mit Herkunft „Website“ im CRM, der Besucher bekommt eine Bestätigung mit Links zum
Absagen und Verschieben. Kein iframe, kein fremder Dienst, keine Einwilligung nötig: Die Buchung geht wie ein
Formular an die Site-API.

## Die Terminart kommt aus dem CRM

Was gebucht werden kann, legt der Kunde im CRM unter Termine fest: Dauer, Arbeitszeiten, Buchungsfragen,
Gastgeber, Ort (Telefon, Google Meet, vor Ort), Reihenfolge. **Erfinde keine Terminart, keine Dauer und keine
Arbeitszeiten.** Die Seite nennt nur, welche Terminart wo gebucht wird.

**Reihenfolge:** Standard ist „erst Termin, dann Angaben“ (`calendar_first`). Steht die Terminart auf „erst
Angaben, dann Termin“ (`contact_first`), fragt `<Booker>` zuerst Kontaktdaten und Fragen ab und zeigt danach
die freien Zeiten. Das passt, wenn die Fragen entscheiden, ob ein Termin sinnvoll ist. Eingestellt wird das an
der Terminart, nicht im Code: über den Konnektor mit `update_event_type` (`bookingFlow: 'contact_first'`),
sonst im CRM unter Termine. `info().flow` nennt die Einstellung für eigene Oberflächen.

Welche Terminarten wählbar sind, zeigt im DealSystem-Konnektor `list_website_bookings` mit der `websiteId` aus
`npx dealsystem status`: Das Feld `eventTypes` (mit `slug`) enthält die aktiven Terminarten des Workspaces, zu
dem die Seite gehört. Nimm dafür nicht `list_event_types`; das zeigt den Workspace des Konnektors, und der kann
ein anderer sein. Kennt der Konnektor die Seite nicht, ist er mit einem anderen Workspace verbunden: Bitte den
Kunden, ihn neu zu verbinden (`ablauf.md`, Abschnitt 2a). Erst wenn beide Workspaces gleich sind, legt der
Agent fehlende Terminarten für ihn an (`create_event_type`, `upsert_schedule`, `upsert_booking_field`). Ohne
Konnektor trägt der Kunde sie im CRM ein.

## Konfiguration

```ts
// dealsystem.config.ts
export default defineSite({
	siteId: '…',
	booking: {
		erstgespraech: { label: 'Erstgespräch', eventType: 'erstgespraech' },
	},
});
```

| Angabe      | Pflicht | Bedeutung                                                                                                   |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Schlüssel   | ja      | Kleinbuchstaben, Ziffern, Bindestriche, höchstens 50 Zeichen. Höchstens 20 Buchungen je Seite.              |
| `label`     | nein    | Bezeichnung auf der Seite und im CRM (1 bis 100 Zeichen). Ohne Angabe der Name der Terminart.               |
| `eventType` | nein    | `slug` der Terminart (`list_website_bookings`). Zugeordnet beim Hochladen, wenn genau eine aktive so heißt. |

Ohne `eventType` oder bei einem unbekannten Slug wählt der Kunde die Terminart im CRM; bis dahin zeigt der
Baustein den Ausweichkontakt (Telefon und E-Mail aus den Firmendaten).

## Fertiger Baustein

```svelte
<Booker booking="erstgespraech" />
```

- Schritte: Tag wählen, Uhrzeit wählen, Angaben (Vorname, Nachname, E-Mail, Telefon, die Fragen der Terminart,
  bei mehreren Ort-Arten die Wahl), Bestätigung.
- Barrierefrei: Tage und Zeiten sind Buttons, der gewählte Tag hat `aria-pressed`, beim Schrittwechsel springt
  der Fokus auf die Überschrift des neuen Schritts, eine Live-Region meldet „Termin gebucht“. Fehler stehen
  am Feld und sind mit ihm verbunden.
- Zeiten erscheinen in der Zeitzone des Besuchers; die Zeitzone des Kalenders steht als Hinweis dabei.
  Gesendet und gespeichert wird in UTC; die Zeitumstellung erledigt der Kalender.
- „Weitere Termine“ lädt die nächsten Tage nach (`days`, Standard 14, höchstens 31 je Abruf).
- Ist die Zeit inzwischen vergeben (`slot_taken`), lädt der Baustein die Zeiten neu, die Angaben bleiben.
- Gestaltung über dieselben CSS-Variablen wie `<LeadForm>` (`--ds-color-primary`, `--ds-radius`, …),
  Überschriften-Ebene über `headingLevel`.

## Eigene Oberfläche

`createBookingClient('erstgespraech')` liefert `info()` (Terminart, Fragen, Zeitzone des Kalenders),
`slots(from, to)` (freie Zeiten in UTC) und `book({ start, firstName, email, … })`. Zum Anzeigen:
`groupSlotsByDay(slots, visitorTimeZone())` gruppiert nach Tag in der Zeitzone des Besuchers.

- `info().flow === 'contact_first'`: erst Angaben und Fragen, dann `qualify(answers)`, erst danach die
  Zeitwahl. `qualify` schreibt nichts. Bei `{ ok: true, qualified: false }` führ den Besucher zu
  `redirectUrl`, wenn die Regel im CRM weiterleitet; sonst zeig `headline`, `message` und den Ausweichkontakt
  statt der Zeiten. `<Booker>` macht beides selbst. Ein technischer Fehler lässt den Besucher weiter (die Buchung prüft noch einmal).

- Setz `<LeadHoneypot client={termin} />` in die Oberfläche (Bot-Falle) und ruf `termin.prepare()` auf,
  sobald eine Zeit gewählt ist (startet die Sicherheitsprüfung).
- `book()` gibt nie eine Ausnahme, sondern `{ ok: false, reason, message, fallback }`:
  `validation` (Texte je Feld unter `fields`), `slot_taken` (Zeiten neu laden), `not_qualified` (Regel der
  Terminart), `captcha`, `rate_limited`, `network`, `unavailable`. Zeig `message` und bei allem außer
  `validation` den Ausweichkontakt.
- Doppelt abschicken bucht nicht doppelt: Derselbe Beginn behält seine `submissionId`, der Server meldet dann
  `duplicate: true`.

## Ausprobieren

- `npm run dev` mit Anmeldung und verbundener Seite: echte Terminart, Fragen, Reihenfolge und freie Zeiten aus
  dem CRM. Vor dem ersten Hochladen gilt `eventType` (nur bei genau einer aktiven Terminart mit diesem Slug);
  kennt die Seite den Schlüssel schon, gilt ihre Zuordnung im CRM. Wäre die Buchung live abgelehnt worden
  (Zeit vergeben, Antworten passen nicht), zeigt die Seite denselben Fehler. Eine Buchung legt keinen Termin, keinen Kontakt und keine
  Mail an; DealSystem hält sie als **Testlauf** fest, zu sehen unter Eigene Website → Formulare, Abschnitt Testläufe („so wäre es
  angekommen“). Lass den Kunden nach dem Einbau einmal selbst buchen (`ablauf.md`, „Testlauf mit echten
  Daten“).
- `npm run dev` ohne Anmeldung oder offline: Probe-Terminart mit Zeiten werktags 9 bis 16 Uhr (Berlin), nichts
  geht ans CRM.
- Vorschau nach dem Hochladen: echte freie Zeiten; eine Buchung wird geprüft, aber nicht angelegt (`dryRun`).
- Erst auf der veröffentlichten Seite entsteht der Termin.
