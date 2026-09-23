// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * flora.js - the fractal trees and the wildflowers, bending in the
 * tornado's wind.
 *
 * Both come from the shared parts library: the trees are the garden's
 * (shared/js/fractaltree-1.0.0.js) and so are the flowers
 * (shared/js/wildflowers-1.0.0.js). Nothing about their shape is decided here,
 * only where they stand and which way the air is moving.
 *
 * EACH TREE FEELS ITS OWN WIND. windAt() is asked at every tree's feet every
 * frame, so the windbreak behind the farm, closer to the storm, leans harder
 * than the oak by the pond. The trees lean steadily with it as well as
 * swinging (the shared tree's `lean`), because a tornado's inflow is a
 * steady pull rather than the garden's coming and going.
 *
 * Summer, mature, healthy: the garden's own "showcase" view of a tree.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { makeRandom, resolveSpecies, DEFAULT_CUSTOM } from '../../shared/js/treespecies-1.0.0.min.js';
import { createTree, updateTree } from '../../shared/js/fractaltree-1.0.0.min.js';
import { createWildflowers, updateWildflowers } from '../../shared/js/wildflowers-1.0.0.min.js';
import { windAt } from './wind.min.js';
import { inPond } from './pond.min.js';

const trees = [];
let meadow = null;

/**
 * Where the wildflowers stand: seeded, in front of the camera within a fan a
 * little wider than a landscape frame, and never in the pond.
 */
export function meadowPlacements(config = TORNADO_CONFIG, mobile = false) {
    const M = config.meadow;
    const count = mobile ? M.mobileCount : M.count;
    const random = makeRandom(M.seed);
    const spread = Math.tan(M.halfAngleDegrees * Math.PI / 180);
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 20) {
        // More of them near, where each one is large, than far.
        const d = M.near + (M.far - M.near) * Math.pow(random(), 0.8);
        const x = (random() * 2 - 1) * spread * d;
        const z = -d;
        const size = M.size.min + random() * (M.size.max - M.size.min);
        const yaw = random() * Math.PI;
        const hue = M.palette[Math.floor(random() * M.palette.length)];
        if (inPond(x, z, 1.5, config)) continue;
        out.push({ x, y: 0, z, size, yaw, hue });
    }
    return out;
}

/** The species, sized as the config asks, resolved once. */
export function resolveTree(entry) {
    return resolveSpecies(entry.species, { ...DEFAULT_CUSTOM, height: entry.height });
}

export function initFlora(scene, config = TORNADO_CONFIG, options = {}) {
    trees.length = 0;
    for (const entry of config.trees) {
        const resolved = resolveTree(entry);
        const tree = createTree(resolved, entry.seed, { mobile: options.mobile });
        tree.group.position.set(entry.x, 0, entry.z);
        scene.add(tree.group);
        trees.push({ entry, resolved, tree });
    }
    meadow = createWildflowers(meadowPlacements(config, options.mobile), {
        seed: config.meadow.seed,
        sway: config.meadow.sway
    });
    scene.add(meadow.mesh);
}

/**
 * Bend everything to this moment. `state` is funnelStateAt's; `time` is the
 * animation clock; `motion` is 1, or the damped figure under reduced motion.
 */
export function updateFlora(state, time, motion = 1, config = TORNADO_CONFIG) {
    for (const { entry, resolved, tree } of trees) {
        const wind = windAt(entry.x, entry.z, state, config);
        updateTree(tree, {
            growth: 1, health: 1, leaf: 1, color: 0, spring: 0, drop: 0, bud: 0,
            snow: 0, crop: 0, fruit: null,
            wind, time, motion,
            lean: config.wind.treeLean
        }, resolved);
    }
    if (meadow) {
        // One wind for the whole meadow, taken in the middle of it.
        const mid = -(config.meadow.near + config.meadow.far) / 2;
        const wind = windAt(0, mid, state, config);
        updateWildflowers(meadow, { x: wind.x * motion, z: wind.z * motion }, time);
    }
}
