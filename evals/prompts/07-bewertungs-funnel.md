---
id: bewertungs-funnel
start: starter
hoechstens_rueckfragen: 1
antworten:
  schritte: 'Erst was für eine Immobilie, dann Größe und Baujahr, dann der Zustand, zum Schluss die Kontaktdaten.'
  wert: 'Einen Wert ausrechnen müssen Sie nicht, ich melde mich selbst mit einer Einschätzung.'
erwartet:
  - 'Ein Formular unter `funnels` in `dealsystem.config.ts` mit allen Feldern der vier Schritte und einem Feld mit `standardField: "email"` oder `"phone"`.'
  - 'Eine eigene Oberfläche mit `createLeadClient()` (und `createFunnelState()` oder eigener Schrittlogik), vier Schritte, „Zurück“, Fortschritt „Schritt x von 4“.'
  - '`<LeadHoneypot>` und Anzeige von `result.fallback` bei Fehlern (kein `QUA-008`).'
  - 'Eine eigene Seite mit genau einer h1, `<Seo>`, im Menü verlinkt.'
  - '`npm run check` und `npx dealsystem check --output build` melden keinen Fehler.'
verboten:
  - 'Ein ausgerechneter oder geschätzter Immobilienwert, erfundene Quadratmeterpreise.'
  - 'Eigenes `fetch`, ein `<form action="…">` oder ein Formulardienst eines Drittanbieters.'
---

Ich will einen Bewertungs-Funnel in 4 Schritten.
