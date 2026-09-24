// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/shared/js/fractaltree-1.0.0.js and treespecies-1.0.0.js, the
 * garden's fractal trees promoted to shared parts on 2026-09-23.
 *
 * The garden's own suites (garden-tree, garden-scene, garden-shaders) still
 * hold the shapes, the masks and the shaders the garden tuned, now against
 * these files. This suite holds what the promotion ADDED and what a second
 * scene relies on:
 *
 *   1. SETTINGS COME IN AND ARE HONORED. A tree built without settings is the
 *      garden's tree, and a scene's own settings really change it.
 *   2. updateTree READS WHAT THE TREE WAS BUILT WITH, so a scene cannot tune
 *      a tree's build and have its sway fall back to the garden's numbers.
 *   3. ONE WIND MOVES THE WHOLE TREE. Bark, leaves and fruit share one wind
 *      vector by reference, which is the seam Tornado Alley bends them by.
 *   4. Every species builds against real three, fruit and all, and the
 *      scene-wide masks are drawn once.
 *
 * Real three runs in a vm context, as in tests/person-rig-seams.test.mjs, so
 * geometry and instance matrices hold real numbers. The canvas is a recorder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

let THREE;
let FT;
let TS;

/** A 2D context that accepts every drawing call and remembers how many. */
function recordingContext() {
    const calls = { count: 0 };
    return new Proxy({ calls }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
                return () => ({ addColorStop() {} });
            }
            if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
            return () => { calls.count += 1; };
        },
        set(target, prop, value) { target[prop] = value; return true; }
    });
}

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    globalThis.document = {
        createElement: () => {
            const context = recordingContext();
            return { width: 0, height: 0, style: {}, getContext: () => context, context };
        }
    };
    TS = await import('../www/shared/js/treespecies-1.0.0.js');
    FT = await import('../www/shared/js/fractaltree-1.0.0.js');
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

/** Run a material's patch the way three would, and return the result. */
function compile(material) {
    const lib = material.isMeshDepthMaterial ? THREE.ShaderLib.depth : THREE.ShaderLib.standard;
    const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader, {});
    return shader;
}

const VIEW = {
    growth: 0.8, time: 3.5, wind: { x: 0.6, z: -0.25 }, motion: 1,
    leaf: 1, drop: 0.1, bud: 0.2, snow: 0.3, health: 0.9, color: 0.4, spring: 0.5,
    crop: 0.6, fruit: { bloom: 0.2, size: 0.7, ripe: 0.4, drop: 0.05 }
};

describe('settings come in and are honored', () => {
    test('with none, a tree is the garden tree, built from TREE_DEFAULTS', () => {
        const resolved = TS.resolveSpecies('sugar-maple');
        const plain = FT.createTree(resolved, 11);
        const explicit = FT.createTree(resolved, 11, { settings: FT.TREE_DEFAULTS });
        expect(plain.settings).toBe(FT.TREE_DEFAULTS);
        expect(Array.from(plain.bark.geometry.attributes.position.array))
            .toEqual(Array.from(explicit.bark.geometry.attributes.position.array));
    });

    test('a scene\'s own numbers change the tree it gets', () => {
        const resolved = TS.resolveSpecies('sugar-maple');
        const settings = {
            ...FT.TREE_DEFAULTS,
            tree: { ...FT.TREE_DEFAULTS.tree, trunkSides: 5, leafCardScale: 4, saplingScale: 0.5 }
        };
        const garden = FT.createTree(resolved, 11);
        const mine = FT.createTree(resolved, 11, { settings });
        expect(mine.bark.geometry.attributes.position.count)
            .toBeLessThan(garden.bark.geometry.attributes.position.count);
        expect(mine.barkUniforms.uScale.value).toBe(0.5);
        // The same leaf, twice the card.
        const scaleOf = (tree) => {
            const m = new THREE.Matrix4();
            tree.leafMesh.getMatrixAt(0, m);
            return new THREE.Vector3().setFromMatrixScale(m).x;
        };
        expect(scaleOf(mine) / scaleOf(garden)).toBeCloseTo(2, 5);
        expect(FT.sidesForDepth(0, settings)).toBe(5);
        expect(FT.sidesForDepth(0)).toBe(FT.TREE_DEFAULTS.tree.trunkSides);
    });

    test('updateTree reads the settings the tree was built with', () => {
        const resolved = TS.resolveSpecies('sugar-maple');
        const settings = {
            ...FT.TREE_DEFAULTS,
            tree: { ...FT.TREE_DEFAULTS.tree, saplingScale: 0.5, saplingThickness: 0.9 }
        };
        const tree = FT.createTree(resolved, 5, { settings });
        FT.updateTree(tree, { ...VIEW, growth: 0 }, resolved);
        expect(tree.barkUniforms.uScale.value).toBe(0.5);
        expect(tree.barkUniforms.uThick.value).toBe(0.9);
        // A tree without the field (built before the promotion) falls back.
        delete tree.settings;
        FT.updateTree(tree, { ...VIEW, growth: 0 }, resolved);
        expect(tree.barkUniforms.uScale.value).toBe(FT.TREE_DEFAULTS.tree.saplingScale);
    });

    test('a phone gets the smaller branch budget', () => {
        const resolved = TS.resolveSpecies('bur-oak');
        const desk = FT.createTree(resolved, 9);
        const phone = FT.createTree(resolved, 9, { mobile: true });
        expect(phone.skeleton.segments.length).toBeLessThanOrEqual(FT.TREE_DEFAULTS.tree.maxSegmentsMobile);
        expect(phone.skeleton.segments.length).toBeLessThan(desk.skeleton.segments.length);
    });
});

describe('one wind moves the whole tree', () => {
    test('bark, leaves and fruit share the wind, clock and growth by reference', () => {
        const resolved = TS.resolveSpecies(TS.SPECIES.find((s) => s.fruit).id);
        const tree = FT.createTree(resolved, 3);
        expect(tree.fruitUniforms).not.toBeNull();
        for (const key of ['uWind', 'uTime', 'uGrowth', 'uSwayScale', 'uMotion']) {
            expect(tree.leafUniforms[key]).toBe(tree.barkUniforms[key]);
            expect(tree.fruitUniforms[key]).toBe(tree.barkUniforms[key]);
        }
        FT.updateTree(tree, VIEW, resolved);
        expect(tree.barkUniforms.uWind.value.toArray()).toEqual([0.6, 0, -0.25]);
        expect(tree.barkUniforms.uTime.value).toBe(3.5);
    });

    test('A STEADY LEAN is opt-in: 0 unless a view asks, and shared by the whole tree', () => {
        // Added for Tornado Alley, whose inflow is a steady pull rather than the
        // garden's coming and going. The garden never sets it, so its trees
        // only swing, exactly as before the promotion.
        const resolved = TS.resolveSpecies(TS.SPECIES.find((s) => s.fruit).id);
        const tree = FT.createTree(resolved, 8);
        expect(tree.barkUniforms.uLean.value).toBe(0);
        expect(tree.leafUniforms.uLean).toBe(tree.barkUniforms.uLean);
        expect(tree.fruitUniforms.uLean).toBe(tree.barkUniforms.uLean);
        FT.updateTree(tree, VIEW, resolved);
        expect(tree.barkUniforms.uLean.value).toBe(0);
        FT.updateTree(tree, { ...VIEW, lean: 1.3 }, resolved);
        expect(tree.barkUniforms.uLean.value).toBe(1.3);
        // The same term in all three shaders, so the canopy stays on the branch.
        for (const m of [tree.barkMaterial, tree.leafMaterial, tree.fruitMaterial]) {
            expect(compile(m).vertexShader).toMatch(/0\.38 \+ uLean\)/);
        }
    });

    test('reduced motion damps it, and an absent flag means full motion', () => {
        const resolved = TS.resolveSpecies('sugar-maple');
        const tree = FT.createTree(resolved, 1);
        FT.updateTree(tree, { ...VIEW, motion: 0.35 }, resolved);
        expect(tree.barkUniforms.uMotion.value).toBe(0.35);
        const { motion, ...still } = VIEW;
        FT.updateTree(tree, still, resolved);
        expect(tree.barkUniforms.uMotion.value).toBe(1);
        expect(motion).toBe(1);
    });

    test('sway is a fraction of the tree, not a number of metres', () => {
        const resolved = TS.resolveSpecies('sugar-maple');
        const tree = FT.createTree(resolved, 1);
        expect(tree.barkUniforms.uSwayScale.value)
            .toBeCloseTo(resolved.matureHeight * FT.TREE_DEFAULTS.tree.swayPerMetre, 10);
    });
});

describe('every species builds against real three', () => {
    test('bark, leaves, fruit where it has any, compiled shaders, and a clean dispose', () => {
        for (const species of TS.SPECIES) {
            const resolved = TS.resolveSpecies(species.id);
            const tree = FT.createTree(resolved, 21);
            expect(tree.leafCount).toBeGreaterThan(0);
            expect(Boolean(tree.fruitMesh)).toBe(Boolean(resolved.schedule));
            // Each patched material compiles its own named program.
            const materials = [tree.barkMaterial, tree.leafMaterial,
                tree.bark.customDepthMaterial, tree.leafMesh.customDepthMaterial];
            if (tree.fruitMaterial) materials.push(tree.fruitMaterial);
            const keys = new Set();
            for (const m of materials) {
                const shader = compile(m);
                expect(shader.vertexShader).toContain('uWind');
                keys.add(m.customProgramCacheKey());
            }
            expect(keys.size).toBe(materials.length);
            // Now the shader uniforms exist, updateTree reaches them too.
            FT.updateTree(tree, VIEW, resolved);
            expect(tree.barkMaterial.userData.shader.uniforms.uSnow.value).toBe(0.3);
            expect(tree.leafMaterial.userData.shader.uniforms.uHealth.value).toBe(0.9);
            if (tree.fruitMaterial) {
                expect(tree.fruitUniforms.uBloom.value).toBe(0.2);
                expect(tree.fruitMaterial.userData.shader.uniforms.uSnow.value).toBe(0.3);
            }
            FT.disposeTree(tree);
        }
        FT.disposeTree(null);
    });

    test('a tree with a fruit mesh but no stage this frame leaves the fruit alone', () => {
        const resolved = TS.resolveSpecies(TS.SPECIES.find((s) => s.fruit).id);
        const tree = FT.createTree(resolved, 4);
        const { fruit, ...noFruit } = VIEW;
        FT.updateTree(tree, noFruit, resolved);
        expect(tree.fruitUniforms.uBloom.value).toBe(0);
        expect(fruit.bloom).toBe(0.2);
    });
});

describe('the scene-wide masks', () => {
    test('the leaf mask is drawn once and shared', () => {
        const a = FT.leafClusterTexture();
        const b = FT.leafClusterTexture(64);
        expect(a).toBe(b);
        expect(a.isTexture).toBe(true);
    });

    test('each fruit shape is drawn once, and an unknown shape is an apple', () => {
        for (const shape of Object.keys(FT.FRUIT_SHAPES)) {
            const first = FT.blossomFruitTexture(shape);
            expect(first.isTexture).toBe(true);
            expect(FT.blossomFruitTexture(shape)).toBe(first);
            expect(FT.fruitClusterSpan(shape)).toBeGreaterThan(0);
        }
        expect(FT.blossomFruitTexture('durian')).toBe(FT.blossomFruitTexture('apple'));
    });
});

describe('the color helpers', () => {
    test('unpack a hex and linearize sRGB the way the garden sky does', () => {
        expect(FT.unpackColor(0xff8000)).toEqual([1, 128 / 255, 0]);
        expect(FT.srgbToLinear(0)).toBe(0);
        expect(FT.srgbToLinear(1)).toBeCloseTo(1, 10);
        expect(FT.srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
    });
});

describe('the species part', () => {
    test('a new seed comes from the caller\'s randomness and is a 32-bit integer', () => {
        expect(TS.newSeed(() => 0.5)).toBe(Math.floor(0.5 * 0xFFFFFFFF) >>> 0);
        const seed = TS.newSeed();
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
    });

    test('flowering, lookup and words for the sliders', () => {
        expect(TS.isFlowering(null)).toBe(false);
        expect(TS.isFlowering(TS.SPECIES.find((s) => s.fruit))).toBe(true);
        expect(TS.speciesById('no-such-tree')).toBeNull();
        expect(TS.sliderWords('nope', 1)).toBe('');
        const height = TS.SLIDERS.find((s) => s.key === 'height');
        expect(TS.sliderWords('height', height.min)).toMatch(/^very /);
        expect(TS.sliderWords('height', height.max)).toMatch(/^very /);
    });
});
