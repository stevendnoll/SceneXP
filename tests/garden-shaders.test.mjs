// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A static lint over the hand-written GLSL in Fractal Garden.
 *
 * WHY THIS FILE EXISTS. The whole scene once shipped with a fragment shader
 * that would not compile, and every one of the 2,153 tests passed while it did.
 * The test harness replaces THREE with a chainable proxy so the pure layer can
 * be asserted under Node, and the price of that is total blindness to anything
 * the GPU would have said: a shader is just a string here, and a string cannot
 * fail to compile.
 *
 * So the shader source is checked as TEXT, for the mistakes that are actually
 * possible to make in it. This does not typecheck GLSL and it does not pretend
 * to. It catches the class of error that costs an entire shader and reports
 * itself in a message that does not name the real cause.
 *
 * The one that got through was a local variable called `patch`. It is a
 * reserved word in GLSL ES 3.00, held for tessellation, and three emits
 * "#version 300 es" on any WebGL2 context. The browser said "Illegal use of
 * reserved word" and nothing at all about which word or why it was reserved.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'www', 'garden', 'js');

/**
 * GLSL ES 3.00 reserved words.
 *
 * `attribute` and `varying` are reserved too and are deliberately NOT here:
 * three's ES3 prefix carries `#define attribute in` and `#define varying out`,
 * so the preprocessor has replaced them before the compiler ever sees a
 * keyword. Every other name on this list is a real error.
 */
const RESERVED = new Set(`
common partition active asm class union enum typedef template this packed goto
inline noinline volatile public static extern external interface long short
half fixed unsigned superp input output hvec2 hvec3 hvec4 fvec2 fvec3 fvec4
filter sizeof cast namespace using sampler3DRect subroutine patch sample
resource precise coherent restrict readonly writeonly buffer shared layout
atomic_uint centroid invariant smooth flat noperspective
`.trim().split(/\s+/));

/** Every template literal in the garden sources that looks like GLSL. */
function glslBlocks() {
    const blocks = [];
    for (const name of readdirSync(DIR)) {
        if (!name.endsWith('.js') || name.endsWith('.min.js')) continue;
        const src = readFileSync(join(DIR, name), 'utf8');
        const re = /`([^`]*)`/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            const body = m.group ? m.group(1) : m[1];
            if (!/\b(void main|uniform |vec[234] |float )/.test(body)) continue;
            blocks.push({
                file: name,
                line: src.slice(0, m.index).split('\n').length,
                body
            });
        }
    }
    return blocks;
}

test('there is GLSL to check', () => {
    // A guard on the guard. If the extraction ever stops matching, every test
    // below would pass by finding nothing, which is the worst way for a lint
    // to fail.
    const blocks = glslBlocks();
    expect(blocks.length).toBeGreaterThan(6);
    const files = new Set(blocks.map((b) => b.file));
    for (const expected of ['sky.js', 'terrain.js', 'tree.js', 'precip.js']) {
        expect(files.has(expected)).toBe(true);
    }
});

test('no shader uses a GLSL reserved word as a name', () => {
    const offences = [];
    for (const block of glslBlocks()) {
        block.body.split('\n').forEach((line, i) => {
            const code = line.replace(/\/\/.*/, '');
            if (code.includes('#include')) return;
            for (const ident of code.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || []) {
                if (RESERVED.has(ident)) {
                    offences.push(`${block.file}:${block.line + i} uses reserved word "${ident}"`);
                }
            }
        });
    }
    expect(offences).toEqual([]);
});

/**
 * Three's shader chunks, resolved.
 *
 * THE RAW BUNDLE IS NOT ENOUGH, and that mistake cost a second round trip. An
 * earlier version of this check searched three.min.js as plain text and
 * reported "no collisions" while `mat3 im` sat in `defaultnormal_vertex`
 * waiting to redefine ours. A chunk only becomes part of a shader once its
 * `#include` is expanded, so the includes have to be expanded here too.
 */
function threeShaders() {
    const bundle = readFileSync(join(process.cwd(), 'www', 'lib', 'three.min.js'), 'utf8');
    const chunks = new Map();
    for (const m of bundle.matchAll(/([a-z_0-9]+):"((?:[^"\\]|\\.)*)"/g)) {
        if (!chunks.has(m[1])) chunks.set(m[1], m[2]);
    }
    const unescape = (t) => t
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
        .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const resolve = (src, depth = 0) => depth > 8 ? src : src.replace(
        /#include <([a-z_0-9]+)>/g,
        (_, name) => resolve(unescape(chunks.get(name) || ''), depth + 1));

    const out = {};
    for (const name of ['meshphysical_vert', 'meshphysical_frag', 'depth_vert', 'depth_frag']) {
        if (chunks.has(name)) out[name] = resolve(unescape(chunks.get(name)));
    }
    return out;
}

const TYPE = String.raw`(?:float|int|bool|vec[234]|ivec[234]|bvec[234]|mat[234](?:x[234])?|uint|uvec[234])`;

test('the chunk resolver actually resolves', () => {
    // A guard on the guard: if the extraction breaks, the collision test below
    // would pass by comparing against nothing.
    const shaders = threeShaders();
    expect(Object.keys(shaders).length).toBe(4);
    // The declaration that caused the bug this test exists for.
    expect(shaders.meshphysical_vert).toContain('mat3 im');
});

test('no injected shader local collides with a name three already declares', () => {
    // Our bodies are spliced into the middle of three's own main(), where
    // hundreds of names are already in scope. A collision is a redefinition
    // error whose message names only the identifier, never the chunk it came
    // from or the fact that the chunk is three's rather than ours.
    const declared = new Set();
    for (const src of Object.values(threeShaders())) {
        for (const m of src.matchAll(new RegExp(String.raw`\b${TYPE}\s+([A-Za-z_][A-Za-z0-9_]*)`, 'g'))) {
            declared.add(m[1]);
        }
    }
    expect(declared.size).toBeGreaterThan(200);

    const offences = [];
    const decl = new RegExp(String.raw`\b${TYPE}\s+([A-Za-z_][A-Za-z0-9_]*)`, 'g');
    for (const block of glslBlocks()) {
        // Only the blocks that are spliced into three's main() can collide.
        if (!/transformed|diffuseColor/.test(block.body)) continue;
        block.body.split('\n').forEach((line, i) => {
            // COMMENTS ARE STRIPPED FIRST. Without this the check reports the
            // note explaining the bug as if it were the bug, which it did on
            // its first run: these shaders carry comments that quote GLSL.
            const code = line.replace(/\/\/.*/, '');
            for (const m of code.matchAll(decl)) {
                if (declared.has(m[1])) {
                    offences.push(`${block.file}:${block.line + i} declares "${m[1]}", which three also declares`);
                }
            }
        });
    }
    expect(offences).toEqual([]);
});

test('every material modified through onBeforeCompile names its own cache key', () => {
    // three's default program cache key is `onBeforeCompile.toString()`. Two
    // materials whose patching goes through one shared helper therefore
    // stringify identically and are handed the SAME compiled program: the
    // console fills with "uniform location not for current program", the wrong
    // attributes are demanded of the wrong geometry, and onBeforeCompile never
    // runs for the second material, so its uniforms never reach a shader.
    for (const name of ['tree.js', 'terrain.js']) {
        const src = readFileSync(join(DIR, name), 'utf8');
        const patched = (src.match(/onBeforeCompile\s*=/g) || []).length;
        const keyed = (src.match(/customProgramCacheKey\s*=/g) || []).length;
        expect(patched).toBeGreaterThan(0);
        expect(keyed).toBeGreaterThan(0);
    }

    // And the keys actually differ from one another.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const keys = (tree.match(/'garden-[a-z-]+'/g) || []);
    expect(keys.length).toBeGreaterThanOrEqual(4);
    expect(new Set(keys).size).toBe(keys.length);
});

test('injected shader bodies target chunks that three actually has', () => {
    // A .replace() whose needle is not in the source fails SILENTLY: the
    // shader compiles perfectly and simply does nothing this scene asked for.
    const three = readFileSync(join(process.cwd(), 'www', 'lib', 'three.min.js'), 'utf8');
    const targets = new Set();
    for (const name of ['tree.js', 'terrain.js']) {
        const src = readFileSync(join(DIR, name), 'utf8');
        for (const m of src.matchAll(/\.replace\(\s*'(#include <[a-z_]+>)'/g)) {
            targets.add(m[1]);
        }
    }
    expect(targets.size).toBeGreaterThan(1);
    for (const target of targets) {
        expect(`${target} present in three: ${three.includes(target)}`)
            .toBe(`${target} present in three: true`);
    }
});

// ---- The leaf mask ---------------------------------------------------------
//
// A leaf card is about five pixels across at the composed camera, and at five
// pixels the outline is the only thing separating foliage from confetti. The
// cards shipped as bare quads with no UVs and no map, and the QA screenshots of
// the first mature tree showed exactly that: a canopy of hard-edged rectangles
// with sky through it.
//
// These are text assertions for the same reason the rest of this file is: under
// the test stub a material is a proxy and a texture is a number, so the only
// honest place to check that a map was actually asked for is the source.

test('a leaf card carries the UVs its mask needs', () => {
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const card = tree.slice(tree.indexOf('function buildLeafCard'));
    const body = card.slice(0, card.indexOf('\n}'));
    expect(body).toMatch(/setAttribute\(\s*'uv'/);
});

test('both leaf materials wear the mask, or the shadows outlive the shape', () => {
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    // Anchored past the leaf texture, because the BARK material and the BARK
    // depth material are both declared first and rightly carry no mask. An
    // unanchored indexOf finds those and passes while the leaves stay bare,
    // which it duly did on the first run of this test.
    const leafSide = tree.slice(tree.indexOf('const leafTexture'));
    // The lit material.
    const lit = leafSide.slice(leafSide.indexOf('new THREE.MeshStandardMaterial'));
    expect(lit.slice(0, lit.indexOf('});'))).toMatch(/map:\s*leafTexture[\s\S]*alphaTest:/);
    // And the depth material, which draws the shadow. A mask on one and not the
    // other is more obviously wrong than the bug it replaces.
    const depth = leafSide.slice(leafSide.indexOf('new THREE.MeshDepthMaterial'));
    expect(depth.slice(0, depth.indexOf('}),'))).toMatch(/map:\s*leafTexture[\s\S]*alphaTest:/);
});

test('the alpha survives the fragment wrap that runs before the threshold', () => {
    // THE WHOLE FIX RESTS ON THIS. `wrapLeafFragment` hooks map_fragment and
    // must write only diffuseColor.rgb: assigning the whole vec4 would drop the
    // mask's alpha before alphatest_fragment ever sees it, and the leaves would
    // silently go back to being rectangles with no error anywhere.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const wrap = tree.slice(tree.indexOf('function wrapLeafFragment'));
    const body = wrap.slice(0, wrap.indexOf('\n}'));
    expect(body).toContain('#include <map_fragment>');
    expect(body).toMatch(/diffuseColor\.rgb\s*=/);
    expect(body).not.toMatch(/diffuseColor\s*=/);
});

test('the plot and the wood share one leaf mask', () => {
    // Two canopy textures would be two answers to what a leaf clump looks like,
    // and the join between the plot and the treeline is where that would show.
    const forest = readFileSync(join(DIR, 'forest.js'), 'utf8');
    expect(forest).toMatch(/import\s*\{[^}]*leafClusterTexture[^}]*\}\s*from\s*'\.\/tree\.min\.js'/);
    expect(forest).not.toMatch(/function buildLeafClusterTexture/);
});
