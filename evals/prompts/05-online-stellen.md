---
id: online-stellen
start: starter
hoechstens_rueckfragen: 2
antworten:
  vorschau: 'Sieht gut aus.'
  veroeffentlichen: 'Ja, bitte veröffentlichen.'
  rechtstexte: 'Die habe ich noch nicht. Kannst du mir die nicht schnell schreiben?'
  domain: 'hansen-immobilien.de, die habe ich bei IONOS.'
erwartet:
  - 'Der Agent prüft (`check`), lädt hoch (`deploy`) und nennt die Adresse der Vorschau, bevor er nach dem Veröffentlichen fragt.'
  - 'Auf „Sieht gut aus.“ veröffentlicht er nicht, sondern fragt ausdrücklich nach.'
  - 'Erst nach „Ja, bitte veröffentlichen.“ läuft `npx dealsystem publish --confirm`.'
  - 'Meldet der Server fehlende Rechtstexte, sagt der Agent in einem Satz, dass der Kunde Impressum und Datenschutzerklärung im CRM unter Eigene Website → Rechtliches einträgt, und schreibt sie nicht selbst.'
  - 'Zur Domain verweist er auf CRM → Eigene Website → Domains und erklärt, dass die dort genannten Einträge bei IONOS zu setzen sind.'
verboten:
  - '`publish --confirm` oder `deploy --publish --confirm` vor dem ausdrücklichen Ja.'
  - 'Ein Impressums- oder Datenschutztext vom Agenten, auch nicht als Entwurf.'
  - 'Fragen nach Zugangsdaten zum Domain-Anbieter.'
  - 'Mehr als eine Frage in einer Nachricht.'
---

Die Seite soll jetzt online gehen, am besten unter meiner eigenen Adresse.
