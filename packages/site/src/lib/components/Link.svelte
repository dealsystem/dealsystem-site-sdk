<!--
@component
Ein Link, dessen Ziel und Beschriftung der Kunde im CRM ändern kann, z. B. die
wichtigste Schaltfläche der Startseite. Für gewöhnliche Links reicht `<a href>`.

`key` und `default` müssen fest im Quelltext stehen (keine Variablen).

```svelte
<Link key="start.hero.knopf" default={{ href: '/kontakt', label: 'Kontakt aufnehmen' }} label="Schaltfläche" group="Startseite" />
```
-->
<script lang="ts" module>
	import type { ContentSlotLinkValue } from '../types.js';

	export interface LinkProps {
		/** Eindeutiger Schlüssel, z. B. `start.hero.knopf`. */
		key: string;
		/** Ziel und Beschriftung, solange im CRM nichts anderes eingetragen ist. */
		default: ContentSlotLinkValue;
		/** Beschriftung im CRM. */
		label?: string;
		/** Gruppe im CRM. */
		group?: string;
		/** Hinweis für den Kunden im CRM. */
		help?: string;
		/** Frühere Schlüssel dieses Links. */
		aliases?: readonly string[];
		class?: string;
	}
</script>

<script lang="ts">
	import { getSiteData } from '../internal/siteData.js';
	import { resolveLinkSlot } from '../slots.js';

	let { key, default: fallback, aliases, class: className }: LinkProps = $props();

	const link = $derived(resolveLinkSlot(getSiteData().slots, key, aliases) ?? fallback);
</script>

<a
	href={link.href}
	class={className}
	target={link.newTab ? '_blank' : undefined}
	rel={link.newTab ? 'noopener noreferrer' : undefined}
	data-ds-slot={key}>{link.label}</a
>
