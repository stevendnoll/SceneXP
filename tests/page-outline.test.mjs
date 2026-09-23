// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The outline behind tests/page-snapshots.test.mjs, held to its two promises:
 * it ignores what no visitor sees (comments, whitespace, attribute order), and
 * it catches everything a visitor or crawler does (copy, markup, attributes).
 * If the first broke, the snapshots would fail on every developer note and be
 * accepted unread. If the second broke, they would pass while the page changed.
 */
import { pageOutline } from './helpers/page-outline.mjs';

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="description" content="A quiet walk on the trail.">
    <title>The Trail</title>
    <script type="application/ld+json">{"@type": "WebSite", "name": "The Trail"}</script>
</head>
<body>
    <!-- The heading every screen reader lands on first. -->
    <h1 class="sr-only">The Trail</h1>
    <button id="go" type="button" aria-label="Start walking">Begin</button>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5l10 6.5-10 6.5z M1 1 L2 2 L3 3 L4 4"/></svg>
    <script src="js/main.min.js"></script>
</body>
</html>`;

const base = pageOutline(PAGE);
const differs = (edited) => pageOutline(edited) !== base;

describe('ignores what no visitor sees', () => {
  test('a rewritten or removed comment', () => {
    expect(differs(PAGE.replace('The heading every screen reader lands on first.', 'Rewritten entirely.'))).toBe(false);
    expect(differs(PAGE.replace(/<!--[\s\S]*?-->/, ''))).toBe(false);
  });

  test('reindenting and rewrapping', () => {
    expect(differs(PAGE.replace(/\n {4}/g, '\n  '))).toBe(false);
    expect(differs(PAGE.replace('A quiet walk on the trail.', 'A quiet walk\n        on the trail.'))).toBe(false);
    expect(differs(PAGE.replace('<h1 class="sr-only">The Trail</h1>', '<h1 class="sr-only">\n        The Trail\n    </h1>'))).toBe(false);
  });

  test('attribute order', () => {
    expect(differs(PAGE.replace('id="go" type="button"', 'type="button" id="go"'))).toBe(false);
  });

  test('JSON-LD reformatting', () => {
    expect(differs(PAGE.replace('{"@type": "WebSite", "name": "The Trail"}',
      '{\n  "@type": "WebSite",\n  "name": "The Trail"\n}'))).toBe(false);
  });
});

describe('catches what a visitor or crawler sees', () => {
  test.each([
    ['visible copy', 'Begin', 'Start'],
    ['the title', '<title>The Trail', '<title>A Trail'],
    ['a meta description', 'A quiet walk', 'A calm walk'],
    ['an aria-label', 'Start walking', 'Begin walking'],
    ['an id', 'id="go"', 'id="start"'],
    ['a class', 'class="sr-only"', 'class="visually-hidden"'],
    ['a script source', 'js/main.min.js', 'js/main.js'],
    ['structured data', '"name": "The Trail"}', '"name": "Trail"}'],
    ['icon geometry', 'l10 6.5', 'l11 6.5'],
    ['an element', '<h1 class="sr-only">The Trail</h1>', '<h2 class="sr-only">The Trail</h2>'],
    ['the language', 'lang="en"', 'lang="en-US"'],
  ])('%s', (_what, from, to) => {
    expect(PAGE.includes(from)).toBe(true);    // the edit really lands
    expect(differs(PAGE.replace(from, to))).toBe(true);
  });
});

describe('reads the page the way it is written', () => {
  test('nests by element and keeps each run of text', () => {
    expect(base.split('\n')).toEqual(expect.arrayContaining([
      '  head',
      '    title',
      '      "The Trail"',
      '    button#go [aria-label="Start walking" type="button"]',
      '      "Begin"',
    ]));
  });

  test('prints long path data as a hash, so the diff stays readable', () => {
    expect(base).toMatch(/path \[d=#[0-9a-f]{10}\]/);
    expect(base).toContain('viewbox="0 0 24 24"');   // short enough to print
  });

  test('a broken edit fails as a broken edit, naming the line', () => {
    expect(() => pageOutline(PAGE.replace('</h1>', '</h2>'), 'trail.html'))
      .toThrow('trail.html:10: </h2> closes <h1>');
    expect(() => pageOutline(PAGE.replace('</body>', ''), 'trail.html'))
      .toThrow(/never closed|closes/);
    expect(() => pageOutline('<p>a < b</p>', 'x.html')).toThrow('stray "<"');
  });
});
