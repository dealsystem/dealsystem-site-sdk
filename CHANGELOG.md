# Änderungen

Frühere Versionen sind in den Release-PRs beschrieben (bis 0.2.6, #21).

## 0.2.7 (21.11.2026)

Gilt für `@dealsystem/site`, `create-dealsystem-site` und die CLI `dealsystem` (vorher 0.2.5). Setzt einen Core
voraus, der diese Stände in Production hat: #1021 (Termine vor Ort), #1026 (Testmail für Testläufe), #1032 (T5,
Website-Besuche) und #1034 (Ort-Art in der Anrede der Website). Seit Core 19841bc4b ist das der Fall.

### @dealsystem/site

- **Cookie-Hinweis auf jeder Seite** (#22): Jede Seite mit `<SiteHead />` fragt nach „Marketing“, damit DealSystem
  wiederkehrende Besuche erkennen und einer Anfrage zuordnen kann, auch ohne Tracking-Kennung. Das ändert den
  Hinweis auf allen Seiten; „Cookie-Einstellungen“ steht immer im Fußbereich. „Alle ablehnen“ und „Alle
  akzeptieren“ bleiben gleich gestaltet, nichts ist vorausgewählt.
- **Eigenes Banner** (#22): `consent: { banner: 'own' }` in `dealsystem.config.ts` blendet Hinweis und
  „Cookie-Einstellungen“ aus; das eigene Banner meldet die Wahl mit dem neuen `setConsent()`. Bis dahin gilt nichts
  als erlaubt. Ein Widerruf löscht die Besuchs-ID sofort.
- **Fokus nicht verdeckt** (#22): Solange der Hinweis offen ist, hält die Seite unten seine Höhe frei. Vorher lag der
  Tastaturfokus im Fußbereich unter dem Hinweis (WCAG 2.2, 2.4.11).
- **Anrede aus dem CRM** (#22, #23): Alle Texte der Bausteine für Besucher siezen oder duzen, wie im CRM für die
  Website eingestellt (`site.salutation`, ohne Angabe „Sie“): Cookie-Hinweis, Formular samt Prüf- und
  Fehlermeldungen, Termin-Booker, Fehler der Site-API, Karte, Einbettung, Video, Listen. Einzelne Texte ersetzt die
  Prop `texts` (bzw. die Option `texts` von `createLeadClient()` und `createBookingClient()`). Neue Typen:
  `FormTexts`, `BookerTexts`, `CookieBannerTexts`, `MapEmbedTexts`, `EmbedTexts`, `MediaVideoTexts`,
  `CollectionListTexts`, `RequestTexts`, `Anrede`.
- **Formular:** Ein abgeschaltetes oder unbekanntes Formular meldet „Dieses Formular ist zurzeit nicht verfügbar.“
  statt „Der angefragte Inhalt ist nicht verfügbar.“ (#23).
- **Termin beim Gast und Telefon als Pflicht** (#19): Ort-Art „Bei Ihnen/dir vor Ort“ mit Adressfeldern
  („Wo findet der Termin statt?“), Telefon als Pflicht je Terminart; `addressLabels`, `locationLabels`.
- **Verträge:** `contract/visit-consent.v1.json` neu (Core hält eine byte-gleiche Kopie); `site-api.v1.json` aus
  Core 19841bc4b.

### dealsystem (CLI)

- `dealsystem dev --testmail` oder `DEALSYSTEM_TEST_MAIL=1` (#24): Testläufe schicken die echte Bestätigung als
  „[Test]“-Mail an die Person hinter der Anmeldung; die Konsole nennt Empfänger oder Grund. Ohne den Schalter
  bleibt alles wie bisher.
- Verlangt `@dealsystem/site ^0.2.7`.

### create-dealsystem-site

- Der Starter verlangt `@dealsystem/site ^0.2.7` und `dealsystem ^0.2.7`.
- Kein fester Erfolgstext in Sie mehr auf der Kontaktseite (es gilt der Standard in der Anrede der Website); das
  Feld heißt neutral „Nachricht“ (#23).
