// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The pile on the results card (www/leaves/js/trophy.js), measured on the
 * real three.js. Steve's QA, 2026-10-08: "Can we make the final results card
 * more flashy looking? Maybe we could have a rotating 3D view of a pile of
 * leaves, and the pile's size is dynamic based on how the user did? For
 * example, if the user cleared 100% of the lawn then the pile would be
 * large, and if they only cleared a small portion of the yard then the pile
 * would be tiny."
 *
 * Node has no WebGL, so the renderer is the page's (tests/leaves-init boots
 * the card through the stub). Here, the pile itself.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = await import('../www/leaves/js/sim.js');

let THREE;
let Tr;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Tr = await import('../www/leaves/js/trophy.js');
});
afterAll(() => { delete globalThis.THREE; });

const T = C.trophy;
const base = S.leafSize(24000, S.areaOf(C.yard.lawn), C.leaves);

describe('how big', () => {
    test('a clear lawn is a proper heap, half the lawn a middling one, a few percent a handful', () => {
        const full = Tr.pileSize(1, T);
        const half = Tr.pileSize(0.5, T);
        const little = Tr.pileSize(0.1, T);
        const none = Tr.pileSize(0, T);
        expect(full.radius).toBeCloseTo(T.radius, 9);
        expect(full.count).toBe(T.max);
        // Told apart at a glance: each clearly smaller than the last.
        expect(half.radius).toBeLessThan(full.radius * 0.7);
        expect(little.radius).toBeLessThan(half.radius * 0.45);
        expect(little.radius).toBeLessThan(0.25);
        expect(none.count).toBe(T.min);
        expect(none.radius).toBeGreaterThan(0);
        // Its sides at the angle of a heap.
        expect(Math.atan2(full.height, full.radius) * 180 / Math.PI).toBeCloseTo(T.slope, 6);
        // Bigger always, as the share grows.
        let last = 0;
        for (let k = 0; k <= 100; k++) {
            const r = Tr.pileSize(k / 100, T).radius;
            expect(r).toBeGreaterThanOrEqual(last);
            last = r;
        }
    });

    test('every leaf lies on the heap or blown off it onto the lawn, from the foot up in the order they land', () => {
        const size = Tr.pileSize(1, T);
        const leaves = Tr.pileLeaves(size, T, 3);
        expect(leaves).toHaveLength(size.count);
        let spilled = 0;
        for (const p of leaves) {
            const r = Math.hypot(p.x, p.z);
            if (p.spill) {
                spilled++;
                expect(p.y).toBeLessThan(0.03);
                expect(r).toBeGreaterThanOrEqual(p.edge - 1e-9);
                expect(r).toBeLessThanOrEqual(p.edge * 1.45 + 1e-9);
                continue;
            }
            expect(r).toBeLessThanOrEqual(p.edge + 1e-9);
            expect(p.y).toBeCloseTo(p.top * (1 - r / p.edge), 1);
        }
        expect(spilled / leaves.length).toBeCloseTo(T.spill, 1);
        for (let i = 1; i < leaves.length; i++) expect(leaves[i].y).toBeGreaterThanOrEqual(leaves[i - 1].y);
        // The last to land is near the top, the first near the foot.
        const mean = (list) => list.reduce((a, p) => a + p.delay, 0) / list.length;
        expect(mean(leaves.slice(0, 100))).toBeLessThan(mean(leaves.slice(-100)));
        expect(Tr.pileLeaves(size, T, 3)).toEqual(leaves);
    });

    test('they rain down: not yet, falling, then landed in place, all within the rain\'s time', () => {
        const p = { y: 0.3, delay: 0.5 };
        const start = p.delay * T.rain;
        expect(Tr.rainAt(p, start - 0.01, T).shown).toBe(false);
        const mid = Tr.rainAt(p, start + T.fall / 2, T);
        expect(mid.shown).toBe(true);
        expect(mid.y).toBeGreaterThan(p.y);
        expect(mid.y).toBeLessThan(p.y + T.drop);
        const done = Tr.rainAt(p, start + T.fall, T);
        expect(done.landed).toBe(true);
        expect(done.y).toBeCloseTo(p.y, 9);
        expect(Tr.rainAt({ y: 0, delay: 1 }, Tr.rainSeconds(T), T).landed).toBe(true);
    });
});

// Steve's QA, 2026-10-08: "almost like a large pile of poop". A heap of
// leaves is lumpy, not a smooth cone, and some lie loose round its foot.
describe('not a smooth cone', () => {
    test('its reach and height vary round it by a good margin, and it stays a heap', () => {
        const ks = [];
        for (let a = 0; a < Math.PI * 2; a += 0.05) ks.push(Tr.heapEdge(a, T));
        expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(0.2);
        expect(Math.min(...ks)).toBeGreaterThan(0.7);
        expect(Math.max(...ks)).toBeLessThan(1.3);
    });
});

describe('the scene', () => {
    test('the yard\'s own leaves, every one landed at the end, turned to the heap\'s slope', () => {
        const pile = Tr.buildPile(C, 1, base);
        expect(pile.mesh.geometry.instanceCount).toBe(pile.size.count);
        const pos = pile.mesh.geometry.getAttribute('iPos');
        const rot = pile.mesh.geometry.getAttribute('iRot');
        let off = 0;
        for (let i = 0; i < pile.size.count; i++) {
            const leaf = pile.leaves[i];
            expect(pos.getY(i)).toBeCloseTo(leaf.y, 5);
            // Its face, through three's own Euler, against the slope it lies
            // on (or the lawn), give or take how leaves lie every which way.
            const n = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot.getX(i), pos.getW(i), rot.getY(i), 'YXZ'));
            const tilt = leaf.spill ? 0 : Math.atan2(leaf.top, leaf.edge);
            const slope = new THREE.Vector3(Math.sin(leaf.face) * Math.sin(tilt), Math.cos(tilt), Math.cos(leaf.face) * Math.sin(tilt));
            if (Math.abs(n.dot(slope)) < Math.cos(0.5)) off++;
        }
        expect(off / pile.size.count).toBeLessThan(0.02);
    });

    test('before the rain the leaves are out of sight, and the finds sit on top of a big heap', async () => {
        const Fd = await import('../www/leaves/js/finds.js');
        const models = Fd.buildFindModels(C.finds.list.filter((f) => f.id === 'gnome' || f.id === 'bill'));
        const pile = Tr.buildPile(C, 1, base, Object.values(models));
        pile.place(0);
        const pos = pile.mesh.geometry.getAttribute('iPos');
        let hidden = 0;
        for (let i = 0; i < pile.size.count; i++) if (pos.getY(i) < -5) hidden++;
        expect(hidden).toBeGreaterThan(pile.size.count * 0.9);
        expect(pile.place(Tr.rainSeconds(T) + 0.01)).toBe(true);
        const finds = pile.group.children.filter((c) => c.name && c.name.startsWith('find-'));
        expect(finds).toHaveLength(2);
        for (const f of finds) {
            expect(f.visible).toBe(true);
            expect(f.position.y).toBeGreaterThan(pile.size.height * 0.5);
        }
        // A heap too small to hold them: beside it, on the lawn.
        const small = Tr.buildPile(C, 0.05, base, Object.values(Fd.buildFindModels(C.finds.list.filter((f) => f.id === 'keys'))));
        const keys = small.group.children.find((c) => c.name === 'find-keys');
        expect(keys.position.y).toBe(0);
        expect(keys.position.x).toBeGreaterThan(small.size.radius);
    });
});

describe('a clear lawn inside the time', () => {
    test('golden glints drift down over the pile, round its middle, back to the top at the lawn', () => {
        const G = T.glints;
        const at0 = Tr.glintsAt(G, T.radius, 0);
        const at1 = Tr.glintsAt(G, T.radius, 1);
        expect(at0).toHaveLength(G.count);
        let fell = 0;
        at0.forEach((p, i) => {
            expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(T.radius * 1.2 + 1e-9);
            expect(p.y).toBeGreaterThan(0);
            expect(p.y).toBeLessThanOrEqual(G.height + 0.05);
            if (Math.abs(at0[i].y - at1[i].y - G.fall) < 1e-6) fell++;
        });
        // Each falls `fall` a second, but for those that wrapped to the top.
        expect(fell).toBeGreaterThan(G.count * 0.6);
        // Only on a pile asked for them.
        expect(Tr.buildPile(C, 1, base).glints).toBe(null);
        const pile = Tr.buildPile(C, 1, base, [], { glints: true });
        expect(pile.glints.geometry.getAttribute('position').count).toBe(G.count);
    });
});

describe('the card\'s view', () => {
    /** A renderer that records what it is asked to do (Node has no WebGL). */
    function fakeRenderer() {
        const made = [];
        class FakeRenderer {
            constructor(o) { this.o = o; this.renders = 0; made.push(this); }
            setClearColor() {}
            setPixelRatio(r) { this.ratio = r; }
            setSize(w, h) { this.size = [w, h]; }
            render(scene, camera) { this.renders++; this.last = { scene, camera }; }
            dispose() { this.disposed = true; }
        }
        return { FakeRenderer, made };
    }
    let real;
    beforeEach(() => { real = THREE.WebGLRenderer; });
    afterEach(() => { THREE.WebGLRenderer = real; });

    test('rains, counts up and turns while shown, then lets go', () => {
        const { FakeRenderer, made } = fakeRenderer();
        THREE.WebGLRenderer = FakeRenderer;
        const canvas = { clientWidth: 360, clientHeight: 160 };
        const view = Tr.createTrophy(canvas, C, { exposure: 1 });
        expect(made[0].o).toMatchObject({ canvas, alpha: true });
        view.show(0.62, base, [], false);
        expect(made[0].size).toEqual([360, 160]);
        const first = view.step(0.1);
        expect(first).toBeGreaterThan(0);
        expect(first).toBeLessThan(0.2);
        const turn = view.pile().group.rotation.y;
        let k = first;
        for (let i = 0; i < 40; i++) k = view.step(0.1);
        expect(k).toBe(1);
        expect(view.pile().group.rotation.y).toBeGreaterThan(turn + 1);
        expect(made[0].renders).toBe(41);
        // The camera sees the whole of the biggest heap.
        const cam = made[0].last.camera;
        cam.updateMatrixWorld(true);
        for (const p of [[T.radius, 0, 0], [-T.radius, 0, 0], [0, Tr.pileSize(1, T).height, 0]]) {
            const v = new THREE.Vector3(...p).project(cam);
            expect(Math.abs(v.x)).toBeLessThan(1);
            expect(Math.abs(v.y)).toBeLessThan(1);
        }
        view.hide();
        expect(view.pile()).toBe(null);
        expect(view.step(0.1)).toBe(1);
        view.dispose();
        expect(made[0].disposed).toBe(true);
    });

    // Steve's QA, 2026-10-08: the pile "looks kind of blurry". It was made
    // while the card was still hidden, laid out at nothing, drawn at a
    // fallback size and stretched to fill its half of the card.
    test('drawn at the size it is shown at, made while the card is hidden or not', () => {
        const { FakeRenderer, made } = fakeRenderer();
        THREE.WebGLRenderer = FakeRenderer;
        const canvas = { clientWidth: 0, clientHeight: 0 };
        const view = Tr.createTrophy(canvas, C);
        view.show(0.8, base, [], false);
        // The card opens: laid out at last.
        canvas.clientWidth = 470;
        canvas.clientHeight = 360;
        view.step(1 / 60);
        expect(made[0].size).toEqual([470, 360]);
        expect(made[0].last.camera.aspect).toBeCloseTo(470 / 360, 9);
        // And again if the window changes.
        canvas.clientWidth = 340;
        canvas.clientHeight = 200;
        view.step(1 / 60);
        expect(made[0].size).toEqual([340, 200]);
    });

    test('under reduced motion it is simply there, finished and still', () => {
        const { FakeRenderer } = fakeRenderer();
        THREE.WebGLRenderer = FakeRenderer;
        const view = Tr.createTrophy({ clientWidth: 300, clientHeight: 120 }, C);
        view.show(1, base, [], true);
        expect(view.step(0.1)).toBe(1);
        const turn = view.pile().group.rotation.y;
        view.step(1);
        expect(view.pile().group.rotation.y).toBe(turn);
        const pos = view.pile().mesh.geometry.getAttribute('iPos');
        expect(pos.getY(0)).toBeCloseTo(view.pile().leaves[0].y, 5);
    });

    test('where WebGL cannot start, there is simply no pile', () => {
        THREE.WebGLRenderer = class { constructor() { throw new Error('no WebGL'); } };
        expect(Tr.createTrophy({}, C)).toBe(null);
    });
});
