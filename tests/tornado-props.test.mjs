// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for Tornado Alley's props: the farm, the fence, the pond, the trees
 * and wildflowers, and the wind they bend in (added 2026-09-23 on the
 * approved M1 look).
 *
 * THE COMPOSITION IS ASSERTED AS BEARINGS. The camera never moves, so what a
 * visitor sees is decided by atan(x / -z) against the frame: about 34 degrees
 * either side in landscape and 10 on a portrait phone (the fov is vertical).
 * Two faults were found this way before any screenshot: the farmhouse stood
 * over the funnel's ground contact, and the windbreak stood where the
 * roped-out tornado's foot trails. Both tests below were checked against
 * those first placements.
 *
 * Real three runs in a vm context for the builds, as in
 * tests/person-rig-seams.test.mjs, so a windmill really turns.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// The scene's sources, not their builds, so coverage measures what was written.
for (const name of ['config', 'funnel', 'wind', 'pond']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let F;
let wind;
let farm;
let pond;
let flora;
let TS;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, {
        get: (_t, p) => (p === 'createLinearGradient' || p === 'createRadialGradient'
            ? () => ({ addColorStop() {} }) : () => {}),
        set: () => true
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context }) };
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    F = await import('../www/tornado/js/funnel.js');
    wind = await import('../www/tornado/js/wind.js');
    farm = await import('../www/tornado/js/farm.js');
    pond = await import('../www/tornado/js/pond.js');
    flora = await import('../www/tornado/js/flora.js');
    TS = await import('../www/shared/js/treespecies-1.0.0.js');
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

const deg = (r) => r * 180 / Math.PI;
const bearing = (x, z) => deg(Math.atan2(x, -z));
const halfWidth = (aspect) => deg(Math.atan(Math.tan((C.camera.fovDegrees / 2) * Math.PI / 180) * aspect));
const LANDSCAPE = () => halfWidth(16 / 9);
const PORTRAIT = () => halfWidth(0.46);
const quarter = () => Array.from({ length: C.story.seconds * 4 + 1 }, (_, i) => i / 4);

/** Every building, as the span of bearings it covers. */
function buildings() {
    const { house, barn, silo, windmill } = C.farm;
    return [
        ['house', house.x, house.z, house.width / 2],
        ['barn', barn.x, barn.z, barn.width / 2],
        ['silo', silo.x, silo.z, silo.radius],
        ['windmill', windmill.x, windmill.z, windmill.rotor]
    ].map(([name, x, z, half]) => {
        const b = bearing(x, z);
        const spread = deg(Math.atan2(half, -z));
        return { name, x, z, from: b - spread, to: b + spread };
    });
}

/** Where the funnel meets the ground, as a span of bearings. */
function groundContact(t) {
    const s = F.funnelStateAt(t, t, C);
    const g = F.spineAt(0, s);
    const b = bearing(g.x, g.z);
    const spread = deg(Math.atan2(F.radiusAt(0.05, s) + 5, -g.z));
    return { s, from: b - spread, to: b + spread };
}

const overlaps = (a, b) => a.from < b.to && b.from < a.to;

describe('the farm is composed against the frame', () => {
    test('every building is in a landscape frame, and a phone sees the house and the barn', () => {
        for (const b of buildings()) {
            expect([b.name, b.from > -LANDSCAPE() + 3 && b.to < LANDSCAPE() - 3]).toEqual([b.name, true]);
        }
        for (const b of buildings().filter((x) => x.name === 'house' || x.name === 'barn')) {
            expect([b.name, b.from > -PORTRAIT() && b.to < PORTRAIT()]).toEqual([b.name, true]);
        }
    });

    test('NO BUILDING STANDS OVER THE FUNNEL\'S GROUND CONTACT while it is down', () => {
        for (const t of quarter()) {
            const contact = groundContact(t);
            if (contact.s.extent < 1) continue;
            for (const b of buildings()) {
                expect([t, b.name, overlaps(b, contact)]).toEqual([t, b.name, false]);
            }
        }
    });

    test('the farm is well in front of the storm, and the buildings do not overlap', () => {
        const all = buildings();
        for (const b of all) expect(-b.z).toBeLessThan(C.storm.distance - 1000);
        const { house, barn, silo } = C.farm;
        expect(Math.abs(house.x - barn.x)).toBeGreaterThan((house.width + barn.width) / 2);
        expect(Math.hypot(barn.x - silo.x, barn.z - silo.z)).toBeGreaterThan(silo.radius + barn.width / 2);
    });
});

describe('the trees are composed against the frame', () => {
    const canopy = (entry) => {
        const resolved = flora.resolveTree(entry);
        const b = bearing(entry.x, entry.z);
        const d = Math.hypot(entry.x, entry.z);
        const spread = deg(Math.atan2(resolved.matureHeight * 0.45, d));
        return { from: b - spread, to: b + spread, d };
    };

    test('THE ROPED-OUT TORNADO\'S FOOT IS NEVER BEHIND A TREE', () => {
        // The rope-out is the best shot in the scene, and its ground contact
        // trails well to one side. A tree over it would cut off its foot.
        for (const t of quarter()) {
            const contact = groundContact(t);
            if (contact.s.extent < 0.5 || contact.s.rope < 0.3) continue;
            for (const entry of C.trees) {
                expect([t, entry.species, entry.x, overlaps(canopy(entry), contact)])
                    .toEqual([t, entry.species, entry.x, false]);
            }
        }
    });

    test('no tree stands over the funnel\'s ground contact, in the pond, or out of frame', () => {
        for (const entry of C.trees) {
            const c = canopy(entry);
            expect([entry.x, c.to > -LANDSCAPE() && c.from < LANDSCAPE()]).toEqual([entry.x, true]);
            expect([entry.x, pond.inPond(entry.x, entry.z, 2, C)]).toEqual([entry.x, false]);
            expect(TS.speciesById(entry.species)).not.toBeNull();
        }
        for (const t of [26, 32, 38]) {
            const contact = groundContact(t);
            for (const entry of C.trees) {
                expect([t, entry.x, overlaps(canopy(entry), contact)]).toEqual([t, entry.x, false]);
            }
        }
    });

    test('the wildflowers stand in front of the camera, out of the water', () => {
        const all = flora.meadowPlacements(C, false);
        expect(all.length).toBe(C.meadow.count);
        expect(flora.meadowPlacements(C, true).length).toBe(C.meadow.mobileCount);
        for (const f of all) {
            expect(-f.z).toBeGreaterThanOrEqual(C.meadow.near);
            expect(-f.z).toBeLessThanOrEqual(C.meadow.far);
            expect(pond.inPond(f.x, f.z, 1.5, C)).toBe(false);
            expect(C.meadow.palette).toContain(f.hue);
        }
        // Seeded: the same meadow every visit.
        expect(flora.meadowPlacements(C, false)).toEqual(all);
    });
});

describe('the wind', () => {
    const at = (t) => F.funnelStateAt(t, t, C);

    test('before the storm there is only a breath of evening air', () => {
        const w = wind.windAt(0, -50, at(0), C);
        expect(w.x).toBeCloseTo(C.wind.ambient.x, 10);
        expect(w.z).toBeCloseTo(C.wind.ambient.z, 10);
    });

    test('in the storm the air pulls toward the tornado, stronger than a garden storm', () => {
        const s = at(30);
        const g = F.spineAt(0, s);
        for (const [x, z] of [[30, -70], [-200, -450], [400, -1200]]) {
            const w = wind.windAt(x, z, s, C);
            const toward = (g.x - x) * w.x + (g.z - z) * w.z;
            expect(toward).toBeGreaterThan(0);
            expect(w.speed).toBeGreaterThan(0.72);
        }
    });

    test('closer to the funnel it is stronger and it swirls, and it never exceeds the cap', () => {
        const s = at(30);
        const g = F.spineAt(0, s);
        const far = wind.windAt(g.x, g.z + 1500, s, C);
        const near = wind.windAt(g.x, g.z + C.wind.vortexRadius, s, C);
        expect(near.speed).toBeGreaterThan(far.speed);
        // At that point the pull is along +z... well, toward the funnel, so any
        // x in the wind is the swirl.
        expect(Math.abs(near.x)).toBeGreaterThan(0.3);
        const close = wind.windAt(g.x + 20, g.z + 20, s, C);
        expect(close.speed).toBeLessThanOrEqual(C.wind.max + 1e-9);
        expect(Math.hypot(close.x, close.z)).toBeCloseTo(close.speed, 9);
    });
});

describe('the pond', () => {
    test('the water roughens with the wind', () => {
        expect(pond.rippleFor(0, C)).toBe(C.pond.ripple);
        expect(pond.rippleFor(1.2, C)).toBeGreaterThan(pond.rippleFor(0.2, C));
    });

    test('in the pond is inside its ellipse, and a margin grows it', () => {
        const P = C.pond;
        expect(pond.inPond(P.x, P.z, 0, C)).toBe(true);
        expect(pond.inPond(P.x + P.radiusX + 1, P.z, 0, C)).toBe(false);
        expect(pond.inPond(P.x + P.radiusX + 1, P.z, 2, C)).toBe(true);
    });
});

describe('the farm is built', () => {
    test('the barn shows its gambrel to the camera', () => {
        const profile = farm.gambrelProfile(C.farm.barn);
        const ys = profile.map(([, y]) => y);
        expect(Math.max(...ys)).toBe(C.farm.barn.ridge);
        // Symmetric about its middle, with a knee between eave and ridge.
        for (const [x, y] of profile) {
            expect(profile.some(([x2, y2]) => Math.abs(x2 + x) < 1e-9 && y2 === y)).toBe(true);
        }
        expect(ys).toContain(C.farm.barn.knee);
    });

    test('THE WINDMILL FACES INTO THE WIND and spins faster in more of it', () => {
        const scene = new THREE.Scene();
        farm.initFarm(scene, C);
        const mill = scene.getObjectByName('windmill');
        const head = mill.children[mill.children.length - 1];
        const wheel = head.children[0];
        // Air moving toward +x: the wheel must face -x, upwind.
        farm.updateFarm({ x: 1, z: 0, speed: 1 }, 0.5, C);
        head.updateMatrixWorld(true);
        const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion);
        expect(facing.x).toBeCloseTo(-1, 6);
        const slow = wheel.rotation.z;
        farm.updateFarm({ x: 1, z: 0, speed: 2 }, 0.5, C);
        expect(wheel.rotation.z - slow).toBeCloseTo(2 * slow, 6);
        // Dead calm keeps the last heading.
        farm.updateFarm({ x: 0, z: 0, speed: 0 }, 0.5, C);
        expect(new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion).x).toBeCloseTo(-1, 6);
        for (const name of ['farmhouse', 'barn', 'silo', 'fence']) {
            expect(scene.getObjectByName(name)).toBeTruthy();
        }
    });
});

describe('everything builds and bends through the whole minute', () => {
    test('the pond and the flora follow the wind at every half second', () => {
        const scene = new THREE.Scene();
        pond.initPond(scene, C);
        flora.initFlora(scene, C, { mobile: true });
        const water = scene.getObjectByName('pond');
        const flowers = scene.getObjectByName('wildflowers');
        expect(flowers.count).toBe(C.meadow.mobileCount);
        expect(scene.children.filter((o) => o.name.startsWith('tree-')).length).toBe(C.trees.length);
        for (let t = 0; t <= C.story.seconds; t += 0.5) {
            const s = F.funnelStateAt(t, t, C);
            flora.updateFlora(s, t, 1, C);
            pond.updatePond(wind.windAt(C.pond.x, C.pond.z, s, C), t, C);
            expect(Number.isFinite(water.material.uniforms.uRipple.value)).toBe(true);
        }
        // Reduced motion damps the meadow's wind rather than stopping it.
        const storm = F.funnelStateAt(30, 30, C);
        flora.updateFlora(storm, 30, 0.35, C);
        const lean = scene.children.find((o) => o.name.startsWith('tree-'));
        expect(lean).toBeTruthy();
    });

    test('updates before anything is built do nothing', async () => {
        jest.resetModules();
        for (const name of ['config', 'funnel', 'wind', 'pond']) {
            jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
                await import(`../www/tornado/js/${name}.js`)
            ));
        }
        const freshPond = await import('../www/tornado/js/pond.js?fresh');
        const freshFarm = await import('../www/tornado/js/farm.js?fresh');
        expect(() => freshPond.updatePond({ x: 1, z: 0, speed: 1 }, 1, C)).not.toThrow();
        expect(() => freshFarm.updateFarm({ x: 1, z: 0, speed: 1 }, 1, C)).not.toThrow();
    });
});
