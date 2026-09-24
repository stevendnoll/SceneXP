// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for Tornado Alley's tumbleweeds (tumbleweeds.js).
 *
 * Held the way everything else in the scene is, as angles and distances
 * against the eye: they keep to dry ground, clear the fence, come into the
 * frame (a portrait one too), never jump, and are gone before the payoff.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel', 'pond']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let Tw;
let inPond;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, { get: () => () => {}, set: () => true });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context }) };
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    Tw = await import('../www/tornado/js/tumbleweeds.js');
    ({ inPond } = await import('../www/tornado/js/pond.js'));
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

const deg = (r) => r * 180 / Math.PI;
const FRAME = 1 / 60;
const halfWidth = (aspect) => deg(Math.atan(Math.tan((C.camera.fovDegrees / 2) * Math.PI / 180) * aspect));
const bearingOf = (x, z) => deg(Math.atan2(x, -z));
const stage = (name) => C.story.stages.find((s) => s.name === name).at;

describe('the tumbleweeds', () => {
    const T = () => C.tumbleweeds;

    test('KEEP TO DRY GROUND and clear of the trees', () => {
        T().list.forEach((entry) => {
            const route = Tw.routeOf(entry, C);
            for (let s = 0; s <= route.fenceAt + 20; s += 0.25) {
                const p = Tw.pointAlong(route, s);
                expect([s, inPond(p.x, p.z, T().radius, C)]).toEqual([s, false]);
                for (const tree of C.trees) expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeGreaterThan(3);
            }
        });
    });

    test('HOP THE FENCE clear of its top wire', () => {
        const top = Math.max(...C.fence.wires);
        T().list.forEach((entry, i) => {
            let crossed = 0;
            for (let t = entry.startAt; t < C.story.seconds; t += 0.002) {
                const p = Tw.tumbleweedPoseAt(i, t, C);
                if (Math.abs(p.z - C.fence.z) < T().radius) {
                    crossed += 1;
                    expect(p.y - T().radius).toBeGreaterThan(top + 0.1);
                }
            }
            expect(crossed).toBeGreaterThan(0);
        });
    });

    test('roll into the frame, a portrait one too, and fade before the payoff', () => {
        T().list.forEach((entry, i) => {
            let inFrame = false;
            let inPortrait = false;
            let last = null;
            for (let t = entry.startAt + FRAME; t <= C.story.seconds; t += FRAME) {
                const p = Tw.tumbleweedPoseAt(i, t, C);
                const b = Math.abs(bearingOf(p.x, p.z));
                if (p.opacity === 1 && b < halfWidth(16 / 9) - 2) inFrame = true;
                if (p.opacity === 1 && b < halfWidth(0.46) - 1) inPortrait = true;
                // Never faster than the wind rolls it: no jumps.
                if (last) expect(Math.hypot(p.x - last.x, p.z - last.z) / FRAME).toBeLessThanOrEqual(T().speed * 1.01);
                last = p;
            }
            expect(inFrame).toBe(true);
            expect(inPortrait).toBe(true);
            // Out of the picture before the payoff, and stays out.
            for (let t = stage('payoff'); t <= C.story.seconds; t += 0.5) {
                expect([i, t, Tw.tumbleweedPoseAt(i, t, C).visible]).toEqual([i, t, false]);
            }
            expect(Tw.tumbleweedPoseAt(i, entry.startAt, C).visible).toBe(false);
        });
    });

    test('TURN THE WAY THEY ROLL: counter-clockwise while they move right to left on screen', () => {
        // A sprite turns counter-clockwise for a positive rotation. A ball
        // moving left turns counter-clockwise, so wherever one moves left on
        // screen its spin has to be rising, and at the rate it rolls.
        T().list.forEach((entry, i) => {
            let left = 0;
            let last = null;
            for (let t = entry.startAt + FRAME; t <= C.story.seconds; t += FRAME) {
                const p = Tw.tumbleweedPoseAt(i, t, C);
                if (last && p.visible) {
                    const moved = bearingOf(p.x, p.z) - bearingOf(last.x, last.z);
                    const turned = p.spin - last.spin;
                    if (moved < -1e-6) {
                        left += 1;
                        expect([i, t, turned > 0]).toEqual([i, t, true]);
                    }
                    if (moved > 1e-6) expect([i, t, turned < 0]).toEqual([i, t, true]);
                }
                last = p;
            }
            // It does cross the screen, so the check above ran.
            expect(left).toBeGreaterThan(60);
        });
    });

    test('slow as the inflow dies, not all at once', () => {
        const speeds = [];
        for (let t = 18; t <= 25; t += 0.25) speeds.push(Tw.rollSpeed(t, C));
        for (let k = 1; k < speeds.length; k++) expect(speeds[k]).toBeLessThanOrEqual(speeds[k - 1] + 1e-9);
        expect(speeds[0]).toBe(T().speed);
        expect(speeds[speeds.length - 1]).toBe(0);
    });

    test('the sprites build, roll and fade', () => {
        const scene = new THREE.Scene();
        const weeds = Tw.initTumbleweeds(scene, C);
        expect(weeds.length).toBe(T().list.length);
        const t = T().list[0].startAt + 3;
        Tw.updateTumbleweeds(t, C);
        const pose = Tw.tumbleweedPoseAt(0, t, C);
        expect(weeds[0].visible).toBe(true);
        expect(weeds[0].material.rotation).toBeCloseTo(pose.spin, 6);
        expect(weeds[0].material.depthWrite).toBe(false);
        Tw.updateTumbleweeds(C.story.seconds, C);
        for (const sprite of weeds) expect(sprite.visible).toBe(false);
    });
});

describe('the page', () => {
    test('main.js rolls them, and nothing is left of the swallows or the prairie dog', () => {
        const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');
        expect(main).toMatch(/initTumbleweeds\(scene, CONFIG\)/);
        expect(main).toMatch(/updateTumbleweeds\(arc, CONFIG\)/);
        expect(main).not.toMatch(/swallow|prairie ?dog|prairiedog/i);
        expect(C.swallows).toBeUndefined();
        expect(C.prairieDog).toBeUndefined();
    });
});
