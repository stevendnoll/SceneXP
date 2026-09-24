// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/tornado/js/funnel.js, the tornado's shape as a pure function
// of time, and the two geometric promises the scene makes around it.
//
// EVERY ASSERTION HERE IS ONE THE M0 SPIKE BROKE OR NEARLY BROKE. Two of them
// were real bugs found by measuring before any browser saw the funnel, and
// each test below was checked against the old arithmetic to be sure it fails
// there (see tests-that-restate-the-code in the project notes):
//
//   1. A TOUCHED-DOWN TORNADO REACHED THE GROUND AS A POINT. The tip taper ran
//      from `1 - extent` over 0.12 of the height, so at full extent it ended at
//      u = 0.12 and the radius at the ground was always zero. `tipOf` now ends
//      the taper below the ground once the funnel is down.
//   2. THE SHELLS WERE WOUND INSIDE OUT, so FrontSide drew each layer's far
//      wall and the hand-built draw order composited backward.
//   3. The funnel's flared top was wider than the wall cloud's underside, so
//      its top ring would have shown as a lip under the cloud.

import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

const CONFIG_URL = '../www/tornado/js/config.js';

// The sources import './config.min.js'. Pointing the test at the source keeps
// a stale build from passing.
jest.unstable_mockModule('../www/tornado/js/config.min.js', async () => (
    await import(CONFIG_URL)
));
jest.unstable_mockModule('../www/tornado/js/funnel.min.js', async () => (
    await import('../www/tornado/js/funnel.js')
));

installThree();
const { TORNADO_CONFIG: C } = await import(CONFIG_URL);
const F = await import('../www/tornado/js/funnel.js');
const shellsSrc = await import('../www/tornado/js/shells.js');
const worldSrc = await import('../www/tornado/js/world.js');
const { tubeUA, tubeIndex } = shellsSrc;
const { wallUndersideRadius } = worldSrc;
afterAll(() => uninstallAll());

const SECONDS = C.story.seconds;
const everySecond = Array.from({ length: SECONDS * 4 + 1 }, (_, i) => i / 4);

describe('keyframes', () => {
    const keys = [[10, 0], [20, 1]];

    test('hold their end values outside the keys', () => {
        expect(F.keyAt(0, keys)).toBe(0);
        expect(F.keyAt(30, keys)).toBe(1);
    });

    test('ease between keys, passing the midpoint at the midpoint', () => {
        expect(F.keyAt(15, keys)).toBeCloseTo(0.5, 10);
        expect(F.keyAt(12, keys)).toBeLessThan(0.2);
        expect(F.keyAt(18, keys)).toBeGreaterThan(0.8);
    });
});

describe('the funnel reaches the ground', () => {
    test('A FULLY DOWN FUNNEL HAS WIDTH AT THE GROUND, not a point', () => {
        const s = F.funnelStateAt(30, 30, C);
        expect(s.extent).toBe(1);
        // The cone's own ground radius, all of it, not a taper's sliver.
        expect(F.radiusAt(0, s)).toBeCloseTo(s.trunk * s.cone, 6);
        expect(F.radiusAt(0, s)).toBeGreaterThan(20);
    });

    test('the tip is above the ground until the funnel is down', () => {
        // Found from the config rather than written down, so a retime of
        // the life cycle cannot quietly leave this testing a finished funnel.
        const reaching = everySecond.find((t) => {
            const e = F.funnelStateAt(t, t, C).extent;
            return e > 0.3 && e < 0.9;
        });
        const s = F.funnelStateAt(reaching, reaching, C);
        expect(s.extent).toBeGreaterThan(0);
        expect(s.extent).toBeLessThan(1);
        expect(F.radiusAt(0, s)).toBe(0);
        expect(F.radiusAt(0.99, s)).toBeGreaterThan(0);
    });

    test('with no funnel there is no radius anywhere', () => {
        const s = F.funnelStateAt(5, 5, C);
        expect(s.extent).toBe(0);
        for (let u = 0; u <= 1; u += 0.05) expect(F.radiusAt(u, s)).toBe(0);
    });

    test('the JavaScript and GLSL tips are the same line', () => {
        // Two copies of one number, which is exactly how the bug above would
        // come back in half the code. Read the constant out of the shader.
        const glsl = F.FUNNEL_GLSL.match(/1\.0 - uExtent \* ([\d.]+)/);
        expect(glsl).not.toBeNull();
        expect(F.tipOf(1)).toBeCloseTo(1 - Number(glsl[1]), 10);
        expect(F.tipOf(0)).toBe(1);
    });
});

describe('the life cycle', () => {
    const at = (t) => F.funnelStateAt(t, t, C);

    test('the dust whirl comes up before the funnel connects', () => {
        const firstDust = everySecond.find((t) => at(t).dust > 0.05);
        const touchdown = everySecond.find((t) => at(t).extent >= 1);
        expect(firstDust).toBeLessThan(touchdown);
    });

    test('it ropes out: thinner and leaning further at 45 than at 30', () => {
        expect(at(45).trunk).toBeLessThan(at(30).trunk * 0.5);
        expect(at(45).lean).toBeGreaterThan(at(30).lean * 5);
    });

    test('the funnel is gone before the rainbow and stays gone', () => {
        const rainbow = C.story.stages.find((st) => st.name === 'rainbow').at;
        for (const t of everySecond.filter((x) => x >= rainbow - 1)) {
            expect(at(t).extent).toBe(0);
            expect(at(t).dust).toBe(0);
        }
    });

    test('every value is finite at every quarter second', () => {
        for (const t of everySecond) {
            const s = at(t);
            for (const [key, value] of Object.entries(s)) {
                if (typeof value === 'number') expect([key, Number.isFinite(value)]).toEqual([key, true]);
            }
            const b = F.boundsOf(s);
            expect(b.max.x).toBeGreaterThan(b.min.x);
            expect(b.max.z).toBeGreaterThan(b.min.z);
        }
    });

    test('the spine stands on the ground and hangs from the wall cloud', () => {
        const s = at(32);
        expect(F.spineAt(0, s).y).toBe(0);
        expect(F.spineAt(1, s).y).toBeCloseTo(s.top, 10);
        // And the box holds the spine.
        const b = F.boundsOf(s);
        for (let u = 0; u <= 1; u += 0.1) {
            const p = F.spineAt(u, s);
            expect(p.x).toBeGreaterThan(b.min.x);
            expect(p.x).toBeLessThan(b.max.x);
        }
    });
});

describe('the funnel top hides in the wall cloud', () => {
    test('the underside is wider than the flared top at every second', () => {
        for (const t of everySecond) {
            const s = F.funnelStateAt(t, t, C);
            if (s.extent === 0) continue;
            expect([t, wallUndersideRadius(s, C) > F.radiusAt(1, s)]).toEqual([t, true]);
        }
    });
});

describe('the shells are wound outward', () => {
    test('every triangle faces away from the spine', () => {
        // A vertical spine: angle 0 is +z and a quarter turn is +x, the same
        // frame as n and b in the vertex shader.
        const rings = 4;
        const segments = 12;
        const ua = tubeUA(rings, segments);
        const index = tubeIndex(rings, segments);
        const pos = (v) => {
            const u = ua[v * 2];
            const a = ua[v * 2 + 1];
            return [Math.sin(a), u * 10, Math.cos(a)];
        };
        const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
        for (let i = 0; i < index.length; i += 3) {
            const [p0, p1, p2] = [pos(index[i]), pos(index[i + 1]), pos(index[i + 2])];
            const e1 = sub(p1, p0);
            const e2 = sub(p2, p0);
            const n = [
                e1[1] * e2[2] - e1[2] * e2[1],
                e1[2] * e2[0] - e1[0] * e2[2],
                e1[0] * e2[1] - e1[1] * e2[0]
            ];
            const center = [(p0[0] + p1[0] + p2[0]) / 3, 0, (p0[2] + p1[2] + p2[2]) / 3];
            expect(n[0] * center[0] + n[2] * center[2]).toBeGreaterThan(0);
        }
    });
});

describe('debris', () => {
    test('is placed at finite points and hidden with no dust', () => {
        const out = {};
        for (const t of [0, 20, 32, 44, 55]) {
            const s = F.funnelStateAt(t, t, C);
            let shown = 0;
            for (let i = 0; i < C.debris.count; i++) {
                F.debrisPose(i, s, C, out);
                expect(Number.isFinite(out.x + out.y + out.z + out.size + out.spin)).toBe(true);
                if (out.size > 0) shown += 1;
            }
            if (s.dust === 0) expect(shown).toBe(0);
            if (s.dust > 0.9) expect(shown).toBeGreaterThan(C.debris.count * 0.8);
        }
    });
});

describe('the shader uniforms follow the state', () => {
    test('applyFunnelState writes the state into the shared uniforms', () => {
        const u = F.funnelUniforms(C);
        const s = F.funnelStateAt(32, 12, C);
        // The THREE stub absorbs vector writes, so read back the scalars,
        // which are the ones the life cycle moves.
        F.applyFunnelState(u, s);
        expect(u.uTime.value).toBe(12);
        expect(u.uExtent.value).toBe(s.extent);
        expect(u.uTrunk.value).toBe(s.trunk);
        expect(u.uDustAmount.value).toBe(s.dust);
        expect(u.uTop.value).toBe(s.top);
    });
});

describe('the sources build and walk the minute', () => {
    // tests/tornado-init.test.mjs does this through the BUILT files, as the
    // page loads them, and built files earn no coverage. This is the same
    // walk through the sources, so the report measures the code that was
    // written rather than the code that was minified.
    test('world, shells and debris update at every half second', () => {
        const scene = { children: [], add(o) { this.children.push(o); } };
        const shared = F.funnelUniforms(C);
        worldSrc.initWorld(scene, C);
        shellsSrc.initShells(scene, shared, C);
        shellsSrc.setShellCount(C.shells.mobileCount);
        for (let t = 0; t <= SECONDS; t += 0.5) {
            const s = F.funnelStateAt(t, t, C);
            F.applyFunnelState(shared, s);
            worldSrc.updateWorld(s, t < 30, C);
            shellsSrc.updateShells(s, C.shells.layers.length);
        }
        expect(scene.children.length).toBeGreaterThanOrEqual(6);
    });
});
