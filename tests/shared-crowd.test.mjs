// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shared crowd (www/shared/js/crowd-1.0.0.js), promoted from
 * www/xo/js/fans.js on 2026-10-19. X's and O's own suites (xo-fans,
 * xo-crowd) hold its fans to what they were; this holds the part itself,
 * from source, against REAL three: the stub has no vertices, so a crowd
 * baked under it is empty (the "measure a model against real three"
 * lesson).
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let THREE;
let Crowd;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    Crowd = await import(join(root, 'www/shared/js/crowd-1.0.0.js'));
});

const box = (g) => {
    g.computeBoundingBox();
    return g.boundingBox;
};

describe('the parts', () => {
    let parts;
    beforeAll(() => {
        parts = Crowd.buildCrowdParts({ scale: 0.9, poses: ['down', 'up', 'clap'] });
    });

    test('every piece is there, standing on the floor, at the scale asked for', () => {
        expect(Object.keys(parts.body).sort()).toEqual(['fixed', 'pants', 'shirt', 'skin']);
        expect(Object.keys(parts.hair).sort()).toEqual([...Crowd.HAIR].sort());
        expect(Object.keys(parts.arms)).toEqual(['down', 'up', 'clap']);
        const low = Math.min(...Object.values(parts.body).map((g) => box(g).min.y));
        expect(low).toBeCloseTo(0, 6);
        // A 1.75 m figure at 0.9: its head's top near 1.6 m.
        expect(parts.top).toBeGreaterThan(1.5);
        expect(parts.top).toBeLessThan(1.7);
        expect(parts.eyeHeight).toBeLessThan(parts.top);
        expect(parts.body.fixed.attributes.color).toBeTruthy();
        expect(parts.body.shirt.attributes.color).toBeUndefined();
    });

    test('the hands are where each pose puts them', () => {
        const [a, b] = parts.hands.down;
        // Down: at the sides, below the shoulders, either side of the body.
        expect(a[1]).toBeLessThan(parts.eyeHeight * 0.6);
        expect(Math.sign(a[0])).toBe(-Math.sign(b[0]));
        // Up: above the head.
        for (const h of parts.hands.up) expect(h[1]).toBeGreaterThan(parts.top);
        // Clap: in front, below the chin, the hands touching.
        const [c, d] = parts.hands.clap;
        expect(c[2]).toBeGreaterThan(0.1);
        expect(Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2])).toBeLessThan(0.08);
        expect(c[1]).toBeGreaterThan(parts.eyeHeight * 0.6);
        expect(c[1]).toBeLessThan(parts.eyeHeight);
        // The pieces themselves reach where the hands are said to be.
        expect(box(parts.arms.up.hand).max.y).toBeGreaterThan(parts.top);
    });

    test('a member is affordable', () => {
        const cost = Crowd.crowdCost(parts);
        expect(cost.vertices).toBeLessThan(4000);
        expect(cost.triangles).toBeGreaterThan(500);
        expect(Crowd.crowdCost(parts, 'up', 'long').triangles).toBeGreaterThan(0);
    });

    test('the defaults are X\'s and O\'s', () => {
        expect(Crowd.POSES).toEqual(['down', 'up', 'cards']);
        expect(Crowd.FIGURE).toEqual({ role: 'customer', shoulderRound: 0.35, handScale: 1.3 });
        const xo = Crowd.buildCrowdParts();
        expect(Object.keys(xo.arms)).toEqual(['down', 'up', 'cards']);
    });
});

describe('the pieces it is made from', () => {
    test('every kind of primitive is rebuilt lighter, and anything else is left alone', () => {
        const cases = [
            new THREE.SphereGeometry(0.2, 32, 24), new THREE.SphereGeometry(0.01, 16, 12), new THREE.SphereGeometry(0.05, 16, 12),
            new THREE.CylinderGeometry(0.1, 0.1, 0.3, 32), new THREE.ConeGeometry(0.1, 0.2, 32), new THREE.TorusGeometry(0.1, 0.02, 16, 48)
        ];
        for (const g of cases) {
            const light = Crowd.lighter(g);
            expect(light).not.toBe(g);
            expect(light.attributes.position.count).toBeLessThan(g.attributes.position.count);
        }
        const plain = new THREE.BufferGeometry();
        expect(Crowd.lighter(plain)).toBe(plain);
        const box2 = new THREE.BoxGeometry(1, 1, 1);
        expect(Crowd.lighter(box2)).toBe(box2);
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)]);
        const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSegments: 6, curveSegments: 12 });
        ex.translate(3, 0, 0);
        const lex = Crowd.lighter(ex);
        expect(box(lex).getCenter(new THREE.Vector3()).x).toBeCloseTo(box(ex).getCenter(new THREE.Vector3()).x, 6);
    });

    test('merging keeps every piece, indexed or not, coloured if asked', () => {
        const a = new THREE.BoxGeometry(1, 1, 1);
        const b = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
        const merged = Crowd.mergePieces([{ geometry: a, colour: new THREE.Color(1, 0, 0) }, { geometry: b, colour: null }], { lift: 2, vertexColours: true });
        expect(merged.attributes.position.count).toBe(24 + 36);
        expect(merged.index.count).toBe(36 + 36);
        expect(box(merged).min.y).toBeCloseTo(1.5, 6);
        const c = merged.attributes.color.array;
        expect([c[0], c[1], c[2]]).toEqual([1, 0, 0]);
        expect(c[c.length - 1]).toBe(1);
        // A big crowd piece takes a 32-bit index.
        const big = new THREE.SphereGeometry(1, 300, 300);
        expect(Crowd.mergePieces([{ geometry: big, colour: null }]).index.array).toBeInstanceOf(Uint32Array);
    });

    test('under a stand-in three with no geometry, there is nothing to bake', () => {
        const real = globalThis.THREE;
        globalThis.THREE = { ...real, SphereGeometry: function SphereGeometry() { return { attributes: {} }; } };
        try {
            expect(Crowd.buildCrowdParts()).toBeNull();
        } finally {
            globalThis.THREE = real;
        }
    });
});
