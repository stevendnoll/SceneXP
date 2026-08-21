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
        built.push(geo, mat);
        return m;
    };

    const hull = new THREE.MeshBasicMaterial({ color: cfg.hullColor, fog: true });
    const band = new THREE.MeshBasicMaterial({ color: cfg.bandColor, fog: true });
    const tower = new THREE.MeshBasicMaterial({ color: cfg.towerColor, fog: true });
    lightMaterial = new THREE.MeshBasicMaterial({ color: cfg.lightColor, fog: true });

    const r = cfg.radius;
    // A REAL PILLAR BUOY HAS FOUR PARTS AND THE FIRST VERSION HAD TWO. It was a
    // white post on an orange can, which is what you get by modelling the parts
    // rather than the OUTLINE. At 36 px the outline is the only thing there is,
    // so what follows is chosen for what it does to the silhouette and not for
    // what it would be called on a chart.
    //
    //   the flotation collar   flares the base, so the shape is not a cylinder
    //   the waist              a step in the profile, so the eye sees two masses
    //   the crossed reflector  breaks the vertical line, which is the single
    //                          biggest thing that stops it reading as a post
    //   the cage and topmark   gives it a head, so it has a top rather than
    //                          just stopping

    // The collar: the widest thing on it, sitting at the waterline. Real marks
    // carry one because it is what makes them float upright, and here it is what
    // stops the base reading as a drum.
    add(new THREE.CylinderGeometry(r * 1.35, r * 1.05, r * 0.42, 12), hull, r * 0.12);
    // The body below it, tapering in, mostly under water.
    add(new THREE.CylinderGeometry(r * 1.05, r * 0.55, r * 1.5, 12), hull, -r * 0.62);
    // A dark band around the top of the hull. Two tones on one mass reads as a
    // marked object rather than a painted one, and at this size a band is the
    // only marking that survives.
    add(new THREE.CylinderGeometry(r * 1.08, r * 1.08, r * 0.30, 12), band, r * 0.46);
    // The waist: a narrow step between hull and tower, which is the part that
    // makes the whole thing read as built rather than moulded.
    add(new THREE.CylinderGeometry(r * 0.62, r * 0.86, r * 0.55, 10), tower, r * 0.88);

    const towerBase = r * 1.16;
    const towerTop = cfg.height - r * 1.5;
    // The tower, tapering. A parallel post is the thing that read as a post.
    add(new THREE.CylinderGeometry(r * 0.20, r * 0.42, towerTop - towerBase, 8),
        tower, (towerBase + towerTop) / 2);

    // THE CROSSED RADAR REFLECTOR, AND THIS IS THE PART THAT FIXES IT. A buoy is
    // recognisable at distance because something sticks out sideways two thirds
    // of the way up. Two thin crossed plates cost four triangles each and they
    // are the difference between a mast and a mark.
    const armY = towerBase + (towerTop - towerBase) * 0.55;
    const arm = new THREE.BoxGeometry(r * 2.1, r * 0.5, r * 0.09);
    const armA = add(arm, tower, armY);
    const armB = new THREE.Mesh(arm, tower);
    armB.position.y = armY;
    armB.rotation.y = Math.PI / 2;
    group.add(armB);
    void armA;

    // The cage around the lamp, as an open ring rather than a solid, so the lamp
    // reads as sitting INSIDE something.
    add(new THREE.TorusGeometry(r * 0.44, r * 0.07, 4, 8), tower, towerTop + r * 0.30);
    // The lamp.
    lightMesh = add(new THREE.SphereGeometry(r * 0.26, 8, 6), lightMaterial,
        towerTop + r * 0.30);
    // The topmark: a small cone above the light, which is what a real mark
    // carries and what gives the silhouette a point instead of a stub.
    add(new THREE.ConeGeometry(r * 0.34, r * 0.62, 8), band, towerTop + r * 0.95);

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
