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
  sites:  path.join(ROOT, 'public', 'fs'),
};
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

// Collect all unique URLs from raw HTML
let html = readFileSync(HTML_SRC, 'utf8');

const PATTERNS = [
  // framerusercontent images (may have query strings)
  /https:\/\/framerusercontent\.com\/images\/([^"'\s)]+)/g,
  // framerusercontent assets (fonts + video)
  /https:\/\/framerusercontent\.com\/assets\/([^"'\s)]+)/g,
  // framerusercontent sites (JS modules + search indices)
  /https:\/\/framerusercontent\.com\/sites\/([^"'\s)]+)/g,
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

// Scan patterns in HTML
for (const pattern of PATTERNS) {
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const full = m[0];
    if (full.includes('/images/')) register(full, 'images', 'fi');
    else if (full.includes('/assets/')) register(full, 'assets', 'fa');
    else if (full.includes('/sites/')) register(full, 'sites', 'fs');
    else if (full.includes('gstatic')) register(full, 'fonts', 'ff');
    else if (full.includes('/edit/')) register(full, 'sites', 'fs');
  }
}

// Recursive scan for MJS files
const seenMjs = new Set();
async function recursiveScan(localPath, baseUrl) {
  if (seenMjs.has(localPath)) return;
  seenMjs.add(localPath);

  const content = readFileSync(localPath, 'utf8');
  
  // 1. Find absolute URLs in MJS
  for (const pattern of PATTERNS) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const full = m[0];
      let dir, subdir;
      if (full.includes('/images/')) { dir = 'images'; subdir = 'fi'; }
      else if (full.includes('/assets/')) { dir = 'assets'; subdir = 'fa'; }
      else if (full.includes('/sites/')) { dir = 'sites'; subdir = 'fs'; }
      else if (full.includes('gstatic')) { dir = 'fonts'; subdir = 'ff'; }
      else if (full.includes('/edit/')) { dir = 'sites'; subdir = 'fs'; }
      
      if (dir) {
        const clean = full.split('?')[0];
        if (!downloads.has(clean)) {
          console.log(`Found nested asset: ${clean}`);
          register(full, dir, subdir);
          await downloadFile(clean, downloads.get(clean).localPath);
          if (clean.endsWith('.mjs')) await recursiveScan(downloads.get(clean).localPath, clean.substring(0, clean.lastIndexOf('/') + 1));
        }
      }
    }
  }

  // 2. Find relative imports in MJS (e.g., from "./react.BnaEj7Xr.mjs")
  const RELATIVE_PATTERN = /import\s*\(?['"](\.\/[^'"]+)['"]\)?/g;
  let m;
  while ((m = RELATIVE_PATTERN.exec(content)) !== null) {
    const rel = m[1];
    const full = new URL(rel, baseUrl).href;
    const clean = full.split('?')[0];
    
    if (!downloads.has(clean)) {
      console.log(`Found relative asset: ${clean}`);
      register(full, 'sites', 'fs');
      await downloadFile(clean, downloads.get(clean).localPath);
      if (clean.endsWith('.mjs')) await recursiveScan(downloads.get(clean).localPath, clean.substring(0, clean.lastIndexOf('/') + 1));
    }
  }
}

console.log(`Initial: Found ${downloads.size} assets to download.\n`);

// Download with concurrency limit
async function downloadFile(url, localPath) {
  if (downloads.get(url)?.done) return;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${url}: HTTP ${res.status}`);
    return;
  }
  
  if (localPath.endsWith('.mjs')) {
    let content = await res.text();
    writeFileSync(localPath, content);
  } else {
    await pipeline(res.body, createWriteStream(localPath));
  }
  if (downloads.has(url)) downloads.get(url).done = true;
}

async function downloadAll() {
  const initialEntries = [...downloads.values()];
  const CONCURRENCY = 8;
  let i = 0;
  let ok = 0, fail = 0;

  async function worker() {
    while (i < initialEntries.length) {
      const { url, localPath, publicPath } = initialEntries[i++];
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
  
  // Start recursive scan for all downloaded MJS files
  for (const entry of downloads.values()) {
    if (entry.localPath.endsWith('.mjs')) {
      await recursiveScan(entry.localPath, entry.url.substring(0, entry.url.lastIndexOf('/') + 1));
    }
  }

  console.log(`\nFinal: ok: ${ok}, total: ${downloads.size}.\n`);
}

await downloadAll();

// Patch MJS files: replace external sites URLs with local relative paths
const siteFiles = [...downloads.values()].filter(d => d.localPath.endsWith('.mjs'));
const siteMap = new Map(); // original sites URL -> local filename
for (const entry of [...downloads.values()]) {
  if (entry.url.includes('/sites/') || entry.url.includes('/edit/')) {
    siteMap.set(entry.url, `./${path.basename(entry.localPath)}`);
  }
}

for (const { localPath } of siteFiles) {
  let content = readFileSync(localPath, 'utf8');
  let original = content;
  
  for (const [remote, local] of siteMap.entries()) {
    content = content.replaceAll(remote, local);
  }
  
  if (content !== original) {
    writeFileSync(localPath, content);
    console.log(`Patched imports in ${path.basename(localPath)}`);
  }
}

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

// Post-process HTML to remove Framer junk
patched = patched.replace(/<script[^>]*>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\)\)[\s\S]*?<\/script>/g, '');
patched = patched.replace(/<script[^>]*src="https:\/\/events\.framer\.com\/script\?v=2"[^>]*><\/script>/g, '');

// Remove Framer badge more robustly
// The badge is usually inside #__framer-badge-container
patched = patched.replace(/<div id="__framer-badge-container">[\s\S]*?<\/div>/g, '');
// And some extra styles/scripts related to it
patched = patched.replace(/#\__framer-badge-container\s*\{[^}]*\}/g, '');
patched = patched.replace(/@supports\s*\(z-index:calc\(infinity\)\)\s*\{\s*#\__framer-badge-container\s*\{[^}]*\}\s*\}/g, '');

// Remove "Made in Framer" comment
patched = patched.replace(/<!-- Made in Framer · framer.com ✨ -->/g, '');

// Replace canonical and OG URLs if needed (optional, but cleaner)
patched = patched.replaceAll('https://radge.framer.website/', './');

// Cleanup footer text "Radge® & Framer®" -> "Radge®"
patched = patched.replaceAll('Radge® &amp; Framer®', 'Radge®');
patched = patched.replaceAll('Radge® & Framer®', 'Radge®');

writeFileSync(HTML_OUT, patched, 'utf8');
console.log(`Patched HTML → public/framer.html`);
