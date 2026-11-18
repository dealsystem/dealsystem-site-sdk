# Vertrag: Formular-Einstellungen aus dem Code (Paket C2, Core-PR #963)

Das SDK meldet je Formular im Manifest (`.dealsystem/manifest.json`, `funnels[]`, `manifestVersion` bleibt `1`)
zusätzlich zu `key`, `label` und `fields`:

## Grenze: höchstens **50 Felder** je Formular

Der Core übernimmt aus dem Manifest je Formular nur die ersten 50 Felder (`SELF_SITE_FUNNEL_MAX_FIELDS` in
`src/lib/domain/selfSite.ts`, angewandt in `normalizeFieldDefs`). Weitere Felder nimmt `POST …/leads` zwar an (bis
`SITE_LEAD_MAX_FIELDS = 60` Werte in `data`, `src/lib/server/validation/schemas/siteApi.ts`), aber ungeprüft und
ohne Zuordnung, nur als Notiz. Versteckte Felder zählen mit. Im SDK: `FUNNEL_MANIFEST_MAX_FIELDS` (50, Warnung
`QUA-010`) und `MAX_FUNNEL_FIELDS` (60, Fehler `STR-005`). Der Core nennt beide Zahlen im Site-API-Vertrag unter
`info['x-dealsystem-limits']` (`funnelManifestFields`, `leadDataFields`, `hiddenFieldValue`); sobald
`site-api.v1.json` sie enthält, prüft ein Vertragstest die SDK-Konstanten dagegen.

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
| `pipeline`             | string   | 1–100             | Name einer Deal-Pipeline (ohne Groß/Klein)                                                                  |
| `stage`                | string   | 1–100             | Name einer Phase; nur mit `pipeline`; fehlt = erste Phase der Pipeline                                      |
| `dealName`             | string   | 1–200             | Platzhalter `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{phone}}`, `{{adresse}}` (wie `renderDealName`) |
| `tags`                 | string[] | ≤ 20, je 1–50     | Namen                                                                                                       |
| `leadSource`           | string   | 1–100             | Name; gilt für Kontakt und Deal                                                                             |
| `confirmation.enabled` | boolean  | Pflicht im Objekt |                                                                                                             |
| `confirmation.subject` | string   | 1–200             | Platzhalter `{{firstName}}`, `{{lastName}}`, `{{formName}}`, Klartext, keine Links                          |
| `confirmation.body`    | string   | 1–5 000           | wie `subject`                                                                                               |

Unbekannte Schlüssel sind ein Fehler in `validateSiteConfig` (fail-closed). Alle Angaben sind optional; fehlt `crm`,
bleibt alles wie heute.

## Regeln für den Core (C2)

- Nur **Namen** (keine IDs), aufgelöst im Workspace der Seite, ohne Groß/Klein, nur bei genau einem Treffer;
  **nichts anlegen**. Unbekanntes oder Mehrdeutiges lässt den Wert, wie er ist, und steht als Hinweis am Formular
  (Reiter „Formulare“, `codeSettings[].issue` der API). Der Build scheitert daran nie.
- `createDeal: true` gilt nur, wenn danach Pipeline und Phase feststehen (aus dem Code oder im CRM gewählt).
- „Code legt vor, CRM entscheidet“: `self_site_funnels.code_config` = normalisiertes `crm`; jede Angabe, die nicht in
  `crm_set_fields` steht, gilt aus dem Code. Schlüssel in `crm_set_fields`: `createDeal`, `pipeline` (umfasst
  `stage`), `dealName`, `tags`, `leadSource`, `confirmation.enabled`, `confirmation.subject`, `confirmation.body`.
  „Auf Code-Stand zurücksetzen“ nimmt einen Schlüssel wieder heraus.
- Mailtexte aus dem Code sind fremder Text (`untrustedText`), es gelten alle Schutzregeln aus #947.

## `leadmagnet` (Paket C4)

Jeder Eintrag in `funnels[]` trägt `leadmagnet`, **immer** gesetzt:

```json
{ "key": "ratgeber", "label": "Ratgeber", "fields": [], "leadmagnet": { "label": "Ratgeber Immobilienverkauf" } }
{ "key": "kontakt", "label": "Kontakt", "fields": [], "leadmagnet": null }
```

- `label`: Text, getrimmt, 1 bis 120 Zeichen (`LEADMAGNET_LABEL_MAX`). Sonst nichts im Objekt: keine Datei, kein
  Pfad, kein Link. `validateSiteConfig` lehnt Datei-/Link-Schlüssel und Links im `label` ab.
- `null`: Das Formular verspricht keine Datei. Ältere SDKs senden das Feld nicht; der Core behandelt das wie `null`.
- Die Datei lädt der Kunde im CRM hoch; der Core schickt den signierten, ablaufenden Download-Link in der
  Eingangsbestätigung (nur nach Captcha, mit den Schutzregeln aus #947). `label` ist fremder Text (`untrustedText`).
- `<LeadForm>` und `createLeadClient().successMessage` kündigen die Datei nach dem Absenden an, ohne zu
  behaupten, dass sie schon da ist.

## Einsendung

Unverändert `POST /api/site/v1/s/{key}/leads` (`site-api.v1.json`). `createLeadClient` und `<LeadForm>` senden
denselben Body, mit `attribution` Fassung 2.
