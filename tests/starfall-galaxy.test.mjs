// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Starfall's galaxy (www/starfall/js/galaxy.js) and its view
 * (www/starfall/js/view.js): the seeded layout, the camera's orbit, and the
 * TSL graph built against the real three.js WebGPU bundle.
 *
 * WHAT THIS CAN AND CANNOT SEE. There is no GPU under Node, so nothing here
 * compiles or runs a shader: a node graph with a type error passes every
 * test below and fails only in a browser (the same standing rule as GLSL,
 * see the garden shader suite). What it does hold is
 *   - the shape: a bulge, two arms that really are spirals, and a halo, from
 *     a layout every visitor shares;
 *   - every TSL function and class the galaxy calls exists in the vendored
 *     release, so a renamed export fails here rather than as a blank page;
 *   - the material graph, which TSL builds eagerly, constructs without
 *     throwing, and update() turns the pattern;
 *   - the view: a drag turns it the documented way, the poles are never
 *     reached, a flick glides to rest, and the disk always fits the frame.
 */
import { readFile } from 'node:fs/promises';
import { loadRealThreeWebGPU } from './helpers/real-three.mjs';

const G = await import('../www/starfall/js/galaxy.js');
const V = await import('../www/starfall/js/view.js');
const { STARFALL_CONFIG: C } = await import('../www/starfall/js/config.js');

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const angleGap = (a, b) => {
    const d = wrap(a - b);
    return Math.min(d, TAU - d);
};

describe('the layout', () => {
    const N = 20000;
    const layout = G.layoutStars(N, C.galaxy, C.look, G.makeRng(C.stars.seed));
    const pops = G.populationCounts(N, C.galaxy);

    test('the populations add up to exactly the stars asked for', () => {
        for (const n of [1, 7, 60000, 320000]) {
            const p = G.populationCounts(n, C.galaxy);
            expect(p.bulge + p.arm + p.halo).toBe(n);
        }
        expect(pops.arm).toBeGreaterThan(pops.bulge);
        expect(pops.arm).toBeGreaterThan(pops.halo);
    });

    test('the same seed gives every visitor the same galaxy', () => {
        const again = G.layoutStars(N, C.galaxy, C.look, G.makeRng(C.stars.seed));
        expect(again.orbit).toEqual(layout.orbit);
        expect(again.look).toEqual(layout.look);
    });

    test('every star sits inside the disk, at a finite place', () => {
        for (let i = 0; i < N; i++) {
            const r = layout.orbit[i * 4];
            expect(Number.isFinite(r)).toBe(true);
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThanOrEqual(C.galaxy.radius * 1.06);
            expect(Math.abs(layout.orbit[i * 4 + 2])).toBeLessThan(C.galaxy.radius * 0.5);
        }
    });

    test('the bulge is a warm knot at the core', () => {
        for (let i = 0; i < pops.bulge; i++) {
            expect(layout.orbit[i * 4]).toBeLessThanOrEqual(C.galaxy.coreRadius * 1.6 + 1e-6);
            expect(layout.orbit[i * 4 + 3]).toBeLessThan(0.2);
        }
    });

    test('the arm stars really follow two spirals', () => {
        // Measured, not assumed: most arm stars must lie near SOME arm's
        // center line at their own radius. Scattered at random angles, only
        // about a third would land this close.
        let near = 0;
        for (let i = pops.bulge; i < pops.bulge + pops.arm; i++) {
            const r = layout.orbit[i * 4];
            const a = layout.orbit[i * 4 + 1];
            let best = Infinity;
            for (let k = 0; k < C.galaxy.arms; k++) best = Math.min(best, angleGap(a, G.armAngle(k, r, C.galaxy)));
            if (best < C.galaxy.armSpread * 1.6) near++;
        }
        expect(near / pops.arm).toBeGreaterThan(0.8);
    });

    test('pink knots appear in the arms, rarely, and never in the core', () => {
        let knots = 0;
        for (let i = 0; i < N; i++) {
            if (layout.look[i * 4 + 2] === 1) {
                knots++;
                expect(layout.orbit[i * 4]).toBeGreaterThan(C.galaxy.coreRadius);
            }
        }
        expect(knots).toBeGreaterThan(0);
        expect(knots / pops.arm).toBeLessThan(C.galaxy.knotChance * 2);
    });

    test('sizes stay within the configured range, knots aside', () => {
        for (let i = 0; i < N; i++) {
            const s = layout.look[i * 4];
            expect(s).toBeGreaterThanOrEqual(C.look.sizeMin);
            expect(s).toBeLessThanOrEqual(C.look.sizeMax * 1.31);
        }
    });
});

describe('the view', () => {
    const v = C.view;

    test('a drag turns the view around the disk and tilts it, by the configured speed', () => {
        const start = { azimuth: 1, elevation: 0.5 };
        const moved = V.dragView(start, 100, -50, v);
        expect(moved.azimuth).toBeCloseTo(1 - 100 * v.dragSpeed, 12);
        expect(moved.elevation).toBeCloseTo(0.5 - 50 * v.dragSpeed, 12);
    });

    test('the tilt stops short of both poles, however far the drag goes', () => {
        expect(V.dragView({ azimuth: 0, elevation: 0 }, 0, 1e6, v).elevation).toBe(v.elevationMax);
        expect(V.dragView({ azimuth: 0, elevation: 0 }, 0, -1e6, v).elevation).toBe(v.elevationMin);
        expect(v.elevationMax).toBeLessThan(Math.PI / 2);
        expect(v.elevationMin).toBeGreaterThan(-Math.PI / 2);
        // Edge-on and from below are both reachable.
        expect(v.elevationMin).toBeLessThan(0);
    });

    test('a flick glides to rest, the same at any frame rate', () => {
        const run = (fps, seconds) => {
            let o = { azimuth: 0, elevation: 0 };
            let spin = { azimuth: 2, elevation: 0 };
            for (let i = 0; i < fps * seconds; i++) {
                const n = V.stepView(o, spin, 1 / fps, v, { reducedMotion: true });
                o = { azimuth: n.azimuth, elevation: n.elevation };
                spin = n.spin;
            }
            return { o, spin };
        };
        const a = run(60, 3);
        const b = run(120, 3);
        expect(a.spin.azimuth).toBeLessThan(0.001);
        // The distance a flick carries is spin / glide, give or take a step.
        expect(a.o.azimuth).toBeCloseTo(2 / v.glide, 1);
        expect(a.o.azimuth).toBeCloseTo(b.o.azimuth, 1);
    });

    test('the drift carries on unless reduced motion is asked for, and a held drag stops both', () => {
        const o = { azimuth: 0, elevation: 0.5 };
        const still = { azimuth: 0, elevation: 0 };
        expect(V.stepView(o, still, 1, v).azimuth).toBeCloseTo(v.drift, 12);
        expect(V.stepView(o, still, 1, v, { reducedMotion: true }).azimuth).toBe(0);
        expect(V.stepView(o, { azimuth: 3, elevation: 1 }, 1, v, { held: true }).azimuth).toBe(0);
    });

    test('a wide screen keeps the composed distance, and an upright phone backs away until the disk fits', () => {
        const R = C.galaxy.radius;
        expect(V.fitDistance(16 / 9, C.camera, R, v.elevation)).toBe(C.camera.distance);
        const phone = 9 / 19.5;
        const d = V.fitDistance(phone, C.camera, R, v.elevation);
        expect(d).toBeGreaterThan(C.camera.distance);
        const halfWidth = d * Math.tan((C.camera.fov * Math.PI / 180) / 2) * phone;
        expect(halfWidth).toBeGreaterThanOrEqual(R * C.camera.fitMargin - 1e-9);
        // From high above or high below, the disk's depth fits as well.
        expect(V.fitDistance(16 / 9, C.camera, R, v.elevationMax))
            .toBeCloseTo(V.fitDistance(16 / 9, C.camera, R, v.elevationMin), 9);
    });

    test('the camera sits on its sphere, above the disk for a positive tilt', () => {
        const p = V.cameraPosition(0.7, 0.4, 80);
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(80, 9);
        expect(p.y).toBeGreaterThan(0);
        expect(V.cameraPosition(0.7, -0.4, 80).y).toBeLessThan(0);
    });
});

describe('against the real three.js WebGPU build', () => {
    let REAL;
    let saved;

    beforeAll(async () => {
        REAL = await loadRealThreeWebGPU();
        saved = globalThis.THREE;
        globalThis.THREE = REAL;
    });

    afterAll(() => {
        globalThis.THREE = saved;
    });

    test('every TSL function the galaxy calls exists in this release', async () => {
        const src = await readFile(new URL('../www/starfall/js/galaxy.js', import.meta.url), 'utf8');
        const block = src.match(/const \{([^}]+)\} = THREE\.TSL;/);
        expect(block).not.toBeNull();
        const names = block[1].split(',').map((n) => n.trim()).filter(Boolean);
        expect(names.length).toBeGreaterThan(10);
        // Most are functions, a few are nodes (instanceIndex), none is missing.
        const missing = names.filter((n) => REAL.TSL[n] === undefined);
        expect(missing).toEqual([]);
    });

    test('every THREE class the scene constructs exists in this release', async () => {
        const files = ['galaxy.js', 'main.js', 'view.js'];
        const used = new Set();
        for (const f of files) {
            const src = await readFile(new URL(`../www/starfall/js/${f}`, import.meta.url), 'utf8');
            for (const m of src.matchAll(/new THREE\.([A-Za-z0-9]+)/g)) used.add(m[1]);
            for (const m of src.matchAll(/THREE\.([A-Z][A-Za-z0-9]+)\b/g)) used.add(m[1]);
        }
        used.delete('TSL');
        const missing = [...used].filter((n) => !(n in REAL));
        expect(missing).toEqual([]);
    });

    test('the galaxy builds, every star one instance, and the pattern turns', () => {
        const galaxy = G.createGalaxy({ count: 2000, config: C });
        const stars = galaxy.object.getObjectByName('stars');
        expect(stars.count).toBe(2000);
        expect(stars.frustumCulled).toBe(false);
        expect(stars.material.blending).toBe(REAL.AdditiveBlending);
        expect(stars.material.depthWrite).toBe(false);
        expect(stars.material.positionNode).toBeTruthy();
        expect(galaxy.object.getObjectByName('core-glow')).toBeTruthy();

        galaxy.update(1);
        expect(galaxy.uniforms.turn.value).toBeCloseTo(0.1 * C.galaxy.turnRate, 12);
        // A tab back from the background hands in a huge dt. It is clamped,
        // so the galaxy never jumps.
        galaxy.update(1000);
        expect(galaxy.uniforms.turn.value).toBeCloseTo(0.2 * C.galaxy.turnRate, 12);
        galaxy.dispose();
    });

    test('reduced motion turns the pattern more slowly', () => {
        const full = G.createGalaxy({ count: 100, config: C });
        const calm = G.createGalaxy({ count: 100, config: C, reducedMotion: true });
        full.update(1 / 30);
        calm.update(1 / 30);
        expect(calm.uniforms.turn.value).toBeCloseTo(full.uniforms.turn.value * C.reducedMotion.turnScale, 9);
    });
});
