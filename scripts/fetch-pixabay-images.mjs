import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const apiKey = process.env.PIXABAY_API_KEY;
const allowNetwork = process.env.PIXABAY_FETCH_NEW_IMAGES === 'true';
const requestedSlug = process.env.PIXABAY_ARTICLE_SLUG?.trim();
const root = new URL('../', import.meta.url).pathname;
const outputDir = path.join(root, 'public', 'images', 'destinations');
const manifestPath = path.join(root, 'src', 'data', 'image-sources.json');
const contentDir = path.join(root, 'src', 'content', 'blog');

const articles = [
  {
    slug: 'best-cities-to-visit-in-japan', destination: 'japan',
    images: [
      { role: 'hero', query: 'Japan travel landscape', alt: 'Scenic landscape in Japan' },
      { heading: '<h2 id="tokyo">1. Tokyo — Best City for First-Time Visitors</h2>', query: 'Tokyo Japan skyline travel', alt: 'Tokyo skyline in Japan' },
      { heading: '<h2 id="kyoto">2. Kyoto — Best for Traditional Scenery and Gardens</h2>', query: 'Kyoto Japan traditional street travel', alt: 'Traditional street in Kyoto, Japan' },
      { heading: '<h2 id="osaka">3. Osaka — Best for Food, Shopping and Family Attractions</h2>', query: 'Osaka Japan skyline city travel', alt: 'Osaka city skyline in Japan' },
      { heading: '<h2 id="hiroshima">4. Hiroshima — Best for History and Meaningful Sightseeing</h2>', query: 'Hiroshima Japan city travel', alt: 'Hiroshima city in Japan' },
      { heading: '<h2 id="kanazawa">5. Kanazawa — Best for Gardens, Crafts and a Quieter Experience</h2>', query: 'Kanazawa Japan city travel', alt: 'Kanazawa city in Japan' },
      { heading: '<h2 id="sapporo">6. Sapporo — Best City to Visit in Japan in Winter</h2>', query: 'Sapporo Japan city winter travel', alt: 'Sapporo city in winter, Japan' },
      { heading: '<h2 id="nara">7. Nara — Best for Parks, Nature and a Relaxed Day Trip</h2>', query: 'Nara Japan city park travel', alt: 'Nara Park area in Japan' },
      { heading: '<h2 id="fukuoka">8. Fukuoka — Best for Southern Japan</h2>', query: 'Fukuoka Japan city travel', alt: 'Fukuoka city in Japan' },
      { heading: '<h2 id="nagoya">9. Nagoya — Best for Technology, History and Families</h2>', query: 'Nagoya Japan city travel', alt: 'Nagoya city in Japan' },
      { heading: '<h2 id="yokohama">10. Yokohama — Best for Waterfront City Breaks</h2>', query: 'Yokohama Japan waterfront skyline travel', alt: 'Yokohama waterfront skyline in Japan' },
    ],
  },
  {
    slug: 'best-time-to-visit-japan', destination: 'japan',
    images: [
      { role: 'hero', query: 'Japan autumn travel landscape', alt: 'Autumn landscape in Japan' },
      { heading: 'Spring', query: 'Japan spring cherry blossom travel', alt: 'Spring scenery and cherry blossoms in Japan' },
      { heading: 'Summer', query: 'Japan summer travel landscape', alt: 'Summer landscape in Japan' },
      { heading: 'Autumn', query: 'Japan autumn foliage travel', alt: 'Autumn foliage in Japan' },
      { heading: 'Winter', query: 'Japan winter snow landscape', alt: 'Winter snow landscape in Japan' },
    ],
  },
];

const selectedArticles = requestedSlug ? articles.filter((a) => a.slug === requestedSlug) : articles;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function exists(filePath) { try { await fs.access(filePath); return true; } catch { return false; } }

async function fetchWithRetry(url, label, { retries = 4, baseDelay = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'RoamDawn image fetch utility' } });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) throw new Error(`${label}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelay * (2 ** attempt) + Math.floor(Math.random() * 500);
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
  url.searchParams.set('key', apiKey); url.searchParams.set('q', query); url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal'); url.searchParams.set('min_width', '1200'); url.searchParams.set('safesearch', 'true'); url.searchParams.set('per_page', '5');
  const data = await (await fetchWithRetry(url, `Pixabay API (${query})`)).json();
  if (!Array.isArray(data.hits)) throw new Error('Pixabay API returned an unexpected response.');
  return data;
}

async function downloadWebp(imageUrl, target) {
  const input = Buffer.from(await (await fetchWithRetry(imageUrl, 'Pixabay image download')).arrayBuffer());
  await sharp(input).resize({ width: 1280, height: 720, fit: 'cover', withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(target);
}

function insertOrReplaceImage(markdown, heading, imagePath, alt) {
  const marker = `<!-- pixabay-image:${imagePath} -->`;
  if (markdown.includes(marker)) return markdown;
  let index = markdown.indexOf(heading); let headingLength = heading.length;
  if (index === -1) {
    const plain = heading.replace(/<[^>]+>/g, '').replace(/^#+\s*/, '').trim();
    if (plain) {
      const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = markdown.match(new RegExp(`^#{2,3}\\s+.*${escaped}.*$`, 'mi'));
      if (match?.index !== undefined) { index = match.index; headingLength = match[0].length; }
    }
  }
  if (index === -1) { console.warn(`Heading not found: ${heading}`); return markdown; }
  const end = index + headingLength;
  const after = markdown.slice(end);
  const old = after.match(/^\s*\n\s*<!-- pixabay-image:[^>]+ -->\s*\n\s*!\[[^\]]*\]\([^)]*\)/);
  const imageMarkup = `\n\n${marker}\n![${alt}](${imagePath})`;
  return old ? markdown.slice(0, end) + imageMarkup + after.slice(old[0].length) : markdown.slice(0, end) + imageMarkup + after;
}

async function updateArticle(article, results) {
  const articlePath = path.join(contentDir, `${article.slug}.md`);
  if (!(await exists(articlePath))) { console.warn(`Article not found: ${articlePath}`); return; }
  let markdown = await fs.readFile(articlePath, 'utf8');
  const hero = results.find((x) => x.role === 'hero');
  if (hero) markdown = markdown.replace(/^featuredImage:\s*.*$/m, `featuredImage: "${hero.file}"`);
  for (const image of results.filter((x) => x.heading)) markdown = insertOrReplaceImage(markdown, image.heading, image.file, image.alt);
  await fs.writeFile(articlePath, markdown);
}

if (!allowNetwork) { console.log('Pixabay fetch utility is offline. Set PIXABAY_FETCH_NEW_IMAGES=true to allow new downloads.'); process.exit(0); }
if (!apiKey) { console.error('PIXABAY_FETCH_NEW_IMAGES=true but PIXABAY_API_KEY is missing.'); process.exit(0); }
if (requestedSlug && selectedArticles.length === 0) { console.error(`Unknown article slug: ${requestedSlug}`); process.exit(1); }

await fs.mkdir(outputDir, { recursive: true });
const existingManifest = await exists(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : [];
const additions = [];

for (const article of selectedArticles) {
  const destinationDir = path.join(outputDir, article.destination); await fs.mkdir(destinationDir, { recursive: true });
  const results = [];
  for (const spec of article.images) {
    const filename = `${article.slug}-${slugify(spec.query)}.webp`;
    const target = path.join(destinationDir, filename); const file = `/images/destinations/${article.destination}/${filename}`;
    if (await exists(target)) { console.log(`Pixabay cached: ${file}`); results.push({ ...spec, file }); continue; }
    try {
      const data = await search(spec.query); const image = data.hits?.[0];
      if (!image?.largeImageURL) { console.warn(`No suitable Pixabay image found for: ${spec.query}`); continue; }
      await downloadWebp(image.largeImageURL, target);
      additions.push({ article: article.slug, destination: article.destination, role: spec.role || 'section', query: spec.query, file, pixabayId: image.id, pixabayPage: image.pageURL, author: image.user });
      results.push({ ...spec, file }); console.log(`Pixabay downloaded: ${spec.query} -> ${file}`);
    } catch (error) { console.warn(`Pixabay skipped for ${spec.query}: ${error.message}`); }
  }
  await updateArticle(article, results);
}

const mergedManifest = [...existingManifest, ...additions].filter((item, index, items) => index === items.findIndex((candidate) => candidate.file === item.file));
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify(mergedManifest, null, 2));
console.log(`Pixabay fetch complete. Cached on disk: ${mergedManifest.length}; new downloads: ${additions.length}.`);
