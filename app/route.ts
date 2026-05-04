import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

export function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'framer.html'));
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
