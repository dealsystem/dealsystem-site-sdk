---
name: domain-verbinden
description: Die eigene Domain des Kunden (z. B. muster-immobilien.de) mit der DealSystem-Website verbinden. Verwenden, wenn der Kunde fragt, wie seine Seite unter seiner Adresse erreichbar wird.
---

# Eigene Domain verbinden

Nachschlagen: `node_modules/@dealsystem/site/docs/ablauf.md`, Abschnitt „Eigene Domain“.

Das Verbinden macht der Kunde selbst im CRM und bei seinem Domain-Anbieter. Du begleitest ihn.

1. Voraussetzung: Die Seite ist veröffentlicht oder es gibt zumindest eine Vorschau.
2. Sag dem Kunden: „Öffnen Sie im CRM Eigene Website → Domains und tragen Sie dort Ihre Domain ein.“
3. Das CRM zeigt die Einträge, die er bei seinem Domain-Anbieter (dort, wo er die Domain gekauft hat) setzen
   muss, zum Kopieren. Erkläre bei Bedarf in einfachen Worten, wo man das beim Anbieter findet: meist unter
   „DNS“ oder „Nameserver-Einstellungen“.
4. Danach klickt er im CRM auf „Jetzt prüfen“. Es kann von Minuten bis zu einigen Stunden dauern, bis die
   Einträge überall gelten. Das ist normal.
5. Mit `npx dealsystem status` siehst du, ob die Domain verbunden ist.
6. Das Zertifikat für https richtet DealSystem selbst ein. Dafür ist nichts zu tun.

Nicht tun: Einträge raten, Zugangsdaten zum Domain-Anbieter erfragen, am Projekt etwas für die Domain
ändern. Die Domain steht nirgends im Code.
