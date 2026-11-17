# Titel, Beschreibung, Vorschaubild und Favicon

Was bei Google, im Browser-Tab und beim Teilen (WhatsApp, Facebook, LinkedIn) erscheint, pflegt der Kunde im
CRM unter **Eigene Website → Einstellungen → Google und Teilen**: Titel und Beschreibung je Seite, eine
Vorgabe für alle Seiten, ein Vorschaubild, ein Favicon und „Nicht bei Google anzeigen“. Nach dem Speichern
baut DealSystem die Seite neu, ohne Agent. Damit das wirkt, setzt du diese Angaben nur über zwei Bausteine.

## Auf jeder Seite: `<Seo>`

```svelte
<script lang="ts">
	import { Seo } from '@dealsystem/site';
	let { data } = $props();
</script>

<Seo title="Kontakt – {data.site.name}" description="Schreiben Sie uns. Wir melden uns schnell zurück." />
```

- Schreib `<title>`, `<meta name="description">`, `og:*` und `twitter:*` **nicht** selbst in `<svelte:head>`.
  `<Seo>` setzt sie. Stünden sie zusätzlich da, gäbe es sie doppelt, und die Angaben aus dem CRM wirkten
  nicht. `npx dealsystem check` warnt (`CNT-004`). Anderes (z. B. `<link rel="canonical">`) darf weiter in
  `<svelte:head>` stehen.
- Was gilt, entscheidet `<Seo>` je Angabe: Angabe des Kunden für diese Seite → `title`/`description`/`image`
  aus dem Code → Vorgabe des Kunden für alle Seiten → beim Titel zuletzt der Name der Website. Was du im
  Code angibst, ist also der Standard, den der Kunde ersetzen kann.
- Seitentitel im CRM gibt es nur für feste Seiten (`/kontakt`), nicht für Detailseiten wie
  `/angebote/[slug]`. Dort gibt der Code Titel und Bild aus dem Eintrag mit:
  `<Seo title={angebot.data.titel} description={angebot.data.kurztext} image={angebot.media.bilder[0]} />`.
- `image` ist ein Bild aus dem CMS (`MediaRef`) oder der Pfad eines Bildes im Projekt; dann beschreibt
  `imageAlt`, was zu sehen ist. Ohne Bild gibt es die kleine Vorschau.
- Titel und Beschreibung werden immer als Text ausgegeben, nie als HTML.
- Jede Seite braucht einen eigenen Titel und eine Beschreibung (`A11Y-008`). Gib sie deshalb im Code an,
  auch wenn der Kunde sie später ersetzt.

## Im Layout: `<SiteHead>`

```svelte
<SiteHead favicon="/favicon.svg" />
```

Einmal in `src/routes/+layout.svelte`. `favicon` ist das Favicon aus dem Projekt (`static/`). Hat der Kunde im
CRM eins hochgeladen, gilt seins (32 px im Tab, 180 px für iOS, 192 und 512 px im Web-Manifest
`/manifest.webmanifest`, das der Build anlegt). Schreib den Favicon-Link nicht nach `src/app.html`, sonst gäbe
es zwei (`CNT-004`).

## Nicht bei Google anzeigen

Wählt der Kunde das im CRM, steht auf jeder Seite `<meta name="robots" content="noindex">`, und
`robots.txt` nennt die Sitemap nicht mehr. Ein `Disallow` steht bewusst nicht darin: Sonst läse Google das
`noindex` nie, und schon gefundene Seiten blieben im Index. Bau dafür nichts selbst ein.

## Was du dem Kunden sagst

Fragt der Kunde, wie er den Text bei Google, das Bild beim Teilen in WhatsApp oder das kleine Symbol im Tab
ändert: im CRM unter Eigene Website → Einstellungen → Google und Teilen, ohne neue Version von dir.
