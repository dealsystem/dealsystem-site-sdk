import { error } from '@sveltejs/kit';
import { collectionEntries, getEntry } from '@dealsystem/site/content';

export const prerender = true;

// Für jedes veröffentlichte Angebot entsteht eine eigene Seite.
export const entries = collectionEntries('angebote');

export async function load({ params }) {
	const angebot = await getEntry('angebote', params.slug);
	if (!angebot) error(404, 'Dieses Angebot gibt es nicht mehr.');
	return { angebot };
}
