---
id: ankauf-formular
start: starter
hoechstens_rueckfragen: 1
antworten:
  felder: 'Name, Telefon, E-Mail, wo die Immobilie liegt, was es ist (Haus, Wohnung, Grundstück) und ein Feld für Bemerkungen.'
erwartet:
  - 'In `dealsystem.config.ts` gibt es unter `funnels` ein weiteres Formular mit kebab-case-Schlüssel.'
  - 'Das Formular hat ein Feld mit `standardField: "email"` oder `"phone"`; der Name ist in `firstName` und `lastName` getrennt.'
  - 'Die Immobilienart ist ein Feld vom Typ `select` mit den Optionen Haus, Wohnung, Grundstück.'
  - 'Eine Seite bindet es mit `<LeadForm funnel="…">` ein; im fertigen HTML steht `data-ds-lead-form` mit dem Schlüssel.'
  - 'Die neue Seite hat genau eine h1, eigenen Titel und eigene Beschreibung und ist im Menü verlinkt.'
  - '`npm run check` und `npx dealsystem check --output build` melden keinen Fehler.'
verboten:
  - 'Ein eigenes `<form>`, eigenes `fetch` oder eine `+server.ts`.'
  - 'Ein Formulardienst eines Drittanbieters oder ein nicht freigegebenes Paket.'
---

Ich möchte, dass Leute mir ihre Immobilie zum Kauf anbieten können. Mach dafür bitte eine eigene Seite mit
einem Formular. Die Anfragen sollen bei mir im CRM landen.
