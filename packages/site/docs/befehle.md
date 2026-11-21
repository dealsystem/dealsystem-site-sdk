<!-- Erzeugt von scripts/build-agent-docs.mjs. Nicht von Hand ändern. -->

# Befehle der CLI (`npx dealsystem …`)

Alle Befehle laufen ohne Rückfragen. Mit `--json` kommt das Ergebnis als JSON. Weitere allgemeine
Optionen: `--dir <ordner>`, `--site <id>`, `--quiet`.

## `dealsystem login [--start | --wait] [--no-browser]`

Anmelden per Gerätecode (Bestätigung im Browser).

- `--start` – Code anfordern und sofort beenden (für Agenten)
- `--wait` – auf die Bestätigung einer mit --start begonnenen Anmeldung warten
- `--no-browser` – Browser nicht automatisch öffnen

## `dealsystem logout`

Abmelden und Token löschen.

## `dealsystem init [--site <id|slug>] [--create --name <Name> --slug <adresse>]`

Seite wählen oder anlegen, `siteId` in dealsystem.config.ts eintragen.

- `--site <id|slug>` – vorhandene Seite wählen
- `--create --name <Name> --slug <adresse>` – neue Seite anlegen

## `dealsystem sync [--offline] [--fix-config]`

Inhalte holen, CRM mit dealsystem.config.ts abgleichen, AGENTS.md-Block erneuern, fehlende Skills wiederherstellen.

- `--offline` – nicht ins Netz; Abgleich mit der vorhandenen .dealsystem/content.json
- `--fix-config` – svelte.config.js und vite.config.ts aus dem Starter wiederherstellen

## `dealsystem dev [--port <port>] [--media-origin <https://…>] [--testmail]`

Dev-Server starten; Formulare gehen als Probe an das CRM.

- `--port <port>` – Port des Vite-Dev-Servers
- `--media-origin <url>` – woher /_ds/media/* kommt (Standard: Hauptadresse der Seite)
- `--testmail` – echte Bestätigung als „[Test]“-Mail an dich (auch DEALSYSTEM_TEST_MAIL=1)

## `dealsystem check [--output build] [--allowed] [--rules]`

Regeln lokal prüfen (Exit-Code 1 bei Fehlern).

- `--output <ordner>` – zusätzlich die gebaute Seite prüfen (nach `npm run build`)
- `--allowed` – freigegebene Pakete anzeigen
- `--rules` – Regelkatalog anzeigen

## `dealsystem deploy [-m <Notiz>] [--publish [--confirm]] [--no-wait] [--timeout <s>]`

Prüfen, lokal bauen, hochladen, Vorschau-URL ausgeben.

- `-m, --message <Notiz>` – Notiz zur Version
- `--publish` – danach live schalten (nur mit Bestätigung)
- `--confirm` – der Nutzer hat dem Live-Schalten zugestimmt
- `--no-wait` – nach dem Hochladen nicht auf den Build warten
- `--timeout <s>` – höchstens so lange warten (Standard 600)

## `dealsystem publish [--version <id|nummer>] [--confirm] [--no-wait] [--timeout <s>]`

Eine fertige Version live schalten (mit Bestätigung).

- `--version <id|nummer>` – Standard: neueste fertige Version
- `--confirm` – der Nutzer hat zugestimmt
- `--no-wait` – nicht auf den Neubau mit den Rechtstexten warten (sonst wartet der Befehl, bis er live ist)
- `--timeout <s>` – höchstens so lange auf den Neubau warten (Standard 600)

## `dealsystem rollback [--version <id|nummer>] [--confirm] [--no-wait] [--timeout <s>]`

Auf eine frühere Version zurückschalten (mit Bestätigung).

- `--version <id|nummer>` – Standard: die vorige Freigabe
- `--confirm` – der Nutzer hat zugestimmt
- `--no-wait` – nicht auf den Neubau mit den Rechtstexten warten (sonst wartet der Befehl, bis er live ist)
- `--timeout <s>` – höchstens so lange auf den Neubau warten (Standard 600)

## `dealsystem pull [ordner] [--site <id|slug>] [--version <nummer|id>]`

Quellcode einer Version in einen neuen Ordner holen (z. B. auf einem neuen Rechner); Standard: die Live-Version.

- `[ordner]` – neuer oder leerer Ordner (Standard: ./<slug der Seite>); vorhandene Dateien werden nie überschrieben
- `--site <id|slug>` – Seite wählen, wenn der Workspace mehrere hat
- `--version <nummer|id>` – diese Version statt der Live-Version

## `dealsystem image add <datei> [--name <name>] [--key <schlüssel>] [--alt "…"] [--force]
       dealsystem image push <datei> --slot <schlüssel> --alt "…"`

Foto ins Projekt holen (add) oder als eigenes Bild eines Bild-Platzes in DealSystem setzen (push); beide verkleinern und entfernen Standort und Metadaten.

- `<datei>` – JPEG, PNG, WebP oder AVIF, höchstens 15 MB; wird auf 2560 px verkleinert, EXIF und GPS werden entfernt
- `--name <name>` – Dateiname im Projekt (Standard: aus dem Dateinamen), landet in src/lib/assets/bilder/
- `--key <schlüssel>` – Schlüssel des Bild-Slots im ausgegebenen Baustein (Standard: bilder.<name>)
- `--alt "…"` – Beschreibung des Bildes für den ausgegebenen Baustein
- `--force` – ein Bild gleichen Namens überschreiben
- `push: --slot <schlüssel>` – Bild-Platz aus <MediaImage key="…">; --alt "…" ist Pflicht; geht ohne Freigabe live, danach holt der Befehl die Inhalte für dev

## `dealsystem status`

Workspace und Nutzer der Anmeldung, Seite (ID, Slug), Live-Version, Rechtstexte, letzte Versionen, Domains.

## Exit-Codes

- `0` – in Ordnung
- `1` – Prüfung oder Build fehlgeschlagen: Meldungen lesen, beheben, wiederholen
- `2` – falscher Aufruf, oder der Mensch muss erst zustimmen (`confirmation_required`)
- `3` – nicht angemeldet: `npx dealsystem login --start`
- `4` – DealSystem nicht erreichbar: später noch einmal versuchen
