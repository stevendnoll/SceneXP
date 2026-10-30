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

/**
 * A BALL SAILING OVER A MAN OUT OF REACH IS NOT COMING TO HIM (Steve's QA,
 * 2026-10-30). Once the quarterback led his receivers properly, a deep pass
 * across the field flew over the shallow receiver a median 4.6 m up, and the
 * grass-only walk called that "reached": the cue lit him and the button sent
 * him up for a ball no jump could touch, which read as the quarterback having
 * thrown to the wrong man. The walk now asks the ball's own arc at each point.
 */
describe('a ball sailing over a man out of reach is not coming to him', () => {
    /** A real throw, 800 units downfield along y = 0, a point every 5 units:
     *  the arc climbs to its full height in the middle and is back at hand
     *  height at the end. `from` is how many points have already gone by. */
    const throwAt = (from = 0) => {
        const list = Array.from({ length: 160 }, (_, i) => [5 * (i + 1), 0]);
        return { coords: { startX: 0, startY: 0, targetX: 800, targetY: 0, x: 5 * from, y: 0, list: list.slice(from) } };
    };
    const man = (position, x, y = 0) => ({ settings: { position }, coords: { x, y }, state: { xSpeed: 0, ySpeed: 0 } });
    const span = () => jump.spanOf(throwAt().coords);
    const CEILING = jump.jumpCeiling(STANDING);
    /** The step on which a ball from the hand first comes within `r` of `x`. */
    const stepTo = (x, r) => throwAt().coords.list.findIndex((p) => Math.abs(p[0] - x) <= r) + 1;

    test('the ceiling is his hands at the top of the jump plus the catch\'s slack, and none without a standing height', () => {
        expect(CEILING).toBeCloseTo(STANDING + J.lift + J.manual.slack, 9);
        expect(CEILING).toBeCloseTo(jump.handsAt(STANDING, J.peakAt * J.hang) + J.manual.slack, 9);
        // The most `leapCatches` ever says yes to, and no more.
        expect(jump.leapCatches(STANDING, J.peakAt * J.hang, CEILING)).toBe(true);
        expect(jump.leapCatches(STANDING, J.peakAt * J.hang, CEILING + 0.01)).toBe(false);
        expect(jump.jumpCeiling(null)).toBe(Infinity);
        expect(jump.jumpCeiling(0)).toBe(Infinity);
    });

    test('the premise: a deep ball is higher than any jump in the middle and at hand height at the end', () => {
        expect(jump.arcHeightAt(span(), 400, 0)).toBeGreaterThan(CEILING);
        expect(jump.arcHeightAt(span(), 800, 0)).toBeLessThan(CEILING);
    });

    test('a man under the middle of the arc is reached on the grass and never in the air', () => {
        const under = man('wr3', 400);
        const k = stepTo(400, 10);
        expect(k).toBeGreaterThan(0);
        expect(jump.arrivalIn(throwAt(), under, 10)).toBeCloseTo(k / HZ, 9);
        expect(jump.arrivalIn(throwAt(), under, 10, CEILING)).toBe(Infinity);
        // A ceiling above the whole arc changes nothing.
        expect(jump.arrivalIn(throwAt(), under, 10, jump.arcHeightAt(span(), 400, 0) + 1)).toBeCloseTo(k / HZ, 9);
    });

    test('a man where it comes down is reached with the ceiling, and a ball over his head right now is not here yet', () => {
        const k = stepTo(800, 10);
        expect(jump.arrivalIn(throwAt(), man('wr1', 800), 10, CEILING)).toBeCloseTo(k / HZ, 9);
        // The ball is right over the man under the apex: inside his reach on
        // the grass, out of it in the air, and it is not coming back down to him.
        const over = throwAt(80);
        expect(over.coords.x).toBe(400);
        expect(jump.arrivalIn(over, man('wr3', 400), 10)).toBe(0);
        expect(jump.arrivalIn(over, man('wr3', 400), 10, CEILING)).toBe(Infinity);
    });

    test('so the button and its cue go to the man it is coming down to, not the man it is flying over', () => {
        const under = man('wr3', 400);
        const spot = man('wr1', 800);
        // The grass alone reaches the man under the arc first, which was the fault.
        expect(jump.nearestToBall(throwAt(), [spot, under], 10)).toBe(under);
        expect(jump.nearestToBall(throwAt(), [spot, under], 10, CEILING)).toBe(spot);
        // The cue, with the ball two steps from passing over him.
        const near = throwAt(76);
        expect(jump.cueLit(near, under, 10)).toBe(true);
        expect(jump.cueLit(near, under, 10, CEILING)).toBe(false);
        // ...and lit for the man it is coming down to, once it is close.
        expect(jump.cueLit(throwAt(150), spot, 10, CEILING)).toBe(true);
    });

    test('a ball with no written throw behind it is judged on the grass alone, as before', () => {
        const flat = { coords: { x: 0, y: 0, list: Array.from({ length: 40 }, (_, i) => [i + 1, 0]) } };
        expect(jump.arrivalIn(flat, man('wr1', 20), 1, 2)).toBeCloseTo(19 / HZ, 9);
        expect(jump.arrivalIn(flat, man('wr1', 20), 1, Infinity)).toBeCloseTo(19 / HZ, 9);
    });

    test('a man is carried along his windowed heading when he has one, and this frame\'s speed when not', () => {
        const k = stepTo(800, 10);
        // This frame's speed says he is running off the path at thirty a step;
        // his heading says he is standing where the ball comes down. The
        // heading wins, because the frame's speed is the steer's square wave.
        const steady = man('wr1', 800);
        steady.state.ySpeed = 30;
        expect(jump.arrivalIn(throwAt(), steady, 10, CEILING)).toBe(Infinity);
        steady.state.heading = { x: 0, y: 0 };
        expect(jump.arrivalIn(throwAt(), steady, 10, CEILING)).toBeCloseTo(k / HZ, 9);
        // And the other way round: a heading that carries him off the path.
        const drifting = man('wr1', 800);
        drifting.state.heading = { x: 0, y: 30 };
        expect(jump.arrivalIn(throwAt(), drifting, 10, CEILING)).toBe(Infinity);
    });

    // THE BUTTON ITSELF (`buttonTarget`): the man it was thrown to first.
    test('the man it was thrown to comes first while the ball is coming to him, however soon it reaches somebody else', () => {
        const spot = man('wr1', 800);
        const first = man('wr2', 60);          // by the hand, where the ball is still low
        expect(jump.arrivalIn(throwAt(), first, 10, CEILING)).toBeLessThan(jump.arrivalIn(throwAt(), spot, 10, CEILING));
        // Soonest alone is the man by the hand, which was the fault.
        expect(jump.nearestToBall(throwAt(), [first, spot], 10, CEILING)).toBe(first);
        expect(jump.buttonTarget(throwAt(), [first, spot], 10, CEILING, 'wr1')).toEqual({ who: spot, coming: true });
        expect(jump.buttonTarget(throwAt(), [spot, first], 10, Infinity, 'wr1').who).toBe(spot);
    });

    test('a ball thrown past him goes to whoever it does reach, and the latch stays off', () => {
        const wide = man('wr1', 800, 200);      // A, well off where it comes down
        const other = man('wr4', 790);
        expect(jump.buttonTarget(throwAt(), [wide, other], 10, CEILING, 'wr1')).toEqual({ who: other, coming: false });
        // No such man in the list, as once he has gone up: the others' own answer, and the latch as handed in.
        expect(jump.buttonTarget(throwAt(), [other], 10, CEILING, 'wr1', true)).toEqual({ who: other, coming: true });
        expect(jump.buttonTarget(throwAt(), [], 10, CEILING, 'wr1')).toEqual({ who: null, coming: false });
        expect(jump.buttonTarget(throwAt(), null, 10, CEILING, 'wr1')).toEqual({ who: null, coming: false });
    });

    test('a ball coming to nobody is his while he is still here, not whoever stands nearest it', () => {
        // Both off the path. The man under the arc is nearer the ball now, and
        // the first round's rule sent him up for a ball five metres over him.
        const underish = man('wr3', 400, 30);
        const wide = man('wr1', 800, 200);
        expect(jump.nearestToBall(throwAt(), [underish, wide], 10, CEILING)).toBe(underish);
        expect(jump.buttonTarget(throwAt(), [underish, wide], 10, CEILING, 'wr1')).toEqual({ who: wide, coming: false });
        // Without him in the list the old answer stands.
        expect(jump.buttonTarget(throwAt(), [underish], 10, CEILING, 'wr1')).toEqual({ who: underish, coming: false });
    });

    test('once the ball has been coming to him it stays his, though this frame says otherwise', () => {
        const first = man('wr2', 60);
        // A, carried off the path by a bad speed reading this frame, is not reached...
        const wobble = man('wr1', 800);
        wobble.state.ySpeed = 30;
        expect(jump.arrivalIn(throwAt(), wobble, 10, CEILING)).toBe(Infinity);
        expect(jump.buttonTarget(throwAt(), [first, wobble], 10, CEILING, 'wr1')).toEqual({ who: first, coming: false });
        // ...but handed the latch, he keeps the button.
        expect(jump.buttonTarget(throwAt(), [first, wobble], 10, CEILING, 'wr1', true)).toEqual({ who: wobble, coming: true });
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

describe('who the Jump button sends up (Steve\'s QA, 2026-10-30)', () => {
    /** A ball at (0, 0) flying along +x, a point a step. */
    const ball = { coords: { x: 0, y: 0, list: Array.from({ length: 40 }, (_, i) => [i + 1, 0]) } };
    const man = (position, x, y, state = {}) => ({ settings: { position }, coords: { x, y }, state: { xSpeed: 0, ySpeed: 0, ...state } });

    test('the man the ball reaches soonest, not the man it was thrown to', () => {
        // The ball passes A at step 20 and B at step 10: B is nearer along the path.
        const a = man('wr1', 20, 0);
        const b = man('wr2', 10, 0);
        expect(jump.nearestToBall(ball, [a, b], 1)).toBe(b);
        expect(jump.nearestToBall(ball, [b, a], 1)).toBe(b);
        // A receiver standing off the path by less than the reach is reached too.
        const c = man('wr3', 5, 0.5);
        expect(jump.nearestToBall(ball, [a, b, c], 1)).toBe(c);
        // THE PATH DECIDES, NOT THE DISTANCE NOW: a man standing close to the
        // ball but off its path is never reached, and a man far down the path
        // is. He is the one to send up.
        const beside = man('wr3', 3, 3);
        const down = man('wr4', 15, 0);
        expect(jump.nearestToBall(ball, [beside, down], 1)).toBe(down);
    });

    test('a ball coming to nobody goes to whoever stands nearest it now, and so does a tie', () => {
        const far = man('wr1', 30, 20);
        const nearer = man('wr2', 3, 8);
        expect(jump.nearestToBall(ball, [far, nearer], 1)).toBe(nearer);
        // Both reached on the same step: the nearer now.
        const onPath = man('wr3', 12, 0);
        const beside = man('wr4', 12, 0.9);
        expect(jump.nearestToBall(ball, [beside, onPath], 1)).toBe(onPath);
    });

    test('nobody to send is nobody', () => {
        expect(jump.nearestToBall(ball, [], 1)).toBeNull();
        expect(jump.nearestToBall(ball, null, 1)).toBeNull();
        expect(jump.nearestToBall(null, [man('wr1', 1, 1)], 1)).toEqual(man('wr1', 1, 1));
        expect(jump.nearestToBall(ball, [{ settings: { position: 'wr1' } }], 1)).toBeNull();
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
