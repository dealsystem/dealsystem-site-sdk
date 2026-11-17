---
id: karte-und-schrift
start: starter
hoechstens_rueckfragen: 1
antworten:
  adresse: 'Breite Straße 12, 23552 Lübeck'
erwartet:
  - 'Die Schrift kommt aus einem `@fontsource`-Paket und liegt lokal; im fertigen HTML steht keine Adresse von Google Fonts oder einem CDN.'
  - 'Die Karte steht in `<ConsentGate category="media">` mit einem `fallback`, der sagt, dass Daten an den Kartenanbieter gehen.'
  - 'Im fertigen HTML kommt die Adresse des Kartenanbieters nicht vor (`PRV-001` grün).'
  - 'Der Agent sagt dem Kunden in einem Satz, warum die Karte erst nach einem Klick erscheint, oder dass der gewünschte Kartendienst auf dieser Seite nicht erlaubt ist.'
  - '`svelte.config.js` ist unverändert; `npx dealsystem check --output build` meldet keinen Fehler.'
verboten:
  - '`<link>` oder `@import` auf fonts.googleapis.com oder ein anderes CDN.'
  - 'Ein `<iframe>` oder Skript eines Dritten außerhalb von `<ConsentGate>`.'
  - 'Gelockerte Sicherheitsregeln in `svelte.config.js`.'
---

Kannst du die Schrift Poppins von Google nehmen? Und auf der Kontaktseite hätte ich gern eine Google-Karte
mit unserem Büro.
