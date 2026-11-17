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

Inhalte holen, CRM mit dealsystem.config.ts abgleichen, AGENTS.md-Block erneuern.

- `--offline` – nicht ins Netz; Abgleich mit der vorhandenen .dealsystem/content.json
- `--fix-config` – svelte.config.js und vite.config.ts aus dem Starter wiederherstellen

## `dealsystem dev [--port <port>] [--media-origin <https://…>]`

Dev-Server starten; Formulare gehen als Probe an das CRM.

- `--port <port>` – Port des Vite-Dev-Servers
- `--media-origin <url>` – woher /_ds/media/* kommt (Standard: Hauptadresse der Seite)

## `dealsystem check [--output build] [--allowed] [--rules]`

Regeln lokal prüfen (Exit-Code 1 bei Fehlern).

- `--output <ordner>` – zusätzlich die gebaute Seite prüfen (nach `npm run build`)
- `--allowed` – freigegebene Pakete anzeigen
- `--rules` – Regelkatalog anzeigen

## `dealsystem deploy [-m <Notiz>] [--publish [--confirm]] [--no-wait] [--timeout <s>]`

Prüfen, hochladen, bauen lassen, Vorschau-URL ausgeben.

- `-m, --message <Notiz>` – Notiz zur Version
- `--publish` – danach live schalten (nur mit Bestätigung)
- `--confirm` – der Nutzer hat dem Live-Schalten zugestimmt
- `--no-wait` – nach dem Hochladen nicht auf den Build warten
- `--timeout <s>` – höchstens so lange warten (Standard 600)

## `dealsystem publish [--version <id|nummer>] [--confirm]`

Eine fertige Version live schalten (mit Bestätigung).

- `--version <id|nummer>` – Standard: neueste fertige Version
- `--confirm` – der Nutzer hat zugestimmt

## `dealsystem rollback [--version <id|nummer>] [--confirm]`

Auf eine frühere Version zurückschalten (mit Bestätigung).

- `--version <id|nummer>` – Standard: die vorige Freigabe
- `--confirm` – der Nutzer hat zugestimmt

## `dealsystem status`

Seite, Live-Version, letzte Versionen, Domains.

## Exit-Codes

- `0` – in Ordnung
- `1` – Prüfung oder Build fehlgeschlagen: Meldungen lesen, beheben, wiederholen
- `2` – falscher Aufruf, oder der Mensch muss erst zustimmen (`confirmation_required`)
- `3` – nicht angemeldet: `npx dealsystem login --start`
- `4` – DealSystem nicht erreichbar: später noch einmal versuchen
