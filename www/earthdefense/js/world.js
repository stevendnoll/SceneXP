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
 * structures.js. That keeps one place to look when the fleet arrives at M5 and
 * the candidate list stops being only installations.
 */

import { EARTHDEFENSE_CONFIG, spawnPosition } from './config.min.js';
import {
    initBodies, createBody, orbitBody, updateBodies,
    getBody, bodyPositions, getOccluders
} from '../../shared/js/bodies-1.0.0.min.js';
import {
    initStructures, getStructures, getStructure,
    structuresRemaining, structurePositions, targetCandidates,
    damageStructure, destroyStructure
} from './structures.min.js';

let group = null;

/** Build every body and return the group to add to the scene.
 *  `manager` is an optional THREE.LoadingManager so the loading screen can
 *  report texture progress. */
export function initWorld(scene, manager) {
    const config = EARTHDEFENSE_CONFIG;
    group = initBodies({ groupName: config.rootName, manager });

    for (const spec of config.bodies) {
        createBody(spec);
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
export { getBody, bodyPositions, getOccluders };
export {
    getStructures, getStructure, structuresRemaining, structurePositions,
    targetCandidates, damageStructure, destroyStructure
};
