// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/shared/js/wildflowers-1.0.0.js, the garden's wildflowers
 * promoted to a shared part on 2026-09-23.
 *
 * The garden's own suites hold how its meadow is placed and when it blooms.
 * This one holds the part itself, and above all the new sway:
 *
 *   1. A FLOWER STANDS ON ITS ROOT. The card runs from y 0 to 1, so scaling it
 *      grows it upward and the sway, which grows with height, leaves the root
 *      where it is.
 *   2. THE SWAY HOOK REALLY HOOKS. A .replace() whose needle three does not
 *      have fails silently: the flowers compile and stand dead still. So the
 *      patch is run against three's own Lambert shader and must change it.
 *   3. WITHOUT SWAY NOTHING IS PATCHED, which is why the garden's flowers
 *      are exactly what they were.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

let THREE;
let WF;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, { get: () => () => {}, set: () => true });
    globalThis.document = {
        createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context })
    };
    WF = await import('../www/shared/js/wildflowers-1.0.0.js');
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

const MEADOW = [
    { x: 1, y: 0, z: -3, size: 0.4, yaw: 0.3, hue: 0xf2c12e },
    { x: -2, y: 0.1, z: -5, size: 0.25, yaw: 1.9, hue: 0xb04fc0 },
    { x: 4, y: 0, z: -8, size: 0.33, yaw: 2.6, hue: 0xffffff }
];

test('a flower stands on its root, one unit tall', () => {
    const geo = WF.crossedQuad();
    const y = Array.from(geo.attributes.position.array).filter((_, i) => i % 3 === 1);
    expect(Math.min(...y)).toBe(0);
    expect(Math.max(...y)).toBe(1);
    expect(geo.index.count).toBe(12);
});

test('the meadow is one instanced mesh, colored and placed per plant', () => {
    const flowers = WF.createWildflowers(MEADOW);
    const { mesh } = flowers;
    expect(mesh.isInstancedMesh).toBe(true);
    expect(mesh.count).toBe(3);
    expect(mesh.name).toBe('wildflowers');
    const c = new THREE.Color();
    mesh.getColorAt(1, c);
    expect(c.getHex()).toBe(0xb04fc0);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const s = new THREE.Vector3().setFromMatrixScale(m);
    expect(p.toArray()).toEqual([1, 0, -3]);
    expect(s.y).toBeCloseTo(0.4, 6);
    expect(flowers.material.alphaTest).toBe(0.42);
    expect(flowers.material.map.isTexture).toBe(true);
    // Without sway, nothing is patched.
    expect(flowers.uniforms).toBeNull();
    expect(flowers.material.onBeforeCompile.toString()).not.toContain('SWAY');
    WF.updateWildflowers(flowers, { x: 1, z: 0 }, 2);
    WF.updateWildflowers(null, { x: 1, z: 0 }, 2);
});

test('bloom scales every flower from its root, and 0 takes them away', () => {
    const { mesh } = WF.createWildflowers(MEADOW);
    WF.placeWildflowers(mesh, MEADOW, 0.5);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(2, m);
    expect(new THREE.Vector3().setFromMatrixScale(m).y).toBeCloseTo(0.165, 6);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([4, 0, -8]);
    WF.placeWildflowers(mesh, MEADOW, 0);
    mesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixScale(m).y).toBe(0);
    // Nothing to place is nothing to do.
    WF.placeWildflowers(null, MEADOW, 1);
    WF.placeWildflowers(mesh, [], 1);
});

test('THE SWAY HOOK REALLY HOOKS three\'s Lambert shader', () => {
    const lib = THREE.ShaderLib.lambert;
    expect(lib.vertexShader).toContain('#include <project_vertex>');
    expect(lib.vertexShader).toContain('#include <common>');
    const flowers = WF.createWildflowers(MEADOW, { sway: { amount: 0.3, rate: 2.2 }, alphaTest: 0.5 });
    const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
    flowers.material.onBeforeCompile(shader, {});
    expect(shader.vertexShader).not.toContain('#include <project_vertex>');
    expect(shader.vertexShader).toContain('uniform vec3 uWind;');
    expect(shader.vertexShader).toContain('mvPosition = instanceMatrix * mvPosition;');
    expect(shader.uniforms.uWind).toBe(flowers.uniforms.uWind);
    expect(flowers.material.customProgramCacheKey()).toBe('wildflowers-sway');
    expect(flowers.material.alphaTest).toBe(0.5);

    WF.updateWildflowers(flowers, { x: 0.8, z: -0.4 }, 7.5);
    expect(flowers.uniforms.uWind.value.toArray()).toEqual([0.8, 0, -0.4]);
    expect(flowers.uniforms.uTime.value).toBe(7.5);
    expect(flowers.uniforms.uSway.value).toBe(0.3);
    expect(flowers.uniforms.uSwayRate.value).toBe(2.2);
});

test('a scene can bring its own mask, and there is none without a document', () => {
    const texture = new THREE.Texture();
    expect(WF.createWildflowers(MEADOW, { texture }).material.map).toBe(texture);
    const saved = globalThis.document;
    delete globalThis.document;
    expect(WF.flowerTexture(32, 5)).toBeNull();
    globalThis.document = { createElement: () => ({ getContext: () => null }) };
    expect(WF.flowerTexture(32, 5)).toBeNull();
    globalThis.document = saved;
});
