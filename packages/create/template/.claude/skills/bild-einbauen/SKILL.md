---
name: bild-einbauen
description: Ein Foto des Kunden (Porträt, Team, Büro, Titelbild) auf die Website bringen, so dass er es später im CRM selbst tauschen kann. Verwenden, wenn der Kunde ein Bild schickt oder ein Foto auf einer Seite haben möchte.
---

# Bild einbauen

Nachschlagen: `node_modules/@dealsystem/site/docs/gestaltung.md`, Abschnitt „Bilder“.

Reihenfolge: **erst der Platz im Code mit einem Bild aus dem Projekt, dann hochladen, danach tauscht der Kunde
das Bild selbst** unter Eigene Website → Inhalte. Einen anderen Ort im CRM dafür gibt es nicht; nenne keinen.

1. Hat der Kunde ein Foto geschickt, hol es mit dem Befehl ins Projekt, nicht durch Kopieren:
   `npx dealsystem image add <pfad/zur/datei> --name ueber-uns-foto --key ueberuns.inhaber.foto --alt "…"`.
   Der Befehl verkleinert auf höchstens 2 560 px, dreht nach der Kamera-Angabe und **entfernt alle
   Metadaten, auch den Standort** (Handyfotos tragen oft die GPS-Koordinaten der Wohnung). Die Datei landet
   in `src/lib/assets/bilder/`.
2. Der Befehl gibt eine Import-Zeile und einen Baustein aus. Setz beides in die Seite ein: den Import in das
   `<script>`, den `<MediaImage>` an die Stelle des Bildes. Ergänze `group` (Name der Seite) und `sizes`.
3. `alt` beschreibt, was zu sehen ist („Der Inhaber vor dem Büro in der Altstadt“). Weißt du es nicht, frag
   den Kunden in einem Satz.
4. Schlüssel: der erste Teil ohne Bindestrich (`ueberuns.inhaber.foto`, nicht `ueber-uns.…`), alle Angaben
   außer `default` als feste Zeichenkette.
5. Ansehen mit `npm run dev`. Prüfen und hochladen wie im Skill `veroeffentlichen`.
6. Sag dem Kunden in einem Satz: Das Foto ist eingebaut; nach dem Veröffentlichen kann er es unter
   Eigene Website → Inhalte selbst gegen ein anderes tauschen.

Später ein anderes Foto in einen schon veröffentlichten Bild-Platz, ohne neuen Code: `npx dealsystem image push
<datei> --slot <schlüssel> --alt "…"`. Gleiche Bearbeitung wie `add`, setzt das Bild in DealSystem (wie „Bild
ersetzen“ unter Eigene Website → Inhalte) und geht **ohne weitere Freigabe live** — frag den Kunden vorher. Der
Schlüssel ist der aus `<MediaImage key="…">`; ein neuer Platz ist erst nach dem Hochladen bekannt. `npm run dev`
zeigt das neue Bild danach sofort.

Fehler des Befehls:

- HEIC vom iPhone lässt sich nicht umwandeln: Bitte den Kunden, das Foto als JPEG zu schicken (die Meldung
  sagt, wie).
- Größer als 15 MB, kein Bild, SVG oder GIF: Die Meldung nennt den Weg. Ein Logo als SVG gehört nach
  `static/` und wird mit `src="/logo.svg"` eingebunden.
- Gibt es den Namen schon, nimm einen anderen `--name`. `--force` nur, wenn das alte Bild wirklich weg darf.

Hat der Kunde noch kein Foto, nimm ein neutrales Bild aus dem Projekt als Standard und sag ihm, dass er es nach
dem Veröffentlichen selbst tauschen kann.
