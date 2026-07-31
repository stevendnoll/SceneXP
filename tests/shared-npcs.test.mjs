// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Behavioral unit tests for www/shared/js/npcs-1.0.0.js — the indoor visitor
 * cast: wander waypoints, gallery visitor spawning, the walking AI (pathing,
 * steering, arrival, stuck recovery), dialog pause/resume, the greeter's
 * look-at behavior, and the floating help sign.
 *
 * The shared-cast sweep runs this module under the chainable THREE proxy,
 * which absorbs all the vector math, so the per-frame AI never really moves
 * anyone. Here the two min-bundle imports (world, people) are replaced via
 * jest.unstable_mockModule with tiny REAL stubs: positions and rotations hold
 * actual numbers, colliders are plain {box:{min,max}} entries the test
 * controls, and createPerson returns a bare group at the requested spot. That
 * lets the tests assert behavior, not just execution: a visitor walks TOWARD
 * her waypoint and faces the piece on arrival, a wall actually stops her, a
 * dialog freezes her mid-stride, the host turns to face the player at his
 * configured turn speed, and the help sign bobs and billboards.
 *
 * The module's wander variety comes from Math.random (pause durations, bob
 * phase), so assertions are invariants (distance decreased, personal space
 * never violated, position stayed outside a fixture) driven by explicit
 * deltaTime ticks, never exact random values.
 */
import { jest } from '@jest/globals';

// ---- Real-number stand-ins for the THREE objects the module builds ----------

class StubVec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class StubGroup {
  constructor() {
    this.children = [];
    this.position = new StubVec();
    this.rotation = new StubVec();
    this.userData = {};
    this.name = '';
    this.visible = true;
    this.parent = null;
  }
  add(...cs) { for (const c of cs) { this.children.push(c); c.parent = this; } return this; }
  traverse(fn) { fn(this); for (const c of this.children) { if (c.traverse) c.traverse(fn); else fn(c); } }
}

class StubMesh extends StubGroup {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

// Recording 2D contexts, so the sign tests can assert what text was drawn.
const ctxLog = [];
function makeCtx() {
  const ctx = { texts: [], fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '' };
  for (const m of ['beginPath', 'roundRect', 'fill', 'stroke']) ctx[m] = () => {};
  ctx.fillText = (text) => ctx.texts.push(text);
  ctxLog.push(ctx);
  return ctx;
}

function installGlobals() {
  globalThis.THREE = {
    Group: StubGroup,
    Mesh: StubMesh,
    Vector3: StubVec,
    PlaneGeometry: class { constructor(w, h) { this.width = w; this.height = h; } },
    MeshBasicMaterial: class { constructor(p = {}) { Object.assign(this, p); } },
    CanvasTexture: class { constructor(canvas) { this.canvas = canvas; this.needsUpdate = false; } },
    DoubleSide: 2,
  };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
  };
}

// ---- Mocked min bundles ------------------------------------------------------

// The npcs source imports ./world-1.0.0.min.js and ./people-1.0.0.min.js.
// These mocks give the tests direct control over the world group, the world
// config, and the collider list, and make createPerson return a real-numbered
// group at exactly the requested spot.
const worldState = { group: null, config: {}, colliders: [] };
const personLog = { calls: [] };

function makePerson(opts = {}) {
  const p = new StubGroup();
  p.position.set(opts.x ?? 0, 0, opts.z ?? 0);
  p.rotation.y = opts.rotationY ?? 0;
  p.userData.role = opts.role;
  return p;
}

jest.unstable_mockModule('../www/shared/js/world-1.0.0.min.js', () => ({
  getWorldGroup: () => worldState.group,
  getWorldConfig: () => worldState.config,
  addCollider: (entry) => { worldState.colliders.push(entry); },
  getColliders: () => worldState.colliders,
}));

jest.unstable_mockModule('../www/shared/js/people-1.0.0.min.js', () => ({
  createPerson: (opts = {}) => { personLog.calls.push(opts); return makePerson(opts); },
  // Deterministic draw: the first n designs, in pool order.
  pickBalanced: (pool, n) => pool.slice(0, Math.max(0, n)),
}));

// ---- Harness -------------------------------------------------------------------

let npcs;
const PLAYER = { x: 0, y: 1.7, z: 16 };
const W = { x: 0, z: 0, lookAtX: 0, lookAtZ: -2 }; // the default walk target

const dist = (mesh, p) => Math.hypot(mesh.position.x - p.x, mesh.position.z - p.z);
const tick = (n, dt) => { for (let i = 0; i < n; i++) npcs.updateCustomerAI(PLAYER, dt); };

/** Spawn the single browser visitor and burn through her 1.0-2.5 s pause with
 *  coarse half-second ticks, so she is in the 'walking' state when we return. */
function startBrowserWalk(spawnX, spawnZ, waypoint = W) {
  npcs.setWanderWaypoints([waypoint]);
  const meshes = npcs.initGalleryBrowser(spawnX, spawnZ);
  for (let i = 0; i < 6; i++) npcs.updateCustomerAI(PLAYER, 0.5);
  return meshes[0];
}

beforeEach(async () => {
  installGlobals();
  worldState.group = new StubGroup();
  worldState.config = { building: { width: 40, depth: 40, positionX: 0, positionZ: 0 } };
  worldState.colliders = [];
  personLog.calls = [];
  ctxLog.length = 0;
  jest.resetModules();
  npcs = await import('../www/shared/js/npcs-1.0.0.js');
});

afterEach(() => {
  delete globalThis.THREE;
  delete globalThis.document;
});

// ---- Waypoints -------------------------------------------------------------------

describe('wander waypoints', () => {
  test('no waypoints (or junk input) means no destination', () => {
    expect(npcs.getRandomWaypoint()).toBeNull();
    npcs.setWanderWaypoints('not a list');
    expect(npcs.getRandomWaypoint()).toBeNull();
  });

  test('the current spot is excluded, so a wanderer always goes somewhere new', () => {
    const here = { x: 0, z: 0, lookAtX: 0, lookAtZ: -2 };
    const there = { x: 10, z: 0, lookAtX: 10, lookAtZ: -2 };
    npcs.setWanderWaypoints([here, there]);
    for (let i = 0; i < 8; i++) {
      expect(npcs.getRandomWaypoint(here)).toBe(there);
    }
  });

  test('spots within a meter of the excluded one count as the same spot', () => {
    const near = { x: 0.5, z: 0.5, lookAtX: 0, lookAtZ: 0 };
    const far = { x: 9, z: 9, lookAtX: 0, lookAtZ: 0 };
    npcs.setWanderWaypoints([near, far]);
    for (let i = 0; i < 8; i++) {
      expect(npcs.getRandomWaypoint({ x: 0, z: 0 })).toBe(far);
    }
  });

  test('when every spot is excluded the exclusion relaxes rather than stranding anyone', () => {
    const only = { x: 0, z: 0, lookAtX: 0, lookAtZ: -2 };
    npcs.setWanderWaypoints([only]);
    expect(npcs.getRandomWaypoint(only)).toBe(only);
  });
});

// ---- Spawning --------------------------------------------------------------------

describe('initGalleryVisitors', () => {
  const SPOTS = [
    { x: 0, z: 6, lookAtX: 0, lookAtZ: 8 },
    { x: -4, z: 2, lookAtX: -6, lookAtZ: 2 },
    { x: 4, z: -2, lookAtX: 4, lookAtZ: -4 },
  ];

  test('requires a world group and at least one waypoint', () => {
    worldState.group = null;
    expect(npcs.initGalleryVisitors(3)).toEqual([]);
    worldState.group = new StubGroup();
    npcs.setWanderWaypoints([]);
    expect(npcs.initGalleryVisitors(3)).toEqual([]);
  });

  test('visitors spawn spread across the viewing spots, nearest the entrance first, each facing their piece', () => {
    npcs.setWanderWaypoints(SPOTS);
    const meshes = npcs.initGalleryVisitors(3);
    expect(meshes).toHaveLength(3);
    expect(npcs.getVisitorMeshes()).toBe(meshes);

    // Spots are visited in entrance-first (descending z) order.
    const expected = [SPOTS[0], SPOTS[1], SPOTS[2]];
    meshes.forEach((mesh, i) => {
      expect(mesh.position.x).toBe(expected[i].x);
      expect(mesh.position.z).toBe(expected[i].z);
      const face = Math.atan2(expected[i].lookAtX - expected[i].x, expected[i].lookAtZ - expected[i].z);
      expect(mesh.rotation.y).toBeCloseTo(face, 10);
    });

    // All parented under one 'galleryVisitors' group inside the world group.
    const group = worldState.group.children.find((c) => c.name === 'galleryVisitors');
    expect(group).toBeTruthy();
    expect(group.children).toHaveLength(3);
  });

  test('asking for more visitors than there are spots stops at the spots', () => {
    npcs.setWanderWaypoints(SPOTS);
    expect(npcs.initGalleryVisitors(10)).toHaveLength(3);
  });

  test('an experience-supplied skin tone palette overrides the design pool tones', () => {
    worldState.config.visitors = { skinTones: [0x123456] };
    npcs.setWanderWaypoints(SPOTS);
    npcs.initGalleryVisitors(3);
    for (const call of personLog.calls) {
      expect(call.skinTone).toBe(0x123456);
    }
  });
});

describe('initGalleryBrowser', () => {
  test('requires a world group', () => {
    worldState.group = null;
    expect(npcs.initGalleryBrowser(6, 0)).toEqual([]);
  });

  test('spawns the one reserved violet-dress visitor at the caller-chosen spot, facing the podium row', () => {
    npcs.setWanderWaypoints([
      { x: -3, z: 10, lookAtX: -3, lookAtZ: 12 },
      { x: 3, z: 10, lookAtX: 3, lookAtZ: 12 },
    ]);
    const meshes = npcs.initGalleryBrowser(6, 14);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].position.x).toBe(6);
    expect(meshes[0].position.z).toBe(14);
    // The reserved look, so no street pedestrian reads as the same person.
    expect(personLog.calls[0].shirtColor).toBe(npcs.INDOOR_VISITOR_LOOK.shirtColor);
    expect(personLog.calls[0].hairStyle).toBe('long');
    // Faces the centroid of the podium lookAt targets: (0, 12).
    expect(meshes[0].rotation.y).toBeCloseTo(Math.atan2(0 - 6, 12 - 14), 10);
  });
});

// ---- Clear-spawn picking -----------------------------------------------------------

describe('findClearSpawn', () => {
  test('an unoccupied spot is returned untouched', () => {
    expect(npcs.findClearSpawn(2, 3, 0.3)).toEqual({ x: 2, z: 3 });
  });

  test('a visitor loitering on the spot nudges the player to the nearest clear opening', () => {
    npcs.setWanderWaypoints([{ x: -50, z: -50, lookAtX: 0, lookAtZ: 0 }]);
    npcs.initGalleryBrowser(2, 3); // she stands exactly on the desired spot
    const spawn = npcs.findClearSpawn(2, 3, 0.3);
    // First ring candidate: 1 m along angle 0 (+x), clear of her 0.9 m bubble.
    expect(spawn.x).toBeCloseTo(3, 10);
    expect(spawn.z).toBeCloseTo(3, 10);
  });

  test('when every nearby opening is blocked it lands on the original spot anyway', () => {
    npcs.setWanderWaypoints([{ x: -50, z: -50, lookAtX: 0, lookAtZ: 0 }]);
    npcs.initGalleryBrowser(2, 3);
    worldState.colliders.push({ box: { min: { x: -100, z: -100 }, max: { x: 100, z: 100 } } });
    expect(npcs.findClearSpawn(2, 3, 0.3)).toEqual({ x: 2, z: 3 });
  });
});

// ---- The walk cycle -----------------------------------------------------------------

describe('the walk cycle', () => {
  test('after the pause expires she walks toward her waypoint, bobbing as she goes', () => {
    const mesh = startBrowserWalk(6, 0);
    const d0 = dist(mesh, W);
    expect(d0).toBeLessThan(6); // the coarse startup ticks already moved her

    const ys = [];
    for (let i = 0; i < 20; i++) {
      npcs.updateCustomerAI(PLAYER, 0.05);
      ys.push(mesh.position.y);
    }
    // One second at ~1 m/s: meaningfully closer, still on the straight line.
    expect(dist(mesh, W)).toBeLessThan(d0 - 0.5);
    expect(mesh.position.z).toBeCloseTo(0, 10);
    // Walking bob: y oscillates around baseY within the configured amplitude.
    expect(Math.max(...ys)).toBeGreaterThan(0.055);
    for (const y of ys) expect(Math.abs(y - 0.055)).toBeLessThanOrEqual(0.021);
  });

  test('she arrives at the piece, turns to admire it, and stands still while pausing', () => {
    const mesh = startBrowserWalk(6, 0);
    let guard = 0;
    while (dist(mesh, W) >= 0.3 && guard++ < 400) npcs.updateCustomerAI(PLAYER, 0.05);
    expect(dist(mesh, W)).toBeLessThan(0.3); // she covered the whole distance

    npcs.updateCustomerAI(PLAYER, 0.05); // the arrival tick
    expect(mesh.position.y).toBe(0.055);  // bob resets on arrival
    const face = Math.atan2(W.lookAtX - mesh.position.x, W.lookAtZ - mesh.position.z);
    expect(mesh.rotation.y).toBeCloseTo(face, 10);

    // Paused for at least pauseTimeMin (3 s): one more second changes nothing.
    const { x, z } = mesh.position;
    tick(20, 0.05);
    expect(mesh.position.x).toBe(x);
    expect(mesh.position.z).toBe(z);
  });

  test('with no waypoints left she waits politely instead of wandering off', () => {
    npcs.setWanderWaypoints([W]);
    const [mesh] = npcs.initGalleryBrowser(6, 2);
    npcs.setWanderWaypoints([]); // the spots vanish before she ever moves
    tick(20, 0.5);               // 10 s: several pause expiries, no destination
    expect(mesh.position.x).toBe(6);
    expect(mesh.position.z).toBe(2);
  });

  test('a wall stops her cold, stuck recovery re-picks, and losing the waypoints parks her', () => {
    // A bare wall (no `type`) across her straight-line path.
    worldState.colliders.push({ box: { min: { x: 2.5, z: -5 }, max: { x: 3, z: 5 } } });
    const mesh = startBrowserWalk(6, 0);
    tick(80, 0.1); // 8 s: reach the wall (~2.5 s), then several stuck cycles
    // Blocked at the expanded wall face (x = 3.5), never through it.
    expect(mesh.position.x).toBeGreaterThan(3.5);
    expect(mesh.position.x).toBeLessThanOrEqual(3.7);
    expect(mesh.position.z).toBeCloseTo(0, 10);

    // Now the waypoints disappear mid-struggle: the next stuck re-pick gets
    // null, she drops to paused, and every later pause expiry finds nothing.
    npcs.setWanderWaypoints([]);
    tick(150, 0.1);
    const { x, z } = mesh.position;
    tick(20, 0.1);
    expect(mesh.position.x).toBe(x);
    expect(mesh.position.z).toBe(z);
    expect(mesh.position.x).toBeGreaterThan(3.5); // still on the near side
  });
});

// ---- Steering and personal space -----------------------------------------------------

describe('steering and personal space', () => {
  test('two visitors crossing the room never violate each other\'s personal space', () => {
    const a = { x: 0, z: 0, lookAtX: 0, lookAtZ: -2 };
    const b = { x: 6, z: 0.8, lookAtX: 6, lookAtZ: -2 };
    npcs.setWanderWaypoints([a, b]);
    const meshes = npcs.initGalleryVisitors(2);
    expect(meshes).toHaveLength(2);
    const [v0, v1] = meshes; // v0 at b (higher z), v1 at a

    let minGap = Infinity;
    let v0Closest = Infinity;
    let v1Closest = Infinity;
    for (let i = 0; i < 600; i++) {
      npcs.updateCustomerAI(PLAYER, 0.1);
      minGap = Math.min(minGap, dist(v0, v1.position));
      v0Closest = Math.min(v0Closest, dist(v0, a));
      v1Closest = Math.min(v1Closest, dist(v1, b));
    }
    // The avoidance + hard check keep them at least a body apart, always.
    expect(minGap).toBeGreaterThanOrEqual(1.0 - 1e-9);
    // And each crossed most of the room toward the other's piece (their only
    // option), even if the other was still loitering on it when they got close.
    expect(v0Closest).toBeLessThan(2.0);
    expect(v1Closest).toBeLessThan(2.0);
  });

  test('a potted fixture near the path is steered around, never clipped through', () => {
    // A typed obstacle straddling her straight line to the waypoint.
    const box = { min: { x: 2.7, z: 0.2 }, max: { x: 3.2, z: 0.7 } };
    worldState.colliders.push({ box, type: 'plant' });
    const mesh = startBrowserWalk(6, 0);

    let guard = 0;
    while (dist(mesh, W) >= 0.3 && guard++ < 900) {
      npcs.updateCustomerAI(PLAYER, 0.05);
      // Never inside the fixture's expanded footprint (radius 0.5).
      const inside = mesh.position.x > box.min.x - 0.5 && mesh.position.x < box.max.x + 0.5 &&
        mesh.position.z > box.min.z - 0.5 && mesh.position.z < box.max.z + 0.5;
      expect(inside).toBe(false);
    }
    expect(dist(mesh, W)).toBeLessThan(0.3); // the detour still got her there
  });

  test('even a wall of fixtures (avoidance force capped) never pushes through or panics her', () => {
    // Four stacked typed boxes right beside the spawn: the summed steering
    // force far exceeds maxAvoidForce, exercising the cap.
    const box = { min: { x: 4.6, z: -0.3 }, max: { x: 5.1, z: 0.3 } };
    for (let i = 0; i < 4; i++) worldState.colliders.push({ box, type: 'plant' });
    const mesh = startBrowserWalk(5.8, 0);

    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 200; i++) {
      npcs.updateCustomerAI(PLAYER, 0.05);
      minX = Math.min(minX, mesh.position.x);
      maxX = Math.max(maxX, mesh.position.x);
    }
    // The hard boundary sits at 5.1 + 0.5 = 5.6: never crossed.
    expect(minX).toBeGreaterThan(5.6 - 1e-9);
    // And the capped steering pushed her back out rather than pinning her.
    expect(maxX).toBeGreaterThan(5.9);
  });
});

// ---- Dialog pause / resume -------------------------------------------------------------

describe('dialog pause and resume', () => {
  test('a clicked visitor turns to face the player and freezes mid-stride', () => {
    const mesh = startBrowserWalk(6, 0);
    const player = { x: 10, y: 1.7, z: 4 };
    npcs.pauseCustomerForDialog(mesh, player);
    expect(mesh.rotation.y).toBeCloseTo(
      Math.atan2(player.x - mesh.position.x, player.z - mesh.position.z), 10);

    const { x, z } = mesh.position;
    tick(30, 0.1); // 3 s of frames while the dialog is open
    expect(mesh.position.x).toBe(x);
    expect(mesh.position.z).toBe(z);
    expect(mesh.position.y).toBe(0.055); // no bob while talking
  });

  test('after the dialog closes she takes a breath and then strolls on', () => {
    const mesh = startBrowserWalk(6, 0);
    npcs.pauseCustomerForDialog(mesh, PLAYER);
    npcs.resumeCustomerFromDialog();
    const { x, z } = mesh.position;
    tick(30, 0.1); // the 1 s courtesy pause, then walking again
    const moved = Math.hypot(mesh.position.x - x, mesh.position.z - z);
    expect(moved).toBeGreaterThan(0.5);
  });

  test('unknown meshes and dialog-less resumes are graceful no-ops', () => {
    const mesh = startBrowserWalk(6, 0);
    const before = mesh.rotation.y;
    npcs.pauseCustomerForDialog({ not: 'a visitor' }, PLAYER);
    expect(mesh.rotation.y).toBe(before);
    expect(() => npcs.resumeCustomerFromDialog()).not.toThrow();
  });
});

// ---- The host's look-at behavior ---------------------------------------------------------

describe('the host look-at behavior', () => {
  test('a registered host turns to face a visitor inside the showroom', () => {
    const host = makePerson({ x: 0, z: 0 });
    npcs.registerHost(host, 0);
    expect(npcs.getGalleryHost()).toBe(host);
    // A generous deltaTime lets him complete the turn in one update.
    npcs.updateStorePeople({ x: 5, y: 1.7, z: 5 }, 1);
    expect(host.rotation.y).toBeCloseTo(Math.PI / 4, 10);
  });

  test('he turns at his configured speed, never snapping', () => {
    const host = makePerson({ x: 0, z: 0 });
    npcs.registerHost(host, 0);
    npcs.updateShopkeeperBehavior({ x: 5, y: 1.7, z: 5 }, 0.05);
    // turnSpeed 4 rad/s * 0.05 s = 0.2 rad, well short of the pi/4 target.
    expect(host.rotation.y).toBeCloseTo(0.2, 10);
  });

  test('when the visitor steps outside he settles back to his default pose', () => {
    const host = makePerson({ x: 0, z: 0 });
    npcs.registerHost(host, 0.7);
    host.rotation.y = 0.0;
    // Building is 40x40 at the origin, so x=30 is outside.
    npcs.updateShopkeeperBehavior({ x: 30, y: 1.7, z: 0 }, 0.05);
    expect(host.rotation.y).toBeCloseTo(0.2, 10); // stepping toward 0.7
    npcs.updateShopkeeperBehavior({ x: 30, y: 1.7, z: 0 }, 10);
    expect(host.rotation.y).toBeCloseTo(0.7, 10); // and arriving there
  });

  test('the turn takes the short way around the +/-pi seam', () => {
    const host = makePerson({ x: 0, z: 0 });
    npcs.registerHost(host, 0);
    host.rotation.y = 3.1;
    // Target just past -pi: atan2(-0.1, -1) ~ -3.04, i.e. 0.14 rad "up" from 3.1.
    npcs.updateShopkeeperBehavior({ x: -0.1, y: 1.7, z: -1 }, 0.01);
    expect(host.rotation.y).toBeGreaterThan(3.1); // wrapped, not a long swing back
    expect(host.rotation.y).toBeCloseTo(3.14, 10);
  });

  test('his world position accounts for the parent chain, not just local coordinates', () => {
    const pedestal = new StubGroup();
    pedestal.position.set(8, 0, 0);
    const host = makePerson({ x: 2, z: 0 }); // world position (10, 0)
    pedestal.add(host);
    worldState.group.add(pedestal);
    npcs.registerHost(host, 0);
    npcs.updateShopkeeperBehavior({ x: 13, y: 1.7, z: 3 }, 1);
    // Facing computed from (10, 0): atan2(3, 3). From local (2, 0) it'd be ~1.3.
    expect(host.rotation.y).toBeCloseTo(Math.PI / 4, 10);
  });

  test('an unregistered host is discovered by its isShopkeeper tag, and no host is a no-op', () => {
    npcs.updateShopkeeperBehavior(PLAYER, 0.1); // nothing to find yet
    expect(npcs.getGalleryHost()).toBeFalsy();

    const host = makePerson({ x: 0, z: 0 });
    host.userData.isShopkeeper = true;
    worldState.group.add(host);
    npcs.updateShopkeeperBehavior({ x: 5, y: 1.7, z: 5 }, 1);
    expect(npcs.getGalleryHost()).toBe(host);
    expect(host.rotation.y).toBeCloseTo(Math.PI / 4, 10);
  });
});

// ---- The floating signs ---------------------------------------------------------------------

describe('the floating signs', () => {
  test('the help sign builds visible above the host with its glow tucked behind', () => {
    const sign = npcs.createHelpSign(2, -1);
    expect(sign.visible).toBe(true);
    expect(sign.position.x).toBe(2);
    expect(sign.position.y).toBe(2.6);
    expect(sign.position.z).toBe(-1);
    expect(sign.userData.isShopkeeperSign).toBe(true);
    expect(sign.children).toHaveLength(2);
    expect(sign.children[0].position.z).toBe(-0.01); // glow sits behind the face
    expect(ctxLog[0].texts).toContain('Help');
    npcs.setHelpSign(sign);
    expect(npcs.getHelpSign()).toBe(sign);
  });

  test('the help sign bobs on its base height and billboards toward the camera', () => {
    const sign = npcs.createHelpSign(2, -1);
    npcs.setHelpSign(sign);
    const t = Math.PI / 4;
    npcs.updateCheckoutSign(t, { x: 5, z: 3 });
    expect(sign.position.y).toBeCloseTo(2.6 + Math.sin(t * 2) * 0.1, 10);
    expect(sign.rotation.y).toBeCloseTo(Math.atan2(5 - 2, 3 - (-1)), 10);
    // Without a camera it still bobs but leaves the facing alone.
    const facing = sign.rotation.y;
    npcs.updateCheckoutSign(1.0);
    expect(sign.position.y).toBeCloseTo(2.6 + Math.sin(2) * 0.1, 10);
    expect(sign.rotation.y).toBe(facing);
  });

  test('hiding the help sign freezes it; showing it resumes the bob', () => {
    const sign = npcs.createHelpSign(0, 0);
    npcs.setHelpSign(sign);
    npcs.hideHelpSign();
    expect(sign.visible).toBe(false);
    const y = sign.position.y;
    npcs.updateCheckoutSign(0.8, { x: 1, z: 1 });
    expect(sign.position.y).toBe(y);
    npcs.showHelpSign();
    expect(sign.visible).toBe(true);
    npcs.updateCheckoutSign(0.8, { x: 1, z: 1 });
    expect(sign.position.y).not.toBe(y);
  });

  test('the sign update is a graceful no-op with no sign registered', () => {
    expect(() => {
      npcs.updateCheckoutSign(0.5, { x: 0, z: 0 });
    }).not.toThrow();
  });
});

// ---- Collision queries ------------------------------------------------------------------------

describe('collision queries', () => {
  test('checkPositionCollision (and its checkWorldCollision alias) expand boxes by the radius', () => {
    worldState.colliders.push({ box: { min: { x: -1, z: -1 }, max: { x: 1, z: 1 } } });
    expect(npcs.checkPositionCollision(0, 0, 0.2)).toBe(true);
    expect(npcs.checkPositionCollision(1.15, 0, 0.2)).toBe(true);  // inside the expanded rim
    expect(npcs.checkPositionCollision(1.25, 0, 0.2)).toBe(false); // just past it
    expect(npcs.checkWorldCollision).toBe(npcs.checkPositionCollision);
  });

  test('checkCustomerCollision also respects other visitors, excluding the asker', () => {
    npcs.setWanderWaypoints([{ x: -50, z: -50, lookAtX: 0, lookAtZ: 0 }]);
    npcs.initGalleryBrowser(6, 0); // customer index 0 standing at (6, 0)
    expect(npcs.checkCustomerCollision(6.5, 0, 0.5, -1)).toBe(true);  // within 2 radii of her
    expect(npcs.checkCustomerCollision(6.5, 0, 0.5, 0)).toBe(false);  // she doesn't block herself
    worldState.colliders.push({ box: { min: { x: 20, z: 20 }, max: { x: 21, z: 21 } } });
    expect(npcs.checkCustomerCollision(20.5, 20.5, 0.3, -1)).toBe(true);
  });
});
