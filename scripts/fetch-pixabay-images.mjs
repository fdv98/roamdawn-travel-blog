import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const apiKey = process.env.PIXABAY_API_KEY;
if (!apiKey) throw new Error('PIXABAY_API_KEY is required in the Cloudflare Pages environment.');

const root = new URL('../', import.meta.url).pathname;
const outputDir = path.join(root, 'public', 'images', 'destinations');
const contentDir = path.join(root, 'src', 'content', 'blog');

const queries = {
  japan: ['Japan Tokyo travel', 'Kyoto Japan travel', 'Mount Fuji Japan'],
  spain: ['Barcelona Spain travel', 'Madrid Spain travel', 'Seville Spain travel'],
  croatia: ['Dubrovnik Croatia travel', 'Split Croatia travel', 'Plitvice Croatia'],
  ireland: ['Dublin Ireland travel', 'Galway Ireland travel', 'Ireland coast travel'],
  scotland: ['Edinburgh Scotland travel', 'Scottish Highlands travel', 'Isle of Skye Scotland'],
  canada: ['Vancouver Canada travel', 'Banff Canada travel', 'Toronto Canada travel'],
  norway: ['Oslo Norway travel', 'Bergen Norway travel', 'Norway fjords travel'],
};

const categoryToDestination = {
  Japan: 'japan', Spain: 'spain', Croatia: 'croatia', Ireland: 'ireland',
  Scotland: 'scotland', Canada: 'canada', Norway: 'norway'
};

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
  if (!response.ok) throw new Error(`Pixabay API request failed: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.hits)) throw new Error('Pixabay API returned an unexpected response.');
  return data;
}

async function downloadWebp(imageUrl, target) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Pixabay image download failed: HTTP ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input)
    .resize({ width: 1280, height: 720, fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(target);
}

await fs.mkdir(outputDir, { recursive: true });
const manifest = [];
const selected = {};

for (const [destination, terms] of Object.entries(queries)) {
  const destinationDir = path.join(outputDir, destination);
  await fs.mkdir(destinationDir, { recursive: true });

  for (const term of terms) {
    const data = await search(term);
    const image = data.hits?.[0];
    if (!image?.largeImageURL) {
      console.warn(`No suitable Pixabay image found for: ${term}`);
      continue;
    }

    const filename = `${destination}-${selected[destination] ? selected[destination].length + 1 : 1}.webp`;
    const target = path.join(destinationDir, filename);
    await downloadWebp(image.largeImageURL, target);

    const file = `/images/destinations/${destination}/${filename}`;
    manifest.push({ destination, query: term, file, pixabayPage: image.pageURL, author: image.user });
    selected[destination] ??= [];
    selected[destination].push(file);
    console.log(`Pixabay OK: ${term} -> ${file}`);
  }
}

// Use the first successfully downloaded photo as the main image for each destination.
const mainImages = Object.fromEntries(
  Object.entries(selected).map(([destination, files]) => [destination, files[0]])
);

// Replace old SVG/JPG featured-image placeholders in blog frontmatter during every build.
const files = await fs.readdir(contentDir);
for (const filename of files.filter((name) => name.endsWith('.md') || name.endsWith('.mdx'))) {
  const filePath = path.join(contentDir, filename);
  let text = await fs.readFile(filePath, 'utf8');
  const category = text.match(/^category:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  const destination = categoryToDestination[category];
  const image = destination ? mainImages[destination] : null;
  if (!image) continue;
  text = text.replace(/^featuredImage:\s*.*$/m, `featuredImage: "${image}"`);
  await fs.writeFile(filePath, text);
}

await fs.writeFile(path.join(root, 'src', 'data', 'image-sources.json'), JSON.stringify(manifest, null, 2));
console.log(`Pixabay API verified. Saved ${manifest.length} optimized WebP images.`);
