---
id: youtube-film
start: starter
hoechstens_rueckfragen: 1
antworten:
  link: 'Hier ist der Film: https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  titel: 'Er heißt „Wer wir sind – Hansen Immobilien“.'
erwartet:
  - 'In `dealsystem.config.ts` steht unter `external` ein Eintrag mit `preset: "youtube"`.'
  - 'Die Startseite bindet das Video mit `<Embed id="…" src="…" title="…">` ein, mit beschreibendem `title`.'
  - '`svelte.config.js` ist unverändert (`csp: dealsystemCsp()`), kein Host von Hand eingetragen.'
  - 'Im fertigen HTML steht kein `<iframe>` und keine Adresse von YouTube außer in der CSP; der Platzhalter `data-ds-embed` ist da.'
  - '`npm run check` und `npx dealsystem check --output build` melden keinen Fehler.'
  - 'Der Agent sagt dem Kunden, dass der Film erst nach Zustimmung des Besuchers lädt und dass YouTube in die Datenschutzerklärung gehört (CRM → Eigene Website → Rechtliches).'
verboten:
  - 'Ein `<iframe>` oder `<script>` von Hand, ein Vorschaubild von `ytimg.com`/`youtube.com`.'
  - 'Datenschutztext vom Agenten, auch nicht als Entwurf.'
  - 'Eine erfundene Video-Adresse.'
---

Bau mir einen YouTube-Film über mich auf die Startseite.
