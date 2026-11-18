---
name: erster-entwurf
description: Der Anfang mit einem neuen Kunden, von der ersten Nachricht bis zum ersten Entwurf, den er auf seinem Rechner sieht. Verwenden, wenn eine Website neu entsteht oder der Kunde zum ersten Mal mit dir spricht, bevor irgendetwas gebaut oder hochgeladen wird.
---

# Erster Entwurf: fragen, lokal zeigen, erst dann hochladen

Nachschlagen: `node_modules/@dealsystem/site/docs/ablauf.md` (Schritte 0, 4 und 6).

## 1. Erste Nachricht: genau eine Frage

> Wie möchtest du vorgehen? (a) Wir besprechen kurz deine Seite, ich stelle dir ein paar Fragen nacheinander.
> (b) Ich lege einfach los und baue dir aus dem, was ich habe, einen ersten Entwurf.

Bau, lade und frag nichts anderes, bevor er geantwortet hat. Keine Bitte um die Anmeldung in derselben
Nachricht.

## 2a. Kurz besprechen

Höchstens fünf Fragen, **je eine pro Nachricht**, in einfachen Worten. Überspring, was er schon gesagt hat:

1. Was soll die Seite erreichen (z. B. Verkäufer finden, Anfragen zu Objekten, Vertrauen aufbauen)?
2. Wen möchtest du damit ansprechen?
3. Wie soll sie wirken? Gibt es eine Seite, die dir gefällt?
4. Welche Fotos hast du (Porträt, Team, Objekte)? Schick sie mir gern.
5. Welche Seiten brauchst du (z. B. Start, Leistungen, Über mich, Kontakt)?

## 2b. Einfach loslegen

Nimm, was du hast: was er geschrieben hat, Dateien im Projektordner (Fotos mit `npx dealsystem image add`,
Skill `bild-einbauen`), eine bestehende Website oder ein Profil, **nur wenn er die Adresse nennt**, und die
Firmendaten aus `npx dealsystem sync` (`data.site`). Daraus ein erster Entwurf.

- Erfinde nichts (AGENTS.md): Was fehlt, steht als sichtbarer Platzhalter da, z. B. „[Hier kommt Ihr Porträt]“
  oder „[Ihre Leistungen in zwei Sätzen]“, als `<Text>` mit festem `key`, damit er es später im CRM tauscht.
- Behaupte nicht, du kennst frühere Gespräche oder andere Chats.

## 3. Lokal zeigen und gemeinsam ändern

`npm run dev` starten und ihm die Adresse geben, die der Befehl anzeigt (meist `http://localhost:5173`):
„Dein erster Entwurf läuft auf deinem Rechner: http://localhost:5173. Sag mir, was ich ändern soll.“ Ändere,
bis er zufrieden ist. Prüfen (`npm run check`, `npm run build`, `npx dealsystem check --output build`) gehört
dazu, aber nicht in die Nachricht an ihn.

**Läufst du nicht auf seinem Rechner** (etwa als Agent in der Cloud), kann er localhost nicht öffnen. Sag das in
einem Satz und zeig ihm stattdessen gleich die Vorschau (Schritt 4).

## 4. Hochladen erst nach seinem Okay

Erst wenn er zum lokalen Stand ausdrücklich Ja sagt („passt, zeig es online“): `npx dealsystem deploy -m "…"`
und ihm die Vorschau-Adresse geben. Die Seite läuft zuerst unter einer Adresse wie `<name>.dealsystem.site`;
eine eigene Domain kann er später verbinden (Eigene Website → Domains, Skill `domain-verbinden`).

Veröffentlichen ist ein eigener Schritt mit einem eigenen Ja zu genau dieser Vorschau: Skill `veroeffentlichen`.
