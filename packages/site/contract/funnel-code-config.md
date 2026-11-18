# Vertrag: Formular-Einstellungen aus dem Code (Paket C2, noch nicht im Core)

Das SDK meldet je Formular im Manifest (`.dealsystem/manifest.json`, `funnels[]`, `manifestVersion` bleibt `1`)
zusätzlich zu `key`, `label` und `fields`:

## `fields[]`: neuer Typ `hidden`

```json
{ "name": "partner", "type": "hidden", "from": { "query": "partner" } }
{ "name": "kampagne", "type": "hidden", "from": { "utm": "campaign" } }
{ "name": "quelle", "type": "hidden", "from": { "value": "Bewertungsrechner" } }
```

- `from` hat genau einen Schlüssel: `query` (URL-Parameter, `^[A-Za-z0-9_.-]{1,64}$`, nicht `utm_*`),
  `utm` (`source` | `medium` | `campaign` | `term` | `content`) oder `value` (Text, 1 bis 500 Zeichen).
- Kein `standardField`, kein `required`. Das SDK füllt den Wert beim Absenden in `data.<name>` (höchstens 500
  Zeichen, leer = weggelassen). Der Core behandelt `hidden` wie `text` (≤ 500), mapbar auf eigene Felder, **nie**
  auf ein Standardfeld. `from` ist nur Information für das CRM; vertrauen darf der Core dem Wert nicht.

## `crm` (optional)

```json
{
	"createDeal": true,
	"pipeline": "Verkäufer",
	"stage": "Neue Anfrage",
	"dealName": "{{firstName}} {{lastName}} – Bewertung",
	"tags": ["Website", "Bewertung"],
	"leadSource": "Website",
	"confirmation": { "enabled": true, "subject": "Danke, {{firstName}}", "body": "…" }
}
```

| Feld                   | Typ      | Grenzen           | Hinweis                                                                                                     |
| ---------------------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `createDeal`           | boolean  |                   |                                                                                                             |
| `pipeline`             | string   | 1–100             | Name oder ID; nur mit `createDeal: true`                                                                    |
| `stage`                | string   | 1–100             | nur mit `pipeline`                                                                                          |
| `dealName`             | string   | 1–200             | Platzhalter `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{phone}}`, `{{adresse}}` (wie `renderDealName`) |
| `tags`                 | string[] | ≤ 20, je 1–50     | Namen                                                                                                       |
| `leadSource`           | string   | 1–100             | Name oder ID                                                                                                |
| `confirmation.enabled` | boolean  | Pflicht im Objekt |                                                                                                             |
| `confirmation.subject` | string   | 1–200             | Platzhalter `{{firstName}}`, `{{lastName}}`, `{{formName}}`, Klartext, keine Links                          |
| `confirmation.body`    | string   | 1–5 000           | wie `subject`                                                                                               |

Unbekannte Schlüssel sind ein Fehler in `validateSiteConfig` (fail-closed). Alle Angaben sind optional; fehlt `crm`,
bleibt alles wie heute.

## Regeln für den Core (C2)

- Namen gegen den Workspace auflösen; **nichts anlegen**. Unbekanntes bleibt beim Standard und steht als Warnung im
  Prüfergebnis der Version.
- „Code legt vor, CRM entscheidet“: `self_site_funnels.code_config` = normalisiertes `crm`; jede Angabe, die nicht in
  `crm_set_fields` steht, gilt aus dem Code. Feldnamen in `crm_set_fields`: genau die Schlüssel oben
  (`confirmation.subject` usw. einzeln).
- Mailtexte aus dem Code sind fremder Text (`untrustedText`), es gelten alle Schutzregeln aus #947.

## Einsendung

Unverändert `POST /api/site/v1/s/{key}/leads` (`site-api.v1.json`). `createLeadClient` und `<LeadForm>` senden
denselben Body, mit `attribution` Fassung 2.
