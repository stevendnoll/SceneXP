// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the pirate mini golf experience's world build,
 * exercising the Phase 4/5 seam: family store.js orchestrating the shared
 * parts library (world, people, scenery, npcs, pedestrians), plus the
 * experience-specific golf circuit, splash story, and ocean audio toggle.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a reference to something
 * that stayed behind in the carve from the trail theme (or an import that
 * never got wired) throws and fails this suite instead of the live site.
 *
 * The golf engine's pure core (phase and time in, pose out; the circuit
 * state machine; the ball path math) also gets direct unit coverage via the
 * __test__ exports.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

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

let savedCreateObjectURL;

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;

  // The ocean's iOS keep-alive spins up a hidden <audio> element; give the
  // stubbed document a functional one (the canvas stub handles 'canvas').
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    if (tag === 'audio') {
      return {
        loop: false,
        src: '',
        setAttribute() {},
        play() { return { catch() {} }; },
        pause() {}
      };
    }
    return origCreateElement(tag);
  };

  // The keep-alive wav is served from a blob URL.
  savedCreateObjectURL = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:stub';

  // The ocean synthesizes surf and gulls through WebAudio.
  globalThis.window.AudioContext = chainable();

  // checklist/persistence guards read sessionStorage.
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  globalThis.URL.createObjectURL = savedCreateObjectURL;
  delete globalThis.sessionStorage;
});

test('the full course builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: family store.js resolves its imports to
  // the .min.js files, and module state must be shared with what we drive
  // here (the source files would be separate module instances). This is why
  // `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/family/js/store.js');
  const { FAMILY_CONFIG } = await import('../www/family/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, FAMILY_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('course');

  // The whole family showed up for their round
  expect(store.getFamilyMeshes()).toHaveLength(3);
  // Passersby are out on the sidewalk (the shared part may cap the count)
  expect(store.getPedestrianMeshes().length).toBeGreaterThan(0);
  // The background pair is desktop-only, so 0 or 2 but never a lone half
  expect([0, 2]).toContain(store.getBackgroundGolferMeshes().length);

  // The board repaint path main.js drives on every checklist change
  store.updateScorecardChecklist(
    FAMILY_CONFIG.checklist.items,
    { done: 2, total: 10, complete: false, booth: true, tee: true }
  );
  store.drawScorecardTo(chainable(), 800, 460);

  // A few frames of the round (the same calls main.js makes), including a
  // paused family member turning to face the player.
  const playerPos = { x: -18, y: 1.7, z: -2 };
  for (let i = 0; i < 5; i++) {
    store.updateFamilyGolfers(playerPos, 0.016);
    store.updateLagoon(0.016);
  }
  store.pauseGolferForDialog(store.getFamilyMeshes()[0], playerPos);
  for (let i = 0; i < 3; i++) store.updateFamilyGolfers(playerPos, 0.016);
  store.resumeGolferFromDialog();
  store.updateFamilyGolfers(playerPos, 0.016);

  // The discovery zones main.js polls from the player position
  expect(store.isOnShipDeck({ x: 20, z: 24 })).toBe(true);
  expect(store.isOnShipDeck({ x: -16, z: 4 })).toBe(false);
  expect(store.isOnPlank({ x: 22, z: 29 })).toBe(true);
  expect(store.isOnPlank({ x: 20, z: 29 })).toBe(false);
  expect(store.isOnPlank({ x: 22, z: 24 })).toBe(false);

  // The ocean toggles on (stubbed AudioContext) and back off, and the render
  // loop keeps ticking in both states (swell shaping and gull scheduling).
  expect(store.isOceanAudioOn()).toBe(false);
  expect(store.toggleOceanAudio()).toBe(true);
  expect(store.isOceanAudioOn()).toBe(true);
  for (let i = 0; i < 3; i++) store.updateOceanAudio(0.016);
  expect(store.toggleOceanAudio()).toBe(false);
  expect(store.isOceanAudioOn()).toBe(false);
  store.updateOceanAudio(0.016);
});

describe('the golf engine core (pure)', () => {
  let T;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/family/js/store.js');
    T = store.__test__;
  });

  const PHASES = ['idle', 'walk', 'aim', 'swing', 'watch', 'react', 'skim', 'celebrate'];

  test('every pose field stays finite across every phase and time', () => {
    PHASES.forEach((phase) => {
      for (let t = 0; t <= 1.001; t += 0.1) {
        const pose = T.puttPoseAt(phase, t);
        [
          pose.bounce, pose.sway, pose.lean, pose.yaw,
          pose.armP.swing, pose.armP.lift, pose.armN.swing, pose.armN.lift,
          pose.legP, pose.legN
        ].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      }
    });
  });

  test('the stroke is a two-handed pendulum along the target line', () => {
    // Putting is side-on, so the stroke lives on the lift (sideways) axis:
    // draw back toward the trail side, then swing through toward the hole.
    const address = T.puttPoseAt('swing', 0);
    const back = T.puttPoseAt('swing', 0.4);     // deep in the backswing
    const follow = T.puttPoseAt('swing', 0.9);   // holding the finish
    expect(back.armP.lift).toBeLessThan(address.armP.lift);
    expect(follow.armP.lift).toBeGreaterThan(back.armP.lift);
    // Both hands stay on the grip the whole way: the arms rock in lockstep,
    // so the inward fold (the sum of the lifts) never changes.
    const fold = address.armP.lift + address.armN.lift;
    expect(fold).toBeLessThan(0); // folded inward, hands stacked at midline
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const pose = T.puttPoseAt('swing', t);
      expect(pose.armP.lift + pose.armN.lift).toBeCloseTo(fold);
      expect(pose.armP.swing).toBeCloseTo(address.armP.swing); // reach stays put
    });
  });

  test('the stance is side-on with the hole to the left (right-handed)', () => {
    T.GOLF_CIRCUIT.forEach((station) => {
      const stance = T.puttingStance(station);
      const ball = station.ballPath[0];
      const next = station.ballPath[1];
      const travel = Math.atan2(next.x - ball.x, next.z - ball.z);
      // Perpendicular to the line, rotated so the target sits to the left
      let delta = stance.rotY - (travel - Math.PI / 2);
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      expect(Math.abs(delta)).toBeLessThan(1e-9);
      // Standing a hands' reach from the ball, not on top of it
      const dist = Math.hypot(stance.x - ball.x, stance.z - ball.z);
      expect(dist).toBeGreaterThan(0.25);
      expect(dist).toBeLessThan(0.5);
    });
  });

  test('celebrating arms go up, aiming arms stay down', () => {
    expect(T.puttPoseAt('celebrate', 0.3).armP.lift).toBeGreaterThan(1.5);
    expect(T.puttPoseAt('aim', 0.5).armP.lift).toBeLessThan(0.5);
  });

  test('polyline math: length and points along the way', () => {
    const path = [{ x: 0, z: 0 }, { x: 3, z: 4 }];
    expect(T.polylineLength(path)).toBeCloseTo(5);
    const mid = T.pointAlongPolyline(path, 2.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.z).toBeCloseTo(2);
    // Past the end clamps to the last point
    const end = T.pointAlongPolyline(path, 99);
    expect(end.x).toBeCloseTo(3);
    expect(end.z).toBeCloseTo(4);
  });

  test('the ball starts on the tee, ends in the cup, and never rolls backward', () => {
    const path = [{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 0, z: 5 }];
    expect(T.ballPositionAt(path, 0).z).toBeCloseTo(0);
    expect(T.ballPositionAt(path, 1).z).toBeCloseTo(5);
    let prev = -1;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const z = T.ballPositionAt(path, t).z;
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
  });

  test('the circuit is the planned loop with the plank story in order', () => {
    expect(T.GOLF_CIRCUIT).toHaveLength(4);
    expect(T.GOLF_CIRCUIT[3].key).toBe('plank');
    // Steve putts first everywhere (the kid always goes first)
    T.GOLF_CIRCUIT.forEach((station) => {
      expect(station.turns[0].member).toBe('steve');
    });
    // The plank story: splash, rescue, redemption, then the grown-ups
    expect(T.PLANK_TURNS.map((turn) => `${turn.member}:${turn.kind}`)).toEqual([
      'steve:splash', 'dad:skim', 'steve:putt', 'mom:putt', 'dad:putt'
    ]);
  });

  /** Run the state machine, collecting events, until a predicate or timeout. */
  function run(state, circuit, seconds) {
    const events = [];
    for (let t = 0; t < seconds; t += 0.05) {
      T.advanceGolfState(state, 0.05, circuit).forEach((e) => events.push(e));
    }
    return events;
  }

  /** Everything up to and including the first departure (single-station test
   *  circuits wrap onto themselves and would replay past it). */
  function firstVisit(events) {
    const idx = events.indexOf('depart');
    return idx === -1 ? events : events.slice(0, idx + 1);
  }

  test('a plank station plays splash, rescue, then three sinks, then departs', () => {
    const circuit = [{
      key: 'test-plank',
      path: [{ x: 0, z: 0 }, { x: 0, z: 2 }],
      turns: T.PLANK_TURNS
    }];
    const state = { mode: 'walking', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
    const events = firstVisit(run(state, circuit, 40));

    expect(events[0]).toBe('arrive');
    const story = events.filter((e) => ['splash', 'skim-done', 'sink'].includes(e));
    expect(story).toEqual(['splash', 'skim-done', 'sink', 'sink', 'sink']);
    expect(events[events.length - 1]).toBe('depart');
    // A one-station circuit wraps back onto itself and keeps playing
    expect(state.station).toBe(0);
  });

  test('a standard station sinks three putts in member order', () => {
    const circuit = [{
      key: 'test-std',
      path: [{ x: 0, z: 0 }, { x: 0, z: 1 }],
      turns: T.STANDARD_TURNS
    }];
    const state = { mode: 'walking', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
    const events = firstVisit(run(state, circuit, 30));
    expect(events.filter((e) => e === 'sink')).toHaveLength(3);
    expect(events.filter((e) => e === 'splash')).toHaveLength(0);
  });

  test('the state machine is deterministic', () => {
    const circuit = [{
      key: 'test-det',
      path: [{ x: 0, z: 0 }, { x: 0, z: 1 }],
      turns: T.STANDARD_TURNS
    }];
    const a = { mode: 'walking', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
    const b = { mode: 'walking', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
    const eventsA = run(a, circuit, 12);
    const eventsB = run(b, circuit, 12);
    expect(eventsA).toEqual(eventsB);
    expect(a).toEqual(b);
  });

  test('the loop cannot wedge: every mode keeps advancing on time alone', () => {
    // Walk the real circuit for five simulated minutes and confirm it keeps
    // producing departures (the loop's heartbeat) the whole way around.
    const state = { mode: 'turn', station: 0, dist: 0, turn: 0, phase: 'aim', phaseT: 0 };
    const events = run(state, T.GOLF_CIRCUIT, 300);
    const departures = events.filter((e) => e === 'depart').length;
    expect(departures).toBeGreaterThanOrEqual(2);
    // And the plank splashed somewhere along the way
    expect(events).toContain('splash');
  });

  test('discovery zones match the layout', () => {
    const { plank, ship } = T.LAYOUT;
    expect(T.isOnPlank({ x: plank.x, z: (plank.minZ + plank.maxZ) / 2 })).toBe(true);
    expect(T.isOnShipDeck({ x: (ship.minX + ship.maxX) / 2, z: (ship.minZ + ship.maxZ) / 2 })).toBe(true);
    // The gangplank approach is not yet "aboard"
    expect(T.isOnShipDeck({ x: 14, z: 18 })).toBe(false);
  });

  test('phase durations are sane (positive, short enough to watch)', () => {
    Object.values(T.DURATIONS).forEach((duration) => {
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10);
    });
  });
});
