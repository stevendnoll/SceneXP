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
import { GARDEN_CONFIG } from '../www/garden/js/config.js';
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

// ---- The canopy has to move with the wood ----------------------------------

test('the leaf shader applies the branch sway, not just its own flutter', () => {
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const leafBody = tree.slice(tree.indexOf('const LEAF_BODY'));
    const body = leafBody.slice(0, leafBody.indexOf('`;'));
    // The per-leaf weight has to reach the displacement, not merely exist.
    expect(body).toMatch(/aLeafSway/);
    expect(body).toMatch(/uWind[\s\S]{0,400}aLeafSway/);
});

test('the branch sway is the SAME expression in both shaders', () => {
    // If these two ever drift, the canopy slides off the branches by exactly
    // the difference, and it would look like a canopy that lags rather than
    // like two expressions disagreeing. Compare the coefficients that define
    // the motion rather than the whole line, since the two differ in where they
    // read their height from.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const grab = (marker) => {
        const block = tree.slice(tree.indexOf(marker));
        return block.slice(0, block.indexOf('`;'));
    };
    const coeffs = (src) => {
        const m = src.match(/sin\(\w+\) \* 0\.62 \+ sin\(\w+ \* 1\.73 \+ 1\.3\) \* 0\.38/);
        return m ? m[0].replace(/\w+WP|\w+BWP/g, 'P') : null;
    };
    const bark = coeffs(grab('const BARK_BODY'));
    const leaf = coeffs(grab('const LEAF_BODY'));
    expect(bark).not.toBeNull();
    expect(leaf).not.toBeNull();
    expect(leaf).toBe(bark);

    // And both must run at the same rate, or the canopy beats against the wood.
    expect(grab('const BARK_BODY')).toMatch(/uTime \* 1\.35 \+ uPhase/);
    expect(grab('const LEAF_BODY')).toMatch(/uTime \* 1\.35 \+ uPhase/);
});

test('sway is scaled by the tree, in both shaders', () => {
    // Without uSwayScale the displacement is absolute, so at wind 1.0 a 3 m
    // maple swung a third of its own height while a 14 m redwood moved 7
    // percent of its. That reads as one tree thrashing while the rest barely
    // stir, which is not what one wind looks like.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    for (const marker of ['const BARK_BODY', 'const LEAF_BODY']) {
        const block = tree.slice(tree.indexOf(marker));
        expect(block.slice(0, block.indexOf('`;'))).toMatch(/uSwayScale \* uScale/);
    }
});

// ---- The wood is not the leaves --------------------------------------------

test('the season tints foliage only, so the perimeter wood keeps brown trunks', () => {
    // THE BUG THIS EXISTS TO STOP. The far tier drew trunk, limbs and canopy
    // into one white texture and then set `material.color` to the season, which
    // tinted every pixel of it. The perimeter wood grew green trunks.
    const forest = readFileSync(join(DIR, 'forest.js'), 'utf8');

    // Wood is drawn in RED so its green channel is 0 and the shader can tell
    // wood from leaf. If this ever goes back to white the mask is all 1s and
    // the trunks silently go green again with nothing failing.
    const texture = forest.slice(forest.indexOf('function buildCanopyTexture'));
    expect(texture.slice(0, texture.indexOf('\n}'))).toMatch(/strokeStyle = 'rgba\(255,\s*0,\s*0,\s*1\)'/);

    // The mix has to read that channel and use a bark colour.
    expect(forest).toMatch(/texture2D\(map, vMapUv\)\.g/);
    expect(forest).toMatch(/mix\(uCanopyBark, uCanopySeason/);

    // And the season must NOT be written to the material colour any more.
    const update = forest.slice(forest.indexOf('export function updateForest'));
    const body = update.slice(0, update.indexOf('\n}'));
    expect(body).not.toMatch(/deciduous\.material\.color\.setHex/);
    expect(body).toMatch(/setSeason\(deciduous\.material/);
});

test('the canopy material names its own program cache key', () => {
    // three's default cache key is `onBeforeCompile.toString()`. Two materials
    // sharing an injector stringify identically and the second is handed the
    // first one's compiled program, which cost this project a day once already.
    const forest = readFileSync(join(DIR, 'forest.js'), 'utf8');
    expect(forest).toMatch(/customProgramCacheKey\s*=\s*\(\)\s*=>\s*'garden-canopy'/);
});

test('no backtick survives inside an injected GLSL block', () => {
    // A BACKTICK IN A GLSL COMMENT ENDS THE TEMPLATE LITERAL, and the failure
    // is "SyntaxError: missing ) after argument list" pointing at a line that
    // looks fine. This is in the decision log from 2026-08-25 and I walked
    // into it again while writing a comment about map_fragment. Read as text
    // so this reports the real problem, since a suite that IMPORTS the broken
    // module just fails to load and says nothing useful.
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))) {
        const src = readFileSync(join(DIR, file), 'utf8');
        for (const m of src.matchAll(/\.replace\('#include <[^']+>',\s*`([\s\S]*?)`\)/g)) {
            expect(`${file}: ${m[1].includes('`') ? 'BACKTICK INSIDE GLSL' : 'clean'}`).toBe(`${file}: clean`);
        }
    }
});

test('the canopy mask is assigned, not multiplied', () => {
    // The texture RGB here is a MASK, not a colour. map_fragment has already
    // multiplied it into diffuseColor, so `*=` multiplies the mask in twice:
    // wood is drawn pure red, so bark came out (bark.r, 0, 0) and the whole
    // perimeter wood grew CRIMSON trunks with red slashes through the canopies.
    const forest = readFileSync(join(DIR, 'forest.js'), 'utf8');
    expect(forest).toMatch(/diffuseColor\.rgb = mix\(uCanopyBark, uCanopySeason/);
    expect(forest).not.toMatch(/diffuseColor\.rgb \*= mix\(uCanopyBark/);
});

test('colours reach the tree shaders in linear, not as sRGB digits', () => {
    // three renders in linear and encodes at output. material.color.setHex()
    // converts, and the pond shader converts explicitly, but this one wrote the
    // hex's sRGB digits straight into diffuseColor. Every leaf rendered lighter
    // and flatter than the colour it was authored as, which a green forgives
    // and a dark red does not: the Japanese Maple came out salmon pink.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const fn = tree.slice(tree.indexOf('function setVec'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/srgbToLinear/);
});

test('every injected material names its own program cache key, and no two share one', () => {
    // three's default cache key is `onBeforeCompile.toString()`. `patchVertex`
    // is ONE shared helper, so two materials that pass through it stringify
    // identically and the second is handed the first one's compiled program:
    // floods of "uniform location not for current program", the wrong
    // attributes demanded of the wrong geometry, and uniforms that never reach
    // a shader at all. That is in the decision log from 2026-08-25 and it cost
    // a day. The keys are the whole defence, so they have to be distinct.
    const keys = [];
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))) {
        const src = readFileSync(join(DIR, file), 'utf8');
        for (const m of src.matchAll(/patchVertex\([\s\S]{0,400}?,\s*'([a-z0-9-]+)'\s*\)/g)) keys.push(m[1]);
        for (const m of src.matchAll(/customProgramCacheKey\s*=\s*\(\)\s*=>\s*'([a-z0-9-]+)'/g)) keys.push(m[1]);
    }
    expect(keys.length).toBeGreaterThan(3);
    expect(new Set(keys).size).toBe(keys.length);
});

// ---- Leaf flutter and the motion damp (M8-7, M8-9) -------------------------

test('the leaf flutter is a SECOND motion, not the branch one repeated', () => {
    // Two motions at one frequency read as one motion. The branch runs at 1.35
    // and the flutter used to run at 1.6, close enough that the two beat slowly
    // and the canopy looked like a rigid thing being pushed.
    const tree = readFileSync(join(DIR, 'tree.js'), 'utf8');
    const leaf = tree.slice(tree.indexOf('const LEAF_BODY'));
    const body = leaf.slice(0, leaf.indexOf('`;'));

    // Its own rate, from config, not a literal near the branch's.
    expect(body).toMatch(/uTime \* \(uFlutterRate/);
    // And well clear of the branch. Read both numbers rather than trusting one.
    const rate = GARDEN_CONFIG.tree.leafFlutter.rate;
    expect(rate / 1.35).toBeGreaterThan(2.5);

    // TWO-SIDED. `sin * 0.5 + 0.5` never comes back through rest, so at a
    // steady wind it is a static offset with a wobble on it, not a flutter.
    expect(body).not.toMatch(/sin\(leafLP\) \* 0\.5 \+ 0\.5/);
    // And it pushes ACROSS the wind as well as along it, which is a leaf
    // turning rather than a leaf sliding.
    expect(body).toMatch(/uFlutterCross/);
});

test('the wood flutters on the same terms the garden does', () => {
    const forest = readFileSync(join(DIR, 'forest.js'), 'utf8');
    expect(forest).toMatch(/uFlutterRate/);
    expect(forest).toMatch(/uFlutterCross/);
    // The bark block must NOT declare the leaf-only attribute: a geometry that
    // does not have it gets fed zeros by the driver, silently.
    const bark = forest.slice(forest.indexOf('const SWAY_HEAD'));
    expect(bark.slice(0, bark.indexOf('`;'))).not.toMatch(/aFlutter/);
});

test('reduced motion damps every moving term, and removes none of them', () => {
    // THIS INVERTS THE HOUSE RULE ON PURPOSE, so it is asserted rather than
    // left to a reader's judgement. The movement is the content here.
    expect(GARDEN_CONFIG.tree.reducedMotion).toBeGreaterThan(0);
    expect(GARDEN_CONFIG.tree.reducedMotion).toBeLessThan(1);
    expect(GARDEN_CONFIG.weather.gust.reducedDamp).toBeGreaterThan(0);
    expect(GARDEN_CONFIG.weather.gust.reducedDamp).toBeLessThan(1);

    // NAMED ONE BY ONE, on purpose. Two earlier versions of this scanned the
    // shader text for "motion terms" and both produced false positives,
    // because a motion term is not syntactically distinguishable from a static
    // one: `sin(aPhase * 3.1)` in the leaf-fall scatter is a per-leaf CONSTANT,
    // and `vec3 barkGust = vec3(uWind.x, ...)` is a declaration rather than a
    // displacement. Listing them is duller and it is right.
    //
    // A term added later will not be caught here. That is the cost, and the
    // reason it is acceptable: the damp is one multiply at the end of a line,
    // and this file is where somebody adding one will look.
    const body = (file, marker) => {
        const src = readFileSync(join(DIR, file), 'utf8');
        const block = src.slice(src.indexOf(marker));
        return block.slice(0, block.indexOf('`;'));
    };
    const damped = (text, needle) => {
        const at = text.indexOf(needle);
        expect(at).toBeGreaterThanOrEqual(0);
        const statement = text.slice(at, text.indexOf(';', at));
        expect(`${needle.slice(0, 24)}: ${statement.includes('uMotion') ? 'damped' : 'UNDAMPED'}`)
            .toBe(`${needle.slice(0, 24)}: damped`);
    };

    // The planted trees: branch sway, leaf flutter, and the branch sway the
    // leaves inherit so the canopy travels with the wood under it.
    damped(body('tree.js', 'const BARK_BODY'), 'transformed += barkGust');
    damped(body('tree.js', 'const LEAF_BODY'), 'vec3 leafWorld = (leafAlong');
    damped(body('tree.js', 'const LEAF_BODY'), 'leafWorld += vec3(uWind.x');
    // The wood: the same two.
    damped(body('forest.js', 'const SWAY_BODY'), 'transformed += vec3(uWind.x');
    damped(body('forest.js', 'const LEAF_SWAY_BODY'), 'transformed += (vec3(uWind.x');
});

test('reduced motion still never reaches the clock', () => {
    // M4-9's rule, restated because M8-9 changes what the flag does everywhere
    // else it is read. Less movement, never less garden.
    //
    // The check is on ASSIGNMENTS to the clock, not on lines that mention both.
    // A first version failed on `stepWeather(..., state.elapsedSeconds, ...,
    // state.reducedMotion)`, which passes the two side by side and is exactly
    // what the code should look like.
    const main = readFileSync(join(DIR, 'main.js'), 'utf8');
    for (const line of main.split('\n')) {
        if (!/elapsedSeconds\s*[-+*/]?=[^=]/.test(line)) continue;
        expect(`${line.trim()}`).not.toMatch(/reduced|motionScale/i);
    }
});
