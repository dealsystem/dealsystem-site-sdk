<script lang="ts">
	import { resolve } from '$app/paths';
	import '@fontsource-variable/inter';
	import '../app.css';
	import { ConsentGate, CookieBanner, SiteFooterLegal, SiteHead, Tracking } from '@dealsystem/site';

	let { data, children } = $props();

	const name = $derived(data.site.name || 'Meine Website');
</script>

<!-- Favicon und „Nicht bei Google anzeigen“ aus dem CRM; ohne Favicon im CRM gilt static/favicon.svg. -->
<SiteHead favicon="/favicon.svg" />

<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>

<header class="header">
	<div class="page header__inner">
		<a class="header__name" href={resolve('/')}>{name}</a>
		<nav aria-label="Hauptmenü">
			<ul>
				<li><a href={resolve('/')}>Start</a></li>
				<li><a href={resolve('/angebote')}>Angebote</a></li>
				<li><a href={resolve('/kontakt')}>Kontakt</a></li>
			</ul>
		</nav>
	</div>
</header>

<main id="inhalt">
	{@render children()}
</main>

<footer class="footer">
	<div class="page footer__inner">
		<p class="muted">{name}</p>
		<SiteFooterLegal />
	</div>
</footer>

<!-- Pflicht auf jeder Seite: Hinweis zur Einwilligung. Tracking lädt erst nach Zustimmung. -->
<CookieBanner />
<ConsentGate category="marketing">
	<Tracking />
</ConsentGate>

<style>
	.header {
		border-bottom: 1px solid var(--color-border);
	}
	.header__inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 2rem;
		padding-top: 0.75rem;
		padding-bottom: 0.75rem;
	}
	.header__name {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--color-text);
		font-weight: 700;
		font-size: 1.125rem;
		text-decoration: none;
	}
	nav ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	nav a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--color-text);
	}
	main {
		flex: 1;
	}
	.footer {
		margin-top: 3rem;
		background: var(--color-surface);
		color: var(--color-on-surface);
	}
	.footer__inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 2rem;
		padding-top: 1.5rem;
		padding-bottom: 1.5rem;
	}
	.footer__inner p {
		margin: 0;
	}
</style>
