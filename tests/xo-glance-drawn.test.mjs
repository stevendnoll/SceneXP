// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-glance-drawn.test.mjs - a receiver's head turned toward the quarterback
 * or the ball, apart from his body (Steve's QA, 2026-11-01, from the Follow
 * me ride: "the avatar doesn't look back at the QB until just before the ball
 * arrives"). The rule (view.js `glanceFor`) is asked case by case on plain
 * objects, then proved on the real rig: the neck turns to it, inside its cap,
 * with the helmet on the head that turns, and comes back to rest.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const js = (f) => join(here, '..', 'www', 'xo', 'js', f);

let THREE;
let CFG;
let simToWorld;
let roster;
let view;
let objects;
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
    ({ XO_CONFIG: CFG, simToWorld } = await import(js('config.min.js')));
    const P = await import(js('play.min.js'));
    roster = await import(js('roster.min.js'));
    view = await import(js('view.js'));
    const scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
});

const byPosition = (position) => objects.find((o) => o.settings.position === position);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** The neck's turn that would put a figure's head on a sim point, from where
 *  the figure is DRAWN (eased toward its recorded spot, so not quite the
 *  coordinates themselves). */
const turnTo = (figure, point) => {
    const p = figure.getWorldPosition(new THREE.Vector3());
    const q = simToWorld(point.coords.x, point.coords.y, 0);
    return wrap(Math.atan2(q.x - p.x, q.z - p.z) - figure.rotation.y);
};

/** Frames of a live play, every man moved on by his own speed. */
function run(frames) {
    for (let i = 0; i < frames; i += 1) {
        for (const o of objects) {
            if (!o.state) continue;
            o.coords.x += o.state.xSpeed || 0;
            o.coords.y += o.state.ySpeed || 0;
        }
        view.syncFigures(objects, DT, { live: true });
    }
}

describe('the rule, case by case', () => {
    // Read inside the tests: the config arrives in beforeAll.
    const G = () => CFG.pose.glance;
    const man = (position, team, x, y, state = {}) => ({ settings: { position, team, benched: false }, coords: { x, y }, state: { hasBall: false, run: false, xSpeed: 0, ySpeed: 0, ...state } });
    const qb = () => man('qb', 0, 100, 500, { hasBall: true });
    const world = (o) => simToWorld(o.coords.x, o.coords.y, 0);

    test('crossing the field, or stopped, he looks at the quarterback; running a vertical route he does not, until the throw', () => {
        const q = qb();
        const across = man('wr1', 0, 400, 300, { xSpeed: 0.2, ySpeed: 2 });
        expect(view.glanceFor(across, [q, across], q)).toEqual(world(q));
        const slant = man('wr1', 0, 400, 300, { xSpeed: 1.5, ySpeed: 1.5 });
        expect(view.glanceFor(slant, [q, slant], q)).toEqual(world(q));
        const go = man('wr1', 0, 400, 300, { xSpeed: 2, ySpeed: 0.2 });
        expect(view.glanceFor(go, [q, go], q)).toBeNull();
        // Standing, whatever his last speed said: a comeback, a screen.
        expect(view.glanceFor(go, [q, go], q, { standing: true })).toEqual(world(q));
        // The line between: across under `across` of downfield is vertical.
        const edge = man('wr1', 0, 400, 300, { xSpeed: 2, ySpeed: 2 * G().across - 0.01 });
        expect(view.glanceFor(edge, [q, edge], q)).toBeNull();
        edge.state.ySpeed = 2 * G().across + 0.01;
        expect(view.glanceFor(edge, [q, edge], q)).toEqual(world(q));
        // Coming back toward the quarterback is not a vertical route.
        const back = man('wr1', 0, 400, 300, { xSpeed: -2, ySpeed: 0 });
        expect(view.glanceFor(back, [q, back], q)).toEqual(world(q));
    });

    test('the ball in the air draws every receiver\'s eyes; a runner, a catch made, a defender or a lineman draw nobody\'s', () => {
        const ball = { settings: { position: 'ball', team: 0, benched: false }, coords: { x: 900, y: 400 }, state: {} };
        const go = man('wr1', 0, 400, 300, { xSpeed: 2, ySpeed: 0 });
        expect(view.glanceFor(go, [go, ball], null)).toEqual(world(ball));
        expect(view.glanceFor(go, [go], null)).toBeNull();
        // The quarterback has taken off with it: nothing to look back for.
        const runner = man('qb', 0, 100, 500, { hasBall: true, run: true });
        const across = man('wr1', 0, 400, 300, { ySpeed: 2 });
        expect(view.glanceFor(across, [runner, across], runner)).toBeNull();
        // Caught by another receiver: nothing.
        const catcher = man('wr2', 0, 800, 300, { hasBall: true });
        expect(view.glanceFor(across, [catcher, across], catcher)).toBeNull();
        // His own catch: nothing.
        expect(view.glanceFor(catcher, [catcher], catcher)).toBeNull();
        // Not a receiver.
        const q = qb();
        expect(view.glanceFor(man('db1', 1, 600, 300, { ySpeed: 2 }), [q], q)).toBeNull();
        expect(view.glanceFor(man('x1', 0, 150, 500), [q], q)).toBeNull();
        expect(view.glanceFor(null, [q], q)).toBeNull();
    });
});

describe('on the real rig', () => {
    test('the crosser\'s neck turns to the quarterback and the vertical runner\'s stays, both turn to the ball in the air, and a catch rests them', () => {
        const qb = byPosition('qb');
        const wr1 = byPosition('wr1');
        const wr2 = byPosition('wr2');
        for (const o of objects) {
            if (o.state) { o.state.hasBall = false; o.state.run = false; o.state.xSpeed = 0; o.state.ySpeed = 0; }
        }
        qb.state.hasBall = true;
        view.beginSnapMotion();
        run(90);
        const f1 = roster.figureFor('wr1');
        const f2 = roster.figureFor('wr2');
        // The helmet is on the head that turns.
        expect(f1.userData.neck.getObjectByName('helmet-shell')).toBeTruthy();
        // A crosser, five metres downfield, running across toward the middle;
        // a vertical runner going straight away from the quarterback.
        wr1.coords.x = qb.coords.x + 150; wr1.coords.y = qb.coords.y + 320;
        wr1.state.xSpeed = 0.2; wr1.state.ySpeed = -2;
        wr2.coords.x = qb.coords.x + 120; wr2.coords.y = qb.coords.y - 320;
        wr2.state.xSpeed = 2; wr2.state.ySpeed = 0;
        run(60);
        const want1 = turnTo(f1, qb);
        expect(Math.abs(want1)).toBeGreaterThan(0.3);
        const G = CFG.pose.glance;
        const held1 = Math.max(-G.max, Math.min(G.max, want1));
        expect(f1.userData.glance).toBeCloseTo(held1, 2);
        // And the point itself, for the ride camera to look along.
        expect(f1.userData.glanceAt).toEqual({ x: simToWorld(qb.coords.x, qb.coords.y, 0).x, z: simToWorld(qb.coords.x, qb.coords.y, 0).z });
        expect(f2.userData.glanceAt).toBeNull();
        expect(f1.userData.neck.rotation.y).toBeCloseTo(held1, 1);
        expect(Math.abs(f1.userData.neck.rotation.y)).toBeLessThanOrEqual(G.max + 1e-9);
        expect(f2.userData.glance).toBeNull();
        expect(Math.abs(f2.userData.neck.rotation.y)).toBeLessThan(0.05);
        // Thrown: the ball in the air ahead of the vertical runner, nobody holding it.
        qb.state.hasBall = false;
        const ball = { settings: { position: 'ball', team: 0, benched: false }, coords: { x: wr2.coords.x + 400, y: wr2.coords.y + 60 }, state: { xSpeed: 0, ySpeed: 0 } };
        objects.push(ball);
        run(60);
        const want2 = turnTo(f2, ball);
        expect(f2.userData.glance).toBeCloseTo(Math.max(-G.max, Math.min(G.max, want2)), 2);
        expect(Math.sign(f2.userData.neck.rotation.y)).toBe(Math.sign(want2));
        expect(f1.userData.glance).toBeCloseTo(Math.max(-G.max, Math.min(G.max, turnTo(f1, ball))), 2);
        // Caught by the vertical runner: both rest.
        objects.pop();
        wr2.state.hasBall = true;
        run(90);
        expect(f2.userData.glance).toBeNull();
        expect(f1.userData.glance).toBeNull();
        expect(Math.abs(f2.userData.neck.rotation.y)).toBeLessThan(0.05);
        expect(Math.abs(f1.userData.neck.rotation.y)).toBeLessThan(0.05);
    });
});
