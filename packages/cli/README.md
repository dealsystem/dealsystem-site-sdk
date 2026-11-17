# dealsystem

CLI für Self-Service-Websites auf DealSystem. Ausgeführt wird sie vom KI-Agenten des Kunden: alles läuft
ohne Rückfragen über Flags, jede Ausgabe gibt es mit `--json`, jede Meldung hat die Form
„Datei:Zeile – Problem – so behebst du es“. Ein Mensch macht nur zwei Dinge: Er bestätigt den Login im
Browser und stimmt dem Live-Schalten zu.

## Befehle

| Befehl                                                              | Tut                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `login [--start \| --wait] [--no-browser]`                          | Gerätecode-Login. Der Token liegt im Benutzerprofil (0600), nie im Projekt                                        |
| `logout`                                                            | Token widerrufen und löschen                                                                                      |
| `init [--site <id\|slug>] [--create --name … --slug …]`             | Seite wählen oder anlegen, `siteId` in `dealsystem.config.ts` eintragen                                           |
| `sync [--offline] [--fix-config]`                                   | Schnappschuss → `.dealsystem/content.json`, Abgleich CRM ↔ Config, `src/dealsystem.d.ts` anlegen, AGENTS.md-Block |
| `dev [--port] [--media-origin <url>]`                               | Vite des Projekts; `…/leads` → `dev/leads` (`dryRun`), `/_ds/media/*` durchgereicht                               |
| `check [--output build] [--allowed] [--rules]`                      | Regelkatalog lokal, Exit-Code 1 bei Fehlern                                                                       |
| `deploy [-m …] [--publish [--confirm]] [--no-wait] [--timeout <s>]` | check → packen → hochladen → Build abwarten → Vorschau-URL                                                        |
| `publish [--version <id\|nummer>] [--confirm]`                      | fertige Version live schalten                                                                                     |
| `rollback [--version <id\|nummer>] [--confirm]`                     | auf eine frühere Version zurück                                                                                   |
| `status`                                                            | Seite, Live-Version, letzte Versionen, Domains                                                                    |

Allgemein: `--json`, `--dir <ordner>`, `--site <id>`, `--api-url <url>` (oder `DEALSYSTEM_API_URL`),
`--quiet`. Für eigene CI: API-Schlüssel in `DEALSYSTEM_TOKEN`.

Exit-Codes: `0` ok · `1` Prüfung oder Build fehlgeschlagen · `2` falscher Aufruf oder Bestätigung nötig ·
`3` nicht angemeldet · `4` API nicht erreichbar.

**Live schalten:** `deploy --publish` und `publish`/`rollback` fragen am Terminal nach. Ohne Terminal
(Agent) brechen sie mit Exit-Code 2 und `confirmation_required` ab. Der Agent fragt dann den Nutzer und
wiederholt den Befehl mit `--confirm`.

## Regelkatalog als Bibliothek

Der Build-Host ruft dieselben Regeln auf. Sie laufen ohne Netz und ohne Browser und führen nichts aus dem
Projekt aus: Konfigurationen werden statisch gelesen.

```ts
import { runCheck, toBuildReportCheck, RULE_SET_VERSION } from 'dealsystem/check';

const source = await runCheck({
	projectDir: '/job/src',
	stages: ['source'],
	sdkRange: job.sdkRange,
	ruleSetVersion: job.ruleSetVersion,
});
const output = await runCheck({
	outputDir: '/job/build',
	stages: ['output'],
	siteUrl: job.env.PUBLIC_DEALSYSTEM_SITE_URL,
});
const check = toBuildReportCheck([source, output]); // → report.check
```

Phase 2 (axe-core, Lighthouse) dockt über `plugins: CheckPlugin[]` an.
