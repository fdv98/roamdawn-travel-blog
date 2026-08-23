import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.PIXABAY_API_KEY;
if (!apiKey) throw new Error('PIXABAY_API_KEY is required.');

const root = new URL('../', import.meta.url).pathname;
const outputDir = path.join(root, 'public', 'images', 'destinations');

const queries = {
  japan: ['Japan Tokyo travel', 'Kyoto Japan travel', 'Mount Fuji Japan'],
  spain: ['Barcelona Spain travel', 'Madrid Spain travel', 'Seville Spain travel'],
  croatia: ['Dubrovnik Croatia travel', 'Split Croatia travel', 'Plitvice Croatia'],
  ireland: ['Dublin Ireland travel', 'Galway Ireland travel', 'Ireland coast travel'],
  scotland: ['Edinburgh Scotland travel', 'Scottish Highlands travel', 'Isle of Skye Scotland'],
  canada: ['Vancouver Canada travel', 'Banff Canada travel', 'Toronto Canada travel'],
  norway: ['Oslo Norway travel', 'Bergen Norway travel', 'Norway fjords travel'],
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function search(query) {
  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('min_width', '1200');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '5');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay request failed: ${response.status}`);
  return response.json();
}

await fs.mkdir(outputDir, { recursive: true });
const manifest = [];

for (const [destination, terms] of Object.entries(queries)) {
  const destinationDir = path.join(outputDir, destination);
  await fs.mkdir(destinationDir, { recursive: true });
  for (const term of terms) {
    const data = await search(term);
    const image = data.hits?.[0];
    if (!image?.largeImageURL) {
      console.warn(`No suitable image found for: ${term}`);
      continue;
    }
    const filename = `${slugify(term)}.jpg`;
    const target = path.join(destinationDir, filename);
    const imageResponse = await fetch(image.largeImageURL);
    if (!imageResponse.ok) throw new Error(`Image download failed: ${imageResponse.status}`);
    await fs.writeFile(target, Buffer.from(await imageResponse.arrayBuffer()));
    manifest.push({ destination, query: term, file: `/images/destinations/${destination}/${filename}`, pixabayPage: image.pageURL, author: image.user });
    console.log(`Downloaded ${destination}/${filename}`);
  }
}

await fs.writeFile(path.join(root, 'src', 'data', 'image-sources.json'), JSON.stringify(manifest, null, 2));
console.log(`Saved ${manifest.length} image sources.`);
