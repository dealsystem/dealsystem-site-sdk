---
name: prueffehler-beheben
description: Meldungen von `dealsystem check` oder eine vom Server abgelehnte Version beheben. Verwenden, wenn die Prüfung Fehler oder Warnungen meldet oder das Hochladen scheitert.
---

# Prüffehler beheben

Nachschlagen: `node_modules/@dealsystem/site/docs/regeln.md` (jede Regel mit Korrektur).

1. `npx dealsystem check --output build --json` nach `npm run build` liefert alle Meldungen mit Regel,
   Datei, Zeile und Korrektur.
2. Behebe jede Meldung an der Ursache, so wie die Korrektur es sagt. Fang mit den Fehlern an; Warnungen
   danach.
3. Umgehe keine Regel: keine Prüfung abschalten, nichts in andere Dateien verschieben, damit die Prüfung es
   nicht findet, keine Sicherheitsregel in `svelte.config.js` lockern. Passt eine Datei nicht mehr:
   `npx dealsystem sync --fix-config` stellt `svelte.config.js` und `vite.config.ts` wieder her.
4. Häufige Fälle:
   - nicht freigegebenes Paket → entfernen; die Liste zeigt `npx dealsystem check --allowed`
   - `<img>` → `<MediaImage>` mit `alt`
   - `<form>` mit `action`, `target` oder ohne `onsubmit` (`SEC-007`), eigenes `fetch` → `<LeadForm>` oder
     `<form onsubmit={senden}>` mit `createLeadClient()`
   - fremde Schrift → lokal ablegen (`@fontsource/…`)
   - fremder Dienst, Host oder Skript (`SEC-005`, `SEC-006`, `SEC-008`, `PRV-003`, `PRV-008`) → Eintrag unter
     `external` und `<Embed>`/`<ExternalScript>`, Skill `extern-einbinden`; Karte ohne Eintrag: `<MapEmbed>`
   - feste Adresse, Telefonnummer oder E-Mail (`CNT-002`) → `{data.site.address}` usw. aus dem CRM
   - zwei `h1` oder übersprungene Ebene → Überschriften ordnen
   - langer fester Text → `<Text>` oder `<RichText>` mit `key` und `default`
   - `\n` im `default="…"` (`CNT-003`) → `default={'Zeile 1\nZeile 2'}` in geschweiften Klammern
5. Erneut prüfen, bis die Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet.
6. Dem Kunden zeigst du die Meldungen nicht. Erst wenn eine Meldung nach drei Versuchen bleibt, sag ihm in
   einem Satz, was nicht geht.
