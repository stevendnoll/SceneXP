// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The avatar's hair styles (shared/js/avatar-hair-1.0.0.js), from SOURCE, on
 * the real three.js.
 *
 * What is held here, and why:
 * - EVERY PIECE OF EVERY STYLE IS A CLOSED SOLID, so no edge can stand off
 *   the head (Steve's QA, 2026-10-24: the rig's short hair is a bowl with a
 *   rim, "a cross between a bowl cut and a mullet").
 * - IT LIES ON THE SCALP: the cap's inside on the head's surface, nothing
 *   sunk deep into the head, and the hairline above the brows.
 * - THE SHORT CUT THINS TO NOTHING AT ITS HAIRLINE: no rim to see.
 * - A piece a hat would squash is tagged for the hat to tuck away, and the
 *   long styles hang where they should.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let H;
let shapes;
let A;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    H = await import('../www/shared/js/avatar-hair-1.0.0.js');
    shapes = await import('../www/shared/js/avatar-shapes-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.js');
});
afterAll(() => {
    delete globalThis.THREE;
});

/** Every mesh of `group` with its vertices, in the group's coordinates. */
function pieces(group) {
    group.updateMatrixWorld(true);
    const out = [];
    group.traverse((m) => {
        if (!m.isMesh) return;
        const pos = m.geometry.attributes.position;
        const pts = [];
        for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        out.push({ mesh: m, pts });
    });
    return out;
}

test('the styles drawn here are the avatar\'s styles less the rig\'s own three', () => {
    const ids = A.HAIR_LENGTHS.map((o) => o.id);
    for (const style of H.HAIR_DRAWN) expect(ids).toContain(style);
    expect(ids.filter((id) => !H.HAIR_DRAWN.includes(id)).sort()).toEqual(['bald', 'buzz', 'long']);
    for (const style of ['bald', 'buzz', 'long', 'nope']) expect(H.buildHair(style, 0x332211)).toBeNull();
});

test('every piece of every style is a closed solid, in the hair\'s color or its tie\'s', () => {
    for (const style of H.HAIR_DRAWN) {
        const hair = H.buildHair(style, 0x6b4a2f);
        expect(hair.name).toBe('hair');
        expect(hair.userData).toMatchObject({ isHair: true, style });
        expect(hair.children.length).toBeGreaterThan(0);
        for (const { mesh } of pieces(hair)) {
            expect(`${style} ${mesh.name}: ${shapes.openEdges(mesh.geometry)}`).toBe(`${style} ${mesh.name}: 0`);
            const want = mesh.name === 'tie' ? new THREE.Color(0x6b4a2f).multiplyScalar(H.HAIR_SIZE.tie).getHex() : new THREE.Color(0x6b4a2f).getHex();
            expect(`${style} ${mesh.name}: ${mesh.material.color.getHex()}`).toBe(`${style} ${mesh.name}: ${want}`);
        }
    }
});

test('it lies on the scalp: the cap\'s inside on the head, nothing sunk into it, the hairline above the brows', () => {
    for (const style of H.HAIR_DRAWN) {
        const all = pieces(H.buildHair(style, 0x332211));
        for (const { mesh, pts } of all) {
            const d = pts.map((p) => p.length());
            // What lies ON the head (the cap, a mohawk's fin) never goes
            // under the scalp. What is ROOTED in it (a tail behind its tie, a
            // bun, a ridge, a curl, a curtain tucked under the cap so no gap
            // shows) may sink in at its root, hidden, but never deep.
            const floor = ['scalp', 'fin'].includes(mesh.name) ? H.SCALP - 1e-6 : 0.09;
            expect(`${style} ${mesh.name}: ${Math.min(...d) >= floor}`).toBe(`${style} ${mesh.name}: true`);
        }
        // The cap's inside is exactly on the scalp.
        const scalp = all.find((p) => p.mesh.name === 'scalp');
        expect(Math.min(...scalp.pts.map((p) => p.length()))).toBeCloseTo(H.SCALP, 6);
        // In front of the face, no hair below the brows' tops (0.05 above the
        // head's middle), but the bob's and the afro's fringe.
        const front = scalp.pts.filter((p) => Math.abs(p.x) < 0.035 && p.z > 0.09);
        expect(`${style}: ${Math.min(...front.map((p) => p.y)) > 0.05}`).toBe(`${style}: true`);
    }
});

test('the short cut thins almost to nothing at its hairline, all the way round', () => {
    const scalp = pieces(H.buildHair('short', 0x332211)).find((p) => p.mesh.name === 'scalp');
    // The outer surface's points along the edge: the last row of each
    // column. Its thickness there is a fraction of a millimeter.
    const edge = H.HAIR_SIZE.edges.short;
    let thickest = 0;
    let fullest = 0;
    for (const p of scalp.pts) {
        const t = Math.acos(p.y / p.length());
        const a = Math.atan2(p.x, p.z);
        const lineAt = H.along(edge, Math.abs(a));
        const over = p.length() - H.SCALP;
        if (Math.abs(t - lineAt) < 0.01) thickest = Math.max(thickest, over);
        if (t < 0.3) fullest = Math.max(fullest, over);
    }
    expect(thickest).toBeLessThan(0.0015);
    expect(fullest).toBeGreaterThan(0.006);
    // The hairline follows the head: above the brows, lower at the ears, the
    // lowest at the nape. (The rig's bowl is level all round.)
    expect(H.along(edge, 0)).toBeLessThan(H.along(edge, Math.PI / 2));
    expect(H.along(edge, Math.PI / 2)).toBeLessThan(H.along(edge, Math.PI));
});

test('what a hat would squash is tagged for it to tuck away, and the long styles hang', () => {
    const hides = (style) => pieces(H.buildHair(style, 0x332211)).filter((p) => p.mesh.userData.hatHides).map((p) => p.mesh.name);
    expect(hides('spiky')).toEqual(expect.arrayContaining(['spike']));
    expect(hides('curly')).toEqual(expect.arrayContaining(['curl']));
    expect(hides('mohawk')).toEqual(['fin']);
    for (const style of ['topKnot', 'lowBun', 'spaceBuns']) expect(hides(style)).toEqual(expect.arrayContaining(['bun', 'tie']));
    expect(hides('short')).toEqual([]);
    expect(hides('ponytail')).toEqual([]);
    const lowest = (style) => Math.min(...pieces(H.buildHair(style, 0x332211)).flatMap((p) => p.pts.map((v) => v.y)));
    for (const style of ['ponytail', 'pigtails', 'braids', 'locs', 'mullet']) {
        expect(`${style}: ${lowest(style) < -0.13}`).toBe(`${style}: true`);
    }
    expect(lowest('bob')).toBeLessThan(-0.07);
    expect(lowest('bob')).toBeGreaterThan(-0.1);
    // The mohawk's fin runs over the top in the head's middle plane, from
    // the brow back (2026-10-24: built down the front, it ran over the face).
    const fin = pieces(H.buildHair('mohawk', 0x332211)).find((p) => p.mesh.name === 'fin');
    expect(Math.max(...fin.pts.map((p) => Math.abs(p.x)))).toBeLessThan(0.02);
    expect(Math.max(...fin.pts.map((p) => p.y))).toBeGreaterThan(0.15);
    const facePts = fin.pts.filter((p) => p.z > 0.08);
    expect(Math.min(...facePts.map((p) => p.y))).toBeGreaterThan(0.05);
});

test('along reads a line of points, flat past its ends', () => {
    const pts = [[0, 1], [1, 3]];
    expect(H.along(pts, -1)).toBe(1);
    expect(H.along(pts, 0.5)).toBe(2);
    expect(H.along(pts, 5)).toBe(3);
});
