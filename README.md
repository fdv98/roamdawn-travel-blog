# RoamDawn

RoamDawn — Travel Guides, Destinations & Adventure.

Production-focused Astro travel publication with destination hubs, evergreen guides, itineraries, technical SEO, accessible UX and a static-first Cloudflare deployment model.

## Content architecture
Homepage → Destinations → Destination hub → Pillar guide → Supporting city/itinerary guides.

This geography-first architecture follows common travel-search behavior and keeps important content within a few clicks of the homepage.

## Build
`npm install`
`npm run check`
`npm run build`

Cloudflare build command: `npm run build`
Output directory: `dist`

## Pixabay article images

Set `PIXABAY_API_KEY` in your local environment, then run `npm run fetch:pixabay`.
The utility downloads a separate optimized WebP photo for every configured article,
updates its `featuredImage` frontmatter only after the download succeeds, and records
the Pixabay source page and author in `src/data/image-sources.json`.

No fake credentials, fake reviews, fake travel experiences or fabricated publisher IDs are included.
