// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for the Zumba studio experience's world build, exercising
 * the Phase 4/5 seam: roqui store.js orchestrating the shared parts library
 * (world, textures, structures, lighting, furniture, people, scenery, npcs),
 * plus the experience-specific dance engine and music toggle.
 *
 * Under the chainable THREE proxy nothing renders, but every function that
 * would run during a real page load runs here, so a reference to something
 * that stayed behind in the carve from the trail theme (or an import that
 * never got wired) throws and fails this suite instead of the live site.
 *
 * The dance engine's pure core (beats in, pose out) also gets direct unit
 * coverage via the __test__ exports.
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
  // The playlist's iOS keep-alive spins up a hidden <audio> element; give the
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
  // The studio's playlist synthesizes percussion through WebAudio.
  globalThis.window.AudioContext = chainable();
  // checklist/persistence guards read sessionStorage.
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  globalThis.URL.createObjectURL = savedCreateObjectURL;
  delete globalThis.sessionStorage;
});

test('the full studio builds and ticks without throwing', async () => {
  jest.resetModules();
  // Import the BUILT shared modules: roqui store.js resolves its imports to
  // the .min.js files, and module state must be shared with what we drive
  // here (the source files would be separate module instances). This is why
  // `npm run build` must run before `npm test` after any shared edit.
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const world = await import('../www/shared/js/world-1.0.0.min.js');
  const store = await import('../www/roqui/js/store.js');
  const { ROQUI_CONFIG } = await import('../www/roqui/js/config.js');

  // Same order main.js uses.
  scene.initScene({}, ROQUI_CONFIG);
  const colliders = store.initStore();
  expect(Array.isArray(colliders)).toBe(true);
  expect(colliders.length).toBeGreaterThan(0);
  expect(world.getWorldGroup()).not.toBeNull();
  expect(world.getWorldConfig().rootName).toBe('studio');

  // Roqui and her whole class showed up
  expect(store.getRoquiMesh()).not.toBeNull();
  expect(store.getDancerMeshes()).toHaveLength(ROQUI_CONFIG.dancers.count);

  // The floating greeter sign honors the config toggle (off in this
  // experience, so it was never built or registered)
  expect(ROQUI_CONFIG.greeterSign.enabled).toBe(false);
  expect(store.getHelpSign()).toBeFalsy();

  // The board repaint path main.js drives on every checklist change
  store.updateStudioBoard(
    ROQUI_CONFIG.checklist.items,
    { done: 1, total: 8, complete: false, hello: true }
  );
  store.drawStudioBoardTo(chainable(), 800, 460);

  // A few frames of the class dancing (the same call main.js makes),
  // including a paused dancer turning to face the player.
  const playerPos = { x: 0, y: 1.6, z: 4.6 };
  store.pauseDancerForDialog(store.getDancerMeshes()[0]);
  for (let i = 0; i < 5; i++) store.updateStudio(playerPos, 0.016);
  store.resumeDancerFromDialog();
  store.pauseRoquiForDialog();
  store.updateStudio(playerPos, 0.016);
  store.resumeRoquiFromDialog();

  // The brightness slider path main.js drives (folds into the party dim)
  store.setStudioBrightness(0.8);

  // The playlist toggles on (stubbed AudioContext) and back off, and the
  // render loop keeps ticking in both states (party dim easing included).
  expect(store.isMusicPlaying()).toBe(false);
  expect(store.toggleStudioMusic()).toBe(true);
  expect(store.isMusicPlaying()).toBe(true);
  for (let i = 0; i < 3; i++) store.updateStudio(playerPos, 0.016);
  expect(store.toggleStudioMusic()).toBe(false);
  expect(store.isMusicPlaying()).toBe(false);
  for (let i = 0; i < 3; i++) store.updateStudio(playerPos, 0.016);
});

describe('the dance engine core (pure)', () => {
  let T;

  beforeEach(async () => {
    jest.resetModules();
    const store = await import('../www/roqui/js/store.js');
    T = store.__test__;
  });

  const LEADER = { lag: 0, amp: 1.15, catchup: 0, wobblePhase: 0, leader: true };
  const FOLLOWER = { lag: 0.5, amp: 0.9, catchup: 0.8, wobblePhase: 2.4, leader: false };

  test('the routine advances one move per 8 beats and loops', () => {
    expect(T.routineIndexAt(0)).toBe(0);
    expect(T.routineIndexAt(7.99)).toBe(0);
    expect(T.routineIndexAt(8)).toBe(1);
    expect(T.routineIndexAt(T.ROUTINE_LENGTH * T.BEATS_PER_SEGMENT - 0.01)).toBe(T.ROUTINE_LENGTH - 1);
    expect(T.routineIndexAt(T.ROUTINE_LENGTH * T.BEATS_PER_SEGMENT)).toBe(0);
  });

  test('poses are deterministic for the same beat and profile', () => {
    const a = T.computeDancePose(12.34, FOLLOWER);
    const b = T.computeDancePose(12.34, FOLLOWER);
    expect(a).toEqual(b);
  });

  test('a follower lags the leader (different pose at the same instant)', () => {
    const beats = 10.25;
    const lead = T.computeDancePose(beats, LEADER);
    const follow = T.computeDancePose(beats, FOLLOWER);
    expect(follow).not.toEqual(lead);
  });

  test('every pose field stays finite across the whole routine', () => {
    for (let beats = 0; beats < 70; beats += 0.7) {
      [LEADER, FOLLOWER].forEach((profile) => {
        const pose = T.computeDancePose(beats, profile);
        [
          pose.bounce, pose.sway, pose.hipShift, pose.yawOffset,
          pose.armP.swing, pose.armP.lift, pose.armN.swing, pose.armN.lift,
          pose.legP, pose.legN
        ].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      });
    }
  });

  test('the spin move completes exactly one full turn', () => {
    // Segment 7 is the spin: yawOffset should go 0 -> 2*PI across the segment
    const segStart = 7 * T.BEATS_PER_SEGMENT;
    const early = T.computeDancePose(segStart + 1.9, LEADER);
    const late = T.computeDancePose(segStart + 6.5, LEADER);
    expect(Math.abs(late.yawOffset - early.yawOffset - Math.PI * 2)).toBeLessThan(0.2);
  });

  test('mirror math reflects positions and facings across the glass', () => {
    expect(T.mirrorZOf(T.LAYOUT.roqui.z)).toBeCloseTo(2 * T.LAYOUT.mirrorZ - T.LAYOUT.roqui.z);
    // Facing the class (+Z) reflects to facing away through the glass (-Z)
    expect(T.mirrorRotYOf(0)).toBeCloseTo(Math.PI);
    // A dancer facing the mirror reflects to facing the viewer
    expect(T.mirrorRotYOf(Math.PI)).toBeCloseTo(0);
  });

  test('wrapAngle keeps paused-dancer turns on the short path', () => {
    expect(T.wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(T.wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI * 0.5);
    expect(T.wrapAngle(0.4)).toBeCloseTo(0.4);
  });

  test('lifted arms rotate outward, never across the torso', () => {
    // Regression: the applier's lift signs were once inverted, folding every
    // raised arm through the body (worst in the grapevine's side reach).
    const fakeRig = () => ({
      group: { position: { x: 0, y: 0 }, rotation: { y: 0, z: 0 } },
      baseX: 0, baseZ: 0, baseRotY: 0,
      armP: { rotation: {} }, armN: { rotation: {} },
      legP: { rotation: {} }, legN: { rotation: {} }
    });
    const pose = T.neutralPose();
    pose.armP.lift = 1.15;   // the grapevine's near-horizontal side reach
    pose.armN.lift = 1.15;

    const rig = fakeRig();
    T.applyPose(rig, pose, false);
    // The +X arm swings toward +X (positive z), the -X arm toward -X
    expect(rig.armP.rotation.z).toBeGreaterThan(0);
    expect(rig.armN.rotation.z).toBeLessThan(0);

    // The mirror twin keeps the same outward semantics after its side swap
    const twin = fakeRig();
    T.applyPose(twin, pose, true);
    expect(twin.armP.rotation.z).toBeGreaterThan(0);
    expect(twin.armN.rotation.z).toBeLessThan(0);
  });

  test('accent-stripe runs break around wall fixtures', () => {
    // A window mid-wall splits the run in two
    expect(T.subtractIntervals(-9, 9, [[-2, 2]])).toEqual([[-9, -2], [2, 9]]);
    // Unsorted gaps, a gap past the end, and overlapping gaps all resolve
    expect(T.subtractIntervals(0, 10, [[6, 8], [1, 3], [2, 4], [9.95, 12]]))
      .toEqual([[0, 1], [4, 6], [8, 9.95]]);
    // Slivers shorter than a real stripe stub are dropped
    expect(T.subtractIntervals(0, 5, [[0.1, 4.9]])).toEqual([]);
  });

  test('the son clave pattern is the real 3-2 son clave', () => {
    expect(T.MUSIC_PATTERN.clave).toEqual([0, 6, 12, 20, 24]);
  });

  test('the class casts stay within the studio dress code', () => {
    // Six dancers, everyone in shorts, capris, or leggings (never long
    // sleeves: the builder default is short sleeves and no cast overrides it)
    expect(T.DANCER_CASTS.length).toBeGreaterThanOrEqual(6);
    T.DANCER_CASTS.forEach((cast) => {
      expect(['leggings', 'shorts', 'capri']).toContain(cast.legs);
    });
  });
});
