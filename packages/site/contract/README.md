# Vertrag der Site-API

Gegen diese Dateien ist der Client des Pakets getestet (`tests/contract.test.ts`).

| Datei                           | Herkunft                                                                             | Inhalt                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `site-api.v1.json`              | **Kopie aus dem Core**, erzeugt mit `npm run openapi:site-api`. Nie von Hand ändern. | Leads, Captcha, Sammlungen                                               |
| `content-block.v1.schema.json`  | **SDK**, Quelle hier                                                                 | Inhaltsblock `<script type="application/json" id="ds-content">` je Seite |
| `content-block.v1.fixture.json` | **SDK**, erzeugt mit `node scripts/content-block-fixture.mjs` nach `npm run build`   | Beispiele: Block → Element genau so, wie es im HTML steht                |
| `content-patch.v1.schema.json`  | **SDK**, Quelle hier                                                                 | Feld `contentPatch` im Manifest                                          |

Ändert sich die Site-API im Core, wird `site-api.v1.json` neu kopiert. Schlägt danach der Vertragstest fehl,
passt der Client nicht mehr zum Server.

## Gegentest Captcha

Dass Core und SDK beim Captcha zusammenpassen, ist einmal von Hand im Browser belegt (17.11.2026): Eine
Aufgabe, erzeugt mit `altcha-lib` 2.8.0 genau wie im Core (PBKDF2/SHA-256, signiert, an die Seite
gebunden), hat das Widget dieses Pakets (`altcha` 3.6.0) in headless Chrome auf einer gebauten Seite gelöst.
Die gesendete Lösung hat `altcha-lib` 2.8.0 als gültig geprüft; mit falschem Schlüssel wurde sie abgelehnt.
Ändert eine Seite die Hauptversion von `altcha` oder `altcha-lib`, ist der Gegentest zu wiederholen.

## Inhaltsblock und Patchen

Die Texte und Bilder aus dem CRM (Content-Slots) stehen nicht im JS-Bundle, sondern genau einmal je Seite im
Kopf als `<script type="application/json" id="ds-content">`. Im Element sind `<`, `>`, `&`, U+2028 und U+2029
als `\uXXXX` geschrieben; es kann also weder `</script>` noch `<!--` enthalten. Der Core schreibt neue Werte
mit `patchArtifact` aus `@dealsystem/site/patch` in eine fertige Seite, wenn das Manifest
`contentPatch.delivery = 'dom'` ohne `blockers` meldet. Der Core prüft seine Lesart gegen
`content-block.v1.fixture.json` (`tests/contentBlockContract.test.ts` hier ist das Vorbild).
