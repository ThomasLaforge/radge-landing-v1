import { serveFramerHtml, serveFramerHtmlHead } from '../_lib/serve-framer-html';

export function GET() {
  return serveFramerHtml();
}

export function HEAD() {
  return serveFramerHtmlHead();
}
