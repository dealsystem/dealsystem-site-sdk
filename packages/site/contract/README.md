# Vertrag der Site-API

`site-api.v1.json` beschreibt die öffentliche Site-API (`/api/site/v1/s/{publishableKey}/…`), gegen die
dieses Paket arbeitet. `tests/contract.test.ts` prüft den Client dagegen.

**Stand: vorläufig.** Die Datei ist von Hand aus dem Konzept abgeleitet. Sobald der Core seine Beschreibung
aus den Zod-Schemas der Routen erzeugt (`buildSiteApiOpenApi()`), wird sie hierher kopiert und ersetzt
diese Fassung. Schlägt danach der Vertragstest fehl, passt der Client nicht mehr zum Server.
