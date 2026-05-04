#!/usr/bin/env node
// Downloads all framerusercontent + gstatic assets locally.
// Run: node scripts/download-assets.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_SRC = path.join(ROOT, 'radge_raw.html');
const HTML_OUT = path.join(ROOT, 'public', 'framer.html');

// public subdirs (short names → small URLs)
const DIRS = {
  images: path.join(ROOT, 'public', 'fi'),
  assets: path.join(ROOT, 'public', 'fa'),
  fonts:  path.join(ROOT, 'public', 'ff'),
};
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

// Collect all unique URLs from raw HTML
let html = readFileSync(HTML_SRC, 'utf8');

const PATTERNS = [
  // framerusercontent images (may have query strings)
  /https:\/\/framerusercontent\.com\/images\/([^"'\s)]+)/g,
  // framerusercontent assets (fonts + video)
  /https:\/\/framerusercontent\.com\/assets\/([^"'\s)]+)/g,
  // google fonts woff2
  /https:\/\/fonts\.gstatic\.com\/([^"'\s)]+)/g,
];

const downloads = new Map(); // originalUrl (no query) → localPath + publicPath

function register(url, dir, subdir) {
  // strip query string for download, keep original for replacement
  const clean = url.split('?')[0];
  if (downloads.has(clean)) return;
  const filename = path.basename(clean);
  const localPath = path.join(DIRS[dir], filename);
  const publicPath = `/${subdir}/${filename}`;
  downloads.set(clean, { localPath, publicPath, url: clean });
}

// Scan patterns
for (const pattern of PATTERNS) {
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const full = m[0];
    if (full.includes('/images/')) register(full, 'images', 'fi');
    else if (full.includes('/assets/')) register(full, 'assets', 'fa');
    else if (full.includes('gstatic')) register(full, 'fonts', 'ff');
  }
}

console.log(`Found ${downloads.size} assets to download.\n`);

// Download with concurrency limit
async function downloadFile(url, localPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(localPath));
}

async function downloadAll() {
  const entries = [...downloads.values()];
  const CONCURRENCY = 8;
  let i = 0;
  let ok = 0, fail = 0;

  async function worker() {
    while (i < entries.length) {
      const { url, localPath, publicPath } = entries[i++];
      try {
        await downloadFile(url, localPath);
        console.log(`✓ ${publicPath}`);
        ok++;
      } catch (e) {
        console.error(`✗ ${url}: ${e.message}`);
        fail++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone: ${ok} ok, ${fail} failed.\n`);
}

await downloadAll();

// Patch HTML: replace CDN URLs with local paths
// For images: also replace ?width=xxx&height=xxx variants
let patched = html;

// Sort by longest URL first to avoid partial replacements
const sorted = [...downloads.entries()].sort((a, b) => b[0].length - a[0].length);

for (const [cleanUrl, { publicPath }] of sorted) {
  // Replace exact URL (no query)
  patched = patched.replaceAll(cleanUrl, publicPath);
  // Also replace URL with query params (srcset etc.)
  const escaped = cleanUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  patched = patched.replace(new RegExp(escaped + '[^"\'\\s)]*', 'g'), publicPath);
}

// Fix Google Fonts @font-face urls (they appear inside css strings like url(...))
// Already handled by the above replacements since we match gstatic URLs.

writeFileSync(HTML_OUT, patched, 'utf8');
console.log(`Patched HTML → public/framer.html`);
