// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-helmet.test.mjs - the shape of a football helmet, measured.
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB. The chainable proxy in
 * tests/helpers models no geometry, so every `Box3` taken against it comes back
 * empty and it will cheerfully agree that a helmet is any size at all. The only
 * way to ask whether a shell covers a head is to build it against the real
 * library and read a real bounding box, which is what `node:vm` is for.
 *
 * WHY IT IS WORTH THE TROUBLE. This helmet has now been wrong twice in ways
 * that a screenshot showed and nobody could name: first a hemisphere with one
 * hoop, which read as a swimming cap, and then a bigger shell that stopped
 * short of the hair so a black band ran round the back and it looked WORSE than
 * what it replaced. Both were geometry, both were invisible until somebody
 * enlarged a 60-pixel crop, and both are one Box3 away from being obvious.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let THREE;
let parts;
let HEAD;
let box;

beforeAll(async () => {
    // three.min.js is a UMD bundle that expects a browser global, so it is run
    // in a context that has one and the namespace is lifted back out.
    const ctx = vm.createContext({ self: {}, window: {}, console });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;

    const roster = await import(join(root, 'www/exesnohs/js/roster.js'));
    HEAD = roster.HEAD;

    const shellMat = new THREE.MeshStandardMaterial({ color: 0xff992c });
    shellMat.side = THREE.DoubleSide;
    parts = roster.buildHelmetParts(
        shellMat, new THREE.MeshStandardMaterial({ color: 0x2a1a0c })
    );
    const group = new THREE.Group();
    for (const p of parts) group.add(p);
    group.updateMatrixWorld(true);
    box = (o) => new THREE.Box3().setFromObject(o);
});

const named = (name) => parts.filter((p) => p.name === name);
const unionOf = (list) => {
    const b = new THREE.Box3();
    for (const p of list) b.union(box(p));
    return b;
};

describe('the shell covers the head', () => {
    /**
     * THE FAULT THAT MADE IT LOOK WORSE. The previous shell reached 1.50 on
     * paper and its own scale pulled the real edge above that, so a band of
     * black hair showed all the way round the back below a pale dome. A gap
     * between a helmet and a head reads as a hat two sizes too small, and no
     * amount of facemask fixes it.
     */
    test('it reaches below the hair at the back', () => {
        expect(box(parts[0]).min.y).toBeLessThanOrEqual(HEAD.hairLow);
    });

    test('and over the top of it', () => {
        expect(box(parts[0]).max.y).toBeGreaterThanOrEqual(HEAD.hairHigh);
    });

    test('it is wider than the head, and not by a silly amount', () => {
        const halfWidth = (box(parts[0]).max.x - box(parts[0]).min.x) / 2;
        expect(halfWidth).toBeGreaterThan(HEAD.hairR);
        // A bubble was the first fault. Anything past about half again as wide
        // as the head it is covering stops being a helmet.
        expect(halfWidth).toBeLessThan(HEAD.hairR * 1.6);
    });

    test('it runs further back than it does forward, which is the shape', () => {
        const b = box(parts[0]);
        expect(Math.abs(b.min.z)).toBeGreaterThan(b.max.z);
    });
});

describe('the facemask is in front of the face', () => {
    /**
     * THE FIRST CAGE WAS BURIED. Its bars sat at z = 0.132 against a shell that
     * reached 0.152, so they were inside it and all that showed was a few dark
     * specks near the chin. A facemask that is not in front of the face is not
     * a facemask.
     */
    test('it stands clear of the head', () => {
        expect(unionOf(named('helmet-mask')).max.z).toBeGreaterThan(HEAD.r + 0.03);
    });

    test('and clear of the shell it is bolted to', () => {
        expect(unionOf(named('helmet-mask')).max.z)
            .toBeGreaterThan(box(parts[0]).max.z);
    });

    test('it spans the face rather than sitting on the chin', () => {
        const mask = unionOf(named('helmet-mask'));
        expect(mask.max.y - mask.min.y).toBeGreaterThan(0.09);
        expect(mask.max.x - mask.min.x).toBeGreaterThan(0.14);
    });

    test('and there is more than one bar, or it is a hoop again', () => {
        expect(named('helmet-mask').length).toBeGreaterThanOrEqual(4);
    });
});

describe('the silhouette', () => {
    test('ear flaps hang below the middle of the shell', () => {
        for (const flap of named('helmet-flap')) {
            expect(box(flap).min.y).toBeLessThan(HEAD.y - 0.05);
        }
        expect(named('helmet-flap').length).toBe(2);
    });

    test('the whole thing is longer than it is tall', () => {
        const whole = unionOf(parts);
        expect(whole.max.z - whole.min.z).toBeGreaterThan(whole.max.y - whole.min.y);
    });

    /**
     * THE FACE OPENING FACES FORWARD, and getting this wrong puts it over one
     * ear. Three builds a sphere as `z = r·sin(phi)·sin(theta)`, so phi = PI/2
     * is +Z and +Z is the way the rig faces. Read off the geometry rather than
     * off the arguments: the shell's vertices should thin out ahead of the head
     * and not behind it.
     */
    test('the opening is at the front, not over an ear', () => {
        const pos = parts[0].geometry.attributes.position;
        let ahead = 0;
        let behind = 0;
        let left = 0;
        let right = 0;
        for (let i = 0; i < pos.count; i += 1) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (Math.abs(z) > Math.abs(x)) { if (z > 0) ahead += 1; else behind += 1; }
            else if (x > 0) right += 1; else left += 1;
        }
        expect(ahead).toBeLessThan(behind * 0.7);
        // And it is not lopsided, which a mis-centred sweep would be.
        expect(Math.abs(left - right)).toBeLessThan(Math.max(left, right) * 0.25);
    });
});
