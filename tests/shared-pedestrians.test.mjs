// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Behavioral tests for www/shared/js/pedestrians-1.0.0.js — the sidewalk
 * crowd: the builder that casts and places the walkers, the day/night zombie
 * transformation (colors, glowing pupils, raised arms), the per-frame AI
 * (walking, window-shop pauses, mutual avoidance, the stuck-timer turnaround,
 * zombie chase/return, refuge footprints), the collision slide helper, and
 * the dialog pause/resume paths.
 *
 * The shared-cast suite drives the same module under the fully chainable
 * THREE proxy, where positions and colors are absorbed and nothing can be
 * asserted. Here the update math matters, so these tests install a HYBRID
 * THREE global: real (tiny) Group/Mesh/MeshStandardMaterial/Color classes
 * with honest positions, rotations, traversal, and hex colors for everything
 * createPerson builds, and the usual absorb-everything chainable for the
 * rest of the engine (renderer, lights, sky) so scene/world init still runs.
 *
 * Randomness: the module spreads spawns and speeds with Math.random. Tests
 * that need exact arithmetic pin Math.random to a constant (restored in
 * afterEach), so direction, spawn X, and the zombie speed multiplier become
 * known values. Tests about cast variety run unpinned and assert invariants
 * (ranges, set membership) instead of exact draws. Night is reached the same
 * way the experiences reach it: by advancing the scene's day/night cycle.
 */
import { jest } from '@jest/globals';

// ---- Chainable absorber (same shape as helpers/three-stub.mjs) -------------

function chainable() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;
      if (prop === 'parent') return undefined;
      return chainable();
    },
    set() { return true; },
    apply() { return chainable(); },
    construct() { return chainable(); },
  });
}

// ---- Real minimal THREE classes for the people/pedestrian object trees -----

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

class StubVec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = num(x); this.y = num(y); this.z = num(z); return this; }
  setScalar(s) { return this.set(s, s, s); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new StubVec3(this.x, this.y, this.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}

class StubColor {
  constructor(value = 0) { this._hex = 0; this.set(value); }
  set(v) {
    if (v instanceof StubColor) this._hex = v._hex;
    else if (typeof v === 'number' && Number.isFinite(v)) this._hex = v;
    return this;
  }
  setHex(h) { this._hex = h; return this; }
  getHex() { return this._hex; }
  copy(c) { this._hex = c && c.getHex ? c.getHex() : 0; return this; }
  clone() { return new StubColor(this._hex); }
  multiplyScalar(s) {
    const ch = (shift) => Math.max(0, Math.min(255, Math.round(((this._hex >> shift) & 255) * s)));
    this._hex = (ch(16) << 16) | (ch(8) << 8) | ch(0);
    return this;
  }
  lerp(c, t) {
    const o = c && c.getHex ? c.getHex() : 0;
    const ch = (shift) => Math.round(((this._hex >> shift) & 255) * (1 - t) + ((o >> shift) & 255) * t);
    this._hex = (ch(16) << 16) | (ch(8) << 8) | ch(0);
    return this;
  }
  setHSL() { return this; }
  setRGB() { return this; }
  offsetHSL() { return this; }
}

class StubObject3D {
  constructor() {
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.position = new StubVec3();
    this.rotation = new StubVec3();
    this.scale = new StubVec3(1, 1, 1);
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.name = '';
  }
  add(...objs) {
    for (const o of objs) {
      if (o && typeof o === 'object') o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(obj) { this.children = this.children.filter((c) => c !== obj); return this; }
  traverse(fn) {
    fn(this);
    for (const c of this.children) {
      // Chainable children (a camera parked in a rig, say) absorb the call.
      if (c && typeof c.traverse === 'function') c.traverse(fn);
    }
  }
}

class StubGroup extends StubObject3D { constructor() { super(); this.isGroup = true; } }

class StubMesh extends StubObject3D {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
  }
}

class StubMaterial {
  constructor(params = {}) {
    Object.assign(this, params);
    this.color = new StubColor(params.color === undefined ? 0xffffff : params.color);
    this.emissive = new StubColor(0x000000);
    this.emissiveIntensity = 0;
  }
}

const REAL = {
  Group: StubGroup,
  Mesh: StubMesh,
  Object3D: StubObject3D,
  MeshStandardMaterial: StubMaterial,
  Color: StubColor,
};

function installGlobals() {
  globalThis.THREE = new Proxy({}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (Object.prototype.hasOwnProperty.call(REAL, prop)) return REAL[prop];
      return chainable();
    },
  });
  globalThis.window = {};
  globalThis.navigator = {};
  globalThis.document = {
    createElement() {
      return { width: 0, height: 0, style: {}, getContext() { return chainable(); } };
    },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
  };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
}

// ---- Harness ----------------------------------------------------------------

// A building footprint the update loop can trust: the gallery spans
// x in [-6, 6], z in [-7, 7], well away from the sidewalk at z = 26.5.
const BUILDING = { width: 12, depth: 14, positionX: 0, positionZ: 0 };
const PED_PATH = { sidewalkZ: 26.5, minX: -18, maxX: 18 };

let scene, world, peds, people, npcs;

/** Fresh module graph against fresh stub globals; scene starts at noon. */
async function boot(config = {}) {
  installGlobals();
  jest.resetModules();
  scene = await import('../www/shared/js/scene-1.0.0.min.js');
  world = await import('../www/shared/js/world-1.0.0.min.js');
  people = await import('../www/shared/js/people-1.0.0.min.js');
  npcs = await import('../www/shared/js/npcs-1.0.0.min.js');
  peds = await import('../www/shared/js/pedestrians-1.0.0.js');
  scene.initScene({}, {});
  world.initWorld({ building: BUILDING, pedestrians: { count: 1, ...PED_PATH }, ...config });
}

// Advance the default 480s cycle from noon (0.5) deep into night (0.95),
// and from there back around to the next noon.
const goNight = () => scene.updateDayNightCycle(480 * 0.45);
const goDay = () => scene.updateDayNightCycle(480 * 0.55);

// Pinning Math.random to 0.6 makes every builder draw a known value:
// direction = +1, spawn offset = +2, bobPhase = 1.2π, zombie multiplier 0.53.
const pinRandom = (v = 0.6) => jest.spyOn(Math, 'random').mockReturnValue(v);

const allHexes = (mesh) => {
  const s = new Set();
  mesh.traverse((c) => { if (c.isMesh && c.material && c.material.color) s.add(c.material.color.getHex()); });
  return s;
};
const pupilsOf = (mesh) => {
  const out = [];
  mesh.traverse((c) => { if (c.userData && c.userData.isPupil === true) out.push(c); });
  return out;
};
const armsOf = (mesh) => {
  const out = [];
  mesh.traverse((c) => { if (c.userData && c.userData.isArm === true) out.push(c); });
  return out;
};

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.THREE;
  delete globalThis.window;
  delete globalThis.navigator;
  delete globalThis.document;
  delete globalThis.sessionStorage;
});

// ---- The builder --------------------------------------------------------------

describe('createSidewalkPedestrians', () => {
  test('places the configured crew on the sidewalk line, facing along it', async () => {
    await boot({ pedestrians: { count: 4, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    const meshes = peds.getPedestrianMeshes();
    expect(meshes).toHaveLength(4);
    for (const mesh of meshes) {
      expect(mesh.position.z).toBe(26.5);
      expect(mesh.position.y).toBe(0.055);
      // startX = spread across [minX, maxX] plus a ±10 shuffle.
      expect(mesh.position.x).toBeGreaterThanOrEqual(-28);
      expect(mesh.position.x).toBeLessThanOrEqual(28);
      expect([Math.PI / 2, -Math.PI / 2]).toContain(mesh.rotation.y);
      expect(mesh.userData.isPedestrian).toBe(true);
    }
    expect(peds.arePedestriansZombies()).toBe(false);
  });

  test('a full draw mixes presentations and never repeats the indoor visitor', async () => {
    await boot({ pedestrians: { count: 6, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    const union = new Set();
    peds.getPedestrianMeshes().forEach((m) => allHexes(m).forEach((h) => union.add(h)));
    // All six street designs appear (count equals the pool size)...
    const mascShirts = [0x3498db, 0x27ae60, 0xf39c12];
    const femmeShirts = [0xe91e63, 0xe07a5f, 0x1abc9c];
    [...mascShirts, ...femmeShirts].forEach((h) => expect(union.has(h)).toBe(true));
    // ...and nobody wears the showroom visitor's reserved violet.
    expect(union.has(npcs.INDOOR_VISITOR_LOOK.shirtColor)).toBe(false);
  });

  test('mobile halves the crew, rounded up', async () => {
    await boot({ pedestrians: { count: 5, ...PED_PATH } });
    globalThis.navigator.maxTouchPoints = 5;
    peds.createSidewalkPedestrians();
    expect(peds.getPedestrianMeshes()).toHaveLength(3);
  });

  test('config numbers override the path; non-numbers fall back to defaults', async () => {
    await boot({ pedestrians: { count: 3, sidewalkZ: 10, minX: -5, maxX: 5 } });
    peds.createSidewalkPedestrians();
    const meshes = peds.getPedestrianMeshes();
    expect(meshes).toHaveLength(3);
    meshes.forEach((m) => expect(m.position.z).toBe(10));

    await boot({ pedestrians: { count: '9' } });
    peds.createSidewalkPedestrians();
    expect(peds.getPedestrianMeshes()).toHaveLength(2); // built-in default
  });
});

// ---- Zombie transformation (called directly on a known appearance) -----------

describe('zombifyPedestrian / humanizePedestrian', () => {
  const APPEARANCE = {
    shirtColor: 0x3498db, pantsColor: 0x2c3e50, skinTone: 0xffdbac,
    hairColor: 0x4a3728, hairStyle: 'short',
  };

  function makePed(appearance = APPEARANCE) {
    const mesh = people.createPerson({ role: 'pedestrian', ...appearance });
    return { mesh, isZombie: false, originalAppearance: { ...appearance } };
  }

  test('zombify swaps skin, shirt, pants, and hair for the night palette', async () => {
    await boot();
    const ped = makePed();
    peds.zombifyPedestrian(ped);
    expect(ped.isZombie).toBe(true);

    const hexes = allHexes(ped.mesh);
    expect(hexes.has(0x5a7a5a)).toBe(true);  // zombie skin
    expect(hexes.has(0x3d3d3d)).toBe(true);  // tattered shirt
    expect(hexes.has(0x2a2a2a)).toBe(true);  // dark pants
    expect(hexes.has(0x1a1a1a)).toBe(true);  // matted hair
    expect(hexes.has(APPEARANCE.shirtColor)).toBe(false);
    expect(hexes.has(APPEARANCE.skinTone)).toBe(false);

    // Skin glows faintly green; pupils glow bright.
    let skinMat = null;
    ped.mesh.traverse((c) => { if (c.isMesh && c.material.color.getHex() === 0x5a7a5a) skinMat = c.material; });
    expect(skinMat.emissive.getHex()).toBe(0x1a2a1a);
    expect(skinMat.emissiveIntensity).toBe(0.2);
    for (const pupil of pupilsOf(ped.mesh)) {
      expect(pupil.material.color.getHex()).toBe(0xccff00);
      expect(pupil.material.emissive.getHex()).toBe(0x88ff00);
      expect(pupil.material.emissiveIntensity).toBe(0.8);
    }
  });

  test('the pupil tag wins even when the hair shares the pupil color', async () => {
    await boot();
    // The coral femme design's hair is 0x2c1810 — exactly the pupil color.
    const ped = makePed({
      shirtColor: 0xe07a5f, pantsColor: 0x2c3e50, skinTone: 0x8d5524,
      hairColor: 0x2c1810, hairStyle: 'long',
    });
    peds.zombifyPedestrian(ped);
    for (const pupil of pupilsOf(ped.mesh)) {
      expect(pupil.material.color.getHex()).toBe(0xccff00);
    }
    // The hair itself still went dark; nothing keeps the shared brown.
    expect(allHexes(ped.mesh).has(0x2c1810)).toBe(false);
  });

  test('zombify is idempotent, and humanize restores the original palette', async () => {
    await boot();
    const ped = makePed();
    peds.zombifyPedestrian(ped);

    // Second call must early-return: a sentinel on a pupil survives it.
    const pupil = pupilsOf(ped.mesh)[0];
    pupil.material.color.setHex(0x123456);
    peds.zombifyPedestrian(ped);
    expect(pupil.material.color.getHex()).toBe(0x123456);

    peds.humanizePedestrian(ped);
    expect(ped.isZombie).toBe(false);
    const hexes = allHexes(ped.mesh);
    expect(hexes.has(APPEARANCE.shirtColor)).toBe(true);
    expect(hexes.has(APPEARANCE.pantsColor)).toBe(true);
    expect(hexes.has(APPEARANCE.skinTone)).toBe(true);
    expect(hexes.has(APPEARANCE.hairColor)).toBe(true);
    expect(hexes.has(0x5a7a5a)).toBe(false);
    expect(hexes.has(0x3d3d3d)).toBe(false);
    expect(hexes.has(0xccff00)).toBe(false);
    // The black shoes stayed black: the recorded-undo restore only touches
    // materials zombify changed (under the old hex-matching restore they
    // read as "zombie hair" and came back hair-colored).
    expect(hexes.has(0x1a1a1a)).toBe(true);
    expect(pupil.material.color.getHex()).toBe(0x2c1810);
    expect(pupil.material.emissiveIntensity).toBe(0);

    // Humanize on a human is a no-op too.
    pupil.material.color.setHex(0x654321);
    peds.humanizePedestrian(ped);
    expect(pupil.material.color.getHex()).toBe(0x654321);
  });

  test('the shoes stay black through a zombify → humanize round trip', async () => {
    await boot();
    // Brown hair: under the old restore these shoes came back hair-colored,
    // because 0x1a1a1a is both the shoe black and the zombie-hair black.
    const ped = makePed();
    const shoeMats = new Set();
    ped.mesh.traverse((c) => {
      if (c.isMesh && c.material.color && c.material.color.getHex() === 0x1a1a1a) shoeMats.add(c.material);
    });
    expect(shoeMats.size).toBeGreaterThan(0);

    peds.zombifyPedestrian(ped);
    peds.humanizePedestrian(ped);
    shoeMats.forEach((mat) => expect(mat.color.getHex()).toBe(0x1a1a1a));
    // And the undo list is drained, not replayed.
    expect(ped.zombieRestore).toBeNull();
  });
});

// ---- The day/night crew swap ---------------------------------------------------

describe('updatePedestrianZombieState (driven through the frame update)', () => {
  test('night zombifies the whole crew and the next day restores them', async () => {
    await boot({ pedestrians: { count: 2, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.016, 6.5);
    expect(peds.arePedestriansZombies()).toBe(false);

    goNight();
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.016, 6.5);
    expect(peds.arePedestriansZombies()).toBe(true);
    peds.getPedestrianMeshes().forEach((m) => expect(allHexes(m).has(0x5a7a5a)).toBe(true));

    goDay();
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.016, 6.5);
    expect(peds.arePedestriansZombies()).toBe(false);
    peds.getPedestrianMeshes().forEach((m) => {
      expect(allHexes(m).has(0x5a7a5a)).toBe(false);
      pupilsOf(m).forEach((p) => expect(p.material.emissiveIntensity).toBe(0));
    });
  });

  test('zombiesAtNight: false keeps the crew human after dark', async () => {
    await boot({ zombiesAtNight: false });
    peds.createSidewalkPedestrians();
    goNight();
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.016, 6.5);
    expect(peds.arePedestriansZombies()).toBe(false);
    peds.getPedestrianMeshes().forEach((m) => expect(allHexes(m).has(0x5a7a5a)).toBe(false));
  });
});

// ---- Zombie chase, return, and refuges ------------------------------------------

describe('zombie chase AI', () => {
  test('a zombie raises its arms and shambles straight toward the player', async () => {
    pinRandom();                                   // multiplier 0.53, direction +1
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    expect(mesh.position.x).toBe(-16);             // -18 + (0.6 - 0.5) * 20

    goNight();
    peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);

    // Chase pose: arms out at -π/2, slightly splayed per side.
    const arms = armsOf(mesh);
    expect(arms).toHaveLength(2);
    for (const arm of arms) {
      expect(arm.rotation.x).toBe(-Math.PI / 2);
      expect(arm.rotation.z).toBeCloseTo(arm.userData.armSide * 0.05, 12);
    }
    // Straight-line shamble: 6.5 * (0.35 + 0.6*0.3) * 0.1 toward +Z, no X drift.
    expect(mesh.position.x).toBe(-16);
    expect(mesh.position.z).toBeCloseTo(26.5 + 6.5 * 0.53 * 0.1, 10);
    // Turning is rate-limited to 3 rad/s, and the shamble bob lifts the feet.
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2 - 0.3, 10);
    expect(mesh.position.y).toBeCloseTo(0.055 + Math.abs(Math.sin(0.6 * Math.PI * 2 + 0.48)) * 0.03, 10);
  });

  test('the turn snaps once aligned, and inside 1.5m the zombie holds its ground', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    goNight();
    for (let i = 0; i < 6; i++) peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);
    expect(mesh.rotation.y).toBeCloseTo(0, 12);    // facing straight down +Z

    const close = { x: mesh.position.x, y: 1.7, z: mesh.position.z + 1.0 };
    const { x, z } = mesh.position;
    peds.updateSidewalkPedestrians(close, 0.1, 6.5);
    expect(mesh.position.x).toBe(x);               // dist <= 1.5: no advance
    expect(mesh.position.z).toBe(z);
  });

  test('crowded zombies push apart sideways while both still close in', async () => {
    pinRandom();
    await boot({ pedestrians: { count: 2, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    const [a, b] = peds.getPedestrianMeshes();
    goNight();
    a.position.set(0, 0.055, 26.5);
    b.position.set(0.5, 0.055, 26.5);
    peds.updateSidewalkPedestrians({ x: 0.25, y: 1.7, z: 60 }, 0.1, 6.5);
    expect(a.position.x).toBeLessThan(0);          // shoved left
    expect(b.position.x).toBeGreaterThan(0.5);     // shoved right
    expect(a.position.z).toBeGreaterThan(26.5);    // both still advancing
    expect(b.position.z).toBeGreaterThan(26.5);
  });

  test('ducking into the gallery drops the arms and walks the zombie home', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    goNight();
    peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);   // engage chase
    const rotAfterChase = mesh.rotation.y;

    // Player steps inside the gallery footprint; zombie is mid-street.
    mesh.position.set(5, 0.055, 40);
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 0 }, 0.1, 6.5);
    for (const arm of armsOf(mesh)) {
      expect(arm.rotation.x).toBeCloseTo(0.1, 12);
      expect(arm.rotation.z).toBeCloseTo(arm.userData.armSide * 0.15, 12);
    }
    // Returning at zombie pace (1.2 * 0.4) toward (0, sidewalkZ).
    const dist = Math.hypot(5, 40 - 26.5);
    expect(mesh.position.x).toBeCloseTo(5 - (5 / dist) * 0.048, 10);
    expect(mesh.position.z).toBeCloseTo(40 - (13.5 / dist) * 0.048, 10);
    expect(mesh.rotation.y).toBeCloseTo(rotAfterChase + 0.3, 10);          // turning home

    // Within half a meter of the sidewalk it snaps back on and resumes walking.
    mesh.position.set(3, 0.055, 26.9);
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 0 }, 0.1, 6.5);
    expect(mesh.position.z).toBe(26.5);
    expect(mesh.rotation.y).toBe(Math.PI / 2);
    expect(mesh.position.x).toBeCloseTo(3 + 1.2 * 0.4 * 0.1, 10);          // zombie walk speed
  });

  test('a registered refuge shelters the player; clearing it re-exposes them', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    goNight();
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 60 }, 0.1, 6.5);
    expect(armsOf(mesh)[0].rotation.x).toBe(-Math.PI / 2);                 // chasing

    peds.setRefugeFootprints([{ minX: -2, maxX: 2, minZ: 38, maxZ: 42 }]);
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.1, 6.5);     // in the shop
    expect(armsOf(mesh)[0].rotation.x).toBeCloseTo(0.1, 12);               // called off

    peds.setRefugeFootprints(null);                                        // clears the list
    peds.updateSidewalkPedestrians({ x: 0, y: 1.7, z: 40 }, 0.1, 6.5);     // same spot, no refuge
    expect(armsOf(mesh)[0].rotation.x).toBe(-Math.PI / 2);                 // chase resumes
  });
});

// ---- The collision slide helper ---------------------------------------------------

describe('pedestrianMoveWithSlide', () => {
  const stubPed = (x = 0, z = 0) => ({ mesh: { position: { x, z } } });
  const box = (minX, maxX, minZ, maxZ) => ({ box: { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } } });

  test('takes the full move when the way is clear', async () => {
    await boot();
    const ped = stubPed();
    peds.pedestrianMoveWithSlide(ped, 1, 1, 0.1);
    expect(ped.mesh.position).toEqual({ x: 1, z: 1 });
  });

  test('slides along the one clear axis when the diagonal is blocked', async () => {
    await boot();
    world.addCollider(box(-10, 10, 0.5, 2));      // a wall across Z
    const pedX = stubPed();
    peds.pedestrianMoveWithSlide(pedX, 1, 1, 0.1);
    expect(pedX.mesh.position).toEqual({ x: 1, z: 0 });

    world.getColliders().length = 0;
    world.addCollider(box(0.5, 2, -10, 10));      // a wall across X
    const pedZ = stubPed();
    peds.pedestrianMoveWithSlide(pedZ, 1, 1, 0.1);
    expect(pedZ.mesh.position).toEqual({ x: 0, z: 1 });
  });

  test('sidesteps perpendicular around a thin pole when blocked head-on', async () => {
    await boot();
    world.addCollider(box(-0.5, 0.5, 0.5, 1.5));  // the pole ahead
    world.addCollider(box(-0.2, 0.2, -0.3, 0.3)); // and the axis slides blocked
    const ped = stubPed();
    peds.pedestrianMoveWithSlide(ped, 0, 1, 0.1);
    // Intended move (0,0)->(0,1); first perpendicular try is (-1, 0).
    expect(ped.mesh.position).toEqual({ x: -1, z: 0 });
  });

  test('boxed in completely (or asked for a zero move) it stays put', async () => {
    await boot();
    world.addCollider(box(-50, 50, -50, 50));
    const ped = stubPed();
    peds.pedestrianMoveWithSlide(ped, 1, 1, 0.1);
    expect(ped.mesh.position).toEqual({ x: 0, z: 0 });
    peds.pedestrianMoveWithSlide(ped, 0, 0, 0.1); // mag < 0.0001 short-circuit
    expect(ped.mesh.position).toEqual({ x: 0, z: 0 });
  });
});

// ---- Daytime sidewalk behavior ------------------------------------------------------

describe('daytime walking', () => {
  test('walks at 1.2 m/s with a bob and turns at both boundaries', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    expect(mesh.rotation.y).toBe(Math.PI / 2);     // direction +1

    peds.updateSidewalkPedestrians(null, 0.5, 6.5);
    expect(mesh.position.x).toBeCloseTo(-16 + 1.2 * 0.5, 10);
    expect(mesh.position.y).toBeCloseTo(0.055 + Math.abs(Math.sin(0.6 * Math.PI * 2 + 4)) * 0.02, 10);

    mesh.position.x = 18.5;                        // past maxX
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(mesh.rotation.y).toBe(-Math.PI / 2);    // turned around
    const xAfterTurn = mesh.position.x;
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(mesh.position.x).toBeCloseTo(xAfterTurn - 0.12, 10);

    mesh.position.x = -18.5;                       // past minX
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(mesh.rotation.y).toBe(Math.PI / 2);     // and back again
  });

  test('slows down approaching someone ahead', async () => {
    pinRandom();
    await boot({ pedestrians: { count: 2, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    const [a, b] = peds.getPedestrianMeshes();
    a.position.set(10, 0.055, 26.5);
    b.position.set(11.5, 0.055, 26.5);             // 1.5m ahead, inside avoidDistance 2
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(a.position.x).toBeCloseTo(10 + 1.2 * 0.75 * 0.1, 10);  // scaled by 1.5/2
    expect(b.position.x).toBeCloseTo(11.5 + 0.12, 10);            // clear road ahead
  });

  test('stops dead behind someone close, then turns around after three stuck seconds', async () => {
    pinRandom();
    await boot({ pedestrians: { count: 2, ...PED_PATH } });
    peds.createSidewalkPedestrians();
    const [a, b] = peds.getPedestrianMeshes();
    for (let i = 1; i <= 3; i++) {
      a.position.set(10, 0.055, 26.5);
      b.position.set(10.5, 0.055, 26.5);
      peds.updateSidewalkPedestrians(null, 1, 6.5);
      expect(a.position.x).toBe(10);               // blocked, no bob either
      expect(a.position.y).toBe(0.055);
      expect(a.rotation.y).toBe(Math.PI / 2);      // still patient
    }
    a.position.set(10, 0.055, 26.5);
    b.position.set(10.5, 0.055, 26.5);
    peds.updateSidewalkPedestrians(null, 1, 6.5);  // stuckTimer passes 3s
    expect(a.rotation.y).toBe(-Math.PI / 2);       // gave up, turned around
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(a.position.x).toBeCloseTo(10 - 0.12, 10);
  });

  test('pauses to window shop, faces the storefront, and resumes on schedule', async () => {
    const spy = pinRandom();                       // build with 0.6...
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    mesh.position.x = 0.5;                         // near the gallery front
    spy.mockReturnValue(0.001);                    // ...then make the pause certain

    peds.updateSidewalkPedestrians(null, 1, 6.5);  // walks to 1.7, then pauses
    expect(mesh.position.x).toBeCloseTo(1.7, 10);
    expect(mesh.rotation.y).toBe(Math.PI);         // facing the shopfront
    peds.updateSidewalkPedestrians(null, 1, 6.5);  // timer 2.002 -> 1.002
    expect(mesh.position.x).toBeCloseTo(1.7, 10);  // rooted while pausing
    peds.updateSidewalkPedestrians(null, 1.1, 6.5); // timer expires
    expect(mesh.rotation.y).toBe(Math.PI / 2);     // back on the move
    spy.mockReturnValue(0.5);                      // no immediate re-pause
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(mesh.position.x).toBeCloseTo(1.82, 10);
  });
});

// ---- Dialog pause/resume ---------------------------------------------------------

describe('dialog handling', () => {
  test('a talking pedestrian freezes facing the player, then resumes walking', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];

    peds.resumePedestrianFromDialog();             // nothing in dialog: no-op
    peds.pausePedestrianForDialog({}, { x: 0, z: 0 }); // unknown mesh: ignored

    peds.pausePedestrianForDialog(mesh, { x: mesh.position.x + 3, z: mesh.position.z + 3 });
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 4, 12);
    const x = mesh.position.x;
    peds.updateSidewalkPedestrians(null, 1, 6.5);
    expect(mesh.position.x).toBe(x);               // rooted mid-conversation
    expect(mesh.position.y).toBe(0.055);

    peds.resumePedestrianFromDialog();
    expect(mesh.rotation.y).toBe(Math.PI / 2);
    peds.updateSidewalkPedestrians(null, 0.1, 6.5);
    expect(mesh.position.x).toBeCloseTo(x + 0.12, 10);
  });

  test('ending a dialog mid-chase lowers the arms and sends the zombie home first', async () => {
    pinRandom();
    await boot();
    peds.createSidewalkPedestrians();
    const mesh = peds.getPedestrianMeshes()[0];
    goNight();
    peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);   // chasing
    peds.pausePedestrianForDialog(mesh, { x: -16, z: 40 });
    const frozen = { x: mesh.position.x, z: mesh.position.z };
    peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);
    expect(mesh.position.x).toBe(frozen.x);        // talking beats chasing
    expect(mesh.position.z).toBe(frozen.z);

    peds.resumePedestrianFromDialog();
    for (const arm of armsOf(mesh)) expect(arm.rotation.x).toBeCloseTo(0.1, 12);

    // Player still out in the night: the chase re-engages on the next frame.
    peds.updateSidewalkPedestrians({ x: -16, y: 1.7, z: 40 }, 0.1, 6.5);
    expect(armsOf(mesh)[0].rotation.x).toBe(-Math.PI / 2);
  });
});
