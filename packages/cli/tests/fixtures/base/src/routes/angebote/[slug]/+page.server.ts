import { collectionEntries, getEntry } from '@dealsystem/site/content';

export const entries = () => collectionEntries('angebote');

export function load({ params }) {
	return { entry: getEntry('angebote', params.slug) };
}
