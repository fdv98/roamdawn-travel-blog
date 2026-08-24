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

Article images are fetched only by the manual **Fetch Pixabay article images** GitHub
Actions workflow. Run it from **Actions → Fetch Pixabay article images → Run workflow**
when you explicitly want new images. It receives `PIXABAY_API_KEY` only from GitHub
Secrets, downloads missing images, and commits the resulting WebP files and metadata.

`npm run build` and Cloudflare Pages builds never contact Pixabay. Existing files in
`public/images/articles/` are reused, so a normal build or deployment cannot download
or replace an image. The local `npm run fetch:pixabay` command remains available only
for an explicit, developer-initiated fetch with `PIXABAY_API_KEY` set in the shell.

No fake credentials, fake reviews, fake travel experiences or fabricated publisher IDs are included.
