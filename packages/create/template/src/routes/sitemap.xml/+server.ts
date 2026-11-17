// Eine der zwei erlaubten Server-Dateien: Sie läuft nur beim Erzeugen der Seite.
import { sitemap } from '@dealsystem/site/content';

export const prerender = true;

export const GET = () => sitemap();
