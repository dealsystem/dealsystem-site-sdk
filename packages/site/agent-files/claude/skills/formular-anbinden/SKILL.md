---
name: formular-anbinden
description: Ein Kontakt- oder Anfrageformular einbauen oder ändern, dessen Einsendungen als Lead im DealSystem-CRM ankommen. Verwenden, wenn der Kunde ein Formular, ein neues Feld oder eine andere Anfrageart möchte.
---

# Formular anbinden

Nachschlagen: `node_modules/@dealsystem/site/docs/konfiguration.md` und `komponenten.md` (Abschnitt
LeadForm).

1. Formulare stehen in `dealsystem.config.ts` unter `funnels`. Ein neues Formular bekommt einen Schlüssel
   in Kleinbuchstaben mit Bindestrichen (`angebot-anfrage`), ein `label` und seine `fields`.
2. Jedes Formular braucht ein Feld mit `standardField: 'email'` oder `standardField: 'phone'`, sonst
   entsteht im CRM kein Kontakt. Namen immer getrennt als `firstName` und `lastName`.
3. Feldtypen: `text`, `email`, `tel`, `textarea`, `select`, `multiselect`, `checkbox`, `date`. `select`
   und `multiselect` brauchen `options`. Jedes Feld bekommt ein verständliches `label`. Versteckte Felder
   (`type: 'hidden'`, z. B. `from: { query: 'partner' }` für `?partner=…`) füllt das SDK selbst; mit
   `crm` am Formular schlägst du vor, was im CRM passiert (`konfiguration.md`).
4. Auf der Seite genügt eine Zeile:
   `<LeadForm funnel="angebot-anfrage" submitLabel="Anfrage senden" successMessage="Danke, wir melden uns." />`
5. Kein eigenes `fetch`. Beschriftungen, Fehlermeldungen, Spam-Schutz und Versand bringt `<LeadForm>` mit.
   Eigene Oberfläche oder mehrere Schritte: `<form onsubmit={…}>` mit `createLeadClient()`, Skill
   `funnel-mehrstufig`.
6. Prüfen: `npm run check` (ein Tippfehler im Schlüssel ist ein Fehler), `npm run build`,
   `npx dealsystem check --output build`. Das geht ohne Anmeldung. „Geprüft“ sagst du dem Kunden nur, wenn
   die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet.
7. **Testlauf mit dem Kunden:** Ist er angemeldet und die Seite verbunden, bitte ihn unter `npm run dev`, das
   Formular einmal selbst auszufüllen. Es entsteht kein Kontakt und keine Mail; DealSystem hält einen Testlauf
   fest. Lies die Zusammenfassung in der Konsole und sag ihm: „Unter Eigene Website → Formulare, Abschnitt Testläufe sehen Sie, wie
   die Anfrage angekommen wäre.“ Vor dem ersten Hochladen rechnet DealSystem mit den Standard-Einstellungen eines neuen Formulars (kein Deal,
   keine Eingangsbestätigung); `crm` gilt erst danach. Ohne Anmeldung wird die Einsendung nur lokal geprüft.
8. **Leadmagnet** (Formular verspricht eine Datei, z. B. einen Ratgeber als PDF): im Code nur ankündigen,
   `leadmagnet: { label: 'Checkliste für Ihr Projekt' }` am Formular. Keine Datei ins Projekt, kein Link im
   Code. `<LeadForm>` kündigt die Datei nach dem Absenden selbst an. Sag dem Kunden in einem Satz: Er lädt die
   Datei unter Eigene Website → Formulare hoch und schaltet dort die Eingangsbestätigung ein; mit ihr kommt
   der Download-Link.
9. Nach dem Hochladen erscheint das Formular im CRM unter Eigene Website → Formulare. Dort legt der Kunde fest,
   was mit einer Anfrage geschieht (Liste, Deal, Benachrichtigung). Sag ihm das in einem Satz.

## Mails an Besucher

Die Eingangsbestätigung (Mail an den Absender) und ihre Anrede wählt der Kunde, nicht du. Frag ihn in einem
Satz, ob seine Besucher „Sie“ oder „du“ lesen sollen; die Anrede der Mails passt zur Anrede auf der Seite.
Einen Text schlägst du höchstens vor und übernimmst ihn erst nach seinem Okay; keine Zusagen, die er nicht
gemacht hat.

- **Anrede** (gilt für alle Mails der Website, auch die Terminbestätigung): mit dem Konnektor
  `update_website_mail_salutation` (`sie` oder `du`; die aktuelle steht als `mailSalutation` in
  `get_website_details`). Sie ändert die festen Teile und die Standardtexte, eigene Texte nicht: Die passt du
  danach an.
- **Eingangsbestätigung**: `update_website_funnel` mit `confirmationSubject` und `confirmationBody`. Erlaubt sind
  nur die Platzhalter aus `confirmationPlaceholders` in `list_website_funnels`; ein leerer Text heißt
  Standardtext.
- **Prüfen**: `test_website_confirmation_mail` mit `funnelKey` schickt eine Testmail nur an ihn, mit
  Beispieldaten. Bitte ihn, sie anzusehen.
- Ohne Konnektor sag ihm in einem Satz: Anrede und Texte stellt er im CRM unter Eigene Website → Formulare
  ein, dort steht auch „Testmail an mich“.
