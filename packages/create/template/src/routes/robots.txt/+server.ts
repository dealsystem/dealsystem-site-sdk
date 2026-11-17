// Eine der zwei erlaubten Server-Dateien: Sie läuft nur beim Erzeugen der Seite.
import { robots } from '@dealsystem/site/content';

export const prerender = true;

export const GET = () => robots();
