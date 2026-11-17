// Einstieg für den Test-Build: liest die eingebetteten Daten wie eine Komponente.
import { getSiteData } from '../../../../../src/lib/internal/siteData.js';

import { imprintHtml } from '../../../../../src/lib/internal/imprint.js';
import { privacyHtml } from '../../../../../src/lib/internal/privacy.js';

export const data = getSiteData();
export const legal = { imprint: imprintHtml(), privacy: privacyHtml() };
