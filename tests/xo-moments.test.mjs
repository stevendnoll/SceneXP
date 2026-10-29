// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-moments.test.mjs - the moments of a play worth a photo, and the snapshot
 * that keeps each one (specs/xo-photos-plan, Step 3).
 *
 * moments.js is pure and asserted directly. snapshot.js writes transforms, and
 * the suite's THREE stub absorbs every assignment, so it is measured against a
 * real three in node:vm: the live frame put back after a moment has to be the
 * live frame exactly, or the view eases every figure from somewhere it never
 * was.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const scene = join(root, 'www', 'xo', 'js');

let M;
let CFG;
let FIELD;

beforeAll(async () => {
    M = await import(join(scene, 'moments.js'));
    ({ XO_CONFIG: CFG, FIELD } = await import(join(scene, 'config.js')));
});

describe('which moments happen', () => {
    const held = (holder, team, thrown) => ({ holder, team, thrown });

    test('a thrown ball landing in an X\'s hands is a catch, in an O\'s a pick', () => {
        expect(M.ballEvent(held('', -1, true), held('wr2', 0, true)))
            .toEqual({ kind: 'catch', hero: 'wr2', partner: null });
        expect(M.ballEvent(held('', -1, true), held('s1', 1, true)))
            .toEqual({ kind: 'pick', hero: 's1', partner: null });
    });

    test('a short pass thrown and caught between two frames is still a catch', () => {
        // A slow phone steps the simulation a tenth of a second per frame, so
        // the flight may never be seen at all.
        expect(M.ballEvent(held('qb', 0, false), held('wr4', 0, true)))
            .toEqual({ kind: 'catch', hero: 'wr4', partner: null });
        expect(M.ballEvent(held('qb', 0, false), held('db1', 1, true)))
            .toEqual({ kind: 'pick', hero: 'db1', partner: null });
    });

    test('nothing else is: the quarterback holding it, a keeper, a ball still in the air, the first frame', () => {
        // Before the throw, and after a keeper, the quarterback never lets go.
        expect(M.ballEvent(held('qb', 0, false), held('qb', 0, false))).toBeNull();
        // The throw itself empties the hands, which is not a catch.
        expect(M.ballEvent(held('qb', 0, false), held('', -1, true))).toBeNull();
        expect(M.ballEvent(held('', -1, true), held('', -1, true))).toBeNull();
        // A man already holding it is not catching it again.
        expect(M.ballEvent(held('wr2', 0, true), held('wr2', 0, true))).toBeNull();
        // Hands that fill without a throw are not a catch.
        expect(M.ballEvent(held('', -1, false), held('wr2', 0, false))).toBeNull();
        expect(M.ballEvent(null, held('wr2', 0, true))).toBeNull();
    });

    test('a tackle on a quarterback who never threw or ran is a sack, and every other one is a tackle', () => {
        expect(M.tackleKind({ carrier: 'qb', threw: false, ran: false })).toBe('sack');
        expect(M.tackleKind({ carrier: 'qb', threw: false, ran: true })).toBe('tackle');
        expect(M.tackleKind({ carrier: 'qb', threw: true, ran: false })).toBe('tackle');
        expect(M.tackleKind({ carrier: 'wr1', threw: true, ran: false })).toBe('tackle');
    });

    test('every kind is taken a little after its event, and a tackle waits for the lean', () => {
        for (const kind of M.KINDS) {
            const d = M.delayFor(kind);
            expect(`${kind} ${d >= 0 && d < 0.5}`).toBe(`${kind} true`);
            expect(M.KIND_NAMES[kind]).toMatch(/^[A-Z][a-z]+$/);
        }
        expect(M.delayFor('tackle')).toBeGreaterThan(M.delayFor('catch'));
        // The throw is caught mid-sweep, never after the arm has finished.
        expect(M.delayFor('release')).toBeLessThan(CFG.pose.throwRelease.time);
        expect(M.delayFor('release')).toBeGreaterThan(CFG.pose.throwRelease.time * 0.25);
        expect(M.delayFor('nonsense')).toBe(0);
    });
});

describe('the best of them', () => {
    let t = 0;
    const m = (kind, hero, partner = null) => ({ kind, hero, partner, at: (t += 0.1) });

    test('by kind, best first: fifty, pick, catch, sack, tackle', () => {
        const list = [m('tackle', 'wr1', 'db1'), m('catch', 'wr1'), m('fifty', 'wr2'), m('sack', 'qb', 's1')];
        expect(M.rankMoments(list, null, 9).map((x) => x.kind)).toEqual(['fifty', 'catch', 'sack', 'tackle']);
    });

    test('the visitor\'s own moments first, as the hero or the man with him', () => {
        const catchB = m('catch', 'wr2');
        const tackleB = m('tackle', 'wr2', 'db3');
        const fiftyA = m('fifty', 'wr1');
        expect(M.rankMoments([fiftyA, catchB, tackleB], 'wr2', 9)).toEqual([catchB, tackleB, fiftyA]);
        // A defender in a tackle is in the picture too.
        expect(M.rankMoments([fiftyA, tackleB], 'db3', 9)).toEqual([tackleB, fiftyA]);
    });

    test('the throw: dropped when there is better, kept last for the visitor who threw it, kept when it is all there is', () => {
        const release = m('release', 'qb', 'wr1');
        const catchA = m('catch', 'wr1');
        const fiftyA = m('fifty', 'wr1');
        expect(M.rankMoments([release, catchA], null)).toEqual([catchA]);
        expect(M.rankMoments([release, catchA], 'wr3')).toEqual([catchA]);
        expect(M.rankMoments([release, fiftyA, catchA], 'qb')).toEqual([fiftyA, catchA, release]);
        expect(M.rankMoments([release], null)).toEqual([release]);
    });

    test('at most `keep`, ties in the order they happened, and the list handed in is left alone', () => {
        const a = m('tackle', 'wr1', 'db1');
        const b = m('tackle', 'wr2', 'db2');
        const list = [b, a, m('catch', 'wr1'), m('catch', 'wr2'), m('fifty', 'wr2')];
        const copy = list.slice();
        const ranked = M.rankMoments(list, null);
        // Checked after ONE call: an even number of calls would hide a
        // reversal, which is how this check first passed against one.
        expect(list).toEqual(copy);
        expect(ranked).toHaveLength(CFG.moments.keep);
        expect(M.rankMoments(list, null, 9).slice(-2)).toEqual([b, a].sort((x, y) => x.at - y.at));
        expect(M.rankMoments([], 'qb')).toEqual([]);
    });
});

describe('the console\'s plain shot of a moment', () => {
    test('from the side with more grass, inside the stands, aimed at the hero', () => {
        const edge = FIELD.width / 2 + FIELD.sideline;
        for (const z of [-10, -4, 0, 4, 10]) {
            const shot = M.previewShot({ x: 12, z, yaw: 0 });
            expect(Math.abs(shot.position.z)).toBeLessThanOrEqual(edge);
            expect(Math.abs(shot.position.z - z)).toBeCloseTo(CFG.moments.preview.distance, 9);
            expect(shot.target).toEqual({ x: 12, y: CFG.moments.preview.aimY, z });
        }
    });
});

/**
 * THE SNAPSHOT, ON A REAL THREE.
 */
describe('a snapshot keeps what was drawn, and the live frame comes back exactly', () => {
    let THREE;
    let S;
    let roster;

    beforeAll(async () => {
        THREE = await loadRealThree({ console });
        globalThis.THREE = THREE;
        S = await import(join(scene, 'snapshot.js'));
        roster = await import(join(scene, 'roster.js'));
    });

    /** Every node's transform, as plain numbers, to compare. */
    const pose = (rootNode) => {
        const out = [];
        rootNode.traverse((o) => out.push([
            o.position.x, o.position.y, o.position.z,
            o.rotation.x, o.rotation.y, o.rotation.z, o.rotation.order,
            o.scale.x, o.scale.y, o.scale.z, o.visible,
        ]));
        return out;
    };

    test('two real players, posed, snapped, posed again, and put back', () => {
        const group = new THREE.Group();
        const wr = roster.buildPlayer({ team: 0, positionGroup: 'wr', position: 'wr1' }, 0, null);
        const db = roster.buildPlayer({ team: 1, positionGroup: 'db', position: 'db1' }, 1, null);
        group.add(wr, db);

        // The live frame: running, one of them turned past half a turn, which
        // is the yaw a quaternion round trip would hand back rewrapped.
        roster.poseFigure(wr, 6, 1.1, { carry: 'tuck' }, 1 / 60);
        wr.position.set(14.2, 0.12, -3.4);
        wr.rotation.y = 4.0;
        db.position.set(15.0, 0.12, -2.9);
        const live = S.captureDrawn([group]);
        const livePose = pose(group);

        // The moment: reaching for a ball, leaning in, a marker hidden.
        roster.poseFigure(wr, 0, 0, { reach: 1, reachAt: { x: 0.2, y: 1.9, z: 0.4 } }, 1);
        wr.rotation.set(0.3, -2.0, 0.1);
        db.visible = false;
        const moment = S.captureDrawn([group]);
        const momentPose = pose(group);
        expect(momentPose).not.toEqual(livePose);

        S.applyDrawn(live);
        expect(pose(group)).toEqual(livePose);
        expect(wr.rotation.y).toBe(4.0);
        expect(wr.rotation.order).toBe('YXZ');
        S.applyDrawn(moment);
        expect(pose(group)).toEqual(momentPose);
        expect(db.visible).toBe(false);
        S.applyDrawn(live);
        expect(pose(group)).toEqual(livePose);
        expect(S.snapshotSize(live)).toBe(livePose.length);
        expect(S.snapshotSize(live)).toBeGreaterThan(20);
    });

    test('a missing root is skipped, and nothing at all is an empty snapshot', () => {
        const one = new THREE.Group();
        one.add(new THREE.Object3D());
        const snap = S.captureDrawn([null, one, undefined]);
        expect(S.snapshotSize(snap)).toBe(2);
        expect(S.snapshotSize(S.captureDrawn([]))).toBe(0);
        expect(S.applyDrawn(null)).toBe(false);
        expect(S.snapshotSize(null)).toBe(0);
    });
});
