---
name: neue-seite
description: Eine neue Unterseite anlegen (z. B. „Über uns“, „Leistungen“, „Ankauf“) oder die Startseite neu aufbauen. Verwenden, wenn der Kunde eine weitere Seite oder einen neuen Abschnitt möchte.
---

# Neue Seite anlegen

Nachschlagen: `node_modules/@dealsystem/site/docs/komponenten.md`, `gestaltung.md`.

1. Frag höchstens einmal nach, wenn unklar ist, was auf die Seite soll. Sonst nimm einen sinnvollen Aufbau
   und nenne ihn in einem Satz.
2. Lege `src/routes/<adresse>/+page.svelte` an. Die Adresse ist klein geschrieben, ohne Umlaute und
   Leerzeichen (`ueber-uns`).
3. Jede Seite beginnt mit `<Seo title="…" description="…" />` (Import aus `@dealsystem/site`): ein eigener
   Titel und eine eigene Beschreibung. Nicht `<title>` oder `meta description` in `<svelte:head>` schreiben,
   sonst wirkt nicht, was der Kunde unter Eigene Website → Einstellungen → Google und Teilen einträgt
   (`seo.md`).
4. Genau eine Überschrift der ersten Ebene (`as="h1"`), darunter `h2`, dann `h3`.
5. Jeder sichtbare Text, auch eine kurze Überschrift wie „Anfahrt“, ist ein `<Text>` (kurz) oder
   `<RichText>` (formatiert) mit festem `key` nach dem
   Muster `<seite>.<abschnitt>.<name>`, einem `default`, einem `label` und der `group` der Seite. Der erste
   Teil besteht nur aus Kleinbuchstaben und Ziffern, ohne Bindestrich: Seite `ueber-uns` → `ueberuns.team.titel`,
   nicht `ueber-uns.team.titel`. Die weiteren Teile dürfen Bindestriche haben. So kann der
   Kunde ihn später selbst ändern. Erfinde keine Fakten über das Unternehmen und keine Leistungsversprechen
   („fester Ansprechpartner“, „keine Provision“, „Antwort in 24 Stunden“), die der Kunde nicht genannt hat.
   Mehrzeilige Texte: `default={'Zeile 1\nZeile 2'}` in geschweiften Klammern, nie `default="…\n…"`.
6. Bilder nur mit `<MediaImage>` und beschreibendem `alt`. Fotos, die der Kunde selbst tauschen will
   (Porträt, Team, Titelbild), baust du als Bild-Slot ein: `<MediaImage key="…" default={bild} alt="…"
label="…" group="…" />`, alles außer `default` als feste Zeichenkette (`gestaltung.md`, „Bilder“). Sag ihm:
   erst baust du den Platz, dann lädst du hoch, danach tauscht er das Bild unter Eigene Website → Inhalte.
   Schickt er ein Foto: Skill `bild-einbauen` (`npx dealsystem image add`).
7. Trag die Seite im Menü in `src/routes/+layout.svelte` ein: `<a href={resolve('/ueber-uns')}>…</a>`,
   so wie die vorhandenen Einträge.
8. Prüfen: `npm run check`, `npm run build`, `npx dealsystem check --output build`. Alles beheben, bis die
   Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet.
9. Sag dem Kunden in einem Satz, was entstanden ist, und zeig es ihm mit `npm run dev` oder nach dem
   Hochladen in der Vorschau.

Adresse, Telefon und E-Mail des Unternehmens kommen aus dem CRM: `{data.site.address}`,
`{data.site.phone}`, `{data.site.email}`. Schreib sie nie fest in den Code. Eine Karte gibt es mit
`<MapEmbed>` (siehe `gestaltung.md`); Videos, Google Maps und andere fremde Dienste: Skill `extern-einbinden`.

Soll eine Seite weg, lösch ihren Ordner unter `src/routes/`, nicht nur den Eintrag im Menü. Sonst bleibt sie
erreichbar und steht in der Sitemap.

Nicht tun: Server-Dateien anlegen, `svelte.config.js` oder `vite.config.ts` ändern, das Layout um
`<CookieBanner />` oder `<SiteFooterLegal />` erleichtern.
