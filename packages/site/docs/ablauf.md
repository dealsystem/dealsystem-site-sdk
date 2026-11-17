# Der Weg zur veröffentlichten Seite

Diese Seite beschreibt den ganzen Ablauf, den ein KI-Agent im Auftrag des Kunden geht. Die Reihenfolge ist
fest. Was nur der Mensch tun kann, ist ausdrücklich genannt.

## 1. Neues Projekt

```bash
npm create dealsystem-site meine-website
cd meine-website
npm install
```

Es entsteht eine fertige Seite mit Startseite, Angeboten, Kontaktformular, Impressum und Datenschutz. Sie
besteht `npx dealsystem check` schon, bevor du etwas änderst. Halte das so.

## 2. Anmelden

```bash
npx dealsystem login --start
```

Der Befehl nennt eine Adresse und einen Code und endet sofort. **Der Mensch** öffnet die Adresse, meldet
sich bei DealSystem an und bestätigt den Code. Sag ihm das in einem Satz, zum Beispiel: „Bitte öffnen Sie
diese Adresse und bestätigen Sie den Code ABCD-EFGH. Sagen Sie mir Bescheid, wenn das erledigt ist.“

```bash
npx dealsystem login --wait
```

wartet auf die Bestätigung. Die Anmeldung liegt danach im Benutzerprofil des Rechners, nie im Projekt.

## 3. Seite verbinden und Inhalte holen

```bash
npx dealsystem init                     # zeigt die vorhandenen Seiten
npx dealsystem init --site <name>       # eine davon wählen
npx dealsystem init --create --name "Muster Immobilien" --slug muster-immobilien   # oder neu anlegen
npx dealsystem sync
```

`init` trägt die Kennung der Seite in `dealsystem.config.ts` ein. `sync` holt die Inhalte aus dem CRM
(Texte, Angebote, Firmendaten) nach `.dealsystem/content.json` und meldet, wo CRM und
`dealsystem.config.ts` voneinander abweichen. Nach jeder Änderung an Sammlungen oder Formularen wieder
`npx dealsystem sync`.

## 4. Bauen und ansehen

```bash
npm run dev
```

startet die Seite lokal. Formulare lassen sich ausprobieren; die Einsendung wird geprüft, aber nicht
gespeichert. Wie die Bausteine verwendet werden: `komponenten.md`. Angebote und andere Inhalte:
`inhalte.md`. Aussehen: `gestaltung.md`.

## 5. Prüfen

```bash
npm run check                          # Typen: Tippfehler in funnel="…" oder collection="…"
npm run build                          # erzeugt die fertige Seite in build/
npx dealsystem check --output build    # alle Regeln an Quelltext und fertiger Seite
```

Jede Meldung hat die Form „Datei:Zeile – Problem – so behebst du es“. Behebe jede Meldung an der Ursache
und prüfe erneut. Alle Regeln mit Korrektur: `regeln.md`. Mit `--json` kommt das Ergebnis als JSON.

**Wann die Seite „geprüft“ ist:** nur wenn der dritte Befehl mit der Zeile
`Prüfung bestanden: Quelltext und fertige Seite geprüft, 0 Fehler, …` endet. `npm run check` allein oder
`npx dealsystem check` ohne `--output build` reichen nicht; die Ausgabe sagt dann selbst, dass die fertige
Seite noch nicht geprüft ist. Sag dem Kunden nie „geprüft“ ohne diese Zeile.

**Prüfen geht ohne Anmeldung.** Scheitern `login` oder `sync` (Exit-Code 3 oder 4), höre nicht auf: Führe
die drei Befehle trotzdem aus und behebe, was sie melden. Bitte erst danach um die Anmeldung. Nur
Hochladen und Veröffentlichen brauchen sie.

## 6. Hochladen und Vorschau zeigen

```bash
npx dealsystem deploy -m "Startseite überarbeitet"
```

prüft, lädt hoch und wartet, bis DealSystem die Seite erzeugt hat. Am Ende steht die Adresse der
Vorschau. Die Vorschau ist noch nicht öffentlich. Gib dem Menschen die Adresse und bitte ihn, sie sich
anzusehen. Lehnt der Server den Stand ab, stehen die Gründe in der Ausgabe: beheben, erneut hochladen.

## 7. Veröffentlichen

Nur wenn der Mensch zu genau dieser Vorschau ausdrücklich Ja gesagt hat:

```bash
npx dealsystem publish --confirm
```

Ohne `--confirm` endet der Befehl mit `confirmation_required` (Exit-Code 2). Das ist die Aufforderung, den
Menschen zu fragen. Setze `--confirm` nie ohne sein Ja. Meldet der Befehl, dass Angaben fehlen
(Impressum, Datenschutzerklärung, Firmenname, E-Mail), trägt **der Mensch** sie im CRM unter
Website → Einstellungen ein. Danach `npx dealsystem sync`, erneut hochladen, die neue Vorschau zeigen und
**erneut fragen**.

**Jede neue Vorschau braucht ein neues ausdrückliches Ja.** Die Zustimmung gilt nur für den Stand, den der
Mensch gesehen hat. Sobald du noch einmal hochlädst, aus welchem Grund auch immer, ist sie verbraucht:
Vorschau nennen, fragen, auf das Ja warten. Sag nie „ein neues Ja brauche ich nicht“.

Zurück auf den vorigen Stand: `npx dealsystem rollback --confirm`, ebenfalls nur nach einem Ja.

## 8. Eigene Domain

Die Seite ist sofort unter einer Adresse von DealSystem erreichbar. Eine eigene Domain verbindet **der
Mensch**: im CRM unter Website → Domains die Domain eintragen. Das CRM zeigt die Einträge, die er bei
seinem Domain-Anbieter setzen muss, und prüft sie. Du kannst erklären, wo man solche Einträge beim
Anbieter findet, und mit `npx dealsystem status` nachsehen, ob die Domain schon verbunden ist. Das
Zertifikat für https richtet DealSystem selbst ein.

## Was nur der Mensch kann

| Aufgabe                                             | Wo                                                 |
| --------------------------------------------------- | -------------------------------------------------- |
| Anmeldung bestätigen                                | Adresse aus `login --start`, im Browser            |
| Veröffentlichen erlauben                            | im Gespräch mit dir, nach Ansehen der Vorschau     |
| Impressum, Datenschutzerklärung, Firmenname, E-Mail | CRM → Website → Einstellungen                      |
| Angebote, Bilder                                    | CRM → CMS                                          |
| Tracking-Kennungen (Google, Meta)                   | CRM → Website → Einstellungen                      |
| Domain eintragen, Einträge beim Anbieter setzen     | CRM → Website → Domains, dann beim Domain-Anbieter |

## Wenn etwas nicht klappt

- **Exit-Code 3:** nicht angemeldet. Zurück zu Schritt 2.
- **Exit-Code 4:** DealSystem nicht erreichbar. Etwas warten, noch einmal versuchen.
- **`check` meldet Fehler:** Korrektur aus der Meldung umsetzen. Keine Regel umgehen.
- **Der Server lehnt den Stand ab, obwohl `check` lokal grün war:** Es gilt der Server. Meldungen aus
  `deploy` beheben. Hilft `npm install @dealsystem/site@latest dealsystem@latest` und `npx dealsystem sync`?
- **Texte oder Angebote fehlen lokal:** `npx dealsystem sync`.
