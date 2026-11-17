---
name: veroeffentlichen
description: Den aktuellen Stand der Website hochladen, dem Kunden die Vorschau zeigen und die Seite nach seinem ausdrücklichen Ja veröffentlichen. Verwenden, wenn der Kunde seine Änderungen sehen oder online stellen will.
---

# Hochladen, Vorschau zeigen, veröffentlichen

Nachschlagen: `node_modules/@dealsystem/site/docs/ablauf.md`.

1. Prüfen: `npm run check`, `npm run build`, `npx dealsystem check --output build`. Alle Fehler beheben.
2. Hochladen: `npx dealsystem deploy -m "kurze Notiz, was sich geändert hat"`. Der Befehl wartet, bis
   DealSystem die Seite erzeugt hat, und nennt die Adresse der Vorschau.
3. Lehnt der Server den Stand ab, stehen die Gründe in der Ausgabe. Beheben und erneut hochladen.
4. Gib dem Kunden die Adresse: „Hier ist die Vorschau: … Sie ist noch nicht öffentlich. Soll ich die Seite
   so veröffentlichen?“
5. **Nur bei einem ausdrücklichen Ja zu dieser Vorschau:** `npx dealsystem publish --confirm`.
   Ein „sieht gut aus“ ohne klare Zustimmung zum Veröffentlichen reicht nicht: Frag einmal nach.
6. Meldet der Befehl fehlende Angaben (Impressum, Datenschutzerklärung, Firmenname, E-Mail): Der Kunde trägt
   sie im CRM unter Website → Einstellungen ein. Du schreibst diese Texte nicht. Danach
   `npx dealsystem sync` und zurück zu Schritt 2.
7. Bestätige in einem Satz, dass die Seite online ist, und nenne die Adresse.

Rückgängig: `npx dealsystem rollback --confirm` schaltet auf den vorigen Stand zurück, ebenfalls nur nach
einem ausdrücklichen Ja.
