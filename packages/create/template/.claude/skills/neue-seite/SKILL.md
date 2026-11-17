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
3. Jede Seite beginnt mit `<svelte:head>`: ein eigener `<title>` und eine eigene `meta description`.
4. Genau eine Überschrift der ersten Ebene (`as="h1"`), darunter `h2`, dann `h3`.
5. Jeder sichtbare Text, auch eine kurze Überschrift wie „Anfahrt“, ist ein `<Text>` (kurz) oder
   `<RichText>` (formatiert) mit festem `key` nach dem
   Muster `<seite>.<abschnitt>.<name>`, einem `default`, einem `label` und der `group` der Seite. So kann der
   Kunde ihn später selbst ändern. Erfinde keine Fakten über das Unternehmen.
6. Bilder nur mit `<MediaImage>` und beschreibendem `alt`.
7. Trag die Seite im Menü in `src/routes/+layout.svelte` ein: `<a href={resolve('/ueber-uns')}>…</a>`,
   so wie die vorhandenen Einträge.
8. Prüfen: `npm run check`, `npm run build`, `npx dealsystem check --output build`. Alles beheben, bis die
   Ausgabe mit „Prüfung bestanden: Quelltext und fertige Seite geprüft“ endet.
9. Sag dem Kunden in einem Satz, was entstanden ist, und zeig es ihm mit `npm run dev` oder nach dem
   Hochladen in der Vorschau.

Adresse, Telefon und E-Mail des Unternehmens kommen aus dem CRM: `{data.site.address}`,
`{data.site.phone}`, `{data.site.email}`. Schreib sie nie fest in den Code. Eine Karte gibt es mit
`<MapEmbed>` (siehe `gestaltung.md`); Google Maps und andere fremde Dienste lassen sich nicht einbetten.

Soll eine Seite weg, lösch ihren Ordner unter `src/routes/`, nicht nur den Eintrag im Menü. Sonst bleibt sie
erreichbar und steht in der Sitemap.

Nicht tun: Server-Dateien anlegen, `svelte.config.js` oder `vite.config.ts` ändern, das Layout um
`<CookieBanner />` oder `<SiteFooterLegal />` erleichtern.
