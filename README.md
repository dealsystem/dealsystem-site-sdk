# dealsystem-site-sdk

SDK, CLI und Starter für **Self-Service-Websites auf DealSystem**: Kunden bauen ihre statische
SvelteKit-Website mit ihrem eigenen KI-Agenten, DealSystem übernimmt Build, Hosting und Prüfung.

| Paket              | Ordner          | Inhalt                                                           |
| ------------------ | --------------- | ---------------------------------------------------------------- |
| `@dealsystem/site` | `packages/site` | Svelte-5-Komponenten, Lade-Helfer, Vite-Plugin, Konfiguration    |
| `dealsystem`       | `packages/cli`  | CLI (`npx dealsystem …`) und Regelkatalog für `dealsystem check` |

Grundsätze:

- Die Seite ist **statisch** (`@sveltejs/adapter-static`). Es gibt keinen Server-Code und kein Secret.
- Im Browser steht nur ein **Publishable Key**. Er ist eine Kennung, kein Geheimnis.
- WCAG 2.1 AA ist Standard. Vor der Einwilligung geht kein Request an Dritte, Schriften liegen lokal.

## Entwicklung

```bash
npm install
npm run check   # Typen
npm test        # vitest
npm run build   # Pakete bauen
npm run lint    # Prettier + ESLint
```

Voraussetzung: Node.js ab 22.12.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
