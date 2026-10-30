// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-stripes.test.mjs - the stripe over the helmet and the stripes down the
 * pants, measured (Steve, 2026-10-30).
 *
 * A REAL THREE, FOR THE SAME REASON xo-helmet.test.mjs NEEDS ONE: the stub has
 * no vertices, and the only question about a stripe is where its vertices are.
 * A stripe is paint on a surface, so every vertex has to sit a hair above that
 * surface and nowhere else: a helmet stripe that lifts off the long back of the
 * shell, narrows to a point on top (the longitude-band mistake), or runs down
 * over the face opening is wrong in ways a 60-pixel figure hides and a Box3
 * cannot see. So this projects every vertex back onto the surface it is meant
 * to ride and reads the distance.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const js = (name) => join(root, 'www/xo/js', name);

let THREE;
let CFG;
let roster;
let people;

/** Every vertex of `mesh` in world space (its matrix world brought up to date). */
function worldVertices(mesh) {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < pos.count; i += 1) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    return out;
}

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    CFG = (await import(js('config.min.js'))).XO_CONFIG;
    roster = await import(js('roster.js'));
    people = await import(join(root, 'www/shared/js/people-1.0.0.js'));
});

describe('the stripe over the helmet', () => {
    let parts;
    let stripe;

    beforeAll(() => {
        const shellMat = new THREE.MeshStandardMaterial({ color: 0xff992c });
        shellMat.side = THREE.DoubleSide;
        parts = roster.buildHelmetParts(
            shellMat, new THREE.MeshStandardMaterial({ color: 0x2a1a0c }), new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        const group = new THREE.Group();
        for (const p of parts) group.add(p);
        group.updateMatrixWorld(true);
        stripe = parts.find((p) => p.name === 'helmet-stripe');
    });

    /** A vertex in the shell's own frame: the ellipsoid undone, so the shell's
     *  surface is the sphere of radius `SHELL.r`, and the angle down from its top. */
    const onShell = (p) => {
        const S = roster.SHELL;
        const d = new THREE.Vector3(
            (p.x - S.at[0]) / S.scale[0], (p.y - S.at[1]) / S.scale[1], (p.z - S.at[2]) / S.scale[2]
        );
        return { ratio: d.length() / S.r, theta: Math.acos(d.y / d.length()), front: d.z > 0, x: p.x - S.at[0] };
    };

    test('is built only when asked for, so the helmet without one is the helmet there was', () => {
        const plain = roster.buildHelmetParts(
            new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()
        );
        expect(plain.some((p) => p.name === 'helmet-stripe')).toBe(false);
        expect(parts.length).toBe(plain.length + 1);
        expect(stripe).toBeTruthy();
        expect(stripe.visible).toBe(false);
    });

    test('hugs the shell at every vertex, a hair above it, at one width all the way over', () => {
        const S = CFG.stripes.helmet;
        const verts = worldVertices(stripe);
        expect(verts.length).toBeGreaterThan(20);
        const halfArc = roster.SHELL.r * (1 + S.lift) * Math.sin(S.halfWidth) * roster.SHELL.scale[0];
        let widest = 0;
        for (const p of verts) {
            const { ratio, x } = onShell(p);
            // On the ellipsoid, lifted by `lift` and no more: a band that only
            // matched the sphere would sit inside the long back of the shell.
            expect(ratio).toBeCloseTo(1 + S.lift, 6);
            expect(Math.abs(x)).toBeLessThanOrEqual(halfArc + 1e-9);
            widest = Math.max(widest, Math.abs(x));
        }
        // The full width is used all the way along, not pinched anywhere: the
        // band is two edges and a centre line, and every vertex is on one of
        // the three, with the edges two thirds of them.
        expect(widest).toBeCloseTo(halfArc, 6);
        const edges = verts.filter((p) => Math.abs(Math.abs(onShell(p).x) - halfArc) < 1e-6);
        const centre = verts.filter((p) => Math.abs(onShell(p).x) < 1e-6);
        expect(edges.length + centre.length).toBe(verts.length);
        expect(edges.length).toBe(centre.length * 2);
    });

    test('runs from the brow, over the top, to just above the rim at the back, and never over the face', () => {
        const verts = worldVertices(stripe).map(onShell);
        const CROWN = Math.PI * 0.42;
        const top = Math.min(...verts.map((v) => v.theta));
        const brow = Math.max(...verts.filter((v) => v.front).map((v) => v.theta));
        const back = Math.max(...verts.filter((v) => !v.front).map((v) => v.theta));
        expect(top).toBeLessThan(0.05);
        // The crown cap ends and the face opening begins at CROWN: the stripe
        // reaches the brow and stops there.
        expect(brow).toBeGreaterThan(CROWN - 0.02);
        expect(brow).toBeLessThan(CROWN + 0.02);
        // Down the back past the equator, stopping short of the rim.
        expect(back).toBeGreaterThan(Math.PI / 2 + 0.5);
        expect(back).toBeLessThan(Math.PI * roster.SHELL.sweep - 0.1);
        const box = new THREE.Box3().setFromObject(stripe);
        expect(box.max.y).toBeGreaterThan(roster.HEAD.hairHigh);
    });
});

describe('the stripes down the pants', () => {
    /** A figure as the roster builds one, with its two legs. */
    const build = (muscular) => {
        const person = people.createPerson({ role: 'customer', shoulderRound: 0.35, handScale: 1.9, muscular });
        person.position.set(0, 0, 0);
        person.updateMatrixWorld(true);
        return { person, legs: person.children.filter((c) => c.userData && c.userData.isLeg) };
    };
    const cylinders = (leg) => leg.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry' && c.name !== 'pants-stripe');

    test.each([false, true])('on a %s build: one down the outside of each thigh and shin, riding its taper a hair proud', (muscular) => {
        const S = CFG.stripes.pants;
        const { person, legs } = build(muscular);
        expect(legs.length).toBe(2);
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        for (const leg of legs) {
            const strips = roster.buildPantsStripeParts(leg, material, { muscular });
            expect(strips.length).toBe(2);
            for (const s of strips) leg.add(s);
            person.updateMatrixWorld(true);
            const hip = new THREE.Vector3();
            leg.getWorldPosition(hip);
            for (const s of strips) {
                expect(s.name).toBe('pants-stripe');
                expect(s.visible).toBe(false);
                expect(s.parent).toBe(leg);
                const seg = cylinders(leg).find((c) => Math.abs(c.position.y - s.position.y) < 1e-9);
                expect(seg).toBeTruthy();
                const P = seg.geometry.parameters;
                let lowest = Infinity;
                let highest = -Infinity;
                for (const p of worldVertices(s)) {
                    const local = p.clone().sub(hip);
                    // The segment's radius at this height, top to bottom.
                    const t = (P.height / 2 + s.position.y - local.y) / P.height;
                    expect(t).toBeGreaterThanOrEqual(-1e-6);
                    expect(t).toBeLessThanOrEqual(1 + 1e-6);
                    const radius = P.radiusTop + (P.radiusBottom - P.radiusTop) * t;
                    expect(Math.hypot(local.x, local.z) / radius).toBeCloseTo(1 + S.lift, 6);
                    // On the outside of the leg, and nowhere near the inside.
                    expect(Math.sign(local.x)).toBe(leg.userData.legSide);
                    expect(Math.abs(local.x)).toBeGreaterThan(radius * Math.cos(S.halfWidth));
                    lowest = Math.min(lowest, local.y);
                    highest = Math.max(highest, local.y);
                }
                // The whole segment, top to bottom.
                expect(highest).toBeCloseTo(s.position.y + P.height / 2, 6);
                expect(lowest).toBeCloseTo(s.position.y - P.height / 2, 6);
            }
        }
    });

    test('swing with the leg, because they hang off the stride\'s own pivot', () => {
        const { person, legs } = build(false);
        const leg = legs[0];
        const [strip] = roster.buildPantsStripeParts(leg, new THREE.MeshStandardMaterial(), {});
        leg.add(strip);
        person.updateMatrixWorld(true);
        const before = worldVertices(strip).map((p) => p.z);
        leg.rotation.x = 0.6;
        person.updateMatrixWorld(true);
        const after = worldVertices(strip).map((p) => p.z);
        expect(after.some((z, i) => Math.abs(z - before[i]) > 0.05)).toBe(true);
    });

    /**
     * THE FALLBACK IS THE RIG, NOT A GUESS. Under the test stub a leg's geometry
     * has no parameters, so the strips are built from numbers written in
     * roster.js. Those numbers are checked here against the leg the rig
     * actually builds, so a change to people-1.0.0 fails this rather than
     * quietly moving every stripe on every page that runs under the stub.
     */
    test.each([false, true])('the fallback numbers on a %s build are the rig\'s own', (muscular) => {
        const { legs } = build(muscular);
        const real = roster.buildPantsStripeParts(legs[1], new THREE.MeshStandardMaterial(), { muscular });
        const bare = { userData: { legSide: 1 }, children: [] };
        const guessed = roster.buildPantsStripeParts(bare, new THREE.MeshStandardMaterial(), { muscular });
        expect(guessed.length).toBe(2);
        for (let i = 0; i < 2; i += 1) {
            const a = real[i].geometry.parameters;
            const b = guessed[i].geometry.parameters;
            for (const key of ['radiusTop', 'radiusBottom', 'height', 'thetaStart', 'thetaLength']) {
                expect([key, b[key]]).toEqual([key, expect.closeTo(a[key], 9)]);
            }
            expect(guessed[i].position.y).toBeCloseTo(real[i].position.y, 9);
        }
    });

    /** ONE SHAPE FOR BOTH LEGS: the strip is cut about the right leg's outside
     *  and turned a half turn for the left, so the roster's interning (which
     *  keys a geometry by its parameters) keeps one buffer, not two. */
    test('a leg on the other side gets the same strip, turned to its other side', () => {
        const left = roster.buildPantsStripeParts({ userData: { legSide: -1 }, children: [] }, new THREE.MeshStandardMaterial(), {});
        const right = roster.buildPantsStripeParts({ userData: { legSide: 1 }, children: [] }, new THREE.MeshStandardMaterial(), {});
        const centre = (s) => s.geometry.parameters.thetaStart + s.geometry.parameters.thetaLength / 2;
        expect(centre(left[0])).toBeCloseTo(Math.PI / 2, 9);
        expect(centre(right[0])).toBeCloseTo(Math.PI / 2, 9);
        expect(left[0].geometry.parameters).toEqual(right[0].geometry.parameters);
        expect(left[0].rotation.y).toBeCloseTo(Math.PI, 9);
        expect(right[0].rotation.y).toBe(0);
    });
});

describe('on the roster', () => {
    test('every player carries the five stripes hidden, in geometries shared across the team', async () => {
        const P = await import(js('play.min.js'));
        const C = await import(js('colors.min.js'));
        const scene = new THREE.Scene();
        const objects = P.lineUp(P.createPlay(), 'pass2', 'cover2');
        C.resetColors();
        roster.initRoster(scene, objects);
        const geometries = new Set();
        for (const obj of objects) {
            const names = [];
            roster.figureFor(obj.settings.position).traverse((n) => {
                if (n.name !== 'helmet-stripe' && n.name !== 'pants-stripe') return;
                names.push(n.name);
                expect(n.visible).toBe(false);
                geometries.add(n.geometry.uuid);
            });
            expect(names.sort()).toEqual(['helmet-stripe', 'pants-stripe', 'pants-stripe', 'pants-stripe', 'pants-stripe']);
        }
        // One helmet stripe, a thigh and a shin for the plain build and for the
        // linemen's muscular one: five shapes for the whole roster.
        expect(geometries.size).toBe(5);
        roster.disposeRoster();
    });
});
