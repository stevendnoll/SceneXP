// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The rest of the neighborhood behind the block (www/leaves/js/backdrop.js)
 * and the far side of the neighbor's yard (yard.js hisSideFence), measured
 * on the real three.js. Steve's QA, 2026-10-08:
 *
 * "could we add more background details in the area to the left of the
 * user's house behind the green shed and fence? The clouds in the sky look
 * good, but the area still looks too empty." With utility poles: "the goal
 * is to make the rest of the environment feel as real and life-like as
 * possible."
 *
 * "could we add a little more detail - maybe a fence - to the far right side
 * of the neighbor's yard? It looks a little bare when it's visible."
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

let THREE;
let Bd;
let Yd;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Bd = await import('../www/leaves/js/backdrop.js');
    Yd = await import('../www/leaves/js/yard.js');
});
afterAll(() => { delete globalThis.THREE; });

const Y = C.yard;
const B = Y.backdrop;
// Our house's back wall.
const ourBack = Y.lawn.minZ - Y.house.setBack - Y.house.depth;

describe('the next street', () => {
    test('a house to a lot, their backs to us past the back lot line, none touching another', () => {
        const houses = Bd.backHouses(B.houses);
        expect(houses.length).toBe(Math.round((B.houses.to - B.houses.from) / B.houses.lot) + 1);
        houses.forEach((h, i) => {
            expect(h.back).toBeLessThan(B.fence.z - 6);
            expect(h.back - h.d).toBeGreaterThan(Y.block.minZ);
            const next = houses[i + 1];
            if (next) expect(next.x - next.w / 2).toBeGreaterThan(h.x + h.w / 2 + 1.5);
            expect(h.ridge).toBeGreaterThan(h.wall);
        });
        // A mix: one and two stories, decks and not, a gable end toward us.
        expect(new Set(houses.map((h) => h.stories)).size).toBe(2);
        expect(houses.some((h) => h.deck) && houses.some((h) => !h.deck)).toBe(true);
        expect(houses.some((h) => h.along === 'z')).toBe(true);
        expect(Bd.backHouses(B.houses)).toEqual(houses);
    });

    test('the treeline stands in the fog past the houses, on the ground, in October colors with evergreens among them', () => {
        const crowns = Bd.treeline(B.treeline);
        expect(crowns.length).toBe(B.treeline.count);
        const houses = Bd.backHouses(B.houses);
        const fronts = Math.max(...houses.map((h) => h.back - h.d));
        for (const t of crowns) {
            expect(t.z).toBeLessThanOrEqual(B.treeline.near);
            expect(t.z).toBeGreaterThanOrEqual(B.treeline.far);
            expect(t.z).toBeLessThan(fronts);
            expect(t.z).toBeGreaterThan(Y.block.minZ);
            // Its crown's foot at about the ground.
            expect(t.y - t.tall * 0.55).toBeGreaterThanOrEqual(B.treeline.trunk - 1e-6);
            expect(t.y - t.tall * 0.55).toBeLessThan(B.treeline.trunk + 1.6);
        }
        const share = crowns.filter((t) => t.evergreen).length / crowns.length;
        expect(share).toBeGreaterThan(B.treeline.evergreens - 0.1);
        expect(share).toBeLessThan(B.treeline.evergreens + 0.1);
        // In the fog, not lost in it: nearer than the fog's far end from a
        // camera at the street.
        expect(-B.treeline.far + 20).toBeLessThan(C.look.fog.far);
    });
});

describe('the poles and their wires', () => {
    test('each wire runs pole to pole, sagging lowest in its middle, over the fence and under the poles\' tops', () => {
        const P = B.poles;
        const lines = Bd.poleWires(P);
        expect(lines.length).toBe((P.xs.length - 1) * 4);
        for (const line of lines) {
            const a = line[0];
            const b = line[line.length - 1];
            expect(P.xs.some((x) => Math.abs(a[0] - x) < P.arm / 2 + 1e-6)).toBe(true);
            expect(P.xs.some((x) => Math.abs(b[0] - x) < P.arm / 2 + 1e-6)).toBe(true);
            const ys = line.map((p) => p[1]);
            const low = ys.indexOf(Math.min(...ys));
            expect(Math.abs(low - (line.length - 1) / 2)).toBeLessThanOrEqual(1);
            expect(Math.min(...ys)).toBeGreaterThan(B.fence.height + 3);
            expect(Math.max(...ys)).toBeLessThanOrEqual(P.height);
        }
        // One stands behind the green shed's corner of the block.
        expect(P.xs.some((x) => x < Y.lawn.minX && x > Y.backyard.fence.from)).toBe(true);
    });
});

describe('built', () => {
    test('all of it stands behind our house, and none of it casts a shadow', () => {
        const group = Bd.buildBackdrop(C);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(group, true);
        expect(box.max.z).toBeLessThan(ourBack - 1);
        let meshes = 0;
        group.traverse((o) => {
            if (o.isMesh) {
                meshes++;
                expect(o.castShadow).toBe(false);
            }
        });
        // A few draws for a whole street, not hundreds.
        expect(meshes).toBeLessThan(40);
    });

    test('the swing set and the trampoline are in the sage house\'s back yard, behind the green shed\'s fence', () => {
        const group = Bd.buildBackdrop(C);
        group.updateMatrixWorld(true);
        const play = new THREE.Box3().setFromObject(group.getObjectByName('play'), true);
        const F = Y.backyard.fence;
        expect(play.max.z).toBeLessThan(F.z);
        expect(play.min.z).toBeGreaterThan(B.fence.z);
        expect(play.min.x).toBeGreaterThan(F.from);
        expect(play.max.x).toBeLessThan(F.to);
        // Tall enough to show over the fence from the street.
        expect(play.max.y).toBeGreaterThan(F.height);
        // A tall pine there too.
        expect(Y.trees.some((t) => t.x > F.from && t.x < F.to && t.z < F.z && t.height > 10)).toBe(true);
    });
});

describe('the far side of the neighbor\'s yard', () => {
    test('a gate across the gap to the next house, a picket fence along his side to the sidewalk, boxwoods in the corner', () => {
        const fence = Yd.hisSideFence(Y, C.look);
        fence.updateMatrixWorld(true);
        const at = Y.neighborYard.maxX;
        const gate = new THREE.Box3().setFromObject(fence.getObjectByName('his-gate'), true);
        const next = Y.street.find((h) => h.name === 'right');
        expect(gate.min.x).toBeGreaterThanOrEqual(Y.neighborHouse.maxX - 1e-6);
        expect(gate.max.x).toBeLessThanOrEqual(next.minX + 1e-6);
        const picket = new THREE.Box3().setFromObject(fence.getObjectByName('his-picket'), true);
        expect(Math.abs((picket.min.x + picket.max.x) / 2 - at)).toBeLessThan(0.1);
        expect(picket.max.z).toBeGreaterThan(Y.sidewalk.minZ - 0.3);
        expect(picket.max.z).toBeLessThan(Y.sidewalk.minZ);
        expect(picket.min.z).toBeGreaterThan(gate.min.z - 0.1);
        expect(picket.max.y).toBeLessThan(1.1);
        let balls = 0;
        fence.traverse((o) => { if (o.isMesh && o.geometry.type === 'IcosahedronGeometry') balls++; });
        expect(balls).toBe(Y.neighborYard.boxwoods.length);
    });

    test('it stands clear of his inflatable ghost\'s arms, and his lawn reaches it', async () => {
        const D = await import('../www/leaves/js/decorations.js');
        const G = C.halloween.decor.ghostInflatable;
        const decor = D.buildDecorations(C).group;
        decor.updateMatrixWorld(true);
        const ghost = new THREE.Box3();
        decor.traverse((o) => {
            if (!o.isMesh) return;
            const b = new THREE.Box3().setFromObject(o, true);
            const c = b.getCenter(new THREE.Vector3());
            if (Math.hypot(c.x - G.x, c.z - G.z) < 1.6 && b.max.y > 0.5) ghost.union(b);
        });
        expect(ghost.isEmpty()).toBe(false);
        expect(ghost.max.x).toBeLessThan(Y.neighborYard.maxX - 0.05);
        const his = Yd.groundRects(C).find((g) => g.name === 'neighbor-lawn');
        expect(his.rect.maxX).toBe(Y.neighborYard.maxX);
    });
});
