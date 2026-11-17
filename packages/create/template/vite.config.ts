import { sveltekit } from '@sveltejs/kit/vite';
import { dealsystem } from '@dealsystem/site/vite';
import { defineConfig } from 'vite';
import site from './dealsystem.config.ts';

export default defineConfig({
	plugins: [dealsystem(site), sveltekit()],
});
