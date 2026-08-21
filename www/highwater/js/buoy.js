// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * buoy.js - the one man made thing in the scene.
 *
 * A moored channel mark 95 metres out. It rides the swell, leans further as the
 * sea builds, is buried by crests through the storm, comes back on the flat sea
 * of the lull, and is finally rolled under by the tsunami front as it passes.
 *
 * IT IS A RULER FIRST AND A STORY SECOND. See `storm.buoy` in config for the
 * whole argument, but the short version is that until this existed there was
 * nothing in the frame of known size, so a three metre swell and a seventeen
 * metre wall both read as "grey" rather than as anything in particular. Every
 * wave that passes this thing is measured against it for free.
 *
 * THE HARD PART IS NOT THE BUOY, IT IS AGREEING WITH THE WATER. The sea is
 * displaced on the GPU, and this is on the CPU, so the two are separate
 * implementations of the same sum and any disagreement between them shows
 * immediately as a buoy floating above the water or buried inside it. The sum
 * itself is not restated here: `waveSurfaceAt` in water.js reads the same
 * profile the shader reads through its attributes, and there is a test that
 * walks the two against each other over the arc.
 *
 * SAME SHAPE AS THE REST OF THIS FOLDER: a pure core that is arithmetic on plain
 * numbers, and a thin THREE shell at the bottom. Everything above `initBuoy` can
 * be tested without a browser, which is most of what there is.
 */

import { OCEAN_CONFIG } from './config.min.js';
import { waveSurfaceAt } from './water.min.js';
import { frontAt } from './storm.min.js';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The pure core
// ---------------------------------------------------------------------------

/** Is the light lit at this moment in its flash character?
 *
 *  Fl(2) 6s: two quick flashes then a long dark, which is a real character and
 *  is what makes it read as a navigation light rather than as a stuck pixel. A
 *  single blink at a regular interval reads as a rendering artefact, and this is
 *  one extra `if` to avoid that.
 *
 *  Phase is taken modulo the period rather than counted, so it is correct on any
 *  frame including the first, and a dropped frame cannot desynchronise it. */
export function lightOn(seconds, cfg = OCEAN_CONFIG.storm.buoy) {
    const t = ((seconds % cfg.flashPeriod) + cfg.flashPeriod) % cfg.flashPeriod;
    if (t < cfg.flashOn) return true;
    const second = cfg.flashOn + cfg.flashGap;
    return t >= second && t < second + cfg.flashOn;
}

/** How far under the surface the buoy has been pulled, in metres, and whether
 *  there is anything left to draw.
 *
 *  THE TSUNAMI TAKES IT, NOT A TIMER, AND THE FIRST VERSION HAD THAT WRONG. It
 *  sank on a fixed clock at t=32 on the reasoning that Steve had asked for the
 *  thing gone before the arc got interesting. He watched it and said he had
 *  expected it back during the lull, which is the better instinct and is worth
 *  writing down as the reason this changed:
 *
 *  A BUOY THAT DIES AT THIRTY SECONDS THROWS AWAY THE ONLY JOB IT HAS. It is a
 *  ruler. The things in this scene that most need measuring are the storm peak,
 *  the drawback and the wall, and all three happen after it had gone. Worse, it
 *  spent its whole life on the calmest sea in the arc, which is the one stretch
 *  where a scale reference proves nothing.
 *
 *  So it survives. The storm buries it under crests from about t=28, which
 *  needs no code at all because the crests genuinely clear eye level by then.
 *  The lull hands it back, upright and still flashing, on a sea that has gone
 *  flat, which is the eeriest moment in the arc and now has something in it. The
 *  drawback lowers it. And then the front reaches it and it is gone, which is
 *  the payoff a scale reference exists for: the wall passes over a thing whose
 *  size the visitor has had eighty seconds to learn.
 *
 *  DRIVEN BY WHERE THE FRONT IS AND NOT BY WHAT TIME IT IS. `frontAt` already
 *  reports the front's z, so "has the wall reached the buoy" is a subtraction.
 *  That keeps it correct if the tsunami is ever retimed, and it survives the arc
 *  being scrubbed backwards, which a latched flag would not. */
export function sinkAt(seconds, cfg = OCEAN_CONFIG.storm.buoy, config = OCEAN_CONFIG) {
    const front = frontAt(seconds, config.storm);
    if (!front) return { sink: 0, visible: true };
    // The front travels shoreward, so z increases toward the camera. Positive
    // once the wall has passed the buoy's own position.
    const past = front.z - cfg.z;
    // IT RIDES THE FACE BEFORE THE WATER TAKES IT, and getting this wrong was
    // the one thing Steve could still see. The sink used to start the instant
    // the front's EDGE reached the buoy, which is a second and a half before the
    // front's water does: `behindFront` blends over the front's own width, so
    // the sea at the buoy's row is still the drawback's flat 0.7 m when the edge
    // arrives and does not reach its full 3.3 m until the front is about twenty
    // metres past. The buoy was therefore descending at exactly the rate the
    // water was rising, the two cancelled, and it read as the sea flowing around
    // a thing that was not moving.
    //
    // So nothing happens until the water is actually there. Then it goes.
    if (past <= cfg.lostAfterMetres) return { sink: 0, visible: true };
    const t = (past - cfg.lostAfterMetres) / Math.max(1e-6, cfg.lostMetres);
    if (t >= 1) return { sink: cfg.lostDepth, visible: false };
    // Fast at first and slowing, which is what being rolled under by a front
    // looks like: the water takes it at once and the buoyancy argues on the way
    // down. A linear sink reads as an elevator.
    const eased = 1 - (1 - t) * (1 - t);
    return { sink: cfg.lostDepth * eased, visible: true };
}

/** The tilt the water under the buoy is ASKING for, in radians. What the buoy
 *  actually does with that is `stepRoll`, which swings past it.
 *
 *  THE SLOPE IS THE SIGNAL AND THE GAIN IS THE BUOY. A float does not lie flat
 *  on the surface: it has a keel, a mass and a fluid arguing with it, so it
 *  leans some fraction of the way toward the slope. `tiltGain` under one is that
 *  fraction, and it is also what stops the thing flapping at every capillary
 *  ripple the profile happens to carry. The liveliness comes from the pendulum
 *  overshooting this target rather than from this number being large, which is
 *  the distinction the first version of this file got wrong.
 *
 *  Clamped, because the depth cap lets the surface stand at genuinely absurd
 *  angles in the surf and a buoy that flips fully over reads as a bug rather
 *  than as weather. */
export function targetTilt(slopeX, slopeZ, cfg = OCEAN_CONFIG.storm.buoy, soft = false) {
    const gain = cfg.tiltGain * (soft ? cfg.reducedTiltScale : 1);
    const limit = cfg.maxTiltDegrees * DEG;
    const clamp = (v) => Math.max(-limit, Math.min(limit, v));
    // A slope of dy/dx tilts the mast by atan(dy/dx) in the opposite sense: the
    // buoy leans DOWN the slope, so the signs are negated here rather than at
    // every call site.
    return {
        x: clamp(Math.atan(slopeZ) * gain),
        z: clamp(-Math.atan(slopeX) * gain)
    };
}

/** One step of the roll, as a driven pendulum. Framerate independent.
 *
 *  THE OVERSHOOT IS THE WHOLE REASON THIS IS NOT AN EXPONENTIAL. The first
 *  version chased the surface slope with `1 - exp(-k dt)`, which is stable and
 *  simple and cannot ever go past its target, so the mast never leaned further
 *  than the water under it. Measured, that capped the swing at 13 degrees, which
 *  on a 39 pixel object moves the masthead about five pixels and reads as a
 *  buoy sitting still. A float in a seaway is a pendulum being DRIVEN by the
 *  wave it is on, and a driven pendulum swings past. See `storm.buoy` in config.
 *
 *  Semi implicit Euler, which is the cheap integrator that is stable for an
 *  oscillator as long as the step stays well inside the natural period. The step
 *  is clamped rather than trusted, because a tab returning from the background
 *  hands over a delta of seconds and an unclamped spring answers that with a
 *  buoy spinning in place.
 *
 *  `state` is `{ x, z, vx, vz }` and is returned fresh rather than mutated, so a
 *  test can walk it without carrying a scene around. */
export function stepRoll(state, target, delta, cfg = OCEAN_CONFIG.storm.buoy) {
    const dt = Math.max(0, Math.min(cfg.rollMaxStep, delta));
    const k = cfg.rollStiffness;
    const c = cfg.rollDamping;
    const vx = state.vx + (k * (target.x - state.x) - c * state.vx) * dt;
    const vz = state.vz + (k * (target.z - state.z) - c * state.vz) * dt;
    return { x: state.x + vx * dt, z: state.z + vz * dt, vx, vz };
}

// ---------------------------------------------------------------------------
// The THREE shell
// ---------------------------------------------------------------------------

/** Where each band of the buoy ends, as a fraction of its height above the
 *  waterline. Exported because THE SPLIT IS THE DESIGN and it is invisible from
 *  anywhere else: these five numbers decide whether the thing reads as a buoy or
 *  as a post, and the first version had them so wrong that only 10 per cent of
 *  what showed was orange. A test asserts the float stays the largest mass. */
export const SHAPE = {
    HULL_TOP: 0.40,
    BAND_TOP: 0.47,
    SHOULDER_TOP: 0.545,
    TOWER_TOP: 0.87,
    LAMP: 0.94
};

let group = null;
let lightMesh = null;
let lightMaterial = null;
let settings = null;
let softMotion = false;
let roll = { x: 0, z: 0, vx: 0, vz: 0 };
const built = [];

/** Build the buoy and put it in the scene.
 *
 *  Nine primitives and about three hundred triangles, which is nothing next to a
 *  sea of forty thousand and is still more than the silhouette can show. Every
 *  one of them is there for what it does to the OUTLINE: see the comments in the
 *  body. Detail finer than the outline is invisible at 36 px and is paid for on
 *  every frame of a scene that already has a fill rate problem waiting for it at
 *  the tsunami.
 *
 *  BASIC MATERIALS RATHER THAN STANDARD ONES, WHICH IS A DEPARTURE. Everything
 *  else in this scene is lit by the sky's own lights. This is not, because at
 *  95 metres under an overcast the shading across a half metre float is a
 *  fraction of a level, and a MeshBasicMaterial cannot be recompiled by a change
 *  in the light count. The buoy is a coloured silhouette and that is all the
 *  frame can resolve of it. */
export function initBuoy(scene, config = OCEAN_CONFIG, options = {}) {
    settings = config;
    softMotion = Boolean(options.reducedMotion);
    roll = { x: 0, z: 0, vx: 0, vz: 0 };
    const cfg = config.storm.buoy;

    group = new THREE.Group();
    group.name = 'buoy';

    const add = (geo, mat, y) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        group.add(m);
        built.push(geo);
        return m;
    };

    // LIT, AND IT USED TO BE UNLIT. Every material here was a
    // MeshBasicMaterial, chosen because the shading across a half metre float at
    // a hundred metres is a fraction of a level and because a basic material
    // cannot be recompiled by a change in the light count. Both of those are
    // true and both missed the point: a basic material ignores the light
    // ENTIRELY, so through an arc whose whole subject is the light changing, the
    // buoy was the same bright orange at t=0 under a blue sky as at t=50 under a
    // black one. It was the one object in the frame not living in the same
    // weather as everything else, and that, rather than any want of rust, is
    // what made it read as a game object.
    //
    // The sun and hemisphere lights carry the sky's own colour (see
    // `applyState` in sky.js), so a standard material greys and darkens with the
    // storm for free, and the lightning's own directional light strikes it.
    //
    // NO RECOMPILE RISK: the buoy is built after `initLightning`, so the light
    // count is already final when this material first compiles.
    const weathered = (color) => new THREE.MeshStandardMaterial({
        color,
        // Weathered paint is matte, and a matte object this small is also one
        // that cannot develop a distracting specular pip on a wave.
        roughness: cfg.roughness,
        metalness: 0,
        // THE RETROREFLECTIVE FLOOR, WHICH IS A REAL PROPERTY OF A REAL BUOY.
        // Lighting the buoy correctly made it go grey under the storm, which is
        // what the physics says and is not what a mark looks like: navigation
        // marks are painted and taped with retroreflective material precisely so
        // they do NOT disappear in bad light. That is a floor under the
        // brightness, and a floor is what this is.
        //
        // Emissive of the same hue as the paint, so it lifts the colour rather
        // than washing it toward white. See `retroreflect` in config for the
        // solve: at 0.30 the storm appearance lands within a few levels of the
        // old unlit buoy Steve approved, while 57 per cent of the response still
        // comes from the sky, so it goes on greying with the weather.
        emissive: new THREE.Color(color),
        emissiveIntensity: cfg.retroreflect,
        fog: true
    });
    // THREE COLOURS AND NOT FIVE. A rust band at the waterline and marine
    // growth below it were tried on 2026-08-21 and taken straight back out:
    // Steve looked at them and said he wanted the orange, white and black. He is
    // right, and the reason is the size. At 16 px a fifth colour is not a fifth
    // colour, it is mud. Three strong values that a viewer can name is what
    // makes this thing read at all.
    const hull = weathered(cfg.hullColor);
    const band = weathered(cfg.bandColor);
    const tower = weathered(cfg.towerColor);
    // THE LAMP STAYS UNLIT, WHICH IS THE WHOLE POINT OF IT. It is the one part
    // that emits rather than receives, so it must NOT darken with the storm: a
    // navigation light that dims as the weather closes in is the opposite of a
    // navigation light.
    lightMaterial = new THREE.MeshBasicMaterial({ color: cfg.lightColor, fog: true });
    built.push(hull, band, tower, lightMaterial);

    const r = cfg.radius;
    const H = cfg.height;

    // PROPORTIONS ARE THE WHOLE DESIGN AT THIS SIZE, and the first version got
    // them badly wrong. Measured on it, above the waterline: 4 px of orange
    // against 15 px of white mast. The hull was almost entirely UNDER the water,
    // so the buoy was 44 per cent stem and 10 per cent orange, and Steve
    // reported exactly that ("I barely see the orange", "the stem still looks
    // gray"). Neither was a colour problem.
    //
    // So everything below is written as a fraction of the height rather than in
    // multiples of the radius, because the fractions ARE the thing being tuned
    // and hiding them inside `r * 1.16` is how they went wrong unnoticed. The
    // split now, of what is above water:
    //
    //     orange hull   40%      the object, and it should be
    //     black band     7%
    //     white tower   41%
    //     lamp          12%
    //
    // A REAL MARK IS MOSTLY FLOAT. The mast carries the light and nothing else,
    // and on the water it is the orange mass that says "buoy" from a distance.
    const { HULL_TOP, BAND_TOP, SHOULDER_TOP, TOWER_TOP, LAMP } = SHAPE;

    // BELOW THE WATERLINE, AND IT DOES GET SEEN. This was a long cone tapering
    // to a small flat cap, on the reasonable assumption that nothing under the
    // water is ever in shot. It is: while the buoy climbs the face of the
    // tsunami it sits at the surface height of its OWN row, and the water
    // between it and the camera has not been lifted yet, so the sight line to
    // its underside clears that water by three to five metres. Steve saw the
    // point of the cone and said so.
    //
    // Two changes, and the second matters more than the first. The draft is
    // shorter, 0.38 m rather than 0.73, so there is half as much to show. And it
    // ends in a ROUNDED BOWL rather than a point, because a float with a rounded
    // bottom lifted clear of the water is what a buoy on a wave actually looks
    // like, while a cone is what a mistake looks like.
    add(new THREE.CylinderGeometry(r * 1.14, r * 1.04, H * 0.07, 12), hull, -H * 0.035);
    const bowl = new THREE.SphereGeometry(r * 1.04, 12, 6);
    // Squashed, so it is a shallow hull bottom and not half a ball. The upper
    // half sits inside the float above it and is never drawn.
    bowl.scale(1, 0.40, 1);
    add(bowl, hull, -H * 0.07);
    // THE FLOAT, which is now the largest thing on it. Slightly barrelled, so
    // the silhouette is not a drum.
    add(new THREE.CylinderGeometry(r * 1.14, r * 1.34, H * HULL_TOP, 12), hull, H * HULL_TOP / 2);
    // The dark band round the top of the float. Two values on one mass is what
    // reads as a marked object rather than a moulded one.
    add(new THREE.CylinderGeometry(r * 1.20, r * 1.20, H * (BAND_TOP - HULL_TOP), 12),
        band, H * (HULL_TOP + BAND_TOP) / 2);
    // The shoulder, stepping in from float to tower. This is the part that makes
    // the whole thing read as built rather than moulded.
    add(new THREE.CylinderGeometry(r * 0.68, r * 1.12, H * (SHOULDER_TOP - BAND_TOP), 10),
        tower, H * (BAND_TOP + SHOULDER_TOP) / 2);

    const towerBase = H * SHOULDER_TOP;
    const towerTop = H * TOWER_TOP;
    // THE TOWER, AND IT IS DELIBERATELY STOUT. It was slender before, which is
    // the second half of why it read grey: a thin pale shape on a grey sky is
    // mostly antialiasing, and antialiasing against grey IS grey. 10.6 px across
    // at the base rather than 6.6 gives it enough body to hold its own colour.
    add(new THREE.CylinderGeometry(r * 0.46, r * 0.68, towerTop - towerBase, 8),
        tower, (towerBase + towerTop) / 2);

    // THE CROSSED RADAR REFLECTOR, which is what stops the tower reading as a
    // post. A buoy is recognisable at distance because something sticks out
    // sideways, and two thin crossed plates cost four triangles each.
    const armY = towerBase + (towerTop - towerBase) * 0.45;
    const arm = new THREE.BoxGeometry(r * 2.1, r * 0.5, r * 0.09);
    add(arm, tower, armY);
    const armB = new THREE.Mesh(arm, tower);
    armB.position.y = armY;
    armB.rotation.y = Math.PI / 2;
    group.add(armB);

    // The cage around the lamp, open rather than solid, so the light reads as
    // sitting INSIDE something.
    add(new THREE.TorusGeometry(r * 0.44, r * 0.07, 4, 8), tower, H * LAMP);
    // The lamp, and nothing above it. A cone topmark was here and came out at
    // Steve's request: at this size it was 5 px of black sitting over the light,
    // which took the eye off the one part that is supposed to be the brightest.
    lightMesh = add(new THREE.SphereGeometry(r * 0.26, 8, 6), lightMaterial, H * LAMP);

    group.position.set(cfg.x, 0, cfg.z);
    scene.add(group);
    return group;
}

/** Ride the sea. `seconds` is the arc clock, `delta` real time. */
export function updateBuoy(seconds, delta, config = OCEAN_CONFIG) {
    if (!group || !settings) return;
    const cfg = config.storm.buoy;

    const { sink, visible } = sinkAt(seconds, cfg, config);
    group.visible = visible;
    if (!visible) return;

    // WHERE THE WATER IS, ASKED OF THE WATER. Returns null on the frames before
    // the first profile exists, and the buoy simply holds its last pose rather
    // than snapping to zero, which would be a visible twitch on the first frame
    // of every replay.
    const surface = waveSurfaceAt(cfg.x, cfg.z);
    if (!surface) return;

    group.position.y = surface.y - sink;

    const target = targetTilt(surface.slopeX, surface.slopeZ, cfg, softMotion);
    // ONE FIXED SUBSTEP PER FRAME IS NOT ENOUGH AT A LONG FRAME, and the clamp
    // inside `stepRoll` would otherwise quietly slow the buoy down on a slow
    // device rather than keeping it honest. Walking the leftover time in whole
    // steps keeps the roll running at the same rate whatever the framerate is.
    let left = Math.max(0, Math.min(0.25, delta));
    while (left > 1e-4) {
        const step = Math.min(cfg.rollMaxStep, left);
        roll = stepRoll(roll, target, step, cfg);
        left -= step;
    }
    group.rotation.set(roll.x, 0, roll.z);

    // The lamp. Driven off the ARC clock rather than off wall time, so that the
    // character is the same on every watch and a replay does not open mid flash.
    if (lightMaterial) {
        const lit = lightOn(seconds, cfg);
        lightMaterial.color.setHex(lit ? cfg.lightColor : cfg.towerColor);
    }
}

/** Put it back on the surface for a replay. */
export function resetBuoy() {
    roll = { x: 0, z: 0, vx: 0, vz: 0 };
    if (group) {
        group.visible = true;
        group.position.y = 0;
        group.rotation.set(0, 0, 0);
    }
}

export function disposeBuoy() {
    if (group && group.parent) group.parent.remove(group);
    for (const thing of built) if (thing && thing.dispose) thing.dispose();
    built.length = 0;
    group = null;
    lightMesh = null;
    lightMaterial = null;
    settings = null;
}

export const __buoy = {
    state: () => ({ group, roll, lightMesh })
};
