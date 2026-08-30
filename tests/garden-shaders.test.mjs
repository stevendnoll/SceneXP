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

// ---- Vector widths (M9-4) --------------------------------------------------
//
// THIS IS THE LINT THAT WOULD HAVE SAVED THE WHOLE RAIN SYSTEM.
//
// `RAIN_VERT` shipped with `p.xz += lean * fall * 0.12`, where `lean` is a
// vec3. GLSL ES has no such assignment: the operands of += must be the same
// size, or one of them a scalar. So the rain program never compiled, the rain
// mesh never drew a single pixel in any weather at any hour, and the only
// precipitation anybody ever saw was snow. It was reported in QA as "rain looks
// like snow", which is exactly what a missing shader looks like from the
// outside, and the suite stayed green throughout because a shader is a string
// here and a string always compiles.
//
// This does not typecheck GLSL. It walks assignments whose two sides both have
// a width it can work out with certainty, and says so when they differ. Where
// it cannot be certain, of a call it does not know or a ternary, it says
// nothing rather than guessing: a lint that needs a list of exceptions is the
// wrong generalisation, which this file has already learned once.

const SWIZZLE = /^[xyzwrgbastpq]+$/;
const UNKNOWN = -1;
const MIXED = -2;

/** Widths three itself puts in scope, which no local declaration will show. */
const BUILTIN_WIDTHS = {
    position: 3, normal: 3, uv: 2, transformed: 3, objectNormal: 3,
    transformedNormal: 3, gl_Position: 4, gl_FragColor: 4, gl_PointCoord: 2,
    gl_FragCoord: 4, gl_PointSize: 1, diffuseColor: 4, vViewPosition: 3,
    mvPosition: 4, worldPosition: 4
};

function declaredWidths(body) {
    const widths = { ...BUILTIN_WIDTHS };
    const decl = /\b(?:uniform|attribute|varying|in|out|const)?\s*\b(float|int|bool|vec2|vec3|vec4)\s+([A-Za-z_]\w*)/g;
    let m;
    while ((m = decl.exec(body)) !== null) {
        widths[m[2]] = m[1].startsWith('vec') ? Number(m[1].slice(3)) : 1;
    }
    return widths;
}

/** Split an expression on top-level operators, so a vec3(a, b * c) stays whole. */
function splitTopLevel(expr, operators) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0 && operators.includes(c)) {
            // A leading sign is not an operator, it is part of the term.
            if (expr.slice(start, i).trim() === '') continue;
            parts.push(expr.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(expr.slice(start).trim());
    return parts.filter((p) => p !== '');
}

function combineWidths(widths) {
    if (widths.includes(MIXED)) return MIXED;
    if (widths.includes(UNKNOWN)) return UNKNOWN;
    // A scalar broadcasts against anything, so only the vectors have to agree.
    const vectors = widths.filter((n) => n > 1);
    if (vectors.length === 0) return 1;
    if (vectors.some((n) => n !== vectors[0])) return MIXED;
    return vectors[0];
}

function widthOfExpression(expr, widths) {
    const text = expr.trim();
    if (text === '') return UNKNOWN;

    const terms = splitTopLevel(text, '+-');
    if (terms.length > 1) return combineWidths(terms.map((t) => widthOfExpression(t, widths)));
    const factors = splitTopLevel(text, '*/');
    if (factors.length > 1) return combineWidths(factors.map((f) => widthOfExpression(f, widths)));

    if (/^\(.*\)$/.test(text)) return widthOfExpression(text.slice(1, -1), widths);
    if (/^[-+]?[0-9.]+$/.test(text)) return 1;
    const constructor = text.match(/^(vec[234]|float|int)\s*\(/);
    if (constructor) return constructor[1].startsWith('vec') ? Number(constructor[1].slice(3)) : 1;
    if (text.includes('(')) return UNKNOWN;          // a call this lint does not model
    const swizzle = text.match(/^[A-Za-z_]\w*\.([A-Za-z]+)$/);
    if (swizzle) return SWIZZLE.test(swizzle[1]) ? swizzle[1].length : UNKNOWN;
    if (/^[A-Za-z_]\w*$/.test(text)) return widths[text] === undefined ? UNKNOWN : widths[text];
    return UNKNOWN;
}

function widthOffences() {
    const offences = [];
    for (const block of glslBlocks()) {
        const widths = declaredWidths(block.body);
        block.body.split('\n').forEach((raw, i) => {
            const line = raw.replace(/\/\/.*/, '').trim();
            if (!line || line.includes('?') || line.includes('#')) return;
            const m = line.match(
                /^(?:(float|int|bool|vec2|vec3|vec4)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z]+)?)\s*([-+*/]?=)\s*(.+?);?$/);
            if (!m || m[3] === '==') return;

            let left;
            if (m[1]) {
                left = m[1].startsWith('vec') ? Number(m[1].slice(3)) : 1;
            } else {
                const swizzle = m[2].match(/^[A-Za-z_]\w*\.([A-Za-z]+)$/);
                if (swizzle) {
                    if (!SWIZZLE.test(swizzle[1])) return;
                    left = swizzle[1].length;
                } else {
                    left = widths[m[2]];
                }
            }
            if (left === undefined) return;

            const right = widthOfExpression(m[4], widths);
            const where = `${block.file}:${block.line + i}`;
            if (right === MIXED) {
                offences.push(`${where} mixes vector widths on the right: ${line}`);
            } else if (right !== UNKNOWN && right !== 1 && right !== left) {
                offences.push(`${where} assigns a vec${right} to a vec${left}: ${line}`);
            }
        });
    }
    return offences;
}

test('no shader assigns a vector to a differently sized one', () => {
    expect(widthOffences()).toEqual([]);
});

test('the width lint can actually see the bug it exists for', () => {
    // A guard on the guard, in the shape this file already uses for the block
    // extractor. A lint that reports nothing because it stopped matching is
    // worse than no lint, and this one is deliberately quiet wherever it is
    // unsure, so quiet is its normal state.
    const widths = declaredWidths(`
        uniform vec3 uWind;
        attribute float aTop;
        void main() { vec3 p = position; }
    `);
    expect(widths.uWind).toBe(3);
    expect(widths.aTop).toBe(1);

    // The exact line that shipped.
    expect(widthOfExpression('lean * fall * 0.12', { lean: 3, fall: 1 })).toBe(3);
    // A scalar broadcasts and must never be reported.
    expect(widthOfExpression('vec2(1.0, 2.0) * aTop', { aTop: 1 })).toBe(2);
    // Two different vectors in one expression are wrong wherever they land.
    expect(widthOfExpression('vec2(1.0) + vec3(1.0)', {})).toBe(MIXED);
    // And a call it does not model is left alone rather than guessed at.
    expect(widthOfExpression('mix(a, b, t)', {})).toBe(UNKNOWN);
});

// ---- The bed and the water level (M10) -------------------------------------

test('the bed takes the season, and stops short of vanishing into it', () => {
    // A bed that stayed brown through a covered winter would be the only bare
    // earth in the frame. A bed that went ALL THE WAY to snow read as a pale
    // slab in QA and, worse, stopped being findable: it is the tap target, and
    // one that disappears in winter takes the care loop with it for a quarter
    // of the year.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    expect(beds).toMatch(/uniform float uSnow;/);
    expect(beds).toMatch(/mix\(uMulch, uSnowColor, uSnow \* uSnowMix\)/);
    expect(GARDEN_CONFIG.garden.bed.snowMix).toBeGreaterThan(0.5);
    expect(GARDEN_CONFIG.garden.bed.snowMix).toBeLessThan(1);
    // Assigned, not multiplied by the map. `map_fragment` has already folded
    // the map into diffuseColor, and multiplying a second time is the
    // crimson-trunk bug. The mottle that DOES multiply is a shade, not a mask.
    expect(beds).toMatch(/diffuseColor\.rgb = mix\(uMulch/);
    // AND NOTHING IS INJECTED INTO THE VERTEX SHADER. A world-space mottle
    // that needed a varying went in, and the next batch of screenshots came
    // back with two of four beds not drawn at all, with every count, matrix
    // and clearance measuring correct in Node. Until that is understood, this
    // material touches the fragment stage only.
    expect(beds).not.toMatch(/shader\.vertexShader/);
});

test('THE WATER LEVEL HOLDS A SIZE ON SCREEN, not in metres', () => {
    // Sized in metres alone it measured 24 x 3.3 px in the middle of the plot
    // and 17 x 2.3 at the back, and three pixels cannot show a fraction of
    // anything. It is a readout, so it has a floor in pixels.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    const vert = beds.slice(beds.indexOf('const LEVEL_VERT'));
    const body = vert.slice(0, vert.indexOf('`;'));
    expect(body).toMatch(/uniform float uPxPerRad;/);
    expect(body).toMatch(/bedGrow = max\(1\.0, uMinPx/);
    // Uniform, so the bar keeps its shape rather than stretching.
    expect(body).toMatch(/mv\.xy \+= position\.xy \* bedGrow;/);

    // And the floor is a size somebody can actually read a fraction off.
    const B = GARDEN_CONFIG.garden.bed;
    expect(B.minLevelPx).toBeGreaterThanOrEqual(6);
    // Wide enough to read, narrow enough that two trees on adjacent cells
    // never collide: they are 41 px apart at the back of the plot.
    const barWidth = B.minLevelPx * (B.levelWidth / B.levelHeight);
    expect(barWidth).toBeGreaterThan(24);
    expect(barWidth).toBeLessThan(41);
});

test('THE WATER LEVEL IS UNLIT, or it vanishes exactly when it is needed', () => {
    // Same reason the droplet it replaces was MeshBasicMaterial: a readout has
    // to be legible at midnight, and midnight here is a whole season.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    const block = beds.slice(beds.indexOf('function buildLevelMesh'));
    const body = block.slice(0, block.indexOf('\n}\n'));
    expect(body).toMatch(/new THREE\.ShaderMaterial/);
    expect(body).not.toMatch(/MeshLambertMaterial|MeshStandardMaterial|MeshPhongMaterial/);
    expect(body).toMatch(/fog: false/);
});

test('URGENCY IS CARRIED BY COLOUR, and the gauge stays readable either way', () => {
    // The first version faded the whole gauge to 32 percent when the tank was
    // full, which kept a healthy garden calm and also made it unreadable: QA
    // could not see the indicator at all. Urgency still has to reach the
    // fragment, but through the colour, with visibility kept high in both
    // states.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    const frag = beds.slice(beds.indexOf('const LEVEL_FRAG'));
    const body = frag.slice(0, frag.indexOf('`;'));
    expect(body).toMatch(/step\(vBedUv\.x, vBedFill\)/);
    // A rim, which is what a 35 x 8 px readout needs most.
    expect(body).toMatch(/bedShown = mix\(bedShown, uBorderColor, bedRim\)/);

    // ---- AND THE URGENCY IS ON THE DRY SIDE (M13-1) ----------------------
    // It used to read mix(uFull, uEmpty, vBedUrgency), applied where the fill
    // IS. An empty tank has no fill, so the amber that means "out of water"
    // could not be drawn on a tree that was out of water, and the gauge came
    // out as track and rim: 2.13:1 and 2.71:1 on the mulch it lies on, which
    // QA read as no gauge at all.
    //
    // These two assertions are a pair and the second is the load-bearing one.
    // The urgency mix has to be against the TRACK, and it must not be applied
    // to the water, or the amber goes back to living on the part that
    // disappears.
    expect(body).toMatch(/mix\(uTrack, uEmpty, vBedUrgency\)/);
    expect(body).not.toMatch(/mix\(uFull, uEmpty, vBedUrgency\)/);

    // And a full tank is still visible: the quiet floor is a dimming, not a
    // disappearance.
    expect(GARDEN_CONFIG.garden.bed.levelQuiet).toBeGreaterThan(0.7);
    expect(GARDEN_CONFIG.garden.bed.levelQuiet).toBeLessThan(1);
});

test('THE DROPLET IS A DISTANCE FIELD, not a sampled picture', () => {
    // It is 17 px on screen and the visitor can dolly in until it is far more
    // than that, so a canvas texture would be a 17 px drawing stretched. The
    // shape is solved per fragment instead, which costs nothing at this size
    // and is crisp at every one.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    const frag = beds.slice(beds.indexOf('const DROP_FRAG'));
    const body = frag.slice(0, frag.indexOf('`;'));
    expect(body).not.toMatch(/sampler2D|texture2D|texture\(/);
    expect(body).toMatch(/float dropField\(vec2 p\)/);

    // A TEARDROP AND NOT AN ICE CREAM. The cone's flanks have to be TANGENT to
    // the lobe or the silhouette has two corners where they meet, which at 17
    // px is most of what there is to look at. Tangency is what sinT encodes,
    // and it has to be derived from the lobe rather than typed in beside it.
    expect(body).toMatch(/float sinT = lobeR \/ /);
    expect(body).toMatch(/cosT = sqrt\(1\.0 - sinT \* sinT\)/);
    // The wedge is cut off at the lobe's centre, or it widens forever downward
    // and the droplet grows a skirt.
    expect(body).toMatch(/cone = max\(cone, lobeAt\.y - p\.y\)/);

    // A dark outline, which is the only part that reads on grass: measured, the
    // pale blue body is 1.34:1 against spring grass and the outline is 8.79:1.
    expect(body).toMatch(/mix\(uDropEdge, uDropColor, dropCore\)/);
});

test('the droplet MOVES rather than fading, and the ring is the loud part', () => {
    // A control that fades in and out reads as one that might be disabled, and
    // this one is pressable the whole time it is on screen. So every signal it
    // has is geometry.
    const B = GARDEN_CONFIG.garden.bed;
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    const vert = beds.slice(beds.indexOf('const DROP_VERT'));
    const vertBody = vert.slice(0, vert.indexOf('`;'));
    const frag = beds.slice(beds.indexOf('const DROP_FRAG'));
    const fragBody = frag.slice(0, frag.indexOf('`;'));

    expect(vertBody).toMatch(/uSizePx \* uCardScale \* dropGrow/);
    expect(fragBody).not.toMatch(/uPulse/);
    // The alpha is the tree's own thirst and the material's opacity, so a
    // droplet is either arriving or fully there, never breathing away.
    expect(fragBody).toMatch(/dropAlpha = dropIn \* uOpacity \* vDropThirst/);

    // ---- THE SWELL IS THE WEAK SIGNAL AND IS SIZED ACCORDINGLY (M13-4) ----
    // It shipped at 0.06, which QA read as not looking tappable and which is
    // half a pixel on a 17 px drawing. The eye reads a change of POSITION much
    // more readily than a change of extent, so the bob has to be worth more
    // pixels than the swell, and this is the arithmetic that says so.
    const swellPx = B.dropSizePx * B.dropPulse;
    expect(B.dropBobPx).toBeGreaterThan(swellPx);
    expect(B.dropBobPx).toBeGreaterThanOrEqual(1.5);
    // And neither is allowed to become a second weather system.
    expect(B.dropBobPx).toBeLessThan(4);
    expect(B.dropPulse).toBeLessThan(0.12);

    // The ring sweeps and then PAUSES. A ring running continuously would be
    // sixteen things moving in a frame whose only motion is meant to be trees.
    expect(B.dropRingSweep).toBeGreaterThan(0);
    expect(B.dropRingSweep).toBeLessThan(0.6);
    expect(fragBody).toMatch(/if \(uRingAt >= 0\.0\)/);
    // It goes BEHIND the droplet, never over it.
    expect(fragBody).toMatch(/ringShow = ringAlpha \* \(1\.0 - dropAlpha\)/);

    // The card has to hold the ring at full reach, or it clips into a square.
    // The ring stops at 0.47 of the card and fades to nothing before then.
    expect(B.dropCardScale * 0.47).toBeLessThan(B.dropCardScale * 0.5);
    expect(B.dropCardScale).toBeGreaterThan(2);
});

test('the ring reaches the size of the TARGET, not the size of the drawing', () => {
    // The point of the ring is that it shows a visitor how big the thing they
    // have to hit actually is. The droplet is 17 px and the target is 44, so a
    // ring that stopped at the droplet's own edge would be teaching the wrong
    // number. It sweeps out to roughly the target instead.
    const B = GARDEN_CONFIG.garden.bed;
    const reachPx = B.dropSizePx * B.dropCardScale * 0.47;
    expect(reachPx).toBeGreaterThan(B.dropSizePx * 0.5);
    expect(reachPx).toBeGreaterThan(B.dropPickPx * 0.8);
    expect(reachPx).toBeLessThan(B.dropPickPx * 1.3);
});

test('REDUCED MOTION TAKES THE RING AWAY, and leaves the droplet', () => {
    // The ring is the one element here that is purely animation, so somebody
    // who asked for less movement gets none of it rather than a slower one.
    // Everything that CARRIES INFORMATION stays: the droplet, its colour, the
    // gauge under it. Nothing in this scene is said only by moving.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    expect(beds).toMatch(/uRingAt\.value = \(motion >= 1 && phase < B\.dropRingSweep\)/);
    // The swell and the bob scale with it rather than switching off, because a
    // control that is completely inert reads as a disabled one.
    expect(beds).toMatch(/B\.dropPulse \* motion \* swing/);
    expect(beds).toMatch(/B\.dropBobPx \* motion \* -swing/);
});

test('the bed material names its own program cache key', () => {
    // three's default key is onBeforeCompile.toString(), so a new injected
    // material without one can be handed another's compiled program.
    const beds = readFileSync(join(DIR, 'beds.js'), 'utf8');
    expect(beds).toMatch(/customProgramCacheKey = \(\) => 'garden-bed'/);
});

test('INJECTED UNIFORMS GO THROUGH THE `#include <common>` SEAM', () => {
    // Every material in this scene that patches a three shader declares its
    // uniforms by replacing `#include <common>`. One of them prepended them to
    // the top of the shader source instead, and it was the only one in the
    // scene that did not draw. The mechanism was never proven, so this pins
    // the convention rather than a theory: match the injections that work.
    //
    // A green suite cannot tell a shader that compiles from one that does not,
    // so consistency across the four is the only guard available here.
    const offences = [];
    for (const name of readdirSync(DIR)) {
        if (!name.endsWith('.js') || name.endsWith('.min.js')) continue;
        const src = readFileSync(join(DIR, name), 'utf8');
        if (!src.includes('onBeforeCompile')) continue;
        // A prepend looks like: shader.fragmentShader = `...` + shader.fragmentShader
        if (/shader\.(fragment|vertex)Shader\s*=\s*`[^`]*`\s*\+\s*shader\./.test(src)) {
            offences.push(`${name} prepends to a three shader instead of using the include seam`);
        }
    }
    expect(offences).toEqual([]);

    // And the seam really is in use, so this cannot pass by finding nothing.
    const patched = readdirSync(DIR)
        .filter((n) => n.endsWith('.js') && !n.endsWith('.min.js'))
        .map((n) => readFileSync(join(DIR, n), 'utf8'))
        .filter((src) => src.includes('onBeforeCompile'));
    expect(patched.length).toBeGreaterThanOrEqual(3);
    for (const src of patched) {
        expect(src).toMatch(/replace\('#include <(common|map_fragment|begin_vertex)>'/);
    }
});
