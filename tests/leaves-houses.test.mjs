// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The houses stand behind the leaves (www/leaves/js/house.js and yard.js),
 * measured on the real three.js. Steve's M6 QA, 2026-10-07: "I think the
 * exterior facade of the houses overlap with some of the leaves on the
 * ground - making the leaves invisible to the user."
 *
 * Leaves rest against the sim's wall along the front of both houses (the
 * lawn's back edge), within a centimeter of it, and a leaf is up to about
 * 30 cm across at the shipped counts, so its back half reaches 15 cm behind
 * the line. Our stone base stood 12 cm in front of the line, and the leaves
 * banked against the house lay inside it. Now each house is drawn set back,
 * and nothing it is made of comes within half a leaf of the line, at the
 * heights a drift reaches, except what the sim already treats as solid (the
 * porch, its step, its posts, the pumpkins, his step).
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = await import('../www/leaves/js/sim.js');

let THREE;
let Yd;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Yd = await import('../www/leaves/js/yard.js');
});
afterAll(() => { delete globalThis.THREE; });

const Y = C.yard;
const edge = Y.lawn.minZ;
// Half the largest leaf at 12,000 (leafSize, plus its jitter).
const halfLeaf = 0.5 * S.leafSize(12000, S.areaOf(Y.lawn), C.leaves) * (1 + C.leaves.sizeJitter);

function meshesOf(scene) {
    scene.updateMatrixWorld(true);
    const out = [];
    scene.traverse((o) => {
        if (!o.isMesh) return;
        let named = '';
        for (let p = o; p; p = p.parent) if (p.name && !named) named = p.name;
        let fenced = false;
        for (let p = o; p; p = p.parent) if (p.name === 'fence' || p.name === 'hedge') fenced = true;
        out.push({ o, named, fenced, box: new THREE.Box3().setFromObject(o) });
    });
    return out;
}

test('half a leaf is what the set back has to clear', () => {
    expect(halfLeaf).toBeGreaterThan(0.1);
    expect(halfLeaf).toBeLessThan(0.2);
});

test('nothing on either house stands where a leaf banked against it lies, below the height a drift reaches', () => {
    const scene = new THREE.Scene();
    Yd.buildYard(scene, C, { shadows: false });
    const lawns = [Y.lawn, Y.neighbor];
    const inFront = [];
    for (const { o, named, fenced, box } of meshesOf(scene)) {
        if (o.userData.solid || fenced) continue;
        // The rake leans on the wall with its tines on the tarp on purpose
        // (Steve's QA, 2026-10-08): the leaves heap round it, which a rake
        // in a pile of leaves should show (tests/leaves-dressing).
        let raked = false;
        for (let p = o; p; p = p.parent) if (p.name === 'rake') raked = true;
        if (raked) continue;
        // Behind the porch or a step, which no leaf gets past.
        const behind = Y.boxes.some((b) => b.minZ <= edge + 1e-6 && box.min.x >= b.minX - 0.01 && box.max.x <= b.maxX + 0.01);
        if (behind) continue;
        // Flat things on the ground (the lawn, the beds, the walk) are under
        // the leaves, not in front of them.
        if (box.max.y < 0.02) continue;
        // Only the strip along the houses, where the leaves bank up.
        const overLawn = lawns.some((L) => box.max.x > L.minX && box.min.x < L.maxX);
        if (!overLawn || box.min.y > 1.2 || box.min.z > edge + 0.5) continue;
        if (box.max.z > edge - halfLeaf) inFront.push({ named, max: box.max.z.toFixed(3) });
    }
    expect(inFront).toEqual([]);
});

test('each house\'s face is set back, with a bed along its foot, and its porch or step reaches back to meet it', () => {
    const scene = new THREE.Scene();
    Yd.buildYard(scene, C, { shadows: false });
    const all = meshesOf(scene);
    const ours = all.filter((m) => m.named === 'our-house');
    const body = ours.reduce((a, b) => ((b.box.max.x - b.box.min.x) * (b.box.max.y - b.box.min.y) > (a.box.max.x - a.box.min.x) * (a.box.max.y - a.box.min.y) ? b : a));
    expect(body.box.max.z).toBeCloseTo(edge - Y.house.setBack, 3);
    // The porch is drawn back to the face, so no gap shows under its roof.
    const porchBox = Y.boxes.find((b) => b.name === 'porch');
    const porch = ours.find((m) => m.o.userData.solid && Math.abs(m.box.max.z - porchBox.maxZ) < 1e-3 && m.box.max.y < porchBox.height + 0.01);
    expect(porch.box.min.z).toBeCloseTo(edge - Y.house.setBack, 3);
    // The beds lie flat between face and lawn.
    const beds = all.filter((m) => m.box.max.y < 0.01 && m.box.max.z <= edge + 1e-3 && m.box.min.z < edge - 0.1 && m.box.max.z > edge - 0.01);
    expect(beds.length).toBeGreaterThanOrEqual(2);
});

// Steve's M6 QA: "Can we make the mailbox look more like a real mailbox -
// maybe with a wooden post?"
test('the mailbox is a real one: a cedar post where the leaves meet it, a plank, an arched box with a flag', async () => {
    const Ho = await import('../www/leaves/js/house.js');
    const street = Ho.buildStreet(Y, C.look);
    street.updateMatrixWorld(true);
    const m = Y.boxes.find((b) => b.name === 'mailbox');
    const near = [];
    street.traverse((o) => {
        if (!o.isMesh) return;
        const box = new THREE.Box3().setFromObject(o, true);
        if (box.max.x > m.minX - 0.3 && box.min.x < m.maxX + 0.3 && box.max.z > m.minZ - 0.1 && box.min.z < m.maxZ + 0.6) near.push({ o, box });
    });
    const post = near.find(({ box }) => Math.abs(box.min.y) < 1e-4 && Math.abs(box.max.y - m.height) < 1e-4);
    expect(post.o.material.color.getHex()).toBe(C.look.cedar);
    // The box's arched top, a half round over straight sides, on the plank.
    const top = Math.max(...near.map(({ box }) => box.max.y));
    expect(top).toBeCloseTo(m.height + Ho.MAILBOX.plank + Ho.MAILBOX.side + Ho.MAILBOX.w / 2 + 0.008, 2);
    expect(near.some(({ o }) => o.geometry.type === 'ExtrudeGeometry')).toBe(true);
    expect(near.some(({ o }) => o.material.color && o.material.color.getHex() === C.look.flag)).toBe(true);
});

// Steve's QA, 2026-10-08: "Currently the car parked along the curb would
// block traffic. The lane needs to be wide enough so a car of a similar
// width could fit between the parked car and the road lines."
test('a car as wide as the parked one fits between it and the yellow lines, with room either side', async () => {
    const Ho = await import('../www/leaves/js/house.js');
    const street = Ho.buildStreet(Y, C.look);
    street.updateMatrixWorld(true);
    const lines = [];
    street.traverse((o) => {
        if (o.isMesh && o.material.color && o.material.color.getHex() === C.look.centerLine) lines.push(new THREE.Box3().setFromObject(o, true));
    });
    expect(lines).toHaveLength(2);
    const nearEdge = Math.min(...lines.map((b) => b.min.z));
    const car = Y.boxes.find((b) => b.name === 'car');
    const wide = car.maxZ - car.minZ;
    // Lane left between the parked car's far side and the nearer line.
    expect(nearEdge - car.maxZ).toBeGreaterThanOrEqual(wide + 0.8);
    // And the lines are where the config says.
    expect((lines[0].min.z + lines[1].max.z) / 2).toBeCloseTo(Y.sidewalk.maxZ + Y.centerLine, 2);
});
