// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for Tornado Alley's animation clock: nothing that turns or drifts may
 * lurch when the story changes its rate.
 *
 * QA 2026-09-23: "when the rainbows appear, the clouds swirl really fast for
 * a second or two". The storm base turned by uTime * (a rate that falls as the
 * wall cloud draws in), so the fall repriced every second the clock had run
 * and the whole base whipped backward, worse on every replay. The pond's
 * ripples drifted by wind * uTime the same way as the inflow died. Both are
 * now added up a frame at a time, and these tests play the story at sixty
 * frames a second with the clock already five minutes in (a few replays) and
 * hold every frame's step to what the fastest rate allows.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

for (const name of ['config', 'funnel', 'wind']) {
    jest.unstable_mockModule(`../www/tornado/js/${name}.min.js`, async () => (
        await import(`../www/tornado/js/${name}.js`)
    ));
}

let THREE;
let C;
let F;
let world;
let pond;
let windAt;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    F = await import('../www/tornado/js/funnel.js');
    world = await import('../www/tornado/js/world.js');
    pond = await import('../www/tornado/js/pond.js');
    ({ windAt } = await import('../www/tornado/js/wind.js'));
});

afterAll(() => { delete globalThis.THREE; });

const FRAME = 1 / 60;
// The animation clock after a few replays: it never goes back to zero.
const LATER = 300;

/** Play the story at sixty frames a second, calling step(arc, anim). */
function play(step, { from = 0, to = C.story.seconds } = {}) {
    for (let arc = from, anim = LATER; arc <= to + 1e-9; arc += FRAME, anim += FRAME) step(arc, anim);
}

describe('THE STORM BASE NEVER WHIPS ROUND', () => {
    test('every frame turns it by no more than its fastest rate allows, and always the same way', () => {
        const scene = new THREE.Scene();
        world.initWorld(scene, C);
        const base = scene.children.find((o) => o.material && o.material.uniforms && o.material.uniforms.uSpin);
        const most = world.baseSpinRate(1) * FRAME + 1e-9;
        let last = null;
        let worst = 0;
        play((arc, anim) => {
            world.updateWorld(F.funnelStateAt(arc, anim, C), true, C);
            const spin = base.material.uniforms.uSpin.value;
            if (last !== null) {
                expect([arc, spin - last >= 0, spin - last <= most]).toEqual([arc, true, true]);
                worst = Math.max(worst, spin - last);
            }
            last = spin;
        });
        expect(worst).toBeGreaterThan(0);
    });

    test('as the wall cloud draws in, the old way would have whipped it round', () => {
        // Why the test above matters: the same moment priced the old way.
        const oldSpin = (arc, anim) => anim * world.baseSpinRate(F.funnelStateAt(arc, anim, C).wall);
        let worst = 0;
        play((arc, anim) => {
            worst = Math.max(worst, Math.abs(oldSpin(arc + FRAME, anim + FRAME) - oldSpin(arc, anim)));
        }, { from: 20, to: 24.5 });
        expect(worst).toBeGreaterThan(20 * world.baseSpinRate(1) * FRAME);
    });

    test('a seek does not jump it, and a fresh build starts it again', () => {
        const scene = new THREE.Scene();
        world.initWorld(scene, C);
        const base = scene.children.find((o) => o.material && o.material.uniforms && o.material.uniforms.uSpin);
        world.updateWorld(F.funnelStateAt(2, LATER, C), true, C);
        world.updateWorld(F.funnelStateAt(2, LATER + FRAME, C), true, C);
        const before = base.material.uniforms.uSpin.value;
        // The story leaps to the end; the animation clock only ticks a frame.
        world.updateWorld(F.funnelStateAt(C.story.seconds, LATER + 2 * FRAME, C), true, C);
        expect(base.material.uniforms.uSpin.value - before).toBeLessThanOrEqual(world.baseSpinRate(1) * FRAME + 1e-9);
        world.initWorld(new THREE.Scene(), C);
        world.updateWorld(F.funnelStateAt(0, 0, C), true, C);
    });

    test('the shader takes the turn whole', () => {
        const scene = new THREE.Scene();
        world.initWorld(scene, C);
        const base = scene.children.find((o) => o.material && o.material.uniforms && o.material.uniforms.uSpin);
        expect(base.material.fragmentShader).toContain('float spin = uSpin * 2200.0 / (r + 1400.0);');
        expect(base.material.fragmentShader).not.toMatch(/uTime \* \(/);
    });
});

describe('THE POND\'S RIPPLES NEVER SLIDE', () => {
    test('every frame drifts them by no more than the strongest wind allows', () => {
        const scene = new THREE.Scene();
        const water = pond.initPond(scene, C);
        const drift = water.material.uniforms.uDrift.value;
        const most = C.wind.max * pond.DRIFT_RATE * FRAME + 1e-9;
        let last = null;
        let moved = 0;
        play((arc, anim) => {
            const s = F.funnelStateAt(arc, anim, C);
            pond.updatePond(windAt(C.pond.x, C.pond.z, s, C), anim, C);
            if (last) {
                const step = Math.hypot(drift.x - last.x, drift.y - last.y);
                expect([arc, step <= most]).toEqual([arc, true]);
                moved += step;
            }
            last = { x: drift.x, y: drift.y };
        });
        expect(moved).toBeGreaterThan(0.5);
        expect(water.material.fragmentShader).toContain('vec2 p = vW.xz - uDrift;');
        expect(water.material.fragmentShader).not.toMatch(/uWind \* uTime/);
    });
});
