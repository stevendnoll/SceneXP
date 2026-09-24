// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tornado Alley's performance pass (M7, 2026-09-24), held.
 *
 * Measured offline first with real three (www/lib/three.min.js in node:vm),
 * which is how this suite builds the scene too:
 *
 *   1. THE SKY WAS SHADED ON EVERY PIXEL. It sat at renderOrder -1000, the
 *      front of the opaque pass, so the ground, the wall cloud, the farm and
 *      the trees painted over a third to a half of a portrait phone's frame
 *      after the sky's shader had already run there. Drawn last of the opaque
 *      things, with the depth test on, those pixels are rejected unshaded.
 *   2. THE WALL CLOUD SHADED ITS INSIDE. A DoubleSide lathe draws its far,
 *      inner faces too. The lathe is closed and wound outward, so front faces
 *      alone are the same silhouette.
 *   3. THE COWS WERE HALF THE DRAW CALLS: 18 meshes each, 90 for the herd, of
 *      176 at the peak. The plain-colored parts are instanced across the herd
 *      now (19 calls), proved pose for pose against the old rig.
 *   4. ADAPTIVE RESOLUTION, which the PRD asked for (section 8), is High
 *      Water's, shared (shared/js/resolution-1.0.0.js, its own suite).
 *   5. A PHONE CAN BE MEASURED: the QA hooks and a ?stats readout reach the
 *      house network (perf.js).
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
let F;
let M;
const perf = await import('../www/tornado/js/perf.js');

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
    M = {
        world: await import('../www/tornado/js/world.js'),
        shells: await import('../www/tornado/js/shells.js'),
        farm: await import('../www/tornado/js/farm.js'),
        pond: await import('../www/tornado/js/pond.js'),
        flora: await import('../www/tornado/js/flora.js'),
        tumble: await import('../www/tornado/js/tumbleweeds.js'),
        cow: await import('../www/tornado/js/cow.js'),
        rainbow: await import('../www/tornado/js/rainbow.js'),
        payloads: await import('../www/tornado/js/payloads.js')
    };
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

/** The whole scene, as main.js builds it, on the desktop settings. */
function buildScene() {
    const scene = new THREE.Scene();
    const shared = F.funnelUniforms(C);
    M.world.initWorld(scene, C);
    M.shells.initShells(scene, shared, C);
    M.shells.setShellCount(C.shells.layers.length);
    M.farm.initFarm(scene, C);
    M.pond.initPond(scene, C);
    M.flora.initFlora(scene, C, { mobile: false });
    M.tumble.initTumbleweeds(scene, C);
    M.cow.initCows(scene, C);
    M.rainbow.initRainbow(scene, C);
    M.payloads.initPayloads(scene, C);
    const at = (t) => {
        const s = F.funnelStateAt(t, t, C);
        F.applyFunnelState(shared, s);
        M.world.updateWorld(s, true, C);
        M.shells.updateShells(s, C.shells.layers.length);
        M.flora.updateFlora(s, t, 1, C);
        M.tumble.updateTumbleweeds(t, C);
        M.cow.updateCows(t, C, true);
        M.payloads.updatePayloads(t, 'cow', C);
        M.rainbow.updateRainbow(t, C);
        scene.updateMatrixWorld(true);
    };
    return { scene, at };
}

const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const drawables = (scene) => {
    const out = [];
    scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) out.push(o); });
    return out;
};

describe('the sky is drawn last of the opaque things', () => {
    test('AFTER EVERY OPAQUE MESH, with the depth test on, so covered pixels go unshaded', () => {
        const { scene, at } = buildScene();
        at(16);
        const sky = drawables(scene).find((o) => o.renderOrder === M.world.SKY_ORDER);
        expect(sky).toBeTruthy();
        expect(sky.material.transparent).toBe(false);
        expect(sky.material.depthTest).toBe(true);
        expect(sky.material.depthWrite).toBe(false);
        const opaque = drawables(scene).filter((o) => o !== sky && !(o.material && o.material.transparent));
        expect(opaque.length).toBeGreaterThan(20);
        for (const o of opaque) expect([o.name || o.type, o.renderOrder < sky.renderOrder]).toEqual([o.name || o.type, true]);
    });

    test('and nothing transparent moved: the storm base, then the rainbow, then the funnel', () => {
        const { scene } = buildScene();
        const base = drawables(scene).find((o) => o.renderOrder === -900);
        const bow = scene.getObjectByName('rainbow');
        expect(base.material.transparent).toBe(true);
        expect(bow.renderOrder).toBeGreaterThan(base.renderOrder);
        const shells = [];
        scene.getObjectByName('shells').traverse((o) => { if (o.isMesh) shells.push(o); });
        for (const s of shells) expect(s.renderOrder).toBeGreaterThan(bow.renderOrder);
    });
});

describe('the wall cloud draws its outside only', () => {
    test('FRONT FACES, and its lathe is closed and wound outward, so they are the whole silhouette', () => {
        const { scene, at } = buildScene();
        at(16);
        const wall = scene.getObjectByName('wall-cloud');
        expect(wall.material.side).toBe(THREE.FrontSide);
        const W = wall.matrixWorld;
        const center = new THREE.Vector3().setFromMatrixPosition(W);
        const g = wall.geometry;
        const p = g.attributes.position;
        const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
        const n = new THREE.Vector3(); const mid = new THREE.Vector3();
        const count = { outward: 0, inward: 0, down: 0, up: 0 };
        for (let i = 0; i < g.index.count; i += 3) {
            a.fromBufferAttribute(p, g.index.getX(i)).applyMatrix4(W);
            b.fromBufferAttribute(p, g.index.getX(i + 1)).applyMatrix4(W);
            c.fromBufferAttribute(p, g.index.getX(i + 2)).applyMatrix4(W);
            n.subVectors(b, a).cross(c.clone().sub(a));
            if (n.lengthSq() < 1e-12) continue;
            n.normalize();
            mid.copy(a).add(b).add(c).divideScalar(3);
            const radial = new THREE.Vector3(mid.x - center.x, 0, mid.z - center.z);
            if (radial.length() < 1e-6 || Math.abs(n.y) > 0.99) count[n.y < 0 ? 'down' : 'up'] += 1;
            else if (n.dot(radial.normalize()) > 0) count.outward += 1;
            else count.inward += 1;
        }
        // Every side face points out; the underside faces down and the top,
        // tucked into the storm base, faces up.
        expect(count.inward).toBe(0);
        expect(count.outward).toBeGreaterThan(100);
        expect(count.down).toBeGreaterThan(0);
        expect(count.up).toBeGreaterThan(0);
        // The underside is lower than the top.
        const box = new THREE.Box3().setFromObject(wall);
        expect(box.min.y).toBeLessThan(box.max.y);
    });
});

describe('the herd is instanced', () => {
    test('THE DRAW CALLS STAY UNDER BUDGET at every second of the story', () => {
        // 176 at the peak before M7, 105 after. The budget is where the
        // scene is now, so a regression is noticed on the day it lands.
        const { scene, at } = buildScene();
        let peak = 0;
        for (let t = 0; t <= C.story.seconds; t += 0.5) {
            at(t);
            let calls = 0;
            for (const o of drawables(scene)) {
                if (!shown(o)) continue;
                calls += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
            }
            peak = Math.max(peak, calls);
        }
        expect(peak).toBeLessThanOrEqual(110);
    });

    test('five cows are 19 draw calls: nine instanced kinds, and each cow\'s own hide', () => {
        const { scene, at } = buildScene();
        at(C.cow.landAt + 2);
        const kinds = scene.children.filter((o) => o.isInstancedMesh && o.name.startsWith('cow-parts-'));
        expect(kinds.length).toBe(9);
        const cows = ['cow', ...C.cow.pasture.map((_, i) => `pasture-cow-${i}`)];
        let hides = 0;
        for (const name of cows) {
            scene.getObjectByName(name).traverse((o) => { if (o.isMesh) hides += 1; });
        }
        expect(hides).toBe(2 * cows.length);
        for (const k of kinds) expect(k.frustumCulled).toBe(false);
    });

    test('EVERY INSTANCE SITS WHERE ITS PLACEHOLDER IS, and a hidden cow draws nothing', () => {
        const { scene, at } = buildScene();
        const kinds = {};
        scene.children.forEach((o) => { if (o.isInstancedMesh) kinds[o.name.replace('cow-parts-', '')] = o; });
        const cows = ['cow', ...C.cow.pasture.map((_, i) => `pasture-cow-${i}`)];
        const m = new THREE.Matrix4();
        let checked = 0;
        let hidden = 0;
        for (const t of [0, C.cow.pickupAt + 1, C.cow.flingAt + 1, C.cow.landAt + 2]) {
            at(t);
            const next = {};
            for (const name of cows) {
                const rig = scene.getObjectByName(name);
                rig.traverse((node) => {
                    const kind = node.userData.kind;
                    if (!kind) return;
                    next[kind] = (next[kind] ?? -1) + 1;
                    kinds[kind].getMatrixAt(next[kind], m);
                    if (!rig.visible) {
                        expect(m.elements.slice(0, 15).every((e) => e === 0)).toBe(true);
                        hidden += 1;
                        return;
                    }
                    const err = Math.max(...m.elements.map((e, j) => Math.abs(e - Math.fround(node.matrixWorld.elements[j]))));
                    expect(err).toBe(0);
                    checked += 1;
                });
            }
        }
        // Before the pickup the flying cow is hidden, so both branches ran.
        expect(checked).toBeGreaterThan(200);
        expect(hidden).toBeGreaterThan(0);
    });

    test('a cow built on its own still has meshes for every part', () => {
        const rig = M.cow.createCow();
        let meshes = 0;
        rig.group.traverse((o) => { if (o.isMesh) meshes += 1; });
        expect(meshes).toBe(18);
    });
});

describe('a phone can be measured (perf.js)', () => {
    test('THE HOUSE NETWORK COUNTS AS LOCAL, the public site never does', () => {
        for (const hostname of ['localhost', '127.0.0.1', '[::1]', '', '192.168.1.20',
            '10.0.0.7', '172.16.4.2', '172.31.255.1', 'steves-mac.local']) {
            expect([hostname, perf.isQaHost({ hostname })]).toEqual([hostname, true]);
        }
        for (const hostname of ['www.scenexp.com', 'scenexp.com', '8.8.8.8', '172.15.0.1',
            '172.32.0.1', '192.169.0.1', '11.0.0.1', '192.168.1.20.example.com', 'local']) {
            expect([hostname, perf.isQaHost({ hostname })]).toEqual([hostname, false]);
        }
        expect(perf.isQaHost(null)).toBe(false);
        expect(perf.isQaHost()).toBe(false);
    });

    test('?stats and ?shells=n are read, and a bad layer count is ignored', () => {
        expect(perf.qaOptions('', 4)).toEqual({ stats: false, shells: null });
        expect(perf.qaOptions('?stats', 4)).toEqual({ stats: true, shells: null });
        expect(perf.qaOptions('?stats&shells=4', 4)).toEqual({ stats: true, shells: 4 });
        expect(perf.qaOptions('?shells=0', 4)).toEqual({ stats: false, shells: 0 });
        for (const bad of ['5', '-1', '2.5', 'x', '']) {
            expect(perf.qaOptions(`?shells=${bad}`, 4).shells).toBeNull();
        }
    });

    test('the readout says what a frame costs', () => {
        expect(perf.fpsOf(30, 0.5)).toBe(60);
        expect(perf.fpsOf(3, 0)).toBe(0);
        const lines = perf.statsLines({
            fps: 58.4,
            arc: 16.26,
            readout: { ratio: 1.275, ceiling: 1.5, scale: 0.85, frameMs: 17.1, bestMs: 16.7 },
            calls: 103,
            triangles: 146458,
            shells: 3,
            width: 390,
            height: 844
        });
        expect(lines).toEqual([
            '58.4 fps · 17.1 ms (best 16.7)',
            'ratio 1.27 of 1.50 · 497 x 1076 px',
            '103 draws · 146k tris · 3 shells · t 16.3'
        ]);
        // Before the first settled frame there is no best yet.
        const early = perf.statsLines({
            fps: 0, arc: 0, readout: { ratio: 2, ceiling: 2, scale: 1, frameMs: 0, bestMs: Infinity },
            calls: 0, triangles: 0, shells: 4, width: 100, height: 100
        });
        expect(early[0]).toBe('0.0 fps · 0.0 ms (best -)');
    });
});

describe('the wiring', () => {
    const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');

    test('every frame is counted by the adaptive resolution, which also sizes the canvas', () => {
        expect(main).toContain("from '../../shared/js/resolution-1.0.0.min.js'");
        expect(main).toMatch(/export function drawFrame\(delta, arc, info = \{\}\) \{\s*if \(resolution\) resolution\.sample\(delta\);/);
        expect(main).toMatch(/resolution = createResolution\(\{ renderer, ceiling: pixelRatio, quality: CONFIG\.quality \}\);\s*resolution\.apply\(\);/);
        // Nothing else sets the ratio behind its back.
        expect(main).not.toMatch(/renderer\.setPixelRatio/);
    });

    test('the QA hooks and the readout are behind the house-network gate, and the readout behind ?stats too', () => {
        const at = main.indexOf('if (isQaHost()) {');
        expect(at).toBeGreaterThan(-1);
        const gated = main.slice(at, main.indexOf('\n    }\n', at));
        expect(gated).toMatch(/installTuningAids\(\);/);
        expect(gated).toMatch(/if \(qa\.stats\) installStats\(\);/);
        expect((main.match(/installStats\(\);/g) || []).length).toBe(1);
        expect((main.match(/installTuningAids\(\);/g) || []).length).toBe(1);
    });
});
