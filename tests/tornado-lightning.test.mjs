// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for Tornado Alley's lightning: High Water's, promoted to
 * www/shared/js/lightning-1.0.0.js on 2026-09-23 and set up for this scene.
 *
 * THE CAP COMES FIRST. A flash here lights the whole storm base, which is a
 * general flash in WCAG 2.3.1's terms, so no two may ever be closer than
 * minGapSeconds: never more than three in any second, for every visitor and
 * not only under reduced motion. The scheduler is beaten on here with a strike
 * forced every tenth of a second for the whole story, over several seeds, and
 * the gap has to hold anyway.
 *
 * Then the scene's own promises: no lightning before the storm has organized
 * or once the rainbow is coming, bolts that fall from this storm's base and
 * land behind the tornado (so the funnel is always drawn in front of them),
 * and the flash reaching the sky, the base and the wall cloud through one
 * shared set of uniforms.
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
let LS;
let L;
let world;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    ({ TORNADO_CONFIG: C, TORNADO_LIGHTNING: LS } = await import('../www/tornado/js/config.js'));
    L = await import('../www/shared/js/lightning-1.0.0.js');
    world = await import('../www/tornado/js/world.js');
});

afterAll(() => { delete globalThis.THREE; });

const deg = (r) => r * 180 / Math.PI;

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Run the story at sixty frames a second, and return every flash that was
 *  scheduled (its time) and every strike that began (its first flash). */
function runStory(seed, { forceEvery = 0, reduced = false, distance = null } = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(C.camera.fovDegrees, 16 / 9, 1, 40000);
    camera.position.set(0, C.camera.height, 0);
    const sky = { uniforms: { uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3() } } };
    L.initLightning(scene, camera, LS, { random: seeded(seed), reducedMotion: reduced, sky });
    const flashes = new Set();
    const starts = [];
    const levels = [];
    let last = null;
    let nextForce = forceEvery;
    for (let t = 0; t <= C.story.seconds; t += 1 / 60) {
        if (forceEvery && t >= nextForce) {
            L.forceStrike(distance);
            nextForce += forceEvery;
        }
        levels.push([t, L.updateLightning(t, LS), sky.uniforms.uFlash.value]);
        const s = L.__lightning.state().strike;
        if (s && s !== last) {
            starts.push(s.flashes[0].at);
            for (const f of s.flashes) flashes.add(f.at);
        }
        last = s;
    }
    const state = L.__lightning.state();
    L.disposeLightning();
    return { flashes: [...flashes].sort((a, b) => a - b), starts, levels, state, scene };
}

describe('THE FLASH-RATE CAP', () => {
    test('the ceiling is under three flashes a second', () => {
        expect(L.flashesPerSecondCeiling(LS)).toBeLessThan(3);
    });

    test('FORCED EVERY TENTH OF A SECOND, IT STILL NEVER FLASHES CLOSER THAN THE GAP', () => {
        for (const seed of [1, 7, 42, 2026]) {
            for (const reduced of [false, true]) {
                const { flashes } = runStory(seed, { forceEvery: 0.1, reduced });
                expect(flashes.length).toBeGreaterThan(20);
                for (let i = 1; i < flashes.length; i++) {
                    expect([seed, reduced, flashes[i] - flashes[i - 1] >= LS.storm.lightning.minGapSeconds - 1e-9])
                        .toEqual([seed, reduced, true]);
                }
                // So no second of the story ever holds more than three, which
                // is WCAG 2.3.1's line ("no more than three flashes in any one
                // second period"). Three can fit: 0, 0.34 and 0.68.
                for (const f of flashes) {
                    expect(flashes.filter((g) => g >= f && g < f + 1).length).toBeLessThanOrEqual(3);
                }
            }
        }
    });
});

describe('when and where it strikes', () => {
    test('none before the storm has organized, and none once the rainbow is coming', () => {
        const quiet = LS.storm.lightning.rate;
        const firstRate = quiet.find((k) => k.value > 0).at;
        const lastRate = quiet[quiet.length - 1].at;
        expect(lastRate).toBeLessThanOrEqual(C.rainbow.amount[0][0]);
        for (const seed of [3, 11, 19, 23, 31, 37]) {
            const { starts } = runStory(seed);
            for (const at of starts) {
                expect([seed, at > quiet[1].at - 1e-9 && at <= lastRate]).toEqual([seed, true]);
            }
        }
        expect(firstRate).toBeGreaterThan(quiet[0].at);
    });

    test('the storm does strike, and most flashes show a channel', () => {
        let strikes = 0;
        let bolts = 0;
        for (const seed of [5, 6, 8, 9]) {
            const scene = new THREE.Scene();
            const sky = { uniforms: { uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3() } } };
            L.initLightning(scene, null, LS, { random: seeded(seed), sky });
            let last = null;
            for (let t = 0; t <= C.story.seconds; t += 1 / 60) {
                L.updateLightning(t, LS);
                const s = L.__lightning.state().strike;
                if (s && s !== last) {
                    strikes += 1;
                    if (s.drawBolt) bolts += 1;
                }
                last = s;
            }
            L.disposeLightning();
        }
        expect(strikes / 4).toBeGreaterThan(3);
        expect(bolts / strikes).toBeGreaterThan(0.5);
    });

    test('BOLTS FALL FROM THIS STORM\'S BASE AND LAND BEHIND THE TORNADO', () => {
        const S = LS.storm.lightning;
        expect(S.bolt.baseHeightMetres).toBe(C.storm.baseHeight);
        expect(S.nearMetres).toBeGreaterThan(C.storm.distance + 500);
        const ends = L.strikeEndpoints(0.1, S.nearMetres, LS);
        expect(ends.from[1]).toBe(C.storm.baseHeight);
        expect(ends.to[1]).toBe(0);
        // Channels are kept inside a landscape frame.
        const half = L.visibleHalfAngleDegrees(C.camera.fovDegrees, 16 / 9);
        expect(L.boltAzimuthLimit(16 / 9, LS)).toBeLessThanOrEqual(half);
        expect(L.boltAzimuthLimit(0.46, LS)).toBeLessThan(L.boltAzimuthLimit(16 / 9, LS));
        // And a strike's flash comes from above the horizon, toward the storm.
        const dir = L.strikeDirection(0, S.nearMetres, LS);
        expect(dir[1]).toBeGreaterThan(0);
        expect(dir[2]).toBeLessThan(0);
        expect(deg(Math.atan2(dir[1], -dir[2]))).toBeLessThan(C.camera.pitchDegrees + C.camera.fovDegrees / 2);
    });

    test('a channel never grows past its segment budget', () => {
        const small = { ...LS, storm: { ...LS.storm, lightning: {
            ...LS.storm.lightning, bolt: { ...LS.storm.lightning.bolt, maxSegments: 24, branchChance: 1 }
        } } };
        const { segments, truncated } = L.generateBolt([0, 900, -3000], [0, 0, -3000], seeded(4), small);
        expect(truncated).toBe(true);
        expect(segments.length).toBe(24);
    });
});

describe('a strike lights the storm', () => {
    test('THE QA HOOK: a forced strike at a distance draws a channel, flashes, and fades', () => {
        const { levels, state } = runStory(13, { forceEvery: 6, distance: 3000 });
        const peak = Math.max(...levels.map(([, , sky]) => sky));
        expect(peak).toBeGreaterThan(0.3);
        // It goes out again: the last frames of the story are dark.
        expect(levels[levels.length - 1][2]).toBe(0);
        expect(state.boltGeometry).toBeTruthy();
    });

    test('one set of flash uniforms reaches the sky, the storm base and the wall cloud', () => {
        const scene = new THREE.Scene();
        world.initWorld(scene, C);
        const flash = world.flashUniforms();
        expect(flash.uFlash.value).toBe(0);
        const wall = scene.getObjectByName('wall-cloud');
        expect(wall.material.uniforms.uFlash).toBe(flash.uFlash);
        const shared = scene.children.filter((o) => o.material && o.material.uniforms
            && o.material.uniforms.uFlash === flash.uFlash);
        expect(shared.length).toBe(3);
        for (const o of shared) expect(o.material.fragmentShader).toContain('flashToward(');
    });

    test('the page holds the lightning through a drag and after a seek', () => {
        // The pairing High Water's page has: a scrub runs the story clock far
        // faster than real time and the cap is in story seconds.
        const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');
        expect(main).toMatch(/if \(player && player\.flashAllowed\(\)\) updateLightning\(/);
        expect(main).toMatch(/onSeek: \(\) => resetLightning\(\)/);
        expect(main).toMatch(/onScrubStart: \(\) => resetLightning\(\)/);
        expect(main).toMatch(/onRewind: \(\) => resetLightning\(\)/);
        // And the welcome card's promise is now kept.
        const page = readFileSync(join(process.cwd(), 'www/tornado/index.html'), 'utf8');
        expect(page).toMatch(/There is lightning/);
    });
});
