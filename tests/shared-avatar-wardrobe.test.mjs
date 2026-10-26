// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The wardrobe (shared/js/avatar-wardrobe-1.0.0.js), from SOURCE, worn by
 * the avatar's figure on the real three.js (Steve's QA, 2026-10-25: more
 * shoes, shirts and bottoms).
 *
 * What is held here, and why: every piece is DRAWN ON THE RIG where it says
 * it is (a pocket on the outside of the thigh, a hood behind the neck, studs
 * under the sole), measured in the person's coordinates; what stands the
 * figure up (cleats) does so by exactly its own height; and the rig's own
 * pieces stay (the figure's helpers moved here must still find them).
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let W;
let F;
let A;
let S;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    W = await import('../www/shared/js/avatar-wardrobe-1.0.0.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
    S = await import('../www/shared/js/avatar-shapes-1.0.0.min.js');
});
afterAll(() => {
    delete globalThis.THREE;
});

/** Every mesh named `name` under `root`. */
function named(root, name) {
    const out = [];
    root.traverse((o) => {
        if (o.isMesh && o.name === name) out.push(o);
    });
    return out;
}

/** A mesh's box in the person's coordinates. */
function boxOf(person, mesh) {
    person.updateMatrixWorld(true);
    const inv = person.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv));
    return box;
}

const floorOf = (avatar) => {
    const shoes = [];
    avatar.person.traverse((o) => {
        if (o.isMesh && o.userData.isShoe) shoes.push(o);
    });
    return Math.min(...shoes.map((s) => boxOf(avatar.person, s).min.y));
};

describe('the helpers the figure borrows', () => {
    test('legParts finds the rig\'s thigh, shin, knee and shoe and nothing added; blockShoes measures the block', () => {
        const avatar = F.createAvatar({ shoes: 'workBoots' });
        const leg = avatar.person.children.find((o) => o.userData.isLeg);
        const parts = W.legParts(leg);
        expect(parts.thigh.position.y).toBeGreaterThan(parts.shin.position.y);
        expect(parts.knee.geometry.type).toBe('SphereGeometry');
        expect(parts.shoe.userData.isShoe).toBe(true);
        for (const p of Object.values(parts)) expect(p.name).toBe('');
        const shoes = W.blockShoes(avatar.person);
        expect(shoes).toHaveLength(2);
        expect(shoes[0].l).toBeCloseTo(0.18, 6);
        expect(shoes[0].floor).toBeCloseTo(shoes[0].shoe.position.y - shoes[0].h / 2, 9);
        // A mary jane is a group, not a block: nothing to dress.
        expect(W.blockShoes(F.createAvatar({ shoes: 'maryJane' }).person)).toHaveLength(0);
    });
});

describe('the shoes', () => {
    test('each is drawn on both feet with its own parts, and every one but the cleats leaves the figure where the rig stands it', () => {
        const classic = F.createAvatar({});
        const PARTS = { crocs: ['sole', 'toe', 'hole', 'strap'], highTops: ['sole', 'toe-cap', 'shaft', 'lace', 'collar'], hikingBoots: ['sole', 'lug', 'toe-cap', 'shaft', 'lace', 'collar'], cleats: ['sole', 'stud', 'toe-cap'] };
        for (const [kind, parts] of Object.entries(PARTS)) {
            const avatar = F.createAvatar({ shoes: kind, shoeColor: 'brown' });
            for (const part of parts) expect(`${kind} ${part}: ${named(avatar.person, part).length >= 2}`).toBe(`${kind} ${part}: true`);
            if (kind !== 'cleats') expect(avatar.person.position.y).toBe(classic.person.position.y);
            avatar.dispose();
        }
    });

    test('crocs: a thick sole proud of the clog, five holes over each toe, a strap at the heel', () => {
        const avatar = F.createAvatar({ shoes: 'crocs' });
        const S = W.EXTRA_SHOES.crocs;
        const floor = floorOf(avatar);
        const shoe = avatar.person.children.find((o) => o.userData.isLeg).children.find((m) => m.userData.isShoe);
        const shoeBox = boxOf(avatar.person, shoe);
        for (const sole of named(avatar.person, 'sole')) {
            const b = boxOf(avatar.person, sole);
            expect(b.min.y).toBeCloseTo(floor, 4);
            expect(b.max.y - b.min.y).toBeCloseTo(S.sole, 6);
            expect(b.max.x - b.min.x).toBeGreaterThan(shoeBox.max.x - shoeBox.min.x);
        }
        expect(named(avatar.person, 'hole')).toHaveLength(S.holes * 2);
        for (const hole of named(avatar.person, 'hole')) expect(boxOf(avatar.person, hole).min.y).toBeGreaterThan(shoeBox.max.y - 0.002);
        for (const strap of named(avatar.person, 'strap')) expect(boxOf(avatar.person, strap).max.z).toBeLessThan(shoeBox.min.z + 0.004);
    });

    test('high tops and hiking boots rise over the ankle on a shaft round the shin, laced, with a collar', () => {
        for (const [kind, rise] of [['highTops', W.EXTRA_SHOES.highTops.rise], ['hikingBoots', W.EXTRA_SHOES.hikingBoots.rise]]) {
            const avatar = F.createAvatar({ shoes: kind });
            const floor = floorOf(avatar);
            const shoe = avatar.person.children.find((o) => o.userData.isLeg).children.find((m) => m.userData.isShoe);
            const top = boxOf(avatar.person, shoe).max.y;
            for (const shaft of named(avatar.person, 'shaft')) {
                const b = boxOf(avatar.person, shaft);
                expect(`${kind}: ${b.max.y > top + rise - 0.002}`).toBe(`${kind}: true`);
                expect(b.min.y).toBeLessThan(top);
            }
            for (const collar of named(avatar.person, 'collar')) expect(boxOf(avatar.person, collar).max.y).toBeGreaterThan(top + rise - 0.002);
            expect(named(avatar.person, 'lace').length).toBeGreaterThanOrEqual(6);
            expect(floor).toBeLessThan(top);
        }
        // The hiking boot's sole is the thick one, with lugs standing out
        // either side of it.
        const hiking = F.createAvatar({ shoes: 'hikingBoots' });
        const sole = boxOf(hiking.person, named(hiking.person, 'sole')[0]);
        expect(sole.max.y - sole.min.y).toBeCloseTo(W.EXTRA_SHOES.hikingBoots.sole, 6);
        const lugs = named(hiking.person, 'lug');
        expect(lugs).toHaveLength(W.EXTRA_SHOES.hikingBoots.lugs * 4);
        const leg = hiking.person.children.find((o) => o.userData.isLeg);
        const legLugs = lugs.filter((l) => l.parent === leg);
        expect(Math.max(...legLugs.map((l) => Math.abs(boxOf(hiking.person, l).max.x - leg.position.x), ...legLugs.map((l) => Math.abs(boxOf(hiking.person, l).min.x - leg.position.x))))).toBeGreaterThan((sole.max.x - sole.min.x) / 2);
    });

    test('cleats: studs under the sole, and the figure stood up on them so they never sink into the floor', () => {
        const classic = F.createAvatar({});
        const cleats = F.createAvatar({ shoes: 'cleats' });
        const S = W.EXTRA_SHOES.cleats;
        expect(cleats.person.position.y).toBeCloseTo(classic.person.position.y + S.sole + S.stud[1], 6);
        const studs = named(cleats.person, 'stud');
        expect(studs).toHaveLength(S.studs * 2);
        // In the world, the studs' bottoms are where a classic shoe's sole is.
        const worldFloor = (avatar, meshes) => {
            avatar.group.updateMatrixWorld(true);
            return Math.min(...meshes.map((m) => new THREE.Box3().setFromObject(m).min.y));
        };
        const classicShoes = [];
        classic.person.traverse((o) => {
            if (o.isMesh && o.userData.isShoe) classicShoes.push(o);
        });
        expect(worldFloor(cleats, studs)).toBeCloseTo(worldFloor(classic, classicShoes), 4);
        const sole = boxOf(cleats.person, named(cleats.person, 'sole')[0]);
        for (const stud of studs) expect(boxOf(cleats.person, stud).max.y).toBeCloseTo(sole.min.y, 4);
    });
});

describe('the shirts', () => {
    const torsoOf = (avatar) => W.bodyParts(avatar.person).torso;

    test('the rig covers the forearms for the long-sleeved styles and bares them for the jersey; the button-down gets the rig\'s placket', () => {
        for (const id of ['sweater', 'turtleneck', 'buttonDown', 'hoodie']) {
            expect(`${id}: ${A.personConfig({ sleeves: id }).sleeveColor !== null}`).toBe(`${id}: true`);
        }
        expect(A.personConfig({ sleeves: 'jersey' }).sleeveColor).toBeNull();
        expect(A.personConfig({ sleeves: 'buttonDown' }).dressShirt).toBe(true);
        expect(A.personConfig({ sleeves: 'sweater' }).dressShirt).toBe(false);
        // The rig's placket: a box down the front, and buttons.
        const shirt = F.createAvatar({ sleeves: 'buttonDown' });
        const front = torsoOf(shirt).position.z + 0.11;
        const onFront = shirt.person.children.filter((o) => o.isMesh && !o.name && o.geometry.type === 'SphereGeometry' && o.position.z > front && o.geometry.parameters.radius < 0.01);
        expect(onFront.length).toBeGreaterThanOrEqual(4);
        expect(named(shirt.person, 'collar').length).toBe(2);
    });

    test('cuffs round both wrists on the knits and the hoodie, a band at a sweater\'s hem, a tall roll on a turtleneck', () => {
        for (const id of ['sweater', 'turtleneck', 'hoodie']) {
            const avatar = F.createAvatar({ sleeves: id });
            const cuffs = named(avatar.person, 'cuff');
            expect(`${id} cuffs: ${cuffs.length}`).toBe(`${id} cuffs: 2`);
            for (const c of cuffs) {
                // On the forearm group, round its wrist end: near the hand.
                expect(c.parent.userData.isForearm).toBe(true);
                const hand = c.parent.children[2];
                expect(Math.abs(c.position.y - hand.position.y)).toBeLessThan(0.06);
            }
        }
        const sweater = F.createAvatar({ sleeves: 'sweater' });
        const torso = torsoOf(sweater);
        const band = named(sweater.person, 'band')[0];
        const bb = boxOf(sweater.person, band);
        torso.geometry.computeBoundingBox();
        const tb = torso.geometry.boundingBox;
        expect(bb.min.y).toBeCloseTo(torso.position.y + tb.min.y, 3);
        expect(bb.max.x - bb.min.x).toBeGreaterThan(tb.max.x - tb.min.x);
        expect(W.bodyParts(sweater.person).collar.visible).toBe(false);
        const turtle = F.createAvatar({ sleeves: 'turtleneck' });
        const roll = named(turtle.person, 'turtleneck').find((m) => m.geometry.type === 'CylinderGeometry');
        const rb = boxOf(turtle.person, roll);
        const neckTop = turtle.person.children.find((o) => o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 0.045);
        expect(rb.max.y).toBeGreaterThan(torso.position.y + tb.max.y + 0.05);
        expect(neckTop).toBeTruthy();
    });

    /** Whether two bars make a V: each one's top end is further from the
     *  middle than its bottom end (they drew a Λ until 2026-10-25). */
    const isV = (person, bars) => bars.every((bar) => {
        person.updateMatrixWorld(true);
        const h = bar.geometry.parameters.height / 2;
        const end = (y) => Math.abs(new THREE.Vector3(0, y, 0).applyMatrix4(bar.matrixWorld).x);
        return end(h) > end(-h) + 0.02;
    });

    test('a jersey has a V-neck, a band round each sleeve and a stripe down each side, in white on a dark shirt and dark on a light one', () => {
        const navy = F.createAvatar({ sleeves: 'jersey', shirt: 'navy' });
        expect(named(navy.person, 'trim')).toHaveLength(2);
        expect(isV(navy.person, named(navy.person, 'trim'))).toBe(true);
        expect(named(navy.person, 'band')).toHaveLength(2);
        expect(named(navy.person, 'stripe')).toHaveLength(2);
        for (const band of named(navy.person, 'band')) expect(band.parent.userData.isArm).toBe(true);
        expect(named(navy.person, 'trim')[0].material.color.getHex()).toBe(W.SHIRT_SIZE.jersey.light);
        const white = F.createAvatar({ sleeves: 'jersey', shirt: 'white' });
        expect(named(white.person, 'trim')[0].material.color.getHex()).toBe(W.SHIRT_SIZE.jersey.dark);
        expect(W.bodyParts(navy.person).collar.visible).toBe(false);
        // Short sleeves: the forearm is skin.
        const skin = navy.person.getObjectByName('head').children.find((o) => o.userData.isHead).material;
        expect(navy.arms.right.userData.forearm.children[1].material.color.getHex()).toBe(skin.color.getHex());
    });

    test('a jersey number is drawn on the chest and, larger, across the back, in the trim or a chosen color, from a block font of ten digits (2026-10-26)', () => {
        // The font: ten digits, each 9 rows of 7, every one its own shape,
        // two pixels to a stroke.
        expect(Object.keys(W.DIGITS).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
        for (const rows of Object.values(W.DIGITS)) {
            expect(rows).toHaveLength(9);
            for (const row of rows) expect(row).toMatch(/^[#.]{7}$/);
        }
        expect(new Set(Object.values(W.DIGITS).map((rows) => rows.join('/'))).size).toBe(10);
        // An eight has holes above and below its waist; a zero one hole.
        const holes = (d) => W.DIGITS[d].filter((row) => /^#+\.+#+$/.test(row)).length;
        expect(holes('8')).toBe(3);
        expect(holes('0')).toBe(5);
        // The geometry: a run of pixels is one rectangle (two triangles), so
        // a solid row is one piece and "8" is far fewer pieces than pixels.
        const triangles = (digits, h) => {
            const g = W.numberGeometry(digits, h);
            return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        };
        // An eight is six solid rows and three rows of two runs: 12 pieces.
        expect(triangles('8', 0.1)).toBe(2 * 12);
        expect(triangles('88', 0.1)).toBe(2 * triangles('8', 0.1));
        expect(triangles('', 0.1)).toBe(0);
        const size = (digits, h) => {
            const g = W.numberGeometry(digits, h);
            g.computeBoundingBox();
            return { w: g.boundingBox.max.x - g.boundingBox.min.x, h: g.boundingBox.max.y - g.boundingBox.min.y, x: (g.boundingBox.max.x + g.boundingBox.min.x) / 2 };
        };
        expect(size('8', 0.09).h).toBeCloseTo(0.09, 6);
        expect(size('8', 0.09).w).toBeCloseTo(0.07, 6);
        expect(size('88', 0.09).w).toBeCloseTo(0.15, 6);
        expect(Math.abs(size('88', 0.09).x)).toBeLessThan(1e-6);

        // On the figure: two meshes named 'number', the chest's centered a
        // little above the torso's middle and under the V, the back's
        // larger and centered, each proud of its side of the torso (Steve's
        // QA, 2026-10-26: they sat too high and too small).
        const avatar = F.createAvatar({ sleeves: 'jersey', shirt: 'x241773', jerseyNumber: 'n8' });
        const numbers = named(avatar.person, 'number');
        expect(numbers).toHaveLength(2);
        const torso = torsoOf(avatar);
        torso.geometry.computeBoundingBox();
        const tb = torso.geometry.boundingBox;
        const top = torso.position.y + tb.max.y;
        const middle = torso.position.y + (tb.max.y + tb.min.y) / 2;
        const front = numbers.find((n) => n.userData.side > 0);
        const back = numbers.find((n) => n.userData.side < 0);
        const fb = boxOf(avatar.person, front);
        const bb = boxOf(avatar.person, back);
        expect(fb.min.z).toBeGreaterThan(tb.max.z);
        expect(bb.max.z).toBeLessThan(tb.min.z);
        expect((fb.max.y + fb.min.y) / 2).toBeCloseTo(middle + W.NUMBER_SIZE.front.center, 6);
        expect((bb.max.y + bb.min.y) / 2).toBeCloseTo(middle + W.NUMBER_SIZE.back.center, 6);
        const vBottom = Math.min(...named(avatar.person, 'trim').map((bar) => boxOf(avatar.person, bar).min.y));
        expect(fb.max.y).toBeLessThan(vBottom);
        expect(fb.max.y - fb.min.y).toBeCloseTo(W.NUMBER_SIZE.front.height, 6);
        expect(bb.max.y - bb.min.y).toBeCloseTo(W.NUMBER_SIZE.back.height, 6);
        expect(fb.max.y).toBeLessThan(top - 0.08);
        // Two digits never overhang the cloth: on a straight torso the back
        // number keeps its full height, and across a curvy waist it shrinks
        // to fit while a single digit stays full height.
        const widthOf = (look) => {
            const a = F.createAvatar({ sleeves: 'jersey', shirt: 'navy', ...look });
            const t = torsoOf(a);
            const n = named(a.person, 'number').find((m) => m.userData.side < 0);
            const b = boxOf(a.person, n);
            return { number: b.max.x - b.min.x, height: b.max.y - b.min.y, torso: W.torsoWidthAt(t, W.NUMBER_SIZE.back.center - (b.max.y - b.min.y) / 2, W.NUMBER_SIZE.back.center + (b.max.y - b.min.y) / 2) };
        };
        const straight = widthOf({ jerseyNumber: 'n88' });
        // Two digits at the full height would span 103% of a straight
        // torso, so they settle a little under it (0.194 of 0.2 today).
        expect(straight.height).toBeGreaterThan(W.NUMBER_SIZE.back.height * 0.9);
        expect(straight.number).toBeLessThanOrEqual(straight.torso * W.NUMBER_SIZE.fit + 1e-6);
        expect(straight.number).toBeGreaterThan(straight.torso * W.NUMBER_SIZE.fit - 1e-6);
        const curvy = widthOf({ jerseyNumber: 'n88', build: 'curvy' });
        expect(curvy.torso).toBeLessThan(straight.torso);
        expect(curvy.height).toBeLessThan(W.NUMBER_SIZE.back.height);
        expect(curvy.number).toBeLessThanOrEqual(curvy.torso * W.NUMBER_SIZE.fit + 1e-6);
        expect(widthOf({ jerseyNumber: 'n8', build: 'curvy' }).height).toBeCloseTo(W.NUMBER_SIZE.back.height, 6);
        // Both read from outside: the chest's faces +z, the back's -z.
        const facing = (mesh) => new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).z;
        expect(facing(front)).toBeGreaterThan(0.99);
        expect(facing(back)).toBeLessThan(-0.99);
        // The trim's color on a dark shirt, the dark trim on a light one,
        // and a chosen color on either.
        expect(front.material.color.getHex()).toBe(W.SHIRT_SIZE.jersey.light);
        const white = F.createAvatar({ sleeves: 'jersey', shirt: 'white', jerseyNumber: 'n00' });
        expect(named(white.person, 'number')[0].material.color.getHex()).toBe(W.SHIRT_SIZE.jersey.dark);
        const gold = F.createAvatar({ sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n12', numberColor: 'gold' });
        expect(named(gold.person, 'number')[0].material.color.getHex()).toBe(new THREE.Color(A.optionOf(A.NUMBER_COLORS, 'gold').color).getHex());
        // Two digits are wider than one, and no number is drawn for none or
        // on any other shirt.
        expect(boxOf(gold.person, named(gold.person, 'number')[0]).max.x - boxOf(gold.person, named(gold.person, 'number')[0]).min.x)
            .toBeGreaterThan(fb.max.x - fb.min.x);
        expect(named(F.createAvatar({ sleeves: 'jersey', shirt: 'navy' }).person, 'number')).toHaveLength(0);
        expect(named(F.createAvatar({ sleeves: 'short', shirt: 'navy', jerseyNumber: 'n8' }).person, 'number')).toHaveLength(0);
    });

    test('every build wears every shirt: hem bands and waistbands are as wide as the torso\'s bottom, the jersey\'s stripes follow its sides, and the numbers stay on the cloth (2026-10-26)', () => {
        const builds = A.BUILDS.map((b) => b.id);
        expect(builds).toHaveLength(7);
        for (const build of builds) {
            // The sweater's hem band hugs the torso's bottom, wider or
            // narrower than its shoulders.
            const sweater = F.createAvatar({ build, sleeves: 'sweater', shirt: 'rust' });
            const torso = torsoOf(sweater);
            const { height } = (() => {
                torso.geometry.computeBoundingBox();
                return { height: torso.geometry.boundingBox.max.y - torso.geometry.boundingBox.min.y };
            })();
            const band = named(sweater.person, 'band')[0];
            const bb = boxOf(sweater.person, band);
            const hem = W.torsoWidthAt(torso, -height / 2, -height / 2 + W.SHIRT_SIZE.sweater.band);
            expect(`${build} hem: ${Math.abs((bb.max.x - bb.min.x) - (hem + 2 * W.SHIRT_SIZE.sweater.proud)) < 1e-6}`).toBe(`${build} hem: true`);
            // The leggings' waistband too.
            const leggings = F.createAvatar({ build, bottom: 'leggings' });
            const wb = boxOf(leggings.person, named(leggings.person, 'waistband')[0]);
            const waistWidth = W.torsoWidthAt(torsoOf(leggings), -height / 2, -height / 2 + W.BOTTOM_SIZE.leggings.waist);
            expect(`${build} waistband: ${Math.abs((wb.max.x - wb.min.x) - (waistWidth + 0.016)) < 1e-6}`).toBe(`${build} waistband: true`);
            // Every piece of each jersey stripe sits within 4 mm of the
            // torso's side at its own height, never floating off a narrow
            // shoulder or sinking into a wide seat.
            const jersey = F.createAvatar({ build, sleeves: 'jersey', shirt: 'navy', jerseyNumber: 'n88' });
            const jt = torsoOf(jersey);
            const stripes = named(jersey.person, 'stripe');
            const pieces = W.isStraight(jt) ? 1 : W.STRIPE_PIECES;
            expect(stripes.length).toBe(2 * pieces);
            // Each piece's band down the torso, as the wardrobe cuts them.
            const run = height * 0.82;
            const lowY = -height * 0.05 - run / 2;
            for (const piece of stripes) {
                const pb = boxOf(jersey.person, piece);
                const mid = (pb.min.y + pb.max.y) / 2 - jt.position.y;
                const k = Math.min(pieces - 1, Math.max(0, Math.floor(((mid - lowY) / run) * pieces)));
                const half = W.torsoWidthAt(jt, lowY + (run * k) / pieces, lowY + (run * (k + 1)) / pieces) / 2;
                const center = (Math.abs(pb.min.x) + Math.abs(pb.max.x)) / 2;
                expect(`${build} stripe ${k}: ${Math.abs(center - half - 0.002) < 1e-6}`).toBe(`${build} stripe ${k}: true`);
            }
            // The number never spans more than its share of the torso there.
            for (const n of named(jersey.person, 'number')) {
                const nb = boxOf(jersey.person, n);
                const across = W.torsoWidthAt(jt, nb.min.y - jt.position.y, nb.max.y - jt.position.y);
                expect(`${build} number: ${nb.max.x - nb.min.x <= across * W.NUMBER_SIZE.fit + 1e-6}`).toBe(`${build} number: true`);
            }
        }
    });

    test('a hoodie\'s hood is one closed solid that stands up behind the neck and lies down the back; its pocket sits low on the front, and two drawstrings hang from the neck', () => {
        const avatar = F.createAvatar({ sleeves: 'hoodie', shirt: 'teal' });
        const torso = torsoOf(avatar);
        torso.geometry.computeBoundingBox();
        const tb = torso.geometry.boundingBox;
        const top = torso.position.y + tb.max.y;
        const hoods = named(avatar.person, 'hood');
        expect(hoods).toHaveLength(1);
        const hood = hoods[0];
        // A closed solid facing out, in the shirt's color, single-sided (the
        // half ball before was open: Steve's QA, 2026-10-25).
        expect(S.openEdges(hood.geometry)).toBe(0);
        expect(S.facesOutward(hood.geometry)).toBe(true);
        expect(hood.material.side).toBe(THREE.FrontSide);
        const hb = boxOf(avatar.person, hood);
        // Up behind the neck (not over the face), down the back to well
        // below the shoulders, as wide as the shoulders, and all of it
        // behind the torso's middle: nothing in front of the neck.
        expect(hb.max.y).toBeGreaterThan(top + 0.03);
        expect(hb.max.y).toBeLessThan(top + 0.08);
        expect(hb.min.y).toBeLessThan(top - 0.14);
        expect(hb.max.x - hb.min.x).toBeGreaterThan(0.18);
        expect(hb.max.z).toBeLessThan(0.02);
        expect(hb.min.z).toBeLessThan(-tb.max.z - 0.02);
        // The cloth is thick behind the neck (a roll) and thin at the
        // hood's crown lying on the back: the solid's depth across the
        // middle column near the top against near the bottom.
        const pos = hood.geometry.attributes.position;
        const depthAt = (y0, y1) => {
            let near = -Infinity;
            let far = Infinity;
            for (let i = 0; i < pos.count; i++) {
                if (Math.abs(pos.getX(i)) > 0.02 || pos.getY(i) < y0 || pos.getY(i) > y1) continue;
                near = Math.max(near, pos.getZ(i));
                far = Math.min(far, pos.getZ(i));
            }
            return near - far;
        };
        expect(depthAt(top + 0.03, top + 0.06)).toBeGreaterThan(depthAt(top - 0.17, top - 0.14) + 0.01);
        const pocket = named(avatar.person, 'pocket')[0];
        const pb = boxOf(avatar.person, pocket);
        expect(pb.min.z).toBeGreaterThan(tb.max.z - 0.004);
        expect(pb.min.y).toBeLessThan(torso.position.y);
        expect(pb.min.y).toBeGreaterThan(torso.position.y + tb.min.y);
        expect(named(avatar.person, 'drawstring')).toHaveLength(4);
    });

    test('a V-neck shirt (2026-10-25) opens to a wedge of skin under the throat, banded along its edges, with short sleeves and no collar', () => {
        const avatar = F.createAvatar({ sleeves: 'vneck', shirt: 'navy', skin: 'deep' });
        const torso = torsoOf(avatar);
        torso.geometry.computeBoundingBox();
        const tb = torso.geometry.boundingBox;
        const top = torso.position.y + tb.max.y;
        expect(W.bodyParts(avatar.person).collar.visible).toBe(false);
        expect(A.personConfig({ sleeves: 'vneck' }).sleeveColor).toBeNull();
        const skin = avatar.person.getObjectByName('head').children.find((o) => o.userData.isHead).material;
        expect(avatar.arms.right.userData.forearm.children[1].material.color.getHex()).toBe(skin.color.getHex());
        // The wedge: the skin's own material, on the chest's front, from the
        // shoulders' height down, its point on the middle.
        const wedge = named(avatar.person, 'vneck')[0];
        expect(wedge.material).toBe(skin);
        const wb = boxOf(avatar.person, wedge);
        expect(wb.min.z).toBeGreaterThan(tb.max.z - 0.004);
        expect(wb.max.y).toBeGreaterThan(top - 0.005);
        expect(wb.min.y).toBeLessThan(top - 0.05);
        expect(wb.max.x).toBeCloseTo(-wb.min.x, 6);
        const lowest = (() => {
            const pos = wedge.geometry.attributes.position;
            let best = null;
            for (let i = 0; i < pos.count; i++) if (!best || pos.getY(i) < best.y) best = { x: pos.getX(i), y: pos.getY(i) };
            return best;
        })();
        expect(Math.abs(lowest.x)).toBeLessThan(1e-6);
        // Two bands, a V (open at the top), in a darker shade of the shirt.
        const bars = named(avatar.person, 'trim');
        expect(bars).toHaveLength(2);
        expect(isV(avatar.person, bars)).toBe(true);
        const shirt = A.colorOf('shirt', 'navy');
        for (const bar of bars) {
            expect(bar.material.color.getHex()).not.toBe(shirt);
            expect(bar.material.color.getHex()).toBe(new THREE.Color(shirt).multiplyScalar(W.SHIRT_SIZE.vneck.shade).getHex());
        }
        // Without a skin material the opening is skipped and the bands stay.
        const bare = F.createAvatar({ sleeves: 'short' }).person;
        W.dressShirt(bare, 'vneck', shirt);
        expect(named(bare, 'vneck')).toHaveLength(0);
        expect(named(bare, 'trim')).toHaveLength(2);
    });
});

describe('the bottoms', () => {
    const legOf = (avatar) => avatar.person.children.find((o) => o.userData.isLeg);
    const skinOf = (avatar) => avatar.person.getObjectByName('head').children.find((o) => o.userData.isHead).material;

    test('each kind dresses the legs as its plain cousin does: cargo pants are trousers, cargo and basketball shorts bare the shin, a long skirt bares the legs', () => {
        for (const [id, kind] of [['cargoPants', 'pants'], ['sweatpants', 'pants'], ['leggings', 'pants'], ['cargoShorts', 'shorts'], ['basketballShorts', 'shorts'], ['longSkirt', 'skirt']]) {
            const avatar = F.createAvatar({ bottom: id });
            const { thigh, shin } = W.legParts(legOf(avatar));
            const skin = skinOf(avatar);
            expect(`${id} shin bare: ${shin.material === skin}`).toBe(`${id} shin bare: ${kind !== 'pants'}`);
            expect(`${id} thigh bare: ${thigh.material === skin}`).toBe(`${id} thigh bare: ${kind === 'skirt'}`);
            expect(A.personConfig({ bottom: id }).hasSkirt).toBe(kind === 'skirt');
        }
    });

    test('cargo pockets stand on the outside of each thigh, with a flap', () => {
        for (const id of ['cargoPants', 'cargoShorts']) {
            const avatar = F.createAvatar({ bottom: id });
            const pockets = named(avatar.person, 'pocket');
            expect(pockets).toHaveLength(2);
            expect(named(avatar.person, 'flap')).toHaveLength(2);
            for (const pocket of pockets) {
                const leg = pocket.parent;
                expect(leg.userData.isLeg).toBe(true);
                const { thigh } = W.legParts(leg);
                const pb = boxOf(avatar.person, pocket);
                const side = Math.sign(leg.position.x);
                // Outside the thigh: farther from the body's middle than its
                // outer surface, and at the thigh's height.
                const outer = leg.position.x + side * thigh.geometry.parameters.radiusTop;
                expect(`${id}: ${side > 0 ? pb.max.x > outer : pb.min.x < outer}`).toBe(`${id}: true`);
                const tb = boxOf(avatar.person, thigh);
                expect(pb.min.y).toBeGreaterThan(tb.min.y);
                expect(pb.max.y).toBeLessThan(tb.max.y);
            }
        }
    });

    test('sweatpants are baggy with ankle cuffs and a drawstring; leggings are close with a waistband; basketball shorts are wide with side stripes', () => {
        const plain = W.legParts(legOf(F.createAvatar({}))).thigh;
        const sweats = F.createAvatar({ bottom: 'sweatpants' });
        expect(W.legParts(legOf(sweats)).thigh.scale.x).toBeCloseTo(plain.scale.x * W.BOTTOM_SIZE.sweatpants.baggy, 6);
        expect(named(sweats.person, 'cuff')).toHaveLength(2);
        expect(named(sweats.person, 'waistband')).toHaveLength(1);
        expect(named(sweats.person, 'drawstring')).toHaveLength(2);
        for (const cuff of named(sweats.person, 'cuff')) {
            const { shin } = W.legParts(cuff.parent);
            const sb = boxOf(sweats.person, shin);
            expect(Math.abs(boxOf(sweats.person, cuff).min.y - sb.min.y)).toBeLessThan(0.006);
        }
        const leggings = F.createAvatar({ bottom: 'leggings' });
        expect(W.legParts(legOf(leggings)).thigh.scale.x).toBeCloseTo(plain.scale.x * W.BOTTOM_SIZE.leggings.close, 6);
        expect(named(leggings.person, 'waistband')).toHaveLength(1);
        const ball = F.createAvatar({ bottom: 'basketballShorts', bottomColor: 'navy' });
        expect(W.legParts(legOf(ball)).thigh.scale.x).toBeCloseTo(plain.scale.x * W.BOTTOM_SIZE.basketballShorts.wide, 6);
        expect(named(ball.person, 'stripe')).toHaveLength(2);
        expect(named(ball.person, 'stripe')[0].material.color.getHex()).toBe(W.BOTTOM_SIZE.basketballShorts.light);
        expect(named(ball.person, 'hem')).toHaveLength(2);
    });

    test('a long skirt reaches the ankles from the same waist, and still widens for fuller legs', () => {
        const short = F.createAvatar({ bottom: 'skirt' });
        const long = F.createAvatar({ bottom: 'longSkirt' });
        const skirtOf = (a) => a.person.children.find((o) => o.userData.isSkirt);
        const sb = boxOf(short.person, skirtOf(short));
        const lb = boxOf(long.person, skirtOf(long));
        expect(lb.max.y).toBeCloseTo(sb.max.y, 3);
        expect(lb.min.y).toBeLessThan(0.12);
        expect(lb.min.y).toBeGreaterThan(0.03);
        const curvy = F.createAvatar({ bottom: 'longSkirt', build: 'curvy' });
        expect(skirtOf(curvy).scale.x).toBeGreaterThanOrEqual(skirtOf(long).scale.x);
        expect(skirtOf(F.createAvatar({ bottom: 'longSkirt', muscles: 'buff' })).scale.x).toBeGreaterThan(1);
    });

    test('the sentence says each new piece by name', () => {
        expect(A.describeAvatar({ sleeves: 'hoodie', shirt: 'teal', bottom: 'cargoPants', bottomColor: 'khaki', shoes: 'hikingBoots', shoeColor: 'brown' }))
            .toMatch(/a teal hoodie, khaki cargo pants, and brown hiking boots/);
        expect(A.describeAvatar({ sleeves: 'buttonDown', bottom: 'longSkirt', bottomColor: 'denim', shoes: 'crocs' })).toMatch(/button-down shirt, a denim blue long skirt, and black clogs/);
        for (const o of [...A.SLEEVES, ...A.BOTTOMS, ...A.SHOES]) {
            expect(A.describeAvatar({ sleeves: o.id, bottom: o.id, shoes: o.id })).not.toMatch(/undefined|  |[;—]/);
        }
    });
});
