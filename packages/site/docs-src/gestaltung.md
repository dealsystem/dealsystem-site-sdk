# Gestaltung, Bilder und Barrierefreiheit

## Farben und Schrift

Das Aussehen steuert `src/app.css` über Variablen. Ändere zuerst diese Werte, bevor du neue Regeln schreibst.

| Variable                                  | Bedeutung                            |
| ----------------------------------------- | ------------------------------------ |
| `--color-background`, `--color-text`      | Grundfarbe der Seite und Textfarbe   |
| `--color-text-muted`                      | zurückhaltender Text                 |
| `--color-surface`, `--color-on-surface`   | abgesetzte Flächen und Text darauf   |
| `--color-primary`, `--color-on-primary`   | Schaltflächen, Links und Text darauf |
| `--color-border`                          | Linien und Rahmen                    |
| `--font-sans`, `--radius`, `--width-page` | Schrift, Eckenradius, Seitenbreite   |

Neue Farben bekommen denselben Aufbau: `--color-<name>` für die Fläche, `--color-on-<name>` für Text
darauf. `npx dealsystem check` rechnet den Kontrast jedes solchen Paars nach (`A11Y-006`): mindestens
4,5:1 für Text.

Die Bausteine von DealSystem (Formular, Cookie-Hinweis) übernehmen die Farben über `--ds-color-primary`,
`--ds-color-on-primary`, `--ds-color-text`, `--ds-color-surface`, `--ds-color-border`, `--ds-color-error`,
`--ds-color-focus` und `--ds-radius`. Der Starter verbindet sie in `app.css` mit den Farben der Seite.

## Texte der Bausteine und Anrede

Die Bausteine von DealSystem bringen ihre Texte für Besucher mit: Hinweise, Prüf- und Fehlermeldungen,
Erfolg, Platzhalter vor Karten und Videos. Sie siezen oder duzen so, wie im CRM für die Website eingestellt
(dieselbe Anrede wie in den Mails an Besucher). Setz die Anrede nicht im Code.

Einen einzelnen Text ersetzt die Prop `texts` des Bausteins, z. B.
`<LeadForm funnel="kontakt" texts={{ success: 'Danke, wir rufen dich zurück.' }} />`. Die Namen der Texte
nennen die Typen `FormTexts`, `CookieBannerTexts`, `MapEmbedTexts`, `EmbedTexts`, `MediaVideoTexts` und
`CollectionListTexts`. Platzhalter wie `{label}` oder `{count}` setzt das SDK ein; lass sie im eigenen Text
stehen. Ein eigener Text muss zur Anrede der Seite passen. `createLeadClient(funnel, { texts })` nimmt
dieselben Texte wie `<LeadForm>`.

## Schriften

Schriften liegen immer lokal im Projekt. Nie von Google Fonts oder einem CDN laden (`PRV-002`).

```bash
npm install @fontsource-variable/inter
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '@fontsource-variable/inter';
</script>
```

Dazu in `app.css`: `--font-sans: 'Inter Variable', system-ui, sans-serif;`. Andere Schriften gibt es als
`@fontsource/<name>` und `@fontsource-variable/<name>`. Wechselst du die Schrift, entferne die alte mit
`npm uninstall @fontsource-variable/inter`, damit sie nicht ungenutzt im Projekt bleibt.

## Bilder

Nie `<img>` schreiben, immer `<MediaImage>` (`A11Y-002`).

- **Bilder aus dem CRM** (Angebote): `<MediaImage media={angebot.media.bilder[0]} sizes="…" />`. Größen und
  Alternativtext kommen aus dem CRM.
- **Fotos ins Projekt holen:** `npx dealsystem image add <datei> --name haus --alt "…"`. Der Befehl prüft das
  Format (JPEG, PNG, WebP, AVIF, höchstens 15 MB), dreht nach der Kamera-Angabe, verkleinert auf höchstens
  2 560 px, **entfernt alle Metadaten samt Standort (GPS)** und schreibt nach `src/lib/assets/bilder/`. Er gibt
  die Import-Zeile und einen fertigen `<MediaImage>` aus. Fotos nicht von Hand kopieren: Sonst gehen die
  Standortdaten aus dem Handy mit auf die Seite. HEIC (iPhone) lässt sich nicht umwandeln; der Kunde schickt
  es als JPEG.
- **Eigene Bilder im Projekt:** mit `import bild from '$lib/assets/bilder/haus.jpg'` einbinden und als
  `<MediaImage src={bild} alt="…" width={1600} height={1067} />` ausgeben. `width` und `height` sind die
  echten Maße der Datei; sie verhindern, dass die Seite beim Laden springt. Logos und kleine Grafiken als
  SVG nach `static/` legen: `src="/logo.svg"`.
- `alt` beschreibt, was zu sehen ist („Sanierter Altbau mit roter Klinkerfassade“), nicht „Bild“ oder den
  Dateinamen. Reiner Schmuck: `alt="" decorative`.
- `sizes` nennt die Anzeigebreite, z. B. `sizes="(min-width: 60rem) 33vw, 100vw"`. Das wichtigste Bild im
  sichtbaren Bereich bekommt `priority`.
- Große Videos gehören ins CRM, nicht ins Projekt.
- **Fotos, die der Kunde selbst tauschen will** (Porträt für „Über uns“, Team, Titelbild): als Bild-Slot
  einbauen, mit festem `key` und einem Bild aus dem Projekt als `default`:
  `<MediaImage key="team.inhaber.foto" default={portrait} width={1200} height={1500} alt="…" label="Foto des Inhabers" group="Über uns" />`.
  `key`, `label`, `group` und `help` stehen als feste Zeichenketten in Anführungszeichen, sonst scheitern
  Build und Prüfung (`QUA-006`). Hat der Kunde noch kein Foto, nimm ein neutrales Platzhalterbild aus dem
  Projekt und sag ihm das.
- **So erklärst du es dem Kunden, in dieser Reihenfolge:** Erst baust du den Platz für das Bild ein, dann
  lädst du die Seite hoch, danach kann er das Bild im CRM unter Eigene Website → Inhalte selbst tauschen.
  Vorher gibt es dort nichts zu tauschen. Einen anderen Ort im CRM dafür nennst du nicht.
- Bilder in Sammlungen (Angebote, Referenzen) pflegt er dagegen im CRM unter CMS, beim jeweiligen Eintrag.

## Barrierefreiheit (WCAG 2.1 AA)

Die Bausteine sind darauf ausgelegt. Für eigene Teile der Seite gilt:

- Genau eine `h1` je Seite, darunter `h2`, dann `h3`, ohne eine Ebene zu überspringen.
- Jede Seite hat einen eigenen Titel und eine eigene Beschreibung, gesetzt mit `<Seo>` (`seo.md`).
- Links und Schaltflächen haben einen Text, der für sich verständlich ist. Nicht „hier klicken“.
- Alles ist mit der Tastatur erreichbar. Den sichtbaren Fokus nie entfernen (`outline: none` ist verboten).
- Bedienelemente sind mindestens 44 × 44 Pixel groß.
- Farbe ist nie das einzige Merkmal für eine Bedeutung.
- Text lässt sich auf 200 % vergrößern, ohne dass etwas abgeschnitten wird. Kein `user-scalable=no`.
- Bewegung sparsam einsetzen und bei `prefers-reduced-motion` abschalten.
- Kein Video oder Ton startet von selbst.

Automatisch geprüft wird nur ein Teil. Sieh dir jede neue Seite einmal nur mit der Tastatur an.

## Links

Links auf eigene Seiten laufen über `resolve` aus `$app/paths`. Ein Tippfehler in der Adresse wird so zum
Fehler in `npm run check`, statt als toter Link auf der Seite zu landen.

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<a href={resolve('/kontakt')}>Kontakt</a>
<a href={resolve('/angebote/[slug]', { slug: angebot.slug })}>{angebot.data.titel}</a>
```

Links nach außen sind gewöhnliche `<a href="https://…">`. Öffnen sie in einem neuen Tab, dann mit
`target="_blank" rel="noopener noreferrer"`.

## Karte

Für die Anfahrt gibt es genau eine Karte: `<MapEmbed>` mit OpenStreetMap.

```svelte
<script lang="ts">
	import { MapEmbed, Text } from '@dealsystem/site';

	let { data } = $props();
</script>

<Text key="kontakt.anfahrt.titel" default="Anfahrt" as="h2" label="Überschrift Anfahrt" group="Kontakt" />
{#if data.site.address}<p>{data.site.address}</p>{/if}
<MapEmbed lat={53.8676} lon={10.6866} title="Unser Büro in der Lübecker Altstadt" />
```

- `lat` und `lon` sind die Koordinaten als Dezimalzahlen. Kennst du sie nicht sicher, frag den Kunden: Er
  findet sie auf openstreetmap.org (Adresse suchen, Rechtsklick auf den Ort, „Adresse anzeigen“). Rate sie
  nicht; eine Markierung am falschen Haus ist schlimmer als keine Karte.
- Die Karte lädt erst nach „Karte anzeigen“. Der Link „Karte in OpenStreetMap öffnen“ steht immer da.
- Die Adresse daneben kommt aus dem CRM (`data.site.address`), nicht aus dem Code.
- Wünscht der Kunde ausdrücklich Google Maps, nimm `<Embed>` mit der Vorlage `google-maps` und der Adresse
  aus Google Maps → Teilen → Karte einbetten (`extern.md`). Ohne diese Adresse bleibt es bei `<MapEmbed>`.

## Fremde Inhalte

Videos (YouTube, Vimeo), Google Maps, Terminbuchung, Widgets und fremde Skripte stehen in
`dealsystem.config.ts` unter `external` und kommen über `<Embed>` oder `<ExternalScript>` auf die Seite. Daraus
entstehen die Sicherheitsregeln (`csp: dealsystemCsp()` in `svelte.config.js`) und der Cookie-Hinweis; vor der
Einwilligung lädt nichts davon. Anleitung mit Beispielen: `extern.md`. Ohne Eintrag gehen nur Tracking über
`<Tracking />` (Kennungen im CRM) und die Karte über `<MapEmbed />`. Lockere nie die Regeln in
`svelte.config.js`; `npx dealsystem check` lehnt das ab (`SEC-005`, `SEC-008`).
