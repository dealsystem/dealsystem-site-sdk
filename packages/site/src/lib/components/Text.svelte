<!--
@component
Ein kurzer Text (Überschrift, Satz, Beschriftung), den der Kunde im CRM ändern
kann.
Angezeigt wird der Text aus dem CRM, sonst `default`.

`key` und `default` müssen feste Zeichenketten sein (keine Variablen): der
Build liest sie aus dem Quelltext und meldet sie ans CRM.

`key` hat zwei bis fünf Teile mit Punkten. Der erste Teil, meist die Seite,
besteht nur aus Kleinbuchstaben und Ziffern, ohne Bindestrich: für die Seite
`/ueber-uns` also `ueberuns.team.titel`, nicht `ueber-uns.team.titel`. Die
weiteren Teile dürfen Bindestriche haben (`start.ueber-uns`). Das gilt für alle
Schlüssel von `<Text>`, `<RichText>`, `<Link>` und `<MediaImage>`.

```svelte
<Text key="start.hero.titel" default="Ihr Meisterbetrieb für Bad und Heizung" as="h1" label="Überschrift" group="Startseite" />
```

Mehrere Zeilen: `multiline` und den Text in geschweiften Klammern, dann ist
`\n` ein Zeilenumbruch. In `default="…"` wäre `\n` kein Umbruch, sondern
stünde wörtlich auf der Seite (`dealsystem check` warnt, CNT-003).

```svelte
<Text key="kontakt.zeiten" multiline default={'Mo bis Fr 9 bis 18 Uhr\nSa nach Vereinbarung'} />
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
		/** Eindeutiger Schlüssel, z. B. `start.hero.titel`: Teile mit Punkten, der erste ohne Bindestrich (`ueberuns.team.titel`). */
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
		/** Der Kunde darf den Text im CRM nicht leeren. */
		required?: boolean;
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
