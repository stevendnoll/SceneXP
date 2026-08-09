// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The destruction replays (www/earthdefense/js/replay.js).
 *
 * TWO SHOTS THAT DIFFER IN WHAT THEY TAKE FROM THE VISITOR, and most of what is
 * asserted here is that difference. The ship shot takes the camera, which is
 * free because the flight model is already frozen for the wreck. The
 * installation shot takes nothing: it is a second camera drawn into a corner
 * while the visitor keeps flying, because an installation falls at a moment
 * they did nothing wrong and may well be under fire.
 *
 * The camera path is plain numbers, so it is tested as plain numbers: where the
 * eye stands, that it is looking at the thing that blew up, and that it never
 * ends up inside the planet the wreck is standing on.
 */
import { jest } from '@jest/globals';

// A camera that records rather than a matrix stack. Every assertion below is
// about where it IS and what it is pointing at.
class FakeCamera {
    constructor(fov, aspect, near, far) {
        this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
        this.position = {
            x: 0, y: 0, z: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        };
        this.looked = null;
        this.projections = 0;
    }
    lookAt(x, y, z) { this.looked = { x, y, z }; }
    updateProjectionMatrix() { this.projections++; }
}

let replay;
let CONFIG;

beforeEach(async () => {
    globalThis.THREE = { PerspectiveCamera: FakeCamera };
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    replay = await import('../www/earthdefense/js/replay.js');
});

afterEach(() => {
    if (replay) replay.disposeReplay();
    delete globalThis.THREE;
});

const len = (v) => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const ORIGIN = { x: 0, y: 0, z: 0 };

/** Run a shot to a fraction of its length, in frames a phone might actually
 *  deliver rather than in one big step. */
function run(seconds, step = 0.05) {
    for (let t = 0; t < seconds; t += step) replay.updateReplay(step);
}

// ---- The camera path --------------------------------------------------------

describe('orbitEye', () => {
    const UP = { x: 0, y: 1, z: 0 };
    const SIDE = { x: 1, y: 0, z: 0 };

    test('at angle zero and no elevation it stands on the side vector', () => {
        const out = replay.orbitEye(ORIGIN, UP, SIDE, 100, 0, 0);
        expect(out.x).toBeCloseTo(100, 9);
        expect(out.y).toBeCloseTo(0, 9);
        expect(out.z).toBeCloseTo(0, 9);
    });

    test('the distance is the distance, at any angle or elevation', () => {
        for (const angle of [0, 0.7, 2.9, -1.4]) {
            for (const rise of [0, 0.3, 1.1, -0.4]) {
                const out = replay.orbitEye(ORIGIN, UP, SIDE, 640, angle, rise);
                expect(len(out)).toBeCloseTo(640, 6);
            }
        }
    });

    test('a positive elevation is ABOVE, which is what puts ground under a wreck', () => {
        const level = replay.orbitEye(ORIGIN, UP, SIDE, 100, 0, 0);
        const above = replay.orbitEye(ORIGIN, UP, SIDE, 100, 0, 0.5);
        expect(above.y).toBeGreaterThan(level.y);
        expect(above.y).toBeCloseTo(100 * Math.sin(0.5), 6);
    });

    test('the orbit is a circle rather than a line, which needs the third axis', () => {
        // The failure this catches is a cross product left out: without it the
        // eye slides along one vector and the "orbit" is a dolly.
        const quarter = replay.orbitEye(ORIGIN, UP, SIDE, 100, Math.PI / 2, 0);
        expect(quarter.x).toBeCloseTo(0, 6);
        expect(Math.abs(quarter.z)).toBeCloseTo(100, 6);
    });

    test('it works around ANY up, not only the world one', () => {
        // An installation on the far side of Earth has a surface normal
        // pointing the other way, and its shot has to orbit in ITS sky.
        const up = { x: 0, y: 0, z: 1 };
        const side = { x: 1, y: 0, z: 0 };
        const out = replay.orbitEye(ORIGIN, up, side, 500, 0.9, 0.4);
        expect(len(out)).toBeCloseTo(500, 6);
        // Above the local horizon means a positive component along that normal.
        expect(dot(out, up)).toBeGreaterThan(0);
    });
});

describe('smoothstep', () => {
    test('it starts still, ends still, and passes through the middle', () => {
        expect(replay.smoothstep(0)).toBe(0);
        expect(replay.smoothstep(1)).toBe(1);
        expect(replay.smoothstep(0.5)).toBeCloseTo(0.5, 9);
        // Gentler than linear at both ends, which is the whole point.
        expect(replay.smoothstep(0.1)).toBeLessThan(0.1);
        expect(replay.smoothstep(0.9)).toBeGreaterThan(0.9);
    });

    test('it clamps rather than running away past the end of a shot', () => {
        expect(replay.smoothstep(-3)).toBe(0);
        expect(replay.smoothstep(4)).toBe(1);
    });
});

// ---- The ship shot ----------------------------------------------------------

describe('watching your own ship go', () => {
    const AT = { x: 1000, y: 0, z: -2000 };
    const FORWARD = { x: 0, y: 0, z: -1 };

    test('it starts BEHIND the wreck, looking the way the ship was flying', () => {
        // Continuous with the view the visitor just lost. Opening on the far
        // side would read as a cut to somewhere else entirely.
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, FORWARD, 2.2);

        const eye = replay.shipReplayEye();
        // The ship was flying down -Z, so behind it is +Z of the wreck.
        expect(eye.z).toBeGreaterThan(AT.z);
        expect(eye.look).toEqual(AT);
    });

    test('it never stops looking at the thing that blew up', () => {
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, FORWARD, 2.2);
        for (let i = 0; i < 20; i++) {
            replay.updateReplay(0.1);
            const eye = replay.shipReplayEye();
            if (!eye) break;
            expect(eye.look).toEqual(AT);
        }
    });

    test('it PULLS BACK, so the shot is a camera somewhere rather than a still', () => {
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, FORWARD, 2.2);
        const opened = len(sub(replay.shipReplayEye(), AT));

        run(2.0);
        const ended = len(sub(replay.shipReplayEye(), AT));

        expect(opened).toBeCloseTo(CONFIG.replay.shipStartDistance, 0);
        expect(ended).toBeGreaterThan(opened);
        expect(ended).toBeLessThanOrEqual(CONFIG.replay.shipEndDistance + 1);
    });

    test('it stands above the wreck rather than level with it', () => {
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, FORWARD, 2.2);
        expect(replay.shipReplayEye().y).toBeGreaterThan(AT.y);
    });

    test('a ship destroyed while climbing is still watched from a level orbit', () => {
        // The flattening. Without it a camera watching a ship that died pointing
        // straight up ends up lying on its side, or worse, on the axis it is
        // orbiting and with no orbit at all.
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, { x: 0, y: 1, z: 0 }, 2.2);
        const eye = replay.shipReplayEye();

        expect(Number.isFinite(eye.x)).toBe(true);
        expect(Number.isFinite(eye.z)).toBe(true);
        expect(len(sub(eye, AT))).toBeCloseTo(CONFIG.replay.shipStartDistance, 0);
    });

    test('it ends itself, exactly once, at the length it was given', () => {
        replay.initReplay(CONFIG);
        replay.startShipReplay(AT, FORWARD, 1.0);
        expect(replay.isShipReplayRunning()).toBe(true);

        run(0.8);
        expect(replay.isShipReplayRunning()).toBe(true);
        run(0.4);
        expect(replay.isShipReplayRunning()).toBe(false);
        expect(replay.shipReplayEye()).toBeNull();
    });

    test('the wreck pause and the shot are ONE number, so they cannot drift', () => {
        // main.js hands the respawn delay in as the length. A shot that outlived
        // it would still be orbiting a cloud the ship had been put back into.
        expect(CONFIG.replay.shipSeconds).toBe(CONFIG.player.respawnDelay);
    });
});

// ---- The installation shot --------------------------------------------------

describe('watching an installation go, in the corner', () => {
    // A beacon standing on the far side of a body of radius 6371.
    const UP = { x: 0, y: 0, z: 1 };
    const AT = { x: 0, y: 0, z: 6550 };

    test('it takes NOTHING from the visitor: no camera, no pause', () => {
        // The whole reason this shot exists in a window rather than as a cut.
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, UP, 'Aurora Station');

        expect(replay.isInsetRunning()).toBe(true);
        expect(replay.shipReplayEye()).toBeNull();
        expect(replay.isShipReplayRunning()).toBe(false);
    });

    test('its camera looks at the wreck and stands in the local sky', () => {
        // ABOVE THE LOCAL HORIZON, not the world's. Half of a sphere around an
        // installation on the far side of a planet is inside the planet, and a
        // window looking at the inside of Earth is a window full of nothing.
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, UP, 'Aurora Station');
        const camera = replay.getInsetCamera();

        expect(camera.looked).toEqual({ x: AT.x, y: AT.y, z: AT.z });
        const out = sub(camera.position, AT);
        expect(dot(out, UP)).toBeGreaterThan(0);
        // And so, further from the body's centre than the beacon is.
        expect(len(camera.position)).toBeGreaterThan(len(AT));
    });

    test('it stays outside the body for the whole shot, at every angle', () => {
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, UP, 'Aurora Station');
        for (let t = 0; t < CONFIG.replay.insetSeconds; t += 0.05) {
            replay.updateReplay(0.05);
            const camera = replay.getInsetCamera();
            if (!camera) break;
            expect(len(camera.position)).toBeGreaterThan(6371);
        }
    });

    test('with no surface normal it falls back to straight up from the centre', () => {
        // A caller with plain objects, which is how the suite drives it, and a
        // reasonable guess for a body centred on the origin.
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, null, '');
        expect(len(replay.getInsetCamera().position)).toBeGreaterThan(len(AT));
    });

    test('it carries the name of what was lost', () => {
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, UP, 'Aurora Station');
        expect(replay.getInsetLabel()).toBe('Aurora Station');
        run(CONFIG.replay.insetSeconds + 0.2);
        expect(replay.getInsetLabel()).toBe('');
    });

    test('a second loss takes the window over rather than queueing behind it', () => {
        // Seven installations can fall in a run and two can fall together. A
        // queue would still be showing the first loss half a minute later.
        replay.initReplay(CONFIG);
        replay.startInsetReplay(AT, UP, 'Aurora Station');
        run(1.0);
        replay.startInsetReplay({ x: 6550, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 'Meridian');

        expect(replay.getInsetLabel()).toBe('Meridian');
        // Back to the opening of a shot rather than a second in.
        expect(len(sub(replay.getInsetCamera().position, { x: 6550, y: 0, z: 0 })))
            .toBeCloseTo(CONFIG.replay.insetStartDistance, 0);
    });
});

// ---- Both at once, and lifecycle -------------------------------------------

describe('lifecycle', () => {
    test('the two shots run independently, because they are independent things', () => {
        // A visitor can be destroyed on the same frame an installation falls.
        replay.initReplay(CONFIG);
        replay.startShipReplay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 1.0);
        replay.startInsetReplay({ x: 0, y: 6550, z: 0 }, { x: 0, y: 1, z: 0 }, 'Meridian');

        expect(replay.isReplayRunning()).toBe(true);
        run(1.2);
        // The ship shot is over and the longer window is still going.
        expect(replay.isShipReplayRunning()).toBe(false);
        expect(replay.isInsetRunning()).toBe(true);
        expect(replay.isReplayRunning()).toBe(true);

        run(1.8);
        expect(replay.isReplayRunning()).toBe(false);
    });

    test('nothing is running before anything is started', () => {
        replay.initReplay(CONFIG);
        expect(replay.isReplayRunning()).toBe(false);
        expect(replay.shipReplayEye()).toBeNull();
        expect(replay.getInsetCamera()).toBeNull();
    });

    test('a fresh init cancels whatever was running, which is what a restart wants', () => {
        replay.initReplay(CONFIG);
        replay.startShipReplay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 2.2);
        replay.startInsetReplay({ x: 0, y: 6550, z: 0 }, { x: 0, y: 1, z: 0 }, 'Meridian');

        replay.initReplay(CONFIG);
        expect(replay.isReplayRunning()).toBe(false);
    });

    test('every call is safe before init and after dispose', () => {
        replay.disposeReplay();
        expect(() => replay.updateReplay(0.1)).not.toThrow();
        expect(replay.startShipReplay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 2)).toBe(0);
        expect(replay.startInsetReplay({ x: 0, y: 0, z: 0 }, null, 'x')).toBe(0);
        expect(replay.isReplayRunning()).toBe(false);
        expect(replay.shipReplayEye()).toBeNull();
    });

    test('a browser with no THREE gets no window rather than a crash', () => {
        // The same posture as the audio: a missing capability is a quieter
        // experience, never a broken one.
        delete globalThis.THREE;
        replay.initReplay(CONFIG);
        expect(() => replay.startInsetReplay({ x: 0, y: 0, z: 6550 }, null, 'x')).not.toThrow();
        expect(replay.getInsetCamera()).toBeNull();
    });

    test('a nonsense length is a short shot rather than a divide by zero', () => {
        // The progress through a shot is elapsed over length, so a length of
        // zero is the one input that turns the whole camera path into NaN and
        // parks the eye at the origin looking at a wreck it cannot see.
        replay.initReplay(CONFIG);
        replay.startShipReplay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, -5);
        expect(Number.isFinite(replay.shipReplayEye().x)).toBe(true);
        run(0.5);
        expect(replay.isShipReplayRunning()).toBe(false);
    });

    test('no length at all falls back to the configured one', () => {
        replay.initReplay(CONFIG);
        expect(replay.startShipReplay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }))
            .toBe(CONFIG.replay.shipSeconds);
    });
});
