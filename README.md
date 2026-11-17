# dealsystem-site-sdk

SDK, CLI und Starter für **Self-Service-Websites auf DealSystem**: Kunden bauen ihre statische
SvelteKit-Website mit ihrem eigenen KI-Agenten, DealSystem übernimmt Build, Hosting und Prüfung.

| Paket                    | Ordner            | Inhalt                                                                    |
| ------------------------ | ----------------- | ------------------------------------------------------------------------- |
| `@dealsystem/site`       | `packages/site`   | Svelte-5-Komponenten, Lade-Helfer, Vite-Plugin, Konfiguration             |
| `dealsystem`             | `packages/cli`    | CLI (`npx dealsystem …`) und Regelkatalog für `dealsystem check`          |
| `create-dealsystem-site` | `packages/create` | Starter (`npm create dealsystem-site`) mit AGENTS.md und Skills           |
| —                        | `evals`           | Aufträge in Laien-Sprache, an denen Starter und Anleitung gemessen werden |

Grundsätze:

- Die Seite ist **statisch** (`@sveltejs/adapter-static`). Es gibt keinen Server-Code und kein Secret.
- Im Browser steht nur ein **Publishable Key**. Er ist eine Kennung, kein Geheimnis.
- WCAG 2.1 AA ist Standard. Vor der Einwilligung geht kein Request an Dritte, Schriften liegen lokal.
- Rechtstexte schreibt der Kunde im CRM. Das SDK erzeugt keine.

## Entwicklung

```bash
npm install
npm run build   # Pakete bauen
npm run check   # Typen
npm test        # vitest; der Starter wird dabei wirklich gebaut und geprüft
npm run lint    # Prettier + ESLint
npm run docs    # Anleitungen für Agenten neu erzeugen
```

Voraussetzung: Node.js ab 22.12.

## Anleitungen für Agenten

`scripts/build-agent-docs.mjs` erzeugt aus dem Code die Anleitungen, die ein KI-Agent in einem
Kundenprojekt liest:

- `packages/site/docs/*.md` und `llms.txt` (im Paket unter `node_modules/@dealsystem/site/docs/`)
- `packages/create/template/AGENTS.md` mit dem markierten Block, den `dealsystem sync` erneuert

Quellen sind die Kommentare und Typen der Komponenten, das JSDoc der Funktionen, der Regelkatalog und die
Befehle der CLI sowie die von Hand geschriebenen Seiten unter `packages/site/docs-src/`. Ein Test wird rot,
wenn die erzeugten Dateien nicht zum Code passen oder der Block in AGENTS.md 8 KB überschreitet. Nach
Änderungen an Komponenten, Regeln oder Befehlen: `npm run docs`.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
