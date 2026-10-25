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

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    W = await import('../www/shared/js/avatar-wardrobe-1.0.0.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
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

    test('a jersey has a V-neck, a band round each sleeve and a stripe down each side, in white on a dark shirt and dark on a light one', () => {
        const navy = F.createAvatar({ sleeves: 'jersey', shirt: 'navy' });
        expect(named(navy.person, 'trim')).toHaveLength(2);
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

    test('a hoodie\'s hood hangs behind the neck, its pocket sits low on the front, and two drawstrings hang from the neck', () => {
        const avatar = F.createAvatar({ sleeves: 'hoodie', shirt: 'teal' });
        const torso = torsoOf(avatar);
        torso.geometry.computeBoundingBox();
        const tb = torso.geometry.boundingBox;
        const hood = named(avatar.person, 'hood').find((m) => m.geometry.type === 'SphereGeometry');
        const hb = boxOf(avatar.person, hood);
        // Behind the torso's front, mostly behind its middle, up round the
        // neck and not over the face.
        expect(hb.max.z).toBeLessThan(0.08);
        expect((hb.min.z + hb.max.z) / 2).toBeLessThan(0);
        expect(hb.max.y).toBeGreaterThan(torso.position.y + tb.max.y);
        expect(hb.max.y).toBeLessThan(1.52);
        const pocket = named(avatar.person, 'pocket')[0];
        const pb = boxOf(avatar.person, pocket);
        expect(pb.min.z).toBeGreaterThan(tb.max.z - 0.004);
        expect(pb.min.y).toBeLessThan(torso.position.y);
        expect(pb.min.y).toBeGreaterThan(torso.position.y + tb.min.y);
        expect(named(avatar.person, 'drawstring')).toHaveLength(4);
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
