/**
 * Side-effect import: fills process.env from .env.local and .env in the
 * current directory without overriding variables that are already set.
 */
import { readFileSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]!]) process.env[m[1]!] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
