<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Seite nicht gefunden</title>
	<meta name="description" content="Diese Seite gibt es nicht." />
</svelte:head>

<section class="section">
	<div class="page">
		<h1>{page.status === 404 ? 'Diese Seite gibt es nicht' : 'Etwas ist schiefgegangen'}</h1>
		<p>Vielleicht hilft Ihnen die Startseite weiter.</p>
		<p><a class="button" href={resolve('/')}>Zur Startseite</a></p>
	</div>
</section>
