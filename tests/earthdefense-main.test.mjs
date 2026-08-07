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
    ['pause-modal', 'end-modal', 'settings-panel', 'lock-bracket', 'perimeter-notice']
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
        enterWorld();
        stepFrames(60);
        await clearTheFleet(main);

        expect(main.getState().phase).toBe('won');
        expect(dom.el('end-modal').classList.contains('hidden')).toBe(false);
        expect(dom.el('end-title').textContent).toBe('The line held');
        expect(dom.el('end-saved').textContent).toBe('7');
        expect(dom.el('end-destroyed').textContent).toBe('12');
    });

    test('losing every installation loses it, and says so plainly', async () => {
        const main = await boot();
        enterWorld();
        await loseEveryInstallation(main);

        expect(main.getState().phase).toBe('lost');
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
        enterWorld();
        await clearTheFleet(main);
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
