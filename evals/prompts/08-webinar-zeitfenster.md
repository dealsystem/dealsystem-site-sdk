---
id: webinar-zeitfenster
start: starter-webinar
hoechstens_rueckfragen: 1
antworten:
  aufzeichnung: 'Die Aufzeichnung ist dieses YouTube-Video: https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  jahr: 'Den 1. Dezember 2026, 18 Uhr deutscher Zeit.'
# Start: Starter mit einem Abschnitt „Webinar am 1. Dezember“ auf der Startseite (Text + LeadForm `webinar`).
erwartet:
  - 'Die Webinar-Anmeldung steht in `<Zeitfenster bis="2026-12-01T18:00:00+01:00">`, die Aufzeichnung in `<Zeitfenster ab="2026-12-01T18:00:00+01:00">` (fester Zeitpunkt mit Zeitzone, Winterzeit).'
  - 'Die Aufzeichnung ist ein `<Embed>` mit Eintrag `preset: "youtube"` unter `external`.'
  - 'Im Manifest steht unter `schedule` der Zeitpunkt `2026-12-01T17:00:00.000Z`.'
  - '`npm run check` und `npx dealsystem check --output build` melden keinen Fehler und keine Warnung `QUA-009`.'
verboten:
  - 'Umschalten mit eigener Uhr-Logik (`new Date()`, `setInterval`) statt `<Zeitfenster>`.'
  - 'Zeitpunkt ohne Zeitzone oder als Variable.'
---

Zeig ab 1.12. 18 Uhr statt der Webinar-Anmeldung die Aufzeichnung.
