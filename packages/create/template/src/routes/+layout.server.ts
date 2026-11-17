import { getSite } from '@dealsystem/site/content';

export const prerender = true;

export async function load() {
	return { site: await getSite() };
}
