---
id: referenzen-aus-dem-crm
start: starter
hoechstens_rueckfragen: 1
antworten:
  inhalt: 'Zu jedem Objekt ein Titel, der Ort, das Jahr, ein kurzer Text und ein paar Fotos.'
erwartet:
  - 'In `dealsystem.config.ts` gibt es unter `collections` eine weitere Sammlung mit `route` (mit `:slug`) und `indexRoute`.'
  - 'Die Fotos sind ein Feld vom Typ `gallery` oder `image`.'
  - 'Es gibt eine Übersichtsseite und eine Detailseite `[slug]`; geladen wird in `+page.server.ts` mit `prerender = true` über `getCollection`/`getEntry`.'
  - 'Die Detailseite exportiert `entries = collectionEntries("…")`.'
  - 'Bilder werden mit `<MediaImage media={…} />` ausgegeben, kein `<img>`.'
  - 'Ohne Einträge zeigt die Übersicht einen Hinweis statt einer leeren Liste; der Build gelingt auch ohne Einträge.'
  - 'Der Agent sagt dem Kunden, dass er die Objekte im CRM unter CMS anlegt.'
  - '`npx dealsystem check --output build` meldet keinen Fehler.'
verboten:
  - 'Beispiel-Objekte fest im Code.'
  - 'Laden in `+page.ts`, in einer Komponente oder per `fetch` zur Laufzeit.'
---

Ich will auf der Seite zeigen, welche Häuser wir schon gekauft und saniert haben. Die möchte ich selbst
einpflegen und später neue dazutun können, ohne dich jedes Mal zu fragen.
