import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const apiKey = process.env.PIXABAY_API_KEY;
const allowNetwork = process.env.PIXABAY_FETCH_NEW_IMAGES === 'true';

const root = new URL('../', import.meta.url).pathname;
const outputDir = path.join(root, 'public', 'images', 'destinations');
const manifestPath = path.join(root, 'src', 'data', 'image-sources.json');
const contentDir = path.join(root, 'src', 'content', 'blog');

// New Pixabay downloads are opt-in. Normal production builds do not call Pixabay.
// Each article has a fixed image plan so repeated runs reuse local files.
const articles = [
  {
    slug: 'best-cities-to-visit-in-japan',
    destination: 'japan',
    images: [
      { role: 'hero', query: 'Japan Mount Fuji travel', alt: 'Mount Fuji and Japanese landscape' },
      { heading: '## Which Japanese city should you choose?', query: 'Tokyo Japan travel skyline', alt: 'Tokyo skyline in Japan' },
      { heading: '<h2 id="tokyo">1. Tokyo — Best City for First-Time Visitors</h2>', query: 'Tokyo Japan travel city', alt: 'Tokyo city scene in Japan' },
      { heading: '<h2 id="kyoto">2. Kyoto — Best for Traditional Scenery and Gardens</h2>', query: 'Kyoto Japan traditional streets', alt: 'Traditional streets in Kyoto, Japan' },
      { heading: '<h2 id="osaka">3. Osaka — Best for Food, Shopping and Family Attractions</h2>', query: 'Osaka Japan city travel', alt: 'Osaka city in Japan' },
      { heading: '<h2 id="sapporo">6. Sapporo — Best City to Visit in Japan in Winter</h2>', query: 'Sapporo Japan winter snow', alt: 'Snowy Sapporo in Hokkaido, Japan' },
    ],
  },
  {
    slug: 'best-time-to-visit-japan',
    destination: 'japan',
    images: [
      { role: 'hero', query: 'Japan autumn travel landscape', alt: 'Autumn landscape in Japan' },
      { heading: '<h2 id="spring">Spring in Japan</h2>', query: 'Japan spring cherry blossom travel', alt: 'Spring scenery and cherry blossoms in Japan' },
      { heading: '<h2 id="summer">Summer in Japan</h2>', query: 'Japan summer travel landscape', alt: 'Summer landscape in Japan' },
      { heading: '<h2 id="autumn">Autumn in Japan</h2>', query: 'Japan autumn foliage travel', alt: 'Autumn foliage in Japan' },
      { heading: '<h2 id="winter">Winter in Japan</h2>', query: 'Japan winter snow landscape', alt: 'Winter snow landscape in Japan' },
    ],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, label, { retries = 4, baseDelay = 1500 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'RoamDawn image fetch utility' } });
      if (response.ok) return response;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) {
        throw new Error(`${label}: HTTP ${response.status}`);
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelay * (2 ** attempt) + Math.floor(Math.random() * 500);

      console.warn(`${label}: HTTP ${response.status}; retrying in ${Math.round(delay / 100) / 10}s.`);
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const delay = baseDelay * (2 ** attempt) + Math.floor(Math.random() * 500);
      console.warn(`${label}: ${error.message}; retrying in ${Math.round(delay / 100) / 10}s.`);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`${label}: request failed`);
}

async function search(query) {
  if (!apiKey) throw new Error('PIXABAY_API_KEY is not configured');

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('min_width', '1200');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '5');

  const response = await fetchWithRetry(url, `Pixabay API (${query})`);
  const data = await response.json();
  if (!Array.isArray(data.hits)) throw new Error('Pixabay API returned an unexpected response.');
  return data;
}

async function downloadWebp(imageUrl, target) {
  const response = await fetchWithRetry(imageUrl, 'Pixabay image download');
  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input)
    .resize({ width: 1280, height: 720, fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(target);
}

function insertImageAfterHeading(markdown, heading, imagePath, alt) {
  if (markdown.includes(`<!-- pixabay-image:${imagePath} -->`)) return markdown;
  const marker = `<!-- pixabay-image:${imagePath} -->\n![${alt}](${imagePath})`;
  const index = markdown.indexOf(heading);
  if (index === -1) {
    console.warn(`Heading not found; skipped inline image insertion: ${heading}`);
    return markdown;
  }
  const endOfHeading = index + heading.length;
  return `${markdown.slice(0, endOfHeading)}\n\n${marker}${markdown.slice(endOfHeading)}`;
}

async function updateArticle(article, imageResults) {
  const articlePath = path.join(contentDir, `${article.slug}.md`);
  if (!(await exists(articlePath))) {
    console.warn(`Article not found: ${articlePath}`);
    return false;
  }

  let markdown = await fs.readFile(articlePath, 'utf8');
  const hero = imageResults.find((item) => item.role === 'hero');

  if (hero) {
    markdown = markdown.replace(
      /^featuredImage:\s*.*$/m,
      `featuredImage: "${hero.file}"`,
    );
  }

  for (const image of imageResults.filter((item) => item.heading)) {
    markdown = insertImageAfterHeading(markdown, image.heading, image.file, image.alt);
  }

  await fs.writeFile(articlePath, markdown);
  return true;
}

if (!allowNetwork) {
  console.log('Pixabay fetch utility is offline. Set PIXABAY_FETCH_NEW_IMAGES=true to allow new downloads.');
  process.exit(0);
}

if (!apiKey) {
  console.error('PIXABAY_FETCH_NEW_IMAGES=true but PIXABAY_API_KEY is missing. No images downloaded.');
  process.exit(0);
}

await fs.mkdir(outputDir, { recursive: true });
const manifestPathExists = await exists(manifestPath);
const existingManifest = manifestPathExists ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : [];
const additions = [];

for (const article of articles) {
  const destinationDir = path.join(outputDir, article.destination);
  await fs.mkdir(destinationDir, { recursive: true });
  const imageResults = [];

  for (const spec of article.images) {
    const filename = `${article.slug}-${slugify(spec.query)}.webp`;
    const target = path.join(destinationDir, filename);
    const file = `/images/destinations/${article.destination}/${filename}`;

    if (await exists(target)) {
      console.log(`Pixabay cached: ${file}`);
      imageResults.push({ ...spec, file });
      continue;
    }

    try {
      const data = await search(spec.query);
      const image = data.hits?.[0];
      if (!image?.largeImageURL) {
        console.warn(`No suitable Pixabay image found for: ${spec.query}`);
        continue;
      }

      await downloadWebp(image.largeImageURL, target);
      additions.push({
        article: article.slug,
        destination: article.destination,
        role: spec.role || 'section',
        query: spec.query,
        file,
        pixabayId: image.id,
        pixabayPage: image.pageURL,
        author: image.user,
      });
      imageResults.push({ ...spec, file });
      console.log(`Pixabay downloaded: ${spec.query} -> ${file}`);
    } catch (error) {
      // Image acquisition is optional and must never make the build fail.
      console.warn(`Pixabay skipped for ${spec.query}: ${error.message}`);
    }
  }

  await updateArticle(article, imageResults);
}

const mergedManifest = [...existingManifest, ...additions].filter(
  (item, index, items) => index === items.findIndex((candidate) => candidate.file === item.file),
);

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify(mergedManifest, null, 2));
console.log(`Pixabay fetch complete. Cached on disk: ${mergedManifest.length}; new downloads: ${additions.length}.`);
