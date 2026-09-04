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
    // The season chip waits for the welcome card to go, along with the rest of
    // the chrome, and is asserted properly in its own test below.
    expect(dom.el('season-chip').classList.contains('visible')).toBe(false);
    fire(dom.el('blocker'), 'click');
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
    // The configured schema, not a number copied into the test. Bumping the
    // schema is a deliberate act and the suite should follow it, not fail on it.
    const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');
    expect(saved.v).toBe(GARDEN_CONFIG.storage.schema);
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

test('A NEW GARDEN GETS A NEW SKY, NOT THE OLD STORM', async () => {
    // QA: "when I reset the scene using the Start a new garden button, it
    // doesn't always reset the weather." The "always" is the tell. `applyReset`
    // put the clock back to the opening spring morning and cleared the plot,
    // and never touched the weather at all, so a garden cleared under a
    // downpour got a fresh plot in the rain. It looked fine whenever it
    // happened to be a clear day already, which is most of the time.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    fire(dom.el('blocker'), 'click');
    stepFrames(30);

    // A settled storm, the way the state machine leaves one: mid-dwell, fully
    // transitioned, with rain falling and the sky dark.
    const w = main.getWeather();
    w.state = 'storm';
    w.from = 'storm';
    w.transition = 1;
    w.held = 12;
    w.gloom = 0.8;
    w.rain = 1;
    w.precip = 'rain';
    w.windStrength = 0.9;

    // An empty plot clears without the confirm dialog.
    fire(dom.el('reset-btn'), 'click');
    stepFrames(2);

    // ---- THE SKY THE SCENE OPENS ON ------------------------------------
    // Not merely "not a storm": the same object `init` builds, so there is one
    // definition of what a new garden looks like rather than a second one that
    // can drift from it.
    const { createWeather } = await import('../www/garden/js/weather.min.js');
    const fresh = createWeather('sunny');
    const now = main.getWeather();
    for (const key of ['state', 'from', 'transition', 'gloom', 'rain', 'precip']) {
        expect(`${key}: ${now[key]}`).toBe(`${key}: ${fresh[key]}`);
    }
    // AND IT IS SETTLED, not caught mid-crossfade. `transition` at 1 means the
    // new garden opens clear rather than fading out of the storm it replaced.
    expect(now.transition).toBe(1);
    // The dwell starts over too, so the fresh sky gets its full run before the
    // machine rolls again. Not exactly zero: the two frames stepped above have
    // already aged it, and pinning it to 0 would be a test of the frame count.
    expect(now.held).toBeLessThan(0.5);

    // And the scene keeps running on it.
    stepFrames(60);
    expect(main.getState().running).toBe(true);
});

test('PLANTING TURNS THE SCENE TO LOOK AT THE NEW TREE', async () => {
    // The arithmetic is asserted in tests/garden-world.test.mjs. This is the
    // wiring: that planting reaches it at all, that the aim lands on the tree
    // that was actually planted, and that the move runs on the render loop
    // rather than arriving in one frame.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const garden = await import('../www/garden/js/garden.min.js');
    const view = await import('../www/garden/js/view.min.js');
    const terrain = await import('../www/garden/js/terrain.min.js');

    fire(dom.el('blocker'), 'click');
    stepFrames(10);
    // Nothing is planted, so nothing has been asked for.
    expect(view.getAim()).toBe(null);

    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    expect(garden.getTrees()).toHaveLength(1);

    // IT IS A MOVE AND NOT A CUT. One frame in, the aim exists and is on its
    // way rather than already there: a camera that teleports leaves the
    // visitor working out where they are.
    stepFrames(1);
    expect(view.isFocusing()).toBe(true);

    // And it arrives on the tree that went in, not near it.
    stepFrames(120);
    const record = garden.getTrees()[0].record;
    const cell = terrain.cellCenter(record.gx, record.gz);
    const aim = view.getAim();
    expect(view.isFocusing()).toBe(false);
    expect(aim.x).toBeCloseTo(cell.x, 6);
    expect(aim.z).toBeCloseTo(cell.z, 6);
    // Aimed up the trunk rather than at the roots, or the tree grows out of
    // the top of the frame it was just centred in.
    expect(aim.y).toBeGreaterThan(terrain.heightAt(cell.x, cell.z));

    // ---- AND THE VISITOR CAN TAKE IT BACK --------------------------------
    // A move that ignores the controls is worse than no move. `pointerdown`
    // is on the document because the pan and zoom buttons are floating chrome
    // and never touch the canvas.
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(2);
    expect(view.isFocusing()).toBe(true);
    fire(globalThis.document, 'pointerdown');
    expect(view.isFocusing()).toBe(false);

    main.__test__.state.running = false;
});

test('PLANTING AFTER A PAN CENTRES THE TREE, NOT THE TREE PLUS THE PAN', async () => {
    // ---- THE BUG THIS EXISTS FOR, AND IT SHIPPED ONCE --------------------
    //
    // The shared pan part's yaw is an OFFSET FROM this scene's aim object, it
    // persists, and it is applied AFTER `applyView` every frame. So aiming the
    // composed view at a new tree centred it and then added the visitor's own
    // pan straight back on top: the tree came out at the edge of a desktop
    // frame and clean off a portrait one, whose half-width is 18.7 degrees
    // against a pan limit of 31.5.
    //
    // The "sometimes" in the QA report was exactly whether the visitor had
    // panned before planting, which is most of the time, because looking at
    // the spot is how you choose it. So this test pans FIRST.
    //
    // It cannot assert the camera's direction: under the THREE stub every
    // number read back off a camera is zero. It asserts the thing that made
    // the direction wrong, which is the offset surviving the plant.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const view = await import('../www/garden/js/view.min.js');
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');

    fire(dom.el('blocker'), 'click');
    stepFrames(10);
    expect(pan.getPanAngle()).toBe(0);

    // Look across the plot, the way somebody choosing a spot does. The part
    // listens for the arrow keys on the WINDOW, not the document.
    fire(globalThis.window, 'keydown', { code: 'ArrowRight' });
    stepFrames(60);
    fire(globalThis.window, 'keyup', { code: 'ArrowRight' });
    const panned = pan.getPanAngle();
    expect(panned).toBeGreaterThan(0.2);

    // Plant. The offset is CONSUMED rather than carried, so the visitor's pan
    // range is symmetric about the tree they are now looking at.
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    expect(pan.getPanAngle()).toBe(0);
    expect(pan.getTiltAngle()).toBe(0);

    // AND IT IS FOLDED INTO THE MOVE RATHER THAN THROWN AWAY. Zeroing the
    // offset on its own would swing the camera by up to 31.5 degrees in one
    // frame, so the move starts from where the camera was genuinely pointing.
    // Under the stub that read-back is not available and it falls back to the
    // composed aim, so what is asserted here is that the move is still an
    // eased one and still lands on the tree.
    stepFrames(1);
    expect(view.isFocusing()).toBe(true);
    stepFrames(120);
    expect(view.isFocusing()).toBe(false);
    expect(view.getAim()).not.toBe(null);
    // And nothing has quietly put the offset back.
    expect(pan.getPanAngle()).toBe(0);

    main.__test__.state.running = false;
});

test('SHOW THE WHOLE GARDEN IS ONLY THERE WHEN IT HAS SOMETHING TO DO', async () => {
    // The Water all rule, applied to the camera: a visitor who has not moved
    // the view never sees this, so the frame the scene opens on carries no
    // chrome it does not need. And when it does appear it puts back all THREE
    // things that can move the view, which is what earns it a place next to a
    // zoom that can only reach two of them.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const view = await import('../www/garden/js/view.min.js');
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');
    const button = dom.el('view-reset');

    fire(dom.el('blocker'), 'click');
    stepFrames(10);
    // Nothing has moved, so there is nothing to put back. `hidden` and not a
    // class, so it leaves the tab order with the pixels: a button that is
    // invisible and still focusable is a trap only keyboard visitors find.
    //
    // And the state is WRITTEN rather than inherited from the markup's own
    // `hidden`, which is what this assertion actually pins: the harness
    // fabricates elements without their attributes, so a control that relied
    // on the attribute would read as visible here and be right on the site by
    // luck. That is the `.ui-float` trap this codebase has met twice.
    expect(button.hidden).toBe(true);

    // Move all three: the visitor's pan, and the dolly and aim that planting
    // takes over.
    fire(globalThis.window, 'keydown', { code: 'ArrowRight' });
    stepFrames(40);
    fire(globalThis.window, 'keyup', { code: 'ArrowRight' });
    ui.openPlantModal({ full: false });
    fire(dom.el('plant-confirm'), 'click');
    stepFrames(150);
    expect(button.hidden).toBe(false);
    expect(view.getAim()).not.toBe(null);
    expect(view.getDolly()).toBeGreaterThan(0);

    // Press it, and the view eases back rather than cutting: same move
    // planting uses, aimed at the composed viewpoint with a dolly of zero.
    fire(button, 'click');
    expect(view.isFocusing()).toBe(true);
    // The part's offset is the half the dolly release cannot reach, and it
    // goes at once, folded into the move so nothing jumps.
    expect(pan.getPanAngle()).toBe(0);
    expect(pan.getTiltAngle()).toBe(0);

    stepFrames(150);
    expect(view.getDolly()).toBeCloseTo(0, 6);
    // The aim is released outright rather than parked on the composed point,
    // so the next zoom in is a plain dolly and not a rubber band.
    expect(view.getAim()).toBe(null);
    // And the control takes itself away again.
    expect(button.hidden).toBe(true);

    main.__test__.state.running = false;
});

test('ZOOMING IN WIDENS THE PAN, AND PULLING BACK BRINGS THE VIEW IN AGAIN', async () => {
    // The rule is asserted in garden-world; this is the wiring: that the render
    // loop actually pushes it to the shared part every frame, and that it does
    // so BEFORE the part reads it, so the clamp a drag or a button works
    // against is this frame's rather than last frame's.
    const main = await bootGarden();
    const view = await import('../www/garden/js/view.min.js');
    const pan = await import('../www/shared/js/pan-1.0.0.min.js');
    const P = GARDEN_CONFIG.camera.portrait.pan;
    const [, zoomIn, zoomOut] = zoomStack().children;

    fire(dom.el('blocker'), 'click');
    stepFrames(5);

    // Zoomed out, the clamp is the composed one and the visitor can be pushed
    // all the way to it.
    fire(globalThis.window, 'keydown', { code: 'ArrowRight' });
    stepFrames(200);
    fire(globalThis.window, 'keyup', { code: 'ArrowRight' });
    expect(pan.getPanAngle()).toBeCloseTo(P.maxAngle, 6);

    // Come in, and the travel that was used up is available again. The button
    // stops reading as spent, which is the visible half of it.
    fire(zoomIn, 'pointerdown', { pointerId: 1 });
    stepFrames(60);
    fire(zoomIn, 'pointerup', { pointerId: 1 });
    expect(view.getDolly()).toBeGreaterThan(0.2);
    expect(zoomIn.classList.contains('at-limit')).toBe(false);
    fire(globalThis.window, 'keydown', { code: 'ArrowRight' });
    stepFrames(200);
    fire(globalThis.window, 'keyup', { code: 'ArrowRight' });
    const wide = pan.getPanAngle();
    // More than the composed clamp, which is the whole ask, and never past the
    // quarter turn. The exact value is the RULE'S business (asserted in
    // garden-world against every frame shape); what this file asserts is that
    // the render loop is applying it at all.
    expect(wide).toBeGreaterThan(P.maxAngle);
    expect(wide).toBeLessThanOrEqual(P.maxAngleCap + 1e-9);
    // And it really is a clamp: leaning on it longer does not move it.
    fire(globalThis.window, 'keydown', { code: 'ArrowRight' });
    stepFrames(200);
    fire(globalThis.window, 'keyup', { code: 'ArrowRight' });
    expect(pan.getPanAngle()).toBeCloseTo(wide, 9);

    // ---- AND PULLING BACK BRINGS IT IN ----------------------------------
    // A visitor left beyond a clamp they can no longer reach would find both
    // pan buttons refusing to move. Coupled to a control they are already
    // holding, and it is the same "pull back and the frame re-composes" the
    // aim release does one layer up.
    fire(zoomOut, 'pointerdown', { pointerId: 2 });
    stepFrames(400);
    fire(zoomOut, 'pointerup', { pointerId: 2 });
    expect(view.getDolly()).toBeLessThanOrEqual(0);
    expect(pan.getPanAngle()).toBeCloseTo(P.maxAngle, 6);

    main.__test__.state.running = false;
});

test('THE LAKE VIEW IS AIMED AT THE DUCKS, NOT AT THE MIDDLE OF THE WATER', async () => {
    // ---- THE SECOND QA REPORT, AND IT IS ONE LINE OF ARITHMETIC --------
    // "It looks like the focus is on the center of the lake, but ideally the
    // three ducks would be in the center." `duckPaths` seeds each loop
    // wherever the seed puts it, so the trio lives seven metres off the pond's
    // own centre, and a camera aimed at the centre puts them out to one side.
    //
    // Asserted through the PURE composition rather than off the camera, because
    // under the THREE stub every number read back off one is a proxy: a shot
    // that only ever existed inside `camera.lookAt` could not be checked at all.
    const main = await bootGarden();
    const { lakeShot } = await import('../www/garden/js/wildlife.min.js');
    const { pondWaterLevel } = await import('../www/garden/js/terrain.min.js');
    const { GARDEN_CONFIG: CFG } = await import('../www/garden/js/config.min.js');
    const P = CFG.world.pond;

    const home = lakeShot(CFG, { mobile: false });
    const level = pondWaterLevel(CFG.world);
    const shot = main.lakeFraming(home, level);

    // It looks at the ducks.
    expect(shot.at.x).toBeCloseTo(home.x, 9);
    expect(shot.at.z).toBeCloseTo(home.z, 9);
    // AND THAT IS NOT THE MIDDLE OF THE WATER, or this test proves nothing.
    expect(Math.hypot(home.x - P.x, home.z - P.z)).toBeGreaterThan(3);
    expect(Math.hypot(shot.at.x - P.x, shot.at.z - P.z)).toBeGreaterThan(3);

    // The eye is that far back along the chosen bearing, on the near side, and
    // the frame it covers holds the ducks' whole roaming envelope.
    expect(Math.hypot(shot.eye.x - home.x, shot.eye.z - home.z))
        .toBeCloseTo(shot.distance, 6);
    expect(shot.eye.z).toBeGreaterThan(home.z);
    expect(shot.half).toBeGreaterThan(home.radius);
    // Above the water rather than in it, and looking at the surface rather
    // than at the sky.
    expect(shot.eye.y).toBeGreaterThan(level);
    expect(shot.at.y).toBeLessThan(shot.eye.y);

    main.__test__.state.running = false;
});

test('THE LAKE IS TAPPABLE ALL YEAR, AND ITS CARD REPORTS THE SEASON', async () => {
    // The lake is 42 m out and the dolly runs up the middle of the PLOT, so one
    // of the two things this scene is made of is permanently out of reach. The
    // card lends a second camera rather than moving the first.
    //
    // IT DOES NOT CLOSE ITSELF, and that is a correction rather than a dropped
    // requirement. The first version was a portrait of one duck and had to shut
    // when they migrated; the subject is the water now, the water is there
    // every day of the year, and a card that can be opened on an empty lake in
    // January needs to say why it is empty rather than refuse to open.
    const main = await bootGarden();
    const ui = await import('../www/garden/js/ui.min.js');
    const wildlife = await import('../www/garden/js/wildlife.min.js');
    const { GARDEN_CONFIG: CFG } = await import('../www/garden/js/config.min.js');

    fire(dom.el('blocker'), 'click');
    stepFrames(20);
    expect(ui.isLakeOpen()).toBe(false);

    // Opened the way a tap on the water does.
    expect(ui.openLakeCard(0)).toBe(true);
    expect(ui.isLakeOpen()).toBe(true);
    // It is a modal like the others, so nothing behind it takes a tap.
    expect(ui.anyModalOpen()).toBe(true);
    expect(dom.el('lake-note').textContent).toMatch(/drifting|keep to the lake/i);

    // ---- THE LINE FOLLOWS THE YEAR WHILE IT IS OPEN --------------------
    // Somebody who opens it in high summer and stays for the migration is told
    // what they are watching as it happens, rather than being shown an empty
    // lake with the summer's copy still under it.
    const secondsForHour = (h) => (h / 24) * CFG.clock.cycleSeconds;
    const D = CFG.world.wildlife.ducks;

    main.__test__.state.elapsedSeconds = secondsForHour(D.leaveAt + D.span * 0.5);
    stepFrames(2);
    expect(wildlife.duckFlightAt(D.leaveAt + D.span * 0.5)).toBeGreaterThan(0.02);
    expect(dom.el('lake-note').textContent).toMatch(/leaving|climbing/i);
    // AND IT IS STILL OPEN, which is the half that changed.
    expect(ui.isLakeOpen()).toBe(true);

    // Deep winter: they are gone, the card stays, and it says so.
    main.__test__.state.elapsedSeconds = secondsForHour(0.5);
    stepFrames(2);
    expect(ui.isLakeOpen()).toBe(true);
    expect(dom.el('lake-note').textContent).toMatch(/gone south/i);

    // And it can be opened FRESH in the season with nothing on the water,
    // which the duck-shaped version could not do at all.
    ui.closeLakeCard();
    expect(ui.isLakeOpen()).toBe(false);
    expect(ui.openLakeCard(wildlife.duckFlightAt(0))).toBe(true);
    expect(dom.el('lake-note').textContent).toMatch(/gone south/i);
    ui.closeLakeCard();

    main.__test__.state.running = false;
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

// ---- The preview rectangle, and the two QA reports it caused ---------------
//
// `renderer.setViewport` and `renderer.setScissor` MULTIPLY WHAT THEY ARE GIVEN
// BY THE PIXEL RATIO before touching GL, so both take CSS pixels. The preview
// used to hand them drawing-buffer pixels, which is the same number at a ratio
// of 1 and only there. Every machine this was written and reviewed on runs at
// 1. At the 1.5 a phone gets, the rectangle lands off the top of the buffer and
// the thumbnail is stale corner pixels (QA: "the tree isn't visible in the
// rotating preview window"), and the hand-built restore afterwards leaves the
// MAIN scene on a viewport half again too big, so from then on the garden is
// drawn somewhere other than where every projection in main.js says it is (QA:
// taps on a planted tree's mulch answering "Trees go inside the walls", because
// planting is what opens a modal in the first place).
//
// So the rule under test is: the rectangle three is handed, once three has
// multiplied and floored it, must be the same rectangle `drawImage` reads.

/** What three.js will actually hand GL for a rect given in CSS pixels. */
function asThreeApplies(cssX, cssY, cssW, cssH, pixelRatio) {
    return {
        x: Math.floor(cssX * pixelRatio), y: Math.floor(cssY * pixelRatio),
        w: Math.floor(cssW * pixelRatio), h: Math.floor(cssH * pixelRatio)
    };
}

test('THE PREVIEW RECTANGLE IS THE TOP LEFT OF THE BUFFER AT EVERY PIXEL RATIO', async () => {
    const { previewRect } = await import('../www/garden/js/main.js');

    // 391 x 841 CSS, the frame QA shot the mobile pass on, at every ratio the
    // quality governor can produce (ceiling 1.5 on mobile and 2 on desktop,
    // scaled down to 0.6 of that), plus the 1 that hid the bug.
    for (const [cssW, cssH] of [[391, 841], [989, 841], [1280, 800]]) {
        for (const pr of [0.6, 0.75, 0.9, 1, 1.2, 1.5, 2, 3]) {
            const bufW = Math.floor(cssW * pr);
            const bufH = Math.floor(cssH * pr);
            const rect = previewRect(bufW, bufH, pr);
            const gl = asThreeApplies(0, rect.cssTop, rect.css, rect.css, pr);

            const where = `${cssW}x${cssH} @ ${pr}`;
            // Square, and inside the buffer, or the scissor clips the picture.
            expect(`${where}: ${gl.w}x${gl.h}`).toBe(`${where}: ${rect.device}x${rect.device}`);
            expect(`${where}: fits`).toBe(`${where}: ${gl.x >= 0 && gl.y >= 0
                && gl.x + gl.w <= bufW && gl.y + gl.h <= bufH}`.replace('true', 'fits'));
            // GL measures from the BOTTOM, drawImage from the top, and the copy
            // reads the buffer's top `device` rows. So the rect's top edge has
            // to be the buffer's top edge, exactly.
            expect(`${where}: top`).toBe(`${where}: ${gl.y + gl.h === bufH ? 'top' : gl.y + gl.h}`);
        }
    }
});

test('the preview never asks for a rectangle bigger than the window', async () => {
    const { previewRect } = await import('../www/garden/js/main.js');
    // A very short window, which is a phone in landscape with the keyboard up
    // or a desktop window dragged to a sliver. A 256 px square does not fit in
    // it, and a scissor rect that hangs off the buffer draws nothing at all.
    const rect = previewRect(300, 120, 1);
    expect(rect.device).toBeLessThanOrEqual(120);
    expect(rect.cssTop).toBeGreaterThanOrEqual(0);

    // And nothing a renderer can report turns it into NaN, which would be a
    // scissor rectangle that silently draws nothing and reports nothing.
    for (const bad of [0, NaN, undefined, null]) {
        const safe = previewRect(bad, bad, bad);
        expect(Number.isFinite(safe.css) && safe.css > 0).toBe(true);
        expect(Number.isFinite(safe.device) && safe.device > 0).toBe(true);
        expect(Number.isFinite(safe.cssTop)).toBe(true);
    }
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

    // THE VIEW RESET IS FIRST, AND THAT IS LOAD BEARING. The stack is anchored
    // to the BOTTOM of the frame, so a button appended to the end would shove
    // the zoom pair upward the moment it appeared, and a zoom button that moves
    // when a neighbour shows up is worse than the neighbour.
    expect(stack.children[0]).toBe(dom.el('view-reset'));
    expect(labels(stack).slice(1)).toEqual(['Zoom in', 'Zoom out']);

    // The pair are the SHARED PART's buttons, carrying its hold listeners,
    // which is what keeps the pinch and the arrow keys working. Building a
    // private pair here instead would have taken the pinch with it, since
    // applyGesturePinch returns early when neither zoom button exists.
    for (const btn of stack.children.slice(1)) {
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
    // Plus first: the stack reads top to bottom, in on top. The view reset
    // sits above the pair, which is why this skips one.
    const [, zoomIn, zoomOut] = zoomStack().children;

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

    test('NOR IS ANYTHING ELSE ON SCREEN', async () => {
        // ---- THE CORNER WAS ONLY HALF OF IT ----------------------------
        // Reported from QA on a phone: the welcome card arrives under a full
        // set of chrome. Every float here is ABOVE the blocker (the pan row and
        // the zoom stack at 110 against its 100, Water all at 120), all of it
        // is in the card's tab order, and none of it has anything to do: the
        // card covers the view the pan and zoom would aim, and Water all
        // offers to water a plot the visitor has not been shown.
        await bootGarden();
        // Found by class, not invented: the stub searches the body first, so a
        // typo here fails rather than passing against a fresh empty div.
        const panRow = document.querySelector('.pan-controls');
        const zoom = document.querySelector('.garden-zoom');
        expect(panRow.classList.contains('ui-float')).toBe(true);
        expect(zoom.classList.contains('ui-float')).toBe(true);
        expect(panRow.hidden).toBe(true);
        expect(zoom.hidden).toBe(true);
        // The view reset rides INSIDE the zoom stack, so the stack going away
        // takes it too.
        expect(dom.el('view-reset').parentElement).toBe(zoom);

        beginTending();
        expect(panRow.hidden).toBe(false);
        expect(zoom.hidden).toBe(false);

        fire(dom.el('help-btn'), 'click');
        expect(panRow.hidden).toBe(true);
        expect(zoom.hidden).toBe(true);
    });

    test('and Water all stays away for as long as the card is up', async () => {
        // ---- THE ONE THAT PUTS ITSELF BACK ------------------------------
        // `syncWaterAll` runs once a second FROM THE ANIMATION LOOP, and the
        // loop does not stop for the welcome card: only the calendar does. So
        // hiding this in `syncWelcomeChrome` alone is not a fix, it is a one
        // second delay. This is the test that fails if the gate in
        // `syncWaterAll` is removed and the one in `syncWelcomeChrome` is not.
        await bootGarden();
        asShipped();
        // THE BUILT MODULES, because main.js resolves its imports to the .min
        // files and the module state has to be the same one it is driving.
        const ui = await import('../www/garden/js/ui.min.js');
        const garden = await import('../www/garden/js/garden.min.js');
        beginTending();
        // Under the stub a raycast finds nothing, so the modal is opened
        // directly and the plant falls back to the middle of the plot.
        ui.openPlantModal({ full: false });
        fire(dom.el('plant-confirm'), 'click');
        // Past the once-a-second resync, which is what puts the button up: a
        // plant does not sync it directly.
        stepFrames(60, 30);
        expect(garden.getTrees()).toHaveLength(1);
        const water = dom.el('water-all');
        expect(water.hidden).toBe(false);

        fire(dom.el('help-btn'), 'click');
        expect(water.hidden).toBe(true);
        // Two seconds of frames, which is twice the resync interval.
        stepFrames(60, 40);
        expect(water.hidden).toBe(true);

        // And it comes straight back with the card, without waiting for the
        // next tick, because a returning visitor meets the offer in the first
        // frame they see.
        fire(document, 'keydown', { code: 'Escape' });
        expect(water.hidden).toBe(false);
    });

    test('and the sheet actually hides them, which the stub cannot tell us', () => {
        // The DOM stub has no stylesheet, so setting `hidden` succeeds whether
        // or not a rule exists. `.ui-float.visible` sets `display: flex`, which
        // beats the attribute's UA default, so without this rule the buttons
        // would stay on screen and only leave the tab order.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        expect(css).toMatch(/\.menu-btn\[hidden\]\s*\{[^}]*display:\s*none/);

        // The same trap, three more times over, and each selector has to
        // OUTRANK the `.visible` rule it is defeating rather than rely on
        // source order: `.pan-controls.always-on.visible` is three classes, so
        // the rule that beats it needs four.
        for (const sel of [
            '.water-all.visible[hidden]',
            '.garden-zoom.visible[hidden]',
            '.pan-controls.visible[hidden]',
            '.pan-controls.always-on.visible[hidden]'
        ]) {
            const escaped = sel.replace(/[.[\]]/g, (c) => `\\${c}`);
            expect(`${sel} hides`).toBe(
                new RegExp(`${escaped}[^{]*\\{[^}]*display:\\s*none`).test(css)
                    ? `${sel} hides` : `${sel} MISSING from experience.css`);
        }
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

// ---- Somebody arriving with no pointer (M24-11) -----------------------------

/**
 * THE WHOLE EXPERIENCE WAS BEHIND A GESTURE THEY CANNOT MAKE.
 *
 * `openPlantModal` had exactly one caller, `handleSceneTap`, bound only to
 * `click` and `touchend` on the canvas, and every other act in the scene is
 * downstream of owning a tree. A keyboard visitor could read the welcome card,
 * pan, tilt, zoom, and leave. Water all was the one keyboard control they had,
 * and it only appears once a tree exists, which they had no way to create.
 *
 * These tests drive the tend panel exactly as a keyboard visitor would: press
 * Plant, choose a species, confirm, and then find the new tree in the list and
 * open it. Nothing here touches the canvas.
 */
describe('the visitor with no pointer', () => {
    /** Press a control the way a keyboard visitor does: focus, then activate.
     *  `fire` alone only invokes listeners, and every focus restore in ui.js
     *  reads `document.activeElement` at the moment a dialog opens. */
    function press(el) {
        el.focus();
        fire(el, 'click');
    }

    async function bootTending() {
        const main = await bootGarden();
        asShipped();
        const ui = await import('../www/garden/js/ui.min.js');
        const garden = await import('../www/garden/js/garden.min.js');
        beginTending();
        return { main, ui, garden };
    }

    test('CAN PLANT A TREE WITHOUT EVER TOUCHING THE CANVAS', async () => {
        const { ui, garden } = await bootTending();
        expect(garden.getTrees()).toHaveLength(0);

        // The one route in. No raycast, no client coordinates, no canvas.
        fire(dom.el('tend-plant'), 'click');
        expect(ui.isPlantOpen()).toBe(true);

        // ---- AND THE BUTTON DOES NOT SAY "HERE" ------------------------
        // There is no spot, because there was no pointer to put one under, so
        // the plot picks the free cell nearest its middle. Telling this
        // visitor "Plant it here" names a place they never chose.
        expect(dom.el('plant-confirm').textContent).toBe('Plant it in the plot');
        expect(dom.el('plant-confirm').disabled).toBe(false);

        fire(dom.el('plant-confirm'), 'click');
        stepFrames(30);
        expect(garden.getTrees()).toHaveLength(1);
    });

    test('and the tree they planted is in the list, in words', async () => {
        const { garden } = await bootTending();
        const list = dom.el('tend-list');
        // An empty plot says so rather than showing an empty group.
        expect(list.children).toHaveLength(0);
        expect(dom.el('tend-empty').hidden).toBe(false);

        fire(dom.el('tend-plant'), 'click');
        fire(dom.el('plant-confirm'), 'click');
        stepFrames(30);

        // AT ONCE, not on the next heartbeat: the visitor's next Tab is looking
        // for the tree they just planted.
        expect(list.children).toHaveLength(1);
        expect(dom.el('tend-empty').hidden).toBe(true);

        // ---- THE TEXT IS THE ACCESSIBLE NAME, NOT AN ARIA-LABEL OVER IT ----
        // A visible label and an accessible name that disagree is a WCAG
        // failure and a practical one, because voice control types what it
        // sees. So the sentence is the button's own text and there is no
        // aria-label competing with it.
        const row = list.children[0].children[0];
        const entry = garden.getTrees()[0];
        expect(row.getAttribute('aria-label')).toBeFalsy();
        expect(row.textContent).toContain(entry.resolved.name);
        // Identity and state, in words: which tree, how old, how it is doing,
        // how thirsty. Never colour alone, which nothing here is.
        expect(row.textContent).toMatch(/planted this year|year/i);
        expect(row.textContent).toMatch(/percent/);
    });

    test('and pressing it opens that tree\'s own card', async () => {
        const { ui, garden } = await bootTending();
        fire(dom.el('tend-plant'), 'click');
        fire(dom.el('plant-confirm'), 'click');
        stepFrames(30);

        fire(dom.el('tend-list').children[0].children[0], 'click');
        expect(ui.isCardOpen()).toBe(true);
        // THE SAME CARD THE POINTER GETS, on the same tree, or the keyboard
        // route is a second-class copy that drifts the first time the card
        // gains anything.
        expect(ui.getCardEntry()).toBe(garden.getTrees()[0]);
        expect(dom.el('tree-title').textContent).toBe(garden.getTrees()[0].resolved.name);

        // And the card is where tending happens, so both its actions work from
        // here. Watering first, because it is the one a visitor repeats.
        garden.getTrees()[0].record.moisture = 0.1;
        fire(dom.el('tree-water'), 'click');
        expect(garden.getTrees()[0].record.moisture).toBeGreaterThan(0.9);
    });

    test('and each row opens ITS OWN tree, not the last one built', async () => {
        // ---- ONE TREE CANNOT CATCH AN OFF-BY-ONE --------------------------
        // Every row closes over the entry it was built for, and a loop that
        // captured the wrong binding, or a handler that read some "current"
        // tree instead, would look perfect on a plot of one and open the same
        // card from every row on a plot of three. Rows are also matched to
        // records by id rather than by position, so a reordered list fails here
        // rather than silently opening a neighbour.
        const { ui, garden } = await bootTending();
        for (let i = 0; i < 3; i++) {
            press(dom.el('tend-plant'));
            press(dom.el('plant-confirm'));
            stepFrames(10);
        }
        const trees = garden.getTrees();
        expect(trees).toHaveLength(3);

        const rows = dom.el('tend-list').children;
        expect(rows).toHaveLength(3);
        for (let i = 0; i < 3; i++) {
            const row = rows[i].children[0];
            expect(`row ${i}: ${row.dataset.treeId}`).toBe(`row ${i}: ${trees[i].record.id}`);
            press(row);
            expect(ui.getCardEntry() === trees[i]
                ? `row ${i} opens its own tree`
                : `row ${i} opened the WRONG tree`).toBe(`row ${i} opens its own tree`);
            fire(document, 'keydown', { code: 'Escape' });
        }
    });

    test('REMOVING A TREE DOES NOT DROP FOCUS ON THE FLOOR', async () => {
        // ---- THE BUG THIS ROUTE WOULD HAVE SHIPPED WITH -----------------
        // The card's focus restore aims at whatever opened it, which is the
        // list row for the tree being removed. `closeTreeCard` runs BEFORE the
        // remove handler, so focus lands on that row and the rebuild then
        // destroys it, silently dropping focus to <body>: the visitor is thrown
        // back to the top of the page with no idea why.
        const { garden } = await bootTending();
        // `fire` invokes listeners and does NOT focus, where a real press
        // does both, so every step a keyboard visitor would take focuses
        // first. Without that the whole chain of focus restores runs against
        // an activeElement nothing ever set, and this test would pass or fail
        // for reasons that have nothing to do with the code.
        press(dom.el('tend-plant'));
        press(dom.el('plant-confirm'));
        stepFrames(30);
        // Planting hands focus back to the button that opened the modal.
        expect(document.activeElement).toBe(dom.el('tend-plant'));

        const row = dom.el('tend-list').children[0].children[0];
        press(row);
        // The card opens with Water focused; the visitor tabs on to Remove.
        press(dom.el('tree-remove'));

        expect(garden.getTrees()).toHaveLength(0);
        expect(dom.el('tend-list').children).toHaveLength(0);
        // The card's own restore aimed focus at the row it was opened from,
        // which no longer exists. Handed to the one control that is always
        // there, rather than dropped on <body>.
        expect(document.activeElement).toBe(dom.el('tend-plant'));
    });

    test('the list survives a tick without taking focus with it', async () => {
        // ---- REBUILT WHEN THE SET MOVES, WRITTEN IN PLACE WHEN IT HAS NOT --
        // A tree's line carries its age and its thirst, so it rides the
        // once-a-second tick. Rebuilding on every one of those would take focus
        // out of the panel once a second, which would make the route unusable
        // for exactly the visitor it exists for. This is the test that fails if
        // `tendKey` is dropped.
        const { garden } = await bootTending();
        fire(dom.el('tend-plant'), 'click');
        fire(dom.el('plant-confirm'), 'click');
        stepFrames(30);

        const row = dom.el('tend-list').children[0].children[0];
        row.focus();
        // Four seconds of frames, which is four resyncs.
        stepFrames(120, 33);
        expect(dom.el('tend-list').children[0].children[0]).toBe(row);
        expect(document.activeElement).toBe(row);
        expect(garden.getTrees()).toHaveLength(1);
    });

    test('and neither the panel nor Plant is offered while the card is up', async () => {
        // The panel is off screen until something in it has focus, so the tab
        // order is the whole point of hiding it. Plant is real chrome now and
        // draws OVER the welcome card at z-index 120 against its 100, so it is
        // the visible half of the same rule: a tree offered before the visitor
        // has seen the ground.
        await bootGarden();
        const panel = dom.el('tend-panel');
        const plant = dom.el('tend-plant');
        expect(panel.hidden).toBe(true);
        expect(plant.hidden).toBe(true);

        beginTending();
        expect(panel.hidden).toBe(false);
        expect(plant.hidden).toBe(false);
        // `.visible` AS WELL AS THE ATTRIBUTE. The sheet gives it display:none
        // until something says otherwise, exactly like Water all, so clearing
        // `hidden` alone would leave an invisible button in the tab order.
        expect(plant.classList.contains('visible')).toBe(true);

        fire(dom.el('help-btn'), 'click');
        expect(panel.hidden).toBe(true);
        expect(plant.hidden).toBe(true);
    });

    test('AND THE SEASON CHIP IS A READING OF A CLOCK THAT IS STOPPED', async () => {
        // ---- IT WAS KEPT ON THE WRONG ARGUMENT --------------------------
        // "A status readout is not a control": true, and beside the point. The
        // calendar does NOT run while the card is up, so the chip reads
        // "Spring, year 1 · clear" over a card explaining what a year is, and
        // it will still read exactly that however long the visitor takes. A
        // frozen readout is not information.
        await bootGarden();
        const chip = dom.el('season-chip');
        expect(chip.classList.contains('visible')).toBe(false);

        beginTending();
        expect(chip.classList.contains('visible')).toBe(true);
        // And it is saying something, so what comes back is a chip and not an
        // empty pill: the reveal and the text are separate mechanisms and only
        // one of them moved.
        stepFrames(30);
        expect(chip.textContent).toMatch(/^Spring, year 1/);

        // Back off with the help card, and back on when it closes, every time
        // rather than only on the first arrival.
        fire(dom.el('help-btn'), 'click');
        expect(chip.classList.contains('visible')).toBe(false);
        fire(document, 'keydown', { code: 'Escape' });
        expect(chip.classList.contains('visible')).toBe(true);

        // ---- IT FADES RATHER THAN BEING `hidden` ------------------------
        // The chip is an `aria-live` region, and taking one out of the document
        // and putting it back is a change some screen readers announce: a
        // visitor who opened the help card would hear the weather read at them
        // for their trouble. Opacity never touches the accessibility tree. So
        // the attribute must NOT be what moved.
        expect(chip.hidden).toBe(false);
        fire(dom.el('help-btn'), 'click');
        expect(chip.hidden).toBe(false);
    });

    test('and the sheet fades the chip rather than collapsing it', () => {
        // The DOM stub has no stylesheet, so nothing above can tell us that
        // `.visible` is the difference between seen and unseen here, or that
        // the transition the comment promises exists at all.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        expect(css).toMatch(/\.season-chip \{[^}]*opacity:\s*0;/);
        expect(css).toMatch(/\.season-chip \{[^}]*transition:\s*opacity/);
        expect(css).toMatch(/\.season-chip\.visible \{[^}]*opacity:\s*1/);
        // No `display` anywhere in either, or the fade is decorative and the
        // chip pops.
        const rest = css.slice(css.indexOf('.season-chip {'));
        expect(rest.slice(0, rest.indexOf('\n}\n'))).not.toMatch(/display:/);
    });

    test('AND PLANT STAYS ONCE IT ARRIVES, INCLUDING ON A FULL PLOT', async () => {
        // ---- A CONTROL THAT COMES AND GOES IS HARD TO LEARN -------------
        // The lesson Water all already carries, met again at the other end of
        // the range. A full plot is answered in a toast rather than by the
        // button vanishing, or by opening the species grid so the visitor can
        // read one disabled sentence at the bottom of it, which costs them a
        // dismissal to learn what a toast says at once. It is also the same
        // answer a tap on a full plot has always given.
        const { ui } = await bootTending();
        const plant = dom.el('tend-plant');
        const toastEl = dom.el('garden-toast');

        // Fill it. `capacity()` rather than a number typed here, or this test
        // goes stale the moment the plot is resized.
        const { capacity } = await import('../www/garden/js/garden.min.js');
        for (let i = 0; i < capacity(); i++) {
            press(plant);
            press(dom.el('plant-confirm'));
        }
        stepFrames(10);

        expect(plant.hidden).toBe(false);
        press(plant);
        expect(ui.isPlantOpen()).toBe(false);
        expect(toastEl.textContent).toMatch(new RegExp(`holds ${capacity()} trees`));
    });

    test('and the sheet slides it in on focus rather than leaving it invisible', () => {
        // The DOM stub has no stylesheet, so nothing above can tell us the
        // panel is ever visible. A focusable control that never appears is a
        // trap only sighted keyboard visitors find, and this is the rule that
        // stops it being one.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        expect(css).toMatch(/\.tend-panel\s*\{[^}]*translateY\(-120%\)/);
        expect(css).toMatch(/\.tend-panel:focus-within\s*\{[^}]*translateY\(0\)/);
        expect(css).toMatch(/\.tend-panel\[hidden\]\s*\{[^}]*display:\s*none/);
        // The rows are real 44px targets, because the panel is on screen for
        // whoever opened it and a pointer can reach it too.
        expect(css).toMatch(/\.tend-row\s*\{[^}]*min-height:\s*44px/);
        // And Plant, which is real chrome, needs the same `[hidden]` rule the
        // rest of the corner has: `.visible` sets `display` and beats the
        // attribute's UA default.
        expect(css).toMatch(/\.tend-plant\.visible\[hidden\]/);
        // Grouped with Water all, which is the point: the two are one family
        // and share every rule but their `top`.
        expect(css).toMatch(
            /\.tend-plant\.visible,\s*\n\.water-all\.visible \{[^}]*display:\s*inline-flex/);
    });

    test('and Plant sits ABOVE Water all by exactly its own height', () => {
        // ---- THE OFFSET IS THE BUTTON, NOT A GUESS ----------------------
        // 20px inset, a 44px control, 10px of air. If the pair ever drifts
        // apart or overlaps it is because one of these three moved and the
        // other did not, which is invisible in a passing suite and obvious in
        // a screenshot nobody takes until after the deploy.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        const shared = css.slice(css.indexOf('.tend-plant,\n.water-all'));
        const block = shared.slice(0, shared.indexOf('\n}\n'));
        expect(block).toMatch(/min-height:\s*44px/);
        // Neither ever grows a second line and shoves the other one down.
        expect(block).toMatch(/white-space:\s*nowrap/);

        // Both names appear TWICE: once in the grouped rule above that carries
        // everything they share, and once alone with their own `top`. Requiring
        // `top:` inside the block is what picks the right one, since `[^}]`
        // cannot reach past the grouped rule's closing brace.
        const top = (sel) => {
            const m = css.match(
                new RegExp(`\\n\\${sel} \\{[^}]*top:\\s*calc\\((\\d+)px`));
            return m ? Number(m[1]) : null;
        };
        expect(top('.tend-plant')).toBe(20);
        expect(top('.water-all')).toBe(20 + 44 + 10);
    });

    test('AND PLANT DOES NOT COLLIDE WITH THE TOP-RIGHT STACK', () => {
        // ---- THE ONE COLLISION IN THE FRAME, AND IT IS ARITHMETIC -------
        // Plant is the only float that shares a ROW with the menu buttons:
        // Water all sits at top 74 and the stack ends at 70, so it is below
        // them entirely. Help is the leftmost of the three at `right: 144px`
        // and 50px wide, so the stack reaches 194px in from the right edge
        // whatever the screen is, and Plant at its full size reaches 130px in
        // from the left. They meet below a 328px viewport.
        //
        // This asserts the two numbers the arithmetic rests on, because both
        // live in DIFFERENT stylesheets: the width is the shared sheet's and
        // the offset is this scene's, so a change to either silently moves the
        // point at which the frame breaks and no screenshot at 391px would
        // ever show it.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        const shared = readFileSync(
            join(process.cwd(), 'www', 'shared', 'css', 'styles-1.0.0.css'), 'utf8');

        const menu = shared.slice(shared.indexOf('.menu-btn {'));
        const btnWidth = Number(menu.match(/width:\s*(\d+)px/)[1]);
        const helpRight = Number(css.match(/\.help-btn \{[^}]*right:\s*(\d+)px/)[1]);
        expect(btnWidth).toBe(50);
        expect(helpRight).toBe(144);

        // And the narrow-phone rule exists to keep them apart, at the SAME
        // breakpoint the pan row already shrinks on rather than a third one.
        const narrow = css.slice(css.indexOf('@media (max-width: 380px)'));
        const block = narrow.slice(0, narrow.indexOf('\n}\n'));
        expect(block).toMatch(/\.tend-plant,\s*\n\s*\.water-all \{[^}]*font-size:\s*0\.78rem/);
        // The touch target is the number that may not move.
        expect(block).not.toMatch(/min-height/);
    });

    test('AND PLANT DOES NOT SIT THERE LOOKING PRESSED', () => {
        // ---- A FILL IS A STATE IN THIS SHEET ----------------------------
        // It shipped with a resting background of `rgba(accent, 0.26)` and QA
        // read it as permanently active. Correct, and measurably so: the hover
        // fill on the button directly below it is 0.30, so the two states were
        // three hundredths apart and the button lived inside its neighbour's
        // hover. Every control here is a dark pill that lifts to the accent
        // when touched, so a pill that starts lifted says "pressed".
        //
        // The property asserted is that the two differ in NOTHING but position:
        // anything either one declares for itself at rest is a difference, and
        // a difference in fill is the one that reads as a state.
        const css = readFileSync(
            join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
        // Both names also head the GROUPED rule that carries everything they
        // share, so requiring `top:` inside the block is what picks the
        // standalone one: `[^}]` cannot reach past the grouped rule's brace.
        const soleRule = (sel) => {
            const m = css.match(new RegExp(`\\n\\${sel} \\{([^}]*top:[^}]*)\\}`));
            return m ? m[1] : null;
        };
        for (const sel of ['.tend-plant', '.water-all']) {
            const rule = soleRule(sel);
            expect(`${sel} exists`).toBe(rule === null ? `${sel} MISSING` : `${sel} exists`);
            // Position and nothing else. The shared rule above them carries the
            // whole resting look, so neither can drift from the other.
            expect(`${sel}: ${rule.replace(/\s+/g, ' ').trim()}`)
                .toBe(`${sel}: ${rule.match(/top:[^;]+;/)[0]}`);
        }

        // And the lift is one rule for both, so they cannot disagree about what
        // "you are on this" looks like either.
        expect(css).toMatch(
            /\.tend-plant:hover,\s*\n\.water-all:hover \{[^}]*rgba\(var\(--ui-accent-rgb\), 0\.3\)/);
    });
});

// ---- The copy tells the truth about the species list ------------------------
//
// TWO SEPARATE LIES SHIPPED IN THIS COPY AND BOTH WERE FOUND BY READING RATHER
// THAN BY FAILING. The page said "twelve species" from M2 until 2026-08-31,
// through M11 adding four and M16 adding a seventeenth, and it offered to let a
// visitor "shape your own with a handful of sliders" for a fortnight after
// M16-2 deleted the sliders.
//
// **A COUNT IN PROSE IS A CACHED COPY OF SOMETHING THAT MOVES.** M10-1 already
// wrote this rule down for the planting-age toast and chose to name no number.
// The species count is worth naming, because "seventeen species" sells the
// scene in a way "several" does not, so it is named and then pinned here.

describe('the species copy', () => {
    const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
        'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
        'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
        'twenty'];
    // Every file that makes a claim to a visitor or a crawler about the list.
    const FILES = [
        ['www', 'garden', 'index.html'],
        ['www', 'index.html'],
        ['www', 'llms.txt']
    ];
    const read = (p) => readFileSync(join(process.cwd(), ...p), 'utf8');

    test('every count in the copy is the real number of species', async () => {
        const { SPECIES } = await import('../www/garden/js/species.js');
        const right = NUMBER_WORDS[SPECIES.length];
        expect(right).toBeTruthy();
        for (const path of FILES) {
            const text = read(path);
            // Any number word standing in front of "species", "trees" or
            // "tree", which is every shape this claim has taken so far.
            const claims = [...text.matchAll(
                new RegExp(`(${NUMBER_WORDS.join('|')}) (?:tree species|species|trees|tree)\\b`, 'gi'))]
                .map((m) => m[1].toLowerCase());
            for (const word of claims) {
                expect(`${path.join('/')}: ${word}`).toBe(`${path.join('/')}: ${right}`);
            }
        }
    });

    test('the copy has at least one such claim, so the sweep above is not empty', () => {
        // The failure mode of the test above is finding nothing and passing.
        const claims = FILES
            .map((p) => read(p).match(/seventeen (?:tree species|species|trees)/gi) || [])
            .flat();
        expect(claims.length).toBeGreaterThan(3);
    });

    test('every uniqueness claim in a species note is still true', async () => {
        // THE MODAL NOTE IS COPY THAT MAKES CLAIMS ABOUT DATA, which is the
        // worst combination this repo has: `refreshSelectionText` puts
        // `species.note` on screen the moment a visitor picks a tree, and
        // nothing connects the sentence to the schedule it describes. Three of
        // these were wrong when M6-1 read them. Each assertion below is the
        // fact one surviving sentence rests on.
        const { SPECIES, speciesById } = await import('../www/garden/js/species.js');
        const { phenologyAt } = await import('../www/garden/js/clock.js');
        const blooming = SPECIES.filter((s) => s.schedule && s.schedule.bloomFull != null);
        const fruiting = SPECIES.filter((s) => s.fruit);
        const inWrap = (h, a, b) => (a <= b ? h >= a && h <= b : h >= a || h <= b);

        // Dogwood: "the only one here that blossoms without going on to fruit."
        // It USED to say "the only tree here that blossoms", which stopped
        // being true the moment M11 gave five fruit trees a bloom schedule.
        expect(blooming.filter((s) => !s.fruit).map((s) => s.id)).toEqual(['flowering-dogwood']);

        // Lemon: "still holding fruit at the spring sunrise, which nothing
        // else here manages." Sunrise is hour 6. The orange comes close and
        // lets go at 2.5, which is why this one is worth pinning.
        const atSunrise = fruiting
            .filter((s) => inWrap(6, s.schedule.ripenEnd, s.schedule.holdEnd))
            .map((s) => s.id);
        expect(atSunrise).toEqual(['lemon']);

        // Orange: "the last of the orchard to ripen, and it holds its fruit
        // deep into the winter." Both halves, because the note now leans on
        // both. It previously claimed nothing else fruited at midwinter, and
        // the lemon does.
        const latest = fruiting.reduce((a, b) => (a.schedule.ripenEnd > b.schedule.ripenEnd ? a : b));
        expect(latest.id).toBe('orange');
        expect(inWrap(0, latest.schedule.ripenEnd, latest.schedule.holdEnd)).toBe(true);

        // Cherry: "flowers on bare branches before anything has leaves." Not a
        // uniqueness claim, but a claim about a NUMBER that lives elsewhere:
        // the canopy is 9 percent leafed at its bloom peak, and it is the
        // barest of any bloomer. The pear's deleted "first of the orchard into
        // flower" was the same shape and was simply wrong, the cherry being
        // a full hour ahead of it.
        const leafAtBloom = (s) => phenologyAt(s.schedule.bloomFull, !!s.evergreen).leaf;
        const barest = blooming.reduce((a, b) => (leafAtBloom(a) < leafAtBloom(b) ? a : b));
        expect(barest.id).toBe('cherry');
        expect(leafAtBloom(speciesById('cherry'))).toBeLessThan(0.15);
        const firstIntoFlower = fruiting
            .reduce((a, b) => (a.schedule.bloomStart < b.schedule.bloomStart ? a : b));
        expect(firstIntoFlower.id).toBe('cherry');
    });

    test('NOTHING OFFERS THE SLIDERS, because M16-2 deleted them', () => {
        // The data path survives (`resolveSpecies` still takes a custom object,
        // so old saved gardens come back), which is exactly why this is easy to
        // forget: nothing breaks, the copy just describes a control that is not
        // there. Comments are allowed to say "slider", since the record of WHY
        // the disclosure went lives in one, so this reads the copy only.
        // FILES lost www/js/directory.js on 2026-09-04 when the home page's
        // live search was removed, and its `blurb:` line went with it. The home
        // page's own card copy already said the same sentences, so the sweep
        // still covers every place a visitor could be offered a slider.
        const visible = [
            ...[...read(FILES[0]).matchAll(/content="([^"]*)"/g)].map((m) => m[1]),
            ...[...read(FILES[0]).matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]),
            ...[...read(FILES[1]).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]),
            read(FILES[2])
        ].join(' ');
        expect(visible).not.toMatch(/slider/i);
        expect(visible).not.toMatch(/shape your own/i);
        // And the sweep looked at something real.
        expect(visible).toMatch(/fractal trees/i);
    });
});

// ---- House style, which is M6-1's whole "done when" -------------------------
//
// "A read-through finds none of either" is a fine acceptance test for a human
// and no use at all six months later. These two are the standing version.
//
// THE TWO CHARACTERS NEED DIFFERENT TREATMENT, and getting that wrong is why
// this is not one sweep. An em-dash has NO legitimate home anywhere in this
// scene's JavaScript, not in a selector, an id, a GLSL literal or a class name,
// so it is checked over every string literal in every module with no filtering
// and no judgement calls. A semicolon is a different animal: it is syntax, it
// is CSS, and it ends every line of the shaders, so it can only be checked over
// copy that has been positively identified as copy.

describe('house style (M6-1)', () => {
    const GARDEN_JS = ['beds', 'clock', 'config', 'forest', 'garden', 'main',
        'precip', 'sky', 'species', 'terrain', 'tree', 'ui', 'view', 'vista',
        'weather', 'wildlife'];

    test('NO EM-DASH ANYWHERE, in copy or out of it', () => {
        // Zero tolerance is available here precisely because nothing else in a
        // JS file has any reason to hold one, which makes this the one house
        // rule that can be enforced without deciding what counts as prose.
        for (const name of GARDEN_JS) {
            const src = readFileSync(
                join(process.cwd(), 'www', 'garden', 'js', `${name}.js`), 'utf8');
            expect(`${name}.js: ${src.includes('—')}`).toBe(`${name}.js: false`);
        }
        const html = readFileSync(
            join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
        expect(html).not.toContain('—');
    });

    test('no semicolon in anything a visitor reads', async () => {
        // Imported one at a time rather than through Promise.all: these modules
        // share `config.min.js`, and racing four dynamic imports at it under
        // the ESM loader fails with "not in cache".
        const { SPECIES } = await import('../www/garden/js/species.js');
        const { HEALTH_WORDS } = await import('../www/garden/js/garden.js');
        const ui = await import('../www/garden/js/ui.js');
        const { fruitWords } = await import('../www/garden/js/clock.js');
        const copy = [
            ...SPECIES.flatMap((s) => [s.name, s.note, s.size, s.barkName]),
            ...Object.values(HEALTH_WORDS),
            ...[0, 1, 4, 17, 49].flatMap((n) => [
                ui.waterAllText(n).label, ui.waterAllText(n).aria, ui.resetPrompt(n)]),
            ...['none', 'bloom', 'set', 'swell', 'ripe', 'hold', 'drop']
                .map((stage) => fruitWords(stage)),
            ...[true, false, null].map((flight) => ui.lakeNote(flight))
        ].filter((s) => typeof s === 'string');
        // The sweep has to have swept something. A filter that quietly returns
        // nothing is the failure mode of every test in this file that reads
        // from somewhere else.
        expect(copy.length).toBeGreaterThan(80);
        for (const line of copy) {
            expect(`${JSON.stringify(line)} clean`).toBe(`${JSON.stringify(line)} clean`.replace(/;/g, ''));
        }

        // And the page's own visible text, with markup and entities removed so
        // the `&times;` on the close buttons is not read as a semicolon.
        const html = readFileSync(
            join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
        const visible = [
            ...[...html.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]),
            ...[...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map((m) => m[1]),
            ...html.replace(/<[^>]+>/g, '\n').split('\n')
        ].map((s) => s.replace(/&[a-z]+;/g, ' ').trim()).filter((s) => /[a-z]/.test(s));
        expect(visible.length).toBeGreaterThan(40);
        for (const line of visible) expect(line).not.toContain(';');
    });
});

// ---- The social card (M6-2, M6-3) ------------------------------------------
//
// The same block highwater carries, for the same reason: a share preview is
// written once, never looked at again, and quietly rots. Everything here is a
// claim about a FILE ON DISK or about a tag that a scraper caches, which is the
// kind of mistake that cannot be fixed by editing the page later.

describe('the social card', () => {
    const BASE = 'https://www.scenexp.com/garden/';
    const html = readFileSync(
        join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    const meta = (key) => {
        const attr = key.startsWith('og:') ? 'property' : 'name';
        const m = html.match(
            new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
        return m && m[1];
    };

    test('NO ROBOTS TAG AT ALL, which is what M6-4 asks for', () => {
        // The M0-1 `noindex, nofollow` was a scaffold, and its own comment
        // predicted the failure: "if this line survives to launch, the page
        // will be invisible to search and nobody will notice for weeks."
        // Nothing replaces it. The site default is indexable, robots.txt says
        // Allow: /, and no other experience carries a robots tag.
        // Comments stripped, so a future note explaining that the tag is gone
        // on purpose does not fail the test that keeps it gone.
        const markup = html.replace(/<!--[\s\S]*?-->/g, '');
        expect(markup).not.toMatch(/<meta\s+name="robots"/i);
        expect(markup).not.toMatch(/noindex/i);
        // The sitemap and llms.txt invite crawlers here, so this is the tag
        // that decides whether that invitation means anything.
        const sitemap = readFileSync(
            join(process.cwd(), 'www', 'sitemap.xml'), 'utf8');
        expect(sitemap).toContain('https://www.scenexp.com/garden/');
    });

    test('EXACTLY ONE og:image, because Apple renders every one it finds', () => {
        // Two og:image tags put two identical cards in a friend's message
        // thread. earthdefense shipped that once, and the tempting mistake here
        // is adding the JPEG as a "fallback" underneath the WebP.
        expect(html.match(/<meta property="og:image"/g) || []).toHaveLength(1);
    });

    test('the card is the WebP, at the size every renderer expects', () => {
        expect(meta('og:image')).toBe(`${BASE}assets/og-garden.webp?v=3`);
        expect(meta('og:image:type')).toBe('image/webp');
        expect(meta('og:image:width')).toBe('1200');
        expect(meta('og:image:height')).toBe('630');
        // Both blocks name the same file, so a cache-busting bump applied to
        // one of the two cannot go unnoticed until a share looks stale.
        expect(meta('twitter:image')).toBe(meta('og:image'));
    });

    test('both files exist, and BOTH ARE THE SIZE THEY CLAIM TO BE', () => {
        // The assertion that would actually have caught something. The tags
        // above are hand-typed numbers, and the image is built by a command run
        // once, months before anybody looks at a preview.
        const dir = join(process.cwd(), 'www', 'garden', 'assets');
        for (const name of ['og-garden.webp', 'og-garden.jpg']) {
            const bytes = readFileSync(join(dir, name));
            expect(`${name}: ${bytes.length > 0}`).toBe(`${name}: true`);
        }
        // WebP: 'VP8 ' | 'VP8L' | 'VP8X' after the RIFF/WEBP header. The lossy
        // 'VP8 ' frame header carries width and height as 14-bit fields.
        const webp = readFileSync(join(dir, 'og-garden.webp'));
        expect(webp.slice(0, 4).toString('latin1')).toBe('RIFF');
        expect(webp.slice(8, 12).toString('latin1')).toBe('WEBP');
        expect(webp.slice(12, 16).toString('latin1')).toBe('VP8 ');
        expect(webp.readUInt16LE(26) & 0x3fff).toBe(1200);
        expect(webp.readUInt16LE(28) & 0x3fff).toBe(630);

        // JPEG: walk the segment markers to the SOF, which is where the real
        // dimensions live. Reading them from anywhere else reads a thumbnail.
        const jpg = readFileSync(join(dir, 'og-garden.jpg'));
        expect(jpg.readUInt16BE(0)).toBe(0xffd8);
        let i = 2;
        let size = null;
        while (i < jpg.length - 9) {
            if (jpg[i] !== 0xff) { i += 1; continue; }
            const marker = jpg[i + 1];
            // SOF0/1/2/9/10, skipping DHT, DAC and the restart markers.
            if (marker >= 0xc0 && marker <= 0xcf
                && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                size = { h: jpg.readUInt16BE(i + 5), w: jpg.readUInt16BE(i + 7) };
                break;
            }
            i += 2 + jpg.readUInt16BE(i + 2);
        }
        expect(size).toEqual({ w: 1200, h: 630 });
    });

    test('alt text is present, real, and matches between the two blocks', () => {
        // A share preview is often the only thing a screen reader user gets.
        const alt = meta('og:image:alt');
        expect(alt).toBeTruthy();
        expect(alt.length).toBeGreaterThan(60);
        expect(meta('twitter:image:alt')).toBe(alt);
        // House style applies to it, and it is long enough to attract both.
        expect(alt).not.toMatch(/[—;]/);
    });
});
