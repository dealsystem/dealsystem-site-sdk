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
`@fontsource/<name>` und `@fontsource-variable/<name>`.

## Bilder

Nie `<img>` schreiben, immer `<MediaImage>` (`A11Y-002`).

- **Bilder aus dem CRM** (Angebote): `<MediaImage media={angebot.media.bilder[0]} sizes="…" />`. Größen und
  Alternativtext kommen aus dem CRM.
- **Eigene Bilder im Projekt:** Datei verkleinert (höchstens etwa 2000 Pixel breit) nach `src/lib/bilder/`
  legen, mit `import bild from '$lib/bilder/haus.jpg'` einbinden und als
  `<MediaImage src={bild} alt="…" width={1600} height={1067} />` ausgeben. `width` und `height` sind die
  echten Maße der Datei; sie verhindern, dass die Seite beim Laden springt. Logos und kleine Grafiken als
  SVG nach `static/` legen: `src="/logo.svg"`.
- `alt` beschreibt, was zu sehen ist („Sanierter Altbau mit roter Klinkerfassade“), nicht „Bild“ oder den
  Dateinamen. Reiner Schmuck: `alt="" decorative`.
- `sizes` nennt die Anzeigebreite, z. B. `sizes="(min-width: 60rem) 33vw, 100vw"`. Das wichtigste Bild im
  sichtbaren Bereich bekommt `priority`.
- Große Videos gehören ins CRM, nicht ins Projekt.

## Barrierefreiheit (WCAG 2.1 AA)

Die Bausteine sind darauf ausgelegt. Für eigene Teile der Seite gilt:

- Genau eine `h1` je Seite, darunter `h2`, dann `h3`, ohne eine Ebene zu überspringen.
- Jede Seite hat einen eigenen `<title>` und eine eigene `meta description` in `<svelte:head>`.
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

## Fremde Inhalte

Alles, was beim Laden Daten an andere Anbieter schickt (Karten, eingebettete Videos, Bewertungs-Widgets),
steht in `<ConsentGate category="media">` mit einem `fallback`, der erklärt, was geladen wird. Tracking
läuft nur über `<Tracking />` in `<ConsentGate category="marketing">`; die Kennungen stehen im CRM.
Wird ein fremder Dienst gebraucht, den die Sicherheitsregeln der Seite nicht kennen, lässt er sich nicht
einbinden. Sag das dem Kunden, statt die Regeln zu lockern.
