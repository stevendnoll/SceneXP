// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The retired Home button, the directory link that replaced it, and the shape
 * of the top-right cluster it used to anchor.
 *
 * WHY THIS FILE EXISTS. All fourteen scenes carried a floating Home button in
 * the corner. Visitors read it as "reset this view", tapped it, arrived at the
 * SceneXP directory, and left the site rather than going back to the scene, so
 * on 2026-09-07 it was removed everywhere. Nine of the fourteen gained a named
 * link at the foot of their welcome screen in its place; the five that had
 * already lost the button (automan, interstate, jamar, seedtoseed,
 * sunnyvalejenn) deliberately did not. That split is a decision, and nothing
 * else in the code records it: the button was fourteen copies of the same
 * markup, so it can be pasted back into one page and every other suite stays
 * green.
 *
 * THREE THINGS HERE ARE INVISIBLE TO EVERY OTHER TEST, and all three are
 * invisible in a screenshot too:
 *
 * 1. THE SLOT LADDER. The shared sheet lays floats out on a 62px pitch from
 *    the right edge (a 50px button plus a 12px gap) and used to assume Home
 *    held the first slot. Pull Home out without re-basing and every corner
 *    keeps a button-shaped hole; re-base too far and two buttons stack on the
 *    same 50 pixels.
 *
 * 2. THE OVERLAY SHIELD. Seven welcome overlays are one big click-to-start
 *    surface, and several call preventDefault() on the touchend that starts
 *    them, which suppresses the synthetic click. A link on such an overlay
 *    without shieldOverlayControl() is not slightly wrong: on a phone it does
 *    nothing at all except start the scene, and it looks exactly like a link
 *    that works.
 *
 * 3. THE DISMISSED OVERLAY'S TAB ORDER. `#blocker.hidden` was opacity plus
 *    pointer-events, which leaves everything inside it focusable while
 *    invisible. Adding a link to nine welcome screens without fixing that
 *    would have put an invisible tab stop on every one.
 *
 * The ladder is resolved from the .min sheets the page actually loads, so a
 * source edit that was never built is caught too.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);

/** The nine that traded the floating button for a welcome-screen link. */
const WITH_LINK = ['dad', 'earthdefense', 'family', 'garden', 'gavin', 'highwater',
  'mandelbrot', 'roqui', 'steve'];
/** The five stripped first, which deliberately carry no directory link. */
const WITHOUT_LINK = ['automan', 'interstate', 'jamar', 'seedtoseed', 'sunnyvalejenn'];
const ALL = [...WITH_LINK, ...WITHOUT_LINK].sort();

/** High Water's card is not a click-to-start surface: the only way past it is
 *  its Begin button, so its link needs no shield and deliberately has none. */
const NO_SHIELD_NEEDED = ['highwater'];

const SLOT_PITCH = 62;   // a 50px button plus a 12px gap
const FIRST_SLOT = 20;   // the corner

// ---- A very small CSS reader ---------------------------------------------
//
// Enough to answer "what is this element's `right` when the page first
// paints", and no more. @media blocks are skipped on purpose: the cluster's
// layout is the unconditional one, and the only float any breakpoint touches
// is .settings-btn, whose `left`/`width` are re-settled by a later
// unconditional rule anyway.

/** Split a stylesheet into its top-level (non-at-rule) rules, in source order. */
function topLevelRules(css) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open === -1) break;
    const selector = s.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < s.length && depth > 0) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') depth--;
      j++;
    }
    if (!selector.startsWith('@')) out.push({ selector, body: s.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

/** Ids and classes named by a compound selector such as `#biz-btn.biz-btn`. */
function parts(sel) {
  return {
    ids: [...sel.matchAll(/#([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
    cls: [...sel.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
  };
}

/** Does this compound selector match the element? Combinators, pseudos, and
 *  attribute selectors are treated as "no": the float rules never use one to
 *  set an offset, and a false match would be worse than a missed one. */
function matches(sel, id, classes) {
  if (!sel || /[\s>+~:[*]/.test(sel)) return false;
  const { ids, cls } = parts(sel);
  if (ids.length > 1) return false;
  if (ids.length === 1 && ids[0] !== id) return false;
  return cls.length > 0 || ids.length > 0
    ? cls.every((c) => classes.includes(c))
    : false;
}

/** The winning declaration for `prop`, by (ids, classes, source order). */
function resolve(rules, prop, id, classes) {
  let best = null;
  rules.forEach((rule, order) => {
    for (const sel of rule.selector.split(',').map((s) => s.trim())) {
      if (!matches(sel, id, classes)) continue;
      const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g');
      let m;
      let last = null;
      while ((m = re.exec(rule.body))) last = m[1].trim();
      if (last === null) continue;
      const { ids, cls } = parts(sel);
      const spec = [ids.length, cls.length, order];
      const wins = !best
        || spec[0] > best.spec[0]
        || (spec[0] === best.spec[0] && spec[1] > best.spec[1])
        || (spec[0] === best.spec[0] && spec[1] === best.spec[1] && spec[2] > best.spec[2]);
      if (wins) best = { value: last, spec };
    }
  });
  return best && best.value;
}

// ---- Reading a page -------------------------------------------------------

const read = (rel) => readFile(new URL(rel, ROOT), 'utf8');

/** Every .ui-float in the markup, with its id and class list. */
function floatsIn(html) {
  const out = [];
  for (const m of html.matchAll(/<(?:a|button)\s([^>]*?)>/gs)) {
    const cm = /class="([^"]*)"/.exec(m[1]);
    if (!cm) continue;
    const classes = cm[1].split(/\s+/).filter(Boolean);
    if (!classes.includes('ui-float')) continue;
    const im = /id="([^"]*)"/.exec(m[1]);
    out.push({ id: im ? im[1] : '', classes });
  }
  return out;
}

/** The scene's top-RIGHT cluster: the floats positioned by a pixel `right`.
 *  Anything else (the autopilot toggle, which lives top-left with
 *  `right: auto`) is not part of the ladder. */
async function cluster(scene) {
  const html = await read(`www/${scene}/index.html`);
  const sheets = [await read('www/shared/css/styles-1.0.0.min.css')];
  const local = new URL(`www/${scene}/css/experience.min.css`, ROOT);
  if (existsSync(local)) sheets.push(await readFile(local, 'utf8'));
  const rules = sheets.flatMap(topLevelRules);

  const rows = floatsIn(html).map((f) => ({
    id: f.id,
    right: resolve(rules, 'right', f.id, f.classes),
  }));
  return rows
    .filter((r) => /^-?\d+px$/.test(r.right || ''))
    .map((r) => ({ id: r.id, slot: parseInt(r.right, 10) }));
}

// ---- The tests ------------------------------------------------------------

test('not one of the fourteen scenes has a Home button left', async () => {
  for (const scene of ALL) {
    for (const f of ['index.html', 'js/main.js', 'js/main.min.js']) {
      const text = await read(`www/${scene}/${f}`);
      // Named so a failure says which page and which file grew one back.
      expect(`${scene}/${f}: ${text.includes('home-btn')}`)
        .toBe(`${scene}/${f}: false`);
    }
  }
});

test('the nine carry the directory link, and the five deliberately do not', async () => {
  for (const scene of WITH_LINK) {
    const html = await read(`www/${scene}/index.html`);
    expect(`${scene}: ${html.includes('id="explore-link"')}`).toBe(`${scene}: true`);
  }
  for (const scene of WITHOUT_LINK) {
    const html = await read(`www/${scene}/index.html`);
    expect(`${scene}: ${html.includes('id="explore-link"')}`).toBe(`${scene}: false`);
  }
});

test('the directory link opens in a new tab and says where it goes', async () => {
  // A NEW TAB IS THE WHOLE POINT. Home failed because following it cost the
  // visitor the scene they were in and they did not come back; a link that
  // leaves this tab alone cannot repeat that. `rel="noopener"` comes with
  // target="_blank" as a matter of course.
  //
  // AND IT NAMES ITSELF. The old button was an icon with an aria-label, so
  // nothing on screen said where it went, which is half of why it was read as
  // a reset. The text has to carry the destination.
  for (const scene of WITH_LINK) {
    const html = await read(`www/${scene}/index.html`);
    const m = /<a id="explore-link"[\s\S]{0,400}?<\/a>/.exec(html);
    expect(`${scene} has a link: ${Boolean(m)}`).toBe(`${scene} has a link: true`);
    const tag = m[0];
    expect(`${scene} new tab: ${tag.includes('target="_blank"')}`)
      .toBe(`${scene} new tab: true`);
    expect(`${scene} noopener: ${/rel="[^"]*noopener/.test(tag)}`)
      .toBe(`${scene} noopener: true`);
    expect(`${scene} names the site: ${tag.includes('SceneXP.com')}`)
      .toBe(`${scene} names the site: true`);
    // The accessible name has to warn about the new tab, the way the featured
    // business buttons already do.
    expect(`${scene} warns: ${/aria-label="[^"]*opens in a new tab/.test(tag)}`)
      .toBe(`${scene} warns: true`);
  }
});

test('every directory link on a click-to-start overlay is shielded from it', async () => {
  // THE SILENT ONE. Without shieldOverlayControl the overlay's own start
  // handler fires on the way out of the link, and on touch its
  // preventDefault() suppresses the synthetic click entirely, so the link
  // does nothing but start the scene. It looks like a working link and it
  // fails only on a phone, which is where most of these are opened.
  for (const scene of WITH_LINK) {
    const main = await read(`www/${scene}/js/main.js`);
    const wants = !NO_SHIELD_NEEDED.includes(scene);
    const has = /shieldOverlayControl\(\s*document\.getElementById\('explore-link'\)/.test(main);
    expect(`${scene} shielded: ${has}`).toBe(`${scene} shielded: ${wants}`);
    if (wants) {
      expect(`${scene} imports it: ${main.includes('shieldOverlayControl,') || main.includes('shieldOverlayControl }')}`)
        .toBe(`${scene} imports it: true`);
    }
  }
});

test('a dismissed welcome overlay leaves the tab order with it', async () => {
  // `opacity: 0` hides an overlay from the eye and from nothing else, so
  // every control inside a dismissed one stayed focusable and invisible.
  // `visibility: hidden` is what takes descendants out of the tab order and
  // the accessibility tree while still allowing the fade.
  const css = await read('www/shared/css/styles-1.0.0.min.css');
  const rule = /#blocker\.hidden\{([^}]*)\}/.exec(css);
  expect(`the rule exists: ${Boolean(rule)}`).toBe('the rule exists: true');
  expect(`hides visibility: ${/visibility:\s*hidden/.test(rule[1])}`)
    .toBe('hides visibility: true');
  // And the fade survives it: with no delay on the visibility transition the
  // card vanishes on the first frame instead of fading out.
  expect(`fade kept: ${/visibility\s*0s\s+linear\s*\.?3s|visibility\s*0s\s+linear\s*0\.3s/.test(rule[1])}`)
    .toBe('fade kept: true');
});

test('every skip link points at an id that exists on its own page', async () => {
  // Retiring Home broke this on all fourteen at once: every skip link pointed
  // at #home-btn, and it is the FIRST thing a keyboard visitor reaches. A skip
  // link to a missing target moves focus nowhere, which is worse than not
  // offering one.
  for (const scene of ALL) {
    const html = await read(`www/${scene}/index.html`);
    const m = /<a class="skip-link" href="#([^"]+)"/.exec(html);
    if (!m) {
      // Legitimate only when the page has no float to skip TO on arrival.
      // garden is the subtle one: it HAS two, and hides both while the
      // welcome card is up, which is exactly when a skip link is used.
      const slots = await cluster(scene);
      const hidden = scene === 'garden';
      expect(`${scene} has no skip link and nothing to skip to: ${slots.length === 0 || hidden}`)
        .toBe(`${scene} has no skip link and nothing to skip to: true`);
      continue;
    }
    expect(`${scene} -> #${m[1]} exists: ${html.includes(`id="${m[1]}"`)}`)
      .toBe(`${scene} -> #${m[1]} exists: true`);
  }
});

test('the top-right cluster fills the corner, with no hole and no two on a slot', async () => {
  // Removing Home without moving the floats beside it leaves the corner empty
  // and everything else one slot out; moving them too far stacks two buttons
  // on the same 50 pixels. Neither throws, neither fails another suite, and
  // both are obvious the instant somebody looks at the page. So look at it
  // here instead.
  for (const scene of ALL) {
    const slots = (await cluster(scene)).map((r) => r.slot).sort((a, b) => a - b);
    const expected = slots.map((_, i) => FIRST_SLOT + i * SLOT_PITCH);
    expect(`${scene}: ${JSON.stringify(slots)}`)
      .toBe(`${scene}: ${JSON.stringify(expected)}`);
  }
});
