// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The avatar's hats (shared/js/avatar-hats-1.0.0.js), on the real three.js:
 * every hat over every hair style, through the figure that wears them, and
 * the part itself from SOURCE.
 *
 * What is held here, and why:
 * - NO HAIR COMES THROUGH ANY HAT, over any of the nineteen styles: each hat
 *   is fitted to the hair under it, and what it would squash (a bun, a
 *   spike, a mohawk) is tucked away. And no hat spreads into a pancake over
 *   big hair.
 * - THE EYES ARE NEVER UNDER A BRIM, from the front.
 * - NO HAT IS ONE FLAT COLOR, and the ball cap's bill shows straight on
 *   (Steve's QA, 2026-10-24: it vanished from the front).
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let HT;
let HR;
let F;
let A;
let shapes;
let createPerson;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    HT = await import('../www/shared/js/avatar-hats-1.0.0.js');
    HR = await import('../www/shared/js/avatar-hair-1.0.0.js');
    shapes = await import('../www/shared/js/avatar-shapes-1.0.0.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.js');
    ({ createPerson } = await import('../www/shared/js/people-1.0.0.min.js'));
});
afterAll(() => {
    delete globalThis.THREE;
});

const HATS = () => A.HATS.filter((h) => h.id !== 'none').map((h) => h.id);
const STYLES = () => A.HAIR_LENGTHS.map((h) => h.id);

/** Every shown vertex under `object`, in the coordinates of `frame`, less
 *  the meshes `skip` names. */
function verticesIn(frame, object, skip = () => false) {
    frame.updateWorldMatrix(true, true);
    const inv = frame.matrixWorld.clone().invert();
    const out = [];
    object.traverse((m) => {
        if (!m.isMesh || skip(m)) return;
        for (let p = m; p; p = p.parent) if (p.visible === false) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
    });
    return out;
}

/** Whether point `p` (the head's coordinates) is outside the hat's crown
 *  where the crown covers it: hair through the hat. */
function through(fit, p) {
    if (fit.fit === 'perch') return false;
    if (fit.fit === 'crown') {
        if (p.y <= fit.baseY) return false;
        const k = (p.y - fit.baseY) / (fit.top - fit.baseY);
        const r = fit.r * (1 + (fit.taper - 1) * k);
        return Math.hypot(p.x - fit.center.x, (p.z - fit.center.z) / fit.oval) > r + 1e-6 || p.y > fit.top + 1e-6;
    }
    const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(fit.tilt, 0, fit.lean)).invert();
    const local = p.clone().sub(fit.center).applyMatrix4(turn);
    const q = new THREE.Vector3(local.x / fit.scale[0], local.y / fit.scale[1], local.z / fit.scale[2]);
    return q.y > fit.r * Math.cos(fit.edge) && q.length() > fit.r + 1e-6;
}

const inside = (o, name) => {
    for (let p = o; p; p = p.parent) if (p.name === name) return true;
    return false;
};

function firstFromFront(person, x, y) {
    person.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(new THREE.Vector3(x, y, 2).applyMatrix4(person.matrixWorld), new THREE.Vector3(0, 0, -1))
        .intersectObject(person, true)
        .filter((h) => {
            for (let o = h.object; o; o = o.parent) if (o.visible === false) return false;
            return true;
        });
    return hits[0] ? hits[0].object : null;
}

describe('every hat over every hair style, on the figure', () => {
    test('no hair comes through any hat, over any style', () => {
        // But a ponytail's or a pigtail's tail, which is meant to hang out
        // from under it, as it does through a cap's back or below a beanie.
        const hangs = (m) => m.name === 'tail';
        const failures = [];
        for (const hat of HATS()) {
            for (const length of STYLES()) {
                const avatar = F.createAvatar({ hat, length });
                const head = avatar.person.getObjectByName('head');
                const fit = avatar.person.getObjectByName('hat').userData.fit;
                const hair = avatar.person.getObjectByName('hair');
                const headMesh = head.children.find((o) => o.userData.isHead);
                const pts = verticesIn(head, headMesh).concat(hair ? verticesIn(head, hair, hangs) : []);
                const n = pts.filter((p) => through(fit, p)).length;
                if (n) failures.push(`${hat} over ${length}: ${n}`);
                avatar.dispose();
            }
        }
        expect(failures).toEqual([]);
    });

    test('no hat spreads far round big hair: a flat one sits up on it instead', () => {
        // The afro, the widest hair, reaches about 15.5 cm out each side.
        // Fitted round it from lower down, the beret and the ivy cap spread
        // to 22 and 24 cm, pancakes (2026-10-24).
        const failures = [];
        for (const hat of HATS()) {
            for (const length of STYLES()) {
                const avatar = F.createAvatar({ hat, length });
                const head = avatar.person.getObjectByName('head');
                const wide = Math.max(...verticesIn(head, avatar.person.getObjectByName('hat').getObjectByName('crown')).map((p) => Math.abs(p.x)));
                if (wide > 0.175) failures.push(`${hat} over ${length}: ${wide.toFixed(3)}`);
                avatar.dispose();
            }
        }
        expect(failures).toEqual([]);
    });

    test('no hair shows through an upright crown, from the front or the side', () => {
        // Above its base, a ray straight in meets the hat before any hair
        // (preview, 2026-10-24: over an afro, the chef's puff floated over a
        // ring of hair).
        const failures = [];
        const crowns = HATS().filter((hat) => F.HAT_SIZE[hat].fit === 'crown');
        for (const hat of crowns) {
            for (const length of ['afro', 'topKnot', 'quiff', 'long']) {
                const avatar = F.createAvatar({ hat, length });
                const head = avatar.person.getObjectByName('head');
                head.updateWorldMatrix(true, true);
                const fit = avatar.person.getObjectByName('hat').userData.fit;
                const hair = avatar.person.getObjectByName('hair');
                const top = hair ? Math.max(...verticesIn(head, hair).map((p) => p.y)) : 0.12;
                for (let y = fit.baseY + 0.006; y < Math.min(top, fit.top); y += 0.005) {
                    for (const dir of [[0, 0, -1], [-1, 0, 0]]) {
                        const from = new THREE.Vector3(-dir[0] * 2, y, -dir[2] * 2).applyMatrix4(head.matrixWorld);
                        const way = new THREE.Vector3(...dir).transformDirection(head.matrixWorld);
                        const hit = new THREE.Raycaster(from, way).intersectObject(head, true).find((h) => {
                            for (let o = h.object; o; o = o.parent) if (o.visible === false) return false;
                            return true;
                        });
                        if (hit && !inside(hit.object, 'hat')) failures.push(`${hat} over ${length} at ${y.toFixed(3)}: ${hit.object.name}`);
                    }
                }
                avatar.dispose();
            }
        }
        expect(failures).toEqual([]);
    });

    test('the eyes are never under a brim, from the front', () => {
        const failures = [];
        for (const hat of HATS()) {
            for (const length of ['bald', 'short', 'long', 'afro', 'bob', 'quiff']) {
                const avatar = F.createAvatar({ hat, length });
                for (const pupil of avatar.person.getObjectByName('head').children.filter((o) => o.userData.isPupil)) {
                    const at = pupil.getWorldPosition(new THREE.Vector3()).applyMatrix4(avatar.person.matrixWorld.clone().invert());
                    const hit = firstFromFront(avatar.person, at.x, at.y);
                    if (!hit || !hit.userData.isPupil) failures.push(`${hat} over ${length}: ${hit && hit.name}`);
                }
            }
        }
        expect(failures).toEqual([]);
    });

    test('what a hat would squash is tucked away under it, and comes back without it', () => {
        for (const [length, piece] of [['topKnot', 'bun'], ['spaceBuns', 'bun'], ['mohawk', 'fin'], ['spiky', 'spike'], ['curly', 'curl']]) {
            const shown = (look) => {
                const hair = F.createAvatar(look).person.getObjectByName('hair');
                return hair.children.filter((m) => m.name === piece).some((m) => m.visible);
            };
            expect(`${length} bare: ${shown({ length })}`).toBe(`${length} bare: true`);
            expect(`${length} under a beanie: ${shown({ length, hat: 'beanie' })}`).toBe(`${length} under a beanie: false`);
        }
        // A ponytail hangs out from under any hat.
        const tail = F.createAvatar({ length: 'ponytail', hat: 'cap' }).person.getObjectByName('hair').children.find((m) => m.name === 'tail');
        expect(tail.visible).toBe(true);
    });

    test('no hat is one flat color', () => {
        for (const hat of HATS()) {
            const colors = new Set();
            F.createAvatar({ hat, hatColor: 'navy' }).person.getObjectByName('hat').traverse((m) => {
                if (!m.isMesh) return;
                for (const mat of [].concat(m.material)) colors.add(mat.color.getHex());
            });
            expect(`${hat}: ${colors.size > 1}`).toBe(`${hat}: true`);
        }
    });

    test('a bill shows straight on, from the eyes\' height, two-toned', () => {
        // Steve's QA, 2026-10-24: one color with the crown, the ball cap's
        // bill vanished from the front.
        for (const hat of ['cap', 'trucker', 'ivyCap']) {
            const avatar = F.createAvatar({ hat, hatColor: 'navy' });
            avatar.person.updateMatrixWorld(true);
            const bill = avatar.person.getObjectByName('bill');
            const pupil = avatar.person.getObjectByName('head').children.find((o) => o.userData.isPupil);
            const eye = pupil.getWorldPosition(new THREE.Vector3());
            const from = new THREE.Vector3(0, eye.y, eye.z + 1);
            // Aimed at the middle of its middle (it curves down at the sides,
            // so the middle of its bounding box is under it).
            const pos = bill.geometry.attributes.position;
            const to = new THREE.Vector3();
            let n = 0;
            for (let i = 0; i < pos.count; i++) {
                if (Math.abs(pos.getX(i)) > 1e-4) continue;
                to.add(new THREE.Vector3().fromBufferAttribute(pos, i));
                n++;
            }
            to.divideScalar(n).applyMatrix4(bill.matrixWorld);
            const hit = new THREE.Raycaster(from, to.clone().sub(from).normalize()).intersectObject(avatar.person, true)[0];
            expect(`${hat}: ${hit.object.name}`).toMatch(new RegExp(`^${hat}: (bill|stitch)$`));
            // Its underside is darker than its top, and a ball cap's top is
            // a shade apart from its crown, so the bill reads against it.
            const [top, under] = bill.material;
            expect(under.color.getHSL({}).l).toBeLessThan(top.color.getHSL({}).l);
            if (hat !== 'ivyCap') {
                const crown = avatar.person.getObjectByName('hat').getObjectByName('crown').material.color.getHex();
                expect(`${hat}: ${top.color.getHex() === crown}`).toBe(`${hat}: false`);
            }
        }
    });

    test('a bill is joined to its crown along its whole root', () => {
        // Steve's QA, 2026-10-24: "disconnected from the rest of the hat at
        // its edges". The root (the bill grid's first row) lies inside the
        // crown's ball all the way across, in the crown's own frame, where
        // the crown is a ball of radius `fit.r` about the origin.
        for (const hat of ['cap', 'trucker', 'ivyCap']) {
            const avatar = F.createAvatar({ hat, length: 'short' });
            const bill = avatar.person.getObjectByName('bill');
            const { r } = avatar.person.getObjectByName('hat').userData.fit;
            const pos = bill.geometry.attributes.position;
            const nv = 6;
            for (let i = 0; i <= 16; i++) {
                const p = new THREE.Vector3().fromBufferAttribute(pos, i * (nv + 1));
                expect(`${hat} root ${i}: ${p.length() < r - 0.002}`).toBe(`${hat} root ${i}: true`);
            }
        }
    });

    test('a trucker cap is pale in front and the hat\'s color behind, like its bill', () => {
        // Steve's QA, 2026-10-24: "the colors seem to be reversed".
        const hat = F.createAvatar({ hat: 'trucker', hatColor: 'navy' }).person.getObjectByName('hat');
        const navy = F.createAvatar({ hat: 'cap', hatColor: 'navy' }).person.getObjectByName('hat').getObjectByName('crown').material.color.getHex();
        expect(hat.getObjectByName('crown').material.color.getHex()).toBe(F.HAT_SIZE.trucker.mesh);
        expect(hat.getObjectByName('back').material.color.getHex()).toBe(navy);
    });

    test('a chef\'s hat is a tall toque over its band, and a fez\'s tassel hangs down its side and shows', () => {
        const chef = F.createAvatar({ hat: 'chef', length: 'short' }).person.getObjectByName('hat');
        const fit = chef.userData.fit;
        const puff = chef.getObjectByName('puff');
        puff.geometry.computeBoundingBox();
        const box = puff.geometry.boundingBox;
        // One closed piece, wider than the band and taller than the band
        // is wide (Steve, 2026-10-24: a ball ringed with lobes "looks
        // really weird").
        expect(chef.children[0].children.filter((m) => m.name === 'puff').length).toBe(1);
        expect(shapes.openEdges(puff.geometry)).toBe(0);
        expect(box.max.x).toBeGreaterThan(fit.r * 1.1);
        expect(box.max.y - box.min.y).toBeGreaterThan(fit.r * 1.2);
        for (const hatColor of ['navy', 'white']) {
            const fez = F.createAvatar({ hat: 'fez', hatColor }).person.getObjectByName('hat');
            const { baseY, top } = fez.userData.fit;
            const felt = fez.getObjectByName('crown').material.color.getHSL({}).l;
            let lowest = Infinity;
            let silk = null;
            fez.traverse((m) => {
                if (!m.isMesh || m.name !== 'tassel') return;
                m.geometry.computeBoundingBox();
                lowest = Math.min(lowest, m.geometry.boundingBox.min.y + m.position.y);
                silk = m.material.color.getHSL({}).l;
            });
            // Hanging past the middle of the side, OUTSIDE the crown (which
            // is wider at its base: dropped straight from the top edge, the
            // tuft hung inside it), and a different lightness from the fez
            // (Steve, 2026-10-24: "not noticeable enough", black on navy).
            expect(lowest).toBeLessThan((top - baseY) * 0.5);
            expect(Math.abs(silk - felt)).toBeGreaterThan(0.3);
            const { r, taper } = fez.userData.fit;
            const tuft = fez.children[0].children.filter((m) => m.name === 'tassel').find((m) => m.geometry.type === 'ConeGeometry');
            const y = tuft.position.y;
            const coneR = r + (r * taper - r) * (y / (top - baseY));
            expect(Math.hypot(tuft.position.x, tuft.position.z) - tuft.geometry.parameters.radius).toBeGreaterThan(coneR);
        }
    });

    test('a perched hat sits on the top of the hair, whatever the hair', () => {
        for (const length of ['bald', 'short', 'afro', 'topKnot']) {
            const avatar = F.createAvatar({ hat: 'birthday', length });
            const head = avatar.person.getObjectByName('head');
            const hair = avatar.person.getObjectByName('hair');
            const top = Math.max(...verticesIn(head, hair || head.children.find((o) => o.userData.isHead)).map((p) => p.y));
            const fit = avatar.person.getObjectByName('hat').userData.fit;
            expect(Math.abs(fit.base - (top - HT.HAT_SIZE.birthday.sink))).toBeLessThan(0.002);
        }
    });
});

describe('the part itself, from source', () => {
    /** A head at the origin, the rig's size, and its hair in `style`: the
     *  avatar-hair's, or the rig's own (re-based to the head, as the figure
     *  does). */
    function headWith(style) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24));
        head.userData.isHead = true;
        const group = new THREE.Group();
        group.add(head);
        let hair = HR.buildHair(style, 0x553322);
        if (!hair && style !== 'bald') {
            const person = createPerson({ hairStyle: style });
            hair = person.children.find((o) => o.userData.isHair);
            person.remove(hair);
            for (const piece of hair.children) piece.position.y -= 1.5;
        }
        if (hair) group.add(hair);
        return { group, head, hair };
    }

    test('every kind is built and fitted, over hair of every make', () => {
        for (const kind of Object.keys(HT.HAT_SIZE).filter((k) => k !== 'ease')) {
            for (const style of ['bald', 'short', 'long', 'topKnot']) {
                const { group, head, hair } = headWith(style);
                const hat = HT.buildHat(kind, 0x2f4a6d, head, hair);
                group.add(hat);
                expect(hat.name).toBe('hat');
                const fit = hat.userData.fit;
                expect(['dome', 'crown', 'perch']).toContain(fit.fit);
                const pts = verticesIn(group, head).concat(hair ? verticesIn(group, hair) : []);
                expect(`${kind}/${style}: ${pts.filter((p) => through(fit, p)).length}`).toBe(`${kind}/${style}: 0`);
                let shadows = 0;
                hat.traverse((m) => { if (m.isMesh && m.castShadow) shadows++; });
                expect(shadows).toBe(0);
                // Every solid the hat built for itself (a bill, a brim, a
                // ridge, a stitch, a cord) faces outward, as the hair's do.
                hat.traverse((m) => {
                    if (m.isMesh && m.geometry.type === 'BufferGeometry') expect(`${kind} ${m.name} faces outward: ${shapes.facesOutward(m.geometry)}`).toBe(`${kind} ${m.name} faces outward: true`);
                });
            }
        }
    });

    test('the rig\'s long hair hangs trimmed from a rim, and a hank above it all is hidden', () => {
        const { head, hair } = headWith('long');
        HT.buildHat('beanie', 0x2f4a6d, head, hair);
        const hanks = [];
        hair.traverse((m) => { if (m.isMesh && m.geometry.type === 'BoxGeometry') hanks.push(m); });
        expect(hanks.every((m) => m.scale.y < 1)).toBe(true);
        const group = new THREE.Group();
        const high = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05));
        high.position.y = 0.2;
        group.add(high);
        HT.trimUnder(group, () => 0.1);
        expect(high.visible).toBe(false);
    });

    test('the measures: what a hat fits over, how far it reaches, how high, and its shades', () => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6));
        expect(HT.fitsUnder(box)).toBe(false);
        expect(HT.fitsUnder(ball)).toBe(true);
        const hidden = new THREE.Group();
        hidden.visible = false;
        hidden.add(ball);
        expect(HT.fitsUnder(ball)).toBe(false);
        const shown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6));
        expect(HT.reach([shown], new THREE.Vector3(), -1)).toBeCloseTo(0.1, 6);
        expect(HT.reach([shown], new THREE.Vector3(), -1, { scale: [1, 0.5, 1] })).toBeCloseTo(0.2, 2);
        expect(HT.reach([shown], new THREE.Vector3(), -1, { horizontal: true })).toBeLessThanOrEqual(0.1 + 1e-6);
        expect(HT.highest([shown])).toBeCloseTo(0.1, 6);
        expect(HT.shade(0x808080, 0.5).getHex()).toBe(new THREE.Color(0x808080).multiplyScalar(0.5).getHex());
        expect(HT.shade(0x000000, 2).getHex()).toBe(0xffffff);
        expect(typeof HT.eachVertex).toBe('function');
    });
});
