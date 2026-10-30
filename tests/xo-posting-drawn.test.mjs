// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-posting-drawn.test.mjs - a receiver's hands, on the real rig (Steve's QA,
 * 2026-10-30): receivers kept raising their arms for the ball after another
 * receiver had caught it, or after the quarterback had kept it and run.
 *
 * The rule itself (view.js `postingFor`) is asked case by case in
 * tests/xo-pose.test.mjs. This proves the ARM follows it: the roster is built
 * on the real three, `syncFigures` is driven with plain play objects for a
 * second at a time, and the standing receiver's arm is read against a figure
 * posed with the hands-up pose directly, and against one at rest.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const js = (f) => join(here, '..', 'www', 'xo', 'js', f);

let THREE;
let CFG;
let UNITS_TO_METRES;
let roster;
let view;
let objects;

/** Everything live reads the same way: a frame of simulation stepped by hand. */
const DT = 1 / 60;

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

    ({ XO_CONFIG: CFG, UNITS_TO_METRES } = await import(js('config.min.js')));
    const P = await import(js('play.min.js'));
    roster = await import(js('roster.min.js'));
    view = await import(js('view.js'));
    const scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
});

const byPosition = (position) => objects.find((o) => o.settings.position === position);
const armOn = (figure, side) => figure.userData.arms.find((a) => a.userData.armSide === side);
const anglesOf = (figure, side) => {
    const a = armOn(figure, side);
    return [a.rotation.x, a.rotation.z, a.userData.forearm.rotation.x];
};
const close = (got, want, digits = 2) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], digits));

/** A reference figure posed directly, with a delta long enough to land the pose. */
function reference(act) {
    const ref = roster.buildPlayer({ team: 0, positionGroup: 'wr', position: 'wr1' }, 0, null);
    roster.poseFigure(ref, 0, 0, act, 10);
    return ref;
}

/** Run `frames` frames of a live play in which nobody moves, so every receiver
 *  is standing by the end of them. */
function runStill(frames) {
    for (let i = 0; i < frames; i += 1) view.syncFigures(objects, DT, { live: true });
}

describe('the hands of a receiver who has run out of route', () => {
    test('up for the ball while the quarterback surveys, down once a receiver has it, down while the quarterback runs', () => {
        const qb = byPosition('qb');
        const wr1 = byPosition('wr1');
        const wr2 = byPosition('wr2');
        for (const o of objects) {
            if (o.state) { o.state.hasBall = false; o.state.run = false; o.state.xSpeed = 0; o.state.ySpeed = 0; }
        }
        // RECEIVER B STANDS WHERE NOBODY CAN REACH HIM, well behind the
        // quarterback. At the line he is in a corner's reach, and once one of
        // ours has the ball the receivers block for him, which is arms
        // forward and would hide the hands-up pose whichever rule drew it.
        wr2.coords.x = qb.coords.x - 9 / UNITS_TO_METRES;
        wr2.coords.y = qb.coords.y;
        // The quarterback holds it and looks downfield; B has stopped.
        qb.state.hasBall = true;
        view.beginSnapMotion();
        runStill(120);
        expect(view.blockersEngaged(objects, qb, false).has('wr2')).toBe(false);
        const posting = reference({ posting: 1 });
        const rest = reference({});
        const figure = roster.figureFor('wr2');
        const side = roster.throwSideOf(figure);
        // Both hands up, on both arms.
        close(anglesOf(figure, side), anglesOf(posting, side));
        close(anglesOf(figure, -side), anglesOf(posting, -side));
        expect(Math.abs(anglesOf(figure, side)[0] - anglesOf(rest, side)[0])).toBeGreaterThan(0.5);

        // Receiver A catches it: B's hands come down, and stay down.
        qb.state.hasBall = false;
        wr1.state.hasBall = true;
        runStill(120);
        expect(view.blockersEngaged(objects, wr1, false).has('wr2')).toBe(false);
        close(anglesOf(figure, side), anglesOf(rest, side));
        close(anglesOf(figure, -side), anglesOf(rest, -side));

        // Back to the quarterback with it, but tucked and running: down too.
        wr1.state.hasBall = false;
        qb.state.hasBall = true;
        qb.state.run = true;
        runStill(120);
        expect(view.blockersEngaged(objects, qb, false).has('wr2')).toBe(false);
        close(anglesOf(figure, side), anglesOf(rest, side));

        // And surveying again: up again, which is the live rule and not a latch.
        qb.state.run = false;
        runStill(120);
        close(anglesOf(figure, side), anglesOf(posting, side));
        expect(wr2.state.hasBall).toBe(false);
    });
});
