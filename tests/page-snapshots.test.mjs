// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A snapshot of what every page says: its head (title, meta and social tags,
 * canonical, CSP, structured data) and an outline of its markup and copy.
 *
 * WHY THIS FILE EXISTS. A change to a page's markup or copy should never
 * arrive by accident. Git already shows every edit to an index.html, but it
 * does not stop one: a find-and-replace across thirty pages, or a copy tweak
 * made while fixing something else, goes out with nobody having looked at it.
 * Here any such change fails the suite until it is accepted on purpose, in
 * the same commit that made it:
 *
 *     npm test -- -u tests/page-snapshots.test.mjs
 *
 * and the diff of tests/__snapshots__/page-snapshots.test.mjs.snap is then a
 * readable account of what visitors and crawlers will see differently.
 * CI runs Jest in CI mode, where a missing or changed snapshot is a failure
 * rather than something to write, so a new page must commit its snapshot too.
 *
 * What the outline leaves out (comments, whitespace, attribute order) and
 * why is in tests/helpers/page-outline.mjs. Accept a changed snapshot only
 * after reading its diff: accepting without reading is how a snapshot suite
 * stops catching anything.
 */
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pageOutline } from './helpers/page-outline.mjs';

const ROOT = new URL('../', import.meta.url);

/** Every .html file under www, relative to the repo root. */
async function htmlFiles(dir = 'www') {
  const out = [];
  for (const entry of await readdir(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await htmlFiles(rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out.sort();
}

/** The paths git ignores, so a local-only page never gets a snapshot. */
function ignored(paths) {
  try {
    return new Set(execFileSync('git', ['check-ignore', ...paths], {
      cwd: new URL('.', ROOT), encoding: 'utf8',
    }).split('\n').filter(Boolean));
  } catch {
    return new Set();          // exit status 1: nothing is ignored
  }
}

/** The real pages: tracked, and a document rather than an empty placeholder
 *  (the blank index.html files that stop directory listings) or api.html,
 *  whose whole body is a two-byte health check. */
async function pages() {
  const all = await htmlFiles();
  const skip = ignored(all);
  const out = [];
  for (const rel of all) {
    if (skip.has(rel)) continue;
    const html = await readFile(new URL(rel, ROOT), 'utf8');
    if (/<html[\s>]/i.test(html)) out.push(rel);
  }
  return out;
}

const PAGES = await pages();

test('the scan finds the site, so the snapshots below cover something', () => {
  expect(PAGES.length).toBeGreaterThan(20);
  expect(PAGES).toEqual(expect.arrayContaining([
    'www/index.html', 'www/terms.html', 'www/automan/index.html', 'www/garden/index.html',
  ]));
});

test.each(PAGES)('%s', async (rel) => {
  const html = await readFile(new URL(rel, ROOT), 'utf8');
  expect(pageOutline(html, rel)).toMatchSnapshot();
});
