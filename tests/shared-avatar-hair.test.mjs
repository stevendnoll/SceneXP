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

test('every piece of every style is a closed solid facing outward, in the hair\'s color or its tie\'s', () => {
    for (const style of H.HAIR_DRAWN) {
        const hair = H.buildHair(style, 0x6b4a2f, { skin: 0xc08060 });
        expect(hair.name).toBe('hair');
        expect(hair.userData).toMatchObject({ isHair: true, style });
        expect(hair.children.length).toBeGreaterThan(0);
        for (const { mesh } of pieces(hair)) {
            expect(`${style} ${mesh.name}: ${shapes.openEdges(mesh.geometry)}`).toBe(`${style} ${mesh.name}: 0`);
            // Single-sided, so the browser draws only its outside (Steve's
            // QA, 2026-10-24: inside out, the hair's inner surface showed on
            // the scalp and its top shaded itself).
            expect(`${style} ${mesh.name} faces outward: ${shapes.facesOutward(mesh.geometry)}`).toBe(`${style} ${mesh.name} faces outward: true`);
            expect(`${style} ${mesh.name} side: ${mesh.material.side}`).toBe(`${style} ${mesh.name} side: ${THREE.FrontSide}`);
            const want = { tie: new THREE.Color(0x6b4a2f).multiplyScalar(H.HAIR_SIZE.tie).getHex(), part: 0xc08060 }[mesh.name] ?? new THREE.Color(0x6b4a2f).getHex();
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
    // Curls are one lumpy cap, nothing to tuck away (Steve, 2026-10-24:
    // balls on a cut "just looks like a bunch of spheres"): its surface
    // varies by more than a centimeter over the top of the head, where a
    // smooth cut's varies by millimeters.
    expect(hides('curly')).toEqual([]);
    const relief = (style) => {
        const scalp = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp');
        const over = scalp.pts.filter((p) => p.length() > H.SCALP + 1e-5 && p.y > 0.06).map((p) => p.length() - H.SCALP);
        return Math.max(...over) - Math.min(...over);
    };
    expect(relief('curly')).toBeGreaterThan(0.012);
    expect(relief('short')).toBeLessThan(relief('curly') * 0.6);
    expect(pieces(H.buildHair('curly', 0x332211)).every((p) => p.mesh.name === 'scalp')).toBe(true);
    expect(hides('mohawk')).toEqual(['fin']);
    expect(hides('quiff')).toEqual(['crest']);
    for (const style of ['leftPart', 'rightPart', 'centerPart']) expect(hides(style)).toEqual(['wave']);
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
    // Its top is a row of spikes (Steve's QA, 2026-10-25): along the ridge
    // the fin's height rises and falls `spikes` times, by a good share of
    // itself, and strands run up it.
    const M = H.HAIR_SIZE.mohawk;
    // The fin's height at each angle along it: the farthest any of its
    // points reaches there.
    const byAngle = new Map();
    for (const p of fin.pts) {
        const th = Math.round(Math.atan2(p.z, p.y) * 1e4) / 1e4;
        byAngle.set(th, Math.max(byAngle.get(th) || 0, p.length()));
    }
    const ridge = [...byAngle.entries()].sort((a, b) => b[0] - a[0]).map(([th, r]) => ({ th, r }));
    // Peaks that stand a fifth of the fin's height over the valleys either
    // side (the grid's rows jitter the ridge by less).
    let peaks = 0;
    let rising = true;
    let ext = ridge[0].r;
    const swing = 0.2 * M.height;
    for (const { r } of ridge) {
        if (rising) {
            if (r > ext) ext = r;
            else if (r < ext - swing) { peaks++; rising = false; ext = r; }
        } else if (r < ext) ext = r;
        else if (r > ext + swing) { rising = true; ext = r; }
    }
    expect(peaks).toBeGreaterThanOrEqual(M.spikes - 1);
    expect(peaks).toBeLessThanOrEqual(M.spikes + 1);
    const tops = ridge.map((p) => p.r - H.SCALP);
    expect(Math.max(...tops)).toBeGreaterThan(M.height * 0.9);
    expect(fin.mesh.material.map).toBeTruthy();
});

test('a part is a line of scalp from the hairline back over the top, the hair thinned along it and swept off it', () => {
    const thick = (style, x, phi) => {
        // The hair's thinnest over the scalp within 4 mm of `x` across at
        // `phi` radians forward of the crown, read off the cap's outer
        // surface.
        const scalp = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp');
        let least = Infinity;
        for (const p of scalp.pts) {
            if (p.length() < H.SCALP + 1e-5 || Math.abs(Math.atan2(p.z, p.y) - phi) > 0.08 || Math.abs(p.x - x) > 0.004) continue;
            least = Math.min(least, p.length() - H.SCALP);
        }
        expect(least).toBeLessThan(Infinity);
        return least;
    };
    for (const [style, px] of Object.entries(H.HAIR_SIZE.parts)) {
        const all = pieces(H.buildHair(style, 0x332211, { skin: 0xc08060 }));
        const line = all.find((p) => p.mesh.name === 'part');
        expect(line).toBeTruthy();
        expect(line.mesh.material.color.getHex()).toBe(0xc08060);
        // The line lies in its plane, left of the middle for a left part
        // (+x is the wearer's left), over the front and the top only.
        for (const p of line.pts) {
            expect(Math.abs(p.x - px)).toBeLessThan(H.HAIR_SIZE.part.line + 1e-6);
            expect(p.y).toBeGreaterThan(0.04);
        }
        expect(Math.max(...line.pts.map((p) => p.z))).toBeGreaterThan(0.08);
        // Back to within a few centimeters of the crown, and no further: the
        // groove fades to nothing at the crown, so the head's outline from
        // behind is not notched.
        expect(Math.min(...line.pts.map((p) => p.z))).toBeLessThan(0.05);
        expect(Math.min(...line.pts.map((p) => p.z))).toBeGreaterThan(0.02);
        expect(thick(style, px, -0.1)).toBeGreaterThan(thick(style, px + 0.02, -0.1) * 0.85);
        // And it lies on the hair, never under the scalp.
        expect(Math.min(...line.pts.map((p) => p.length()))).toBeGreaterThan(H.SCALP - 1e-6);
        // The cap is thinner along the part than two centimeters to either
        // side of it, most of the way from the crown to the hairline.
        const at = thick(style, px, 0.7);
        expect(at).toBeLessThan(thick(style, px + 0.02, 0.7) * 0.6);
        expect(at).toBeLessThan(thick(style, px - 0.02, 0.7) * 0.6);
        // The short cut itself has no such groove.
        expect(thick('short', px, 0.7)).toBeGreaterThan(thick('short', px + 0.02, 0.7) * 0.8);
    }
    expect(H.HAIR_SIZE.parts.leftPart).toBeGreaterThan(0);
    expect(H.HAIR_SIZE.parts.rightPart).toBe(-H.HAIR_SIZE.parts.leftPart);
    expect(H.HAIR_SIZE.parts.centerPart).toBe(0);
    // The waves: a piece on the cut either side of the part, tallest on a
    // side part's heavy side (the far one), that a hat tucks away.
    const waveOf = (style) => pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'wave');
    const over = (p) => p.length() - H.SCALP;
    for (const [style, px] of Object.entries(H.HAIR_SIZE.parts)) {
        const wave = waveOf(style);
        expect(wave.mesh.userData.hatHides).toBe(true);
        expect(shapes.facesOutward(wave.mesh.geometry)).toBe(true);
        const tallest = (keep) => Math.max(...wave.pts.filter(keep).map(over));
        const W = H.HAIR_SIZE.part.wave;
        if (px === 0) {
            expect(tallest((p) => p.x > 0)).toBeGreaterThan(W.center.lift * 0.8);
            expect(tallest((p) => p.x < 0)).toBeGreaterThan(W.center.lift * 0.8);
        } else {
            const heavy = tallest((p) => Math.sign(p.x - px) === -Math.sign(px));
            const light = tallest((p) => Math.sign(p.x - px) === Math.sign(px));
            expect(heavy).toBeGreaterThan(W.heavy.lift * 0.8);
            expect(light).toBeLessThan(heavy * 0.7);
        }
    }
    // The quiff: a crest swept up and OUT over the forehead (Steve,
    // 2026-10-24: set back, it was "too close to the middle of the head"),
    // so its farthest-forward point stands well clear of the head's front
    // and above the brows, and it rises above the hairline's hair.
    const crest = pieces(H.buildHair('quiff', 0x332211)).find((p) => p.mesh.name === 'crest');
    expect(crest.mesh.userData.hatHides).toBe(true);
    expect(shapes.facesOutward(crest.mesh.geometry)).toBe(true);
    const front = crest.pts.reduce((m, p) => (p.z > m.z ? p : m));
    expect(front.z).toBeGreaterThan(H.SCALP + 0.012);
    expect(front.y).toBeGreaterThan(0.07);
    const top = crest.pts.reduce((m, p) => (p.y > m.y ? p : m));
    expect(top.y).toBeGreaterThan(0.12 + 0.01);
    expect(top.z).toBeGreaterThan(0.05);
});

/** The short cuts, tapered at the sides and the back (2026-10-26). */
const TAPERED = ['short', 'leftPart', 'rightPart', 'centerPart', 'quiff', 'spiky'];

describe('the strands (Steve\'s QA, 2026-10-25: "a monochrome blob")', () => {
    const BARE = { afro: ['scalp'], mohawk: ['scalp'], cornrows: ['scalp'] };

    test('every piece of hair wears a map of gray strands, but the afro, the shaved sides, the ties and the part', () => {
        for (const style of H.HAIR_DRAWN) {
            for (const { mesh } of pieces(H.buildHair(style, 0x6b4a2f, { skin: 0xc08060 }))) {
                const bare = ['tie', 'part'].includes(mesh.name) || (BARE[style] || []).includes(mesh.name);
                const map = mesh.material.map;
                expect(`${style} ${mesh.name} mapped: ${!!map}`).toBe(`${style} ${mesh.name} mapped: ${!bare}`);
                if (!map) continue;
                expect(map.isDataTexture).toBe(true);
                expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
                const { data, width, height } = map.image;
                expect(data.length).toBe(width * height * 4);
                // Gray, never darker than the gap's depth, and not one
                // shade (a flat map would be the blob again). Opaque, but
                // for a tapered cap's hairline (2026-10-26, held below).
                let sum = 0;
                let sum2 = 0;
                let least = 255;
                let gray = true;
                let opaque = true;
                for (let k = 0; k < data.length; k += 4) {
                    gray = gray && data[k + 1] === data[k] && data[k + 2] === data[k];
                    opaque = opaque && data[k + 3] === 255;
                    sum += data[k];
                    sum2 += data[k] * data[k];
                    least = Math.min(least, data[k]);
                }
                expect(gray).toBe(true);
                const tapered = TAPERED.includes(style) && ['scalp', 'wave'].includes(mesh.name);
                expect(`${style} ${mesh.name} opaque: ${opaque}`).toBe(`${style} ${mesh.name} opaque: ${!tapered}`);
                expect(`${style} ${mesh.name} alphaTest: ${mesh.material.alphaTest}`).toBe(`${style} ${mesh.name} alphaTest: ${tapered ? H.HAIR_SIZE.taper.cutoff : 0}`);
                expect(mesh.material.transparent).toBe(tapered);
                const n = data.length / 4;
                const mean = sum / n;
                const sd = Math.sqrt(sum2 / n - mean * mean);
                expect(least).toBeGreaterThan(255 * (1 - H.STRANDS.depth) * 0.7);
                expect(`${style} ${mesh.name} sd: ${sd > 8}`).toBe(`${style} ${mesh.name} sd: true`);
            }
        }
        // Kept for the session: the same style builds with the same map.
        expect(pieces(H.buildHair('short', 0x111111))[0].mesh.material.map).toBe(pieces(H.buildHair('short', 0xeeeeee))[0].mesh.material.map);
    });

    test('a strand is a shade of its own with a darker gap beside it, and fades to the mean', () => {
        const shades = Array.from({ length: 400 }, (_, k) => H.strandShade(k / 40, 0.3, 1, 150));
        expect(Math.min(...shades)).toBeLessThan(0.7);
        expect(Math.max(...shades)).toBeGreaterThan(0.9);
        expect(Math.min(...shades)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...shades)).toBeLessThanOrEqual(1);
        expect(H.strandShade(3.3, 0.3, 0, 150)).toBeCloseTo(H.STRANDS.mean, 9);
    });

    test('strands fall from a pole along lines of constant angle round it, and fade at it', () => {
        const flow = H.fallFrom([0, 1, 0]);
        const p = (a, t) => shapes.onSphere(0.12, a, t);
        // Down one meridian: the same strand all the way.
        expect(flow(p(0.7, 0.4)).k).toBeCloseTo(flow(p(0.7, 1.2)).k, 6);
        // Round the head: a different one.
        expect(Math.abs(flow(p(0.7, 0.8)).k - flow(p(0.9, 0.8)).k)).toBeGreaterThan(1);
        expect(flow(p(0.7, 0.01)).fade).toBeLessThan(0.01);
        expect(flow(p(0.7, 1.0)).fade).toBe(1);
    });

    test('a parted cut\'s strands cross the part square on and bend forward over the brow as they leave it', () => {
        const px = 0.058;
        const flow = H.awayFromPart(px);
        const on = (x, psi) => [x, 0.12 * Math.cos(psi), 0.12 * Math.sin(psi)];
        // Nothing drawn on the part itself.
        expect(flow(on(px, 0.5)).fade).toBe(0);
        expect(flow(on(px + 0.03, 0.5)).fade).toBe(1);
        // Along the ear-to-ear line (the same angle forward of the crown),
        // the strand coordinate falls the farther out from the part, so a
        // strand of constant k leaving the part lands at a larger angle
        // forward of the crown (toward the brow), the more so the farther
        // out: it curves forward.
        const k0 = flow(on(px, 0.5)).k;
        const step1 = flow(on(px + 0.03, 0.5)).k - k0;
        const step2 = flow(on(px + 0.06, 0.5)).k - flow(on(px + 0.03, 0.5)).k;
        expect(step1).toBeLessThan(0);
        expect(step2).toBeLessThan(step1);
        // Both sides alike, and forward of the crown is a larger k.
        expect(flow(on(px - 0.03, 0.5)).k).toBeCloseTo(flow(on(px + 0.03, 0.5)).k, 9);
        expect(flow(on(px, 0.9)).k).toBeGreaterThan(flow(on(px, 0.5)).k);
    });

    test('the short cuts fade out round the sides and the back, smoothly, the forehead\'s hairline a clean line (Steve, 2026-10-26)', () => {
        // Steve: "the bottom edges of the hairline don't fade at all.
        // Usually there's a bit of stubble, or men will have them trim the
        // bottom back and side edges of their hairline a little shorter."
        // Then, of a grain of stubble cut at an alphaTest: "jagged and
        // stringy... almost looks like the hair is bleeding into the
        // scalp", so the fade is a smooth blend.
        const T = H.HAIR_SIZE.taper;
        // The depth: nothing at the front or above `from`, all of it at the
        // hairline round the back.
        expect(H.taperAt(T, 0, 1)).toBe(0);
        expect(H.taperAt(T, Math.PI, T.from)).toBe(0);
        expect(H.taperAt(T, Math.PI, 1)).toBe(1);
        expect(H.taperAt(T, Math.PI / 2, 1)).toBe(1);
        expect(H.taperAt(T, -Math.PI / 2, 0.96)).toBeGreaterThan(0.3);
        expect(H.taperAt(T, -Math.PI / 2, 0.85)).toBe(0);
        expect(H.taperAt(null, Math.PI, 1)).toBe(0);
        // A texel's alpha: whole above the taper, falling smoothly with it
        // (never a step), a shade lower in the gaps, gone at the bottom.
        expect(H.taperAlpha(0, 0.9)).toBe(1);
        expect(H.taperAlpha(0.5, 0.9)).toBeLessThan(1);
        expect(H.taperAlpha(0.5, 0.5)).toBeLessThan(H.taperAlpha(0.5, 0.9));
        expect(H.taperAlpha(1, 0.9)).toBe(0);
        let last = 1;
        for (let i = 1; i <= 50; i++) {
            const a = H.taperAlpha(i / 50, 0.9);
            expect(a).toBeLessThanOrEqual(last);
            expect(last - a).toBeLessThan(0.08);
            last = a;
        }
        // Blended, writing depth, its bare foot discarded.
        for (const style of TAPERED) {
            const scalp = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp');
            expect(scalp.mesh.material.transparent).toBe(true);
            expect(scalp.mesh.material.depthWrite).toBe(true);
            expect(scalp.mesh.material.alphaTest).toBe(T.cutoff);
            // And it casts its shadow from the fade's upper half only, through
            // a depth material of its own reading the same map.
            const depth = scalp.mesh.customDepthMaterial;
            expect(depth.isMeshDepthMaterial).toBe(true);
            expect(depth.map).toBe(scalp.mesh.material.map);
            expect(depth.alphaTest).toBe(T.shadowCut);
            expect(depth.depthPacking).toBe(THREE.RGBADepthPacking);
        }
        expect(pieces(H.buildHair('bob', 0x332211)).find((p) => p.mesh.name === 'scalp').mesh.customDepthMaterial).toBeUndefined();
        // The swoosh patch over a parted cut fades out over the top of the
        // taper, or its skin would cover the fade.
        for (const style of ['leftPart', 'centerPart']) {
            const wave = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'wave');
            expect(wave.mesh.material.transparent).toBe(true);
            const { data, width, height } = wave.mesh.material.map.image;
            expect(data[(Math.floor(height * 0.995) * width + 2) * 4 + 3]).toBe(0);
            expect(data[(Math.floor(height * 0.2) * width + 2) * 4 + 3]).toBe(255);
        }
        for (const style of TAPERED) {
            const scalp = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp');
            const { data, width, height } = scalp.mesh.material.map.image;
            const alphaAt = (u, v) => data[(Math.floor(v * (height - 1)) * width + Math.floor(u * (width - 1))) * 4 + 3];
            // The map's bottom row at the back and the sides is gone, its
            // top rows whole, and the front's bottom row whole too.
            let cut = 0;
            for (let i = 0; i < 40; i++) if (alphaAt(0.02 + (0.3 * i) / 40, 0.995) < 255 * T.cutoff) cut++;
            expect(`${style} back cut: ${cut}`).toBe(`${style} back cut: 40`);
            for (const u of [0.1, 0.5, 0.75]) expect(alphaAt(u, 0.2)).toBe(255);
            for (let i = 0; i < 20; i++) expect(alphaAt(0.46 + 0.08 * (i / 20), 0.98)).toBe(255);
            // Within the taper, each row fades more than the one above, and
            // every texel of a row is near its neighbors (no grain).
            const row = (v) => Array.from({ length: 60 }, (_, i) => alphaAt(0.15 + (0.2 * i) / 60, v));
            const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
            expect(mean(row(0.92))).toBeGreaterThan(mean(row(0.96)));
            expect(mean(row(0.96))).toBeGreaterThan(mean(row(0.99)));
            expect(mean(row(0.96))).toBeGreaterThan(30);
            // Only the very bottom (Steve, 2026-10-26): whole to nine
            // tenths of the way down.
            expect(mean(row(0.88))).toBe(255);
            for (const v of [0.92, 0.96]) {
                const xs = row(v);
                for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(255 * T.gap + 4);
            }
        }
        // The cap itself keeps its full thickness: the blend is in the map
        // alone (Steve: "it looked better without the fade").
        const thick = (style) => Math.max(...pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp').pts.filter((p) => p.y < 0 && p.z < -0.08).map((p) => p.length() - H.SCALP));
        expect(thick('short')).toBeGreaterThan(0.003);
        expect(thick('short')).toBeCloseTo(thick('mullet'), 6);
        // The styles worn back, long or curled keep their whole edge.
        for (const style of ['ponytail', 'bob', 'curly', 'mullet', 'longBack']) {
            const scalp = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'scalp');
            expect(scalp.mesh.material.alphaTest).toBe(0);
        }
    });

    test('the swoosh stands over the top of the head, not only at the hairline', () => {
        // Steve, 2026-10-25: "still don't look very swooshy". Gated by the
        // groove's run, the lift was a quarter of itself a third of the way
        // forward of the crown, and nothing at the crown.
        const W = H.HAIR_SIZE.part.wave;
        for (const [style, px] of Object.entries(H.HAIR_SIZE.parts)) {
            const wave = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'wave');
            const lift = px === 0 ? W.center.lift : W.heavy.lift;
            const side = px === 0 ? 1 : -Math.sign(px);
            for (const phi of [0.3, 0.6]) {
                // The wave's height at the crest, 2 cm out on the heavy
                // side, `phi` forward of the crown, over a cap about 7 mm
                // thick there.
                const near = wave.pts.filter((p) => Math.abs(Math.atan2(p.z, p.y) - phi) < 0.08 && Math.abs(p.x - px - side * 0.02) < 0.008);
                const height = Math.max(...near.map((p) => p.length())) - H.SCALP - 0.008;
                expect(`${style} at ${phi}: ${height > lift * 0.6}`).toBe(`${style} at ${phi}: true`);
            }
        }
    });
});

test('the long styles without bangs: a parted or swept-back cap, a curtain to the shoulders, and the brow clear', () => {
    // Steve's QA, 2026-10-25: "some men have long hair parted in the center
    // with no bangs"; the rig's long hair has bangs baked in.
    const L = H.HAIR_SIZE.long;
    for (const style of ['longCenter', 'longSide', 'longBack']) {
        const all = pieces(H.buildHair(style, 0x332211, { skin: 0xc08060 }));
        const names = all.map((p) => p.mesh.name).sort();
        expect(names).toEqual(style === 'longBack' ? ['curtain', 'scalp'] : ['curtain', 'part', 'scalp', 'wave']);
        const curtain = all.find((p) => p.mesh.name === 'curtain');
        // Down to the shoulders, and strands down it.
        expect(Math.min(...curtain.pts.map((p) => p.y))).toBeLessThan(L.bottom + 0.005);
        expect(curtain.mesh.material.map).toBeTruthy();
        // NO BANGS: nothing of the curtain in front of the face, and the
        // cap's hairline above the brows (the "lies on the scalp" test).
        expect(curtain.pts.filter((p) => Math.abs(p.x) < 0.06 && p.z > 0.07)).toHaveLength(0);
        // But it does hang beside the face, in front of the ears.
        expect(curtain.pts.filter((p) => p.z > 0.03 && p.y < -0.05).length).toBeGreaterThan(0);
        expect(shapes.facesOutward(curtain.mesh.geometry)).toBe(true);
    }
    // The parted ones carry their part where the short cuts do.
    const lineX = (style) => {
        const pts = pieces(H.buildHair(style, 0x332211)).find((p) => p.mesh.name === 'part').pts;
        return pts.reduce((s, p) => s + p.x, 0) / pts.length;
    };
    expect(lineX('longCenter')).toBeCloseTo(0, 3);
    expect(lineX('longSide')).toBeCloseTo(H.HAIR_SIZE.longParts.longSide, 3);
});

test('along reads a line of points, flat past its ends', () => {
    const pts = [[0, 1], [1, 3]];
    expect(H.along(pts, -1)).toBe(1);
    expect(H.along(pts, 0.5)).toBe(2);
    expect(H.along(pts, 5)).toBe(3);
});
