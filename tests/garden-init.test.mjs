// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for Fractal Garden, plus the two pieces of arithmetic
 * that M0 puts in place and every later milestone depends on: the composed
 * camera framing and the adaptive pixel-ratio policy.
 *
 * Under Node, importing main.js is side-effect-free unless a `document`
 * exists, so the boot suite installs the browser stand-ins from dom-stub.mjs
 * FIRST and then imports: the module auto-boots exactly the way a real page
 * load does, and renderer.setAnimationLoop lands in dom.loops so frames can be
 * stepped by hand.
 *
 * THE TEST THAT MATTERS MOST HERE IS THE HIDDEN-TAB ONE. This is the first
 * scene on the site whose state is a function of elapsed time, so a delta that
 * leaks through while nobody is watching does not drop a frame, it ages the
 * garden. That property is asserted directly rather than inferred from the
 * code, and it fails if the `state.lastTime = 0` line in start() is removed.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
});

async function bootGarden() {
    const main = await import('../www/garden/js/main.js');
    await flushAsync();                        // let the async init() settle
    await jest.advanceTimersByTimeAsync(500);  // the 400ms loading-screen reveal
    return main;
}

/** Step the most recently registered animation loop n times, advancing the
 *  clock by ms between frames. */
function stepFrames(n, ms = 16) {
    const loop = dom.loops[dom.loops.length - 1];
    for (let i = 0; i < n; i++) {
        jest.advanceTimersByTime(ms);
        loop();
    }
}

// ---- Boot ------------------------------------------------------------------

test('auto-boots through the loading screen into a running loop', async () => {
    const main = await bootGarden();

    const state = main.getState();
    expect(state.running).toBe(true);
    expect(state.loaded).toBe(true);
    expect(state.mobile).toBe(false);

    // The loading screen was walked to 100% and then hidden.
    expect(dom.el('load-progress').style.width).toBe('100%');
    expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);

    // The Home button was wired from config rather than left to the markup.
    expect(dom.el('home-btn').href).toBe('/');

    // .ui-float elements are display:none until JavaScript says otherwise, so
    // "the markup is correct" is not the same as "the button is on screen".
    expect(dom.el('season-chip').classList.contains('visible')).toBe(true);

    // No 2D fallback redirect happened.
    expect(dom.replaced).toHaveLength(0);

    // The loop runs without throwing.
    expect(dom.loops.length).toBeGreaterThanOrEqual(1);
    stepFrames(120);
});

test('survives resize, welcome dismissal, and page hide', async () => {
    const main = await bootGarden();

    // Rotate to portrait: the resize path re-derives the composed viewpoint.
    dom.windowStub.innerWidth = 390;
    dom.windowStub.innerHeight = 844;
    fire(dom.windowStub, 'resize');
    stepFrames(5);

    // The welcome overlay steps aside on a click.
    fire(dom.el('blocker'), 'click');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);

    // Tearing the page down stops the loop and aborts the listeners.
    fire(dom.windowStub, 'pagehide');
    expect(main.getState().running).toBe(false);
});

// ---- The clock -------------------------------------------------------------

test('the first frame of a session contributes no time at all', async () => {
    const main = await bootGarden();
    const { startSeconds } = await import('../www/garden/js/clock.js');

    // lastTime starts at 0, so the opening frame has no previous timestamp to
    // measure against and must contribute nothing rather than measure from the
    // epoch. Deterministic regardless of how the timer mock reports the clock.
    // A fresh garden opens at the start hour, so "no time has passed" means
    // still sitting exactly there.
    stepFrames(1);
    expect(main.getState().elapsedSeconds).toBe(startSeconds());
});

test('a hidden tab does not age the garden', async () => {
    const main = await bootGarden();

    stepFrames(30);
    const before = main.getState().elapsedSeconds;

    // Away for a simulated minute.
    dom.documentStub.hidden = true;
    dom.documentStub.visibilityState = 'hidden';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(false);

    jest.advanceTimersByTime(60000);

    dom.documentStub.hidden = false;
    dom.documentStub.visibilityState = 'visible';
    fire(dom.documentStub, 'visibilitychange');
    expect(main.getState().running).toBe(true);

    // The first frame back reports a delta of zero, so the minute away never
    // reaches the garden. Without the `lastTime = 0` line in start() this frame
    // would add sixty seconds, which at 240 seconds to the year is a whole
    // season passing in a pocket.
    stepFrames(1);
    expect(main.getState().elapsedSeconds).toBe(before);
});

test('no single frame can advance the clock past the cap', async () => {
    const main = await bootGarden();
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const cap = GARDEN_CONFIG.clock.maxFrameSeconds;

    // Measured as a DELTA, because a fresh garden no longer starts at zero.
    const before = main.getState().elapsedSeconds;
    // Ten frames, each separated by a stall far longer than the cap.
    stepFrames(10, 5000);
    expect(main.getState().elapsedSeconds - before).toBeLessThanOrEqual(cap * 10);
});

test('a new garden opens at sunrise in spring, not at midnight in winter', async () => {
    const main = await bootGarden();
    stepFrames(10);
    // Hour zero is the deep of winter, under snow, with the watering window
    // shut. A garden should not be handed over in the dark.
    const clock = main.getClock();
    expect(clock.hour).toBeCloseTo(6, 1);
    expect(clock.season).toBe('spring');
    expect(clock.snowCoverage).toBe(0);
    // The chip carries the weather too, which changes, so only the part this
    // test is about is pinned. Year one: a garden in its first year is in year
    // one to everybody except a programmer.
    expect(dom.el('season-chip').textContent).toMatch(/^Spring, year 1/);
});

test('the chip counts years from one', async () => {
    const { chipText } = await import('../www/garden/js/ui.js');
    expect(chipText(0, 0)).toBe('Winter, year 1');
    expect(chipText(0, 12)).toBe('Summer, year 1');
    expect(chipText(3.4, 6)).toBe('Spring, year 4');
    expect(chipText(9.99, 18)).toBe('Autumn, year 10');
});

// ---- The whole loop --------------------------------------------------------

test('the garden can be planted, watered, saved, and cleared', async () => {
    const main = await bootGarden();
    // THE BUILT MODULES, because main.js resolves its imports to the .min
    // files and module state must be shared with what is driven here. This is
    // why `npm run build` has to run before `npm test`.
    const ui = await import('../www/garden/js/ui.min.js');
    const garden = await import('../www/garden/js/garden.min.js');

    stepFrames(120);

    // THE STUB DOES NOT PARSE THE MARKUP, so its elements start with an empty
    // classList and every isOpen() check would be vacuously true. Mirroring
    // the page's initial state is what makes the assertions below mean
    // anything. (That the markup really does carry it is checked separately,
    // in tests/garden-ui.test.mjs.)
    dom.el('plant-modal').classList.add('hidden');
    dom.el('tree-card').classList.add('hidden');

    // THE GARDEN COMES FIRST. Dismissing the welcome card is a request to look
    // at the place, so nothing may cover it. An earlier version opened the
    // plant modal here automatically, which also forced it to invent a
    // planting spot and quietly broke the rule that a tree goes where you
    // tapped.
    fire(dom.el('blocker'), 'click');
    expect(ui.isPlantOpen()).toBe(false);
    expect(ui.isCardOpen()).toBe(false);

    // Opening it the way a tap would, then planting. Under the stub a raycast
    // finds nothing, so the modal is opened directly and the plant falls back
    // to the middle of the plot.
    ui.openPlantModal({ full: false });
    expect(ui.isPlantOpen()).toBe(true);
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(30);
    expect(garden.getTrees()).toHaveLength(1);

    const entry = garden.getTrees()[0];
    expect(entry.record.growth).toBeGreaterThan(0);

    // A neglected tree, watered: the bud reward has to arrive in any season,
    // and the opening hour here is the middle of winter.
    entry.record.moisture = 0;
    entry.record.health = 0.2;
    ui.openTreeCard(entry, 3);
    fire(dom.el('tree-water'), 'click');
    stepFrames(10);
    expect(entry.record.moisture).toBeGreaterThan(0.9);
    expect(entry.record.budActive).toBe(true);
    stepFrames(120);
    expect(entry.record.bud).toBeGreaterThan(0.5);

    // It saved itself, and the file is the shape hydrate expects.
    const saved = JSON.parse(dom.windowStub.localStorage
        ? dom.windowStub.localStorage.getItem('scenexp-garden-v1')
        : globalThis.localStorage.getItem('scenexp-garden-v1'));
    expect(saved.v).toBe(1);
    expect(saved.trees).toHaveLength(1);
    expect(saved.trees[0].species).toBe(entry.record.species);

    // A long run through several in-world years must not throw.
    stepFrames(3000);
    expect(main.getState().running).toBe(true);

    fire(dom.el('tree-remove'), 'click');
    expect(garden.getTrees()).toHaveLength(0);
});

test('deleting the saved garden by hand actually deletes it', async () => {
    // THE EXACT SEQUENCE FROM QA. Clearing the key and reloading used to do
    // nothing, because a reload fires visibilitychange and then pagehide, both
    // of which save. The outgoing page wrote the old garden straight back
    // before the incoming one could look, so the delete was real and then
    // silently undone by the act of reloading.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const garden = await import('../www/garden/js/garden.min.js');
    const KEY = 'scenexp-garden-v1';

    stepFrames(120);
    // Something is on disk to begin with. Planting saves on the spot.
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(10);
    expect(globalThis.localStorage.getItem(KEY)).toBeTruthy();

    // The visitor opens devtools and removes it.
    globalThis.localStorage.removeItem(KEY);

    // Then reloads. Both lifecycle handlers fire on the way out.
    dom.documentStub.hidden = true;
    dom.documentStub.visibilityState = 'hidden';
    fire(dom.documentStub, 'visibilitychange');
    fire(dom.windowStub, 'pagehide');

    // Nothing was written back.
    expect(globalThis.localStorage.getItem(KEY)).toBeNull();
    expect(main.getState().running).toBe(false);
    // The tree is still in this session; what matters is that nothing was
    // written back for the NEXT one to find.
    expect(garden.getTrees()).toHaveLength(1);
});

test('a fresh garden starts at the start hour, and saving still works from nothing', async () => {
    // The other half: a first visit has no key either, and must still save.
    // A guard that cannot tell "never existed" from "just deleted" would break
    // every first visit on the site.
    expect(globalThis.localStorage.getItem('scenexp-garden-v1')).toBeNull();
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const garden = await import('../www/garden/js/garden.min.js');

    const { startSeconds } = await import('../www/garden/js/clock.js');
    expect(main.getState().elapsedSeconds).toBe(startSeconds());
    expect(main.getClock().season).toBe('spring');
    expect(garden.getTrees()).toHaveLength(0);

    stepFrames(30);
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(10);

    const saved = JSON.parse(globalThis.localStorage.getItem('scenexp-garden-v1'));
    expect(saved.trees).toHaveLength(1);
});

test('a tree planted on the plot stands on the ground, not through it', async () => {
    await bootGarden();
    const garden = await import('../www/garden/js/garden.min.js');
    const terrain = await import('../www/garden/js/terrain.min.js');
    stepFrames(60);
    fire(dom.el('blocker'), 'click');
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(10);

    const record = garden.getTrees()[0].record;
    expect(terrain.cellInPlot(record.gx, record.gz)).toBe(true);
    // The same height function that displaced the mesh is what sits the trunk
    // on it, so there is no second copy to drift out of agreement.
    const { x, z } = terrain.cellCenter(record.gx, record.gz);
    expect(Number.isFinite(terrain.heightAt(x, z))).toBe(true);
});

// ---- Camera framing --------------------------------------------------------

test('landscape uses the composed viewpoint unchanged', async () => {
    const { framingFor } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const cam = GARDEN_CONFIG.camera;

    const wide = framingFor(1280 / 800, cam);
    expect(wide.fov).toBe(cam.fov);
    expect(wide.z).toBe(cam.position.z);
});

test('portrait widens the frame and only ever dollies back', async () => {
    const { framingFor } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const cam = GARDEN_CONFIG.camera;

    const tall = framingFor(390 / 844, cam);
    expect(tall.fov).toBe(cam.portrait.fov);
    expect(tall.z).toBeGreaterThan(cam.position.z);

    // The whole point of the dolly: minHalfWidth metres either side of centre
    // are actually in frame at focusZ afterwards.
    const aspect = 390 / 844;
    const halfV = (tall.fov / 2) * Math.PI / 180;
    const halfWidthAtFocus = Math.tan(halfV) * aspect * (tall.z - cam.portrait.focusZ);
    expect(halfWidthAtFocus).toBeGreaterThanOrEqual(cam.portrait.minHalfWidth - 1e-6);

    // A narrower phone needs to sit further back still, never closer.
    const narrower = framingFor(320 / 900, cam);
    expect(narrower.z).toBeGreaterThan(tall.z);
});

test('the tallest species fits the composed landscape frame', async () => {
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const cam = GARDEN_CONFIG.camera;
    const plot = GARDEN_CONFIG.plot;

    // THIS IS THE TEST THAT KEEPS THE SPECIES TABLE AND THE CAMERA HONEST.
    // The angle between the view axis and the top of the tallest tree standing
    // at the middle of the plot must sit inside the vertical half-fov, or every
    // large tree is cropped and nobody notices until a screenshot.
    const eye = cam.position;
    const view = normalize(cam.lookAt.x - eye.x, cam.lookAt.y - eye.y, cam.lookAt.z - eye.z);
    const toTop = normalize(0 - eye.x, plot.maxTreeHeight - eye.y, 0 - eye.z);

    const offAxisDeg = Math.acos(dot(view, toTop)) * 180 / Math.PI;
    const halfFovDeg = cam.fov / 2;

    expect(offAxisDeg).toBeLessThan(halfFovDeg);

    // And the whole depth of the plot is in frame, so the near rows are not
    // cut off by the bottom edge. The camera looks toward -z, so the nearest
    // ground the frame reaches is at eye.z minus the reach, and that point has
    // to sit in FRONT of the plot's near edge for the plot to be complete.
    const pitchDeg = Math.asin(-view[1]) * 180 / Math.PI;
    const lowerEdgeDeg = pitchDeg + halfFovDeg;
    const groundReach = eye.y / Math.tan(lowerEdgeDeg * Math.PI / 180);
    const nearestVisibleZ = eye.z - groundReach;
    expect(nearestVisibleZ).toBeGreaterThanOrEqual(plot.halfSize);
});

function normalize(x, y, z) {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ---- Quality policy --------------------------------------------------------

test('the pixel-ratio policy ignores the opening frames', async () => {
    const { nextPixelScale } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const q = GARDEN_CONFIG.quality;

    // Shader compilation and the first attribute upload both land in the
    // opening frames and neither says anything about the device.
    const early = { frame: 1, best: 0.001, scale: 1, since: 99, frames: q.settleFrames - 1 };
    expect(nextPixelScale(early, GARDEN_CONFIG)).toBe(1);
});

test('a slow device steps down, but never below the floor', async () => {
    const { nextPixelScale } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const q = GARDEN_CONFIG.quality;

    // Measured against the best frame this device has managed, not against 60.
    const slow = { frame: 0.030, best: 0.0167, scale: 1, since: 99, frames: 600 };
    expect(nextPixelScale(slow, GARDEN_CONFIG)).toBeCloseTo(q.stepDown, 5);

    // Still slow, and already at the floor: it stays there rather than
    // disappearing down a geometric series.
    const floored = { frame: 0.030, best: 0.0167, scale: q.minScale, since: 99, frames: 600 };
    expect(nextPixelScale(floored, GARDEN_CONFIG)).toBe(q.minScale);

    // A change of ratio reallocates the drawing buffer, which is itself a
    // dropped frame, so it cannot happen every frame.
    const tooSoon = { frame: 0.030, best: 0.0167, scale: 1, since: 0, frames: 600 };
    expect(nextPixelScale(tooSoon, GARDEN_CONFIG)).toBe(1);
});

test('a 30 Hz panel is not called slow just for being 30 Hz', async () => {
    const { nextPixelScale } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');

    // A steady 33.3 ms panel holding its own refresh interval. A fixed
    // millisecond budget would condemn it; measuring against its own best
    // frame does not. (slowSeconds, the absolute backstop, is 40 ms.)
    const steady30 = { frame: 0.0333, best: 0.0333, scale: 1, since: 99, frames: 600 };
    expect(nextPixelScale(steady30, GARDEN_CONFIG)).toBe(1);
});

test('a recovered device reaches back up, slowly', async () => {
    const { nextPixelScale } = await import('../www/garden/js/main.js');
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    const q = GARDEN_CONFIG.quality;

    const recovered = { frame: 0.0167, best: 0.0167, scale: 0.7, since: 99, frames: 600 };
    const next = nextPixelScale(recovered, GARDEN_CONFIG);
    expect(next).toBeGreaterThan(0.7);
    expect(next).toBeCloseTo(0.7 * q.stepUp, 5);

    // It reaches up more cautiously than it backs off: getting it wrong
    // downward costs a little sharpness, getting it wrong upward costs the
    // frame rate while somebody is planting.
    expect(q.stepUp - 1).toBeLessThan(1 - q.stepDown);

    // And it never overshoots the device's own ratio.
    const nearlyThere = { frame: 0.0167, best: 0.0167, scale: 0.99, since: 99, frames: 600 };
    expect(nextPixelScale(nearlyThere, GARDEN_CONFIG)).toBe(1);
});
