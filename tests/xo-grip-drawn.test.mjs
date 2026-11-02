// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-grip-drawn.test.mjs - the quarterback's hand on the ball, on the real rig
 * (Steve's QA, 2026-11-01, from the over-the-shoulder replay view: "the QB's
 * fingers are going through the ball"). The shape itself is held in
 * tests/shared-hands.test.mjs. This proves the game puts it on: through the
 * throw hold the throwing hand is turned to face the ball and bent round it
 * with nothing inside the ball, and his own hand is back the frame the hold
 * ends.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const js = (f) => join(here, '..', 'www', 'xo', 'js', f);

let THREE;
let CFG;
let roster;
let view;
let ball;
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
    ({ XO_CONFIG: CFG } = await import(js('config.min.js')));
    const P = await import(js('play.min.js'));
    roster = await import(js('roster.min.js'));
    view = await import(js('view.js'));
    // THE MIN BUILD, as view.js imports it: the source would be a second
    // module with a ball of its own, and the view would see none.
    ball = await import(js('ball.min.js'));
    const scene = new THREE.Scene();
    ball.initBall(scene);
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
});

const byPosition = (position) => objects.find((o) => o.settings.position === position);
const handOf = (figure, side) => {
    const arm = figure.userData.arms.find((a) => a.userData.armSide === side);
    return arm.userData.forearm.children.find((c) => c.isMesh && c.userData.isHand);
};
const nearestVertex = (geometry, centre) => {
    const pos = geometry.getAttribute('position');
    let nearest = Infinity;
    for (let i = 0; i < pos.count; i += 1) nearest = Math.min(nearest, new THREE.Vector3().fromBufferAttribute(pos, i).distanceTo(centre));
    return nearest;
};

/** Frames of a live play in which nobody moves, the ball drawn each one. */
function run(frames, carrier) {
    for (let i = 0; i < frames; i += 1) {
        view.syncFigures(objects, DT, { live: true });
        view.syncBall(null, carrier, DT);
    }
}

describe('the quarterback holding the ball', () => {
    test('his throwing hand is turned onto the ball and bent round it through the hold, and his own again once he tucks it', () => {
        const qb = byPosition('qb');
        for (const o of objects) {
            if (o.state) { o.state.hasBall = false; o.state.run = false; o.state.xSpeed = 0; o.state.ySpeed = 0; }
        }
        qb.state.hasBall = true;
        const figure = roster.figureFor('qb');
        const side = roster.throwSideOf(figure);
        const hand = handOf(figure, side);
        const own = hand.geometry;
        const rest = hand.rotation.y;
        // Under centre, both hands on it: his own hand.
        view.beginSnapMotion();
        run(1, qb);
        expect(hand.userData.shape).not.toBe('grip');
        expect(hand.geometry).toBe(own);
        // Two seconds on, the ball is up by his ear and his hand is on it.
        run(120, qb);
        expect(view.snapProgress()).toBe(1);
        expect(hand.userData.shape).toBe('grip');
        expect(hand.geometry).not.toBe(own);
        // The ball where the pose puts it, straight in front of the palm in
        // the hand's own frame, and no vertex of the hand inside it.
        const mesh = ball.getBall();
        figure.updateMatrixWorld(true);
        const local = hand.worldToLocal(mesh.position.clone());
        expect(Math.abs(local.x)).toBeLessThan(1e-6);
        expect(local.z).toBeLessThan(0);
        const radius = ball.BALL_FAT * CFG.ballScale / CFG.figureScale;
        const nearest = nearestVertex(hand.geometry, local);
        expect(nearest).toBeGreaterThan(radius - 0.03 * hand.userData.handUnit);
        expect(nearest).toBeLessThan(radius + 0.2 * hand.userData.handUnit);
        // The same grip frame to frame: not rebuilt every frame.
        const kept = hand.geometry;
        run(10, qb);
        expect(hand.geometry).toBe(kept);
        // He takes off with it: tucked, his own hand and its turn are back.
        qb.state.run = true;
        run(1, qb);
        expect(hand.userData.shape).toBe('open');
        expect(hand.geometry).toBe(own);
        expect(hand.rotation.y).toBe(rest);
        // And nobody holding it at all leaves every hand its own.
        qb.state.run = false;
        run(30, qb);
        expect(hand.userData.shape).toBe('grip');
        run(1, null);
        expect(hand.geometry).toBe(own);
    });
});
