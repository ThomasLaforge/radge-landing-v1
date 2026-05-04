import { readFileSync } from 'fs';
import { join } from 'path';

const FRAMER_HTML_PATH = join(process.cwd(), 'public', 'framer.html');
const FRAMER_HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
};
const MIRRORED_ASSET_PREFIX = /^\/(?:fs|fi|fa|ff)\//;

function getFramerHtml(pathname = '/') {
  const html = readFileSync(FRAMER_HTML_PATH, 'utf8');

  if (pathname === '/') {
    return html;
  }

  // For deep links, let Framer resolve the current route from location.pathname
  // instead of forcing the pre-rendered homepage routeId.
  return html.replace(/\sdata-framer-hydrate-v2="[^"]*"/, '');
}

export function isMirroredAssetPath(pathname: string) {
  return MIRRORED_ASSET_PREFIX.test(pathname);
}

export function serveFramerHtml(pathname = '/') {
  const html = getFramerHtml(pathname);

  return new Response(html, {
    headers: FRAMER_HTML_HEADERS,
  });
}

export function serveFramerHtmlHead() {
  return new Response(null, {
    headers: FRAMER_HTML_HEADERS,
  });
}
