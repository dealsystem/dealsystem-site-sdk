<!--
@component
Ein kurzer Text, den der Kunde später im CRM unter „Website-Texte“ ändern kann.
Angezeigt wird der Text aus dem CRM, sonst `default`.

`key` und `default` müssen feste Zeichenketten sein (keine Variablen): der
Build liest sie aus dem Quelltext und meldet sie ans CRM.

```svelte
<Text key="start.hero.titel" default="Wir kaufen Ihr Haus" as="h1" label="Überschrift" group="Startseite" />
```
-->
<script lang="ts" module>
	/** HTML-Elemente, die `<Text>` ausgeben kann. */
	export type TextElement =
		| 'span'
		| 'p'
		| 'h1'
		| 'h2'
		| 'h3'
		| 'h4'
		| 'h5'
		| 'h6'
		| 'strong'
		| 'em'
		| 'small'
		| 'div'
		| 'li'
		| 'blockquote'
		| 'figcaption'
		| 'dt'
		| 'dd';

	export interface TextProps {
		/** Eindeutiger Schlüssel, z. B. `start.hero.titel`: Kleinbuchstaben, Ziffern, Punkte. */
		key: string;
		/** Text, solange im CRM nichts anderes eingetragen ist. */
		default: string;
		/** HTML-Element. Standard `span`. Je Seite genau eine `h1`. */
		as?: TextElement;
		/** Mehrzeiliger Text: Zeilenumbrüche bleiben erhalten. */
		multiline?: boolean;
		/** Beschriftung im CRM, z. B. „Überschrift“. */
		label?: string;
		/** Gruppe im CRM, z. B. „Startseite“. */
		group?: string;
		/** Hinweis für den Kunden im CRM. */
		help?: string;
		/** Höchstlänge im CRM. */
		maxLength?: number;
		/** Frühere Schlüssel dieses Textes, damit Änderungen des Kunden beim Umbenennen bleiben. */
		aliases?: readonly string[];
		class?: string;
		id?: string;
	}
</script>

<script lang="ts">
	import { getSiteData } from '../internal/siteData.js';
	import { resolveTextSlot } from '../slots.js';

	let {
		key,
		default: fallback,
		as = 'span',
		multiline = false,
		aliases,
		class: className,
		id,
	}: TextProps = $props();

	const text = $derived(resolveTextSlot(getSiteData().slots, key, aliases) ?? fallback);
</script>

<svelte:element this={as} {id} class={[className, multiline && 'ds-text--multiline']} data-ds-slot={key}
	>{text}</svelte:element
>

<style>
	.ds-text--multiline {
		white-space: pre-line;
	}
</style>
