import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://roamdawn.com',
  output: 'static',
  compressHTML: true,
  vite: { plugins: [tailwindcss()] },
  integrations: [mdx(), sitemap()]
});
