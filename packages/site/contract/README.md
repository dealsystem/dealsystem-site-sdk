# Vertrag der Site-API

Gegen diese Dateien ist der Client des Pakets getestet (`tests/contract.test.ts`).

| Datei              | Herkunft                                                                             | Inhalt                                    |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| `site-api.v1.json` | **Kopie aus dem Core**, erzeugt mit `npm run openapi:site-api`. Nie von Hand ändern. | Leads, Captcha, Seitenaufrufe, Sammlungen |

`funnel-code-config.md` hält fest, was das SDK für Paket C2 im Manifest meldet (`hidden`, `crm`); der Core
setzt es noch um.

Ändert sich die Site-API im Core, wird `site-api.v1.json` neu kopiert. Schlägt danach der Vertragstest fehl,
passt der Client nicht mehr zum Server.

## Gegentest Captcha

Dass Core und SDK beim Captcha zusammenpassen, ist einmal von Hand im Browser belegt (17.11.2026): Eine
Aufgabe, erzeugt mit `altcha-lib` 2.8.0 genau wie im Core (PBKDF2/SHA-256, signiert, an die Seite
gebunden), hat das Widget dieses Pakets (`altcha` 3.6.0) in headless Chrome auf einer gebauten Seite gelöst.
Die gesendete Lösung hat `altcha-lib` 2.8.0 als gültig geprüft; mit falschem Schlüssel wurde sie abgelehnt.
Ändert eine Seite die Hauptversion von `altcha` oder `altcha-lib`, ist der Gegentest zu wiederholen.
