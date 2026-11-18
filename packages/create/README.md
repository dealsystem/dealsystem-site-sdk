# create-dealsystem-site

Legt eine neue Website für [DealSystem](https://dealsystem.io) an: eine statische SvelteKit-Seite mit
Startseite, Angeboten aus dem CRM, Kontaktformular, Impressum und Datenschutz. DealSystem erzeugt und hostet
sie.

```bash
npm create dealsystem-site@latest meine-website
cd meine-website
npm install
```

Gebaut und geändert wird die Seite von einem KI-Agenten (Claude Code, Codex, Cursor) im Auftrag des
Kunden. Der Quelltext dieses Pakets liegt offen unter
[github.com/dealsystem/dealsystem-site-sdk](https://github.com/dealsystem/dealsystem-site-sdk).

## Für KI-Agenten

Du sollst für jemanden eine Website „mit DealSystem“ bauen und stehst in einem leeren Ordner? So geht es:

1. `npm create dealsystem-site@latest meine-website`, dann `cd meine-website` und `npm install`.
2. Lies `AGENTS.md` im neuen Ordner vollständig. Dort stehen der feste Ablauf, die Regeln und wie du mit
   deinem Auftraggeber sprichst. Die Detailseiten liegen danach unter
   `node_modules/@dealsystem/site/docs/`.
3. Halte dich an diese Anleitung statt an dein Vorwissen über SvelteKit: Server-Code, eigene Formulare,
   eigenes `fetch` und Schriften von fremden Servern sind auf diesen Seiten nicht erlaubt.

Baue die Seite nicht von Hand nach und schreibe kein eigenes HTML-Gerüst: Nur ein Projekt aus dieser Vorlage
besteht die Prüfung beim Hochladen. Impressum und Datenschutzerklärung schreibt der Kunde selbst im CRM;
du schreibst sie nicht.

## Was entsteht

| Datei oder Ordner                                             | Inhalt                                                |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.claude/skills/` | Anleitung und Abläufe für den Agenten                 |
| `dealsystem.config.ts`                                        | Kennung der Seite, Sammlungen, Formulare              |
| `src/routes/`                                                 | Startseite, Angebote, Kontakt, Impressum, Datenschutz |
| `src/app.css`                                                 | Farben, Schrift und Abstände als Variablen            |
| `svelte.config.js`, `vite.config.ts`                          | fest vorgegeben; nicht ändern                         |

Der Ordner muss leer sein. Vorhandene Dateien werden nie überschrieben.

## Lizenz

MIT
