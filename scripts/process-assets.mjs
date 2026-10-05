// Converts the original ChatGPT art into web-sized files under public/assets.
// Usage: npm run assets -- <source-dir>   (default: /mnt/project-files/hahn/assets)
// Originals stay outside the repo; only the converted files are committed.
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2] ?? '/mnt/project-files/hahn/assets';
const out = new URL('../public/', import.meta.url).pathname;

function pngs(dir) {
  const full = join(src, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter((f) => /\.png$/i.test(f)).map((f) => join(full, f));
}

async function toWebp(file, destDir, width, height) {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(file, extname(file)) + '.webp');
  await sharp(file).resize(width, height, { fit: 'inside' }).webp({ quality: 82, alphaQuality: 90 }).toFile(dest);
  console.log('wrote', dest.replace(out, 'public/'));
}

// Characters are drawn on the shared 1024x1536 template; 512x768 keeps them sharp on phones.
for (const f of pngs('00-template')) await toWebp(f, join(out, 'assets/template'), 512, 768);
for (const f of pngs('04-heroes')) await toWebp(f, join(out, 'assets/heroes'), 512, 768);

// PWA icons are already sized; copy them to the web root.
for (const f of [...pngs('02-pwa'), join(src, '02-pwa/favicon.ico')]) {
  if (!existsSync(f) || basename(f).startsWith('app-icon')) continue;
  copyFileSync(f, join(out, basename(f)));
  console.log('copied', basename(f));
}
