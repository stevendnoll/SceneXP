// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * steve-view.test.mjs - what the home office's fixed eye can actually see.
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB. The chainable proxy in
 * tests/helpers models no geometry and swallows every property it is handed,
 * so under it a person has no size, nothing stands in front of anything, and a
 * prop's registered kind reads back as a proxy rather than a name. The room is
 * built here from the real store.js against the real library (run in a node:vm
 * sandbox, as tests/xo-helmet.test.mjs does), and looked at through a real
 * PerspectiveCamera, with a real raycast from the eye to every sampled point
 * so that anything standing in the way counts against it.
 *
 * ---- THE PROMISE THIS HOLDS ----
 *
 * The room stopped being walked through on 2026-09-18 and got one fixed eye.
 * The brief for that eye was specific: STEVE IS ALWAYS IN THE DEFAULT VIEW,
 * REGARDLESS OF SCREEN SIZE, and seen side on rather than from behind. A floor
 * plan cannot answer that. Coordinates say where a thing stands, not whether
 * an eye can reach it, and when the eye was chosen the plan was wrong twice:
 * it said the litter box was in view (the sit-stand desk hides 89% of it), and
 * it could not say that the middle of the room shows mostly the back of
 * Steve's head. So the camera here comes from the same composeView the page
 * calls, and the checks read the drawn room, not the numbers.
 *
 * ---- AND THE ONE FOR ANYBODY WITHOUT A POINTER ----
 *
 * The list of the room's things (shared proplist part) is built from the card
 * table and the REGISTERED props, and the stub cannot register a prop. So the
 * question "can a keyboard visitor finish the discovery checklist?" is asked
 * here, against the real registrations.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const imp = (p) => import(pathToFileURL(join(root, p)).href);

function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

let THREE;
let CFG;
let composeView;
let steve;          // Steve's meshes
let dashboard;      // the wall display's meshes
let macbook;        // the MacBook Air on its stand
let occluders;      // everything in the room that can stand in the way
let registeredKinds;
let PROP_CONTENT;
let HOST_ROW;
let propListItems;
const saved = {};

// Every screen shape the brief means by "regardless of screen size", from an
// ultrawide monitor to a phone held upright.
const ASPECTS = [
  ['21:9 ultrawide', 21 / 9],
  ['16:9 monitor', 16 / 9],
  ['4:3 tablet', 4 / 3],
  ['1:1 square window', 1],
  ['3:4 tablet upright', 3 / 4],
  ['9:16 phone', 9 / 16],
  ['9:19.5 tall phone', 9 / 19.5],
];

beforeAll(async () => {
  // Real three, lifted out of a browser-shaped sandbox. The renderer is the
  // one piece node cannot provide, and nothing measured here goes through it.
  const ctx = vm.createContext({ self: {}, window: {}, console });
  vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
  const REAL = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
  THREE = Object.assign({}, REAL, { WebGLRenderer: function () { return chainable(); } });

  for (const k of ['THREE', 'document', 'window', 'navigator', 'sessionStorage', 'localStorage']) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  }
  globalThis.THREE = THREE;
  // 'loading' keeps main.js from booting when it is imported below for its
  // card table: it waits for a DOMContentLoaded this document never fires.
  globalThis.document = {
    readyState: 'loading',
    createElement() { return { width: 0, height: 0, style: {}, getContext() { return chainable(); } }; },
    addEventListener() {}, removeEventListener() {}, getElementById() { return null; },
    body: { appendChild() {} },
  };
  globalThis.window = {
    innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };

  const scene = await imp('www/shared/js/scene-1.0.0.min.js');
  const world = await imp('www/shared/js/world-1.0.0.min.js');
  const store = await imp('www/steve/js/store.js');
  ({ STEVE_CONFIG: CFG } = await imp('www/steve/js/config.js'));
  ({ composeView } = await imp('www/steve/js/view.js'));
  ({ propListItems } = await imp('www/shared/js/proplist-1.0.0.js'));
  ({ PROP_CONTENT, HOST_ROW } = (await imp('www/steve/js/main.js')).__test__);

  scene.initScene({}, CFG);
  store.initStore();
  const room = scene.getScene();
  room.updateMatrixWorld(true);

  const meshesOf = (o) => { const out = []; o.traverse((c) => { if (c.isMesh) out.push(c); }); return out; };
  steve = meshesOf(store.getRoquiMesh());
  dashboard = meshesOf(room.getObjectByName('wallDashboard'));
  macbook = room.getObjectByName('macbookAir');
  occluders = [];
  room.traverse((o) => { if (o.isMesh && o.visible !== false) occluders.push(o); });
  registeredKinds = world.getOutdoorPropMeshes().map((g) => g.userData.propKind);
}, 60000);

afterAll(() => {
  for (const [k, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete globalThis[k];
  }
});

/** World-space points across a set of meshes, subsampled to about `max`. */
function samples(meshes, max = 160) {
  const pts = [];
  for (const m of meshes) {
    const pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    }
  }
  const step = Math.max(1, Math.floor(pts.length / max));
  return pts.filter((_, i) => i % step === 0);
}

/** The camera the page builds for a screen shape, optionally turned by `yaw`
 *  radians the way the pan part turns it (positive = right, about +Y). */
function cameraFor(aspect, yaw = 0) {
  const view = composeView(CFG.camera, aspect);
  const cam = new THREE.PerspectiveCamera(view.fov, aspect, 0.05, 60);
  const eye = new THREE.Vector3(view.position.x, view.position.y, view.position.z);
  const dir = new THREE.Vector3(view.lookAt.x, view.lookAt.y, view.lookAt.z).sub(eye);
  if (yaw) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  cam.position.copy(eye);
  cam.lookAt(eye.clone().add(dir));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Fraction of `meshes` that is inside the frame AND not hidden behind
 *  anything else in the room. */
function seen(meshes, cam) {
  const own = new Set(meshes);
  const ray = new THREE.Raycaster();
  const pts = samples(meshes);
  let visible = 0;
  for (const p of pts) {
    const ndc = p.clone().project(cam);
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z <= -1 || ndc.z >= 1) continue;
    const dir = p.clone().sub(cam.position);
    const dist = dir.length();
    ray.set(cam.position, dir.normalize());
    ray.far = dist + 0.02;
    const hit = ray.intersectObjects(occluders, false)[0];
    if (!hit || own.has(hit.object) || hit.distance >= dist - 0.03) visible += 1;
  }
  return pts.length ? visible / pts.length : 0;
}

const centerOf = (meshes) => {
  const b = new THREE.Box3();
  meshes.forEach((m) => b.expandByObject(m));
  return b.getCenter(new THREE.Vector3());
};

describe('the default view', () => {
  test.each(ASPECTS)('Steve is in it, whole and unobstructed, at %s', (_name, aspect) => {
    expect(seen(steve, cameraFor(aspect))).toBeGreaterThanOrEqual(0.95);
  });

  test('Steve is seen side on, not from behind', () => {
    // 90 degrees from the way he faces is a pure profile, 180 is the back of
    // his head. The middle of the room measured 141, which is why the eye is
    // not there.
    const c = centerOf(steve);
    const eye = CFG.camera.position;
    const toEye = new THREE.Vector2(eye.x - c.x, eye.z - c.z).normalize();
    // store.js stands him facing west (-X).
    const facing = new THREE.Vector2(-1, 0);
    const deg = Math.acos(Math.max(-1, Math.min(1, facing.dot(toEye)))) * 180 / Math.PI;
    expect(deg).toBeGreaterThanOrEqual(80);
    expect(deg).toBeLessThanOrEqual(115);
  });

  test('a phone gets a wider lens than a monitor, from the same spot', () => {
    const phone = composeView(CFG.camera, 9 / 19.5);
    const monitor = composeView(CFG.camera, 16 / 9);
    expect(phone.fov).toBeGreaterThan(monitor.fov);
    expect(phone.position).toEqual(monitor.position);   // widens, never backs up
  });
});

describe('the wall display', () => {
  // The yaw that points the view at the display, the way the pan part would
  // get there: the angle between the composed aim and the display, about +Y.
  function yawToDisplay() {
    const eye = CFG.camera.position;
    const look = CFG.camera.lookAt;
    const d = centerOf(dashboard);
    const a = Math.atan2(look.x - eye.x, -(look.z - eye.z));
    const b = Math.atan2(d.x - eye.x, -(d.z - eye.z));
    return b - a;
  }

  test('is a turn to the right, and within reach of the pan', () => {
    const yaw = yawToDisplay();
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThan(Math.PI / 2);
  });

  test.each([['16:9 monitor', 16 / 9], ['9:19.5 tall phone', 9 / 19.5]])(
    'is whole and unobstructed once the view is turned to it, on a %s',
    (_name, aspect) => {
      expect(seen(dashboard, cameraFor(aspect, yawToDisplay()))).toBeGreaterThanOrEqual(0.95);
    });
});

describe('the MacBook on its stand', () => {
  // WHY THIS IS MEASURED AND NOT LOOKED AT. The laptop's deck and lid were
  // each placed in the stand's frame with their own tilt, and the two sets of
  // numbers drifted: the lid's foot ended up 43 mm from the back edge it is
  // supposed to hang off, which put the screen through the middle of the
  // keyboard with daylight behind it. Every number involved looked reasonable
  // on its own, and the fault is a relationship between them. A screenshot
  // caught it in the end (specs/screenshots, 2026-09-21); this catches it on
  // the way in, at any rake of the stand and any opening angle of the lid.
  const partsOfMac = () => {
    const deck = macbook.getObjectByName('macDeck');
    const lid = macbook.getObjectByName('macLid');
    macbook.updateMatrixWorld(true);
    return { deck, lid, d: deck.geometry.parameters, l: lid.geometry.parameters };
  };

  test('is in the room at all, with a deck and a lid to measure', () => {
    expect(macbook).toBeTruthy();
    const { deck, lid } = partsOfMac();
    expect(deck).toBeTruthy();
    expect(lid).toBeTruthy();
  });

  test('the lid hangs off the deck\'s back edge, inside the hinge', () => {
    const { deck, lid, d, l } = partsOfMac();
    // The middle of the lid's bottom edge, and the middle of the deck's back
    // face, both in the room's coordinates.
    const foot = new THREE.Vector3(0, -l.height / 2, 0).applyMatrix4(lid.matrixWorld);
    const backEdge = new THREE.Vector3(0, 0, -d.depth / 2).applyMatrix4(deck.matrixWorld);
    // Half the deck's thickness is the hinge barrel's radius, so the foot is
    // inside the barrel. It was 43 mm out before.
    expect(foot.distanceTo(backEdge)).toBeLessThan(d.height);
  });

  test('no part of the lid comes through the deck to the stand', () => {
    const { deck, lid, d } = partsOfMac();
    const deckTop = new THREE.Vector3(0, d.height / 2, -d.depth / 2).applyMatrix4(deck.matrixWorld);
    const lidBox = new THREE.Box3().setFromObject(lid);
    // The lid's lowest corner may tuck into the hinge barrel, and no further.
    expect(lidBox.min.y).toBeGreaterThan(deckTop.y - d.height);
  });

  test('the screen is readable from where the visitor stands', () => {
    // The whole point of the prop: the room is where SceneXP gets built, and
    // the laptop shows the site. Raising the lid onto its hinge moved the
    // screen 4 cm up and 1 cm back, so this holds the view it left with.
    const screen = macbook.getObjectByName('macScreen');
    expect(screen).toBeTruthy();
    expect(seen([screen], cameraFor(16 / 9))).toBeGreaterThanOrEqual(0.9);
  });
});

describe('the list of the room\'s things', () => {
  const rows = () => propListItems(PROP_CONTENT, registeredKinds, {
    before: [{ id: HOST_ROW, label: 'Steve' }],
    after: registeredKinds.includes('lightswitch') ? [{ id: 'lightswitch', label: 'The Light Switch' }] : [],
  });

  test('every card in the table is for something really in the room', () => {
    // A card with no registered prop behind it can be opened neither by a
    // click nor by the list. (www/sunnyvalejenn has one: "The Green
    // Committee", written for plants that were never registered.)
    const orphans = Object.keys(PROP_CONTENT).filter((k) => !registeredKinds.includes(k));
    expect(orphans).toEqual([]);
  });

  test('a keyboard visitor can finish the discovery checklist from it', () => {
    // Each discovery has to be reachable without a pointer, or the celebration
    // at the end of the checklist is one only a mouse can earn.
    const ids = new Set(rows().map((r) => r.id));
    for (const item of CFG.checklist.items) {
      const reachable = item.id === 'hello'
        ? ids.has(HOST_ROW)
        : Object.entries(PROP_CONTENT).some(([kind, card]) => card.checklistId === item.id && ids.has(kind));
      expect([item.id, reachable]).toEqual([item.id, true]);
    }
  });

  test('includes the discovery a pointer can barely reach', () => {
    // From the fixed eye the litter box is almost entirely behind the
    // sit-stand desk. The list is the one route to it that does not depend
    // on finding the sliver that shows.
    expect(rows().map((r) => r.id)).toContain('litter');
  });

  test('names each row after its card, host first and the light switch last', () => {
    const r = rows();
    expect(r[0]).toEqual({ id: HOST_ROW, label: 'Steve' });
    expect(r[r.length - 1].id).toBe('lightswitch');
    for (const row of r.slice(1, -1)) expect(row.label).toBe(PROP_CONTENT[row.id].title);
  });
});

