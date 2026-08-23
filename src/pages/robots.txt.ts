import type { APIRoute } from 'astro';
export const GET: APIRoute = ({site}) => new Response(`User-agent: *\nAllow: /\nDisallow: /search/\nSitemap: ${new URL('sitemap-index.xml', site || 'https://roamdawn.com')}\n`, {headers:{'Content-Type':'text/plain'}});
