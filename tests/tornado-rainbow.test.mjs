// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/tornado/js/rainbow.js, the last payoff.
 *
 * The rainbow is geometry before it is color: a circle of about 42 degrees
 * round the point opposite the sun. So it is held the way the rest of the
 * composition is, as angles against the frame: its crown inside the top edge,
 * its arch across the middle so a portrait phone sees it, its right leg
 * coming down to the horizon inside a landscape frame, and the landed cow
 * under it.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let R;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    R = await import('../www/tornado/js/rainbow.js');
});

afterAll(() => { delete globalThis.THREE; });

const deg = (r) => r * 180 / Math.PI;
const TOP = () => C.camera.pitchDegrees + C.camera.fovDegrees / 2;
const halfWidth = (aspect) => deg(Math.atan(Math.tan((C.camera.fovDegrees / 2) * Math.PI / 180) * aspect));

/** The elevation of the first bow's outer edge at a bearing, or null where
 *  the bow is below the horizon. */
function crownAt(bearing) {
    for (let e = 80; e >= 0; e -= 0.05) {
        if (R.angleFromCenter(bearing, e, C) <= C.rainbow.primary.outer) return e;
    }
    return null;
}

describe('the bow is where a rainbow has to be', () => {
    test('it circles the point opposite the sun', () => {
        const sunBearing = deg(Math.atan2(C.sun.x, -C.sun.z));
        const center = R.rainbowCenter(C);
        const opposite = ((sunBearing + 180 + 540) % 360) - 180;
        expect(center.bearing).toBeCloseTo(opposite, 6);
        // Below the horizon, as it must be with the sun above it.
        expect(center.elevation).toBeLessThan(0);
        expect(Math.hypot(...center.vector)).toBeCloseTo(1, 10);
    });

    test('the second bow is outside the first, and each is a band', () => {
        const { primary, secondary } = C.rainbow;
        expect(primary.outer - primary.inner).toBeGreaterThan(1);
        expect(secondary.inner).toBeGreaterThan(primary.outer + 5);
        expect(secondary.strength).toBeLessThan(primary.strength);
        expect(primary.outer).toBeGreaterThan(41);
        expect(primary.outer).toBeLessThan(43);
    });
});

describe('the bow is composed against the frame', () => {
    test('ITS CROWN IS INSIDE THE TOP OF THE FRAME, well up the sky', () => {
        const center = R.rainbowCenter(C);
        const crown = crownAt(center.bearing);
        expect(crown).toBeLessThan(TOP() - 1);
        expect(crown).toBeGreaterThan(20);
    });

    test('a portrait phone sees it arch across', () => {
        for (let b = -halfWidth(0.46); b <= halfWidth(0.46); b += 1) {
            const e = crownAt(b);
            expect([b, e !== null && e > 5 && e < TOP() - 1]).toEqual([b, true]);
        }
    });

    test('its right leg comes down to the horizon inside a landscape frame', () => {
        let foot = null;
        for (let b = 0; b <= 60; b += 0.25) {
            if (crownAt(b) === null) { foot = b; break; }
        }
        expect(foot).not.toBeNull();
        expect(foot).toBeLessThan(halfWidth(16 / 9) - 3);
    });

    test('THE COW LANDS UNDER IT', () => {
        const L = C.cow.landing;
        const bearing = deg(Math.atan2(L.x, -L.z));
        expect(crownAt(bearing)).toBeGreaterThan(5);
    });
});

describe('when', () => {
    test('it comes out as the storm leaves, after the cow lands, and stays to the end', async () => {
        const [[from], [by]] = C.rainbow.amount;
        expect(R.rainbowAmount(from - 0.1, C)).toBe(0);
        expect(R.rainbowAmount(by, C)).toBe(1);
        expect(R.rainbowAmount(C.story.seconds, C)).toBe(1);
        // Out by the start of the fade, so it is seen before the picture goes.
        expect(by).toBeLessThanOrEqual(C.story.seconds - C.story.fadeSeconds);
        // And the funnel is gone before it is out.
        const F = await import('../www/tornado/js/funnel.js');
        expect(F.funnelStateAt(by, by, C).extent).toBe(0);
    });
});

describe('nothing of the storm hangs in front of it', () => {
    test('THE WALL CLOUD IS GONE BY THE TIME THE BOW IS OUT, and the funnel before that', async () => {
        // QA 2026-09-23 (tornado-5): the wall cloud hung on, lowered, and its
        // flat underside hid the bow. It now lifts and draws in as the bow
        // comes out, and is not drawn at all once the bow is fully out.
        const F = await import('../www/tornado/js/funnel.js');
        const world = await import('../www/tornado/js/world.js');
        const [, [full]] = C.rainbow.amount;
        const s = F.funnelStateAt(full, full, C);
        expect(s.wall).toBe(0);
        expect(world.wallUndersideRadius(s, C)).toBe(0);
        const scene = new THREE.Scene();
        world.initWorld(scene, C);
        world.updateWorld(s, true, C);
        expect(scene.getObjectByName('wall-cloud').visible).toBe(false);
        // While there is any funnel, the wall cloud is full size above it.
        const lastFunnel = F.funnelStateAt(C.rainbow.amount[0][0] - 0.25, C.rainbow.amount[0][0] - 0.25, C);
        world.updateWorld(lastFunnel, true, C);
        expect(scene.getObjectByName('wall-cloud').visible).toBe(true);
    });
});

describe('the dome', () => {
    test('builds, comes out on time, and draws after the storm base', () => {
        const scene = new THREE.Scene();
        const bow = R.initRainbow(scene, C);
        expect(bow.name).toBe('rainbow');
        expect(bow.renderOrder).toBeGreaterThan(-900);
        expect(bow.material.depthWrite).toBe(false);
        R.updateRainbow(0, C);
        expect(bow.visible).toBe(false);
        R.updateRainbow(C.story.seconds, C);
        expect(bow.visible).toBe(true);
        expect(bow.material.uniforms.uAmount.value).toBe(1);
        // The shader turns the second bow's colors round, red on the inside.
        expect(bow.material.fragmentShader).toContain('spectrum(1.0 - clamp(p2');
    });
});
