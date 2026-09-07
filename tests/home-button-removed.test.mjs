// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The floating Home button, and the shape of the top-right cluster it used
 * to anchor.
 *
 * WHY THIS FILE EXISTS. Five experiences (automan, jamar, interstate,
 * seedtoseed, sunnyvalejenn) had their Home button removed; the other nine
 * kept theirs. That split is a decision, not an accident, and nothing in the
 * code says so: the button is fourteen copies of the same markup, so it can
 * be pasted back into one page, or quietly deleted from another, and every
 * other suite stays green.
 *
 * The removal also leaves a SECOND thing that no other test can see. The
 * shared sheet lays the floats out in fixed 62px slots measured from the
 * right edge (a 50px button plus a 12px gap), and it assumes Home is sitting
 * in the first one. Pull Home out and every remaining float has to move up a
 * slot, or the corner keeps a button-shaped hole in it. A hole is invisible
 * to every unit test in the repository and shows up only in a screenshot,
 * which is exactly the class of defect this project keeps paying QA rounds
 * for.
 *
 * So the invariant asserted here is the one a person would check by eye:
 *
 *     the right-hand cluster occupies slots 20, 82, 144, ... with no gap
 *     at the corner and no two buttons on the same slot.
 *
 * It is resolved from the stylesheets the page actually loads (the .min
 * builds, so a source edit that was never built is caught too) rather than
 * from a hard-coded table, so it keeps working when a scene gains a float.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);

const WITHOUT_HOME = ['automan', 'interstate', 'jamar', 'seedtoseed', 'sunnyvalejenn'];
const WITH_HOME = ['dad', 'earthdefense', 'family', 'garden', 'gavin', 'highwater',
  'mandelbrot', 'roqui', 'steve'];
const ALL = [...WITHOUT_HOME, ...WITH_HOME].sort();

/** The slot pitch the shared sheet is built on: a 50px button plus a 12px gap. */
const SLOT_PITCH = 62;
const FIRST_SLOT = 20;

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

/** The scene's floats, split into the top-RIGHT cluster (positioned by a
 *  pixel `right`) and everything else (the autopilot toggle, which lives in
 *  the top-left corner with `right: auto`). */
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
  return {
    html,
    right: rows
      .filter((r) => /^-?\d+px$/.test(r.right || ''))
      .map((r) => ({ id: r.id, slot: parseInt(r.right, 10) })),
  };
}

// ---- The tests ------------------------------------------------------------

test('the five experiences that ship without a Home button have no trace of one', async () => {
  for (const scene of WITHOUT_HOME) {
    const files = ['index.html', 'js/main.js', 'js/main.min.js'];
    for (const f of files) {
      const text = await read(`www/${scene}/${f}`);
      // Named so a failure says which page and which file grew one back.
      expect(`${scene}/${f}: ${text.includes('home-btn')}`)
        .toBe(`${scene}/${f}: false`);
    }
  }
});

test('the other nine still have theirs, so this was a removal and not a drift', async () => {
  for (const scene of WITH_HOME) {
    const html = await read(`www/${scene}/index.html`);
    expect(`${scene}: ${html.includes('id="home-btn"')}`).toBe(`${scene}: true`);
  }
});

test('every skip link points at an id that exists on its own page', async () => {
  // The five removals broke this the moment the button left the markup: all
  // fourteen skip links pointed at #home-btn, and it is the FIRST thing a
  // keyboard visitor reaches. A skip link to a missing target moves focus
  // nowhere at all, which is worse than not offering one.
  for (const scene of ALL) {
    const html = await read(`www/${scene}/index.html`);
    const m = /<a class="skip-link" href="#([^"]+)"/.exec(html);
    if (!m) {
      // Legitimate only when the page has no float left to skip TO (jamar).
      const { right } = await cluster(scene);
      expect(`${scene} has no skip link and no floats: ${right.length === 0}`)
        .toBe(`${scene} has no skip link and no floats: true`);
      continue;
    }
    expect(`${scene} -> #${m[1]} exists: ${html.includes(`id="${m[1]}"`)}`)
      .toBe(`${scene} -> #${m[1]} exists: true`);
  }
});

test('the top-right cluster fills the corner, with no hole and no two on a slot', async () => {
  // THE POINT OF THIS FILE. Removing Home without moving the floats beside it
  // leaves the corner empty and everything else one slot out; moving them too
  // far stacks two buttons on the same 50 pixels. Neither throws, neither
  // fails another suite, and both are obvious the instant somebody looks at
  // the page. So look at it here instead.
  for (const scene of ALL) {
    const { right } = await cluster(scene);
    const slots = right.map((r) => r.slot).sort((a, b) => a - b);
    const expected = slots.map((_, i) => FIRST_SLOT + i * SLOT_PITCH);
    expect(`${scene}: ${JSON.stringify(slots)}`)
      .toBe(`${scene}: ${JSON.stringify(expected)}`);
  }
});
