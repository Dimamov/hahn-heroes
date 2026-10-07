// Converts the Episode 1 full-screen shots from ChatGPT (art-uploads/12-episode-01) and the reused Nexus backgrounds
// (art-uploads/03-backgrounds) into web-sized files in public/assets/story/ep01.
// Usage: node scripts/process-episode1-art.mjs <art-uploads-dir>
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error('Pass the art-uploads folder.'); process.exit(1); }
const out = new URL('../public/assets/story/ep01/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const save = (from, name) => sharp(from).resize(768, 1152, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(out, name + '.webp'));

for (const f of readdirSync(join(src, '12-episode-01')).filter((n) => /^ep01-\d\d.*\.png$/.test(n)).sort()) {
  await save(join(src, '12-episode-01', f), basename(f, '.png'));
}
// The cartoon school front is reused (the new school-front art is still a photo); backgrounds sit behind Sensei poses.
for (const [from, name] of [
  ['bg-entrance-real-tall', 'ep01-bg-school-front'], ['bg-entrance-nexus-tall', 'ep01-bg-entrance-nexus'], ['bg-portal-closed-tall', 'ep01-bg-portal-closed'],
  ['bg-nexus-hub-tall', 'ep01-bg-nexus-hub'], ['bg-sensei-chamber-tall', 'ep01-bg-sensei-chamber'], ['bg-nexus-portal-tall', 'ep01-bg-nexus-portal'],
]) await save(join(src, '03-backgrounds', from + '.png'), name);
// The cover on the Adventures list is the whole squad with their powers.
await save(join(src, '12-episode-01', 'ep01-12-powers.png'), 'ep01-cover');
console.log('done');
