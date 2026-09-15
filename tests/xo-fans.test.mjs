// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-fans.test.mjs - is a fan in the stands a whole person, and affordable?
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB, for the helmet and arm
 * suites' reason: the stub has no vertices, so a fan baked against it is empty
 * and every question about where its hands are comes back as undefined.
 *
 * fans.js builds one `createPerson`, bakes every mesh into place and merges the
 * pieces by colour, so the things that can go quietly wrong are all geometry:
 * a part sorted into the wrong piece (and tinted the wrong colour), a part lost
 * altogether, a rebuilt torso landing somewhere other than the original, arms
 * that are not where the pose says, and a crowd too heavy for a phone.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let Fans;
let St;
let Mi;
let CFG;
let S;
let parts;
let figure;

const box = (geometry) => {
    geometry.computeBoundingBox();
    return geometry.boundingBox;
};

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;

    CFG = (await import(join(root, 'www/xo/js/config.js'))).XO_CONFIG;
    Fans = await import(join(root, 'www/xo/js/fans.js'));
    St = await import(join(root, 'www/xo/js/stunt.js'));
    Mi = await import(join(root, 'www/xo/js/milestones.js'));
    S = (await import(join(root, 'www/xo/js/field.js'))).standLayout();
    const people = await import(join(root, 'www/shared/js/people-1.0.0.js'));

    parts = Fans.buildFanParts();

    // The same figure the fan is baked from, built plainly for comparison.
    figure = people.createPerson({ role: 'customer', shoulderRound: 0.35, handScale: 1.3, sleeveColor: 0x335577 });
    figure.position.set(0, 0, 0);
    figure.scale.setScalar(CFG.crowd.scale);
    figure.updateMatrixWorld(true);
});

/** The union of a fan's boxes in one pose and hair style. */
function fanBox(pose = 'down', hair = 'short') {
    const out = new THREE.Box3();
    for (const g of [...Object.values(parts.body), parts.hair[hair], parts.arms[pose].sleeve, parts.arms[pose].hand]) {
        out.union(box(g));
    }
    return out;
}

describe('a fan is a whole person', () => {
    test('every piece is built, finite, and indexes only vertices it has', () => {
        const all = [
            ...Object.values(parts.body), ...Object.values(parts.hair),
            ...Fans.POSES.flatMap((p) => [parts.arms[p].sleeve, parts.arms[p].hand]),
        ];
        for (const g of all) {
            const p = g.attributes.position;
            expect(p.count).toBeGreaterThan(0);
            for (let k = 0; k < p.array.length; k += 1) expect(Number.isFinite(p.array[k])).toBe(true);
            for (let k = 0; k < g.attributes.normal.array.length; k += 1) {
                expect(Number.isFinite(g.attributes.normal.array[k])).toBe(true);
            }
            for (let k = 0; k < g.index.count; k += 1) expect(g.index.getX(k)).toBeLessThan(p.count);
        }
    });

    test('baked, it is the same size and shape as the shared figure, standing on its soles', () => {
        const baked = fanBox('down', 'short');
        const real = new THREE.Box3().setFromObject(figure);
        const lift = -real.min.y;
        // A capped sphere is a little smaller than a round one, never bigger.
        expect(baked.min.y).toBeCloseTo(0, 3);
        expect(Math.abs(baked.max.y - (real.max.y + lift))).toBeLessThan(0.03);
        expect(Math.abs(baked.max.x - real.max.x)).toBeLessThan(0.03);
        expect(Math.abs(baked.min.x - real.min.x)).toBeLessThan(0.03);
        expect(Math.abs(baked.max.z - real.max.z)).toBeLessThan(0.03);
    });

    test('the rebuilt torso sits exactly where the shared part put it', () => {
        let torso = null;
        figure.traverse((o) => { if (o.isMesh && o.geometry.type === 'ExtrudeGeometry') torso = o; });
        const real = new THREE.Box3().setFromObject(torso);
        const lift = -new THREE.Box3().setFromObject(figure).min.y;
        const shirt = box(parts.body.shirt);
        expect(Math.abs(shirt.min.x - real.min.x)).toBeLessThan(0.01);
        expect(Math.abs(shirt.max.x - real.max.x)).toBeLessThan(0.01);
        expect(Math.abs(shirt.min.y - (real.min.y + lift))).toBeLessThan(0.01);
    });

    test('it has a face: eyes and pupils in front of the head at eye height, and a nose', () => {
        const fixed = parts.body.fixed;
        const p = fixed.attributes.position;
        const c = fixed.attributes.color;
        let white = 0;
        let dark = 0;
        for (let k = 0; k < p.count; k += 1) {
            const onFace = Math.abs(p.getY(k) - parts.eyeHeight) < 0.1 && p.getZ(k) > 0.08;
            if (!onFace) continue;
            if (c.getX(k) > 0.9 && c.getY(k) > 0.9 && c.getZ(k) > 0.9) white += 1;
            if (c.getX(k) < 0.05 && c.getY(k) < 0.05 && c.getZ(k) < 0.05) dark += 1;
        }
        expect(white).toBeGreaterThan(0);
        expect(dark).toBeGreaterThan(0);
        // The nose is the part of the skin furthest forward, and it is on the face.
        const skin = parts.body.skin.attributes.position;
        let front = { z: -Infinity, y: 0 };
        for (let k = 0; k < skin.count; k += 1) if (skin.getZ(k) > front.z) front = { z: skin.getZ(k), y: skin.getY(k) };
        expect(Math.abs(front.y - parts.eyeHeight)).toBeLessThan(0.1);
        expect(parts.top).toBeGreaterThan(parts.eyeHeight);
    });

    test('every hair style sits on the head, and no tag colour survives into the paint', () => {
        const k = CFG.crowd.scale;
        const head = { low: parts.eyeHeight - 0.35 * k, high: parts.top + 0.12 * k };
        for (const style of Fans.HAIR) {
            const b = box(parts.hair[style]);
            expect(b.max.y).toBeGreaterThan(parts.top - 0.02 * k);
            expect(b.max.y).toBeLessThan(head.high);
            expect(b.min.y).toBeGreaterThan(head.low);
        }
        const tags = Object.values(Fans.TAG).map((hex) => new THREE.Color(hex));
        const c = parts.body.fixed.attributes.color;
        for (let k = 0; k < c.count; k += 1) {
            for (const t of tags) {
                const same = Math.abs(c.getX(k) - t.r) < 1e-4 && Math.abs(c.getY(k) - t.g) < 1e-4 && Math.abs(c.getZ(k) - t.b) < 1e-4;
                expect(same).toBe(false);
            }
        }
    });
});

describe('the arms are where the pose says', () => {
    test('arms down hang the hands below the waist, beside the body', () => {
        const hands = box(parts.arms.down.hand);
        expect(hands.max.y).toBeLessThan(box(parts.body.shirt).min.y + 0.05);
        expect(hands.max.x).toBeGreaterThan(box(parts.body.shirt).max.x);
    });

    test('arms up put both hands over the head, clear of it', () => {
        const hands = box(parts.arms.up.hand);
        expect(hands.min.y).toBeGreaterThan(parts.top);
        expect(hands.min.x).toBeLessThan(-0.2);
        expect(hands.max.x).toBeGreaterThan(0.2);
    });

    test('holding a card puts the hands in front of the face, and the board of cards passes over every fan', () => {
        const k = CFG.crowd.scale;
        const hands = box(parts.arms.cards.hand);
        expect(hands.min.z).toBeGreaterThan(box(parts.body.shirt).max.z);
        expect(hands.max.y).toBeGreaterThan(parts.eyeHeight - 0.15 * k);
        expect(hands.min.y).toBeLessThan(parts.eyeHeight + 0.06 * k);
        // Every vertex of a fan holding cards, in every hair style, lies under
        // the board: no hand, head or hair stands in front of a letter. The
        // fan faces the field, which is -z for the far stand, so a vertex at
        // local z is at |z| = seat - z.
        const seat = { y: S.top(1), z: S.out(1) };
        const pieces = [...Object.values(parts.body), ...Object.values(parts.hair), parts.arms.cards.sleeve, parts.arms.cards.hand];
        for (const g of pieces) {
            const p = g.attributes.position;
            for (let v = 0; v < p.count; v += 1) {
                const board = St.boardHeightAt(seat, seat.z - p.getZ(v));
                expect(seat.y + p.getY(v)).toBeLessThan(board - 0.05);
            }
        }
    });
});

describe('the card stunt is one board', () => {
    test('each riser\'s upper card ends exactly where the next riser\'s lower card begins, up the slope', () => {
        const at = St.cardLayout();
        for (let r = 0; r < S.rows - 1; r += 1) {
            const upper = St.cardSpot({ y: S.top(r), z: S.out(r) }, true);
            const lower = St.cardSpot({ y: S.top(r + 1), z: S.out(r + 1) }, false);
            // Centre to centre is exactly one card's length along the slope.
            expect(Math.hypot(lower.y - upper.y, lower.out - upper.out)).toBeCloseTo(at.half * 2, 6);
            expect((lower.y - upper.y) / (lower.out - upper.out)).toBeCloseTo(at.rise / at.run, 6);
        }
        // Within a riser too: the upper card is one card's length above the lower.
        const seat = { y: S.top(2), z: S.out(2) };
        const up = St.cardSpot(seat, true);
        const down = St.cardSpot(seat, false);
        expect(Math.hypot(up.y - down.y, up.out - down.out)).toBeCloseTo(at.half * 2, 6);
    });
});

describe('the gold ball at 500 has laces', () => {
    test('cross stitches and a seam, every piece lying on the leather', async () => {
        const B = await import(join(root, 'www/xo/js/ball.js'));
        const plain = B.buildLaces(new THREE.MeshBasicMaterial());
        const seamed = B.buildLaces(new THREE.MeshBasicMaterial(), { seam: true });
        expect(plain.children.length).toBe(B.lacePositions().length);
        expect(seamed.children.length).toBeGreaterThan(plain.children.length);
        const xs = plain.children.map((m) => m.position.x);
        for (const piece of seamed.children) {
            expect(Math.abs(piece.position.y - B.radiusAt(piece.position.x))).toBeLessThan(0.005);
        }
        // The seam runs the length of the stitches and a little past both ends.
        const seamXs = seamed.children.slice(plain.children.length).map((m) => m.position.x);
        expect(Math.min(...seamXs)).toBeLessThan(Math.min(...xs));
        expect(Math.max(...seamXs)).toBeGreaterThan(Math.max(...xs));
    });
});

describe('the crowd is affordable', () => {
    test('one fan is under 1500 triangles in any pose and hair, and a packed house under a million', () => {
        const seats = St.crowdSeats().seats.length;
        for (const pose of Fans.POSES) {
            for (const hair of Fans.HAIR) {
                const cost = Fans.fanCost(parts, pose, hair);
                expect(cost.triangles).toBeLessThan(1500);
                expect(cost.triangles * seats).toBeLessThan(1e6);
            }
        }
    });

    test('in the finale the near stand, arms up and bouncing, never stands between the camera and the teams', () => {
        // The shot is solved against `crowdReach`, so first: is that number
        // really as high as a fan's hands go?
        const bounce = CFG.crowd.bounce * CFG.crowd.scale;
        expect(St.crowdReach()).toBeGreaterThanOrEqual(box(parts.arms.up.hand).max.y + bounce);
        const reach = St.crowdReach();
        for (const aspect of [21 / 9, 16 / 9, 4 / 3, 1, 9 / 16, 9 / 19.5]) {
            const shot = Mi.sideShot(aspect);
            expect(Mi.seesOverNearStand(shot)).toBe(true);
            // And measured here without it, so the check cannot agree with itself.
            const f = shot.position;
            for (const p of Mi.finaleRows(14)) {
                for (const y of [0, 3.9]) {
                    for (let r = 0; r < S.rows; r += 1) {
                        const z = -S.out(r);
                        const k = (z - f.z) / (p.z - f.z);
                        if (k > 0 && k < 1) expect(f.y + (y - f.y) * k).toBeGreaterThan(S.top(r) + reach);
                    }
                }
            }
        }
    });
});
