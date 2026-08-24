import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Article bodies should stay focused on text, tables and practical guidance.
// Destination photography belongs to the article's main image and the cards,
// not between sections of the article.
function removeMarkdownImages() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children = node.children.filter(
        (child) => child.type !== 'image' && child.type !== 'imageReference',
      );
      node.children.forEach(walk);
    };
    walk(tree);
  };
}

export default defineConfig({
  site: 'https://roamdawn.com',
  output: 'static',
  compressHTML: true,
  markdown: {
    remarkPlugins: [removeMarkdownImages],
  },
  vite: { plugins: [tailwindcss()] },
  integrations: [mdx(), sitemap()],
});
