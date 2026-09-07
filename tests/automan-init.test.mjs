// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for John Walker's showroom, exercising store.js over the
 * shared parts library plus the experience's own builders: the glass frontage
 * and the lot beyond it, the desk with its deal sheet and the dealer's screen,
 * the three figures seated around it, the waiting area, and the skyline across
 * the road.
 *
 * Under the chainable THREE proxy nothing renders, but every function a real
 * page load would call does run, so a missing import or a reference left
 * behind by a refactor throws here rather than on the live site.
 *
 * The pure half asserts the things this scene decided ON PURPOSE and would
 * lose silently. It is a fixed camera composed for one view, so the layout is
 * only numbers until something reads them as a composition. And it is the one
 * experience with no welcome overlay, whose arrival panel and coach halos and
 * card-arming all exist to solve problems that left no trace in the markup.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

const src = (name) => readFile(new URL(`../www/automan/${name}`, import.meta.url), 'utf8');

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

test('the whole showroom builds and holds a working afternoon', async () => {
  jest.resetModules();
  // The BUILT shared modules, because store.js resolves its imports to the
  // .min.js files and module state has to be shared with what is driven here.
  // This is why `npm run build` runs before `npm test`.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/automan/js/store.js');
  const { AUTOMAN_CONFIG } = await import('../www/automan/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, AUTOMAN_CONFIG);
  const showroom = store.initStore();
  expect(showroom).toBeTruthy();
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('showroom');
  expect(store.getShowroomGroup()).toBe(showroom);

  // The tap targets are registered: the three people plus the props.
  expect(world.getOutdoorPropMeshes().length).toBeGreaterThanOrEqual(15);

  // Half a minute at the desk: the dealer types and leans at his screen, John
  // turns to his customer and back, a car crosses the lot, and the clock runs.
  for (let i = 0; i < 1500; i++) store.updateShowroom(0.02);
});

test('every registered prop kind has a story, and every story has a prop', async () => {
  // main.js says in a comment that this test enforces the pairing, so it had
  // better. The build stub absorbs userData writes, so the wiring can only be
  // read where it is written, in the source text.
  const [storeText, mainText] = await Promise.all([src('js/store.js'), src('js/main.js')]);

  const registered = new Set(
    [...storeText.matchAll(/registerOutdoorProp\([^;]*?'(\w+)'\)/g)].map((m) => m[1])
  );
  // The three figures register through a variable rather than a literal, so
  // they never appear in that sweep and are added here from their own list.
  const personOrder = storeText.match(/const PERSON_ORDER = \[([^\]]*)\]/);
  expect(personOrder).not.toBeNull();
  for (const m of personOrder[1].matchAll(/'(\w+)'/g)) registered.add(m[1]);
  expect(registered.size).toBeGreaterThanOrEqual(16);

  const contentBlock = mainText.match(/const PROP_CONTENT = \{([\s\S]*?)\n\};/);
  expect(contentBlock).not.toBeNull();
  const contentKinds = new Set(
    [...contentBlock[1].matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1])
  );

  // Every tappable thing tells a story, and no story is orphaned.
  expect([...registered].sort()).toEqual([...contentKinds].sort());

  // Two lines per prop, so a second tap gives something new.
  expect([...contentBlock[1].matchAll(/lines: \[/g)]).toHaveLength(contentKinds.size);
});

test('each of the three people has a contact card of their own', async () => {
  // D40: whoever the visitor tapped is who looks back at them. A person with
  // no entry here would fall through to somebody else's face and pitch, which
  // is the exact mistake that decision was written to stop.
  const mainText = await src('js/main.js');
  const persons = mainText.match(/const PERSON_KINDS = \[([^\]]*)\]/);
  expect(persons).not.toBeNull();
  const kinds = [...persons[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  expect(kinds).toEqual(['john', 'customer', 'dealer']);

  const cards = mainText.match(/const CONTACT_CARDS = \{([\s\S]*?)\n\};/);
  expect(cards).not.toBeNull();
  const cardKeys = [...cards[1].matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1]);
  for (const kind of kinds) {
    expect(`${kind} has a card: ${cardKeys.includes(kind)}`).toBe(`${kind} has a card: true`);
  }

  // Only John's card carries the photograph. The other two sit for a portrait
  // taken from the scene itself, so his face never stands in for theirs.
  const rendered = mainText.match(/const RENDERED_FACES = \{([\s\S]*?)\n\};/);
  expect(rendered).not.toBeNull();
  const posed = [...rendered[1].matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]).sort();
  expect(posed).toEqual(kinds.filter((k) => k !== 'john').sort());
});

test('a card never opens with its primary action already focused', async () => {
  // THE CARD OPENS UNDER THE FINGER. A tap on John lands where a centered
  // modal is about to appear, so a focused Call button turned one tap into a
  // phone call, and a stray Enter did the same. Every opener arms the ghost
  // swallow first, and the contact card takes focus on its own container.
  const mainText = await src('js/main.js');

  // The arming window exists and is a real delay, not zero.
  const arm = mainText.match(/const CARD_ARM_MS = (\d+)/);
  expect(arm).not.toBeNull();
  expect(Number(arm[1])).toBeGreaterThanOrEqual(300);

  // Every place that reveals a card arms it first. Counted rather than
  // spot-checked, because the failure is a NEW opener that forgets to.
  const reveals = [...mainText.matchAll(/\.classList\.remove\('hidden'\)/g)];
  expect(reveals.length).toBeGreaterThan(0);
  expect([...mainText.matchAll(/\barmCard\(\)/g)].length).toBeGreaterThanOrEqual(reveals.length);

  // The contact card leads with its container, never the call button.
  expect(mainText).toMatch(/nudgeModal\.querySelector\('\.modal-container'\)/);
  expect(mainText).not.toMatch(/(?:call|phone|tel)Btn\.focus\(\)/i);

  // And the swallow only ever fires for a pointer, so a keyboard visitor who
  // tabbed to a control is never robbed of their Enter.
  expect(mainText).toMatch(/if \(!event\.detail\) return;/);
});

test('the contact details are never spelled out in the source', async () => {
  // D3: the phone and the email are stored in pieces and assembled only after
  // the proof of work resolves, so a scraper grepping the served files for
  // either pattern comes away with nothing. Splitting them is easy to undo by
  // accident during a debug session, and nothing on screen would look wrong.
  const files = await Promise.all(
    ['js/config.js', 'js/config.min.js', 'js/main.js', 'js/main.min.js', 'index.html'].map(src)
  );
  const PHONE = /\b\d{3}[.\-\s]?\d{3}[.\-\s]?\d{4}\b/;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  for (const [i, text] of files.entries()) {
    const name = ['config.js', 'config.min.js', 'main.js', 'main.min.js', 'index.html'][i];
    expect(`${name} phone: ${PHONE.test(text)}`).toBe(`${name} phone: false`);
    expect(`${name} email: ${EMAIL.test(text)}`).toBe(`${name} email: false`);
  }
});

describe('the composition and config (pure)', () => {
  let T;
  let CFG;

  beforeEach(async () => {
    jest.resetModules();
    T = (await import('../www/automan/js/store.js')).__test__;
    CFG = (await import('../www/automan/js/config.js')).AUTOMAN_CONFIG;
  });

  test('the config is frozen all the way down', () => {
    expect(Object.isFrozen(CFG)).toBe(true);
    expect(Object.isFrozen(CFG.camera)).toBe(true);
    expect(Object.isFrozen(CFG.camera.portrait)).toBe(true);
    expect(Object.isFrozen(CFG.site.contact)).toBe(true);
  });

  test('the passive contract, and a day that never turns', () => {
    // No walking, no checklist, no autopilot: the visitor's only job is to
    // watch someone good at this do it. The day and night cycle is OFF BY
    // DECISION rather than by omission, because a showroom that slid into
    // evening while somebody read a card was worse, not richer.
    expect(CFG.spawn).toBeUndefined();
    expect(CFG.worldBounds).toBeUndefined();
    expect(CFG.checklist).toBeUndefined();
    expect(CFG.rootName).toBe('showroom');
    expect(CFG.dayNight.enabled).toBe(false);
    expect(CFG.comet.enabled).toBe(false);
    expect(CFG.zombiesAtNight).toBe(false);
  });

  test('the building block mirrors the room for the shared lighting rig', () => {
    const R = T.LAYOUT.room;
    expect(CFG.building.width).toBeCloseTo(R.maxX - R.minX, 6);
    expect(CFG.building.depth).toBeCloseTo(R.maxZ - R.minZ, 6);
    expect(CFG.building.height).toBeCloseTo(R.height, 6);
  });

  test('the fixed camera stands in the showroom and is aimed at the deal sheet', () => {
    const cam = CFG.camera;
    const R = T.LAYOUT.room;
    [cam.position, cam.lookAt].forEach((v) => {
      [v.x, v.y, v.z].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    });
    // The eye is inside the room, at standing height.
    expect(cam.position.x).toBeGreaterThan(R.minX);
    expect(cam.position.x).toBeLessThan(R.maxX);
    expect(cam.position.z).toBeGreaterThan(R.minZ);
    expect(cam.position.z).toBeLessThan(R.maxZ);
    expect(cam.position.y).toBeGreaterThan(1);
    expect(cam.position.y).toBeLessThan(R.height);
    // THE DEAL IS THE SUBJECT. The lookAt is the deal sheet on the desk, not
    // the room's centre and not a face, so the paper the argument is about is
    // what the frame is built around.
    expect(cam.lookAt.x).toBeCloseTo(T.LAYOUT.dealSheet.x, 6);
    expect(cam.lookAt.z).toBeCloseTo(T.LAYOUT.dealSheet.z, 6);
    expect(cam.fov).toBeGreaterThanOrEqual(30);
    expect(cam.fov).toBeLessThanOrEqual(90);
  });

  test('a portrait frame still holds all three figures', () => {
    // A PHONE HELD UPRIGHT SEES A THIRD OF THE DESKTOP WIDTH, so portrait
    // gets a wider lens and a dolly back, sized from the widest figure offset
    // rather than guessed. Losing either would crop somebody out of the shot
    // on the device most visitors arrive on.
    const p = CFG.camera.portrait;
    expect(p.fov).toBeGreaterThan(CFG.camera.fov);
    expect(p.minHalfWidth).toBeGreaterThan(0);
    // Every figure fits inside the half-width the dolly is sized for.
    const L = T.LAYOUT;
    for (const kind of ['john', 'customer', 'dealer']) {
      const dx = Math.abs(L[kind].x - CFG.camera.lookAt.x);
      expect(`${kind} within the portrait half-width: ${dx <= p.minHalfWidth}`)
        .toBe(`${kind} within the portrait half-width: true`);
    }
  });

  test('John sits on the buyer\'s side of the desk, which is the whole premise', () => {
    // If John ever ends up behind the desk with the dealer, the scene argues
    // the opposite of what the page says. The desk is the dividing line.
    const L = T.LAYOUT;
    const deskFront = L.desk.z + L.desk.d / 2;
    const deskBack = L.desk.z - L.desk.d / 2;
    expect(L.dealer.z).toBeLessThan(deskBack);
    expect(L.customer.z).toBeGreaterThan(deskFront);
    expect(L.john.z).toBeGreaterThan(L.dealer.z);
    // And all three are in the room, clear of the walls.
    for (const kind of ['john', 'customer', 'dealer']) {
      expect(L[kind].x).toBeGreaterThan(L.room.minX);
      expect(L[kind].x).toBeLessThan(L.room.maxX);
      expect(L[kind].z).toBeGreaterThan(L.room.minZ);
      expect(L[kind].z).toBeLessThan(L.room.maxZ);
    }
  });

  test('seated figures land their hips just above the cushion', () => {
    // seatHeightY drops a feet-origin rig so the fold lands on the seat:
    // seatTop plus a small hover, less the shared rig's 0.75 leg length
    // times the figure's scale. Three figures sit in this scene and all
    // three are scaled differently, so the scale term is load bearing.
    const seat = T.LAYOUT.chairSeatTop;
    expect(T.seatHeightY(seat, 1)).toBeCloseTo(seat + 0.05 - 0.75, 6);
    expect(T.seatHeightY(seat, 1.08)).toBeCloseTo(seat + 0.05 - 0.75 * 1.08, 6);
    // A taller figure drops further, so the fold still lands on the seat.
    expect(T.seatHeightY(seat, 1.08)).toBeLessThan(T.seatHeightY(seat, 1));
  });

  test('the proof-of-work cache is shared across experiences', () => {
    expect(CFG.proofOfWork.storageKey).toBe('gallery-pow');
    expect(CFG.proofOfWork.prefix).toBe('11');
  });

  test('the site block honors John and carries his offer', () => {
    expect(CFG.site.honoree.label).toBe('John Walker');
    expect(CFG.site.business.name).toBe('John Walker, The Auto Man');
    expect(CFG.site.home.path).toBe('/');
    expect(CFG.site.builder.contactPath).toBe('/contact.html');
    expect(CFG.site.share.title).toContain('Auto Man');
    // The contact pieces are pieces, not whole values.
    expect(CFG.site.contact.phoneParts.length).toBeGreaterThan(1);
    expect(CFG.site.contact.emailParts.length).toBeGreaterThan(1);
  });
});


describe('the primary action wears one gold, everywhere it appears (D42)', () => {
  /* THE RULE THIS GUARDS, in Steve's words: use the Call button's colouring
   * wherever we have a primary button. It replaced D25's "one filled control
   * on the whole page", which had left the intro panel and both cards asking
   * with a hairline; QA read the intro panel's pair as two equal options
   * rather than as an ask and an aside.
   *
   * A rule like this rots quietly. The next primary button gets its own
   * gradient pasted in, or an id rule quietly outranks the shared class and
   * one of the four drifts, and neither shows up anywhere but a screenshot of
   * the one card nobody reopened. */

  /** Every button that IS the primary action of the surface it sits on. */
  const PRIMARIES = ['intro-contact', 'poster-cta', 'dialog-cta', 'contact-call'];
  /** Controls that are deliberately NOT filled: an aside, and two ways out. */
  const NOT_PRIMARY = ['intro-about', 'intro-handle', 'dialog-dismiss'];

  const RESTING = 'linear-gradient(180deg, var(--lux-gold-lift) 0%, var(--lux-gold) 100%)';

  test('all four primaries carry the class, and nothing else does', async () => {
    const html = await src('index.html');
    for (const id of PRIMARIES) {
      const tag = new RegExp(`<(?:a|button)[^>]*id="${id}"[^>]*>`).exec(html);
      expect(`${id} present: ${Boolean(tag)}`).toBe(`${id} present: true`);
      expect(`${id} primary: ${/class="[^"]*\blux-primary\b/.test(tag[0])}`)
        .toBe(`${id} primary: true`);
    }
    for (const id of NOT_PRIMARY) {
      const tag = new RegExp(`<(?:a|button)[^>]*id="${id}"[^>]*>`).exec(html);
      expect(`${id} primary: ${/class="[^"]*\blux-primary\b/.test(tag[0])}`)
        .toBe(`${id} primary: false`);
    }
  });

  test('there is ONE gold to change, not four', async () => {
    // The point of lifting the finish out of #contact-call. A second copy of
    // this gradient means a future tweak moves three buttons and leaves one.
    const css = await src('css/experience.css');
    const copies = css.split(RESTING).length - 1;
    expect(`resting gradient declared ${copies} time(s)`)
      .toBe('resting gradient declared 1 time(s)');
  });

  test('no id rule re-declares the finish, which would silently outrank it', async () => {
    // .lux-primary is a class (0,1,0). Any rule carrying an id beats it, so an
    // `#dialog-cta { background: ... }` added later would take that one button
    // back out of the system without failing anything else. Geometry in an id
    // rule is fine and expected; the finish is not.
    const css = (await src('css/experience.css')).replace(/\/\*[\s\S]*?\*\//g, '');
    const FINISH = ['background', 'color', 'border', 'box-shadow'];
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!PRIMARIES.some(id => sel.includes(`#${id}`))) continue;
      for (const prop of FINISH) {
        const has = new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(body);
        expect(`${sel.trim()} sets ${prop}: ${has}`)
          .toBe(`${sel.trim()} sets ${prop}: false`);
      }
    }
  });

  test('the resting fill has somewhere brighter to go', async () => {
    // A FILL IS A STATE. An accent-tinted control at rest reads as already
    // pressed, which is exactly why these were outlines before. Filling them
    // is only safe while hover moves somewhere visibly lighter, so assert the
    // two are different rather than trusting the comment that says so.
    const css = await src('css/experience.css');
    const rest = /\.lux-primary\s*\{([^}]*)\}/.exec(css);
    const hover = /\.lux-primary:hover\s*\{([^}]*)\}/.exec(css);
    expect(`both states defined: ${Boolean(rest && hover)}`).toBe('both states defined: true');
    const bg = (b) => /background:\s*([^;]+)/.exec(b)[1].trim();
    expect(`hover differs: ${bg(hover[1]) !== bg(rest[1])}`).toBe('hover differs: true');
  });

  test('the ink clears AAA against the darker end of the fill', async () => {
    // Small tracked capitals at 0.7rem, so this is the contrast that matters
    // and it is measured rather than eyeballed. --lux-gold is the foot of the
    // gradient and therefore the worst case.
    const css = await src('css/experience.css');
    const ink = /\.lux-primary\s*\{[^}]*color:\s*(#[0-9a-f]{6})/i.exec(css)[1];
    const gold = /--lux-gold:\s*(#[0-9a-f]{6})/i.exec(css)[1];
    const lum = (hex) => {
      const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const [hi, lo] = [lum(ink), lum(gold)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    expect(`${ink} on ${gold} clears 7:1: ${ratio >= 7}`)
      .toBe(`${ink} on ${gold} clears 7:1: true`);
  });
});
