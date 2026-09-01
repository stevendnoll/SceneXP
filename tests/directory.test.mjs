// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/js/directory.js — the live search over the home page's
 * static experience cards.
 *
 * The script is an IIFE that registers a DOMContentLoaded listener on import,
 * so each test installs a capturing document stub first, imports a fresh
 * module instance, then fires the captured listener by hand and drives the
 * search box through its own captured 'input' listener.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// MUST MATCH THE CATALOG IN www/js/directory.js, IN ORDER. The module pairs
// each catalog entry with a card looked up by slug, so an entry missing from
// this fixture is an entry whose card comes back null, and the count in the
// status line is taken straight from the catalog's length. Both assertions
// below read that count, which is what makes a stale list here fail loudly
// rather than quietly under-test the search.
const SLUGS = ['dad', 'family', 'roqui', 'seedtoseed', 'interstate', 'steve', 'gavin', 'jamar', 'mandelbrot', 'earthdefense', 'highwater', 'garden'];

function makeDom({ withMarkup = true } = {}) {
  const dom = {
    listeners: {},
    cards: {},
    form: { hidden: true, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } },
    input: { value: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } },
    status: { textContent: 'untouched' },
    empty: { hidden: true },
  };
  SLUGS.forEach((slug) => { dom.cards[slug] = { hidden: false }; });
  globalThis.document = {
    addEventListener(type, fn) { dom.listeners[type] = fn; },
    getElementById(id) {
      if (!withMarkup) return null;
      return {
        'experience-search-form': dom.form,
        'experience-search': dom.input,
        'search-status': dom.status,
        'search-empty': dom.empty,
      }[id] ?? null;
    },
    querySelector(selector) {
      const m = selector.match(/data-slug="([^"]+)"/);
      return m ? dom.cards[m[1]] ?? null : null;
    },
  };
  return dom;
}

// Import fresh and simulate the page load.
async function load(dom) {
  jest.resetModules();
  await import('../www/js/directory.js');
  dom.listeners.DOMContentLoaded();
  return dom;
}

function search(dom, query) {
  dom.input.value = query;
  dom.input.listeners.input();
}

const shownSlugs = (dom) => SLUGS.filter((slug) => !dom.cards[slug].hidden);

afterEach(() => {
  delete globalThis.document;
});

test('reveals the search form (progressive enhancement)', async () => {
  const dom = await load(makeDom());
  expect(dom.form.hidden).toBe(false);
});

test('stays quiet on pages without the search markup', async () => {
  const dom = makeDom({ withMarkup: false });
  await expect(load(dom)).resolves.toBeDefined();
  expect(dom.form.hidden).toBe(true);
});

test('filters cards live and reports the count politely', async () => {
  const dom = await load(makeDom());
  search(dom, 'zumba');
  expect(shownSlugs(dom)).toEqual(['roqui']);
  expect(dom.status.textContent).toBe(`1 of ${SLUGS.length} experiences shown`);
  expect(dom.empty.hidden).toBe(true);
});

test('matching is case-insensitive, trims whitespace, and searches the tags', async () => {
  const dom = await load(makeDom());
  search(dom, '  PUTT  ');
  expect(shownSlugs(dom)).toEqual(['family']);
  // 'grow more food' only appears in the seedtoseed tag list.
  search(dom, 'grow more food');
  expect(shownSlugs(dom)).toEqual(['seedtoseed']);
});

test('no matches shows the empty message and a zero count', async () => {
  const dom = await load(makeDom());
  search(dom, 'xyzzy');
  expect(shownSlugs(dom)).toEqual([]);
  expect(dom.empty.hidden).toBe(false);
  expect(dom.status.textContent).toBe(`0 of ${SLUGS.length} experiences shown`);
});

test('clearing the box restores every card and empties the status', async () => {
  const dom = await load(makeDom());
  search(dom, 'zumba');
  search(dom, '');
  expect(shownSlugs(dom)).toEqual(SLUGS);
  expect(dom.empty.hidden).toBe(true);
  expect(dom.status.textContent).toBe('');
});

test('the form never navigates (submit is prevented)', async () => {
  const dom = await load(makeDom());
  const event = { preventDefault: jest.fn() };
  dom.form.listeners.submit(event);
  expect(event.preventDefault).toHaveBeenCalled();
});

// ---- The garden's own way in (TASKS.md M6-5) --------------------------------

test('the five words M6-5 names all find the Fractal Garden', async () => {
  // These are not decoration. A visitor who half-remembers this scene
  // remembers a word from it, not its title, and the catalog is the only place
  // that association is written down.
  const dom = await load(makeDom());
  for (const word of ['tree', 'garden', 'fractal', 'seasons', 'snow']) {
    search(dom, word);
    expect(`${word}: ${shownSlugs(dom).includes('garden')}`).toBe(`${word}: true`);
  }
});

test('the singular finds the plural, which is what a substring search buys', async () => {
  // MATCHING IS `indexOf`, SO THE STORED FORM DECIDES WHAT ANSWERS. 'trees'
  // answers both "tree" and "trees" while 'tree' answers only the first, and
  // the same holds for 'seasons'. Storing the singular is the version of this
  // that looks correct and quietly fails half the queries, so it is asserted
  // in both directions rather than assumed.
  const dom = await load(makeDom());
  for (const word of ['tree', 'trees', 'season', 'seasons']) {
    search(dom, word);
    expect(`${word}: ${shownSlugs(dom).includes('garden')}`).toBe(`${word}: true`);
  }
});

// ---- One experience, four files ---------------------------------------------
//
// AN EXPERIENCE IS LISTED IN FOUR PLACES AND NOTHING HAS EVER CHECKED THAT THEY
// AGREE. The catalog in directory.js, a static card in index.html, a sitemap
// URL, and an llms.txt line. A card with no catalog entry cannot be searched
// for, a catalog entry with no card searches a `null` and hides nothing, and a
// missing sitemap or llms.txt line is invisible until somebody wonders why a
// page never got indexed. All four are hand-edited, none of them near each
// other, and this is the check that would have caught the omission.

describe('every catalog entry is wired into the whole site', () => {
    const read = (...p) => readFileSync(join(process.cwd(), ...p), 'utf8');
    const catalog = read('www', 'js', 'directory.js');
    const home = read('www', 'index.html');
    const sitemap = read('www', 'sitemap.xml');
    const llms = read('www', 'llms.txt');
    const slugs = [...catalog.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);

    test('the fixture above is the real catalog, in order', () => {
        // The whole file leans on SLUGS being the truth. If it drifts, the
        // counts in the status-line assertions quietly measure the wrong thing.
        expect(slugs).toEqual(SLUGS);
    });

    test.each(slugs)('%s has a card, a sitemap URL, and an llms.txt line', (slug) => {
        expect(home).toContain(`<li class="experience-card" data-slug="${slug}">`);
        expect(home).toContain(`<a href="/${slug}/">`);
        expect(sitemap).toContain(`<loc>https://www.scenexp.com/${slug}/</loc>`);
        expect(llms).toContain(`(https://www.scenexp.com/${slug}/)`);
    });

    test('the home page is never staler than the newest experience', () => {
        // THE HOME PAGE IS A DIRECTORY. Its content changes every time an
        // experience is added, because a new card lands on it, so a `lastmod`
        // left at whenever the page was last restyled tells a crawler there is
        // nothing new to come back for. This cannot check "somebody added a
        // scene", but it can check the consequence: the directory's date can
        // never be older than the newest thing listed in it.
        const dates = Object.fromEntries(
            [...sitemap.matchAll(
                /<loc>https:\/\/www\.scenexp\.com\/([^<]*)<\/loc>\s*(?:<!--[\s\S]*?-->\s*)?<lastmod>([^<]+)<\/lastmod>/g)]
                .map((m) => [m[1], m[2]]));
        // The regex has to actually find things, or this test passes on an
        // empty object and guards nothing.
        expect(Object.keys(dates).length).toBeGreaterThan(slugs.length);
        const newest = slugs
            .map((slug) => dates[`${slug}/`])
            .reduce((a, b) => (a > b ? a : b));
        // ISO dates compare correctly as plain strings. Reported as an object
        // so a failure names both dates rather than just saying false.
        expect({ home: dates[''], newest, homeIsCurrent: dates[''] >= newest })
            .toEqual({ home: dates[''], newest, homeIsCurrent: true });
    });

    test.each(slugs)('%s is not quietly hidden from search', (slug) => {
        // THE SAME SCAFFOLD THAT ALMOST SHIPPED ON THE GARDEN. A `noindex` put
        // in during development is invisible in every browser, survives every
        // test, and costs the page its entire search presence. It is listed in
        // the sitemap, so the only sign anything is wrong is that the page
        // never appears, which nobody notices for weeks.
        // COMMENTS ARE STRIPPED FIRST, and the first draft of this test did not
        // do that and failed on highwater, whose head carries a comment saying
        // its own noindex is gone and that no robots tag belongs here. That
        // note is the right thing to have written. A test that punishes a page
        // for explaining itself is a test that gets deleted.
        const page = readFileSync(
            join(process.cwd(), 'www', slug, 'index.html'), 'utf8')
            .replace(/<!--[\s\S]*?-->/g, '');
        expect(`${slug}: ${/<meta\s+name="robots"/i.test(page)}`).toBe(`${slug}: false`);
        expect(`${slug}: ${/noindex/i.test(page)}`).toBe(`${slug}: false`);
    });

    test('and no card exists that the catalog has never heard of', () => {
        // The other direction, which is the one that leaves a card that cannot
        // be filtered: it stays on screen through every search.
        const carded = [...home.matchAll(/experience-card" data-slug="([^"]+)"/g)]
            .map((m) => m[1]);
        expect(carded.slice().sort()).toEqual(slugs.slice().sort());
    });
});

test('the garden does not swallow another experience\'s search', async () => {
  // A forty-term tag list is a big haystack, and the risk of one is that it
  // starts answering questions that belong to somebody else.
  const dom = await load(makeDom());
  search(dom, 'zumba');
  expect(shownSlugs(dom)).toEqual(['roqui']);
  search(dom, 'tsunami');
  expect(shownSlugs(dom)).toEqual(['highwater']);
  search(dom, 'martian');
  expect(shownSlugs(dom)).toEqual(['earthdefense']);
});
