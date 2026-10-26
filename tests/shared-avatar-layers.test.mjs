// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The one-pieces and the underlayer (shared/js/avatar-layers-1.0.0.js),
 * from SOURCE, worn by the avatar's figure on the real three.js (Steve's
 * QA, 2026-10-26: leotards and bodysuits, socks, tights, fishnets, thigh
 * highs, long johns, gloves and sleeves).
 *
 * What is held here: a layer is drawn ONLY WHERE THE SKIN SHOWS (never over
 * the shorts or the trouser leg, never over a long sleeve), each piece
 * stands just off the part it covers, a one-piece's brief hides the belt
 * and reaches below the torso, bare legs come only with a one-piece, and a
 * fishnet is a lattice drawn on a canvas, or a sheer where there is none.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let L;
let W;
let F;
let A;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    L = await import('../www/shared/js/avatar-layers-1.0.0.js');
    W = await import('../www/shared/js/avatar-wardrobe-1.0.0.min.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
});
afterAll(() => {
    delete globalThis.THREE;
});

/** Every mesh under `root` whose `userData.layer` is `kind`. */
function layered(root, kind) {
    const out = [];
    root.traverse((o) => {
        if (o.isMesh && o.userData.layer === kind) out.push(o);
    });
    return out;
}

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

const skinOf = (avatar) => avatar.person.getObjectByName('head').children.find((o) => o.userData.isHead).material;
const legOf = (avatar) => avatar.person.children.find((o) => o.userData.isLeg);
const rightArm = (avatar) => avatar.arms.right;

describe('the one-pieces', () => {
    test('a leotard bares the arms and a bodysuit covers them; both hide the collar and the belt, and wear a brief over the hips', () => {
        for (const style of ['leotard', 'bodysuit']) {
            const avatar = F.createAvatar({ sleeves: style, shirt: 'navy', bottom: 'bare' });
            const skin = skinOf(avatar);
            const briefs = named(avatar.person, 'brief');
            expect(briefs).toHaveLength(1);
            const torso = W.bodyParts(avatar.person).torso;
            torso.geometry.computeBoundingBox();
            const tb = torso.geometry.boundingBox;
            const bottom = torso.position.y + tb.min.y;
            const bb = boxOf(avatar.person, briefs[0]);
            // From the torso's bottom down, proud of it all round, in the
            // shirt's color.
            expect(bb.max.y).toBeGreaterThan(bottom);
            expect(bb.max.y).toBeLessThan(bottom + 0.01);
            expect(bb.min.y).toBeCloseTo(bottom + 0.004 - L.LAYER_SIZE.brief.drop, 6);
            expect(bb.max.z).toBeGreaterThan(tb.max.z);
            expect(bb.max.x - bb.min.x).toBeGreaterThan(W.torsoWidthAt(torso, tb.min.y, tb.min.y + 0.02));
            expect(briefs[0].material.color.getHex()).toBe(new THREE.Color(A.colorOf('shirt', 'navy')).getHex());
            // No collar, no belt, no buckle.
            expect(W.bodyParts(avatar.person).collar.visible).toBe(false);
            const belts = avatar.person.children.filter((m) => m.isMesh && !m.name && m.geometry.type === 'BoxGeometry' && Math.abs(m.position.y - (bottom + 0.02)) < 0.005);
            expect(belts.length).toBeGreaterThan(0);
            for (const b of belts) expect(b.visible).toBe(false);
            // The arms: bare for the leotard, the shirt for the bodysuit.
            const upper = rightArm(avatar).children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
            const forearm = rightArm(avatar).userData.forearm.children[1];
            if (style === 'leotard') {
                expect(upper.material).toBe(skin);
                expect(forearm.material.color.getHex()).toBe(skin.color.getHex());
            } else {
                expect(upper.material).not.toBe(skin);
                expect(forearm.material.color.getHex()).toBe(new THREE.Color(A.colorOf('shirt', 'navy')).getHex());
            }
            // Bare legs: the whole leg is skin, with no hem.
            const leg = legOf(avatar);
            const { thigh, knee, shin } = W.legParts(leg);
            for (const part of [thigh, knee, shin]) expect(part.material).toBe(skin);
            expect(leg.children.find((m) => m.name === 'hem')).toBeUndefined();
            expect(avatar.person.children.find((o) => o.userData.isSkirt)).toBeUndefined();
        }
        // Over a skirt or shorts, the brief is there under them too.
        expect(named(F.createAvatar({ sleeves: 'leotard', bottom: 'tutu' }).person, 'brief')).toHaveLength(1);
        expect(named(F.createAvatar({ sleeves: 'short' }).person, 'brief')).toHaveLength(0);
    });

    test('bare legs with no one-piece are worn as shorts', () => {
        const avatar = F.createAvatar({ sleeves: 'short', bottom: 'bare' });
        const { thigh, shin } = W.legParts(legOf(avatar));
        expect(thigh.material).not.toBe(skinOf(avatar));
        expect(shin.material).toBe(skinOf(avatar));
        expect(legOf(avatar).children.find((m) => m.name === 'hem')).toBeTruthy();
        expect(avatar.avatar.bottom).toBe('bare');
    });
});

describe('the underlayer', () => {
    const shellOf = (person, mesh) => boxOf(person, mesh);

    test('every legwear is drawn only on the bare parts of the leg, just off the skin, in its color', () => {
        const kinds = A.LEGWEAR.map((o) => o.id).filter((k) => k !== 'none');
        for (const kind of kinds) {
            // In shorts: the shin and the knee are bare, the thigh is not.
            const shorts = F.createAvatar({ bottom: 'shorts', legwear: kind, legwearColor: 'red' });
            const pieces = layered(shorts.person, kind);
            expect(`${kind} in shorts: ${pieces.length > 0}`).toBe(`${kind} in shorts: true`);
            const leg = legOf(shorts);
            const { thigh } = W.legParts(leg);
            const thighTop = leg.position.y + thigh.position.y + (thigh.geometry.parameters.height * thigh.scale.y) / 2;
            const thighBottom = leg.position.y + thigh.position.y - (thigh.geometry.parameters.height * thigh.scale.y) / 2;
            for (const p of pieces) {
                const b = shellOf(shorts.person, p);
                // Nothing over the shorts (above the thigh's bottom), bar
                // the knee's ball, which sits at the thigh's foot.
                if (p.geometry.type !== 'SphereGeometry') expect(`${kind} under the shorts: ${b.max.y <= thighBottom + 0.012}`).toBe(`${kind} under the shorts: true`);
                expect(b.max.y).toBeLessThan(thighTop);
                const color = p.material.color.getHex();
                const red = new THREE.Color(A.colorOf('legwearColor', 'red')).getHex();
                if (p.material.userData.fishnet) expect(color).toBe(0xffffff);
                else if (p.name === 'band' || p.name === 'rib' || (p.name === 'cuff' && kind === 'longJohns')) expect(color).not.toBe(red);
                else expect(`${kind} color: ${color}`).toBe(`${kind} color: ${red}`);
            }
            // Under pants nothing shows at all (the shin is the trouser).
            expect(layered(F.createAvatar({ bottom: 'pants', legwear: kind }).person, kind)).toHaveLength(0);
            // Under a skirt the thigh is bare too, so a tight or a thigh
            // high reaches up it; a sock still stops at the shin.
            const skirt = F.createAvatar({ bottom: 'skirt', legwear: kind });
            const highest = Math.max(...layered(skirt.person, kind).map((p) => shellOf(skirt.person, p).max.y));
            const kneeY = legOf(skirt).position.y + W.legParts(legOf(skirt)).knee.position.y;
            if (['tights', 'sheerTights', 'fishnets', 'longJohns', 'thighHighs'].includes(kind)) expect(`${kind} up the thigh: ${highest > kneeY + 0.1}`).toBe(`${kind} up the thigh: true`);
            else expect(`${kind} stops at the knee: ${highest < kneeY + 0.03}`).toBe(`${kind} stops at the knee: true`);
        }
        // Capris bare the lower shin, so socks show under pants there.
        expect(layered(F.createAvatar({ bottom: 'capris', legwear: 'crewSocks' }).person, 'crewSocks').length).toBeGreaterThan(0);
    });

    test('a crew sock is short, a knee sock reaches the knee, a thigh high has its band, sheer tights are see-through, and a leg warmer is baggy', () => {
        const legOnly = (kind) => {
            const a = F.createAvatar({ bottom: 'skirt', legwear: kind, legwearColor: 'black' });
            const leg = legOf(a);
            const { shin, thigh } = W.legParts(leg);
            const pieces = layered(a.person, kind).filter((p) => p.parent === leg);
            const boxes = pieces.map((p) => shellOf(a.person, p));
            return { a, leg, shin, thigh, pieces, top: Math.max(...boxes.map((b) => b.max.y)), bottom: Math.min(...boxes.map((b) => b.min.y)), widest: Math.max(...boxes.map((b) => b.max.x - b.min.x)) };
        };
        const ankle = (leg, shin) => leg.position.y + shin.position.y - (shin.geometry.parameters.height * shin.scale.y) / 2;
        const crew = legOnly('crewSocks');
        expect(crew.bottom).toBeCloseTo(ankle(crew.leg, crew.shin), 3);
        expect(crew.top - crew.bottom).toBeLessThan(L.LAYER_SIZE.crew.height + L.LAYER_SIZE.crew.cuff + 0.001);
        const knee = legOnly('kneeSocks');
        expect(knee.top).toBeGreaterThan(crew.top + 0.15);
        const high = legOnly('thighHighs');
        expect(named(high.a.person, 'band').length).toBe(2);
        expect(high.top).toBeGreaterThan(knee.top + 0.1);
        const sheer = legOnly('sheerTights');
        expect(sheer.pieces[0].material.transparent).toBe(true);
        expect(sheer.pieces[0].material.opacity).toBeCloseTo(L.LAYER_SIZE.sheer, 6);
        const tights = legOnly('tights');
        expect(tights.pieces[0].material.transparent).toBe(false);
        const warm = legOnly('legWarmers');
        const shinWidth = 2 * warm.shin.geometry.parameters.radiusTop * warm.shin.scale.x;
        expect(warm.widest).toBeGreaterThan(shinWidth + 2 * L.LAYER_SIZE.legWarmers.over - 0.001);
        expect(named(warm.a.person, 'rib').length).toBe(2 * L.LAYER_SIZE.legWarmers.rings);
        const johns = legOnly('longJohns');
        expect(named(johns.a.person, 'cuff').length).toBe(2);
    });

    test('every armwear is drawn only where the arm is bare: under long sleeves only a glove\'s hand shows', () => {
        const kinds = A.ARMWEAR.map((o) => o.id).filter((k) => k !== 'none');
        for (const kind of kinds) {
            const tee = F.createAvatar({ sleeves: 'short', armwear: kind, armwearColor: 'purple' });
            const pieces = layered(tee.person, kind);
            expect(`${kind} with short sleeves: ${pieces.length > 0}`).toBe(`${kind} with short sleeves: true`);
            const long = F.createAvatar({ sleeves: 'long', armwear: kind, armwearColor: 'purple' });
            const covered = layered(long.person, kind);
            if (kind === 'longGloves') {
                // The hand itself, in the glove's color, and nothing on
                // the sleeve.
                expect(covered.every((p) => p.userData.isHand)).toBe(true);
                expect(covered).toHaveLength(2);
                expect(covered[0].material.color.getHex()).toBe(new THREE.Color(A.colorOf('armwearColor', 'purple')).getHex());
            } else {
                expect(`${kind} under long sleeves: ${covered.length}`).toBe(`${kind} under long sleeves: 0`);
            }
            // A tank top bares the upper arm too: the sleeves reach it.
            const tank = F.createAvatar({ sleeves: 'tank', armwear: kind });
            const onUpper = layered(tank.person, kind).filter((p) => p.parent.userData.isArm);
            if (kind === 'fishnetSleeves' || kind === 'thermalSleeves') expect(onUpper).toHaveLength(2);
            else expect(onUpper).toHaveLength(0);
        }
    });

    test('a fishnet is a lattice drawn once on a canvas and repeated, or a sheer where there is no canvas', () => {
        const calls = [];
        const ctx = new Proxy({}, {
            get: (_t, p) => (p === 'then' ? undefined : (...args) => { calls.push([p, ...args]); return undefined; }),
            set: (_t, p, v) => { calls.push(['set', p, v]); return true; }
        });
        const canvas = { getContext: () => ctx };
        const doc = { createElement: () => canvas };
        const net = L.fishnetMaterial(0x1d1d1f, doc);
        expect(net.userData.fishnet).toBe(true);
        expect(net.transparent).toBe(true);
        expect(net.alphaTest).toBeGreaterThan(0);
        expect(net.map).toBeTruthy();
        expect(net.map.wrapS).toBe(THREE.RepeatWrapping);
        expect(net.map.repeat.x).toBe(L.LAYER_SIZE.fishnet.repeat[0]);
        expect(canvas.width).toBe(64);
        // The lattice: two diagonals a cell, over the canvas and past it.
        const strokes = calls.filter(([p]) => p === 'stroke').length;
        expect(strokes).toBe(2 * (3 * L.LAYER_SIZE.fishnet.cells + 1));
        expect(calls.find(([p, , v]) => p === 'set' && v === '#1d1d1f' || (p === 'set' && calls.some(([q, k, val]) => q === 'set' && k === 'strokeStyle' && val === '#1d1d1f')))).toBeTruthy();
        // No document: a sheer in the color, and it says so.
        const sheer = L.fishnetMaterial(0x1d1d1f, null);
        expect(sheer.userData.sheerFallback).toBe(true);
        expect(sheer.transparent).toBe(true);
        expect(sheer.map).toBeNull();
        expect(sheer.color.getHex()).toBe(new THREE.Color(0x1d1d1f).getHex());
        // The figure, built without a document, wears the sheer.
        const avatar = F.createAvatar({ bottom: 'skirt', legwear: 'fishnets' });
        expect(layered(avatar.person, 'fishnets')[0].material.userData.sheerFallback).toBe(true);
    });
});
