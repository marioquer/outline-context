import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results');

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

export function fmtPct(x: number | null, digits = 1): string {
  return x == null ? '–' : `${(x * 100).toFixed(digits)}%`;
}

export function fmtInt(x: number): string {
  return Math.round(x).toLocaleString('en-US');
}

export function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export function writeResult(name: string, data: unknown, markdown: string) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const meta = { generatedAt: new Date().toISOString(), commit: gitCommit(), node: process.version };
  writeFileSync(join(RESULTS_DIR, `${name}.json`), `${JSON.stringify({ meta, ...(data as object) }, null, 2)}\n`);
  writeFileSync(join(RESULTS_DIR, `${name}.md`), `${markdown.trim()}\n`);
}

export function mdTable(header: string[], rows: Array<Array<string | number>>): string {
  const line = (cells: Array<string | number>) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}
