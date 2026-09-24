// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The witch on a broomstick (www/tornado/js/witch.js, Steve, 2026-09-24).
 *
 * What was promised before she was built, each held here:
 *   - every watch, in from the left as the first tumbleweed rolls, once round
 *     the funnel as it touches down, and off to the right before the cow rises
 *   - about forty pixels on a phone: sixty metres at the funnel's distance
 *   - round the upper trunk, below the dark wall cloud she would vanish into
 *   - clear of the funnel at all times, and never through it
 *   - one motion: no jump in place or heading, and no stop in mid-air
 *   - a screen reader hears about her while she is on screen
 *   - the folk figure only: nothing on the site names a film, a character or
 *     a line from one
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let F;
let W;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    F = await import('../www/tornado/js/funnel.js');
    W = await import('../www/tornado/js/witch.js');
});

afterAll(() => { delete globalThis.THREE; });

const deg = (r) => r * 180 / Math.PI;
const PHONE = { aspect: 390 / 844, pxPerDegree: 844 / 42 };
const WIDE = { aspect: 16 / 9 };

function camera(aspect) {
    const c = C.camera;
    const cam = new THREE.PerspectiveCamera(c.fovDegrees, aspect, c.near, c.far);
    cam.position.set(0, c.height, 0);
    cam.rotation.x = c.pitchDegrees * Math.PI / 180;
    cam.updateMatrixWorld(true);
    return cam;
}

/** Whether any of her (tip, middle, bristles) is inside the frame. */
function inFrame(p, cam) {
    const half = C.witch.length / 2;
    return [-1, 0, 1].some((k) => {
        const v = new THREE.Vector3(p.x + p.forward[0] * half * k, p.y + p.forward[1] * half * k,
            p.z + p.forward[2] * half * k).project(cam);
        return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    });
}

/** Story seconds, a fiftieth apart, across her whole flight and a little more. */
const flight = () => {
    const out = [];
    for (let t = C.witch.enterAt - 0.2; t <= W.witchPlan(C).exitAt + 0.2; t += 0.02) out.push(t);
    return out;
};

/** When she is in each frame. */
function windows() {
    const phone = camera(PHONE.aspect);
    const wide = camera(WIDE.aspect);
    const seen = { phone: [], wide: [] };
    for (const t of flight()) {
        const p = W.witchPoseAt(t, C);
        if (!p.visible) continue;
        if (inFrame(p, phone)) seen.phone.push(t);
        if (inFrame(p, wide)) seen.wide.push(t);
    }
    return seen;
}

describe('when she flies', () => {
    test('IN WITH THE FIRST TUMBLEWEED, AND OUT BEFORE THE COW RISES, on a phone', () => {
        const { phone } = windows();
        const firstWeed = Math.min(...C.tumbleweeds.list.map((w) => w.startAt));
        expect(Math.abs(phone[0] - firstWeed)).toBeLessThan(0.5);
        expect(phone[phone.length - 1]).toBeLessThan(C.cow.pickupAt + 0.25);
    });

    test('she arrives and leaves off the edges of a wide frame, never popping in or out', () => {
        const { wide } = windows();
        const P = W.witchPlan(C);
        expect(wide[0]).toBeGreaterThan(C.witch.enterAt + 0.02);
        expect(wide[wide.length - 1]).toBeLessThan(P.exitAt - 0.02);
        // And she is on screen the whole way between.
        for (let i = 1; i < wide.length; i++) expect(wide[i] - wide[i - 1]).toBeLessThan(0.03);
        expect(W.witchPoseAt(C.witch.enterAt - 0.01, C).visible).toBe(false);
        expect(W.witchPoseAt(P.exitAt + 0.01, C).visible).toBe(false);
    });

    test('the circle is the middle of her flight, and the funnel is there to circle', () => {
        const P = W.witchPlan(C);
        expect(W.witchPoseAt(C.witch.loopAt + 0.1, C).phase).toBe('loop');
        expect(W.witchPoseAt(P.loopEnd - 0.1, C).phase).toBe('loop');
        for (let t = C.witch.loopAt; t <= P.loopEnd; t += 0.1) {
            const s = F.funnelStateAt(t, t, C);
            // The funnel reaches down past her height for the whole circle.
            expect(F.tipOf(s.extent)).toBeLessThan(C.witch.height / s.top - 0.1);
        }
    });
});

describe('what she looks like from the camera', () => {
    test('ABOUT FORTY PIXELS ON A PHONE, and never under thirty', () => {
        const phone = camera(PHONE.aspect);
        const sizes = [];
        for (const t of flight()) {
            const p = W.witchPoseAt(t, C);
            if (!p.visible || !inFrame(p, phone)) continue;
            const d = Math.hypot(p.x, p.y - C.camera.height, p.z);
            sizes.push(deg(C.witch.length / d) * PHONE.pxPerDegree);
        }
        expect(Math.min(...sizes)).toBeGreaterThan(30);
        expect(Math.max(...sizes)).toBeGreaterThan(40);
        expect(C.witch.length).toBe(60);
    });

    test('BELOW THE WALL CLOUD, which is as dark as she is, wherever she is on screen', () => {
        const wide = camera(WIDE.aspect);
        for (const t of flight()) {
            const p = W.witchPoseAt(t, C);
            if (!p.visible || !inFrame(p, wide)) continue;
            // Her hat's tip, at most, stays below where the funnel meets the
            // wall cloud, with a degree to spare.
            const s = F.funnelStateAt(t, t, C);
            const top = F.spineAt(1, s);
            const cloud = deg(Math.atan2(top.y - C.camera.height, Math.hypot(top.x, top.z)));
            const hat = p.y + C.witch.length * 0.5 * p.up[1];
            const el = deg(Math.atan2(hat - C.camera.height, Math.hypot(p.x, p.z)));
            expect([t, el < cloud - 1]).toEqual([t, true]);
            // And well above the fields.
            expect(el).toBeGreaterThan(8);
        }
    });

    test('CLEAR OF THE FUNNEL at every moment, however it snakes', () => {
        for (const t of flight()) {
            const p = W.witchPoseAt(t, C);
            if (!p.visible) continue;
            for (const anim of [0, 0.7, 1.9, 3.1, 4.6, 6.2]) {
                const s = F.funnelStateAt(t, anim, C);
                if (s.extent < 0.001) continue;
                const u = Math.min(1, p.y / s.top);
                const axis = F.spineAt(u, s);
                const gap = Math.hypot(p.x - axis.x, p.z - axis.z) - F.radiusAt(u, s) - C.witch.length / 2;
                expect([t, anim, gap > 30]).toEqual([t, anim, true]);
            }
        }
    });
});

describe('one motion', () => {
    test('NO JUMP IN PLACE OR HEADING, and no stop in mid-air', () => {
        const P = W.witchPlan(C);
        let prev = null;
        const step = 0.01;
        for (let t = C.witch.enterAt; t <= P.exitAt; t += step) {
            const p = W.witchPoseAt(t, C);
            expect(p.visible).toBe(true);
            expect(p.speed).toBeGreaterThanOrEqual(P.loopSpeed - 1e-6);
            if (prev) {
                const moved = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
                // No further than her fastest speed allows in the step.
                expect(moved).toBeLessThan(P.runSpeed * step * 1.02);
                const turn = Math.acos(Math.min(1, p.forward.reduce((a, v, i) => a + v * prev.forward[i], 0)));
                // Round the circle she turns 2 pi in loopSeconds; nothing faster.
                expect(turn).toBeLessThan(2 * Math.PI / C.witch.loopSeconds * step * 1.5);
            }
            prev = p;
        }
    });

    test('her heading is the way she is moving, and her up leans into the turn', () => {
        const t = C.witch.loopAt + C.witch.loopSeconds * 0.3;
        const a = W.witchPoseAt(t, C);
        const b = W.witchPoseAt(t + 0.001, C);
        const v = [b.x - a.x, b.y - a.y, b.z - a.z];
        const len = Math.hypot(...v);
        expect(v.reduce((s, x, i) => s + (x / len) * a.forward[i], 0)).toBeGreaterThan(0.999);
        const c = W.loopCenter(C);
        const inward = [c.x - a.x, 0, c.z - a.z];
        expect(inward[0] * a.up[0] + inward[2] * a.up[2]).toBeGreaterThan(0);
        // Square to her heading.
        expect(Math.abs(a.up.reduce((s, x, i) => s + x * a.forward[i], 0))).toBeLessThan(1e-9);
    });
});

describe('the rig', () => {
    test('builds four dark meshes and flies them, facing her heading', () => {
        const scene = new THREE.Scene();
        const group = W.initWitch(scene, C);
        let meshes = 0;
        group.traverse((o) => { if (o.isMesh) meshes += 1; });
        expect(meshes).toBe(4);
        W.updateWitch(C.witch.enterAt - 1, C);
        expect(group.visible).toBe(false);
        const t = C.witch.loopAt + 1;
        W.updateWitch(t, C, 0.5);
        expect(group.visible).toBe(true);
        const p = W.witchPoseAt(t, C);
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
        expect(fwd.dot(new THREE.Vector3(...p.forward))).toBeGreaterThan(0.9999);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion);
        expect(up.dot(new THREE.Vector3(...p.up))).toBeGreaterThan(0.9999);
        // Sixty metres, bristles to tip.
        group.updateMatrixWorld(true);
        const broom = group.getObjectByName('witch-broom');
        const box = new THREE.Box3().setFromObject(broom);
        expect(box.getSize(new THREE.Vector3()).length()).toBeGreaterThan(C.witch.length * 0.95);
    });
});

describe('the page', () => {
    test('a screen reader hears about her while she is on screen', () => {
        const beat = C.narration.beats.find((b) => b.text && /witch/i.test(b.text));
        expect(beat).toBeTruthy();
        expect(beat.text).toContain('touches down');
        expect(beat.at).toBeGreaterThan(C.witch.enterAt);
        expect(beat.at).toBeLessThan(C.witch.loopAt);
    });

    test('main.js builds her and flies her every frame', () => {
        const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');
        expect(main).toMatch(/initWitch\(scene, CONFIG\);/);
        expect(main).toMatch(/updateWitch\(arc, CONFIG, motion\);/);
    });

    test('THE FOLK FIGURE ONLY: nothing names a film, a character, or a line from one', () => {
        const files = [
            ...readdirSync(join(process.cwd(), 'www/tornado/js'))
                .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))
                .map((f) => join('www/tornado/js', f)),
            'www/tornado/index.html', 'www/llms.txt', 'www/index.html'
        ];
        for (const file of files) {
            const text = readFileSync(join(process.cwd(), file), 'utf8');
            expect([file, /\bOz\b|wizard|wicked|dorothy|\btoto\b|glinda|gulch|ruby slipper|my pretty/i.test(text)])
                .toEqual([file, false]);
        }
    });
});
