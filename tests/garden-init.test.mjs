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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Dismiss the welcome card. THE CALENDAR DOES NOT RUN UNTIL THIS HAPPENS, so
 *  every test that measures elapsed time has to begin here or it is measuring
 *  a clock that was never going to move. */
function beginTending() {
    fire(dom.el('blocker'), 'click');
    expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
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
    beginTending();
    stepFrames(1);
    expect(main.getState().elapsedSeconds).toBe(startSeconds());
});

test('a hidden tab does not age the garden', async () => {
    const main = await bootGarden();
    beginTending();

    const opening = main.getState().elapsedSeconds;
    stepFrames(30);
    const before = main.getState().elapsedSeconds;
    // The clock really is running, or everything below passes by measuring
    // something that was standing still anyway.
    expect(before).toBeGreaterThan(opening);

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
    beginTending();

    // Measured as a DELTA, because a fresh garden no longer starts at zero.
    const before = main.getState().elapsedSeconds;
    // Ten frames, each separated by a stall far longer than the cap.
    stepFrames(10, 5000);
    const moved = main.getState().elapsedSeconds - before;
    expect(moved).toBeLessThanOrEqual(cap * 10);
    // And it moved at all, or the cap is being checked against a still clock.
    expect(moved).toBeGreaterThan(0);
});

test('a new garden opens at sunrise in spring, not at midnight in winter', async () => {
    const main = await bootGarden();
    beginTending();
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

test('THE YEAR DOES NOT PASS WHILE THE WELCOME CARD IS UP', async () => {
    // A visitor reading what the place is should not come back to find a
    // season gone. The calendar waits for them to begin.
    const main = await bootGarden();
    const opening = main.getState().elapsedSeconds;

    stepFrames(240);                       // four seconds of frames
    expect(main.getState().elapsedSeconds).toBe(opening);
    expect(dom.el('season-chip').textContent).toMatch(/^Spring, year 1/);

    // And it starts the moment they do.
    beginTending();
    stepFrames(60);
    expect(main.getState().elapsedSeconds).toBeGreaterThan(opening);
});

test('THE WEATHER HOLDS BEHIND THE WELCOME CARD TOO', async () => {
    // The opening frame is a clear spring morning and it is the first thing
    // anybody sees. It should be that every time, not whatever the state
    // machine rolled while they were reading the card.
    const main = await bootGarden();
    const opening = main.getWeather();
    expect(opening.state).toBe('sunny');

    stepFrames(240);
    const held = main.getWeather();
    // `held` is what accumulates toward the next draw, so a state machine that
    // is running shows it even before the state itself changes.
    expect(held.held).toBe(0);
    expect(held.state).toBe('sunny');
    expect(held.transition).toBe(1);
    expect(held.rain).toBe(0);
    expect(held.gloom).toBe(0);
    expect(dom.el('season-chip').textContent).toBe('Spring, year 1 · clear');

    // The wind still blows, though, or the trees have nothing to sway in.
    expect(Math.hypot(held.wind.x, held.wind.z)).toBeGreaterThan(0);

    // And the machine starts the moment the visitor does.
    beginTending();
    stepFrames(60);
    expect(main.getWeather().held).toBeGreaterThan(0);
});

test('BUT THE SCENE IS NOT A PHOTOGRAPH while it waits', async () => {
    // Freezing everything would not pause the garden, it would photograph it,
    // and a photograph of rain is streaks hanging motionless in the air. The
    // animation clock runs from the first frame so the trees sway and the
    // weather falls behind the card, while the calendar holds.
    const main = await bootGarden();
    const state = main.getState();
    expect(state.sceneSeconds).toBeDefined();

    const before = main.getState().sceneSeconds;
    stepFrames(120);
    const after = main.getState();
    expect(after.sceneSeconds).toBeGreaterThan(before);
    // The two clocks are genuinely separate: one moved and one did not.
    expect(after.elapsedSeconds).toBe(state.elapsedSeconds);
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
    // AND THE CARD STAYS OPEN (M19-1, reversing M12-1). It used to close, and
    // the reasoning was sound while the card was four lines of text: the toast
    // confirmed it and the only readout of the result was out on the bed.
    // The droplet is the one-tap route now, so somebody who opened the card is
    // here to LOOK at the tree, and the card has its own gauge refreshed every
    // frame, so watering from here fills the bar in front of them. Closing
    // threw away the feedback the card had just gained.
    expect(ui.isCardOpen()).toBe(true);
    // And the gauge in it followed, which is the point of leaving it open.
    expect(dom.el('tree-thirst-fill').style.width).toMatch(/^9\d(\.\d+)?%|^100/);
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

    // Reopened, because watering closed it.
    ui.openTreeCard(entry, 3);
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

    // The tree really is in this session, which is what makes the save guard
    // interesting: there IS something worth writing and it must not be written.
    // Checked here rather than after the teardown below, because `pagehide`
    // disposes the whole scene, the garden included.
    expect(garden.getTrees()).toHaveLength(1);

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
});

test('A REFRESH DOES NOT LOSE THE GARDEN', async () => {
    // The bug this exists for lost every visitor their trees on every page
    // exit. `pagehide` carries two listeners and they fire in REGISTRATION
    // order: teardown first, then the save. Once teardown learned to dispose
    // the garden it emptied the tree list, and the save that followed wrote
    // the empty result straight over what had been planted.
    //
    // Nothing caught it because every existing test either checked the save
    // path or the teardown path, never the two in the order the browser runs
    // them.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const KEY = 'scenexp-garden-v1';

    stepFrames(60);
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(10);

    const planted = JSON.parse(globalThis.localStorage.getItem(KEY));
    expect(planted.trees).toHaveLength(1);

    // Now leave the page, exactly as a refresh does.
    dom.documentStub.hidden = true;
    dom.documentStub.visibilityState = 'hidden';
    fire(dom.documentStub, 'visibilitychange');
    fire(dom.windowStub, 'pagehide');
    expect(main.getState().running).toBe(false);

    // The tree is STILL THERE for the next visit.
    const after = JSON.parse(globalThis.localStorage.getItem(KEY));
    expect(after.trees).toHaveLength(1);
    expect(after.trees[0].species).toBe(planted.trees[0].species);

    // And a late save cannot undo that: after teardown there is nothing left
    // to write except an empty garden.
    main.__test__.save?.();
    expect(JSON.parse(globalThis.localStorage.getItem(KEY)).trees).toHaveLength(1);
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

// ---- The view controls (M9-5, M9-7) ----------------------------------------
//
// The shared pan part builds one row of four in a fixed order and offers no
// seam for a fifth button, so view.js reparents its zoom pair out to a corner
// and drops the missing tilt pair into the gap. These assert the DOM that
// comes out, because that layout is the whole deliverable and it is exactly
// the kind of thing that silently stops happening when a shared part changes.

let GARDEN_CONFIG;
beforeEach(async () => {
    ({ GARDEN_CONFIG } = await import('../www/garden/js/config.js'));
});

function lookRow() {
    return globalThis.document.querySelector('.pan-controls');
}

function zoomStack() {
    return globalThis.document.querySelector('.garden-zoom');
}

function labels(el) {
    return (el ? el.children : []).map((c) => c.getAttribute('aria-label'));
}

test('the look controls end up in one row, in reading order', async () => {
    await bootGarden();
    expect(labels(lookRow())).toEqual(['Pan left', 'Look up', 'Look down', 'Pan right']);
});

test('the zoom pair lives in its own corner, plus on top', async () => {
    // Plus on top is the map idiom and also the honest one: up moves the eye
    // closer, the same way the tilt pair above it does. The shared part builds
    // the row the other way round for a horizontal layout, so this order is
    // `zoomContainerClass` doing its job.
    await bootGarden();
    const stack = zoomStack();
    expect(labels(stack)).toEqual(['Zoom in', 'Zoom out']);

    // They are the SHARED PART's buttons, carrying its hold listeners, which
    // is what keeps the pinch and the arrow keys working. Building a private
    // pair here instead would have taken the pinch with it, since
    // applyGesturePinch returns early when neither zoom button exists.
    for (const btn of stack.children) {
        expect(btn.listeners.has('pointerdown')).toBe(true);
        expect(btn.parentNode).toBe(stack);
    }
    // And it is a .ui-float, so main.js's reveal sweep finds it and the two
    // groups appear together rather than one of them staying invisible.
    expect(stack.classList.contains('ui-float')).toBe(true);
    expect(stack.classList.contains('visible')).toBe(true);
});

test('holding a tilt button tilts, and stops at the limit', async () => {
    await bootGarden();
    // THE BUILT MODULE, because main.js resolves its imports to the .min files
    // and the tilt lives in the shared part's own state.
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');
    const maxTilt = GARDEN_CONFIG.camera.portrait.pan.maxTilt;
    const [, up, down] = lookRow().children;

    expect(pan.getTiltAngle()).toBe(0);
    fire(up, 'pointerdown', { pointerId: 1 });
    expect(up.classList.contains('held')).toBe(true);
    stepFrames(20);
    expect(pan.getTiltAngle()).toBeGreaterThan(0);

    // It runs out rather than running away, and says so.
    stepFrames(200);
    expect(pan.getTiltAngle()).toBeCloseTo(maxTilt, 6);
    expect(up.classList.contains('at-limit')).toBe(true);

    // Releasing stops it, and the other direction comes back down.
    fire(up, 'pointerup', { pointerId: 1 });
    expect(up.classList.contains('held')).toBe(false);
    fire(down, 'pointerdown', { pointerId: 2 });
    stepFrames(30);
    expect(pan.getTiltAngle()).toBeLessThan(maxTilt);
    fire(down, 'pointerup', { pointerId: 2 });
});

test('W AND S LIGHT THE SAME BUTTONS THEY MOVE', async () => {
    // The symptom that sent tilt back to the shared part: A and D lit the pan
    // arrows because the part owned both, while W and S moved the view without
    // lighting anything, because the buttons were the garden's and the keys
    // were the part's. Two controls for one axis, and the highlight was the
    // tell. There is one axis now.
    await bootGarden();
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');
    const [left, up, down, right] = lookRow().children;

    for (const [code, btn, others] of [
        ['KeyW', up, [down, left, right]],
        ['KeyS', down, [up, left, right]],
        ['KeyA', left, [up, down, right]],
        ['KeyD', right, [up, down, left]]
    ]) {
        fire(dom.windowStub, 'keydown', { code, shiftKey: false, repeat: false });
        expect(btn.classList.contains('held')).toBe(true);
        for (const other of others) expect(other.classList.contains('held')).toBe(false);
        fire(dom.windowStub, 'keyup', { code });
        expect(btn.classList.contains('held')).toBe(false);
    }

    // And Shift with the arrows reaches the same pair, which is the path an
    // arrow-key visitor has.
    fire(dom.windowStub, 'keydown', { code: 'ArrowUp', shiftKey: true, repeat: false });
    expect(up.classList.contains('held')).toBe(true);
    stepFrames(10);
    expect(pan.getTiltAngle()).toBeGreaterThan(0);
    fire(dom.windowStub, 'keyup', { code: 'ArrowUp' });
    expect(up.classList.contains('held')).toBe(false);
});

test('a tilt button that loses focus stops tilting', async () => {
    // A control that keeps running after the page has taken focus elsewhere is
    // a stuck camera, and the visitor has no way to unstick it.
    await bootGarden();
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');
    const up = lookRow().children[1];
    fire(up, 'pointerdown', { pointerId: 1 });
    stepFrames(5);
    fire(up, 'blur');
    const held = pan.getTiltAngle();
    stepFrames(30);
    expect(pan.getTiltAngle()).toBeCloseTo(held, 9);
});

test('THE ZOOM IS A DOLLY: holding it moves the camera, not the lens', async () => {
    const main = await bootGarden();
    // Plus first: the stack reads top to bottom, in on top.
    const [zoomIn, zoomOut] = zoomStack().children;

    // The FOV is never touched, and that claim is checked in the SOURCE rather
    // than on the camera: under the THREE stub `camera.fov` is a proxy and
    // every read of it is a different object, so nothing about it can be
    // compared. Passing `zoomDelegate` is what makes the shared part bypass
    // its whole FOV path, and it is the one line that decides it.
    const mainSrc = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    expect(mainSrc).toMatch(/zoomDelegate:\s*\{/);
    const panSrc = readFileSync(join(process.cwd(), 'www', 'shared', 'js', 'pan-1.0.0.js'), 'utf8');
    // The delegate branch returns before `_fovOffset` is ever written.
    expect(panSrc).toMatch(/if \(_zoomDelegate\) \{[\s\S]{0,240}?onDelta/);

    fire(zoomIn, 'pointerdown', { pointerId: 1 });
    stepFrames(120);
    // The near end of the track is reached and reported.
    expect(zoomIn.classList.contains('at-limit')).toBe(true);
    fire(zoomIn, 'pointerup', { pointerId: 1 });

    // The aim moves with the eye, so the two ends are different views rather
    // than the same view at two magnifications.
    const near = { ...main.__test__.viewTarget() };
    fire(zoomOut, 'pointerdown', { pointerId: 2 });
    stepFrames(240);
    expect(zoomOut.classList.contains('at-limit')).toBe(true);
    expect(main.__test__.viewTarget().z).not.toBeCloseTo(near.z, 3);
    fire(zoomOut, 'pointerup', { pointerId: 2 });
});

test('the shared part is handed the aim the dolly moves, not the frozen config', async () => {
    // THIS IS A TEXT ASSERTION ON PURPOSE, and the first version of it was a
    // behavioural one that passed with the bug deliberately reintroduced.
    //
    // The hazard is real: the part composes its yaw and tilt from
    // `_lookAt - camera.position`, so handing it the frozen config would throw
    // away the dolly's aim the moment anybody pans. But it only reads the aim
    // when one of ITS offsets is engaged, and under the stub the argument it
    // then passes to camera.lookAt is a proxy holding no numbers. So there is
    // nothing to observe from here, and the honest check is the line that
    // decides it plus the line in the part that depends on it.
    const main = await bootGarden();
    const src = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const call = src.match(/initPortraitControls\(\{[\s\S]*?\n {4}\}\)/);
    expect(call).not.toBeNull();
    expect(call[0]).toMatch(/lookAt:\s*viewTarget\b/);
    expect(call[0]).not.toMatch(/lookAt:\s*GARDEN_CONFIG/);

    // And the part re-reads that object every frame, which is the only reason
    // handing over a mutable one works at all. If this line ever changes to
    // copy the aim at init, the garden's dolly stops reaching the part and
    // nothing here or anywhere else would say so.
    const pan = readFileSync(join(process.cwd(), 'www', 'shared', 'js', 'pan-1.0.0.js'), 'utf8');
    expect(pan).toMatch(/_dirVec\.set\(_lookAt\.x, _lookAt\.y, _lookAt\.z\)/);

    // The object main mutates is the one it built, and it is not the frozen
    // config's, so writing to it can never mutate the config.
    expect(main.__test__.viewTarget()).not.toBe(GARDEN_CONFIG.camera.lookAt);
});

// ---- The QA probe ----------------------------------------------------------

test('the debug probe is OFF unless it is asked for', async () => {
    // It is a diagnostic, not a feature. A visitor who never types ?debug must
    // never get a global, and the production page must not carry one.
    await bootGarden();
    expect(globalThis.window.__garden).toBeUndefined();
});

test('?debug=1 answers the question the harness cannot', async () => {
    dom.windowStub.location.search = '?debug=1';
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    beginTending();

    const probe = globalThis.window.__garden;
    expect(probe).toBeDefined();
    expect(probe.counts().trees).toBe(0);

    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(5);

    const counts = probe.counts();
    expect(counts.trees).toBe(1);
    // `beds`, `levels` and `capacity` come off an InstancedMesh, which under
    // the shared stub is a proxy holding no numbers, so all this can say here
    // is that the probe REACHES them. Their values are asserted against real
    // instanced meshes in garden-scene.test.mjs, which is the only place they
    // are numbers at all.
    expect(counts).toHaveProperty('beds');
    expect(counts).toHaveProperty('levels');
    expect(counts).toHaveProperty('capacity');

    // And it names the tree, so a row on screen can be matched to a record.
    const bases = probe.bases();
    expect(bases).toHaveLength(1);
    expect(bases[0]).toHaveProperty('gx');
    expect(bases[0]).toHaveProperty('species');
});

// ---- Somebody arriving with no idea what to do (M15) -----------------------

/**
 * WHAT A NEWCOMER ACTUALLY FACES.
 *
 * Everything this scene explains about itself is on the welcome card, and the
 * card was dismissible with no way back. A visitor who clicked through it
 * before reading, which is what people do with a splash screen, was left in a
 * field with no idea that the field was the thing to touch.
 */
/**
 * Put the classes on the modals that the SHIPPED MARKUP has.
 *
 * The DOM stub invents an element for any id asked of it, with an EMPTY
 * classList, and never reads index.html. So `!classList.contains('hidden')` is
 * true by default and every modal reads as OPEN, which makes `anyModalOpen()`
 * true and silently suppresses anything guarded by it. That is the same trap
 * recorded against this harness before: an assertion that depends on state the
 * stub invents is testing the stub.
 */
function asShipped() {
    for (const id of ['plant-modal', 'tree-card', 'reset-modal']) {
        dom.el(id).classList.add('hidden');
    }
}

describe('the first visit', () => {
    test('THE INSTRUCTIONS CAN BE REACHED AGAIN', async () => {
        await bootGarden();
        beginTending();
        const blocker = dom.el('blocker');

        fire(dom.el('help-btn'), 'click');
        expect(blocker.classList.contains('hidden')).toBe(false);
        // And it is the SAME CARD, so its text cannot drift from a second copy.
        // The prompt is the one thing that changes: "begin" is the wrong word
        // for somebody who already has a garden behind it.
        expect(dom.el('begin-prompt').textContent).toMatch(/return to your garden/i);

        // Escape closes it, because it is a panel now and that is what closes a
        // panel. Enter and Space still work, as they always did.
        fire(document, 'keydown', { code: 'Escape' });
        expect(blocker.classList.contains('hidden')).toBe(true);
    });

    test('NOTHING IN THE CORNER IS OFFERED WHILE THE CARD IS UP', async () => {
        // `.menu-btn` is z-index 110 against the blocker's 100, so these draw
        // OVER the welcome card and sit in its tab order. Help there is a
        // button whose whole purpose is to summon the card already filling the
        // screen, and reset is a destructive one offered before the visitor has
        // seen the garden.
        await bootGarden();
        expect(dom.el('help-btn').hidden).toBe(true);
        expect(dom.el('reset-btn').hidden).toBe(true);

        // HOME STAYS, and that is not an oversight: it is the way off the page,
        // it works from the card, and it is the target of the "Skip to home
        // link" that opens the document. Hiding it would break the skip link
        // for exactly the visitors it exists for.
        expect(dom.el('home-btn').hidden).toBe(false);

        beginTending();
        expect(dom.el('help-btn').hidden).toBe(false);
        expect(dom.el('reset-btn').hidden).toBe(false);

        // And they go away again every time the card comes back, not just on
        // the first arrival.
        fire(dom.el('help-btn'), 'click');
        expect(dom.el('help-btn').hidden).toBe(true);
        expect(dom.el('reset-btn').hidden).toBe(true);
        fire(document, 'keydown', { code: 'Escape' });
        expect(dom.el('help-btn').hidden).toBe(false);
    });

    test('and the sheet actually hides them, which the stub cannot tell us', () => {
        // The DOM stub has no stylesheet, so setting `hidden` succeeds whether
        // or not a rule exists. `.ui-float.visible` sets `display: flex`, which
        // beats the attribute's UA default, so without this rule the buttons
        // would stay on screen and only leave the tab order.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        expect(css).toMatch(/\.menu-btn\[hidden\]\s*\{[^}]*display:\s*none/);
    });

    test('the garden does not age while the card is being read', async () => {
        const main = await bootGarden();
        beginTending();
        stepFrames(30, 50);
        const aged = main.__test__.state.elapsedSeconds;
        expect(aged).toBeGreaterThan(0);

        fire(dom.el('help-btn'), 'click');
        stepFrames(60, 50);
        // THE CALENDAR IS HELD BEHIND THE CARD, which is what makes the help
        // button safe to press: reading the rules must not cost a season.
        expect(main.__test__.state.elapsedSeconds).toBeCloseTo(aged, 6);

        fire(dom.el('blocker'), 'click');
        stepFrames(10, 50);
        expect(main.__test__.state.elapsedSeconds).toBeGreaterThan(aged);
    });

    test('AN EMPTY PLOT KEEPS ASKING, and stops the moment it is planted', async () => {
        // The first version was one toast, 2.2 s after the card went and gone
        // 4.2 s later. A visitor still looking at the mountains when it arrived
        // never saw it, and nothing on screen suggested the grass was the thing
        // to touch. That is exactly the visitor this is for.
        await bootGarden();
        asShipped();
        beginTending();
        const toastEl = dom.el('garden-toast');

        await jest.advanceTimersByTimeAsync(2500);
        const first = toastEl.textContent;
        expect(first).toMatch(/plant your first tree/i);

        // It asks again later, and NOT with the same sentence: a line repeated
        // word for word reads as a stuck screen rather than as a hint.
        await jest.advanceTimersByTimeAsync(15000);
        expect(toastEl.textContent).not.toBe(first);
        // And the second one names the clock, which is the fact a newcomer is
        // most missing. Nothing else on screen says a day is a year.
        expect(toastEl.textContent).toMatch(/year/i);

        // It gives up rather than nagging forever.
        await jest.advanceTimersByTimeAsync(15000);
        const third = toastEl.textContent;
        await jest.advanceTimersByTimeAsync(60000);
        expect(toastEl.textContent).toBe(third);
    });

    test('and the welcome card itself says what a year is', async () => {
        // The toasts are the backstop. The card is where somebody who reads
        // gets it, and it had no line about the clock at all: the season chip
        // reads "Spring, year 3" and means nothing until a year is explained.
        const html = readFileSync(
            join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
        const card = html.slice(html.indexOf('controls-hint'));
        const list = card.slice(0, card.indexOf('</ul>'));
        expect(list).toMatch(/day and night is a year/i);
        // And the LOOK line has to describe the keys the part actually has now.
        expect(list).toMatch(/plus and minus/i);
    });
});
