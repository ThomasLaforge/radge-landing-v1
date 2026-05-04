import type { NextRequest } from 'next/server';

import {
  isMirroredAssetPath,
  serveFramerHtml,
  serveFramerHtmlHead,
} from '../_lib/serve-framer-html';

function notFound() {
  return new Response('Not Found', { status: 404 });
}

export function GET(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isMirroredAssetPath(pathname)) {
    return notFound();
  }

  return serveFramerHtml(pathname);
}

export function HEAD(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isMirroredAssetPath(pathname)) {
    return notFound();
  }

  return serveFramerHtmlHead();
}
