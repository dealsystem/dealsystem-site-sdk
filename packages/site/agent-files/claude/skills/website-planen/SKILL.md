---
name: website-planen
description: Ziel und Aufbau einer Website festlegen, bevor gebaut wird, für jeden Betrieb (Handwerk, Praxis, Agentur, Beratung, Immobilien …). Verwenden, wenn eine Seite neu entsteht, der Kunde sein Ziel noch nicht genannt hat oder du ihm eine Struktur vorschlagen willst.
---

# Website planen: erst das Ziel, dann die Struktur

Nachschlagen: `node_modules/@dealsystem/site/docs/ablauf.md` (Schritt 0) und `komponenten.md`.

## 1. Ziel klären

Weißt du noch nichts über den Kunden, frag in **einer** Nachricht nach dem Ziel:

> Was bietest du an, für wen, und was soll ein Besucher auf deiner Seite tun: anrufen, ein Formular ausfüllen,
> einen Termin buchen?

Weißt du schon genug (aus dem Auftrag, aus Dateien im Projektordner, aus den Firmendaten von
`npx dealsystem sync`), frag nicht noch einmal. Schlag eine Struktur aus Abschnitt 3 vor und lass sie
bestätigen: „Ich schlage diese Seiten vor: … Passt das so, oder sollen wir es vorher kurz besprechen?“

Leg dich nicht auf eine Branche fest. Nimm die Begriffe des Kunden („Leistungen“, „Behandlungen“, „Projekte“).

## 2. Grundsätze für kleine Unternehmensseiten

- **Oben sagen, was der Betrieb tut und für wen**, mit einer klaren Hauptaktion (Knopf „Anfrage senden“,
  „Termin buchen“ oder die Telefonnummer). Ein konkretes Nutzenversprechen statt einer allgemeinen Begrüßung.
- **Das Wichtigste zuerst:** Überschriften beginnen mit dem informativen Wort, kurze Absätze, Listen statt
  Textblöcken. Besucher überfliegen die Seite.
- **Konkrete Beispiele zeigen:** echte Leistungen, Arbeiten oder Angebote statt Kategorien und Stockfotos.
- **Vertrauen durch Echtes:** eigene Fotos (Porträt, Team, Arbeiten), Referenzen und Bewertungen nur, wenn der
  Kunde sie liefert. Erfinde keine Bewertungen, Zahlen oder Auszeichnungen: Täuschung kostet Vertrauen.
- **Kontakt leicht machen:** Kontakt in der Navigation und im Fuß jeder Seite, Telefon und E-Mail sichtbar
  (`data.site` aus dem CRM), ein Formular als zusätzlicher Weg, nicht als einziger.
- **Mobil zuerst:** Die meisten Besucher kommen mit dem Handy. Auf dem Handy derselbe Inhalt, nur gestapelt,
  Knöpfe groß genug zum Tippen (`gestaltung.md`).
- **Wenige Seiten:** lieber eine gute Startseite und zwei, drei Unterseiten als zehn halbleere
  (Empfehlung von DealSystem, keine Studie).

Quellen (allgemeine Grundsätze, nicht wörtlich übernommen):
Nielsen Norman Group, „Homepage Design: 5 Fundamental Principles“
(https://www.nngroup.com/articles/homepage-design-principles/), „F-Shaped Pattern of Reading on the Web“
(https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) und „‘Contact Us’ Page Guidelines“
(https://www.nngroup.com/articles/contact-us-pages/); Google Search Central, „Creating helpful, reliable,
people-first content“ (https://developers.google.com/search/docs/fundamentals/creating-helpful-content) und
„Mobile-first Indexing Best Practices“
(https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing).

## 3. Struktur nach Ziel

Je Ziel ein Vorschlag. Mischen ist erlaubt; die Hauptaktion bleibt eine.

| Ziel                                         | Hauptaktion              | Seiten (Vorschlag)                                                        | Bausteine und Skills                                                   |
| -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Anfragen** (Handwerk, Beratung, Agentur)   | Formular oder Anruf      | Start (Nutzen, Leistungen kurz, Referenzen, Kontakt), Leistungen, Kontakt | `<LeadForm>` (`formular-anbinden`), mehrstufig: `funnel-mehrstufig`    |
| **Termine** (Praxis, Coaching, Erstgespräch) | Termin buchen            | Start, Angebot oder Behandlungen, Termin, Über uns                        | `<Booker>` (`termin-buchung`); die Terminart kommt aus dem CRM         |
| **Verkauf über Anfrage** (Objekte, Produkte) | Anfrage zu einem Angebot | Start, Angebote (Liste und Einzelseite), Kontakt                          | Sammlung (`angebote-einbauen`), `<LeadForm>`; Bezahlen gibt es nicht   |
| **Mitarbeiter finden**                       | Bewerbung oder Rückruf   | Start oder Karriere, offene Stellen, Team, Kontakt                        | Sammlung „Stellen“ (`angebote-einbauen`), `<LeadForm>` für Bewerbungen |
| **Arbeiten zeigen** (Portfolio)              | Anfrage nach dem Ansehen | Start mit Auswahl, Referenzen (Liste und Einzelseite), Über uns, Kontakt  | Sammlung „Referenzen“, `<MediaImage>` (`bild-einbauen`)                |

Für jeden Vorschlag gilt: Impressum und Datenschutz sind schon da, Texte als `<Text>`/`<RichText>` mit festem
`key`, Fehlendes als sichtbarer Platzhalter. Danach weiter mit Skill `erster-entwurf`.
