// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The concrete and the asphalt (Steve's QA, 2026-10-08),
 * www/leaves/js/surfaces.js, measured on the real three.js: "Could we please
 * add a little more detail to the sidewalk and porch - especially the strip
 * of sidewalk that leads from the main sidewalk to the porch... more like
 * cement and maybe had a few cracks." And the street in asphalt.
 *
 * The weedy lawn built in the same round was taken out at Steve's next QA
 * ("The dead brown patches and rough spots kind of took away from the
 * experience"). His lawn is a deeper green instead, and keeps its stripes.
 *
 * The pictures need a canvas, which Node has not (tests/leaves-init boots
 * the page through a stub canvas). Here, what they are painted from, and a
 * stand-in canvas for the painters themselves.
 */
import { loadRealThree } from './helpers/real-three.mjs';

const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');
const S = await import('../www/leaves/js/sim.js');

let THREE;
let Sf;
let Yd;
beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Sf = await import('../www/leaves/js/surfaces.js');
    Yd = await import('../www/leaves/js/yard.js');
});
afterAll(() => { delete globalThis.THREE; });

const Y = C.yard;

describe('cracks in the concrete', () => {
    const slab = { minX: 0, maxX: 1.6, minY: 0, maxY: 1.6 };

    test('a crack wanders on from where it starts, and stops at the slab\'s edge', () => {
        const random = S.makeRandom(5);
        const bounds = { minX: 0.02, maxX: 1.58, minY: 0.02, maxY: 1.58 };
        for (let k = 0; k < 40; k++) {
            const line = Sf.crackPath(random, 0.05, 0.8, 1.2, 0, bounds);
            expect(line.length).toBeGreaterThan(2);
            for (const [x, y] of line.slice(1)) {
                expect(x).toBeGreaterThanOrEqual(bounds.minX);
                expect(x).toBeLessThanOrEqual(bounds.maxX);
                expect(y).toBeGreaterThanOrEqual(bounds.minY);
                expect(y).toBeLessThanOrEqual(bounds.maxY);
            }
            // Set off rightward, it mostly goes rightward.
            expect(line[line.length - 1][0]).toBeGreaterThan(line[0][0]);
        }
    });

    test('a slab cracks from an edge inward, the same way every visit', () => {
        const a = Sf.slabCracks(S.makeRandom(9), slab, 3);
        const b = Sf.slabCracks(S.makeRandom(9), slab, 3);
        expect(a).toEqual(b);
        expect(a.length).toBeGreaterThanOrEqual(3);
        for (const line of a) {
            const [x, y] = line[0];
            const fromEdge = Math.min(x - slab.minX, slab.maxX - x, y - slab.minY, slab.maxY - y);
            // The main cracks start at an edge, their branches part way along.
            expect(fromEdge).toBeLessThan(slab.maxX);
        }
        const starts = a.filter((line) => {
            const [x, y] = line[0];
            return Math.min(x, 1.6 - x, y, 1.6 - y) < 0.05;
        });
        expect(starts.length).toBe(3);
    });

    test('without a canvas the surfaces are drawn plain, as before', () => {
        const p = Sf.paving(C.look);
        expect(p.sidewalk.map).toBe(null);
        expect(p.walk(11).map).toBe(null);
        expect(p.street.map).toBe(null);
        // The sidewalk's picture repeats every eight slabs, so its joints
        // land on the slabs' joints from the block's end.
        expect(p.sidewalk.tileX).toBeCloseTo(1.6 * 8, 9);
        expect(p.sidewalk.tileZ).toBeCloseTo(Y.sidewalk.maxZ - Y.sidewalk.minZ, 9);
    });
});

describe('the ground', () => {
    test('the sidewalk is concrete and the street asphalt, and his lawn a deeper green than ours, striped, out to his side fence', () => {
        const rects = Object.fromEntries(Yd.groundRects(C).map((g) => [g.name, g]));
        expect(rects.sidewalk.surface).toBe('sidewalk');
        expect(rects.street.surface).toBe('street');
        expect(rects.lawn.shade).toBeUndefined();
        const his = rects['neighbor-lawn'];
        expect(his.stripes).toBeGreaterThan(0);
        expect(his.rect.maxX).toBe(Y.neighborYard.maxX);
        expect(his.rect.maxZ).toBe(Y.sidewalk.minZ);
        expect(rects.strip.rect.maxX).toBe(Y.neighbor.minX);
        expect(his.rect.maxX).toBeLessThan(Y.street.find((h) => h.name === 'right').minX);
        // Darker and greener than ours, and than the rest of the block.
        const lum = (hex) => 0.3 * ((hex >> 16) & 255) + 0.59 * ((hex >> 8) & 255) + 0.11 * (hex & 255);
        const greenness = (hex) => ((hex >> 8) & 255) / (((hex >> 16) & 255) + (hex & 255));
        expect(lum(his.color)).toBeLessThan(lum(C.look.lawn));
        expect(greenness(his.color)).toBeGreaterThan(greenness(C.look.lawn));
        expect(rects.block.color).toBe(C.look.blockLawn);
        expect(rects.block.color).not.toBe(his.color);
    });
});

describe('the painters, on a stand-in canvas', () => {
    /** A canvas whose 2D context counts what is drawn and absorbs the rest. */
    function installCanvas() {
        const drawn = { fills: 0, strokes: 0 };
        const ctx = new Proxy({
            createRadialGradient: () => ({ addColorStop() {} }),
            createLinearGradient: () => ({ addColorStop() {} }),
            createPattern: () => ({}),
            fillRect() { drawn.fills++; },
            stroke() { drawn.strokes++; }
        }, {
            get(target, prop) { return prop in target ? target[prop] : () => undefined; },
            set() { return true; }
        });
        globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
        return drawn;
    }
    afterEach(() => { delete globalThis.document; });

    test('every paving picture is painted, cracks and joints and all, and repeats as the ground says', () => {
        const drawn = installCanvas();
        const p = Sf.paving(C.look, true);
        for (const key of ['sidewalk', 'drive', 'porch', 'street']) {
            expect(p[key].map).toBeTruthy();
            expect(p[key].map.wrapS).toBe(THREE.RepeatWrapping);
        }
        expect(p.walk(11).map).toBeTruthy();
        expect(drawn.fills).toBeGreaterThan(1000);
        expect(drawn.strokes).toBeGreaterThan(20);
        // Painted once a visit: asked again, the same picture.
        expect(Sf.paving(C.look, true).sidewalk.map).toBe(p.sidewalk.map);
        // The yard lays them at their tile sizes.
        const scene = new THREE.Scene();
        Yd.buildYard(scene, C, { shadows: false, mobile: true });
        const sidewalk = scene.getObjectByName('sidewalk');
        const w = Y.block.maxX - Y.block.minX;
        expect(sidewalk.material.map.repeat.x).toBeCloseTo(w / p.sidewalk.tileX, 6);
        expect(sidewalk.material.color.getHex()).toBe(0xffffff);
    });
});
