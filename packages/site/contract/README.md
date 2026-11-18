# Vertrag der Site-API

Gegen diese Dateien ist der Client des Pakets getestet (`tests/contract.test.ts`).

| Datei                | Herkunft                                                                                                | Inhalt                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `site-api.v1.json`   | **Kopie aus dem Core**, erzeugt mit `npm run openapi:site-api`. Nie von Hand ändern.                    | Leads, Captcha, Seitenaufrufe, Sammlungen                                                                                |
| `ds-content.v1.json` | **SDK**, Quelle hier; erzeugt mit `UPDATE_CONTRACT=1 npx vitest run tests/contentBlockContract.test.ts` | Inhaltsblock `ds-content`, Feld `contentPatch` samt Grenzen, Fälle „Artefakt vorher + Slot-Werte → nachher“ bzw. „bauen“ |

Ändert sich die Site-API im Core, wird `site-api.v1.json` neu kopiert. Schlägt danach der Vertragstest fehl,
passt der Client nicht mehr zum Server.

## Gegentest Captcha

Dass Core und SDK beim Captcha zusammenpassen, ist einmal von Hand im Browser belegt (17.11.2026): Eine
Aufgabe, erzeugt mit `altcha-lib` 2.8.0 genau wie im Core (PBKDF2/SHA-256, signiert, an die Seite
gebunden), hat das Widget dieses Pakets (`altcha` 3.6.0) in headless Chrome auf einer gebauten Seite gelöst.
Die gesendete Lösung hat `altcha-lib` 2.8.0 als gültig geprüft; mit falschem Schlüssel wurde sie abgelehnt.
Ändert eine Seite die Hauptversion von `altcha` oder `altcha-lib`, ist der Gegentest zu wiederholen.

## Inhaltsblock und Patchen (`ds-content.v1.json`)

Die Texte und Bilder aus dem CRM (Content-Slots) stehen nicht im JS-Bundle, sondern genau einmal je Seite im
Kopf als `<script type="application/json" id="ds-content">`. Das SDK legt das **Format** fest; den Patcher hat
der **Core** (`src/lib/server/selfSite/patch/`), er ist nicht Teil dieses Pakets. Die Vertragsdatei enthält:

- `element`: Muster, Regeln zur Maskierung und Reihenfolge, JSON-Schema, Beispiele Block → Element.
- `contentPatch`: Schema des Manifest-Felds, Grenzen (`richtextDefaults` höchstens 2 MB zusammen), Blocker.
- `cases`: kleine Artefakte als `{ Pfad: Inhalt }`. Mit `after`: Der Patcher muss aus `before`, `manifest` und
  `slots` genau `after` erzeugen (byte-gleich, gerendert mit `svelte/server` und den echten Bausteinen). Mit
  `blockers`: Der Patcher darf nicht patchen, der Core baut neu.

Der Core hält eine byte-gleiche Kopie und fährt denselben Test, ohne das SDK zu laden. Die Vorlage für seinen
Patcher liegt in `tests/reference/patch.ts`.
