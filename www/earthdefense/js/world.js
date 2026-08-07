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
    initBodies, createBody, orbitBody, updateBodies,
    getBody, bodyPositions, getOccluders
} from '../../shared/js/bodies-1.0.0.min.js';
import {
    initStructures, resetStructures, getStructures, getStructure,
    structuresRemaining, structurePositions, targetCandidates,
    damageStructure, destroyStructure
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

/** Build every body and return the group to add to the scene.
 *  `manager` is an optional THREE.LoadingManager so the loading screen can
 *  report texture progress. */
export function initWorld(scene, manager) {
    const config = EARTHDEFENSE_CONFIG;
    group = initBodies({ groupName: config.rootName, manager });

    for (const spec of config.bodies) {
        createBody({ ...spec, texture: textureFor(spec) });
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

/** Advance the world by one frame. */
export function updateWorld(deltaTime) {
    updateBodies(deltaTime);
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
export const __test__ = { textureFor };
export { getBody, bodyPositions, getOccluders };
export {
    resetStructures, getStructures, getStructure, structuresRemaining,
    structurePositions, targetCandidates, damageStructure, destroyStructure
};
