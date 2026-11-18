<!-- Eine Seite mit allen Slot-Arten, die die Patch-Funktion kennt: wie ein Haupt-Layout mit <SiteHead> und eine Seite. -->
<script lang="ts">
	import Link from '../../src/lib/components/Link.svelte';
	import MediaImage from '../../src/lib/components/MediaImage.svelte';
	import RichText from '../../src/lib/components/RichText.svelte';
	import SiteHead from '../../src/lib/components/SiteHead.svelte';
	import Text from '../../src/lib/components/Text.svelte';
</script>

<SiteHead favicon="/favicon.svg" />

<main>
	<Text key="start.titel" default="Standard-Titel der Startseite" as="h1" class="hero__titel" />
	<!-- eslint-disable-next-line svelte/no-useless-mustaches -- \n soll ein Zeilenumbruch sein -->
	<Text key="start.text" default={'Zeile eins\nZeile zwei'} as="p" multiline />
	<a href="/kontakt"><Text key="start.knopf" default="Kontakt aufnehmen" /></a>
	<RichText key="start.ueber" default="Wir sind **seit 2010** in Leipzig tätig." />
	<MediaImage
		key="start.bild"
		default="/bild.jpg"
		width={800}
		height={600}
		alt="Bild aus dem Code"
		sizes="50vw"
		priority
	/>
	<MediaImage key="start.deko" default="/deko.svg" width={10} height={10} alt="" decorative />
	<Link key="start.link" default={{ href: '/angebote', label: 'Angebote' }} />
	<p>Fester Text, den nur der Code ändert.</p>
	<!-- Derselbe Schlüssel ein zweites Mal -->
	<footer><Text key="start.titel" default="Standard-Titel der Startseite" as="small" /></footer>
</main>
