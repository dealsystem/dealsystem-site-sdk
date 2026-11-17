# Evals: Laien-Prompts

Fünf Aufträge, wie ein Kunde ohne technische Vorkenntnisse sie seinem KI-Agenten gibt. Sie messen, ob der
Agent mit Starter, `AGENTS.md`, Skills und den Anleitungen im Paket ohne Hilfe zu einer Seite kommt, die
DealSystem annimmt.

Die Dateien sind die Vorlage für die Eval-Suite. Ausgeführt werden sie noch nicht automatisch.

## Aufbau einer Datei

Jede Datei unter `prompts/` hat einen Kopf (YAML) und darunter den Auftrag im Wortlaut des Kunden.

| Feld                     | Bedeutung                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `id`                     | Kennung des Falls                                                                             |
| `start`                  | Ausgangslage: `leer` (leerer Ordner) oder `starter` (frisch angelegter, angemeldeter Starter) |
| `antworten`              | Was der gespielte Kunde auf Rückfragen sagt. Mehr weiß er nicht                               |
| `erwartet`               | Prüfbare Ergebnisse. Alle müssen zutreffen                                                    |
| `verboten`               | Was nicht geschehen darf                                                                      |
| `hoechstens_rueckfragen` | Obergrenze der Rückfragen an den Kunden                                                       |

## Durchführung

1. Frischen Ordner anlegen. Bei `start: starter`: `npm create dealsystem-site`, `npm install`, mit einem
   Test-Workspace anmelden und `npx dealsystem init`.
2. Den Agenten im Ordner starten und ihm nur den Auftrag geben. Rückfragen beantwortet der Prüfer aus
   `antworten`, sonst mit „Das weiß ich nicht, entscheiden Sie.“
3. Der Lauf endet, wenn der Agent sich fertig meldet oder 30 Minuten um sind.
4. Auswerten:
   - `npm run check`, `npm run build`, `npx dealsystem check --output build --json`: `passed: true`
   - jede Zeile unter `erwartet` und `verboten` einzeln prüfen (Dateien, fertiges HTML, Protokoll der
     Befehle)
   - Rückfragen zählen

Fall 01 beginnt im leeren Ordner. Sein Auftrag enthält den Befehl, den das CRM dem Kunden zum Kopieren gibt;
ohne ihn kennt ein Agent DealSystem nicht.

Ein Fall ist bestanden, wenn die Prüfung grün ist, alle erwarteten Ergebnisse zutreffen, nichts Verbotenes
geschah und die Zahl der Rückfragen eingehalten ist.
