---
name: extern-einbinden
description: Einen fremden Dienst einbinden, z. B. ein YouTube- oder Vimeo-Video, Google Maps, eine Terminbuchung (Calendly), ein Bewertungs-Widget, einen Chat oder ein anderes Skript (Tag-Manager). Verwenden, wenn der Kunde ein Video, Widget oder Skript eines anderen Anbieters auf der Seite haben möchte.
---

# Fremden Dienst einbinden

Nachschlagen: `node_modules/@dealsystem/site/docs/extern.md` (alle Fälle mit Beispielen) und `komponenten.md`
(Abschnitte Embed und ExternalScript).

1. Kläre in einem Satz, was der Kunde will, und lass dir die Adresse schicken (Video-Link, Buchungsseite,
   Code-Schnipsel des Anbieters). Rate keine Adresse und keine Konto-Kennung.
2. Trage den Dienst in `dealsystem.config.ts` unter `external` ein:
   - **YouTube, Vimeo, Google Maps, Calendly:** nur die Vorlage, z. B. `video: { preset: 'youtube' }`.
   - **Anderer Dienst:** `category` (`media`, `marketing` oder `statistics`), `provider` mit Sitz, `purpose`,
     `privacyUrl` und die Hosts je Art: `script`, `connect`, `img`, `frame`, `media`, `style`, `font`. Hosts
     nur als `https://host.de`; Platzhalter `https://*.host.de` nie in `script` oder `frame`. Die Hosts stehen
     meist in der Hilfe des Anbieters unter „Content Security Policy“.
3. Setze den Baustein aus `@dealsystem/site` an die gewünschte Stelle:
   - Video, Karte, Termin, Widget: `<Embed id="video" src="…" title="Was zu sehen ist" />`. Die Adresse darf
     so bleiben, wie der Kunde sie schickt.
   - Skript: `<ExternalScript id="chat" src="https://…" />`, für alle Seiten in `src/routes/+layout.svelte`.
     Ein Snippet mit Code legst du als Datei unter `static/scripts/` ab und lädst `src="/scripts/datei.js"`.
4. Nie: `<iframe>` oder `<script>` von Hand, Hosts in `svelte.config.js`, Code in `<script>…</script>`,
   `category: 'necessary'`. Die Seite lädt fremde Dienste erst nach der Einwilligung; das übernehmen die
   Bausteine.
5. Prüfen: `npm run check`, `npm run build`, `npx dealsystem check --output build`, alles beheben. Mit
   `npm run dev` ansehen: Erst steht ein Platzhalter da, nach „Video laden“ oder „Alle akzeptieren“ der Dienst.
   Fehlt ein Host, steht in der Browser-Konsole „Refused to …“ mit dem Host: unter `external` ergänzen.
6. Sag dem Kunden in einem Satz, dass der Dienst eingebaut ist und erst nach Zustimmung des Besuchers lädt,
   und dass er ihn in seiner Datenschutzerklärung nennen muss (Eigene Website → Rechtliches). Den Text
   schreibst du nicht.
7. Eigene Skripte laufen nur mit eigener Domain. Hat die Seite noch keine, sag das dem Kunden in einem Satz
   (Skill `domain-verbinden`); Videos und Karten gehen auch ohne.
