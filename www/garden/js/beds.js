// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * beds.js - The mulch bed under each planted tree, and the water level on it.
 *
 * THE BED IS THE TREE'S TAP TARGET, and that is what it is for. Before it, a
 * tree's target was its CANOPY: the largest thing it owns, hanging over exactly
 * the ground somebody wants to plant in, so the fuller the plot got the harder
 * it became to say "plant here" rather than "tend that one". A small patch at
 * the base cannot overlap a neighbour's, because the planting grid is 1.5 m and
 * a bed is 1.1 m across, so the ambiguity goes away by construction.
 *
 * ---- THE BED IS DRAWN FLAT AND PICKED IN SCREEN SPACE ----
 *
 * This is the load-bearing decision and it came out of a measurement. The
 * camera looks along the ground at about 17 degrees, so a bed of radius 0.55 m
 * on a 1280x800 frame is 60 x 30 px at the near edge of the plot, 36 x 11 in
 * the middle, and 24 x 5 at the far edge. **Five pixels tall is not a touch
 * target**, and no bigger bed fixes it: at 1.5 m spacing, a bed tappable at the
 * back would swallow its neighbours at the front.
 *
 * So a ray is never cast at a bed. Each tree's base is projected to the screen
 * once a frame, and a tap picks the NEAREST base within a radius that follows
 * the drawn bed's own projected width, floored so the back row stays reachable.
 * Same idea as www/gavin's tolerance ring, applied to a target that is
 * foreshortened rather than small.
 *
 * Everything that decides is a pure function of plain numbers, so the pick can
 * be asserted without a renderer.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { heightAt, cellCenter } from './terrain.min.js';
import { clamp01 } from './clock.min.js';
import { unpackColor, srgbToLinear } from './sky.min.js';

// ---- The rules (pure) ------------------------------------------------------

/**
 * How the ground sits under a bed: the lowest and highest terrain inside its
 * footprint.
 *
 * THE PLOT ROLLS, and a flat disc dropped at the cell's centre height buries
 * its downhill edge and floats its uphill one. Relief runs -0.67 to +0.86 m
 * with a steepest slope of 17.7 degrees, which across a 1.1 m bed moves the
 * ground by up to 0.35 m. Sampling the rim is what lets the bed be raised
 * enough to clear whatever it is standing on.
 */
export function groundUnderBed(x, z, radius, samples = 8) {
    let low = heightAt(x, z);
    let high = low;
    for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const h = heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
        if (h < low) low = h;
        if (h > high) high = h;
    }
    return { low, high };
}

/**
 * Where a bed's body starts and stops, in metres.
 *
 * It spans from a little under the lowest ground it covers to a lip above the
 * highest, so no part of the rim is ever buried and no part of it floats. The
 * height is capped, because a pathological slope would otherwise draw a pillar
 * rather than a bed.
 */
export function bedSpan(x, z, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    const { low, high } = groundUnderBed(x, z, B.radius);
    const bottom = low - B.skirt;
    const top = Math.min(high + B.lip, bottom + B.maxHeight);
    return { bottom, top, height: Math.max(B.lip, top - bottom) };
}

/**
 * The radius, in pixels, within which a tap counts as landing on a bed.
 *
 * It FOLLOWS THE DRAWN BED so the target matches what the visitor sees, and it
 * has a floor so the back of the plot stays reachable: a bed there is about 24
 * px wide, and a 12 px target is not one.
 */
export function bedPickRadius(projectedHalfWidthPx, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    return Math.max(B.minPickPx, projectedHalfWidthPx * B.pickScale);
}

/**
 * Which tree a tap belongs to, or null for "none of them, so plant".
 *
 * NEAREST WINS, which is what makes crowding degrade gracefully. Two trees on
 * adjacent cells are 1.5 m apart, which is 24 px at the back of the plot, so
 * their targets overlap. "Which disc did the ray hit" has no answer there and
 * "which centre is closest" always does.
 *
 * @param {number} tapX,tapY  in CSS pixels
 * @param {Array} bases       [{ entry, x, y, radiusPx }], already projected
 */
export function pickBase(tapX, tapY, bases, config = GARDEN_CONFIG) {
    let best = null;
    let bestDistance = Infinity;
    for (const base of bases) {
        if (!base || base.behind) continue;
        const dx = tapX - base.x;
        const dy = tapY - base.y;
        const distance = Math.hypot(dx, dy);
        if (distance > bedPickRadius(base.radiusPx, config)) continue;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = base.entry;
        }
    }
    return best;
}

/**
 * How full a tree's water level reads, 0 to 1.
 *
 * Not the raw moisture. The level is ALWAYS ON SCREEN, sixteen of them, in a
 * scene whose whole point is watching trees move, so a full tank has to be
 * quiet and an empty one has to be plain. This is the fill; `levelUrgency`
 * below is the contrast, and keeping them separate is what lets a healthy
 * garden look like a garden rather than like sixteen warnings.
 */
export function levelFill(moisture) {
    return clamp01(moisture);
}

/**
 * How loudly a level asserts itself, 0 (quiet, full) to 1 (empty).
 *
 * Zero until the tank is down to `noticeAbove`, so watering a tree puts its
 * level back to silent rather than merely less shrill.
 */
export function levelUrgency(moisture, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    const m = clamp01(moisture);
    if (m >= B.noticeAbove) return 0;
    return clamp01((B.noticeAbove - m) / B.noticeAbove);
}

/**
 * How present a tree's droplet is, 0 (absent) to 1 (fully out).
 *
 * TWO SIGNALS, TWO THRESHOLDS, AND THEY ARE NOT THE SAME ONE. The gauge starts
 * warning at `noticeAbove` (0.55), which is a long, quiet slide from blue to
 * amber. The droplet is a BUTTON, so it appears later and much more decisively,
 * at `thirstyBelow` (0.25), which is the same line the tree card has always
 * used for the word "thirsty". A gauge that is going amber says the tree will
 * want something soon; a droplet says it wants something now, and offers it.
 *
 * The fade span exists so a droplet arrives rather than blinks on. It is short:
 * a control that is half there is a control a visitor is not sure they may
 * press, so most of the span is spent at full presence.
 */
export function dropPresence(moisture, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    const at = config.garden.moisture.thirstyBelow;
    const span = Math.max(0.0001, B.dropFadeSpan);
    return clamp01((at - clamp01(moisture)) / span);
}

/**
 * Where a tree's droplet sits, given where its gauge projected to.
 *
 * THE DRAWING AND THE TARGET COME FROM THIS ONE FUNCTION, which is the whole
 * point of it existing. The shader lifts the droplet off the same anchor by the
 * same `dropRisePx`, so "where it looks like it is" and "where tapping works"
 * are the same statement rather than two that have to be kept in step.
 */
export function dropScreenY(anchorY, config = GARDEN_CONFIG) {
    return anchorY - config.garden.bed.dropRisePx;
}

/**
 * Which tree's droplet a tap landed on, or null.
 *
 * TRIED BEFORE `pickBase`, AND THAT ORDER IS THE DESIGN. Measured on a 1280x800
 * frame, a gauge's top edge is 7 to 8 px above its bed's own base point while
 * the bed's target has a 22 px floor, so a droplet drawn above the gauge sits
 * INSIDE the bed's target at every row of the plot. Two overlapping circles
 * asking "which is nearer" would be a coin toss decided by a couple of pixels.
 *
 * Precedence settles it instead: a thirsty tree's droplet wins its own
 * neighbourhood, the bed keeps everything below, and a tree with no droplet
 * behaves exactly as it did before this existed. Nearest still wins among
 * droplets, because two adjacent trees are 41 px apart at the back of the plot
 * and their targets do overlap each other.
 *
 * @param {Array} bases [{ entry, x, y, dropY, thirst }], already projected
 */
export function pickDrop(tapX, tapY, bases, config = GARDEN_CONFIG) {
    const B = config.garden.bed;
    let best = null;
    let bestDistance = Infinity;
    for (const base of bases) {
        if (!base || base.behind) continue;
        // NO DROPLET, NO TARGET. An invisible button is worse than no button:
        // it would water a tree that a visitor was trying to open the card on.
        if (!(base.thirst > 0)) continue;
        const dy = tapY - (typeof base.dropY === 'number' ? base.dropY : base.y);
        const distance = Math.hypot(tapX - base.x, dy);
        if (distance > B.dropPickPx) continue;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = base.entry;
        }
    }
    return best;
}

/** How many of these trees are asking for water. Drives the Water all
 *  control, and is a plain count so the label can say it out loud. */
export function thirstyCount(entries, config = GARDEN_CONFIG) {
    let n = 0;
    for (const e of entries) {
        if (e && e.record && e.record.moisture < config.garden.moisture.thirstyBelow) n += 1;
    }
    return n;
}

// ---- State -----------------------------------------------------------------

let bedMesh = null;
let levelMesh = null;
let bedUniforms = null;
let levelUniforms = null;
let sceneRef = null;
let fillAttr = null;
let urgencyAttr = null;
let dropMesh = null;
let dropUniforms = null;
let thirstAttr = null;
let scratch = null;

const LEVEL_VERT = `
uniform float uPxPerRad;
uniform float uMinPx;
uniform float uWorldHeight;
attribute float aFill;
attribute float aUrgency;
varying vec2 vBedUv;
varying float vBedFill;
varying float vBedUrgency;
void main() {
    vBedUv = uv;
    vBedFill = aFill;
    vBedUrgency = aUrgency;
    // BILLBOARDED IN VIEW SPACE: take the instance's origin through the view
    // matrix, then offset by the quad's own corners. The bar always faces the
    // eye with no per-instance work on the CPU and no orientation to keep in
    // step. A strip lying flat on the bed would be nearly edge-on at this
    // camera's 17 degrees, which is to say a line.
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // IT HAS A FLOOR IN PIXELS, BECAUSE IT IS A READOUT AND NOT A PROP. Sized
    // in metres alone it measured 24 x 3.3 px at the middle of the plot and
    // 17 x 2.3 at the back, and three pixels cannot show a fraction of
    // anything. This grows the quad, uniformly so the shape holds, until it is
    // at least uMinPx tall, and leaves it alone once the eye is close enough
    // that its own size is bigger. The floor is what a visitor reads across
    // the plot; the world size is what makes it grow when they come and look.
    float bedDepth = max(0.001, -mv.z);
    float bedPx = (uWorldHeight * uPxPerRad) / bedDepth;
    float bedGrow = max(1.0, uMinPx / max(0.0001, bedPx));
    mv.xy += position.xy * bedGrow;
    gl_Position = projectionMatrix * mv;
}
`;

const LEVEL_FRAG = `
uniform vec3 uEmpty;
uniform vec3 uFull;
uniform vec3 uTrack;
uniform vec3 uBorderColor;
uniform float uOpacity;
uniform float uQuiet;
uniform float uBorder;
uniform float uAspect;
uniform float uTick;
varying vec2 vBedUv;
varying float vBedFill;
varying float vBedUrgency;
void main() {
    // A DARK RIM, because at 35 x 8 px an edge is worth more than any colour.
    // The measured problem was that the track sat at 1.53:1 against the mulch
    // it lies on and the fill at 1.32:1 against snow, so on a bed you could
    // see the water and not the tank, and in winter the other way round. A rim
    // gives the whole gauge a silhouette on both. The x distance is scaled by
    // the aspect so the border is even in world units rather than in uv.
    float bedRim = 1.0 - step(uBorder,
        min(min(vBedUv.x, 1.0 - vBedUv.x) * uAspect, min(vBedUv.y, 1.0 - vBedUv.y)));
    // uv.x runs 0 to 1 across the bar. Everything left of the fill is water.
    float bedWet = step(vBedUv.x, vBedFill);
    // ---- THE AMBER IS ON THE DRY SIDE ------------------------------------
    // It used to tint the WATER, as mix(uFull, uEmpty, urgency), painted only
    // where uv.x < fill. An empty tank has no fill, so the colour that means
    // "this tree is out of water" was the one colour that could not appear
    // when a tree was out of water, and what was left measured 2.13:1 against
    // mulch. What goes amber now is the part of the tank that is MISSING,
    // which is 3.87:1 there and is largest exactly when it matters most.
    vec3 bedDry = mix(uTrack, uEmpty, vBedUrgency);
    vec3 bedShown = mix(bedDry, uFull, bedWet);
    // ---- AND THE BOUNDARY IS DRAWN, NOT LEFT TO EMERGE --------------------
    // Blue on amber is 1.13:1: a hue pair, not a luminance one, so the edge
    // between them is nearly invisible at 8 px and gone entirely without
    // colour vision. Where a gauge is read is where the fill STOPS, so that
    // edge gets a tick in the rim colour, 11.82:1 against the water and
    // 10.47:1 against the dry side.
    //
    // Only where there IS a boundary. A fill of 0 or 1 would otherwise stamp
    // a dark bar down one end of a tank that is uniformly one thing.
    float bedEdge = 1.0 - step(uTick, abs(vBedUv.x - vBedFill) * uAspect);
    bedEdge *= step(0.001, vBedFill) * step(vBedFill, 0.999);
    bedShown = mix(bedShown, uBorderColor, bedEdge);
    bedShown = mix(bedShown, uBorderColor, bedRim);
    // URGENCY IS CARRIED BY COLOUR, NOT BY VISIBILITY. It used to fade the
    // whole gauge to 32 percent when the tank was full, which kept a healthy
    // garden calm and also made it unreadable. Blue to amber says the same
    // thing and can be seen while it says it.
    float bedAlpha = uOpacity * (uQuiet + (1.0 - uQuiet) * vBedUrgency);
    gl_FragColor = vec4(bedShown, bedAlpha);
}
`;

// ---- The droplet -----------------------------------------------------------

/**
 * A camera-facing card, sized and lifted in PIXELS off the gauge's own anchor.
 *
 * Same billboard trick as the gauge above, and the same reason: at this
 * camera's 17 degrees a flat marker lying on the bed is a line. What differs is
 * that this one has no world size at all. The gauge has a size in metres with a
 * floor in pixels, because it is part of the bed. A droplet is a CONTROL, so it
 * is the same size wherever the tree is, for the same reason a button does not
 * get smaller at the back of a room.
 */
const DROP_VERT = `
uniform float uPxPerRad;
uniform float uSizePx;
uniform float uRisePx;
uniform float uPulse;
attribute float aThirst;
varying vec2 vDropUv;
varying float vDropThirst;
void main() {
    vDropUv = uv;
    vDropThirst = aThirst;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Metres per pixel AT THIS DEPTH, which is what turns both numbers below
    // from pixels into a size the projection will honour.
    float dropDepth = max(0.001, -mv.z);
    float dropMetre = dropDepth / uPxPerRad;
    // THE RISE IS MEASURED FROM THE GAUGE'S ANCHOR, and it is the same number
    // dropScreenY subtracts on the CPU. The two have to agree or the button
    // is not under the drawing.
    mv.y += uRisePx * dropMetre;
    // THE PULSE IS A SIZE AND NEVER AN OPACITY. A control that fades in and out
    // reads as one that might be disabled, and this one is always pressable
    // while it is there. Small enough that it says "alive" rather than "look at
    // me", in a frame whose only other motion is the trees.
    mv.xy += position.xy * (uSizePx * uPulse * dropMetre);
    gl_Position = projectionMatrix * mv;
}
`;

/**
 * The teardrop itself, as a distance field.
 *
 * NO TEXTURE, because a 17 px drawing sampled from a canvas is a 17 px drawing
 * whatever mip it lands on, and this one has to stay crisp while the visitor
 * dollies in. It is a circle and a cone, and the cone's sides are TANGENT to
 * the circle rather than merely meeting it, which is the whole difference
 * between a teardrop and an ice cream.
 */
const DROP_FRAG = `
uniform vec3 uDropColor;
uniform vec3 uDropEdge;
uniform float uOpacity;
varying vec2 vDropUv;
varying float vDropThirst;

float dropField(vec2 p) {
    // The lobe, and the apex above it. sin(halfAngle) = r / |apex - centre|
    // makes the cone's flanks tangent, so the silhouette has no corner in it.
    vec2 lobeAt = vec2(0.0, -0.14);
    float lobeR = 0.29;
    float lobe = length(p - lobeAt) - lobeR;
    vec2 fromApex = p - vec2(0.0, 0.50);
    float sinT = lobeR / 0.64;
    float cosT = sqrt(1.0 - sinT * sinT);
    float cone = abs(fromApex.x) * cosT + fromApex.y * sinT;
    // The cone is a wedge that widens forever downward, so it is cut off at the
    // lobe's own centre and the lobe takes over from there.
    cone = max(cone, lobeAt.y - p.y);
    return min(lobe, cone);
}

void main() {
    vec2 dropP = vDropUv - 0.5;
    float dropD = dropField(dropP);
    // The card is uSizePx across, so one pixel is 1/uSizePx of uv. Softening by
    // a shade over that is what keeps a 17 px drawing from having stairs on it
    // without needing derivatives, which are not free on every target.
    float dropAA = 0.045;
    // A DARK OUTLINE, AND IT IS NOT DECORATION. Measured, the pale blue body is
    // 4.37:1 against mulch and 1.34:1 against spring grass, while the outline
    // is 2.71:1 and 8.79:1. Each carries the background the other cannot, and
    // a droplet floats above the bed, so it crosses both in one afternoon.
    float dropEdgeAt = 0.085;
    float dropIn = 1.0 - smoothstep(-dropAA, dropAA, dropD);
    float dropCore = 1.0 - smoothstep(-dropAA, dropAA, dropD + dropEdgeAt);
    vec3 dropShown = mix(uDropEdge, uDropColor, dropCore);
    // A HIGHLIGHT, which is the one thing that says "water" rather than "pin".
    float dropLit = 1.0 - smoothstep(0.0, 0.12, length(dropP - vec2(-0.075, -0.20)));
    dropShown = mix(dropShown, vec3(1.0), dropLit * 0.55 * dropCore);
    float dropAlpha = dropIn * uOpacity * vDropThirst;
    if (dropAlpha < 0.004) discard;
    gl_FragColor = vec4(dropShown, dropAlpha);
}
`;

function setVec(vec, hex) {
    const [r, g, b] = unpackColor(hex).map(srgbToLinear);
    vec.set(r, g, b);
}

// ---- Building --------------------------------------------------------------

function buildBedMesh(config, capacity) {
    const B = config.garden.bed;
    // A unit-height truncated cone, so a per-instance Y scale is the bed's
    // height in metres with no second number to keep in step.
    const geo = new THREE.CylinderGeometry(
        B.radius * B.taper, B.radius, 1, B.segments, 1, false);

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const uniforms = {
        uMulch: { value: new THREE.Vector3() },
        uSnowColor: { value: new THREE.Vector3() },
        uSnow: { value: 0 },
        uSnowMix: { value: B.snowMix }
    };
    setVec(uniforms.uMulch.value, B.color);
    setVec(uniforms.uSnowColor.value, config.terrain.snowColor);

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        // FRAGMENT ONLY, ON PURPOSE. A previous version also injected a
        // `varying vec3 vBedWorld` into the vertex shader to drive a world
        // space mottle, and the batch of screenshots after it came back with
        // two of four beds simply not drawn. Nothing in Node could see it: the
        // instance counts, the matrices and the geometry all measured correct,
        // batched and incrementally. A vertex injection into a shared three
        // chunk is the one thing here a green suite cannot check, so it is out
        // until there is a reason to want it back that is worth the risk.
        // DECLARED THROUGH THE `#include <common>` SEAM, which is what
        // terrain.js and tree.js both do. This material was the only one in
        // the scene that PREPENDED its uniforms to the top of the shader
        // instead, and it was the only one that did not draw. Whatever the
        // mechanism, matching the two injections that demonstrably work is
        // worth more than being clever about where a declaration goes.
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uMulch;
uniform vec3 uSnowColor;
uniform float uSnow;
uniform float uSnowMix;`)
            .replace('#include <map_fragment>', `
    #include <map_fragment>
    // The bed takes the season the ground takes. A bed that stayed brown
    // through a covered winter would be the only bare earth in the frame.
    //
    // BUT IT STOPS SHORT OF THE SNOW, and that is a functional line rather
    // than a decorative one. Taken all the way it came out a flat, uniform
    // white against ground that carries a thaw pattern and a grass mottle, so
    // in QA it read as a row of little pale slabs. It is also the tap target,
    // and a target that disappears in winter takes the whole care loop with
    // it for a quarter of the year.
    diffuseColor.rgb = mix(uMulch, uSnowColor, uSnow * uSnowMix);
`);
    };
    // three's default program cache key is onBeforeCompile.toString(), so every
    // injected material in this scene names its own or two of them silently
    // share one compiled program.
    material.customProgramCacheKey = () => 'garden-bed';

    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.name = 'mulch-beds';
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // NEVER A RAY TARGET. The bed is picked in screen space, and leaving it
    // raycastable would let it intercept the ground pick that decides where a
    // new tree goes.
    mesh.raycast = () => { };
    return { mesh, uniforms };
}

function buildLevelMesh(config, capacity) {
    const B = config.garden.bed;
    const geo = new THREE.PlaneGeometry(B.levelWidth, B.levelHeight);

    const fill = new Float32Array(capacity);
    const urgency = new Float32Array(capacity);
    fillAttr = new THREE.InstancedBufferAttribute(fill, 1);
    urgencyAttr = new THREE.InstancedBufferAttribute(urgency, 1);
    geo.setAttribute('aFill', fillAttr);
    geo.setAttribute('aUrgency', urgencyAttr);

    const uniforms = {
        uEmpty: { value: new THREE.Vector3() },
        uFull: { value: new THREE.Vector3() },
        uTrack: { value: new THREE.Vector3() },
        uOpacity: { value: B.levelOpacity },
        uQuiet: { value: B.levelQuiet },
        uBorder: { value: B.levelBorder },
        uTick: { value: B.levelTickWidth },
        uAspect: { value: B.levelWidth / B.levelHeight },
        uBorderColor: { value: new THREE.Vector3() },
        // Pixels per radian of vertical field, which is the one number that
        // turns a world size into a screen size. It moves with the viewport
        // and with the orientation's composed FOV, so it is published every
        // frame rather than captured here.
        uPxPerRad: { value: 800 },
        uMinPx: { value: B.minLevelPx },
        uWorldHeight: { value: B.levelHeight }
    };
    setVec(uniforms.uEmpty.value, B.levelEmptyColor);
    setVec(uniforms.uFull.value, B.levelFullColor);
    setVec(uniforms.uTrack.value, B.levelTrackColor);
    setVec(uniforms.uBorderColor.value, B.levelBorderColor);

    const material = new THREE.ShaderMaterial({
        vertexShader: LEVEL_VERT,
        fragmentShader: LEVEL_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        // UNLIT, for the same reason the droplet it replaces was: a readout has
        // to be legible at midnight, and anything lit disappears exactly when
        // the garden is hardest to read.
        fog: false
    });

    const instanced = new THREE.InstancedMesh(geo, material, capacity);
    instanced.name = 'water-levels';
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.renderOrder = 2;
    instanced.raycast = () => { };
    return { mesh: instanced, uniforms };
}

function buildDropMesh(config, capacity) {
    const B = config.garden.bed;
    const geo = new THREE.PlaneGeometry(1, 1);
    const thirst = new Float32Array(capacity);
    thirstAttr = new THREE.InstancedBufferAttribute(thirst, 1);
    geo.setAttribute('aThirst', thirstAttr);

    const uniforms = {
        uDropColor: { value: new THREE.Vector3() },
        uDropEdge: { value: new THREE.Vector3() },
        uOpacity: { value: B.levelOpacity },
        uPxPerRad: { value: 800 },
        uSizePx: { value: B.dropSizePx },
        uRisePx: { value: B.dropRisePx },
        uPulse: { value: 1 }
    };
    setVec(uniforms.uDropColor.value, B.levelFullColor);
    setVec(uniforms.uDropEdge.value, B.levelBorderColor);

    const material = new THREE.ShaderMaterial({
        vertexShader: DROP_VERT,
        fragmentShader: DROP_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        // UNLIT AND UNFOGGED, like the gauge under it. A control has to be
        // pressable at midnight and at the back of the plot, and anything that
        // dims with the light or the distance stops being one exactly then.
        fog: false
    });

    const instanced = new THREE.InstancedMesh(geo, material, capacity);
    instanced.name = 'thirst-drops';
    instanced.count = 0;
    instanced.frustumCulled = false;
    // Above the gauge, which is above the beds.
    instanced.renderOrder = 3;
    // THE DROPLET IS NEVER RAYCAST EITHER, for the reason in this file's
    // header: it is picked in screen space by `pickDrop`, off the same anchor
    // the shader lifts it from.
    instanced.raycast = () => { };
    return { mesh: instanced, uniforms };
}

export function initBeds(scene, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    const capacity = options.mobile ? config.plot.maxTreesMobile : config.plot.maxTrees;
    const beds = buildBedMesh(config, capacity);
    const levels = buildLevelMesh(config, capacity);
    const drops = buildDropMesh(config, capacity);
    bedMesh = beds.mesh;
    bedUniforms = beds.uniforms;
    levelMesh = levels.mesh;
    levelUniforms = levels.uniforms;
    dropMesh = drops.mesh;
    dropUniforms = drops.uniforms;
    scratch = {
        matrix: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3()
    };
    if (scene) {
        scene.add(bedMesh);
        scene.add(levelMesh);
        scene.add(dropMesh);
    }
    return { bedMesh, levelMesh, dropMesh };
}

/**
 * Rebuild the instance matrices from the live tree list.
 *
 * Called when a tree is planted, removed, or restored, and never per frame: the
 * beds do not move, and the level's fill rides an attribute rather than a
 * matrix.
 */
export function syncBeds(entries, config = GARDEN_CONFIG) {
    if (!bedMesh || !scratch) return 0;
    const B = config.garden.bed;
    const n = Math.min(entries.length, bedMesh.instanceMatrix.count);

    for (let i = 0; i < n; i++) {
        const record = entries[i].record;
        const { x, z } = cellCenter(record.gx, record.gz);
        const span = bedSpan(x, z, config);

        scratch.position.set(x, span.bottom + span.height / 2, z);
        scratch.quaternion.set(0, 0, 0, 1);
        scratch.scale.set(1, span.height, 1);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        bedMesh.setMatrixAt(i, scratch.matrix);

        // The level stands at the front of the bed, just clear of the trunk.
        // ONE ANCHOR, TWO THINGS DRAWN FROM IT. The droplet takes the same
        // position and rises off it in pixels inside the shader, which is the
        // same number `dropScreenY` subtracts when the tap is resolved. Giving
        // the droplet an anchor of its own would be two places to keep a lift
        // in step, and they would come apart the first time the bed moved.
        scratch.position.set(x, span.top + B.levelLift, z + B.radius * 0.72);
        scratch.scale.set(1, 1, 1);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        levelMesh.setMatrixAt(i, scratch.matrix);
        if (dropMesh) dropMesh.setMatrixAt(i, scratch.matrix);
    }

    bedMesh.count = n;
    levelMesh.count = n;
    bedMesh.instanceMatrix.needsUpdate = true;
    levelMesh.instanceMatrix.needsUpdate = true;
    if (dropMesh) {
        dropMesh.count = n;
        dropMesh.instanceMatrix.needsUpdate = true;
    }
    return n;
}

/**
 * Per frame: the season on the beds, and each tree's tank on its level.
 *
 * `pxPerRadian` is the viewport height over the camera's vertical field in
 * radians, and it is what keeps the level legible at every distance. It is
 * passed in rather than derived because this module has no camera and no
 * window, which is also what keeps it testable.
 *
 * `seconds` is the animation clock, and only the droplet's pulse reads it.
 */
export function updateBeds(entries, snowCoverage = 0, pxPerRadian = 0, config = GARDEN_CONFIG, seconds = 0) {
    if (!bedMesh || !bedUniforms) return;
    const B = config.garden.bed;
    bedUniforms.uSnow.value = clamp01(snowCoverage);
    if (levelUniforms && pxPerRadian > 0) levelUniforms.uPxPerRad.value = pxPerRadian;
    if (dropUniforms) {
        if (pxPerRadian > 0) dropUniforms.uPxPerRad.value = pxPerRadian;
        // EVERY DROPLET ON ONE CLOCK, which is the opposite of the rule the
        // fireflies had. They were insects and had to look independent; these
        // are one control repeated, and a row of them breathing out of step
        // would read as sixteen things happening rather than one thing asking.
        dropUniforms.uPulse.value =
            1 + B.dropPulse * Math.sin(seconds * B.dropPulseHz * Math.PI * 2);
    }
    const n = Math.min(entries.length, levelMesh ? levelMesh.count : 0);
    for (let i = 0; i < n; i++) {
        const m = entries[i].record.moisture;
        fillAttr.array[i] = levelFill(m);
        urgencyAttr.array[i] = levelUrgency(m, config);
        if (thirstAttr) thirstAttr.array[i] = dropPresence(m, config);
    }
    if (n > 0) {
        fillAttr.needsUpdate = true;
        urgencyAttr.needsUpdate = true;
        if (thirstAttr) thirstAttr.needsUpdate = true;
    }
}

export function getBedMesh() { return bedMesh; }
export function getLevelMesh() { return levelMesh; }
export function getDropMesh() { return dropMesh; }

// Under the shared stub a material is a proxy and a geometry absorbs whatever
// is set on it, so neither the season nor the per-tree tanks can be read back
// through them. These hand over the real objects instead, the way forest.js
// exposes its tree list.
export const __test__ = {
    uniforms: () => bedUniforms,
    levelUniforms: () => levelUniforms,
    dropUniforms: () => dropUniforms,
    levelAttributes: () => ({ fill: fillAttr, urgency: urgencyAttr, thirst: thirstAttr }),
    shaders: () => ({ levelFrag: LEVEL_FRAG, dropVert: DROP_VERT, dropFrag: DROP_FRAG })
};

export function disposeBeds() {
    for (const mesh of [bedMesh, levelMesh, dropMesh]) {
        if (!mesh) continue;
        if (sceneRef) sceneRef.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }
    bedMesh = null;
    levelMesh = null;
    dropMesh = null;
    bedUniforms = null;
    levelUniforms = null;
    dropUniforms = null;
    fillAttr = null;
    urgencyAttr = null;
    thirstAttr = null;
    scratch = null;
    sceneRef = null;
}
