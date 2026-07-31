// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Sky, lighting, and renderer-plumbing tests for www/shared/js/scene-1.0.0.js —
 * the ranges tests/shared-scene.test.mjs leaves dark under the fully chainable
 * proxy: getSun/getMoon, the comet drift (including reduced motion), the
 * sunrise/sunset branches of the sky gradient, background lerp and lighting,
 * the star fades, removeTestObjects, handleResize, and render.
 *
 * Chainables absorb writes, so nothing could be asserted through them. This
 * file instead installs a small hand-rolled THREE namespace with real state
 * where the module does real math (Vector3, Color, an Object3D tree with
 * getObjectByName, recording renderer/canvas/materials) — the same
 * real-where-it-matters approach as tests/shared-pan.test.mjs. Time is driven
 * through updateDayNightCycle with explicit deltas against the default 480s
 * cycle, so every time of day is exact and deterministic. Star positions are
 * the one Math.random consumer: those are asserted as invariants (radius and
 * above-horizon bounds), never exact values.
 */
import { jest } from '@jest/globals';

// ---- Minimal-but-real THREE -------------------------------------------------

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { return this.set(s, s, s); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.set(this.x / l, this.y / l, this.z / l); }
  multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
  length() { return Math.hypot(this.x, this.y, this.z); }
}

class Color {
  constructor(hex) { this.r = 0; this.g = 0; this.b = 0; if (hex !== undefined) this.setHex(hex); }
  setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
  getHex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
}

class Object3D {
  constructor() {
    this.children = [];
    this.parent = null;
    this.name = '';
    this.visible = true;
    this.renderOrder = 0;
    this.position = new Vec3();
    this.rotation = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.quaternion = { setFromUnitVectors() {} };
  }
  add(child) { child.parent = this; this.children.push(child); return this; }
  remove(child) { this.children = this.children.filter((c) => c !== child); }
  traverse(cb) { cb(this); this.children.forEach((c) => c.traverse(cb)); }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const found = c.getObjectByName(name);
      if (found) return found;
    }
    return null;
  }
}

class Group extends Object3D {}
class Scene extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.isMesh = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }
}
class Points extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

class Geometry {
  constructor(...args) { this.args = args; this.attributes = {}; this.disposed = false; }
  setAttribute(name, attr) { this.attributes[name] = attr; }
  dispose() { this.disposed = true; }
}
class Material {
  constructor(props = {}) { Object.assign(this, props); this.disposed = false; }
  dispose() { this.disposed = true; }
}
class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}
class CanvasTexture {
  constructor(canvas) { this.canvas = canvas; this.needsUpdate = false; }
}
class Fog {
  constructor(color, near, far) { this.color = new Color(color); this.near = near; this.far = far; }
}

class Light extends Object3D {
  constructor(color, intensity) {
    super();
    this.color = new Color(typeof color === 'number' ? color : 0xffffff);
    this.intensity = intensity;
  }
}
class AmbientLight extends Light {}
class HemisphereLight extends Light {
  constructor(skyColor, groundColor, intensity) { super(skyColor, intensity); }
}
class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.castShadow = false;
    this.shadow = { mapSize: {}, camera: {} };
  }
}

class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.projectionUpdates = 0;
  }
  updateProjectionMatrix() { this.projectionUpdates++; }
}

class WebGLRenderer {
  constructor(opts) {
    this.opts = opts;
    this.sizes = [];
    this.pixelRatios = [];
    this.renderCalls = [];
    this.shadowMap = { enabled: false, type: null, autoUpdate: true, needsUpdate: false };
    this.xr = { enabled: false, isPresenting: false };
  }
  setSize(w, h) { this.sizes.push([w, h]); }
  setPixelRatio(r) { this.pixelRatios.push(r); }
  render(scene, camera) { this.renderCalls.push([scene, camera]); }
}

function makeCanvas() {
  const ctx = {
    gradients: [],
    fillStyle: null,
    fillCount: 0,
    createLinearGradient() {
      const g = { stops: [], addColorStop(offset, color) { g.stops.push([offset, color]); } };
      ctx.gradients.push(g);
      return g;
    },
    fillRect() { ctx.fillCount++; },
  };
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}

function installGlobals({ width = 1024, height = 768, dpr = 2, reducedMotion = false, touch = false } = {}) {
  globalThis.THREE = {
    Vector3: Vec3, Color, Scene, Group, Mesh, Points,
    PerspectiveCamera, WebGLRenderer, Fog, CanvasTexture, BufferAttribute,
    SphereGeometry: Geometry, BoxGeometry: Geometry, PlaneGeometry: Geometry,
    ConeGeometry: Geometry, BufferGeometry: Geometry,
    MeshBasicMaterial: Material, MeshStandardMaterial: Material, PointsMaterial: Material,
    AmbientLight, HemisphereLight, DirectionalLight,
    BackSide: 'back', DoubleSide: 'double',
    BasicShadowMap: 'basic-shadow', PCFSoftShadowMap: 'pcf-soft',
    SRGBColorSpace: 'srgb', ACESFilmicToneMapping: 'aces',
  };
  const canvases = [];
  globalThis.document = {
    createElement() { const c = makeCanvas(); canvases.push(c); return c; },
  };
  globalThis.window = { innerWidth: width, innerHeight: height, devicePixelRatio: dpr };
  if (reducedMotion) globalThis.window.matchMedia = () => ({ matches: true });
  if (touch) globalThis.window.ontouchstart = null; // 'ontouchstart' in window → true
  globalThis.navigator = {};
  return { canvases };
}

// ---- Harness ------------------------------------------------------------------

const CYCLE = 480; // default DAY_NIGHT_CONFIG.cycleDuration
// Day/night phase boundaries mirrored from DAY_NIGHT_CONFIG for expected values.
const SUNRISE = [0.20, 0.30];
const SUNSET = [0.70, 0.80];

async function loadScene(options = {}, envOpts = {}) {
  const env = installGlobals(envOpts);
  jest.resetModules();
  const m = await import('../www/shared/js/scene-1.0.0.js');
  const { scene, camera, renderer } = m.initScene(makeCanvas(), options);
  // The module creates exactly one canvas via the DOM: the sky gradient.
  const skyCtx = env.canvases[0].ctx;
  // A tiny clock so tests advance the cycle by exact fractions from noon (0.5).
  let now = 0.5;
  const clock = {
    to(T) {
      const delta = (((T - now) % 1) + 1) % 1;
      m.updateDayNightCycle(delta * CYCLE);
      now = T;
    },
  };
  return { m, scene, camera, renderer, skyCtx, clock };
}

const lastGradient = (skyCtx) => skyCtx.gradients[skyCtx.gradients.length - 1];

// Mirror of the module's lerpColorRgb over its pre-computed hex palette, so
// expected gradient strings share the exact float path (and rounding) with it.
function lerpRgbString(hex1, hex2, t) {
  const ch = (h, shift) => (h >> shift) & 255;
  const mix = (shift) => Math.round(ch(hex1, shift) + (ch(hex2, shift) - ch(hex1, shift)) * t);
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}

afterEach(() => {
  delete globalThis.THREE;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.navigator;
});

// ---- initScene wiring -----------------------------------------------------------

test('desktop init wires the renderer, camera, and rig with the documented caps', async () => {
  const { scene, camera, renderer, m } = await loadScene();
  expect(renderer.opts.antialias).toBe(true);            // not a touch device
  expect(renderer.sizes[0]).toEqual([1024, 768]);
  expect(renderer.pixelRatios[0]).toBe(1.5);             // devicePixelRatio 2, capped
  expect(renderer.shadowMap).toMatchObject({ enabled: true, type: 'pcf-soft', autoUpdate: false, needsUpdate: true });
  expect(renderer.xr.enabled).toBe(true);
  expect(camera.fov).toBe(75);
  expect(camera.aspect).toBe(1024 / 768);
  expect(camera.position.y).toBe(1.7);
  expect(m.getCameraRig().children).toContain(camera);   // VR rig owns the camera
  expect(scene.fog.far).toBe(200);
  expect(scene.getObjectByName('clouds').children).toHaveLength(26); // full flotilla
  // The accessors hand back the same instances initScene returned.
  expect(m.getScene()).toBe(scene);
  expect(m.getCamera()).toBe(camera);
  expect(m.getRenderer()).toBe(renderer);
});

test('touch devices trade fidelity for frame rate at init', async () => {
  const { scene, renderer } = await loadScene({ shadowRange: 60 }, { touch: true });
  expect(renderer.opts.antialias).toBe(false);
  expect(renderer.shadowMap.type).toBe('basic-shadow');
  expect(scene.fog.far).toBe(120);                       // fog pulled in close
  const dir = scene.getObjectByName('dirLight');
  expect(dir.shadow.mapSize.width).toBe(512);            // half the desktop map
  // A widened shadowRange stretches the sun's shadow box to match.
  expect(dir.shadow.camera.left).toBe(-60);
  expect(dir.shadow.camera.far).toBe(120);
  expect(scene.getObjectByName('clouds').children).toHaveLength(13); // half the clouds
});

test('hexToRgb falls back to black on malformed input (test hook)', async () => {
  const { m } = await loadScene();
  expect(m.__test__.hexToRgb('#1e90ff')).toEqual({ r: 30, g: 144, b: 255 });
  expect(m.__test__.hexToRgb('not-a-color')).toEqual({ r: 0, g: 0, b: 0 });
});

test('getSun and getMoon expose the sky bodies hung in the scene', async () => {
  const { m, scene } = await loadScene();
  const sun = m.getSun();
  const moon = m.getMoon();
  expect(sun).toBe(scene.getObjectByName('sun'));
  expect(moon).toBe(scene.getObjectByName('moon'));
  expect(sun.children).toHaveLength(3);   // core plus two glow shells
  expect(moon.children).toHaveLength(2);  // core plus one glow
  expect(moon.visible).toBe(false);       // hidden until night
});

test('stars scatter on the 280-radius dome, always above the horizon', async () => {
  const { scene } = await loadScene();
  const stars = scene.getObjectByName('stars').children[0];
  const pos = stars.geometry.attributes.position.array;
  expect(pos).toHaveLength(500 * 3);
  for (let i = 0; i < pos.length; i += 3) {
    expect(Math.hypot(pos[i], pos[i + 1], pos[i + 2])).toBeCloseTo(280, 3); // Float32 storage
    expect(pos[i + 1]).toBeGreaterThan(0); // elevation capped well above horizon
  }
});

// ---- Day/night sky ---------------------------------------------------------------

test('stars fade in through sunset, burn at night, and fade out through sunrise', async () => {
  const { scene, clock } = await loadScene();
  const starsGroup = scene.getObjectByName('stars');
  const material = starsGroup.children[0].material;

  clock.to(0.5); // noon
  expect(starsGroup.visible).toBe(false);

  clock.to(0.75); // mid-sunset
  const tSet = (0.75 - SUNSET[0]) / (SUNSET[1] - SUNSET[0]);
  expect(starsGroup.visible).toBe(true);
  expect(material.opacity).toBeCloseTo(0.9 * tSet, 10);

  clock.to(0.95); // deep night
  expect(starsGroup.visible).toBe(true);
  expect(material.opacity).toBe(0.9);

  clock.to(0.25); // mid-sunrise (wrapping past midnight)
  const tRise = (0.25 - SUNRISE[0]) / (SUNRISE[1] - SUNRISE[0]);
  expect(material.opacity).toBeCloseTo(0.9 * (1 - tRise), 6);

  clock.to(0.5); // back to noon
  expect(starsGroup.visible).toBe(false);
});

test('the sun sets below the horizon as the moon rises opposite it', async () => {
  const { m, clock } = await loadScene();
  clock.to(0.95);
  expect(m.getSun().visible).toBe(false);
  expect(m.getSun().position.y).toBeLessThan(-10);
  expect(m.getMoon().visible).toBe(true);
  expect(m.getMoon().position.y).toBeGreaterThan(0);
  clock.to(0.5);
  expect(m.getSun().visible).toBe(true);
  expect(m.getMoon().visible).toBe(false);
});

test('the sky gradient repaints the sunset blend and the pre-dawn night stops', async () => {
  const { skyCtx, clock } = await loadScene();

  clock.to(0.75); // exactly mid-sunset
  const t = (0.75 - SUNSET[0]) / (SUNSET[1] - SUNSET[0]);
  expect(lastGradient(skyCtx).stops).toEqual([
    [0, lerpRgbString(0x1e90ff, 0x0a0a20, t)],   // day0 → night0
    [0.4, lerpRgbString(0x87CEEB, 0x101030, t)], // day1 → night1
    [0.7, lerpRgbString(0xB0E0E6, 0xFF6B4A, t)], // day2 → sunset0
    [1, lerpRgbString(0xE6F3FF, 0xFF8C00, t)],   // day3 → sunset1
  ]);

  clock.to(0.1); // pre-dawn night (the branch before sunriseStart)
  expect(lastGradient(skyCtx).stops).toEqual([
    [0, '#0a0a20'], [0.5, '#101030'], [1, '#151540'],
  ]);
  expect(skyCtx.fillCount).toBeGreaterThan(1); // each repaint fills the canvas
});

test('the scene background and fog lerp through sunset and sunrise together', async () => {
  const { scene, clock } = await loadScene();

  clock.to(0.75); // mid-sunset: halfway from day blue to night navy
  const tSet = (0.75 - SUNSET[0]) / (SUNSET[1] - SUNSET[0]);
  const expectChannel = (from, to, t) => (from + (to - from) * t) / 255;
  expect(scene.background.r).toBeCloseTo(expectChannel(0x87, 0x0a, tSet), 10);
  expect(scene.background.b).toBeCloseTo(expectChannel(0xEB, 0x20, tSet), 10);
  expect(scene.fog.color.r).toBeCloseTo(scene.background.r, 12);

  clock.to(0.95); // night is flat navy
  expect(scene.background.getHex()).toBe(0x0a0a20);

  clock.to(0.25); // mid-sunrise: halfway back toward day
  const tRise = (0.25 - SUNRISE[0]) / (SUNRISE[1] - SUNRISE[0]);
  expect(scene.background.r).toBeCloseTo(expectChannel(0x0a, 0x87, tRise), 6);
  expect(scene.background.g).toBeCloseTo(expectChannel(0x0a, 0xCE, tRise), 6);

  clock.to(0.5); // full day
  expect(scene.background.getHex()).toBe(0x87CEEB);
});

test('the lights warm through sunrise, run cool at night, and track the sun', async () => {
  const { m, scene, clock } = await loadScene();
  const ambient = scene.getObjectByName('ambientLight');
  const hemi = scene.getObjectByName('hemiLight');
  const dir = scene.getObjectByName('dirLight');

  clock.to(0.5); // noon
  expect(ambient.intensity).toBe(0.4);
  expect(ambient.color.getHex()).toBe(0xfff8dc);
  expect(dir.intensity).toBe(1);
  expect(dir.color.getHex()).toBe(0xffffff);
  expect(dir.position.length()).toBeCloseTo(20, 10); // normalized sun dir * 20

  clock.to(0.25); // mid-sunrise: warm and ramping up
  const t = (0.25 - SUNRISE[0]) / (SUNRISE[1] - SUNRISE[0]);
  expect(ambient.intensity).toBeCloseTo(0.15 + 0.25 * t, 6);
  expect(ambient.color.getHex()).toBe(0xffd0a0);
  expect(hemi.intensity).toBeCloseTo(0.15 + 0.25 * t + 0.1, 6);
  expect(dir.intensity).toBeCloseTo(0.1 + 0.7 * t, 6);
  expect(dir.color.getHex()).toBe(0xffaa66);
  // The pure reads ramp in lockstep with the visuals.
  expect(m.getNightFactor()).toBeCloseTo(1 - t, 6);
  expect(m.getInteriorLightState().shouldBeOn).toBe(true);
  expect(m.getInteriorLightState().intensity).toBeCloseTo(1 - t, 6);

  clock.to(0.95); // night: cool moonlight
  expect(ambient.intensity).toBe(0.15);
  expect(ambient.color.getHex()).toBe(0x4466aa);
  expect(dir.intensity).toBe(0.1);
  expect(dir.color.getHex()).toBe(0x6688bb);
});

test('getInteriorLightState fades the store lights on across the sunset', async () => {
  const { m, clock } = await loadScene();
  clock.to(0.75);
  const t = (0.75 - SUNSET[0]) / (SUNSET[1] - SUNSET[0]);
  expect(m.getInteriorLightState().shouldBeOn).toBe(true);
  expect(m.getInteriorLightState().intensity).toBeCloseTo(t, 10);
});

// ---- Comet -----------------------------------------------------------------------

test('the comet drifts on slow deterministic sine paths around its base', async () => {
  const base = { x: 100, y: 150, z: -50 };
  const { m, scene } = await loadScene({ comet: { enabled: true, base } });
  const comet = m.getComet();
  expect(comet).toBe(scene.getObjectByName('comet'));

  // Every mesh renders late so the drifting clouds can never cover it.
  comet.children.forEach((child) => expect(child.renderOrder).toBe(12));

  m.updateComet(0);
  expect(comet.position.x).toBeCloseTo(base.x, 10);
  expect(comet.position.y).toBeCloseTo(base.y, 10);
  expect(comet.position.z).toBeCloseTo(base.z + 12, 10);

  m.updateComet(40);
  expect(comet.position.x).toBeCloseTo(base.x + Math.sin(40 * 0.02) * 12, 10);
  expect(comet.position.y).toBeCloseTo(base.y + Math.sin(40 * 0.013) * 4, 10);
  expect(comet.position.z).toBeCloseTo(base.z + Math.cos(40 * 0.018) * 12, 10);
});

test('reduced motion holds the comet and the day/night clock perfectly still', async () => {
  const { m } = await loadScene({ comet: { enabled: true } }, { reducedMotion: true });
  const comet = m.getComet();
  const base = m.getCometBase();

  m.updateComet(999); // any elapsed time: the comet stays at its rest pose
  expect(comet.position.x).toBe(base.x);
  expect(comet.position.y).toBe(base.y);
  expect(comet.position.z).toBe(base.z + 12);

  m.updateDayNightCycle(CYCLE * 0.45); // would be deep night if the sky cycled
  expect(m.isNightTime()).toBe(false); // frozen at noon
});

// ---- Resize, render, cleanup -------------------------------------------------------

test('handleResize refits the camera and renderer, keeping the 1.5 pixel-ratio cap', async () => {
  const { camera, renderer, m } = await loadScene();
  globalThis.window.innerWidth = 800;
  globalThis.window.innerHeight = 600;
  globalThis.window.devicePixelRatio = 1;

  m.handleResize();
  expect(camera.aspect).toBe(800 / 600);
  expect(camera.projectionUpdates).toBe(1);
  expect(renderer.sizes.at(-1)).toEqual([800, 600]);
  expect(renderer.pixelRatios.at(-1)).toBe(1);   // below the cap: used as-is

  globalThis.window.devicePixelRatio = 3;
  m.handleResize();
  expect(renderer.pixelRatios.at(-1)).toBe(1.5); // above the cap: clamped
});

test('resize defers to XR while presenting, and pre-init calls are safe no-ops', async () => {
  // Before initScene nothing exists to resize or render: both must just return.
  installGlobals();
  jest.resetModules();
  const bare = await import('../www/shared/js/scene-1.0.0.js');
  expect(() => { bare.handleResize(); bare.render(); }).not.toThrow();

  const { camera, renderer, m } = await loadScene();
  renderer.xr.isPresenting = true;
  const sizeCalls = renderer.sizes.length;
  globalThis.window.innerWidth = 320;
  m.handleResize();
  expect(renderer.sizes).toHaveLength(sizeCalls); // XR owns the viewport
  expect(camera.aspect).toBe(1024 / 768);
});

test('render draws the current scene through the renderer', async () => {
  const { m, scene, camera, renderer } = await loadScene();
  m.render();
  expect(renderer.renderCalls).toHaveLength(1);
  expect(renderer.renderCalls[0][0]).toBe(scene);
  expect(renderer.renderCalls[0][1]).toBe(camera);
});

test('removeTestObjects disposes the bootstrap cube and ground exactly once', async () => {
  const { m, scene } = await loadScene();
  const cube = scene.getObjectByName('testCube');
  const ground = scene.getObjectByName('tempGround');
  expect(cube).toBeTruthy();
  expect(ground).toBeTruthy();

  m.removeTestObjects();
  expect(scene.getObjectByName('testCube')).toBeNull();
  expect(scene.getObjectByName('tempGround')).toBeNull();
  expect(cube.geometry.disposed).toBe(true);
  expect(cube.material.disposed).toBe(true);
  expect(ground.geometry.disposed).toBe(true);
  expect(ground.material.disposed).toBe(true);

  expect(() => m.removeTestObjects()).not.toThrow(); // already gone: no-op
});
