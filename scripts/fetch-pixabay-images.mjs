import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const apiKey = process.env.PIXABAY_API_KEY;
const allowNetwork = process.env.PIXABAY_FETCH_NEW_IMAGES === 'true';

const root = new URL('../', import.meta.url).pathname;
const outputDir = path.join(root, 'public', 'images', 'articles');
const manifestPath = path.join(root, 'src', 'data', 'image-sources.json');

// New Pixabay downloads are opt-in. Normal production builds do not call Pixabay.
const articles = [
  {
    slug: 'best-time-to-visit-japan',
    query: 'Japan cherry blossoms Mount Fuji travel',
    alt: 'Cherry blossoms framing Mount Fuji in Japan',
  },
  {
    slug: 'best-cities-to-visit-in-japan',
    query: 'Tokyo Japan city skyline travel',
    alt: 'Tokyo skyline at sunset in Japan',
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

async function updateFeaturedImage({ slug, alt }, file) {
  const articlePath = path.join(root, 'src', 'content', 'blog', `${slug}.md`);
  const source = await fs.readFile(articlePath, 'utf8');
  const withImage = source.replace(
    /^(featuredImage:\s*)["']?[^\n"']+["']?$/m,
    `$1"${file}"`,
  );

  if (withImage === source) {
    throw new Error(`Could not find featuredImage frontmatter in ${articlePath}`);
  }

  const updated = withImage.replace(
    /^(featuredImageAlt:\s*)["']?[^\n"']+["']?$/m,
    `$1"${alt}"`,
  );

  await fs.writeFile(articlePath, updated);
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
  const filename = `${slugify(article.slug)}.webp`;
  const target = path.join(outputDir, filename);
  const file = `/images/articles/${filename}`;

  try {
    if (await exists(target)) {
      console.log(`Pixabay cached: ${file}`);
    } else {
      const data = await search(article.query);
      const image = data.hits?.[0];
      if (!image?.largeImageURL) {
        console.warn(`No suitable Pixabay image found for: ${article.query}`);
        continue;
      }

      await downloadWebp(image.largeImageURL, target);
      additions.push({
        article: article.slug,
        query: article.query,
        file,
        pixabayPage: image.pageURL,
        author: image.user,
      });
      console.log(`Pixabay downloaded: ${article.query} -> ${file}`);
    }

    await updateFeaturedImage(article, file);
  } catch (error) {
    // Image acquisition is optional and must never make the build fail.
    console.warn(`Pixabay skipped for ${article.slug}: ${error.message}`);
  }
}

const mergedManifest = [...existingManifest, ...additions].filter(
  (item, index, items) => index === items.findIndex((candidate) => candidate.file === item.file),
);

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify(mergedManifest, null, 2));
console.log(`Pixabay fetch complete. Cached on disk: ${mergedManifest.length}; new downloads: ${additions.length}.`);
