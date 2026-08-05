// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Checks for the shared UI chrome theme (the --ui-* tokens in
 * www/shared/css/styles-1.0.0.css).
 *
 * Every experience shares one welcome screen, loading screen, crosshair,
 * joystick pair, floating button set, and panel family. An experience dresses
 * that chrome to match its world by naming a theme on its <html> element:
 *
 *     <html lang="en" data-ui-theme="garden">
 *
 * The themes are plain CSS, so there is no module to unit test. What can go
 * wrong is a mismatch between the stylesheet and the pages that name it, so
 * these tests read both off disk and hold four promises:
 *
 *  1. Every theme an experience names actually exists in the stylesheet (a
 *     typo would otherwise fail silently, quietly falling back to the
 *     default rather than erroring).
 *  2. Every theme defines the whole token set. A half-override would inherit
 *     the default accent through --ui-accent-rgb and paint the translucent
 *     washes a different color than the solid fills.
 *  3. --ui-accent-rgb really is --ui-accent as an "r, g, b" triple. They are
 *     the same color written twice (custom properties cannot be torn apart
 *     for alpha), so they drift apart easily.
 *  4. Every theme clears its contrast targets against the welcome backdrop.
 *     A theme is chosen to match a world's mood, and the temptation is to
 *     reach for the brand color, which is usually far too dark to read.
 *
 * The min bundle is checked too, so a forgotten `npm run build` fails here
 * rather than shipping a stale stylesheet to visitors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const SHARED_CSS = path.join(WWW, 'shared', 'css', 'styles-1.0.0.css');
const SHARED_MIN_CSS = path.join(WWW, 'shared', 'css', 'styles-1.0.0.min.css');

// Comments are stripped first: the token block is heavily annotated, and the
// prose inside it carries colons, semicolons, and braces that would otherwise
// be read as declarations.
const css = fs.readFileSync(SHARED_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The tokens a theme block must set. --ui-control-hover / --ui-control-active
 *  are deliberately absent: they derive from --ui-accent-rgb, so a theme gets
 *  them for free and only overrides them to tune the button feedback. */
const REQUIRED_TOKENS = [
  '--ui-title',
  '--ui-subtitle',
  '--ui-accent',
  '--ui-accent-rgb',
  '--ui-accent-strong',
  '--ui-on-accent',
];

/** The welcome overlay is rgba(10, 10, 20, 0.85) over the live scene, so the
 *  worst case for contrast is a blown-out white sky showing through: the
 *  lightest the backdrop can ever be. Themes are judged against that. */
const WORST_CASE_BACKDROP = blend([10, 10, 20], 0.85, [255, 255, 255]);

function blend(rgb, alpha, over) {
  return rgb.map((c, i) => c * alpha + over[i] * (1 - alpha));
}

/** Pull the declarations out of the first rule whose selector matches and
 *  whose body mentions the UI tokens, as a { name: value } map. */
function declarationsFor(selectorPattern) {
  const rule = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'g');
  let match;
  while ((match = rule.exec(css)) !== null) {
    if (!match[1].includes('--ui-title')) continue;
    const declarations = {};
    for (const line of match[1].split(';')) {
      const [name, ...rest] = line.split(':');
      if (rest.length) declarations[name.trim()] = rest.join(':').trim();
    }
    return declarations;
  }
  return null;
}

/** Every named theme in the stylesheet, as { name: { token: value } }. */
function readThemes() {
  const themes = {};
  const block = /\[data-ui-theme="([a-z-]+)"\]\s*\{([^}]*)\}/g;
  let match;
  while ((match = block.exec(css)) !== null) {
    const declarations = {};
    for (const line of match[2].split(';')) {
      const [name, ...rest] = line.split(':');
      if (rest.length) declarations[name.trim()] = rest.join(':').trim();
    }
    themes[match[1]] = declarations;
  }
  return themes;
}

/** Experience folders that ship a page, with the theme each one names (null
 *  when it stays on the default). */
function readExperiences() {
  return fs.readdirSync(WWW, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .map((entry) => path.join(WWW, entry.name, 'index.html'))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const html = fs.readFileSync(file, 'utf8');
      const tag = html.match(/<html\b[^>]*>/);
      const theme = tag && tag[0].match(/data-ui-theme="([^"]*)"/);
      return { name: path.basename(path.dirname(file)), theme: theme ? theme[1] : null };
    });
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/** WCAG 2.x relative luminance. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Parse an "r, g, b" token value, or null when it is a var() reference. */
function parseTriple(value) {
  if (!value || value.includes('var(')) return null;
  const parts = value.split(',').map((n) => Number(n.trim()));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : null;
}

/** Hue in degrees, and saturation, of an rgb triple (HSL). */
function hueAndSaturation([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const span = max - min;
  if (span === 0) return { hue: 0, saturation: 0 };
  let hue;
  if (max === rn) hue = 60 * (((gn - bn) / span) % 6);
  else if (max === gn) hue = 60 * ((bn - rn) / span + 2);
  else hue = 60 * ((rn - gn) / span + 4);
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  return { hue, saturation: span / (1 - Math.abs(2 * lightness - 1)) };
}

const themes = readThemes();
const experiences = readExperiences();
const defaults = declarationsFor(':root');

test('the stylesheet defines the default UI tokens', () => {
  expect(defaults).not.toBeNull();
  for (const token of REQUIRED_TOKENS) {
    expect(defaults[token]).toBeDefined();
  }
});

test('the stylesheet defines at least one named theme', () => {
  expect(Object.keys(themes).length).toBeGreaterThan(0);
});

test('the experiences are discovered', () => {
  expect(experiences.length).toBeGreaterThan(0);
});

describe.each(experiences)('www/$name', ({ theme }) => {
  test('names a theme the stylesheet defines, or none at all', () => {
    if (theme === null) return;                    // stays on the default
    expect(Object.keys(themes)).toContain(theme);
  });
});

// The default palette is a theme like any other for these purposes.
const palettes = Object.entries({ default: defaults, ...themes });

describe.each(palettes)('the %s theme', (name, tokens) => {
  test('defines the whole token set', () => {
    for (const token of REQUIRED_TOKENS) {
      expect(tokens[token]).toBeDefined();
    }
  });

  test('states the accent as a matching rgb triple', () => {
    const hex = hexToRgb(tokens['--ui-accent']);
    expect(hex).not.toBeNull();
    const triple = tokens['--ui-accent-rgb'].split(',').map((n) => Number(n.trim()));
    expect(triple).toEqual(hex);
  });

  test('reads clearly on the welcome backdrop', () => {
    // 7:1 for the title and 4.5:1 for the subtitle: AAA and AA body text,
    // measured against the lightest the backdrop can get.
    expect(contrast(hexToRgb(tokens['--ui-title']), WORST_CASE_BACKDROP)).toBeGreaterThanOrEqual(7);
    expect(contrast(hexToRgb(tokens['--ui-subtitle']), WORST_CASE_BACKDROP)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps its joysticks out of the pink band', () => {
    // The mobile joysticks are a pair of filled circles sat low on the
    // screen, one on each side. In pink and flesh tones that arrangement
    // reads as anatomy rather than as controls, so a theme in that part of
    // the spectrum overrides --ui-joystick-rgb with something cooler and
    // leaves the rest of its palette alone. Unset, the joysticks inherit
    // the accent, which is what this guards.
    const joystick = parseTriple(tokens['--ui-joystick-rgb'])
      || parseTriple(tokens['--ui-accent-rgb']);
    expect(joystick).not.toBeNull();
    const { hue, saturation } = hueAndSaturation(joystick);
    if (saturation < 0.15) return;               // near-grey, no hue to speak of
    expect(hue > 12 && hue < 300).toBe(true);
  });

  test('keeps its accent chips legible', () => {
    // The controls-hint chips print --ui-on-accent on a solid --ui-accent
    // fill at a small size, so they want AA body contrast.
    const pair = contrast(hexToRgb(tokens['--ui-accent']), hexToRgb(tokens['--ui-on-accent']));
    expect(pair).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the built stylesheet', () => {
  const min = fs.readFileSync(SHARED_MIN_CSS, 'utf8');

  test('carries every named theme (catches a skipped npm run build)', () => {
    for (const name of Object.keys(themes)) {
      // The minifier is free to drop the quotes around an identifier value.
      expect(min).toMatch(new RegExp(`\\[data-ui-theme=["']?${name}["']?\\]`));
    }
  });
});

describe('the shared chrome reads from the tokens', () => {
  // Guards the whole point of the exercise: these rules used to hard-code the
  // slate blue, and a future edit could quietly put it back.
  test.each([
    ['#instructions .title', '--ui-title'],
    ['#instructions .subtitle', '--ui-subtitle'],
    ['.loader-title', '--ui-title'],
    ['.controls-hint span', '--ui-accent'],
  ])('%s uses var(%s)', (selector, token) => {
    const rule = new RegExp(`${selector.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const match = rule.exec(css);
    expect(match).not.toBeNull();
    expect(match[1]).toContain(`var(${token})`);
  });
});
