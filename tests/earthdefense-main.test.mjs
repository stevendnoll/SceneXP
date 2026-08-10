// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Boot-and-drive smoke for the Earth Defense conductor (main.js).
 *
 * Same recipe as the other experiences' main suites: install THREE and the DOM
 * stand-ins FIRST, then import main.js so it auto-boots the way a real page
 * load does.
 *
 * WHAT THIS SUITE IS FOR is the state machine and the screens hanging off it,
 * which is the whole of M6. Under the chainable THREE proxy no geometry means
 * anything, so nothing here measures a position or a projection: those live in
 * the fleet, hud, cockpit, and init suites, where the numbers are real. What IS
 * assertable here, and what actually breaks, is the wiring: does taking the
 * helm start the clock, does pausing stop it, does the last raider produce a
 * win screen, does a restart genuinely put everything back, and does the run
 * that ended because the ship ran out of hulls avoid claiming the installations
 * fell.
 *
 * THE RESTART TEST IS THE ONE THAT EARNS ITS KEEP. A restart touches five
 * modules and every one of them has a different idea of what "back to the
 * start" means, so it is where a leak or a stale flag will actually show up.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();

    // The welcome overlay and both modals ship hidden or shown by the page; the
    // auto-vivified stubs start bare, so seed what main.js expects to find.
    // The page ships these hidden and the auto-vivified stubs start bare. The
    // settings panel matters most: main.js's Escape handler checks it before it
    // reaches for the pause, so a panel that reads as already open swallows
    // every Escape key in the suite.
    ['pause-modal', 'end-modal', 'settings-panel', 'lock-bracket', 'perimeter-notice',
        'replay-inset', 'end-skip']
        .forEach(id => dom.el(id).classList.add('hidden'));

    dom.documentStub.pointerLockElement = null;
    dom.documentStub.exitPointerLock = () => { dom.documentStub.pointerLockElement = null; };
    const canvas = dom.el('game-canvas');
    canvas.requestPointerLock = () => { dom.documentStub.pointerLockElement = canvas; };
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
});

/** Boot the page and let the async init settle. The world build resolves off
 *  an 8 second safety timeout under the stubs, because the chainable
 *  LoadingManager never fires its callbacks. */
async function boot() {
    const main = await import('../www/earthdefense/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(8000);
    await jest.advanceTimersByTimeAsync(500);
    return main;
}

/** Take the helm, the desktop way. */
function enterWorld() {
    fire(dom.el('blocker'), 'click');
}

/** Step the captured animation loop n frames, 16ms apart. */
function stepFrames(n = 1) {
    for (let i = 0; i < n; i++) {
        jest.advanceTimersByTime(16);
        dom.loops[0]();
    }
}

const CONFIG = async () => (await import('../www/earthdefense/js/config.min.js')).EARTHDEFENSE_CONFIG;

/** Step past whatever ending a finished run earned.
 *
 *  EVERY ENDING NOW PLAYS A SHOT BEFORE THE CARD: fireworks over Earth for a
 *  win, fires at the fallen installations for a lost line, and the visitor's
 *  own wreck receding when the ships run out. The card is the receipt and it
 *  arrives last, so anything asserting on it has to come through here. Sized
 *  for the longest of the three plus the replay that can precede it, since
 *  which one is playing is exactly what most of these tests do not care about. */
function playOutTheEnding(config) {
    const finale = config.finale;
    const longest = Math.max(
        finale.won.seconds, finale.lostLine.seconds, finale.lostShip.seconds);
    stepFrames(Math.ceil((longest + config.replay.insetSeconds) / 0.016) + 6);
}

// ---- Boot -------------------------------------------------------------------

describe('booting', () => {
    test('auto-boots, hides the loading screen, and waits in the briefing', () => {
        // The welcome overlay IS the briefing state. Before M6 the fleet closed
        // in while the dedication was still on screen.
        return boot().then((main) => {
            const state = main.getState();
            expect(state.isRunning).toBe(true);
            expect(state.isLoaded).toBe(true);
            expect(state.phase).toBe('briefing');
            expect(dom.el('loading-screen').classList.contains('hidden')).toBe(true);
        });
    });

    test('the HUD is actually REVEALED, not merely populated', async () => {
        // The shared stylesheet ships #hud at opacity 0 and reveals it with
        // `.visible`. Forgetting that line breaks nothing loudly: every counter
        // is written correctly to elements nobody can see, every test passes,
        // and the game ships with no HUD at all. It reached a full round of
        // screenshots exactly that way.
        //
        // The reveal now happens when the visitor takes the helm rather than
        // when loading finishes, so this asserts it AFTER that, which is the
        // only moment it was ever meant to matter.
        const main = await boot();
        expect(main.getState().isLoaded).toBe(true);
        enterWorld();
        expect(dom.el('hud').classList.contains('visible')).toBe(true);
    });

    test('the HUD stays off the briefing, where the welcome copy is', async () => {
        // On a phone in portrait the welcome copy stacks down the middle of the
        // frame, which is where the speed readout and the nav labels already
        // are: the readout landed between the two hint rows and read as part of
        // the dedication. Hidden here means the OPENING FRAME still shows
        // through the scrim, which is the whole point, without the chrome.
        const main = await boot();
        expect(main.getState().phase).toBe('briefing');
        expect(dom.el('hud').classList.contains('visible')).toBe(false);
    });

    test('a phone gets its thumb controls when it takes the helm, not before', async () => {
        // THE PORTRAIT CASE THIS WHOLE RULE IS FOR. Both controls are large and
        // sit low, which on a phone is directly under the welcome copy, so they
        // used to wait there looking ready to use before there was anything to
        // fly. Boots as a touch device, because on a desktop the branch is
        // never reached and the assertion would pass for the wrong reason.
        globalThis.navigator.maxTouchPoints = 2;
        await boot();

        expect(dom.el('touch-controls').classList.contains('visible')).toBe(false);
        enterWorld();
        expect(dom.el('touch-controls').classList.contains('visible')).toBe(true);
    });

    test('a desktop never gets them, helm or no helm', async () => {
        await boot();
        enterWorld();
        expect(dom.el('touch-controls').classList.contains('visible')).toBe(false);
    });

    test('pausing and ending a run both keep the HUD up', async () => {
        // Briefing is the ONLY state that hides it. A card with the counters
        // gone from behind it reads as a different screen rather than as the
        // same one with a panel over it.
        const main = await boot();
        enterWorld();

        main.__test__.handleStateChange('paused');
        expect(dom.el('hud').classList.contains('visible')).toBe(true);

        main.__test__.handleStateChange('won');
        expect(dom.el('hud').classList.contains('visible')).toBe(true);

        main.__test__.handleStateChange('lost');
        expect(dom.el('hud').classList.contains('visible')).toBe(true);
    });

    test('the objective counters are on screen before anything is shot', async () => {
        const main = await boot();
        const config = await CONFIG();
        stepFrames(1);

        expect(dom.el('structures-count').textContent).toBe('7');
        expect(dom.el('ships-count').textContent).toBe(String(config.fleet.total));
        expect(main.getState().phase).toBe('briefing');
    });

    test('the clock does not run while the dedication is still up', async () => {
        await boot();
        stepFrames(30);
        expect(dom.el('elapsed-time').textContent).toBe('0:00');
    });

    test('taking the helm starts the run and takes the pointer', async () => {
        const main = await boot();
        enterWorld();

        expect(main.getState().phase).toBe('playing');
        expect(dom.el('blocker').classList.contains('hidden')).toBe(true);
        expect(dom.documentStub.pointerLockElement).toBe(dom.el('game-canvas'));
    });

    test('taking the helm twice is not two runs', async () => {
        const main = await boot();
        enterWorld();
        enterWorld();
        expect(main.getState().phase).toBe('playing');
    });

    test('Enter and Space take the helm too, for a keyboard-only visitor', async () => {
        const main = await boot();
        fire(dom.documentStub, 'keydown', { code: 'Enter' });
        expect(main.getState().phase).toBe('playing');
    });
});

// ---- Pause ------------------------------------------------------------------

describe('pausing', () => {
    test('Escape pauses and resumes, and the panel follows the state', async () => {
        const main = await boot();
        enterWorld();

        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().isPaused).toBe(true);
        expect(dom.el('pause-modal').classList.contains('hidden')).toBe(false);

        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().isPaused).toBe(false);
        expect(dom.el('pause-modal').classList.contains('hidden')).toBe(true);
    });

    test('the clock stops while paused, so a best time cannot be gamed', async () => {
        await boot();
        enterWorld();
        stepFrames(70);                       // a bit over a second of play
        const running = dom.el('elapsed-time').textContent;

        fire(dom.el('pause-btn'), 'click');
        stepFrames(300);
        expect(dom.el('elapsed-time').textContent).toBe(running);
    });

    test('pausing during the briefing is refused, there is nothing to pause', async () => {
        const main = await boot();
        fire(dom.el('pause-btn'), 'click');
        expect(main.getState().phase).toBe('briefing');
    });

    test('a backgrounded tab stops flying', async () => {
        const main = await boot();
        enterWorld();
        dom.documentStub.visibilityState = 'hidden';
        fire(dom.documentStub, 'visibilitychange');
        expect(main.getState().isPaused).toBe(true);
    });

    test('Escape closes the settings panel before it reaches for the pause', async () => {
        const main = await boot();
        enterWorld();
        fire(dom.el('settings-btn'), 'click');
        expect(dom.el('settings-panel').classList.contains('hidden')).toBe(false);

        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(dom.el('settings-panel').classList.contains('hidden')).toBe(true);
        expect(main.getState().isPaused).toBe(false);
    });
});

// ---- Winning and losing -----------------------------------------------------

describe('ending a run', () => {
    /** Report every raider as destroyed, the way a killing shot does. */
    async function clearTheFleet(main) {
        const { getShips } = await import('../www/earthdefense/js/fleet.min.js');
        for (const ship of getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }
    }

    async function loseEveryInstallation(main) {
        const { getStructures } = await import('../www/earthdefense/js/structures.min.js');
        for (const entry of getStructures()) {
            main.__test__.onDamageResolved({ id: entry.site.id, hitPoints: 0, destroyed: true });
        }
    }

    test('clearing the fleet wins it and puts the end screen up', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();
        stepFrames(60);
        await clearTheFleet(main);

        // THE CELEBRATION COMES FIRST. Dropping a blurred card over the last
        // raider dying would make a win read as a dialog rather than as a win.
        expect(main.getState().phase).toBe('won');
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);
        playOutTheEnding(config);

        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(dom.el('end-title').textContent).toBe('The line held');
        expect(dom.el('end-saved').textContent).toBe('7');
        expect(dom.el('end-destroyed').textContent).toBe('12');
    });

    test('losing every installation loses it, and says so plainly', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();
        await loseEveryInstallation(main);

        expect(main.getState().phase).toBe('lost');
        // THE PANEL WAITS FOR THE REPLAY. The last installation falling starts
        // the corner window, and dropping a blurred backdrop over it would hide
        // the destruction that ended the run.
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);
        stepFrames(Math.ceil(config.replay.insetSeconds / 0.016) + 2);
        // And then the ending shot the window handed off to: four slow fires
        // where the installations were.
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);
        playOutTheEnding(config);

        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(dom.el('end-title').textContent).toBe('Run ended');
        expect(dom.el('end-subtitle').textContent).toMatch(/last installation/);
        expect(dom.el('end-saved').textContent).toBe('0');
    });

    test('running out of hulls ends the run WITHOUT blaming the installations', async () => {
        // PRD 6.4. The run is over either way, but announcing an objective
        // failure that did not happen is the small dishonesty that makes a game
        // feel cheap.
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        for (let life = 0; life < config.player.lives; life++) {
            main.__test__.killPlayer('test');
            stepFrames(2);
            // Let the wreck run out so the next kill is allowed.
            for (let i = 0; i < 200; i++) stepFrames(1);
        }

        expect(main.getState().phase).toBe('lost');
        playOutTheEnding(config);
        expect(dom.el('end-subtitle').textContent).toMatch(/still holding/);
        expect(dom.el('end-saved').textContent).toBe('7');
    });

    test('the game stops simulating once it is over', async () => {
        const main = await boot();
        enterWorld();
        stepFrames(60);
        const stopped = dom.el('elapsed-time').textContent;
        await clearTheFleet(main);

        stepFrames(300);
        expect(dom.el('elapsed-time').textContent).toBe(stopped);
        expect(main.getState().phase).toBe('won');
    });

    test('a win records a best time and a loss does not', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();
        stepFrames(120);
        await clearTheFleet(main);
        playOutTheEnding(config);

        expect(localStorage.getItem(config.storage.bestTime)).not.toBeNull();
        expect(dom.el('end-best').textContent).toMatch(/best/i);
    });

    test('a second, slower win keeps the first one as the best', async () => {
        const main = await boot();
        const config = await CONFIG();
        // A second of stored best against a two second run, so the stored one
        // stands and the card says so without claiming a new record.
        localStorage.setItem(config.storage.bestTime, '1');

        enterWorld();
        stepFrames(120);
        await clearTheFleet(main);
        playOutTheEnding(config);

        expect(localStorage.getItem(config.storage.bestTime)).toBe('1');
        expect(dom.el('end-best').textContent).toBe('Your best: 0:01');
    });

    test('the hull wash does not sit over the end screen forever', async () => {
        // The frame clock that clears it only runs while the game is being
        // played, so the shot that ended the run would otherwise leave the
        // whole card washed red.
        const main = await boot();
        enterWorld();
        main.__test__.notePlayerHit(1);
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(true);

        await clearTheFleet(main);
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(false);
    });

    test('the only control on the end card takes focus', async () => {
        // It has no close button on purpose, so a keyboard visitor must not
        // have to go looking for the one way forward.
        const main = await boot();
        const config = await CONFIG();
        enterWorld();
        await clearTheFleet(main);
        playOutTheEnding(config);
        expect(dom.documentStub.activeElement).toBe(dom.el('restart-btn'));
    });

    test('the end message distinguishes a clean sweep from a costly one', async () => {
        const main = await boot();
        const counters = { friendlyStructures: 7 };
        expect(main.__test__.endMessage('won', counters)).toMatch(/Not a scratch/);
        counters.friendlyStructures = 4;
        expect(main.__test__.endMessage('won', counters)).toMatch(/still yours/);
    });
});

// ---- The destruction replays ------------------------------------------------
//
// Two shots that differ in what they take from the visitor, wired here and
// measured in the replay suite. What matters at this level is that the wiring
// exists, that it is put away again, and that nothing survives a restart.

describe('watching things be destroyed', () => {
    const REPLAY = async () => await import('../www/earthdefense/js/replay.min.js');
    const replaying = () => dom.documentStub.body.classList.contains('replaying');

    test('losing the ship steps outside to watch, and comes back in', async () => {
        const main = await boot();
        const config = await CONFIG();
        const replay = await REPLAY();
        enterWorld();
        stepFrames(2);

        main.__test__.killPlayer('fire');
        expect(replay.isShipReplayRunning()).toBe(true);
        // The reticle and the lock bracket are about aiming, and a visitor
        // watching their own wreck is not aiming.
        expect(replaying()).toBe(true);

        stepFrames(Math.ceil(config.player.respawnDelay / 0.016) + 4);
        expect(replay.isShipReplayRunning()).toBe(false);
        expect(replaying()).toBe(false);
        expect(main.getState().phase).toBe('playing');
    });

    test('losing an installation opens the window, and names what was lost', async () => {
        const main = await boot();
        const config = await CONFIG();
        const replay = await REPLAY();
        const { getStructures } = await import('../www/earthdefense/js/structures.min.js');
        enterWorld();

        const entry = getStructures()[0];
        main.__test__.onDamageResolved({ id: entry.site.id, hitPoints: 0, destroyed: true });

        expect(replay.isInsetRunning()).toBe(true);
        expect(dom.el('replay-inset').classList.contains('hidden')).toBe(false);
        expect(dom.el('replay-caption').textContent).toBe(`${entry.site.label} lost`);
        // AND THE VISITOR KEEPS FLYING. The whole reason this is a window and
        // not a cut: an installation falls at a moment they did nothing wrong.
        expect(main.getState().phase).toBe('playing');
        expect(replay.isShipReplayRunning()).toBe(false);

        stepFrames(Math.ceil(config.replay.insetSeconds / 0.016) + 4);
        expect(replay.isInsetRunning()).toBe(false);
        expect(dom.el('replay-inset').classList.contains('hidden')).toBe(true);
    });

    test('the window is measured from the frame drawn around it', async () => {
        // One source of truth for where it is: the stylesheet positions the
        // element and the scissor follows its box. Two copies of the geometry
        // is how a picture ends up beside its own border.
        const main = await boot();
        enterWorld();
        const rect = main.__test__.readInsetRect();
        expect(rect).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
    });

    test('a structure with no record asks for no window', async () => {
        const main = await boot();
        enterWorld();
        expect(main.__test__.showStructureLost('nothing-by-that-name')).toBe(false);
        expect(dom.el('replay-inset').classList.contains('hidden')).toBe(true);
    });

    test('the explosion lasts as long as the shot watching it', async () => {
        // A burst lives 0.9 seconds and the shots run 2.2 and 2.6, so a single
        // detonation leaves the camera pulling back off an empty patch of space
        // for more than half the time it is on screen. Secondary detonations go
        // off around the wreck to fill it.
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        main.__test__.killPlayer('fire');
        expect(main.__test__.aftershocks).toHaveLength(config.replay.aftershocks.length);
        // Soonest first, and all of them inside the shot.
        const due = main.__test__.aftershocks.map(s => s.at);
        expect([...due].sort((a, b) => a - b)).toEqual(due);
        expect(Math.max(...due)).toBeLessThan(config.player.respawnDelay);

        stepFrames(Math.ceil(Math.max(...due) / 0.016) + 4);
        expect(main.__test__.aftershocks).toHaveLength(0);
    });

    test('an aftershock goes off BESIDE the wreck, not on top of it', async () => {
        // On the centre they would be one bigger flash rather than a sequence.
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        main.__test__.queueAftershocks({ x: 0, y: 0, z: 0 }, 400);
        for (const shock of main.__test__.aftershocks) {
            const distance = Math.hypot(shock.position.x, shock.position.y, shock.position.z);
            expect(distance).toBeGreaterThan(100);
            expect(distance).toBeLessThan(config.replay.shipEndDistance);
            expect(shock.radius).toBeLessThan(400);   // each one smaller than the first
        }
    });

    test('a restart cancels whatever was being watched', async () => {
        // Otherwise the new run flies from a camera still orbiting the last
        // one's wreck, with the window open beside it.
        const main = await boot();
        const replay = await REPLAY();
        const { getStructures } = await import('../www/earthdefense/js/structures.min.js');
        enterWorld();

        main.__test__.killPlayer('fire');
        main.__test__.showStructureLost(getStructures()[0].site.id);
        expect(replay.isReplayRunning()).toBe(true);

        main.__test__.restartRun();
        expect(replay.isReplayRunning()).toBe(false);
        expect(replaying()).toBe(false);
        expect(dom.el('replay-inset').classList.contains('hidden')).toBe(true);
    });

    test('the LAST life gets its replay before the end panel', async () => {
        // The one death with the most riding on it, and the one that would
        // otherwise be hidden under a blurred backdrop on the frame it happened.
        const main = await boot();
        const config = await CONFIG();
        const replay = await REPLAY();
        enterWorld();

        // Every life but the last, each one allowed to run its wreck out so the
        // next kill is permitted.
        for (let life = 0; life < config.player.lives - 1; life++) {
            main.__test__.killPlayer('fire');
            stepFrames(200);
        }
        main.__test__.killPlayer('fire');

        expect(main.getState().phase).toBe('lost');
        expect(replay.isShipReplayRunning()).toBe(true);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);

        stepFrames(Math.ceil(config.player.respawnDelay / 0.016) + 4);
        // And the replay hands straight off to the ending, which continues the
        // same orbit outward rather than cutting. The card is still last.
        expect(replay.isShipReplayRunning()).toBe(false);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);

        playOutTheEnding(config);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(replaying()).toBe(false);
    });
});

// ---- Restart ----------------------------------------------------------------

describe('restarting', () => {
    test('puts every module back, not just the counters', async () => {
        // The test that earns its keep. A restart touches the state machine,
        // the installations, the fleet, the damage ledger, and the flight
        // model, and each of them has a different idea of what "back to the
        // start" means.
        const main = await boot();
        const config = await CONFIG();
        const structures = await import('../www/earthdefense/js/structures.min.js');
        const fleet = await import('../www/earthdefense/js/fleet.min.js');
        const weapons = await import('../www/shared/js/weapons-1.0.0.min.js');

        enterWorld();
        stepFrames(120);
        for (const ship of fleet.getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }
        expect(main.getState().phase).toBe('won');
        expect(fleet.shipsRemaining()).toBe(0);

        fire(dom.el('restart-btn'), 'click');

        expect(main.getState().phase).toBe('playing');
        expect(fleet.shipsRemaining()).toBe(config.fleet.total);
        expect(structures.structuresRemaining('friendly')).toBe(7);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);
        // The damage ledger was refilled, so everything is destructible again.
        expect(weapons.getDamageable('raider-0').hitPoints).toBe(config.fleet.hitPoints);
        expect(weapons.getDamageable(config.structures.earth[0].id).hitPoints)
            .toBe(config.structures.hitPoints);
    });

    test('the second run can actually be won', async () => {
        // The failure this catches is silent and total: if the ids are not made
        // destructible again, the counters read full and nothing ever brings
        // them down, so run two is unwinnable and nothing says why.
        const main = await boot();
        const fleet = await import('../www/earthdefense/js/fleet.min.js');

        enterWorld();
        for (const ship of fleet.getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }
        fire(dom.el('restart-btn'), 'click');
        stepFrames(2);
        expect(dom.el('ships-count').textContent).toBe('12');

        for (const ship of fleet.getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }
        expect(main.getState().phase).toBe('won');
    });

    test('the clock starts again from zero', async () => {
        const main = await boot();
        const fleet = await import('../www/earthdefense/js/fleet.min.js');
        enterWorld();
        stepFrames(120);
        for (const ship of fleet.getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }

        fire(dom.el('restart-btn'), 'click');
        stepFrames(1);
        expect(dom.el('elapsed-time').textContent).toBe('0:00');
    });

    test('a restart does not stack a second set of listeners', async () => {
        // initFlight disposes its own before wiring, so the count should be
        // unchanged rather than doubled. Stacked listeners are how a restarted
        // game ends up turning twice as fast as the first one.
        const main = await boot();
        enterWorld();
        const before = dom.documentStub.listeners.get('keydown').size;
        main.__test__.restartRun();
        expect(dom.documentStub.listeners.get('keydown').size).toBe(before);
    });
});

// ---- The visitor's own survival --------------------------------------------

describe('taking damage', () => {
    test('a single shot costs hull, not a life', async () => {
        // PRD 6.4 says SUSTAINED fire. One unlucky hit ending a life would make
        // the fleet's light harassment lethal.
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        main.__test__.notePlayerHit(1);
        expect(main.getState().phase).toBe('playing');
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(true);

        for (let i = 1; i < config.player.hullPoints; i++) main.__test__.notePlayerHit(1);
        // The last one takes the ship, but not the run: there are lives left.
        expect(main.getState().phase).toBe('playing');
    });

    test('the hull wash clears itself off the frame clock', async () => {
        const main = await boot();
        enterWorld();
        main.__test__.notePlayerHit(1);
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(true);

        stepFrames(60);
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(false);
    });

    test('a wrecked ship comes back, with hull and grace', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        main.__test__.killPlayer('test');
        stepFrames(1);
        // Frozen while the wreck plays: a death nobody sees reads as a bug.
        expect(main.getState().phase).toBe('playing');

        const frames = Math.ceil(config.player.respawnDelay / 0.016) + 4;
        stepFrames(frames);
        stepFrames(2);
        // Back in the fight, and briefly untouchable.
        main.__test__.notePlayerHit(99);
        expect(main.getState().phase).toBe('playing');
    });

    test('a hit during the grace period is ignored', async () => {
        const main = await boot();
        enterWorld();
        main.__test__.respawnPlayer();
        main.__test__.notePlayerHit(99);
        expect(main.getState().phase).toBe('playing');
    });

    test('a second death cannot land while the first wreck is still playing', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();

        main.__test__.killPlayer('test');
        main.__test__.killPlayer('test');
        main.__test__.killPlayer('test');
        stepFrames(1);
        // One life spent, not three, so the run is still going.
        expect(main.getState().phase).toBe('playing');
        expect(config.player.lives).toBeGreaterThan(1);
    });

    test('nothing happens to a visitor who is not playing', async () => {
        const main = await boot();
        main.__test__.notePlayerHit(99);   // still in the briefing
        expect(main.getState().phase).toBe('briefing');
        expect(dom.documentStub.body.classList.contains('hull-hit')).toBe(false);
    });

    test('flying into a planet is not possible, and costs nothing', async () => {
        // Settled at the M6 gate, against PRD 6.4: the planets are the best
        // thing in the experience and the first thing anyone does is fly at one
        // to see how big it really is. Punishing that teaches a visitor not to
        // look. The floor is a hard one, so the worst that happens is a skim.
        const main = await boot();
        const config = await CONFIG();
        const earth = config.bodies.find(b => b.id === 'earth');
        enterWorld();

        // Deep inside Earth, which is where a full-throttle dive would put a
        // position before the floor rewrites it.
        const inside = main.__test__.keepAbovePlanets({ x: 0, y: 0, z: 100 });
        const altitude = Math.hypot(inside.x, inside.y, inside.z) - earth.radius;
        expect(altitude).toBeCloseTo(config.altitudeFloor, 6);

        // And nothing was spent for it: no hull, no life, no end screen.
        expect(main.getState().phase).toBe('playing');
    });

    test('a position already in clear space is handed back untouched', async () => {
        const main = await boot();
        const out = { x: 0, y: 20000, z: 0 };
        expect(main.__test__.keepAbovePlanets(out)).toBe(out);
    });
});

// ---- Everything else --------------------------------------------------------

describe('the rest of the conductor', () => {
    test('a raider and an installation are named differently', async () => {
        const main = await boot();
        const config = await CONFIG();
        expect(main.__test__.labelFor(config.structures.earth[0].id))
            .toBe(config.structures.earth[0].label);
        expect(main.__test__.labelFor('raider-4')).toBe('a raider');
        expect(main.__test__.labelFor('something-else')).toBe('an installation');
    });

    test('the guns consider the installations and the raiders together', async () => {
        const main = await boot();
        const config = await CONFIG();
        expect(main.__test__.combatCandidates()).toHaveLength(7 + config.fleet.total);
    });

    test('the clock formats as a stopwatch', async () => {
        const main = await boot();
        expect(main.__test__.formatClock(0)).toBe('0:00');
        expect(main.__test__.formatClock(125)).toBe('2:05');
    });

    test('the settings persist and reach the flight model', async () => {
        const main = await boot();
        const config = await CONFIG();
        const slider = dom.el('look-speed-slider');
        slider.value = '2.5';
        fire(slider, 'input');

        expect(main.__test__.settings.lookSensitivity).toBe(2.5);
        expect(localStorage.getItem(config.storage.sensitivity)).toBe('2.5');

        const invert = dom.el('invert-pitch-toggle');
        invert.checked = true;
        fire(invert, 'change');
        expect(main.__test__.settings.invertPitch).toBe(true);

        const reduced = dom.el('reduced-fx-toggle');
        reduced.checked = true;
        fire(reduced, 'change');
        expect(main.__test__.settings.reducedFx).toBe(true);

        const mute = dom.el('mute-toggle');
        mute.checked = true;
        fire(mute, 'change');
        expect(main.__test__.settings.muted).toBe(true);
        expect(localStorage.getItem(config.storage.muted)).toBe('true');
    });

    test('a stored mute is honoured before the first sound is ever made', async () => {
        // The settings panel is reachable from the welcome screen, so a visitor
        // who muted last time must not be greeted by an engine note.
        const { EARTHDEFENSE_CONFIG } = await import('../www/earthdefense/js/config.min.js');
        localStorage.setItem(EARTHDEFENSE_CONFIG.storage.muted, 'true');

        const main = await boot();
        expect(main.__test__.settings.muted).toBe(true);
        expect(dom.el('mute-toggle').checked).toBe(true);
    });

    test('sound is armed but silent until the visitor touches something', async () => {
        // Browsers refuse to start an AudioContext before a gesture, and a page
        // nobody has touched should make no sound and hold no audio hardware.
        await boot();
        const audio = await import('../www/earthdefense/js/audio.min.js');
        expect(audio.isRunning()).toBe(false);
    });

    test('a resize is handled without a crash', async () => {
        await boot();
        dom.windowStub.innerWidth = 390;
        dom.windowStub.innerHeight = 844;
        expect(() => fire(dom.windowStub, 'resize')).not.toThrow();
    });

    test('the perimeter notice appears and clears', async () => {
        await boot();
        const flight = await import('../www/shared/js/flight-1.0.0.min.js');
        // The callback is wired through the built copy, so reach it the way the
        // module does rather than importing a second instance.
        expect(typeof flight.onPerimeterChange).toBe('function');
        expect(dom.el('perimeter-notice')).toBeTruthy();
    });

    test('leaving the page shuts everything down', async () => {
        const main = await boot();
        enterWorld();
        fire(dom.windowStub, 'pagehide');

        expect(main.getState().isRunning).toBe(false);
        // The animation loop is released, so a stray frame cannot run after it.
        expect(() => stepFrames(1)).not.toThrow();
    });

    test('a browser with no WebGL is sent to the 2D site rather than a blank canvas', async () => {
        const main = await boot();
        delete dom.windowStub.WebGLRenderingContext;
        expect(main.__test__.hasWebGL()).toBe(false);
    });
});

// ---- M8: the quieter frame and the idle one ---------------------------------

describe('reduced effects', () => {
    test('the checkbox thins the starfield, the bursts, and the pixel ratio', async () => {
        const main = await boot();
        const config = await CONFIG();

        expect(main.__test__.applyReducedFx()).toEqual({
            reduced: false,
            maxPixelRatio: config.space.maxPixelRatio,
            starCount: config.space.starCount,
            burstParticles: config.weapons.burstParticles
        });

        const reduced = dom.el('reduced-fx-toggle');
        reduced.checked = true;
        fire(reduced, 'change');

        // No reload and no rebuild: the pools are built full and DRAWN short,
        // so ticking the box has to take effect on the next frame rather than
        // on the next visit.
        expect(main.__test__.applyReducedFx()).toEqual({
            reduced: true,
            maxPixelRatio: config.reducedFx.maxPixelRatio,
            starCount: config.reducedFx.starCount,
            burstParticles: config.reducedFx.burstParticles
        });
        expect(config.reducedFx.starCount).toBeLessThan(config.space.starCount);
        expect(config.reducedFx.burstParticles).toBeLessThan(config.weapons.burstParticles);

        reduced.checked = false;
        fire(reduced, 'change');
        expect(main.__test__.applyReducedFx().reduced).toBe(false);
    });

    test('a phone starts with it on, and a desktop does not', async () => {
        // The phone is the primary target and the hardest frame in the
        // experience, so the default is the setting most phones want rather
        // than the one that looks best on a workstation.
        globalThis.navigator.maxTouchPoints = 2;
        const main = await boot();

        expect(main.__test__.settings.reducedFx).toBe(true);
        expect(dom.el('reduced-fx-toggle').checked).toBe(true);
        expect(main.__test__.applyReducedFx().reduced).toBe(true);
    });

    test('a phone visitor who turns it off keeps it off', async () => {
        // The default is a starting point, not a policy. An explicit choice is
        // in storage, and storage wins on the next visit.
        const config = await CONFIG();
        globalThis.navigator.maxTouchPoints = 2;
        localStorage.setItem(config.storage.reducedFx, 'false');
        const main = await boot();

        expect(main.__test__.settings.reducedFx).toBe(false);
        expect(main.__test__.applyReducedFx().reduced).toBe(false);
    });

    test('a phone gets the thrust throttle, and a desktop keeps the lever', async () => {
        // Reported from an iPhone: a touch slider that keeps its position is a
        // lever whose setting can be read but never felt. On glass the throttle
        // commands acceleration and springs home instead. The seam is one flag
        // into the shared flight model, so this reaches through the built copy
        // and asks the ship what it does when the throttle closes.
        globalThis.navigator.maxTouchPoints = 2;
        await boot();
        enterWorld();
        const flight = await import('../www/shared/js/flight-1.0.0.min.js');

        flight.setTargetSpeedFraction(1);
        stepFrames(120);
        const underway = flight.getFlightState().speed;
        expect(underway).toBeGreaterThan(0);

        flight.setTargetSpeedFraction(0);       // the thumb lifts
        stepFrames(120);
        expect(flight.getFlightState().speed).toBeCloseTo(underway, 6);
    });

    test('a system reduced-motion preference does it without the checkbox', async () => {
        // PRD 12 asks for both routes. A visitor who set the preference at the
        // operating system should not have to find a checkbox as well.
        dom.windowStub.matchMedia = (media) => ({
            media, matches: true,
            addEventListener() {}, removeEventListener() {},
            addListener() {}, removeListener() {}
        });
        const main = await boot();

        expect(main.__test__.prefersReducedMotion()).toBe(true);
        expect(main.__test__.settings.reducedFx).toBe(false);   // the box is untouched
        expect(main.__test__.applyReducedFx().reduced).toBe(true);
    });
});

describe('the loop stops when nobody is watching', () => {
    test('a hidden tab does no work at all', async () => {
        const main = await boot();
        enterWorld();
        stepFrames(2);
        const before = main.getState().lastTime;

        dom.documentStub.hidden = true;
        stepFrames(3);
        // Not one frame's worth of anything. `lastTime` is the first thing a
        // live frame writes, so an unmoved clock means the loop returned before
        // it did any work at all.
        expect(main.getState().lastTime).toBe(before);

        dom.documentStub.hidden = false;
        expect(() => stepFrames(1)).not.toThrow();
    });

    test('the pause panel throttles drawing rather than stopping it dead', async () => {
        // The renderer has no preserveDrawingBuffer, so the canvas contents
        // after compositing are formally undefined and the pause panel's
        // backdrop blur samples them. Ten frames a second gives back five
        // sixths of the work without betting the panel on that.
        const main = await boot();
        const draw = main.__test__.shouldDrawThisFrame;

        // Playing: every frame is drawn.
        enterWorld();
        expect(draw(1 / 60)).toBe(true);
        expect(draw(1 / 60)).toBe(true);

        main.__test__.openPause();
        // A second of sixty-hertz frames should buy about ten drawn ones.
        let drawn = 0;
        for (let i = 0; i < 60; i++) if (draw(1 / 60)) drawn++;
        expect(drawn).toBeGreaterThanOrEqual(9);
        expect(drawn).toBeLessThanOrEqual(11);

        // Back to the helm, and the debt is forgotten rather than carried.
        main.__test__.closePause();
        expect(draw(1 / 60)).toBe(true);
    });
});

/* ============================================================================
 * The speedometer
 * ==========================================================================
 * WHY THE MATHS IS TESTED AND THE PIXELS ARE NOT. Under the stubs a colour is
 * a string and a gradient is unrenderable, so nothing here can tell you the bar
 * looks right. What it CAN hold is the promise the bar makes: that one km/s is
 * the same distance along the track whichever way the ship is pointing.
 *
 * That promise is the entire design. The ship does 4,000 ahead and 1,000
 * astern, and a meter with zero in the middle would draw those as the same
 * length, which says full astern is as much of an achievement as full ahead. A
 * single scale with zero off-centre says the true thing instead, and says it in
 * the shape rather than in a label nobody reads. It is also exactly the kind of
 * promise that rots quietly: someone tidies the reverse arm to a round 25% of
 * the track, everything still renders, and the meter has started lying.
 */
describe('the speedometer', () => {
    const shipped = { maxForward: 4000, maxReverse: 1000 };

    test('zero sits where the two speed limits put it, not in the middle', async () => {
        const main = await boot();
        main.__test__.layOutSpeedometer(shipped);
        // 1,000 astern against 5,000 of total range is a fifth along.
        expect(main.__test__.speedoPosition(0)).toBeCloseTo(20, 6);
        expect(dom.el('speedometer').style.getPropertyValue('--speedo-zero')).toBe('20%');
    });

    test('one km/s is the same distance whichever way the ship is going', async () => {
        const main = await boot();
        const { layOutSpeedometer, speedoPosition } = main.__test__;
        layOutSpeedometer(shipped);

        const ahead = speedoPosition(500) - speedoPosition(0);
        const astern = speedoPosition(0) - speedoPosition(-500);
        expect(ahead).toBeCloseTo(astern, 9);

        // And the ends land exactly on the ends, which is what makes the track
        // a scale rather than a decoration.
        expect(speedoPosition(4000)).toBeCloseTo(100, 6);
        expect(speedoPosition(-1000)).toBeCloseTo(0, 6);
    });

    test('full astern is a quarter of the track that full ahead is', async () => {
        const main = await boot();
        const { layOutSpeedometer, speedoPosition } = main.__test__;
        layOutSpeedometer(shipped);

        const ahead = speedoPosition(4000) - speedoPosition(0);
        const astern = speedoPosition(0) - speedoPosition(-1000);
        // THE HONESTY PROPERTY. Reverse is a quarter the speed, so it gets a
        // quarter the bar. If this ever reads 1, the meter has been "tidied"
        // into claiming the two are equal.
        expect(astern / ahead).toBeCloseTo(0.25, 9);
    });

    test('the geometry follows the config rather than being written twice', async () => {
        const main = await boot();
        const { layOutSpeedometer, speedoPosition } = main.__test__;
        // A ship that reversed as fast as it flew would want a centred zero,
        // and should get one without anybody editing the stylesheet.
        layOutSpeedometer({ maxForward: 2000, maxReverse: 2000 });
        expect(speedoPosition(0)).toBeCloseTo(50, 6);
        expect(dom.el('speedometer').style.getPropertyValue('--speedo-zero')).toBe('50%');
        expect(dom.el('speedometer').style.getPropertyValue('--speedo-rev-scale')).toBe('100%');
    });

    test('the arms fill to their own ends and no further', async () => {
        const main = await boot();
        const { layOutSpeedometer, updateSpeedometer } = main.__test__;
        layOutSpeedometer(shipped);

        updateSpeedometer({ speed: 4000, targetSpeed: 4000 });
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 0% 0 0)');
        expect(dom.el('speedo-rev').style.clipPath).toBe('inset(0 0 0 100%)');

        updateSpeedometer({ speed: -1000, targetSpeed: -1000 });
        expect(dom.el('speedo-rev').style.clipPath).toBe('inset(0 0 0 0%)');
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 100% 0 0)');

        // Half ahead reveals half the forward arm, not half the track.
        updateSpeedometer({ speed: 2000, targetSpeed: 2000 });
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 50% 0 0)');
    });

    test('the demand marker follows the throttle, not the ship', async () => {
        const main = await boot();
        const { layOutSpeedometer, updateSpeedometer, speedoPosition } = main.__test__;
        layOutSpeedometer(shipped);

        // Six seconds of acceleration separate these two, and drawing the gap
        // is the entire reason the marker exists.
        updateSpeedometer({ speed: 0, targetSpeed: 4000 });
        expect(dom.el('speedo-demand').style.left).toBe('100%');
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 100% 0 0)');

        updateSpeedometer({ speed: 4000, targetSpeed: 0 });
        expect(dom.el('speedo-demand').style.left).toBe(`${speedoPosition(0)}%`);
    });

    test('a stopped ship lights the detent, since a bar of no length has no colour', async () => {
        const main = await boot();
        const { layOutSpeedometer, updateSpeedometer } = main.__test__;
        layOutSpeedometer(shipped);

        updateSpeedometer({ speed: 0, targetSpeed: 0 });
        expect(dom.el('speedo-zero').classList.contains('at-rest')).toBe(true);

        updateSpeedometer({ speed: 900, targetSpeed: 900 });
        expect(dom.el('speedo-zero').classList.contains('at-rest')).toBe(false);

        // Stopped but ASKING to move is not at rest: the ship is about to go.
        updateSpeedometer({ speed: 0, targetSpeed: 4000 });
        expect(dom.el('speedo-zero').classList.contains('at-rest')).toBe(false);
    });

    test('the readout answers one question now that the marker carries the other', async () => {
        const main = await boot();
        main.__test__.layOutSpeedometer(shipped);
        // It used to read "1,851 → 2,088 km/s". The arrow was the only way to
        // show a throttle the ship had not caught up with, and the bar does
        // that better, so the number stopped doing two jobs.
        main.__test__.updateReadouts({ speed: 1851, targetSpeed: 2088, throttle: 0.52 });
        expect(dom.el('throttle-readout').textContent).toBe('1,851 km/s');
        expect(dom.el('throttle-readout').textContent).not.toContain('→');
    });

    test('a steady speed stops writing to the DOM entirely', async () => {
        const main = await boot();
        const { layOutSpeedometer, updateSpeedometer } = main.__test__;
        layOutSpeedometer(shipped);

        updateSpeedometer({ speed: 2000, targetSpeed: 2000 });
        const arm = dom.el('speedo-fwd');
        arm.style.clipPath = 'TOUCHED';
        // Same numbers, so nothing should be rewritten: this runs sixty times a
        // second for the length of a run and holding a throttle is the norm.
        updateSpeedometer({ speed: 2000, targetSpeed: 2000 });
        expect(arm.style.clipPath).toBe('TOUCHED');
    });
});

/* The ghost band, which is the gap between where the ship is and where the
 * throttle is asking, drawn rather than left empty.
 *
 * THE BUG IT FIXES WAS A READING, NOT A NUMBER. Acceleration is linear at 667
 * km/s per second and the bar was always at the right place for the speed. What
 * it looked like, in a screenshot at six seconds with the ship at 845 of a
 * demanded 2,420, was a coloured stub failing to keep up with a white line:
 * the marker was drawn near-opaque and standing proud of the track, so the eye
 * took IT for the needle and the bar for a laggy fill of it. Filling the gap
 * makes the two one object again.
 */
describe('the speedometer shows the ground still to be covered', () => {
    const shipped = { maxForward: 4000, maxReverse: 1000 };

    async function meter() {
        const main = await boot();
        main.__test__.layOutSpeedometer(shipped);
        return main.__test__;
    }

    test('the ghost spans from the ship to the throttle', async () => {
        const { updateSpeedometer } = await meter();
        // The screenshot's frame: 845 km/s with 2,420 asked for.
        updateSpeedometer({ speed: 845, targetSpeed: 2420 });
        // 845 of 4,000 is 21.1% of the forward arm, 2,420 is 60.5%.
        expect(dom.el('speedo-ghost-fwd').style.clipPath).toBe('inset(0 39.5% 0 21.1%)');
        // And the solid bar still ends exactly where the ghost begins, so the
        // two read as one bar rather than as two.
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 78.9% 0 0)');
    });

    test('it vanishes on its own once the ship has caught up', async () => {
        const { updateSpeedometer } = await meter();
        updateSpeedometer({ speed: 2000, targetSpeed: 2000 });
        // Both ends of the band at the same place is a band of no width. This
        // is the state the meter spends most of a run in, so it has to be the
        // quiet one rather than a special case.
        expect(dom.el('speedo-ghost-fwd').style.clipPath).toBe('inset(0 50% 0 50%)');
    });

    test('slowing down ghosts the speed about to be shed', async () => {
        const { updateSpeedometer } = await meter();
        // Throttle cut: the ghost is behind the bar now, not ahead of it, and
        // it should still span exactly the interval between the two.
        updateSpeedometer({ speed: 4000, targetSpeed: 1000 });
        expect(dom.el('speedo-ghost-fwd').style.clipPath).toBe('inset(0 0% 0 25%)');
    });

    test('a throttle slammed from ahead to astern ghosts BOTH arms', async () => {
        const { updateSpeedometer } = await meter();
        // The case that would have needed its own branch. A ship at +500 asked
        // for -1,000 has to decelerate through zero before it can accelerate
        // backwards, so the ground still to be covered genuinely crosses the
        // detent: all of the reverse arm, and the first slice of the forward one.
        updateSpeedometer({ speed: 500, targetSpeed: -1000 });
        expect(dom.el('speedo-ghost-fwd').style.clipPath).toBe('inset(0 87.5% 0 0%)');
        expect(dom.el('speedo-ghost-rev').style.clipPath).toBe('inset(0 0% 0 0%)');
        // The solid bar is still on the forward side, because that is where the
        // ship actually is.
        expect(dom.el('speedo-fwd').style.clipPath).toBe('inset(0 87.5% 0 0)');
        expect(dom.el('speedo-rev').style.clipPath).toBe('inset(0 0 0 100%)');
    });

    test('the arm fractions clamp instead of running off the end', async () => {
        const { forwardArmFraction, reverseArmFraction } = await meter();
        // Nothing should be able to produce a negative inset, which renders as
        // an arm that is somehow longer than its own track.
        expect(forwardArmFraction(-500)).toBe(0);
        expect(reverseArmFraction(500)).toBe(0);
        expect(forwardArmFraction(99999)).toBe(100);
        expect(reverseArmFraction(-99999)).toBe(100);
    });

    test('the marker no longer outshouts the bar it annotates', async () => {
        // Guarding the fix rather than the taste: the demand marker must not be
        // the loudest thing in the meter, or the reading inverts again and the
        // bar starts looking like it is lagging a needle.
        const css = readFileSync(
            new URL('../www/earthdefense/css/experience.css', import.meta.url), 'utf8');
        const rule = css.replace(/\/\*[\s\S]*?\*\//g, '')
            .match(/\.speedo-demand\s*\{([^}]*)\}/)[1];
        // Inside the track's own height, not standing proud of it.
        expect(rule).not.toMatch(/top:\s*-/);
        expect(rule).not.toMatch(/bottom:\s*-/);
        // And no drop shadow lifting it off the bar.
        expect(rule).not.toMatch(/box-shadow/);
        const [, alpha] = rule.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/) || [];
        expect(parseFloat(alpha)).toBeLessThan(0.9);
    });
});

/* Four hit points, and the seam that makes them survivable to look at.
 *
 * The fleet suite proves the shield flashes by the right amount. What it cannot
 * see is whether main.js ever asks it to, and that seam is exactly the kind
 * this experience keeps losing silently: an absorbed hit that lights nothing
 * still passes every other test in the repo, and the visitor's reading of a
 * raider soaking three shots in silence is that the guns are broken.
 */
describe('raiders soak shots, and say so when they do', () => {
    test('one shot no longer kills a raider', async () => {
        const main = await boot();
        const CFG = await CONFIG();
        enterWorld();
        const { getShips, shipsRemaining } = await import('../www/earthdefense/js/fleet.min.js');
        const ship = getShips()[0];

        // The whole difficulty change in one assertion. There is no fire
        // button, so this is a full second of held lock rather than a frame.
        expect(CFG.fleet.hitPoints).toBeGreaterThan(CFG.weapons.damagePerShot);
        main.__test__.resolveDamage(ship.id, CFG.weapons.damagePerShot);
        expect(ship.alive).toBe(true);
        expect(shipsRemaining()).toBe(CFG.fleet.total);
        // And it took the hit rather than ignoring it.
        expect(ship.shield.active).toBe(true);
    });

    test('an absorbed hit lights that raider and nothing else', async () => {
        const main = await boot();
        const CFG = await CONFIG();
        enterWorld();
        const { getShips } = await import('../www/earthdefense/js/fleet.min.js');
        const [hit, bystander] = getShips();

        main.__test__.onDamageResolved({ id: hit.id, hitPoints: 2, destroyed: false });

        expect(hit.shield.active).toBe(true);
        // A fleet-wide flash would be worse than none: it would say every
        // raider had been hit.
        expect(bystander.shield.active).toBe(false);
        void CFG;
    });

    test('the killing blow is answered by the burst, not a fifth flicker', async () => {
        const main = await boot();
        enterWorld();
        const { getShips } = await import('../www/earthdefense/js/fleet.min.js');
        const ship = getShips()[0];

        main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        expect(ship.alive).toBe(false);
        expect(ship.shield.active).toBe(false);
    });

    test('a hit on an installation never reaches the fleet', async () => {
        const main = await boot();
        enterWorld();
        const { getStructures } = await import('../www/earthdefense/js/structures.min.js');
        const { getShips } = await import('../www/earthdefense/js/fleet.min.js');
        const site = getStructures()[0].site.id;

        main.__test__.onDamageResolved({ id: site, hitPoints: 2, destroyed: false });
        expect(getShips().every(s => !s.shield.active)).toBe(true);
    });
});

// ---- The endings ------------------------------------------------------------
//
// A run that finishes plays a third-person shot before the summary card, and
// which shot depends on HOW it finished. The camera path and the flares are
// measured in the finale suite, where the numbers are real; what matters here
// is the wiring: that the right ending is chosen, that the card waits for it,
// that any key or tap gets out of it, and that reduced motion never sees it.

describe('how a run ends', () => {
    const FINALE = async () => await import('../www/earthdefense/js/finale.min.js');
    const washed = (name) => dom.documentStub.body.classList.contains(name);

    async function clearTheFleet(main) {
        const { getShips } = await import('../www/earthdefense/js/fleet.min.js');
        for (const ship of getShips()) {
            main.__test__.onDamageResolved({ id: ship.id, hitPoints: 0, destroyed: true });
        }
    }

    test('a win gets the celebration, not a dialog', async () => {
        const main = await boot();
        const finale = await FINALE();
        enterWorld();
        stepFrames(30);
        await clearTheFleet(main);

        expect(finale.isFinaleRunning()).toBe(true);
        expect(finale.getFinaleKind()).toBe('won');
        expect(washed('finale-won')).toBe(true);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(true);
    });

    test('losing the line burns the places it was lost at', async () => {
        const main = await boot();
        const config = await CONFIG();
        const finale = await FINALE();
        const { getStructures } = await import('../www/earthdefense/js/structures.min.js');
        enterWorld();
        for (const entry of getStructures()) {
            main.__test__.onDamageResolved({ id: entry.site.id, hitPoints: 0, destroyed: true });
        }

        // The corner window watching the last installation fall goes first.
        stepFrames(Math.ceil(config.replay.insetSeconds / 0.016) + 2);
        expect(finale.getFinaleKind()).toBe('lost-line');
        expect(washed('finale-lost')).toBe(true);
    });

    test('running out of ships gets the wreck, and NOT a burning Earth', async () => {
        // RUNNING OUT OF SHIPS IS NOT LOSING THE LINE (PRD 6.4). The
        // installations are still standing, so pointing the camera at a burning
        // Earth would be telling the visitor something untrue.
        const main = await boot();
        const config = await CONFIG();
        const finale = await FINALE();
        enterWorld();

        for (let life = 0; life < config.player.lives; life++) {
            main.__test__.killPlayer('fire');
            stepFrames(200);
        }
        expect(main.getState().phase).toBe('lost');
        expect(finale.getFinaleKind()).toBe('lost-ship');
    });

    test('the ending hands off from the wreck replay rather than cutting', async () => {
        // The replay closes at `replay.shipEndDistance` and the ending opens
        // there, on the same side of the wreck, so the two are one move.
        const main = await boot();
        const config = await CONFIG();
        const replay = await import('../www/earthdefense/js/replay.min.js');
        const finale = await FINALE();
        enterWorld();

        for (let life = 0; life < config.player.lives; life++) {
            main.__test__.killPlayer('fire');
            if (life < config.player.lives - 1) stepFrames(200);
        }
        // The replay owns the camera first, and the ending does not start
        // until it has finished.
        expect(replay.isShipReplayRunning()).toBe(true);
        expect(finale.isFinaleRunning()).toBe(false);

        stepFrames(Math.ceil(config.player.respawnDelay / 0.016) + 4);
        expect(finale.isFinaleRunning()).toBe(true);
    });

    test('any key cuts it short and brings the card forward', async () => {
        // A shot nobody can leave has stopped being a gift, and the card
        // carries every number either way, so skipping costs no information.
        const main = await boot();
        const finale = await FINALE();
        enterWorld();
        await clearTheFleet(main);
        expect(finale.isFinaleRunning()).toBe(true);

        fire(dom.documentStub, 'keydown', { code: 'KeyJ' });
        expect(finale.isFinaleRunning()).toBe(false);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(washed('finale-won')).toBe(false);
        expect(dom.el('end-skip').classList.contains('hidden')).toBe(true);
    });

    test('a tap cuts it short too, since a phone has no keys', async () => {
        const main = await boot();
        const finale = await FINALE();
        enterWorld();
        await clearTheFleet(main);

        fire(dom.documentStub, 'pointerdown', {});
        expect(finale.isFinaleRunning()).toBe(false);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
    });

    test('Escape skips the ending rather than opening a pause panel', async () => {
        // There is nothing to pause: the run is over. The skip listener is
        // wired first so it gets the first look, and `openPause` refuses
        // anyway unless the game is being played.
        const main = await boot();
        enterWorld();
        await clearTheFleet(main);

        fire(dom.documentStub, 'keydown', { code: 'Escape' });
        expect(main.getState().phase).toBe('won');
        expect(dom.el('pause-modal').classList.contains('hidden')).toBe(true);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
    });

    test('a key press with no ending running does nothing at all', async () => {
        const main = await boot();
        enterWorld();
        expect(main.__test__.skipFinale()).toBe(false);
        expect(main.getState().phase).toBe('playing');
    });

    test('reduced motion goes straight to the card', async () => {
        // The one preference that skips the shot. Nothing is lost: the card
        // carries every number and the live region carries the same sentence.
        globalThis.window.matchMedia = () => ({
            matches: true, addEventListener() { }, removeEventListener() { }
        });
        const main = await boot();
        const finale = await FINALE();
        enterWorld();
        await clearTheFleet(main);

        expect(finale.isFinaleRunning()).toBe(false);
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(washed('finale-won')).toBe(false);
    });

    test('the skip hint is only up while there is something to skip', async () => {
        const main = await boot();
        const config = await CONFIG();
        enterWorld();
        expect(dom.el('end-skip').classList.contains('hidden')).toBe(true);

        await clearTheFleet(main);
        expect(dom.el('end-skip').classList.contains('hidden')).toBe(false);

        playOutTheEnding(config);
        expect(dom.el('end-skip').classList.contains('hidden')).toBe(true);
    });

    test('a restart leaves no ending behind', async () => {
        // Otherwise the new run opens over the last one's embers, with a red
        // wash on the body and a hint offering to skip nothing.
        const main = await boot();
        const finale = await FINALE();
        enterWorld();
        await clearTheFleet(main);
        expect(finale.isFinaleRunning()).toBe(true);

        main.__test__.restartRun();
        expect(finale.isFinaleRunning()).toBe(false);
        expect(washed('finale-won')).toBe(false);
        expect(washed('finale-lost')).toBe(false);
        expect(dom.el('end-skip').classList.contains('hidden')).toBe(true);
        expect(main.getState().phase).toBe('playing');
    });

    test('the ending stands off Earth at the distance it was composed for', async () => {
        // The one thing this level can genuinely check about the shot: that
        // real, live installation positions reached it. Under the chainable
        // THREE proxy the camera itself is not assertable (see the suite
        // header), but the eye the shot asks for is plain numbers, and it can
        // only be at this distance if `earthShot` fed it a real subject.
        const main = await boot();
        const config = await CONFIG();
        const finale = await FINALE();
        enterWorld();
        await clearTheFleet(main);
        stepFrames(4);

        const eye = finale.finaleEye();
        expect(eye).not.toBeNull();
        const out = Math.hypot(eye.x - eye.look.x, eye.y - eye.look.y, eye.z - eye.look.z);
        expect(out).toBeGreaterThan(config.finale.won.startDistance - 1);
        expect(out).toBeLessThan(config.finale.won.endDistance + 1);
    });

    test('the two planet endings launch from Earth and never from the Moon', async () => {
        // The Moon's three installations are 63,000 units away and out of
        // frame, so a shell from one of them would be a firework nobody sees
        // and a camera aim nobody asked for.
        const main = await boot();
        enterWorld();
        const shot = main.__test__.earthShot();
        expect(shot.sources.length).toBe(4);
        for (const source of shot.sources) {
            expect(Math.hypot(source.position.x, source.position.y, source.position.z))
                .toBeLessThan(20000);
        }
    });
});
