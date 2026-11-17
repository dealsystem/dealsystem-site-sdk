# Vertrag der Site-API

Gegen diese Dateien ist der Client des Pakets getestet (`tests/contract.test.ts`).

| Datei                                  | Herkunft                                                                             | Inhalt                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| `site-api.v1.json`                     | **Kopie aus dem Core**, erzeugt mit `npm run openapi:site-api`. Nie von Hand ändern. | `POST /s/{key}/leads`                    |
| `site-api.collections.vorlaeufig.json` | von Hand aus dem Konzept abgeleitet                                                  | `GET …/collections/{key}` und `…/{slug}` |

Ändert sich die Site-API im Core, wird `site-api.v1.json` neu kopiert. Schlägt danach der Vertragstest fehl,
passt der Client nicht mehr zum Server. Sobald der Core die Sammlungs-Endpunkte in seinen Vertrag aufnimmt,
entfällt die vorläufige Datei.
