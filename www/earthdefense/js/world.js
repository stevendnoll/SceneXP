// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * world.js - Builds the Earth Defense world from its config.
 *
 * The experience half of the M1 opening frame: it turns EARTHDEFENSE_CONFIG's
 * `bodies` array into three textured spheres and puts the Moon on its orbit.
 * Every number comes from config, so this file holds no scale knowledge of its
 * own and the M1 gate can retune the frame without touching code.
 *
 * It is deliberately a re-export surface as much as a builder: main.js asks
 * `world` for the scene's contents (bodies, occluders, installations, targeting
 * candidates) and never reaches past it into either bodies-1.0.0 or
 * structures.js.
 *
 * THE RAIDERS ARE NOT IN HERE. From M5 the guns choose between installations
 * and Martian ships, and it would have been easy to fold the fleet in behind
 * this same surface. It is deliberately not: `world` is the STANDING scene,
 * the part that is built once and then only spins, while the fleet is a live
 * participant with a state machine and a lifetime of its own. main.js joins the
 * two candidate lists, which puts the seam where the scenario knowledge already
 * lives.
 */

import { EARTHDEFENSE_CONFIG, spawnPosition } from './config.min.js';
import {
    initBodies, createBody, orbitBody, updateBodies, resetBodyClock,
    getBody, bodyPositions, getOccluders
} from '../../shared/js/bodies-1.0.0.min.js';
import {
    initStructures, resetStructures, getStructures, getStructure,
    structuresRemaining, structurePositions, targetCandidates,
    sampleStructureMotion, damageStructure, destroyStructure
} from './structures.min.js';

let group = null;
let _webpSupport = null;

/** Can this browser decode WebP?
 *
 *  Asked once and cached, because the answer cannot change mid-session. The
 *  probe is a canvas asked to ENCODE a WebP: a browser that cannot encode one
 *  returns a PNG data URL instead, and every browser that can encode WebP can
 *  also decode it. That gets a synchronous answer, which an image `onerror`
 *  fallback could not: by the time a 404 or a decode failure came back the
 *  planet would already have been built with no map on it.
 *
 *  The failure direction is the safe one. A browser we cannot ask (no canvas,
 *  no toDataURL, an older Safari that decodes WebP but will not encode it) is
 *  served the JPEG, which is 52 KB heavier across the three bodies and looks
 *  identical. */
export function supportsWebP() {
    if (_webpSupport !== null) return _webpSupport;
    _webpSupport = false;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        if (typeof canvas.toDataURL === 'function') {
            _webpSupport = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        }
    } catch (e) { /* no canvas: the JPEG path is the right answer anyway */ }
    return _webpSupport;
}

/** The texture URL this browser should actually fetch. A body with no fallback
 *  declared keeps whatever it named, so a spec can still carry one path. */
function textureFor(spec) {
    if (!spec.textureFallback) return spec.texture;
    return supportsWebP() ? spec.texture : spec.textureFallback;
}

/** Give a body a night side that reads as a place rather than as a hole.
 *
 *  A directional key light and a low ambient leave the unlit hemisphere at a
 *  handful of values out of 255, which is why screenshot round 3 caught Earth
 *  at 26,000 km and the Moon at 6,136 km as black discs. Ambient can lift them,
 *  but only to a flat grey, and the interesting half of a night side is that it
 *  still has geography in it.
 *
 *  So the body's own colour map is reused as an EMISSIVE MAP, tinted by
 *  `spec.nightGlow`. Emissive ignores lighting, so it shows through wherever
 *  the key light does not reach and is swamped by the day side where it does,
 *  which lands the effect exactly on the unlit hemisphere without a second
 *  texture, a second draw, or a custom shader.
 *
 *  IT LIVES HERE RATHER THAN IN `bodies-1.0.0`. This is a scenario choice about
 *  three specific planets in one experience, not a fact about spheres, and the
 *  shared module's coverage floors make a version cut expensive for something
 *  this small. `createBody` returning a mesh with a public material is the seam
 *  that lets an experience decorate without the library learning about it.
 *
 *  Takes the MATERIAL rather than the body id so it can be exercised against a
 *  plain object, per the pure core / thin shell rule. Returns whether it did
 *  anything, which is the only thing worth asserting about it. */
function applyNightGlow(material, nightGlow) {
    // 0 and undefined both mean "no night side to rescue". Mars says 0 out loud.
    if (!nightGlow) return false;
    // A body built without a colour map has nothing to tint, and an emissive
    // with no map would light the whole sphere evenly, which is the flat smudge
    // this exists to avoid. Better to leave it dark than to make it grey.
    if (!material || !material.map || !material.emissive) return false;

    material.emissive.setHex(nightGlow);
    material.emissiveMap = material.map;
    material.needsUpdate = true;
    return true;
}

/** Build every body and return the group to add to the scene.
 *  `manager` is an optional THREE.LoadingManager so the loading screen can
 *  report texture progress. */
export function initWorld(scene, manager) {
    const config = EARTHDEFENSE_CONFIG;
    group = initBodies({ groupName: config.rootName, manager });

    for (const spec of config.bodies) {
        const mesh = createBody({ ...spec, texture: textureFor(spec) });
        applyNightGlow(mesh && mesh.material, spec.nightGlow);
    }
    // Orbits are wired after every body exists, so a child can name a parent
    // that appears later in the array.
    for (const spec of config.bodies) {
        if (spec.orbit) orbitBody(spec.id, spec.orbit.parent, spec.orbit);
    }

    // Installations come last, because each one parents itself to a body that
    // has to exist first. From here they need no further attention: they ride
    // the spin, and the Moon's three ride the orbit as well.
    initStructures(config);

    if (scene && group) scene.add(group);
    return group;
}

/** Advance the world by one frame.
 *
 *  The order is the whole content of this function. The installations are
 *  parented to the bodies, so their world positions only become this frame's
 *  positions once `updateBodies` has run, and the motion sample has to happen
 *  after that and exactly once. Everything downstream (the raiders' station
 *  keeping, the visitor's lock) then reads where things ARE rather than where
 *  they were, which on the Moon is a difference of 838 units a second. */
export function updateWorld(deltaTime) {
    updateBodies(deltaTime);
    sampleStructureMotion(deltaTime);
}

/** Put the standing scene back to its first frame, for a restart.
 *
 *  THE OPENING FRAME IS A COMPOSED VALUE, NOT AN ARBITRARY ONE, which is the
 *  whole reason this exists. The Moon's phase and inclination are solved
 *  backwards from where it has to sit at spawn: 10.8 degrees right of the nose
 *  and 7.0 above, inside the narrowest portrait phone with room to spare. The
 *  four Earth installations are inside the 41.5 degree cap the spawn point can
 *  see, and they are parented to Earth, so they turn with it.
 *
 *  None of that survived a restart. `restartRun` put the fleet, the
 *  installations and the flight model back and left the sky where the last run
 *  had carried it: measured after a two minute run, the Moon had moved from
 *  10.9 degrees right of the nose to 104 degrees, Earth had turned 13 degrees
 *  and taken the installations with it, and Mars had turned 52. A second run
 *  opened on a composition nobody had chosen.
 *
 *  ZERO RATHER THAN A SKIP, exactly like the briefing's held frame in main.js's
 *  loop: `updateWorld(0)` re-seats every body and every installation's aim and
 *  up on THIS frame rather than the next one, so nothing is drawn from the old
 *  sky in between. */
export function resetWorld() {
    resetBodyClock();
    updateWorld(0);
}

/** Place a camera at the composed spawn viewpoint: `spawn.distance` from
 *  Earth's centre, `spawn.axisAngle` off the anti-Mars axis, looking straight
 *  down -Z at Mars. See the spawn block in config.js for why 60 degrees. */
export function placeCameraAtSpawn(camera, config = EARTHDEFENSE_CONFIG) {
    if (!camera) return;
    const p = spawnPosition(config);
    camera.position.set(p.x, p.y, p.z);
    camera.up.set(0, 1, 0);
    // Look along -Z from the spawn point. Aiming at Mars itself would tilt the
    // nose down by a couple of degrees, which is close but not the composition
    // the spawn angle was solved for.
    camera.lookAt(p.x, p.y, p.z - 1000);
}

export function getWorldGroup() { return group; }
export const __test__ = { textureFor, applyNightGlow };
export { getBody, bodyPositions, getOccluders };
export {
    resetStructures, getStructures, getStructure, structuresRemaining,
    structurePositions, targetCandidates, damageStructure, destroyStructure
};
