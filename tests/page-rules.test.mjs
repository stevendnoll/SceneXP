// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The rules every page keeps, checked on every page.
 *
 * WHY THIS FILE EXISTS. tests/page-snapshots.test.mjs says THAT a page
 * changed, and relies on somebody reading the diff before accepting it. These
 * say whether a page is WRONG, however it got that way, including through a
 * snapshot accepted without reading. Each rule is one the site already keeps
 * by convention (CLAUDE.md, CONTRIBUTING), written down where CI can hold it:
 *
 * - SHARING. One title, one description, a canonical that agrees with og:url,
 *   and exactly one og:image. Apple's link preview draws every og:image it
 *   finds, so two put two identical cards in one message thread (earthdefense
 *   shipped that). The Twitter card names the same picture with the same alt.
 * - SECURITY. A same-origin Content Security Policy, and nothing the policy
 *   would block anyway: no inline script, no inline handler, no style
 *   attribute. A link that opens a new tab cannot reach back into this one.
 * - ACCESSIBILITY. Every image has alt text (empty is a decision, missing is
 *   not), every button has a name, there is one h1 outside the noscript
 *   fallback, ids are unique, and every id a label, link or aria attribute
 *   points at exists. Every 3D scene has a polite no-JavaScript fallback.
 * - HOUSE STYLE, over everything a visitor, screen reader or crawler reads
 *   (text, alt, aria-label, title, the sharing tags, structured data): no
 *   em-dashes, no semicolons, and American spelling and vocabulary.
 *
 * Found on the first run, 2026-09-23, and fixed the same day: "grey" and
 * "centre" in the gray-sky alt text on the home page, garden and highwater.
 *
 * Failures name the page and the element's line. The parser is the one the
 * snapshots use (tests/helpers/page-outline.mjs).
 */
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parsePage, attr } from './helpers/page-outline.mjs';

const ROOT = new URL('../', import.meta.url);

// ---- Which rules reach which pages -------------------------------------------

/** A capture tool for the automan social card (noindex), not a page anyone
 *  visits: it keeps the security and copy rules and nothing else. */
const TOOLS = ['www/automan/og-card.html'];

/** Pages that are never shared, so they carry no sharing tags. */
const NOT_SHARED = ['www/404.html', ...TOOLS];

/** Buttons that ship empty on purpose, because their script names them before
 *  they are shown. Each must also ship `hidden`, or it is on screen nameless. */
const NAMED_BY_SCRIPT = {
  'www/garden/index.html': ['water-all'],   // garden/js/main.js sets its text
};

/** Pages whose social card carries a company logo, so .gitignore holds the
 *  picture out of the public repository and a fresh clone (CI) has no file to
 *  open. Where the file is present, as on the maintainer's machine, it is
 *  checked like any other. Each card must really be git-ignored, or this list
 *  would excuse a card somebody simply forgot to commit. */
const WITHHELD_CARDS = ['www/interstate/index.html', 'www/seedtoseed/index.html'];

// ---- Reading the pages -------------------------------------------------------

async function htmlFiles(dir = 'www') {
  const out = [];
  for (const entry of await readdir(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await htmlFiles(rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out.sort();
}

function ignored(paths) {
  try {
    return new Set(execFileSync('git', ['check-ignore', ...paths], {
      cwd: new URL('.', ROOT), encoding: 'utf8',
    }).split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Every element with what it sits inside, in document order. */
function elements(root) {
  const out = [];
  (function walk(nodes, inNoscript) {
    for (const node of nodes) {
      if (!node.tag) continue;
      out.push({ node, inNoscript });
      walk(node.children, inNoscript || node.tag === 'noscript');
    }
  }(root.children, false));
  return out.map(({ node, inNoscript }) => Object.assign(node, { inNoscript }));
}

const textOf = (node) => (node.text !== undefined
  ? node.text
  : (node.children || []).map(textOf).join(' ').trim());

const PAGES = [];
{
  const all = await htmlFiles();
  const skip = ignored(all);
  for (const rel of all) {
    if (skip.has(rel)) continue;
    const html = await readFile(new URL(rel, ROOT), 'utf8');
    if (!/<html[\s>]/i.test(html)) continue;      // placeholders and api.html
    const root = parsePage(html, rel);
    PAGES.push({ rel, root, els: elements(root) });
  }
}
const SHARED = PAGES.filter((p) => !NOT_SHARED.includes(p.rel));
const VISITED = PAGES.filter((p) => !TOOLS.includes(p.rel));
const SCENES = PAGES.filter((p) => p.els.some((n) => n.tag === 'script'
  && /three\.min\.js$/.test(attr(n, 'src') || '')));

/** The content of every meta tag whose name or property is `key`. */
const metas = (page, key) => page.els
  .filter((n) => n.tag === 'meta' && (attr(n, 'name') === key || attr(n, 'property') === key))
  .map((n) => attr(n, 'content'));

/** Where a page's og:image lives in the repository. */
const cardPath = (page) => `www${new URL(metas(page, 'og:image')[0]).pathname}`;

/** What a picture file is, read from its own bytes: { type, width, height },
 *  or null if it is not a JPEG, PNG or WebP. */
function imageSize(b) {
  if (b[0] === 0xFF && b[1] === 0xD8) {
    // JPEG: walk the markers to the frame header, which holds the size.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) return null;
      const marker = b[i + 1];
      const length = b.readUInt16BE(i + 2);
      if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
        return { type: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
    return null;
  }
  if (b.readUInt32BE(0) === 0x89504E47) {
    return { type: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { type: 'image/webp', width: b.readUInt16LE(26) & 0x3FFF, height: b.readUInt16LE(28) & 0x3FFF };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { type: 'image/webp', width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
  }
  return null;
}

/** Every string a visitor, screen reader or crawler reads, with where it came from. */
function copyOf(page) {
  const out = [];
  const add = (where, value) => { if (value) out.push({ where, value }); };
  (function walk(nodes) {
    for (const node of nodes) {
      if (node.text !== undefined) { add('text', node.text); continue; }
      for (const a of ['alt', 'aria-label', 'title', 'placeholder']) add(`${node.tag}[${a}] line ${node.line}`, attr(node, a));
      if (node.tag === 'meta') {
        const key = attr(node, 'name') || attr(node, 'property') || '';
        if (/description|title|image:alt|site_name/.test(key)) add(`meta ${key}`, attr(node, 'content'));
      }
      if (node.tag === 'script' && attr(node, 'type') === 'application/ld+json') {
        (function strings(v, key) {
          if (typeof v === 'string') { if (!/url|image|logo|sameas|^@|id$/i.test(key)) add(`JSON-LD ${key}`, v); }
          else if (Array.isArray(v)) v.forEach((x) => strings(x, key));
          else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => strings(x, k));
        }(JSON.parse(node.body), ''));
      }
      walk(node.children || []);
    }
  }(page.root.children));
  return out;
}

/** Fail with every offender listed, so one run shows the whole job. */
function expectNone(offenders) {
  expect(offenders).toEqual([]);
}

// ---- The scan itself ---------------------------------------------------------

test('the scan finds the site, and each rule group has pages to hold', () => {
  expect(PAGES.length).toBeGreaterThan(20);
  expect(SHARED.length).toBeGreaterThan(15);
  expect(SCENES.map((p) => p.rel)).toEqual(expect.arrayContaining([
    'www/automan/index.html', 'www/garden/index.html', 'www/xo/index.html',
  ]));
  // An exemption for a page that is gone would be a rule quietly switched off.
  [...NOT_SHARED, ...Object.keys(NAMED_BY_SCRIPT), ...WITHHELD_CARDS].forEach((rel) =>
    expect(`${rel} exists: ${PAGES.some((p) => p.rel === rel)}`).toBe(`${rel} exists: true`));
  WITHHELD_CARDS.forEach((rel) => {
    const page = PAGES.find((p) => p.rel === rel);
    if (!page) return;
    const card = cardPath(page);
    expect(`${card} is git-ignored: ${ignored([card]).has(card)}`).toBe(`${card} is git-ignored: true`);
  });
});

// ---- Sharing -----------------------------------------------------------------

describe('sharing', () => {
  test.each(PAGES.map((p) => [p.rel, p]))('%s has one title, and it says something', (_rel, page) => {
    const titles = page.els.filter((n) => n.tag === 'title');
    expect(titles).toHaveLength(1);
    expect(textOf(titles[0]).length).toBeGreaterThan(0);
  });

  test.each(SHARED.map((p) => [p.rel, p]))('%s carries the full set of sharing tags', (_rel, page) => {
    const one = (key) => {
      const values = metas(page, key);
      expect(`${key}: ${values.length}`).toBe(`${key}: 1`);
      expect(`${key} is empty: ${!values[0]}`).toBe(`${key} is empty: false`);
      return values[0];
    };
    one('description');
    ['og:title', 'og:description', 'og:type', 'og:site_name', 'twitter:title', 'twitter:description']
      .forEach(one);

    // Exactly one picture, at an absolute address a crawler can fetch, and the
    // Twitter card names the same picture with the same words.
    const image = one('og:image');
    expect(image).toMatch(/^https:\/\/www\.scenexp\.com\//);
    expect(one('twitter:image')).toBe(image);
    expect(one('twitter:image:alt')).toBe(one('og:image:alt'));
    expect(one('twitter:card')).toBe('summary_large_image');

    // The canonical and og:url name the same address.
    const canon = page.els.filter((n) => n.tag === 'link' && attr(n, 'rel') === 'canonical');
    expect(canon).toHaveLength(1);
    expect(attr(canon[0], 'href')).toMatch(/^https:\/\/www\.scenexp\.com\//);
    expect(one('og:url')).toBe(attr(canon[0], 'href'));
  });

  // THE CARD IS A FILE, NOT JUST A TAG. Found 2026-09-23: tornado's og:image
  // had named assets/og-tornado.jpg since M1 and the file did not exist, and
  // nothing here noticed, because every rule above reads the tag and none
  // opens the picture. A share of that page would have shown no card at all.
  test.each(SHARED.map((p) => [p.rel, p]))('%s: its card image is on disk, the type and size its tags say', async (rel, page) => {
    const url = new URL(metas(page, 'og:image')[0]);
    const file = await readFile(new URL(cardPath(page), ROOT)).catch((err) => {
      if (err.code === 'ENOENT' && WITHHELD_CARDS.includes(rel)) return null;
      throw err;
    });
    if (!file) return;   // a withheld card on a fresh clone, see WITHHELD_CARDS
    const size = imageSize(file);
    expect(`${url.pathname} is a picture: ${size !== null}`).toBe(`${url.pathname} is a picture: true`);
    const [type] = metas(page, 'og:image:type');
    if (type) expect(`${url.pathname}: ${size.type}`).toBe(`${url.pathname}: ${type}`);
    const [width] = metas(page, 'og:image:width');
    const [height] = metas(page, 'og:image:height');
    if (width) expect(`${url.pathname} width: ${size.width}`).toBe(`${url.pathname} width: ${width}`);
    if (height) expect(`${url.pathname} height: ${size.height}`).toBe(`${url.pathname} height: ${height}`);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s has structured data that parses', (_rel, page) => {
    const bad = page.els
      .filter((n) => n.tag === 'script' && attr(n, 'type') === 'application/ld+json')
      .filter((n) => { try { JSON.parse(n.body); return false; } catch { return true; } })
      .map((n) => `line ${n.line}`);
    expectNone(bad);
  });
});

// ---- Security ----------------------------------------------------------------

describe('security', () => {
  test.each(PAGES.map((p) => [p.rel, p]))('%s has a same-origin Content Security Policy', (_rel, page) => {
    const csp = page.els.filter((n) => n.tag === 'meta'
      && (attr(n, 'http-equiv') || '').toLowerCase() === 'content-security-policy');
    expect(csp).toHaveLength(1);
    const directives = Object.fromEntries(attr(csp[0], 'content').split(';')
      .map((d) => d.trim()).filter(Boolean)
      .map((d) => { const [name, ...sources] = d.split(/\s+/); return [name, sources]; }));
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'none'"]);
    // No hosts, no wildcards, no 'unsafe-inline' or 'unsafe-eval': only the
    // page's own origin, and the data: and blob: URLs the page makes itself.
    const allowed = ["'self'", "'none'", 'data:', 'blob:'];
    const loose = Object.entries(directives)
      .flatMap(([name, sources]) => sources.filter((s) => !allowed.includes(s)).map((s) => `${name} ${s}`));
    expectNone(loose);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s has nothing inline for the policy to block', (_rel, page) => {
    const offenders = [];
    for (const n of page.els) {
      if (n.tag === 'script' && (n.body || '').trim() && attr(n, 'type') !== 'application/ld+json') {
        offenders.push(`inline <script> at line ${n.line}`);
      }
      for (const [name] of n.attrs) {
        if (/^on/.test(name)) offenders.push(`${name}= on <${n.tag}> at line ${n.line}`);
        if (name === 'style') offenders.push(`style= on <${n.tag}> at line ${n.line}`);
      }
    }
    expectNone(offenders);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s opens no new tab that can reach back', (_rel, page) => {
    const offenders = page.els
      .filter((n) => n.tag === 'a' && attr(n, 'target') === '_blank')
      .filter((n) => !/\bno(opener|referrer)\b/.test(attr(n, 'rel') || ''))
      .map((n) => `line ${n.line}: ${attr(n, 'href')}`);
    expectNone(offenders);
  });
});

// ---- Accessibility -----------------------------------------------------------

describe('accessibility', () => {
  test.each(PAGES.map((p) => [p.rel, p]))('%s declares its language', (_rel, page) => {
    const html = page.els.find((n) => n.tag === 'html');
    expect(attr(html, 'lang')).toMatch(/^en/);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s gives every image alt text', (_rel, page) => {
    // alt="" is a decision (decorative); a missing alt is not one.
    const offenders = page.els
      .filter((n) => n.tag === 'img' && attr(n, 'alt') === undefined)
      .map((n) => `line ${n.line}: ${attr(n, 'src')}`);
    expectNone(offenders);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s names every button', (rel, page) => {
    const byScript = NAMED_BY_SCRIPT[rel] || [];
    const offenders = page.els
      .filter((n) => n.tag === 'button')
      .filter((n) => !textOf(n) && !attr(n, 'aria-label') && !attr(n, 'aria-labelledby') && !attr(n, 'title'))
      .filter((n) => !(byScript.includes(attr(n, 'id')) && attr(n, 'hidden') !== undefined))
      .map((n) => `line ${n.line}: ${attr(n, 'id') || attr(n, 'class') || 'button'}`);
    expectNone(offenders);
  });

  test.each(VISITED.map((p) => [p.rel, p]))('%s has one h1 outside the noscript fallback', (_rel, page) => {
    const h1s = page.els.filter((n) => n.tag === 'h1' && !n.inNoscript);
    expect(h1s.map((n) => `line ${n.line}`)).toHaveLength(1);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s uses each id once, and points only at ids it has', (_rel, page) => {
    const ids = page.els.map((n) => attr(n, 'id')).filter(Boolean);
    expectNone(ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `duplicate id ${id}`));
    const have = new Set(ids);
    const dangling = [];
    for (const n of page.els) {
      for (const a of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        (attr(n, a) || '').split(/\s+/).filter(Boolean)
          .filter((id) => !have.has(id))
          .forEach((id) => dangling.push(`line ${n.line}: ${a}="${id}"`));
      }
      if (n.tag === 'label' && attr(n, 'for') && !have.has(attr(n, 'for'))) {
        dangling.push(`line ${n.line}: for="${attr(n, 'for')}"`);
      }
      const href = attr(n, 'href');
      if (n.tag === 'a' && href && /^#./.test(href) && !have.has(href.slice(1))) {
        dangling.push(`line ${n.line}: href="${href}"`);
      }
    }
    expectNone(dangling);
  });

  test.each(SCENES.map((p) => [p.rel, p]))('%s has a polite no-JavaScript fallback', (_rel, page) => {
    const fallback = page.els.filter((n) => n.tag === 'noscript' && textOf(n).length > 80);
    expect(fallback.length).toBeGreaterThan(0);
  });
});

// ---- House style -------------------------------------------------------------

/** British spelling and vocabulary. Whole words only, so "color", "center"
 *  and "gray" pass, and a word with an innocent American sense ("cover",
 *  "holiday") is left out rather than flagged everywhere. */
const BRITISH = /\b(colours?|coloured|colourful|favourites?|centres?|centred|behaviours?|honours?|neighbours?|flavours?|harbours?|labour|grey|greys|greyish|theatres?|metres?|licence|cheques?|catalogue|programmes?|travelled|travelling|cancelled|jewellery|organis\w*|realis\w*|recognis\w*|apologis\w*|customis\w*|personalis\w*|optimis\w*|visualis\w*|analyse[ds]?|tyres?|windscreens?|petrol|lorry|lorries|motorways?|kerbs?|storeys?|trolleys?|rubbish|queues?|car parks?)\b/i;

describe('house style', () => {
  test.each(PAGES.map((p) => [p.rel, p]))('%s: no em-dashes or semicolons in the copy', (_rel, page) => {
    const offenders = copyOf(page)
      // Character references end in a semicolon of their own (&times;).
      .filter(({ value }) => /—|&mdash;|&#8212;/.test(value) || value.replace(/&#?\w+;/g, '').includes(';'))
      .map(({ where, value }) => `${where}: ${value.slice(0, 90)}`);
    expectNone(offenders);
  });

  test.each(PAGES.map((p) => [p.rel, p]))('%s: American spelling and vocabulary', (_rel, page) => {
    const offenders = copyOf(page)
      .filter(({ value }) => BRITISH.test(value))
      .map(({ where, value }) => `${where}: "${value.match(BRITISH)[0]}" in ${value.slice(0, 70)}`);
    expectNone(offenders);
  });
});
