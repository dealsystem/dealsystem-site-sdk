// Macht den Einstiegspunkt der CLI ausführbar (npm setzt das beim Installieren, `node dist/bin.js` braucht es nicht).
import { chmodSync } from 'node:fs';

chmodSync(new URL('../dist/bin.js', import.meta.url), 0o755);
