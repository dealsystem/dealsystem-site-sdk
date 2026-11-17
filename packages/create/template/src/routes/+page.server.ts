import { getCollection } from '@dealsystem/site/content';

export const prerender = true;

export async function load() {
	return { angebote: await getCollection('angebote', { limit: 3 }) };
}
