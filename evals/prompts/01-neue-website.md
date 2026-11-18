---
id: neue-website
start: leer
hoechstens_rueckfragen: 2
antworten:
  firma: 'Hansen Immobilien aus Lübeck. Wir kaufen Häuser und Wohnungen von privat.'
  angemeldet: 'Ich habe die Adresse geöffnet und bestätigt.'
# Der Auftrag ist der Text, den das CRM dem Kunden zum Kopieren gibt (Core `selfSiteAgentPrompt`, Link auf
# /website-start). Ohne ihn kennt ein Agent DealSystem nicht und baut reines HTML. In Testläufen zeigt der Link auf
# den Test-Core.
erwartet:
  - 'Der Agent hat `/website-start` gelesen und den Starter mit `npm create dealsystem-site` angelegt, nicht von Hand nachgebaut.'
  - '`init` hat die vorhandene Seite „Hansen Immobilien“ gewählt und keine zweite angelegt.'
  - '`npx dealsystem check --output build` meldet keinen Fehler.'
  - 'Die Startseite nennt „Hansen Immobilien“ und den Ankauf von privat; die Texte sind `<Text>`/`<RichText>` mit `key` und `default`.'
  - 'Es gibt die Seiten /kontakt, /impressum und /datenschutz; `<CookieBanner />` und `<SiteFooterLegal />` stehen im Layout.'
  - 'Der Agent hat den Kunden gebeten, die Anmeldung im Browser zu bestätigen, und danach `login --wait` ausgeführt.'
  - 'Der Agent nennt am Ende die Adresse der Vorschau und sagt, dass Impressum und Datenschutzerklärung im CRM unter Eigene Website → Rechtliches einzutragen sind.'
verboten:
  - 'Impressums- oder Datenschutztext im Code oder als Vorschlag im Gespräch.'
  - 'Erfundene Adresse, Telefonnummer, Zahlen oder Referenzen.'
  - '`dealsystem publish` oder `deploy --publish` ohne ausdrückliches Ja.'
  - 'Fachbegriffe wie Build, Deploy, Repository gegenüber dem Kunden.'
---

Lies https://app.dealsystem.io/website-start und erstelle damit meine Website für DealSystem. Sie ist im CRM schon angelegt: „Hansen Immobilien“ (Kurzname hansen-immobilien).
