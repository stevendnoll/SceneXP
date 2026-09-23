// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-jump.test.mjs - The visitor's jump (2026-09-23).
 *
 * Until that day a receiver jumped by himself, once the ball was already over
 * his hands. Now the visitor sends him up (the Jump button, a tap near him, J
 * or Space), a mistimed jump loses the pass, and "Auto jump" in the playbook
 * brings the old behaviour back. These cases hold the rules that make that
 * fair: the catch is judged on the simulation's clock against the ball's real
 * drawn height, a jump never changes how a man runs, one jump a play, the
 * replay draws the jump that happened, and the copy tells a visitor all of it
 * before it can cost them anything.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installThree } from './helpers/three-stub.mjs';

jest.setTimeout(60000);

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');
const read = (...p) => readFileSync(join(here, '..', ...p), 'utf8');

installThree();

const { XO_CONFIG: CFG, SIM, UNITS_TO_METRES } = await import(join(scene, 'config.js'));
const jump = await import(join(scene, 'jump.js'));
const P = await import(join(scene, 'play.js'));
const view = await import(join(scene, 'view.js'));
const replay = await import(join(scene, 'replay.js'));
const { keyAction } = await import(join(scene, 'hud.js'));
const { bandAt } = await import(join(scene, 'scoring.js'));

const J = CFG.pose.jump;
const HZ = CFG.simHz;
const STANDING = view.standingReach();
const REACH = J.range / UNITS_TO_METRES;

/** A small seeded generator, so a play can be run twice exactly. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Run with Math.random seeded, and put it back afterwards. */
function withSeed(seed, fn) {
    const orig = Math.random;
    Math.random = seeded(seed);
    try { return fn(); } finally { Math.random = orig; }
}

describe('the arc the catch is judged against is the arc that is drawn', () => {
    test('view.js still exports the jump curve, and it is jump.js\'s', () => {
        // Compared by what it returns, not by identity: view.js imports the
        // .min build and this suite imports the source, so they are two module
        // instances of one function and `toBe` could never hold.
        for (let t = -0.1; t <= 1.1; t += 0.05) {
            expect(view.jumpLift(t)).toBeCloseTo(jump.jumpLift(t), 12);
        }
        expect(jump.jumpLift(0)).toBe(0);
        expect(jump.jumpLift(1)).toBe(0);
        expect(jump.jumpLift(J.peakAt)).toBeCloseTo(J.lift, 6);
    });

    test('a throw starts and ends at hand height and peaks in the middle', () => {
        const span = jump.spanOf({ startX: 0, startY: 0, targetX: 400, targetY: 0 });
        expect(jump.arcHeightAt(span, 0, 0)).toBeCloseTo(CFG.ball.release, 6);
        expect(jump.arcHeightAt(span, 400, 0)).toBeCloseTo(CFG.ball.release, 6);
        expect(jump.arcHeightAt(span, 200, 0))
            .toBeCloseTo(CFG.ball.release + CFG.ball.apex * span.reach, 6);
        expect(jump.spanOf({})).toBeNull();
        expect(jump.spanOf({ startX: 5, startY: 5, targetX: 5, targetY: 5 })).toBeNull();
        expect(jump.ballHeight(null)).toBe(CFG.ball.release);
        expect(jump.ballHeight({ coords: { x: 1, y: 1 } })).toBe(CFG.ball.release);
    });

    test('view.js builds its arc with the same two functions, so there is one copy', () => {
        // Two copies of the arc is one edit away from a ball drawn at one height
        // and caught at another.
        const src = read('www', 'xo', 'js', 'view.js');
        expect(src).toMatch(/const span = spanOf\(c\)/);
        expect(src).toMatch(/want = arcHeightAt\(span, c\.x, c\.y\)/);
        expect(src).not.toMatch(/4 \* p \* \(1 - p\) \* B\.apex/);
    });
});

describe('whether a man in the air can take it', () => {
    test('only while he is off the ground', () => {
        expect(jump.inTheAir(-1)).toBe(false);
        expect(jump.inTheAir(0)).toBe(true);
        expect(jump.inTheAir(J.hang - 1e-6)).toBe(true);
        expect(jump.inTheAir(J.hang)).toBe(false);
        expect(jump.leapCatches(STANDING, J.hang + 0.01, 0)).toBe(false);
    });

    test('a ball at or below his hands is always his: a jump never lowers the ceiling', () => {
        for (const t of [0, 0.05, 0.2, 0.4, 0.6]) {
            expect(jump.leapCatches(STANDING, t, STANDING)).toBe(true);
            expect(jump.leapCatches(STANDING, t, CFG.ball.release)).toBe(true);
        }
    });

    test('A HIGH BALL IS HIS AT THE TOP OF THE JUMP AND NOT AT THE BOTTOM', () => {
        // The whole of the timing: a ball a metre over his standing reach is out
        // of reach as he leaves the grass and in reach at the peak.
        const high = STANDING + 1.0;
        expect(jump.leapCatches(STANDING, 0, high)).toBe(false);
        expect(jump.leapCatches(STANDING, J.hang * J.peakAt, high)).toBe(true);
        expect(jump.leapCatches(STANDING, J.hang * 0.97, high)).toBe(false);
        // And nothing gets a ball further up than the jump plus the slack.
        expect(jump.leapCatches(STANDING, J.hang * J.peakAt,
            STANDING + J.lift + J.manual.slack + 0.01)).toBe(false);
    });

    test('with no standing height told, a man in the air is excused the height', () => {
        expect(jump.leapCatches(null, 0.1, 99)).toBe(true);
    });
});

describe('the cue on the Jump button', () => {
    const ball = (x, list) => ({ coords: { x, y: 0, list } });
    const man = (x, xSpeed = 0) => ({ coords: { x, y: 0 }, state: { xSpeed, ySpeed: 0 } });
    const path = (from, step, n) => Array.from({ length: n }, (_, i) => [from + step * (i + 1), 0]);

    test('reads the ball\'s written path rather than guessing from a speed', () => {
        // Ten units a step towards a man 100 units away with a 20 unit reach:
        // inside on the eighth step.
        expect(jump.arrivalIn(ball(0, path(0, 10, 20)), man(100), 20)).toBeCloseTo(8 / HZ, 9);
        expect(jump.arrivalIn(ball(90, []), man(100), 20)).toBe(0);
        // A ball that never comes near him never arrives.
        expect(jump.arrivalIn(ball(0, path(0, -10, 20)), man(100), 20)).toBe(Infinity);
        expect(jump.arrivalIn(null, man(0), 1)).toBe(Infinity);
        expect(jump.arrivalIn({ coords: { x: 0, y: 0 } }, man(100), 20)).toBe(Infinity);
    });

    test('carries him along his own run while it looks', () => {
        // Running away from the ball at 5 a step, he is caught up with later.
        expect(jump.arrivalIn(ball(0, path(0, 10, 40)), man(100, 5), 20))
            .toBeCloseTo(16 / HZ, 9);
    });

    test('lights up only inside the lead', () => {
        // One unit a step, reach 10: a man at d + 10 is reached on step d.
        const steps = Math.floor(J.manual.cueLead * HZ);
        expect(jump.cueLit(ball(0, path(0, 1, 200)), man(steps - 1 + 10), 10)).toBe(true);
        expect(jump.cueLit(ball(0, path(0, 1, 200)), man(steps + 40 + 10), 10)).toBe(false);
    });
});

describe('the Auto jump switch', () => {
    let store;
    beforeEach(() => {
        store = new Map();
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
        };
        jump.resetAutoJump();
    });
    afterEach(() => { delete globalThis.localStorage; jump.resetAutoJump(); });

    test('is off until the visitor turns it on, and remembers', () => {
        expect(jump.autoJump()).toBe(false);
        expect(jump.setAutoJump(true)).toBe(true);
        expect(JSON.parse(store.get(CFG.storage.jump))).toEqual({ auto: true });
        jump.resetAutoJump();
        expect(jump.autoJump()).toBe(true);
        jump.setAutoJump(false);
        jump.resetAutoJump();
        expect(jump.autoJump()).toBe(false);
    });

    test('a broken or missing store means the default, and the switch still works', () => {
        store.set(CFG.storage.jump, '{not json');
        expect(jump.autoJump()).toBe(false);
        delete globalThis.localStorage;
        jump.resetAutoJump();
        expect(jump.autoJump()).toBe(false);
        expect(jump.setAutoJump(true)).toBe(true);
        expect(jump.autoJump()).toBe(true);
    });

    test('its key is one of the game\'s own and the privacy page says so', () => {
        expect(CFG.storage.jump).toMatch(/^exes-n-ohs-/);
        expect(read('www', 'privacy.html')).toMatch(/Auto jump/);
    });
});

describe('sending a receiver up', () => {
    P.setStandingReach(STANDING);

    /** Snap `slug`, throw to the first receiver after `at` seconds, and hand
     *  back the live play with the ball in the air. */
    function thrown(seed, slug = 'pass2', at = 1.2, manual = true) {
        return withSeed(seed, () => {
            const play = P.createPlay();
            P.lineUp(play, slug, 'cover2');
            play.manualJump = manual;
            P.snap(play);
            for (let f = 0; f < HZ * at; f += 1) P.tick(play);
            const target = P.eligibleReceivers(play)[0];
            P.throwTo(play, target);
            return { play, target };
        });
    }

    test('only once the ball is in the air, only a receiver, and once a play', () => {
        const pre = withSeed(3, () => {
            const play = P.createPlay();
            P.lineUp(play, 'pass2', 'cover2');
            play.manualJump = true;
            P.snap(play);
            return play;
        });
        expect(P.ballInFlight(pre)).toBe(false);
        expect(P.requestLeap(pre, 'wr1')).toBe(false);

        const { play, target } = thrown(3);
        expect(P.ballInFlight(play)).toBe(true);
        expect(P.requestLeap(play, 'qb')).toBe(false);
        expect(P.requestLeap(play, 'x1')).toBe(false);
        expect(P.requestLeap(play, target)).toBe(true);
        expect(P.requestLeap(play, target)).toBe(false);
        expect(P.requestLeap(null, target)).toBe(false);
    });

    test('never with Auto jump on: the view decides then, exactly as before', () => {
        const { play, target } = thrown(3, 'pass2', 1.2, false);
        expect(P.requestLeap(play, target)).toBe(false);
    });

    test('A JUMP CHANGES NOTHING ABOUT HOW HE RUNS', () => {
        // Steve: he does not slow down or change direction. Same seed, same
        // play, one with a jump and one without: every step of his path agrees
        // for as long as the ball is in the air in both. Only while it is up,
        // because a jump can bring the catch a step forward, and a man with
        // the ball runs a different route from a man waiting for it.
        const path = (leap) => withSeed(11, () => {
            const play = P.createPlay();
            P.lineUp(play, 'pass2', 'cover2');
            play.manualJump = true;
            P.snap(play);
            const out = [];
            let target = '';
            for (let f = 0; f < HZ * 2.4 && !P.isDone(play); f += 1) {
                if (f === Math.round(HZ * 1.2)) {
                    target = P.eligibleReceivers(play)[0];
                    P.throwTo(play, target);
                    if (leap) P.requestLeap(play, target);
                }
                P.tick(play);
                if (target && !P.ballInFlight(play)) break;
                const o = play.game.objects.find((x) => x.settings.position === (target || 'wr1'));
                out.push([o.coords.x, o.coords.y, o.state.xSpeed, o.state.ySpeed]);
            }
            return out;
        });
        const a = path(false);
        const b = path(true);
        const n = Math.min(a.length, b.length);
        expect(n).toBeGreaterThan(HZ);
        for (let i = 0; i < n; i += 1) expect(b[i]).toEqual(a[i]);
    });

    test('he comes down after the hang, and is airborne for the catch only while his hands are up to it', () => {
        const { play, target } = thrown(5);
        P.requestLeap(play, target);
        const man = play.game.objects.find((o) => o.settings.position === target);
        const ball = play.game.objects.find((o) => o.settings.position === 'ball');
        let steps = 0;
        while (man.state.leaping && steps < HZ * 2) {
            const was = man.state.leapFor;
            P.landLeaps(play);
            if (man.state.leaping) {
                expect(man.state.airborne).toBe(
                    P.ballInFlight(play) && jump.leapCatches(STANDING, was, jump.ballHeight(ball)));
            }
            steps += 1;
        }
        expect(man.state.leaping).toBe(false);
        expect(man.state.airborne).toBe(false);
        expect(steps).toBeGreaterThanOrEqual(Math.floor(J.hang * HZ));
        expect(steps).toBeLessThanOrEqual(Math.ceil(J.hang * HZ) + 1);
    });

    /**
     * THE WHOLE POINT, ON A REAL PLAY. Find a deep throw that falls incomplete or
     * is picked off with nobody jumping, then show that the same play is caught
     * when he goes up as the cue says, and lost when he goes up the moment the
     * ball leaves the quarterback's hand.
     */
    test('A TIMED JUMP WINS A BALL THAT A MISTIMED ONE LOSES', () => {
        const run = (seed, jumpAfterCue, jumpAtThrow) => withSeed(seed, () => {
            const play = P.createPlay();
            P.lineUp(play, 'pass2', '');
            play.manualJump = true;
            P.snap(play);
            let target = '';
            let cue = -1;
            let band = null;
            for (let f = 0; f < HZ * 12 && !P.isDone(play); f += 1) {
                if (!target && f === Math.round(HZ * 2.6)) {
                    const e = P.eligibleReceivers(play);
                    target = e[seed % e.length];
                    P.throwTo(play, target);
                    if (jumpAtThrow) P.requestLeap(play, target);
                }
                if (target && P.ballInFlight(play)) {
                    const ball = play.game.objects.find((o) => o.settings.position === 'ball');
                    const man = play.game.objects.find((o) => o.settings.position === target);
                    if (band === null) band = bandAt(ball.coords.targetX, SIM.lineInterval).points;
                    if (cue < 0 && jump.cueLit(ball, man, REACH)) cue = f;
                    if (jumpAfterCue !== null && cue >= 0 && f === cue + Math.round(jumpAfterCue * HZ)) {
                        P.requestLeap(play, target);
                    }
                }
                P.tick(play);
            }
            return target ? { result: P.outcome(play).result, band } : null;
        });

        let proven = null;
        for (let seed = 1; seed <= 120 && !proven; seed += 1) {
            const none = run(seed, null, false);
            if (!none || none.result === 'catch') continue;
            const timed = run(seed, 0.25, false);
            const early = run(seed, null, true);
            if (timed.result === 'catch' && early.result !== 'catch') proven = { seed, none, early };
        }
        expect(proven).not.toBeNull();
    });
});

describe('the replay draws the jump that happened', () => {
    const objects = () => ['qb', 'wr1', 'ball'].map((position) => ({
        settings: { position, team: 0 }, coords: { x: 0, y: 0, z: 0 }, state: {},
    }));

    test('from the frame he left his feet, and not before', () => {
        const objs = objects();
        replay.startRecording(objs);
        for (let i = 0; i < 5; i += 1) replay.record(objs);
        expect(replay.noteLeap('wr1', 1 / HZ)).toBe(true);
        for (let i = 0; i < 10; i += 1) replay.record(objs);

        const at = (f) => replay.frameAt(f).find((o) => o.settings.position === 'wr1').state;
        expect(at(4).leaping).toBe(false);
        expect(at(5).leaping).toBe(true);
        expect(at(5).leapFor).toBe(0);
        expect(at(9).leapFor).toBeCloseTo(4 / HZ, 9);
        // Nobody else is in the air.
        expect(replay.frameAt(9).find((o) => o.settings.position === 'qb').state.leaping).toBe(false);
    });

    test('a jump noted with no recording, or with no clock, is refused, and discard forgets it', () => {
        replay.discard();
        expect(replay.noteLeap('wr1', 1 / HZ)).toBe(false);
        const objs = objects();
        replay.startRecording(objs);
        replay.record(objs);
        expect(replay.noteLeap('wr1', 0)).toBe(false);
        expect(replay.noteLeap('', 1 / HZ)).toBe(false);
        replay.noteLeap('wr1', 1 / HZ);
        replay.discard();
        replay.startRecording(objs);
        replay.record(objs);
        expect(replay.frameAt(0).find((o) => o.settings.position === 'wr1').state.leaping).toBe(false);
    });
});

describe('the keys and the page', () => {
    test('J jumps, in either case, and the space bar keeps its old meaning to the lookup', () => {
        expect(keyAction('J')).toBe('jump');
        expect(keyAction('j')).toBe('jump');
        expect(keyAction('J', { inField: true })).toBe('');
        // Space still says "snap": the row decides what it presses, and during
        // the flight the only thing wearing the space bar is Jump.
        expect(keyAction(' ')).toBe('snap');
        const hud = read('www', 'xo', 'js', 'hud.js');
        expect(hud).toMatch(/event\.key === ' ' && box\.querySelector\('\[data-keys\*=" "\]'\)/);
        expect(hud).toMatch(/\[JUMP_KEY, ' '\]/);
    });

    test('the rules tell a visitor about the jump, the cue and the way out', () => {
        const html = read('www', 'xo', 'index.html');
        const steps = html.slice(html.indexOf('welcome-steps'), html.indexOf('</ol>'));
        expect(steps).toMatch(/Jump for it/);
        expect(steps).toMatch(/lights up/);
        expect(steps).toMatch(/too early or too\s+late/);
        expect(steps).toMatch(/Auto jump/);
        expect(html).toMatch(/<kbd>J<\/kbd> or <kbd>Space<\/kbd> jumps/);
        for (const text of [steps]) expect(text.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/[—;]/);
    });

    test('the view is told nobody is in the air by itself when the jump is the visitor\'s', () => {
        const main = read('www', 'xo', 'js', 'main.js');
        expect(main).toMatch(/if \(!cycle\.visitorJumps\) markAirborne\(cycle\.play, airborne\(\)\)/);
        expect(main).toMatch(/cycle\.visitorJumps = !autoJump\(\)/);
        expect(main).toMatch(/setStandingReach\(standingReach\(\)\)/);
        expect(main).toMatch(/noteLeap\(who, SIM_STEP\)/);
        expect(view.setVisitorJumps(true)).toBe(true);
        expect(view.setVisitorJumps(false)).toBe(false);
    });
});
