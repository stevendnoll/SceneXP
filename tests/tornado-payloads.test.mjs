// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/tornado/js/payloads.js, the replay surprises.
 *
 * THE DRAW FIRST: the cow on the first watch, every surprise once before any
 * comes round again, and never the same thing twice running.
 *
 * Then each surprise the way the cow is held (tests/tornado-cow), as angles
 * against the frame: its flight inside the frame and never jumping, a landing
 * left of center where a portrait phone sees it and the farm and the herd
 * stay clear, big enough to read in a glance, and an arrival with some speed
 * behind it. Then its one thing (the twang, the door, the bounce, the flag),
 * finished before the picture fades.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel', 'cow', 'wind']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let P;
let cow;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, {
        get: (_, key) => (key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
        set: () => true
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context }) };
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    P = await import('../www/tornado/js/payloads.js');
    cow = await import('../www/tornado/js/cow.js');
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

const deg = (r) => r * 180 / Math.PI;
const K = () => C.cow;
const TOP = () => C.camera.pitchDegrees + C.camera.fovDegrees / 2;
const BOTTOM = () => C.camera.pitchDegrees - C.camera.fovDegrees / 2;
const halfWidth = (aspect) => deg(Math.atan(Math.tan((C.camera.fovDegrees / 2) * Math.PI / 180) * aspect));
const bearingOf = (x, z) => deg(Math.atan2(x, -z));
const samples = (from = K().pickupAt) => {
    const out = [];
    for (let t = from; t <= C.story.seconds + 1e-9; t += 0.05) out.push(Number(t.toFixed(4)));
    return out;
};

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A rig's real height, measured with real three at rest. */
function heightOf(name) {
    const rig = { create: {
        flamingo: P.createFlamingo, outhouse: P.createOuthouse,
        trampoline: P.createTrampoline, mailbox: P.createMailbox
    }[name]() };
    const box = new THREE.Box3().setFromObject(rig.create.group);
    return box.max.y;
}

describe('THE DRAW', () => {
    test('the first watch is the cow, always', () => {
        expect(P.nextPayload([], () => 0.99)).toBe('cow');
        expect(P.PAYLOADS[0]).toBe('cow');
        expect(P.SURPRISES).not.toContain('cow');
    });

    test('EVERY SURPRISE ONCE before anything comes round again, never the same twice running', () => {
        const orders = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            const random = seeded(seed);
            const shown = ['cow'];
            for (let run = 0; run < 30; run++) shown.push(P.nextPayload(shown, random));
            // Runs two to five are the four surprises, each once.
            expect([...shown.slice(1, 5)].sort()).toEqual([...P.SURPRISES].sort());
            orders.add(shown.slice(1, 5).join());
            for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
            // After that the cow can come back too.
            expect(shown.slice(5)).toContain('cow');
        }
        // In a shuffled order, not a fixed one.
        expect(orders.size).toBeGreaterThan(10);
    });

    test('a random of exactly 1 still picks from the pool', () => {
        expect(P.SURPRISES).toContain(P.nextPayload(['cow'], () => 1));
    });
});

describe.each(['flamingo', 'outhouse', 'trampoline', 'mailbox'])('the %s', (name) => {
    const S = () => C.payloads[name];

    test('is not there until the tornado picks it up', () => {
        expect(P.surprisePoseAt(name, 0, C).visible).toBe(false);
        expect(P.surprisePoseAt(name, K().pickupAt - 0.01, C).visible).toBe(false);
        expect(P.surprisePoseAt(name, K().pickupAt, C).visible).toBe(true);
    });

    test('ITS FLIGHT IS INSIDE THE FRAME, a portrait one for the last of it, and never jumps', () => {
        let last = null;
        for (const t of samples()) {
            const p = P.surprisePoseAt(name, t, C);
            const d = Math.hypot(p.x, p.z);
            const elevation = deg(Math.atan2(p.y + S().length * p.scale - C.camera.height, d));
            const bearing = bearingOf(p.x, p.z);
            expect([t, elevation < TOP() - 1]).toEqual([t, true]);
            expect([t, Math.abs(bearing) < halfWidth(16 / 9) - 2]).toEqual([t, true]);
            if (t >= K().flingAt) expect([t, Math.abs(bearing) < halfWidth(0.46) - 2]).toEqual([t, true]);
            expect(p.y).toBeGreaterThanOrEqual(-(S().sink || 0) - 1e-9);
            if (last) {
                const turn = Math.abs(bearing - last.bearing) + Math.abs(elevation - last.elevation);
                expect([t, turn < 1.5]).toEqual([t, true]);
            }
            last = { bearing, elevation };
        }
    });

    test('it is true size well before it lands, and upright by then', () => {
        for (const t of samples(K().landAt - 2)) expect(P.surprisePoseAt(name, t, C).scale).toBe(1);
        expect(P.surprisePoseAt(name, K().landAt, C).upright).toBe(1);
        // Held to a few pixels while it is far off, like the cow.
        const far = P.surprisePoseAt(name, K().flingAt, C);
        expect(far.scale).toBeGreaterThan(1);
    });

    test('IT THUMPS IN, where the cow drifts down', () => {
        const a = cow.flightPosition(K().landAt - 0.1, S(), C);
        const b = cow.flightPosition(K().landAt, S(), C);
        const speed = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.1;
        expect(speed).toBeGreaterThan(6);
        const c0 = cow.cowPosition(K().landAt - 0.1, C);
        const c1 = cow.cowPosition(K().landAt, C);
        expect(Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z) / 0.1).toBeLessThan(2);
    });

    test('WHERE IT LANDS: left of center, inside a portrait phone, clear of the farm and the herd', () => {
        const L = S().landing;
        const bearing = bearingOf(L.x, L.z);
        expect(bearing).toBeLessThan(0);
        expect(Math.abs(bearing)).toBeLessThan(halfWidth(0.46) - 2);
        const rightOf = [
            ...['house', 'barn', 'silo', 'windmill'].map((k) => C.farm[k]),
            // The farmyard oak and the windbreak.
            ...C.trees.filter((tree) => tree.z < -300),
            ...K().pasture,
            K().landing
        ];
        expect(rightOf.length).toBeGreaterThan(12);
        for (const o of rightOf) expect(bearingOf(o.x, o.z)).toBeGreaterThan(bearing + 2);
        // The near trees are well to the side of it.
        const near = C.trees.filter((tree) => tree.z > -100);
        expect(near.length).toBe(3);
        for (const tree of near) expect(Math.abs(bearingOf(tree.x, tree.z) - bearing)).toBeGreaterThan(10);
        // In front of the fence, on the ground the camera sees.
        expect(-L.z).toBeLessThan(-C.fence.z);
        expect(deg(Math.atan2(-C.camera.height, Math.hypot(L.x, L.z)))).toBeGreaterThan(BOTTOM() + 5);
    });

    test('IT LANDS ON DRY GROUND: its whole footprint, measured, is out of the pond', async () => {
        // QA 2026-09-23: the trampoline came down in the middle of the pond.
        // This used to compare bearings with the pond's CENTER, 28 degrees
        // left, but the pond is 52 m across and reaches almost to straight
        // ahead, so it measured the wrong place. Now: the four corners of the
        // rig's own footprint (its box in its own axes, the roof's overhang
        // and all), turned and placed as it lands, against the pond's outline.
        const { inPond } = await import('../www/tornado/js/pond.js');
        const scene = new THREE.Scene();
        const rigs = P.initPayloads(scene, C);
        const g = rigs[name].group;
        g.updateMatrixWorld(true);
        const own = new THREE.Box3().setFromObject(g);
        P.updatePayloads(C.story.seconds, name, C);
        g.updateMatrixWorld(true);
        for (const x of [own.min.x, own.max.x]) {
            for (const z of [own.min.z, own.max.z]) {
                const corner = g.localToWorld(new THREE.Vector3(x, 0, z));
                expect([name, inPond(corner.x, corner.z, 0, C)]).toEqual([name, false]);
            }
        }
    });

    test('IT READS IN A GLANCE: tall enough on the screen, and a real size', () => {
        const L = S().landing;
        const h = heightOf(name);
        const pixels = (h / Math.hypot(L.x, L.z)) / (C.camera.fovDegrees * Math.PI / 180) * 900;
        expect(pixels).toBeGreaterThan(20);
        // The size floor is measured against its longest side.
        expect(S().length).toBeGreaterThanOrEqual(h * 0.9);
    });

    test('NOTHING JUMPS AT THE LANDING', () => {
        const a = P.surprisePoseAt(name, K().landAt - 0.005, C);
        const b = P.surprisePoseAt(name, K().landAt + 0.005, C);
        for (const key of ['x', 'y', 'z', 'door', 'flag', 'lean', 'yaw']) {
            expect([key, Math.abs(a[key] - b[key]) < 0.1]).toEqual([key, true]);
        }
    });

    test('its one thing is over before the picture fades, and it is still at the end', () => {
        const fade = C.story.seconds - C.story.fadeSeconds;
        const end = P.surprisePoseAt(name, C.story.seconds, C);
        expect(Math.abs(end.lean)).toBeLessThan(0.01);
        expect(end.y).toBeLessThanOrEqual(0);
        const still = P.surprisePoseAt(name, fade, C);
        expect(Math.abs(still.lean)).toBeLessThan(0.03);
        if (S().bounce) expect(K().landAt + P.bounceSeconds(S().bounce)).toBeLessThan(fade);
        if (S().door) {
            expect(K().landAt + S().door.opensAt + S().door.seconds).toBeLessThanOrEqual(fade);
            expect(still.door).toBeGreaterThan(S().door.open * 0.9);
        }
        if (S().flag) expect(still.flag).toBeCloseTo(1, 6);
    });

    test('its punch line', () => {
        const line = P.payloadLine(name, C);
        expect(line).toMatch(/^The storm has moved on\. The \w+ is fine, /);
        expect(line).toContain(name);
        expect(line).not.toMatch(/[;—]/);
    });
});

describe('the one things', () => {
    test('the flamingo twangs and settles, spiked in', () => {
        const S = C.payloads.flamingo;
        const peak = Math.max(...samples(K().landAt).map((t) => Math.abs(P.surprisePoseAt('flamingo', t, C).lean)));
        expect(peak).toBeGreaterThan(0.15);
        expect(P.surprisePoseAt('flamingo', K().landAt + 0.5, C).y).toBeCloseTo(-S.sink, 6);
    });

    test('the outhouse door bangs in the air, is shut on landing, and creaks open after a beat', () => {
        const flight = samples(K().flingAt).filter((t) => t < K().landAt - 1).map((t) => P.surprisePoseAt('outhouse', t, C).door);
        expect(Math.max(...flight) - Math.min(...flight)).toBeGreaterThan(0.8);
        expect(P.surprisePoseAt('outhouse', K().landAt + 0.5, C).door).toBe(0);
        const D = C.payloads.outhouse.door;
        expect(P.surprisePoseAt('outhouse', K().landAt + D.opensAt + D.seconds / 2, C).door).toBeGreaterThan(0.3);
    });

    test('the trampoline bounces, each hop lower, and the first one is a good one', () => {
        const B = C.payloads.trampoline.bounce;
        const heights = [];
        let prev = 0;
        let rising = false;
        for (let s = 0; s < P.bounceSeconds(B) + 0.5; s += 0.005) {
            const y = P.bounceAt(s, B);
            if (rising && y < prev) heights.push(prev);
            rising = y > prev;
            prev = y;
        }
        expect(heights.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]);
        expect(heights[0]).toBeGreaterThan(1);
        expect(heights[0]).toBeLessThan(3);
        expect(P.bounceAt(-1, B)).toBe(0);
        // It spins in the air like a flying disc, and the spin dies away.
        const y1 = P.surprisePoseAt('trampoline', K().landAt - 1, C).yaw;
        const y2 = P.surprisePoseAt('trampoline', K().landAt - 0.9, C).yaw;
        expect(Math.abs(y2 - y1)).toBeGreaterThan(0.5);
        const e1 = P.surprisePoseAt('trampoline', C.story.seconds - 0.1, C).yaw;
        const e2 = P.surprisePoseAt('trampoline', C.story.seconds, C).yaw;
        expect(Math.abs(e2 - e1)).toBeLessThan(1e-6);
    });

    test('the mailbox is spiked in, and a beat later the flag goes up', () => {
        const F = C.payloads.mailbox.flag;
        expect(P.surprisePoseAt('mailbox', K().landAt + F.upAt - 0.05, C).flag).toBe(0);
        const overshoot = Math.max(...samples(K().landAt).map((t) => P.surprisePoseAt('mailbox', t, C).flag));
        expect(overshoot).toBeGreaterThan(1);
        expect(overshoot).toBeLessThan(1.25);
    });
});

describe('the rigs', () => {
    test('build, take every pose of the story, and only the drawn one shows', () => {
        const scene = new THREE.Scene();
        const rigs = P.initPayloads(scene, C);
        expect(Object.keys(rigs).sort()).toEqual([...P.SURPRISES].sort());
        const shadow = scene.getObjectByName('payload-shadow');
        expect(shadow).toBeTruthy();
        for (const name of P.SURPRISES) {
            for (const t of samples(0)) {
                P.updatePayloads(t, name, C);
                for (const other of P.SURPRISES) {
                    if (other !== name) expect(rigs[other].group.visible).toBe(false);
                }
            }
            expect(rigs[name].group.visible).toBe(true);
            // Upright at the end, turned toward the camera, standing where it landed.
            const g = rigs[name].group;
            expect(g.position.x).toBeCloseTo(C.payloads[name].landing.x, 6);
            expect(g.position.z).toBeCloseTo(C.payloads[name].landing.z, 6);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
            expect(up.y).toBeGreaterThan(0.999);
            expect(shadow.visible).toBe(true);
        }
        expect(rigs.outhouse.door.rotation.y).toBeLessThan(-1);
        expect(rigs.mailbox.flag.rotation.z).toBeCloseTo(0, 3);
        // A cow's run shows none of them, and no shadow.
        P.updatePayloads(C.story.seconds, 'cow', C);
        for (const name of P.SURPRISES) expect(rigs[name].group.visible).toBe(false);
        expect(shadow.visible).toBe(false);
    });

    test('the outhouse door faces the camera and swings out toward it', () => {
        const scene = new THREE.Scene();
        const rigs = P.initPayloads(scene, C);
        P.updatePayloads(C.story.seconds, 'outhouse', C);
        const g = rigs.outhouse.group;
        g.updateMatrixWorld(true);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
        const toCamera = new THREE.Vector3(-g.position.x, 0, -g.position.z).normalize();
        expect(front.dot(toCamera)).toBeGreaterThan(0.85);
        // The door's free edge comes out toward the camera.
        const edge = new THREE.Vector3(0.8, 0, 0);
        rigs.outhouse.door.localToWorld(edge);
        const hinge = new THREE.Vector3();
        rigs.outhouse.door.getWorldPosition(hinge);
        expect(edge.clone().sub(hinge).dot(toCamera)).toBeGreaterThan(0.5);
    });
});

describe('the page', () => {
    test('the cow is the default, the ending card names each payload, and the counts say which', () => {
        const page = readFileSync(join(process.cwd(), 'www/tornado/index.html'), 'utf8');
        expect(page).toContain(`<p id="ending-line" class="ending-line">${C.cow.line}</p>`);
        expect(P.payloadLine('cow', C)).toBe(C.cow.line);
        const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');
        expect(main).toMatch(/updateCows\(arc, CONFIG, payload === 'cow'\)/);
        expect(main).toMatch(/updatePayloads\(arc, payload, CONFIG\)/);
        expect(main).toMatch(/onRewind: \(\) => \{\s*resetLightning\(\);\s*nextRun\(\);/);
        expect(main).toMatch(/track\(name, name === 'arc-complete' \? \{ \.\.\.params, payload \} : params\)/);
        expect(main).toMatch(/track: trackRun/);
        // A restart before the pickup keeps the payload nobody has seen yet.
        expect(main).toMatch(/if \(reached >= CONFIG\.cow\.pickupAt\)/);
    });
});
