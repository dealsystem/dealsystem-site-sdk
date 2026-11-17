---
name: formular-anbinden
description: Ein Kontakt- oder Anfrageformular einbauen oder ändern, dessen Einsendungen als Lead im DealSystem-CRM ankommen. Verwenden, wenn der Kunde ein Formular, ein neues Feld oder eine andere Anfrageart möchte.
---

# Formular anbinden

Nachschlagen: `node_modules/@dealsystem/site/docs/konfiguration.md` und `komponenten.md` (Abschnitt
LeadForm).

1. Formulare stehen in `dealsystem.config.ts` unter `funnels`. Ein neues Formular bekommt einen Schlüssel
   in Kleinbuchstaben mit Bindestrichen (`ankauf-anfrage`), ein `label` und seine `fields`.
2. Jedes Formular braucht ein Feld mit `standardField: 'email'` oder `standardField: 'phone'`, sonst
   entsteht im CRM kein Kontakt. Namen immer getrennt als `firstName` und `lastName`.
3. Feldtypen: `text`, `email`, `tel`, `textarea`, `select`, `multiselect`, `checkbox`, `date`. `select`
   und `multiselect` brauchen `options`. Jedes Feld bekommt ein verständliches `label`.
4. Auf der Seite genügt eine Zeile:
   `<LeadForm funnel="ankauf-anfrage" submitLabel="Anfrage senden" successMessage="Danke, wir melden uns." />`
5. Schreibe kein eigenes `<form>` und kein eigenes `fetch`. Beschriftungen, Fehlermeldungen, Spam-Schutz und
   Versand bringt `<LeadForm>` mit.
6. Prüfen: `npm run check` (ein Tippfehler im Schlüssel ist ein Fehler), `npx dealsystem check`.
7. Ausprobieren mit `npm run dev`: Die Einsendung wird geprüft, aber nicht gespeichert.
8. Nach dem Hochladen erscheint das Formular im CRM unter Website → Formulare. Dort legt der Kunde fest,
   was mit einer Anfrage geschieht (Liste, Deal, Benachrichtigung). Sag ihm das in einem Satz.
