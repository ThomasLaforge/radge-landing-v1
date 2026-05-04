import { readFileSync } from 'fs';
import { join } from 'path';

const FRAMER_HTML_PATH = join(process.cwd(), 'public', 'framer.html');
const FRAMER_HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
};

export function serveFramerHtml() {
  const html = readFileSync(FRAMER_HTML_PATH, 'utf8');

  return new Response(html, {
    headers: FRAMER_HTML_HEADERS,
  });
}

export function serveFramerHtmlHead() {
  return new Response(null, {
    headers: FRAMER_HTML_HEADERS,
  });
}
