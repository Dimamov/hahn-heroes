// Converts the final batch of ChatGPT art (cards, Spot the Difference, story poses, Episode 1) into web-sized files.
// Usage: node scripts/process-final-art.mjs <art-uploads-dir>
// The originals live on the art-uploads branch and are never touched; only the converted files are written to public/.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error('Pass the art-uploads folder.'); process.exit(1); }
const out = new URL('../public/assets/', import.meta.url).pathname;

async function convert(from, toDir, name, w, h, q = 82) {
  mkdirSync(toDir, { recursive: true });
  await sharp(from).resize(w, h, { fit: 'inside', withoutEnlargement: true }).webp({ quality: q, alphaQuality: 90 }).toFile(join(toDir, name + '.webp'));
}
const files = (dir, re) => readdirSync(join(src, dir)).filter((f) => re.test(f)).sort();

for (const f of files('08-cards/art', /^card-art-\d+\.png$/)) await convert(join(src, '08-cards/art', f), join(out, 'cards/art'), basename(f, '.png'), 320, 320, 76);
for (const f of files('10-game-art', /^spot-\d\d-[ab]\.png$/)) await convert(join(src, '10-game-art', f), join(out, 'games'), basename(f, '.png'), 1024, 683);
for (const f of files('11-story/poses', /^pose-.*\.png$/)) await convert(join(src, '11-story/poses', f), join(out, 'story/poses'), basename(f, '.png'), 512, 512);
for (const f of files('11-story/ep01', /^ep01-p\d\d\.png$/)) await convert(join(src, '11-story/ep01', f), join(out, 'story/ep01'), basename(f, '.png'), 768, 1152, 80);
await convert(join(src, '11-story/ep01/ep01-cover.png'), join(out, 'story/ep01'), 'ep01-cover', 640, 960, 80);
await convert(join(src, '11-story/ep01/ep01-collectible.png'), join(out, 'story/ep01'), 'ep01-collectible', 640, 640);
console.log('done');
