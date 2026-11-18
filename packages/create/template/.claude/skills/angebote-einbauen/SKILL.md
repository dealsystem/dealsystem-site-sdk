---
name: angebote-einbauen
description: Angebote, Objekte, Referenzen oder andere wiederkehrende Inhalte aus dem DealSystem-CRM auf der Website anzeigen, als Liste und als Detailseite. Verwenden, wenn der Kunde Inhalte zeigen will, die er im CRM pflegt.
---

# Angebote und andere Sammlungen einbauen

Nachschlagen: `node_modules/@dealsystem/site/docs/inhalte.md`, `konfiguration.md`.

Der Starter enthält die Sammlung `angebote` mit Liste (`src/routes/angebote/`) und Detailseite
(`src/routes/angebote/[slug]/`). Nimm sie als Vorlage.

1. Die Sammlung steht in `dealsystem.config.ts` unter `collections`: Schlüssel, `label`, `route` mit
   `:slug`, `indexRoute` und die `fields`. Bilder sind Felder vom Typ `image` oder `gallery`.
2. Nach einer Änderung an den Feldern: `npx dealsystem sync`. Der Befehl meldet, wo CRM und Konfiguration
   voneinander abweichen. Scheitert er, weil du nicht angemeldet bist oder DealSystem nicht erreichbar ist,
   mach trotzdem weiter bis Schritt 8 und bitte erst danach um die Anmeldung.
3. Geladen wird nur in `+page.server.ts` mit `export const prerender = true`:
   `getCollection('angebote')` für die Liste, `getEntry('angebote', params.slug)` für die Detailseite.
4. Die Detailseite exportiert `entries = collectionEntries('angebote')`, damit für jeden Eintrag eine Seite
   entsteht.
5. Ausgabe: Texte normal als `{angebot.data.titel}`, formatierter Text mit
   `<RichText content={angebot.data.beschreibung} />`, Bilder mit `<MediaImage media={angebot.media.bilder[0]} />`.
   Bilder stehen unter `media`, nicht unter `data`.
6. Rechne damit, dass es keine Einträge gibt: Zeig dann einen freundlichen Hinweis statt einer leeren Liste.
7. Die Inhalte selbst pflegt der Kunde im CRM unter CMS. Leg keine Beispiel-Angebote im Code an. Ändert er
   dort etwas, erneuert DealSystem die Seite von selbst.
8. Prüfen: `npm run check`, `npm run build`, `npx dealsystem check --output build`. Das geht ohne Anmeldung.
   „Geprüft“ sagst du dem Kunden nur, wenn die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite
   geprüft“ endet.
