// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-helmet.test.mjs - the shape of a football helmet, measured.
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB. The chainable proxy in
 * tests/helpers models no geometry, so every `Box3` taken against it comes back
 * empty and it will cheerfully agree that a helmet is any size at all. The only
 * way to ask whether a shell covers a head is to build it against the real
 * library and read a real bounding box, which is what `node:vm` is for.
 *
 * WHY IT IS WORTH THE TROUBLE. This helmet has now been wrong twice in ways
 * that a screenshot showed and nobody could name: first a hemisphere with one
 * hoop, which read as a swimming cap, and then a bigger shell that stopped
 * short of the hair so a black band ran round the back and it looked WORSE than
 * what it replaced. Both were geometry, both were invisible until somebody
 * enlarged a 60-pixel crop, and both are one Box3 away from being obvious.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let parts;
let HEAD;
let box;
let realHead;

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;

    const roster = await import(join(root, 'www/xo/js/roster.js'));
    HEAD = roster.HEAD;

    const shellMat = new THREE.MeshStandardMaterial({ color: 0xff992c });
    shellMat.side = THREE.DoubleSide;
    parts = roster.buildHelmetParts(
        shellMat, new THREE.MeshStandardMaterial({ color: 0x2a1a0c })
    );
    const group = new THREE.Group();
    for (const p of parts) group.add(p);
    group.updateMatrixWorld(true);
    box = (o) => new THREE.Box3().setFromObject(o);

    /**
     * AND A REAL HEAD TO MEASURE THE HELMET AGAINST, WHICH IS THE HOLE THIS
     * SUITE HAD.
     *
     * Everything below used to be checked against `roster.HEAD`, and
     * `roster.HEAD` is where the fault lived: it put the head at 1.62 by adding
     * the head's own radius twice, the helmet was built around that number, and
     * every test agreed the shell covered a head that is not there. The rig
     * actually puts it at 1.50, so the shell floated a quarter of a metre above
     * the skull at figure scale, in plain sight, for two rounds of QA.
     *
     * A number checked against itself is not a measurement. This builds an
     * actual `createPerson` and reads the actual head and hair, so the only way
     * to pass now is to cover the head the game really draws.
     */
    const people = await import(join(root, 'www/shared/js/people-1.0.0.js'));
    const person = people.createPerson({ role: 'customer', shoulderRound: 0.35 });
    person.position.set(0, 0, 0);
    person.updateMatrixWorld(true);
    // Everything above the neck: the head sphere, the hair, the ears and the
    // face. The neck cylinder tops out at 1.38, so this cannot catch a torso.
    const above = new THREE.Box3();
    person.traverse((o) => {
        if (!o.isMesh) return;
        const b = box(o);
        if (b.min.y > 1.385) above.union(b);
    });
    realHead = above;
});

const named = (name) => parts.filter((p) => p.name === name);
/** The dome is now TWO pieces, a closed crown cap and the band below it that
 *  carries the face opening, so "the shell" is their union. */
const shellBox = () => unionOf([...named('helmet-crown'), ...named('helmet-shell')]);
const unionOf = (list) => {
    const b = new THREE.Box3();
    for (const p of list) b.union(box(p));
    return b;
};

describe('the shell covers the head', () => {
    /**
     * MEASURED AGAINST A PERSON, NOT AGAINST A CONSTANT. See the note in
     * `beforeAll`: the constant was wrong for two rounds and every assertion
     * here agreed with it, which is the whole failure mode of a test that
     * restates the code.
     */
    test('the constant this file used to trust matches the real rig', () => {
        // `HEAD.y` is the head's centre, and the sphere is `r` either side.
        expect(HEAD.y - HEAD.r).toBeCloseTo(1.38, 2);
        expect(HEAD.hairHigh).toBeCloseTo(realHead.max.y, 2);
    });

    /**
     * THE FAULT THAT MADE IT LOOK WORSE. The previous shell reached 1.50 on
     * paper and its own scale pulled the real edge above that, so a band of
     * black hair showed all the way round the back below a pale dome. A gap
     * between a helmet and a head reads as a hat two sizes too small, and no
     * amount of facemask fixes it.
     */
    test('it reaches below the hair at the back', () => {
        expect(shellBox().min.y).toBeLessThanOrEqual(HEAD.hairLow);
    });

    test('and over the top of the head the rig actually builds', () => {
        expect(shellBox().max.y).toBeGreaterThanOrEqual(realHead.max.y);
    });

    /**
     * AND IT SITS ON HIM RATHER THAN OVER HIM. A shell whose centre is a long
     * way from the head's is a helmet floating above a bare head, which is
     * precisely what shipped. Half the head's own radius is generous and still
     * an order of magnitude tighter than the 0.12 that was wrong.
     */
    test('the shell is centred on the head, not hovering above it', () => {
        const shell = shellBox();
        const middle = (shell.max.y + shell.min.y) / 2;
        expect(Math.abs(middle - HEAD.y)).toBeLessThan(HEAD.r * 0.5);
    });

    /** And it covers the ears, which is where a real one drops into its flaps
     *  and the reason a helmet reads as a helmet from the side. */
    test('the whole assembly comes below the ear line', () => {
        const all = unionOf(parts);
        expect(all.min.y).toBeLessThan(1.482);
    });

    test('it is wider than the head, and not by a silly amount', () => {
        const b = shellBox();
        const halfWidth = (b.max.x - b.min.x) / 2;
        expect(halfWidth).toBeGreaterThan(HEAD.hairR);
        // A bubble was the first fault. Anything past about half again as wide
        // as the head it is covering stops being a helmet.
        expect(halfWidth).toBeLessThan(HEAD.hairR * 1.6);
    });

    test('it runs further back than it does forward, which is the shape', () => {
        const b = shellBox();
        expect(Math.abs(b.min.z)).toBeGreaterThan(b.max.z);
    });
});

describe('the facemask is in front of the face', () => {
    /**
     * THE FIRST CAGE WAS BURIED. Its bars sat at z = 0.132 against a shell that
     * reached 0.152, so they were inside it and all that showed was a few dark
     * specks near the chin. A facemask that is not in front of the face is not
     * a facemask.
     */
    test('it stands clear of the head', () => {
        expect(unionOf(named('helmet-mask')).max.z).toBeGreaterThan(HEAD.r + 0.03);
    });

    test('and clear of the shell it is bolted to', () => {
        expect(unionOf(named('helmet-mask')).max.z)
            .toBeGreaterThan(shellBox().max.z);
    });

    test('it spans the face rather than sitting on the chin', () => {
        const mask = unionOf(named('helmet-mask'));
        expect(mask.max.y - mask.min.y).toBeGreaterThan(0.09);
        expect(mask.max.x - mask.min.x).toBeGreaterThan(0.14);
    });

    test('and there is more than one bar, or it is a hoop again', () => {
        expect(named('helmet-mask').length).toBeGreaterThanOrEqual(4);
    });
});

describe('the silhouette', () => {
    test('ear flaps hang below the middle of the shell', () => {
        for (const flap of named('helmet-flap')) {
            expect(box(flap).min.y).toBeLessThan(HEAD.y - 0.05);
        }
        expect(named('helmet-flap').length).toBe(2);
    });

    test('the whole thing is longer than it is tall', () => {
        const whole = unionOf(parts);
        expect(whole.max.z - whole.min.z).toBeGreaterThan(whole.max.y - whole.min.y);
    });

    /**
     * THE FACE OPENING FACES FORWARD, and getting this wrong puts it over one
     * ear. Three builds a sphere as `z = r·sin(phi)·sin(theta)`, so phi = PI/2
     * is +Z and +Z is the way the rig faces. Read off the geometry rather than
     * off the arguments: the shell's vertices should thin out ahead of the head
     * and not behind it.
     */
    /**
     * AND THE CROWN IS CLOSED. A phi sweep removes a wedge of longitude and
     * longitudes MEET AT THE POLE, so a gap left for the face runs all the way
     * up and takes a pie slice out of the top of the helmet. That is exactly
     * what it did. The cap above the opening has the full sweep.
     */
    test('the crown has no wedge missing from it', () => {
        const pos = named('helmet-crown')[0].geometry.attributes.position;
        // Every quadrant around the axis should carry vertices. A gap shows up
        // as one of them empty.
        const quads = [0, 0, 0, 0];
        for (let i = 0; i < pos.count; i += 1) {
            const a = Math.atan2(pos.getZ(i), pos.getX(i));
            quads[Math.floor(((a + Math.PI) / (Math.PI / 2)) % 4)] += 1;
        }
        for (const n of quads) expect(n).toBeGreaterThan(pos.count * 0.15);
    });

    test('and the crown reaches down to meet the opening below it', () => {
        const crown = box(named('helmet-crown')[0]);
        const band = box(named('helmet-shell')[0]);
        // They overlap or touch: a gap between them would be a visible seam.
        expect(crown.min.y).toBeLessThanOrEqual(band.max.y + 1e-6);
    });

    test('the opening is at the front, not over an ear', () => {
        const pos = named('helmet-shell')[0].geometry.attributes.position;
        let ahead = 0;
        let behind = 0;
        let left = 0;
        let right = 0;
        for (let i = 0; i < pos.count; i += 1) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (Math.abs(z) > Math.abs(x)) { if (z > 0) ahead += 1; else behind += 1; }
            else if (x > 0) right += 1; else left += 1;
        }
        expect(ahead).toBeLessThan(behind * 0.7);
        // And it is not lopsided, which a mis-centred sweep would be.
        expect(Math.abs(left - right)).toBeLessThan(Math.max(left, right) * 0.25);
    });
});

/**
 * THE VISITOR AT QUARTERBACK (specs/avatar M7, 2026-10-26). With a saved
 * avatar the quarterback is the avatar exactly as the avatar page draws it.
 * NO HELMET (Steve's QA, 2026-10-27): the first build put the team's helmet
 * over it, took the hat off and trimmed the hair under the rim, and the
 * tests here measured every hair style under the shell. Now they measure the
 * opposite: nothing of the avatar's head is hidden, trimmed or recolored.
 */
describe("the visitor's avatar at quarterback", () => {
    let roster;
    let A;
    let figure;
    const QB = { team: 0, positionGroup: 'qb', position: 'qb' };
    const WR = { team: 0, positionGroup: 'wr', position: 'wr1' };
    const HELMET_PARTS = ['helmet-crown', 'helmet-shell', 'helmet-flap', 'helmet-mask', 'helmet-strap'];

    beforeAll(async () => {
        roster = await import(join(root, 'www/xo/js/roster.js'));
        A = await import(join(root, 'www/shared/js/avatar-1.0.0.js'));
        figure = await import(join(root, 'www/shared/js/avatar-figure-1.0.0.js'));
    });

    /** A figure at life size, at the origin, its matrices current. */
    const plain = (person) => {
        person.scale.setScalar(1);
        person.position.set(0, 0, 0);
        person.updateMatrixWorld(true);
        return person;
    };
    const shown = (m) => {
        for (let p = m; p; p = p.parent) if (p.visible === false) return false;
        return true;
    };

    test('without a saved avatar the quarterback is exactly a plain player', () => {
        const outline = (person) => {
            const out = [];
            // Everything but the root's own name, which carries the position.
            person.traverse((o) => out.push(`${o.type}:${o === person ? '' : o.name}:${o.geometry ? o.geometry.type : ''}`));
            return out;
        };
        const qb = roster.buildPlayer(QB, 0, null);
        const wr = roster.buildPlayer(WR, 0, null);
        expect(outline(qb)).toEqual(outline(wr));
        expect(qb.userData.avatar).toBeUndefined();
        expect(qb.children.filter((o) => o.name === 'jersey-mark').length).toBeGreaterThan(0);
        expect(roster.helmetRim()).toBeCloseTo(1.367, 2);
        // The usual quarterback keeps his helmet.
        for (const name of HELMET_PARTS) {
            expect(`${name}: ${qb.children.filter((o) => o.name === name).length > 0}`).toBe(`${name}: true`);
        }
    });

    test('with one: no helmet, their own hat and glasses, no letter on the shirt, and nothing recolors with the team', () => {
        const hat = A.HATS.find((h) => h.id !== 'none').id;
        const qb = plain(roster.buildPlayer(QB, 0, { hat, glasses: 'sunglasses', shirt: 'teal' }));
        expect(qb.userData.avatar).toBe(true);
        const head = qb.children.find((o) => o.name === 'head');
        expect(head).toBeDefined();
        expect(head.children.find((o) => o.name === 'hat')).toBeDefined();
        expect(head.children.find((o) => o.name === 'glasses')).toBeDefined();
        expect(qb.children.filter((o) => o.name === 'jersey-mark')).toHaveLength(0);
        for (const name of HELMET_PARTS) {
            expect(`${name}: ${qb.children.filter((o) => o.name === name).length}`).toBe(`${name}: 0`);
        }
        // Nothing of theirs is tagged for the team's colors: not the shirt,
        // and no longer a helmet.
        let tagged = 0;
        qb.traverse((o) => {
            if (o.isMesh && o.material.userData && o.material.userData.kit) tagged++;
        });
        expect(tagged).toBe(0);
        // The field's gloved hands, as every other player's: the rig sizes
        // the hand's geometry by `handScale`, so the two hands measure alike.
        const handOf = (person) => {
            const hand = person.userData.arms[0].userData.forearm.children.find((c) => c.userData && c.userData.isHand);
            hand.updateMatrixWorld(true);
            return box(hand).getSize(new THREE.Vector3());
        };
        const theirs = handOf(qb);
        const ours = handOf(plain(roster.buildPlayer(WR, 0, null)));
        expect(theirs.x).toBeCloseTo(ours.x, 6);
        expect(theirs.y).toBeCloseTo(ours.y, 6);
        expect(qb.userData.lift).toBeGreaterThan(0);
    });

    test('every hair style, on a round and an oval face, is shown whole: nothing hidden, nothing trimmed', () => {
        // The hair as the avatar page itself draws it, piece for piece and
        // vertex for vertex, so a hidden piece or a trimmed hank shows.
        const hairOf = (person) => {
            const head = person.children.find((o) => o.name === 'head');
            const hair = head.children.find((o) => o.userData && o.userData.isHair);
            if (!hair) return null;
            const pieces = [];
            hair.traverse((m) => {
                if (m.isMesh) pieces.push(`${m.name}:${m.geometry.type}:${m.geometry.attributes.position.count}:${shown(m)}`);
            });
            return pieces;
        };
        let styles = 0;
        for (const faceShape of A.FACE_SHAPES.map((f) => f.id)) {
            for (const style of A.HAIR_LENGTHS) {
                const avatar = { length: style.id, faceShape };
                const theirs = hairOf(plain(roster.buildPlayer(QB, 0, avatar)));
                const own = hairOf(plain(figure.createAvatar(avatar, { role: 'customer' }).person));
                if (!own) continue;
                styles++;
                expect(theirs).toEqual(own);
                expect(theirs.every((p) => p.endsWith(':true'))).toBe(true);
            }
        }
        expect(styles).toBeGreaterThan(10);
    });
});

/**
 * WHICH HAND THROWS (Steve, 2026-10-26): the quarterback was left-handed from
 * the day the poses were written, and nobody noticed until the visitor's own
 * avatar took the snap. Right-handed now, and a left-handed avatar throws
 * with its left. The poses are mirrored, so one side's throw is the other's
 * with the sideways angles negated.
 */
describe('which hand throws', () => {
    let roster;
    let CFG;
    const QB = { team: 0, positionGroup: 'qb', position: 'qb' };

    beforeAll(async () => {
        roster = await import(join(root, 'www/xo/js/roster.js'));
        ({ XO_CONFIG: CFG } = await import(join(root, 'www/xo/js/config.js')));
    });

    const armOn = (person, side) => person.userData.arms.find((a) => a.userData.armSide === side);
    /** The cocked throw, mid-sweep, which the pose writes exactly (no easing). */
    const cock = (person) => roster.poseFigure(person, 0, 0, { carry: 'throw', snapT: 1, throwT: 0.5 }, 1 / 60);

    test('the field throws right-handed, and the figure\'s right arm is the negative side', () => {
        expect(roster.THROWING_SIDE).toBe(-1);
        const qb = roster.buildPlayer(QB, 0, null);
        expect(roster.throwSideOf(qb)).toBe(-1);
        // The rig hangs the right arm at negative x (the figure faces +z).
        expect(armOn(qb, -1).position.x).toBeLessThan(0);
        expect(roster.throwSideOf(null)).toBe(-1);
        expect(roster.throwSideOf({ userData: { throwSide: 2 } })).toBe(-1);
    });

    test('a left-handed avatar throws with its left, the mirror of the field\'s right', () => {
        const righty = roster.buildPlayer(QB, 0, { handedness: 'right' });
        const lefty = roster.buildPlayer(QB, 0, { handedness: 'left' });
        const plain = roster.buildPlayer(QB, 0, null);
        expect(roster.throwSideOf(righty)).toBe(-1);
        expect(roster.throwSideOf(lefty)).toBe(1);
        cock(righty);
        cock(lefty);
        cock(plain);
        // The right-handed avatar's right arm is cocked exactly as the field's.
        expect(armOn(righty, -1).rotation.x).toBeCloseTo(armOn(plain, -1).rotation.x, 9);
        expect(armOn(righty, -1).rotation.z).toBeCloseTo(armOn(plain, -1).rotation.z, 9);
        // The left-handed one's LEFT arm is that pose mirrored: the lift the
        // same, the sideways angle the other way, and the elbow the same.
        expect(armOn(lefty, 1).rotation.x).toBeCloseTo(armOn(plain, -1).rotation.x, 9);
        expect(armOn(lefty, 1).rotation.z).toBeCloseTo(-armOn(plain, -1).rotation.z, 9);
        expect(armOn(lefty, 1).userData.forearm.rotation.x).toBeCloseTo(armOn(plain, -1).userData.forearm.rotation.x, 9);
        // And their off hands match the same way.
        expect(armOn(lefty, -1).rotation.x).toBeCloseTo(armOn(plain, 1).rotation.x, 2);
        // A stiff-arm never takes the carrying arm, whichever it is.
        expect(roster.stiffSide({ stiffArmSide: 1, carry: 'tuck' }, 1)).toBe(-1);
        expect(roster.stiffSide({ stiffArmSide: -1, carry: 'tuck' }, -1)).toBe(1);
    });

    test('the held ball sits on the throwing side', async () => {
        const view = await import(join(root, 'www/xo/js/view.js'));
        const right = view.carryHold('throw', 1);
        const left = view.carryHold('throw', 1, 1, 1);
        expect(right.ball.x).toBeCloseTo(-CFG.pose.throwHold.ball.x, 9);
        expect(left.ball.x).toBeCloseTo(CFG.pose.throwHold.ball.x, 9);
        expect(left.ball.y).toBe(right.ball.y);
        expect(left.aim.x).toBeCloseTo(-right.aim.x, 9);
    });
});
