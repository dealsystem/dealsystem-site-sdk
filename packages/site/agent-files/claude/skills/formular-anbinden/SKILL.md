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
   und `multiselect` brauchen `options`. Jedes Feld bekommt ein verständliches `label`. Versteckte Felder
   (`type: 'hidden'`, z. B. `from: { query: 'partner' }` für `?partner=…`) füllt das SDK selbst; mit
   `crm` am Formular schlägst du vor, was im CRM passiert (`konfiguration.md`).
4. Auf der Seite genügt eine Zeile:
   `<LeadForm funnel="ankauf-anfrage" submitLabel="Anfrage senden" successMessage="Danke, wir melden uns." />`
5. Kein eigenes `fetch`. Beschriftungen, Fehlermeldungen, Spam-Schutz und Versand bringt `<LeadForm>` mit.
   Eigene Oberfläche oder mehrere Schritte: `<form onsubmit={…}>` mit `createLeadClient()`, Skill
   `funnel-mehrstufig`.
6. Prüfen: `npm run check` (ein Tippfehler im Schlüssel ist ein Fehler), `npm run build`,
   `npx dealsystem check --output build`. Das geht ohne Anmeldung. „Geprüft“ sagst du dem Kunden nur, wenn
   die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet.
7. Ausprobieren mit `npm run dev`: Die Einsendung wird geprüft, aber nicht gespeichert.
8. **Leadmagnet** (Formular verspricht eine Datei, z. B. einen Ratgeber als PDF): im Code nur ankündigen,
   `leadmagnet: { label: 'Ratgeber Immobilienverkauf' }` am Formular. Keine Datei ins Projekt, kein Link im
   Code. `<LeadForm>` kündigt die Datei nach dem Absenden selbst an. Sag dem Kunden in einem Satz: Er lädt die
   Datei unter Eigene Website → Formulare hoch und schaltet dort die Eingangsbestätigung ein; mit ihr kommt
   der Download-Link.
9. Nach dem Hochladen erscheint das Formular im CRM unter Eigene Website → Formulare. Dort legt der Kunde fest,
   was mit einer Anfrage geschieht (Liste, Deal, Benachrichtigung). Sag ihm das in einem Satz.
