// Attrappe für `$app/state` in den Tests (siehe vite.config.ts): Route und Adresse der gerade gezeigten Seite.
export const page = $state({
	route: { id: '/' as string | null },
	url: new URL('http://localhost/'),
});

/** Stellt die Seite ein, die `<Seo>` sieht. */
export function setPageForTests(routeId: string | null, path = routeId ?? '/'): void {
	page.route = { id: routeId };
	page.url = new URL(path, 'http://localhost/');
}
