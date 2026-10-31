// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-dance.test.mjs - the shared dances on an X's and O's player, measured
 * (Steve, 2026-10-30: "add the shared dance moves to the list of celebration
 * options").
 *
 * A REAL THREE, because every question here is about where something is
 * drawn: that giving a player the shared part's waist and neck at build
 * (roster.js `jointFigure`, dance-1.0.0 `jointPerson`) moved nothing, that a
 * pose turns the helmet with the neck and bows the letter with the waist and
 * leaves the legs and the shadow where they are, that the ball rides in the
 * hand, and that no dance offered to a helmeted man puts a hand inside his
 * helmet: the shared part solved its contact poses for a bare head, and a
 * helmet is a size larger (the scratch measurement that split the list).
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const js = (f) => join(root, 'www', 'xo', 'js', f);

let THREE;
let CFG;
let roster;
let view;
let Cel;
let Dn;
let people;
let objects;
let ball;
let arm;

const DT = 1 / 60;
const WR = { team: 0, positionGroup: 'wr', position: 'wr1' };

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
    // THE MIN BUILD, as view.js imports it: the roster's figures live in that
    // module's own map, and a second copy of the module would build a roster
    // the view never sees (xo-posting-drawn learned the same).
    roster = await import(js('roster.min.js'));
    view = await import(js('view.js'));
    Cel = await import(js('celebration.js'));
    Dn = await import(join(root, 'www/shared/js/dance-1.0.0.js'));
    people = await import(join(root, 'www/shared/js/people-1.0.0.js'));
    ball = await import(js('ball.min.js'));
    arm = await import(js('arm.min.js'));
    const scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
    ball.initBall(scene);
});

const world = (o) => { o.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
/** Identity, asserted as a boolean: a failing `toBe` on two scene-graph
 *  objects has Jest print a diff of the whole roster, geometry arrays and
 *  all, which takes minutes and reads as a hang. */
const same = (a, b) => expect(a === b).toBe(true);
const named = (person, name) => { const out = []; person.traverse((o) => { if (o !== person && o.name === name) out.push(o); }); return out; };
const under = (node, group) => { for (let p = node.parent; p; p = p.parent) if (p === group) return true; return false; };
const armOn = (figure, side) => figure.userData.arms.find((a) => a.userData.armSide === side);
const handOf = (arm) => arm.userData.forearm.children.find((c) => c.isMesh && c.userData.isHand);
/** A fresh player at the origin, life size, posed to rest. */
function player(settings = WR, avatar = null) {
    const f = roster.buildPlayer(settings, 0, avatar);
    f.position.set(0, f.userData.lift, 0);
    f.rotation.set(0, 0, 0);
    f.updateMatrixWorld(true);
    return f;
}
/** The shared part's rig over an X's and O's figure's own joints, so
 *  `applyPose` can put it in any pose exactly (the root is a throwaway). */
function rigOf(f) {
    return {
        root: new THREE.Group(), person: f, waist: f.userData.waist, neck: f.userData.neck,
        arms: { L: armOn(f, 1), R: armOn(f, -1) },
        legs: { L: f.userData.legs.find((l) => l.userData.legSide > 0), R: f.userData.legs.find((l) => l.userData.legSide < 0) },
    };
}

describe('every player is jointed at build', () => {
    test('the helmet is the neck\'s, the arms and the letter the waist\'s, the legs and the shadow the body\'s own', () => {
        for (const obj of objects) {
            const f = roster.figureFor(obj.settings.position);
            expect(f.userData.waist).toBeTruthy();
            expect(f.userData.neck).toBeTruthy();
            same(f.userData.neck.parent, f.userData.waist);
            same(f.userData.waist.parent, f);
            for (const name of ['helmet-crown', 'helmet-shell', 'helmet-flap', 'helmet-mask', 'helmet-strap', 'helmet-stripe']) {
                const parts = named(f, name);
                expect(parts.length).toBeGreaterThan(0);
                expect(parts.every((p) => p.parent === f.userData.neck)).toBe(true);
            }
            expect(f.userData.arms).toHaveLength(2);
            expect(f.userData.arms.every((a) => a.parent === f.userData.waist)).toBe(true);
            expect(named(f, 'jersey-mark').every((m) => m.parent === f.userData.waist)).toBe(true);
            expect(f.userData.legs).toHaveLength(2);
            expect(f.userData.legs.every((l) => l.parent === f)).toBe(true);
            expect(named(f, 'pants-stripe').every((s) => s.parent.userData.isLeg)).toBe(true);
            const shadow = named(f, 'contact-shadow');
            expect(shadow).toHaveLength(1);
            same(shadow[0].parent, f);
            // The arms turn twist first, as the shared poses are written.
            expect(f.userData.arms.every((a) => a.rotation.order === 'XZY')).toBe(true);
        }
    });

    test('and nothing moved: the crown, the shoulders, the letter and the shadow are where they were built, scaled', () => {
        const f = player();
        const S = CFG.figureScale;
        const lift = f.userData.lift;
        const crown = world(named(f, 'helmet-crown')[0]);
        expect(crown.x).toBeCloseTo(roster.SHELL.at[0] * S, 6);
        expect(crown.y).toBeCloseTo(roster.SHELL.at[1] * S + lift, 6);
        expect(crown.z).toBeCloseTo(roster.SHELL.at[2] * S, 6);
        // The shoulders, against the rig's own unjointed figure.
        const plain = people.createPerson({ role: 'customer', shoulderRound: 0.35, handScale: 1.9 });
        for (const side of [1, -1]) {
            const ours = world(armOn(f, side));
            const theirs = plain.children.find((c) => c.userData && c.userData.isArm && c.userData.armSide === side);
            expect(ours.x).toBeCloseTo(theirs.position.x * S, 6);
            expect(ours.y).toBeCloseTo(theirs.position.y * S + lift, 6);
            expect(ours.z).toBeCloseTo(theirs.position.z * S, 6);
        }
        // The arm solver was measured off the arm BEFORE the jointing moved
        // it under the waist: its shoulder is still the rig's, not the
        // waist's child's.
        const shoulder = plain.children.find((c) => c.userData && c.userData.isArm);
        expect(arm.RIG.shoulderY).toBeCloseTo(shoulder.position.y, 6);
        expect(arm.RIG.shoulderY).toBeGreaterThan(1);
        const torso = roster.measureTorso(plain, false);
        const mark = world(named(f, 'jersey-mark')[0]);
        expect(mark.y).toBeCloseTo(torso.y * S + lift, 6);
        expect(world(named(f, 'contact-shadow')[0]).y).toBeCloseTo(0.02 * S + lift, 6);
        // The soles stand on the field's lift, as every figure always has.
        expect(lift).toBeCloseTo(0.055 * S, 6);
        expect(roster.FIGURE_LIFT).toBeCloseTo(0.055 * S, 6);
    });

    test('the visitor\'s avatar is jointed the same way, hat and all on the neck', () => {
        const f = player({ team: 0, positionGroup: 'qb', position: 'qb' }, { hat: 'cap', glasses: 'sunglasses', shirt: 'teal' });
        expect(roster.isVisitorFigure(f)).toBe(true);
        const head = named(f, 'head')[0];
        expect(head).toBeTruthy();
        expect(under(head, f.userData.neck)).toBe(true);
        expect(f.userData.arms.every((a) => a.parent === f.userData.waist)).toBe(true);
        same(named(f, 'contact-shadow')[0].parent, f);
    });
});

describe('a shared pose on a player', () => {
    /** Run the pose through roster.js's own poser until it has settled. */
    const settle = (f, pose, frames = 240) => {
        for (let i = 0; i < frames; i += 1) {
            roster.poseFigure(f, 0, 0, pose ? { carry: 'hand', celebrate: { arms: 'dance', amount: 1, pose } } : {}, DT);
        }
        f.updateMatrixWorld(true);
    };

    test('turns the helmet with the neck and leaves the legs standing', () => {
        const f = player();
        settle(f, null);
        const flap = named(f, 'helmet-flap')[0];
        const before = world(flap);
        const legsBefore = f.userData.legs.map((l) => world(l).toArray());
        settle(f, Dn.pose({ neck: { y: 0.6 } }));
        const after = world(flap);
        expect(after.distanceTo(before)).toBeGreaterThan(0.05);
        expect(after.y).toBeCloseTo(before.y, 3);
        expect(f.userData.legs.map((l) => world(l).toArray())).toEqual(legsBefore);
        expect(world(named(f, 'jersey-mark')[0]).z).toBeCloseTo(world(named(f, 'jersey-mark')[0]).z, 9);
    });

    test('bows the letter forward from the waist, the shadow and the legs staying put', () => {
        const f = player();
        settle(f, null);
        const mark = named(f, 'jersey-mark')[0];
        const before = world(mark);
        const shadowBefore = world(named(f, 'contact-shadow')[0]);
        const legsBefore = f.userData.legs.map((l) => world(l).toArray());
        settle(f, Dn.pose({ waist: { x: 0.45 } }));
        const after = world(mark);
        // Forward is +z on this rig, and a bow brings the chest down a little.
        expect(after.z).toBeGreaterThan(before.z + 0.1);
        expect(after.y).toBeLessThan(before.y);
        expect(world(named(f, 'contact-shadow')[0]).toArray()).toEqual(shadowBefore.toArray());
        expect(f.userData.legs.map((l) => world(l).toArray())).toEqual(legsBefore);
        // The crown bows with the torso, since the neck is the waist's.
        expect(world(named(f, 'helmet-crown')[0]).z).toBeGreaterThan(roster.SHELL.at[2] * CFG.figureScale + 0.2);
    });

    test('puts the arms exactly where the shared part would, so its contact poses hold', () => {
        const f = player();
        const ref = player();
        const pose = Dn.danceAt(Dn.danceOf('ymca'), Dn.danceOf('ymca').beat * 1.3);   // the M: hands on the shoulders
        settle(f, pose);
        Dn.applyPose(rigOf(ref), pose);
        ref.updateMatrixWorld(true);
        for (const side of [1, -1]) {
            const ours = world(handOf(armOn(f, side)));
            const theirs = world(handOf(armOn(ref, side)));
            expect(ours.distanceTo(theirs)).toBeLessThan(0.01);
        }
    });

    test('and the ball rides in the hand: handPoint is the hand, and the view puts the ball there', () => {
        const f = player();
        settle(f, Dn.danceAt(Dn.danceOf('robot'), 0.7));
        for (const side of [1, -1]) {
            const got = view.handPoint(f, side);
            const want = world(handOf(armOn(f, side)));
            expect(got.x).toBeCloseTo(want.x, 6);
            expect(got.y).toBeCloseTo(want.y, 6);
            expect(got.z).toBeCloseTo(want.z, 6);
        }
        expect(view.handPoint({ userData: { arms: [] } }, 1)).toBeNull();
        expect(view.handPoint(null, 1)).toBeNull();

        // On the field: a receiver holding the ball dances the Robot, and the
        // ball follows his throwing hand frame by frame.
        const carrier = objects.find((o) => o.settings.position === 'wr1');
        for (const o of objects) if (o.state) { o.state.hasBall = false; o.state.run = false; o.state.xSpeed = 0; o.state.ySpeed = 0; }
        carrier.state.hasBall = true;
        const at = (o) => ({ position: o.settings.position, x: o.coords.x, z: o.coords.y });
        const offered = Cel.dancesFor(false);
        const seq = [0.05, (offered.indexOf('robot') + 0.5) / offered.length];
        let i = 0;
        const plan = Cel.chooseCelebration({
            hero: at(carrier), mates: [], rivals: [], scored: true, roll: () => (i < seq.length ? seq[i++] : 0.5),
        });
        expect(plan.dance).toBe('robot');
        view.resetCelebration();
        view.beginCelebration(plan);
        const figure = roster.figureFor('wr1');
        for (let k = 0; k < 90; k += 1) {
            view.syncFigures(objects, DT, { live: false });
            view.syncBall(null, carrier, DT);
        }
        const hand = view.handPoint(figure, roster.throwSideOf(figure));
        const b = ball.getBall().position;
        expect(Math.hypot(b.x - hand.x, b.y - hand.y, b.z - hand.z)).toBeLessThan(0.02);
        // Both arms are dancing: neither is tucked at the ribs.
        const tucked = roster.buildPlayer(WR, 0, null);
        roster.poseFigure(tucked, 0, 0, { carry: 'tuck' }, 10);
        const ballArm = armOn(figure, roster.throwSideOf(figure));
        const tuckArm = armOn(tucked, roster.throwSideOf(tucked));
        expect(Math.abs(ballArm.rotation.x - tuckArm.rotation.x) + Math.abs(ballArm.rotation.z - tuckArm.rotation.z)).toBeGreaterThan(0.2);
        expect(figure.userData.waist.rotation.y).not.toBe(0);
        view.resetCelebration();
        carrier.state.hasBall = false;
    });
});

describe('the hands and the helmet', () => {
    /** The share of a dance's loop a hand spends inside the helmet's shell,
     *  and how near the nearest sample came (1 is the shell's surface). */
    function insideShell(f, dance) {
        const rig = rigOf(f);
        const S = roster.SHELL;
        const inv = new THREE.Matrix4();
        const w = new THREE.Vector3();
        const local = new THREE.Vector3();
        let inside = 0;
        let n = 0;
        let nearest = Infinity;
        for (let t = 0; t < Dn.loopOf(dance); t += 0.02) {
            Dn.applyPose(rig, Dn.danceAt(dance, t));
            f.updateMatrixWorld(true);
            // The shell is the neck's child at SHELL.at, so measure in the
            // neck's frame, which is in the rig's own metres.
            inv.copy(rig.neck.matrixWorld).invert();
            for (const k of ['L', 'R']) {
                handOf(rig.arms[k]).getWorldPosition(w);
                local.copy(w).applyMatrix4(inv);
                const dx = (local.x - S.at[0]) / S.scale[0];
                const dy = (local.y - (S.at[1] - Dn.RIG.neck)) / S.scale[1];
                const dz = (local.z - S.at[2]) / S.scale[2];
                const r = Math.hypot(dx, dy, dz) / S.r;
                n += 1;
                if (r < 1) inside += 1;
                nearest = Math.min(nearest, r);
            }
        }
        Dn.applyPose(rig, Dn.REST);
        return { share: inside / n, nearest };
    }

    test('no dance offered to a helmeted man puts a hand inside his helmet, and each bare-head one would', () => {
        const f = player();
        for (const id of CFG.pose.celebration.sharedDances) {
            const { share, nearest } = insideShell(f, Dn.danceOf(id));
            expect([id, share]).toEqual([id, 0]);
            expect(nearest).toBeGreaterThan(1.05);
        }
        for (const id of CFG.pose.celebration.bareHeadDances) {
            const { share } = insideShell(f, Dn.danceOf(id));
            expect([id, share > 0.05]).toEqual([id, true]);
        }
        // The two lists between them are the shared part's whole catalogue.
        expect([...CFG.pose.celebration.sharedDances, ...CFG.pose.celebration.bareHeadDances].sort())
            .toEqual(Dn.DANCES.map((d) => d.id).sort());
    });
});
