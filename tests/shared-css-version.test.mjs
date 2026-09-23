// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * One cache-busting number for the shared stylesheet, everywhere it is named.
 *
 * WHY THIS FILE EXISTS. styles-1.0.0.css is edited in place and every page
 * retires its cached copy with `?v=<n>` (see www/shared/js/README.md). Three
 * ways that goes wrong, and none of them fails anything else or shows up on a
 * fresh browser, because a stale stylesheet over fresh markup does not look
 * like a caching problem, it looks like a broken layout:
 *
 * - a page left behind on the old number keeps serving the old sheet;
 * - a page whose preload and stylesheet lines differ downloads it twice;
 * - the README's example falls behind, and the next new experience copies it.
 *   It sat at ?v=1 until 2026-09-23 while every page was on ?v=7.
 */
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SHEET = /styles-1\.0\.0\.min\.css(?:\?v=(\d+))?"/g;

/** Every .html file under www, as paths relative to the repo root. */
async function pages(dir = 'www') {
  const out = [];
  for (const entry of await readdir(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await pages(rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** The version on each reference to the sheet in a file ('none' for no query). */
async function versionsIn(rel) {
  const text = await readFile(new URL(rel, ROOT), 'utf8');
  return [...text.matchAll(SHEET)].map((m) => m[1] || 'none');
}

test('every page names the shared sheet with the same version', async () => {
  const seen = {};
  for (const rel of await pages()) {
    for (const v of await versionsIn(rel)) (seen[v] ||= []).push(rel);
  }
  // Found at all, or this passes on nothing.
  const total = Object.values(seen).reduce((n, list) => n + list.length, 0);
  expect(total).toBeGreaterThan(20);
  // Reported as the map, so a failure names the pages on each number.
  expect(Object.keys(seen)).toHaveLength(1);
  expect(Object.keys(seen)[0]).not.toBe('none');
});

test('a page preloads exactly the version it links', async () => {
  for (const rel of await pages()) {
    const versions = await versionsIn(rel);
    if (versions.length < 2) continue;
    expect(`${rel}: ${new Set(versions).size}`).toBe(`${rel}: 1`);
  }
});

test('the README example carries the number the pages do', async () => {
  const [pageVersion] = await versionsIn('www/dad/index.html');
  const readme = await versionsIn('www/shared/js/README.md');
  expect(readme.length).toBeGreaterThanOrEqual(2);
  readme.forEach((v) => expect(v).toBe(pageVersion));
});
