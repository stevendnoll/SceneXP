// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/tornado/js/cow.js, the payoff.
 *
 * THE FLIGHT IS HELD TO THE FRAME, the way the props are: the camera never
 * moves, so what matters is the cow's elevation and bearing, second by
 * second, against about 31 degrees up and 34 either side in landscape. And it
 * never jumps: the pose is sampled every twentieth of a second across all
 * four pieces of the flight (orbit, cruise, descent, landed), so a seam
 * between two of them would show as a leap.
 *
 * The landing is held to what the payoff promised: on all four feet, upright,
 * still, clear of the pond and the flowers, inside a phone's portrait frame,
 * and then looking at the camera.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel', 'wind', 'pond']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let cow;
let flora;
let pond;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, { get: () => () => {}, set: () => true });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context }) };
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    cow = await import('../www/tornado/js/cow.js');
    flora = await import('../www/tornado/js/flora.js');
    pond = await import('../www/tornado/js/pond.js');
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

const deg = (r) => r * 180 / Math.PI;
const K = () => C.cow;
const TOP = () => C.camera.pitchDegrees + C.camera.fovDegrees / 2;
const halfWidth = (aspect) => deg(Math.atan(Math.tan((C.camera.fovDegrees / 2) * Math.PI / 180) * aspect));
const samples = () => {
    const out = [];
    for (let t = K().pickupAt; t <= C.story.seconds + 1e-9; t += 0.05) out.push(Number(t.toFixed(4)));
    return out;
};
/** Elevation of the cow's back and its bearing, in degrees. */
function onScreen(p) {
    const d = Math.hypot(p.x, p.z);
    return {
        elevation: deg(Math.atan2(p.y + 1.45 * p.scale - C.camera.height, d)),
        bearing: deg(Math.atan2(p.x, -p.z)),
        // From the eye, as sizeFloor measures it.
        pixels: (cow.COW_LENGTH * p.scale / Math.hypot(d, p.y - C.camera.height))
            / (C.camera.fovDegrees * Math.PI / 180) * 900
    };
}

describe('the flight', () => {
    test('there is no cow until the tornado picks one up', () => {
        expect(cow.cowPoseAt(0, C).visible).toBe(false);
        expect(cow.cowPoseAt(K().pickupAt - 0.01, C).visible).toBe(false);
        expect(cow.cowPoseAt(K().pickupAt, C).visible).toBe(true);
    });

    test('THE WHOLE FLIGHT IS INSIDE A LANDSCAPE FRAME and above the ground', () => {
        for (const t of samples()) {
            const p = cow.cowPoseAt(t, C);
            const s = onScreen(p);
            expect([t, s.elevation < TOP() - 2]).toEqual([t, true]);
            expect([t, Math.abs(s.bearing) < halfWidth(16 / 9) - 2]).toEqual([t, true]);
            expect([t, p.y >= 0]).toEqual([t, true]);
        }
    });

    test('IT NEVER JUMPS, across all four pieces of the flight', () => {
        let prev = null;
        for (const t of samples()) {
            const s = onScreen(cow.cowPoseAt(t, C));
            if (prev) {
                const step = Math.hypot(s.elevation - prev.elevation, s.bearing - prev.bearing);
                expect([t, step < 1.5]).toEqual([t, true]);
            }
            prev = s;
        }
        // And the handovers meet exactly.
        for (const at of [K().flingAt, K().landAt]) {
            const a = cow.cowPosition(at - 1e-7, C);
            const b = cow.cowPosition(at, C);
            expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.01);
        }
    });

    test('it is never less than a few pixels, and is its true size well before it lands', () => {
        for (const t of samples()) {
            const p = cow.cowPoseAt(t, C);
            expect([t, onScreen(p).pixels >= K().minPixels - 1e-6]).toEqual([t, true]);
            // True size through the whole of the final descent.
            if (t >= K().landAt - 4) expect([t, p.scale]).toEqual([t, 1]);
        }
    });

    test('it tumbles in the air and is upright with its legs in before it touches down', () => {
        const air = cow.cowPoseAt((K().pickupAt + K().flingAt) / 2, C);
        expect(air.upright).toBe(0);
        expect(air.splay).toBe(1);
        const touch = cow.cowPoseAt(K().landAt, C);
        expect(touch.upright).toBe(1);
        expect(touch.splay).toBe(0);
        expect(touch.y).toBe(0);
    });
});

describe('the landing', () => {
    test('ON ALL FOUR FEET, AND IT STAYS PUT', () => {
        const at = cow.cowPoseAt(K().landAt, C);
        for (const t of [K().landAt + 0.6, K().lookAt, 56, C.story.seconds]) {
            const p = cow.cowPoseAt(t, C);
            expect([t, p.x, p.y, p.z, p.upright, p.splay, p.dip]).toEqual([t, at.x, 0, at.z, 1, 0, 0]);
        }
        // The knees give a little on touchdown, and only then.
        expect(cow.cowPoseAt(K().landAt + 0.25, C).dip).toBeGreaterThan(0);
    });

    test('where it lands: a phone sees it, the pond is clear, the flowers make room', () => {
        const L = K().landing;
        expect(Math.abs(deg(Math.atan2(L.x, -L.z)))).toBeLessThan(halfWidth(0.46) - 1);
        expect(pond.inPond(L.x, L.z, 2.5, C)).toBe(false);
        for (const f of flora.meadowPlacements(C, false)) {
            expect(Math.hypot(f.x - L.x, f.z - L.z)).toBeGreaterThanOrEqual(L.clear);
        }
    });

    test('IT LOOKS AT THE CAMERA, within what a neck can do', () => {
        const turn = cow.lookTurn(C);
        expect(Math.abs(turn)).toBeLessThanOrEqual(K().neckLimit);
        const p = cow.cowPoseAt(K().lookAt + 2, C);
        expect(p.headYaw).toBeCloseTo(turn, 10);
        expect(cow.cowPoseAt(K().lookAt - 0.1, C).headYaw).toBeCloseTo(0, 10);
        // Body yaw plus head turn, as a direction, points at the camera.
        const heading = p.yaw + p.headYaw;
        const facing = [Math.cos(heading), -Math.sin(heading)];
        const toCamera = [-p.x, -p.z];
        const n = Math.hypot(...toCamera);
        const dot = (facing[0] * toCamera[0] + facing[1] * toCamera[1]) / n;
        expect(dot).toBeGreaterThan(0.98);
        // And it chews.
        const chews = [0, 0.1, 0.2, 0.3].map((k) => cow.cowPoseAt(K().lookAt + k, C).chew);
        expect(new Set(chews).size).toBeGreaterThan(1);
    });

    test('the payoff stage names the landing, and the rainbow comes after it', () => {
        const stage = (name) => C.story.stages.find((s) => s.name === name).at;
        expect(stage('pickup')).toBeGreaterThanOrEqual(K().pickupAt);
        expect(stage('payoff')).toBeLessThanOrEqual(K().landAt);
        expect(stage('rainbow')).toBeGreaterThan(K().landAt);
        expect(K().landAt).toBeLessThan(C.story.seconds - C.story.fadeSeconds);
    });
});

describe('the pasture cows', () => {
    test('graze with their heads down, and look up when the flyer lands', () => {
        K().pasture.forEach((_, i) => {
            const before = cow.pasturePoseAt(i, K().landAt - 1, C);
            const after = cow.pasturePoseAt(i, K().lookUpAt + 2, C);
            expect(before.headPitch).toBeLessThan(-0.7);
            expect(after.headPitch).toBeCloseTo(0.1, 6);
            expect(after.chew).toBe(0);
        });
    });

    test('stand in frame, right of the funnel, apart from each other', () => {
        const P = K().pasture;
        for (const c of P) {
            const b = deg(Math.atan2(c.x, -c.z));
            expect(b).toBeGreaterThan(3);
            expect(b).toBeLessThan(halfWidth(16 / 9) - 3);
        }
        for (let i = 0; i < P.length; i++) {
            for (let j = i + 1; j < P.length; j++) {
                expect(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z)).toBeGreaterThan(5);
            }
        }
    });
});

describe('the rig', () => {
    test('builds, takes every pose of the minute, and blends tumbling into upright', () => {
        const scene = new THREE.Scene();
        cow.initCows(scene, C);
        const flyer = scene.getObjectByName('cow');
        expect(flyer).toBeTruthy();
        expect(scene.children.filter((o) => o.name.startsWith('pasture-cow-')).length).toBe(K().pasture.length);
        for (let t = 0; t <= C.story.seconds; t += 0.25) {
            cow.updateCows(t, C);
            if (t < K().pickupAt) expect(flyer.visible).toBe(false);
        }
        // Landed: the rig is exactly upright at the landing heading.
        cow.updateCows(K().landAt + 3, C);
        const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, K().landing.yaw, 0));
        expect(flyer.quaternion.angleTo(expected)).toBeLessThan(1e-6);
        expect(flyer.position.y).toBe(0);
    });

    test('the hide is drawn when there is a canvas, and plain when there is not', () => {
        expect(cow.holsteinTexture(3).isTexture).toBe(true);
        const saved = globalThis.document;
        delete globalThis.document;
        expect(cow.holsteinTexture(3)).toBeNull();
        globalThis.document = { createElement: () => ({ getContext: () => null }) };
        expect(cow.holsteinTexture(3)).toBeNull();
        globalThis.document = saved;
        const rig = cow.createCow();
        expect(rig.group.name).toBe('cow');
        expect(rig.legs.length).toBe(4);
    });
});

describe('the descent is one motion', () => {
    test('IT NEVER STOPS IN THE AIR: it brakes all the way down and only then stops', () => {
        // QA 2026-09-23: the first flight eased to a dead stop over the herd
        // and then sank, so its speed fell to nothing mid-air and picked up
        // again. The signature of that fault is a speed that rises after it
        // has fallen, so that is what this refuses: from just after the
        // fling to the ground, the speed may only ever fall.
        const step = 0.05;
        let prev = null;
        let prevSpeed = Infinity;
        for (let t = K().flingAt + 0.5; t <= K().landAt + 1e-9; t += step) {
            const p = cow.cowPosition(t, C);
            if (prev) {
                const speed = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / step;
                const at = Number(t.toFixed(2));
                expect([at, speed <= prevSpeed * 1.01]).toEqual([at, true]);
                prevSpeed = speed;
            }
            prev = p;
        }
        // It is still coming down a second before it lands, and gently.
        const a = cow.cowPosition(K().landAt - 1, C);
        const b = cow.cowPosition(K().landAt - 0.5, C);
        expect(a.y).toBeGreaterThan(b.y);
        expect(b.y).toBeGreaterThan(0);
        expect(cow.cowPosition(K().landAt - 0.05, C).y).toBeLessThan(0.1);
    });
});
