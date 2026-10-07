// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * trees.js - the yard's trees (M5), and the leaves they keep letting go.
 *
 * THE TREES are the garden's fractal trees (shared/js/fractaltree-1.0.0.js),
 * in full autumn color, swaying a little. Nothing about their shape is
 * decided here, only where they stand (config.yard.trees). Their trunks are
 * solid to leaves and to the person (sim.solidBoxes).
 *
 * THE CROWNS HOLD REAL LEAVES. Each tree hangs `hanging` of the yard's own
 * leaves up in its crown (sim.hangLeaf: out of the yard, out of the blower's
 * reach, out of the count) and lets them go a few at a time, so from the
 * first second something is falling, and every leaf that falls lands in the
 * yard to be blown like the rest. A crown only holds leaves over the sim's
 * ground, since a leaf let go anywhere else would have nowhere to land. The
 * yard's leaf count, and with it the cost, never changes. A crown can take
 * leaves back from the street as it runs low (`fall.refill`), which is off:
 * it kept a cleared lawn from ever staying clear (M6 QA).
 *
 * A LEAF ON ITS WAY DOWN IS NOT YET IN THE YARD. Each one let go is marked
 * in `sim.falling` until it comes to rest, and the score leaves it out until
 * then, as it does a leaf still up in a crown (Steve's M6 QA: "I can never
 * get to 100%", with three or four always in the air over the lawn).
 *
 * The crowns' part is pure (createCrowns, stepCrowns) and measured under
 * Node with the real sim. buildTrees() and updateTrees() are the drawing.
 */
import { resolveSpecies, DEFAULT_CUSTOM, makeRandom } from '../../shared/js/treespecies-1.0.0.min.js';
import { createTree, updateTree } from '../../shared/js/fractaltree-1.0.0.min.js';
import { hangLeaf, dropLeaf } from './sim.min.js';
import { regionOf } from './score.min.js';

// ---- The crowns' leaves (pure) -----------------------------------------------

/**
 * A point in the tree's crown that lies over the sim's ground (a margin in
 * from its edges), or null if `tries` random points found none. The crown is
 * a sphere of `crown.radius` around (x, crown.y, z), flattened a little.
 */
export function crownPoint(entry, bounds, random, tries = 40) {
    const C = entry.crown;
    const m = 0.25;
    for (let k = 0; k < tries; k++) {
        const a = random() * Math.PI * 2;
        const r = C.radius * Math.sqrt(random());
        const x = entry.x + Math.cos(a) * r;
        const z = entry.z + Math.sin(a) * r;
        if (x < bounds.minX + m || x > bounds.maxX - m || z < bounds.minZ + m || z > bounds.maxZ - m) continue;
        const y = C.y + (random() - 0.3) * C.radius * 0.7;
        return { x, y, z };
    }
    return null;
}

/**
 * Hang the crowns' leaves: for each tree, `hanging` leaves taken from across
 * the yard (evenly through the buffer, so no one patch of lawn is thinned),
 * each at a point in its crown. Returns the crowns: { entry, leaves (the
 * indices up there), owed (seconds toward the next one let go), refill }.
 */
export function createCrowns(sim, config, seed = 77) {
    const random = makeRandom(seed);
    const Y = config.yard;
    const total = Y.trees.reduce((n, t) => n + (t.hanging || 0), 0);
    const step = total > 0 ? Math.max(1, Math.floor(sim.count / total)) : 1;
    let next = Math.floor(step / 2);
    const crowns = [];
    if (!sim.falling || sim.falling.length !== sim.count) sim.falling = new Uint8Array(sim.count);
    sim.falling.fill(0);
    for (const entry of Y.trees) {
        const crown = { entry, leaves: [], falling: [], owed: random(), refill: 0, random };
        for (let k = 0; k < (entry.hanging || 0) && next < sim.count; k++, next += step) {
            const p = crownPoint(entry, sim.bounds, random);
            if (p && hangLeaf(sim, next, p.x, p.y, p.z, random)) crown.leaves.push(next);
        }
        crowns.push(crown);
    }
    return crowns;
}

/** One leaf from the street that is lying still, or -1 (a few tries at
 *  random, so it costs next to nothing). */
function streetLeaf(sim, yard, random, tries = 40) {
    for (let k = 0; k < tries; k++) {
        const i = Math.floor(random() * sim.count);
        if (sim.awake[i] || sim.hanging[i]) continue;
        if (regionOf(sim.px[i], sim.pz[i], yard) === 'street') return i;
    }
    return -1;
}

/**
 * Let the crowns' leaves go, `fall.rate` a second a tree on average, from
 * where they hang, and take a leaf back from the street into any crown that
 * has run low, `fall.refill` a second. Returns how many fell.
 */
export function stepCrowns(crowns, sim, dt, config) {
    const F = config.yard.fall;
    let fell = 0;
    for (const crown of crowns) {
        const want = crown.entry.hanging || 0;
        if (!want) continue;
        // The ones that have come to rest have arrived.
        if (crown.falling.length) {
            crown.falling = crown.falling.filter((i) => {
                if (sim.awake[i]) return true;
                sim.falling[i] = 0;
                return false;
            });
        }
        crown.owed += dt * F.rate * (0.6 + 0.8 * crown.random());
        while (crown.owed >= 1 && crown.leaves.length) {
            crown.owed -= 1;
            const at = Math.floor(crown.random() * crown.leaves.length);
            const i = crown.leaves[at];
            crown.leaves[at] = crown.leaves[crown.leaves.length - 1];
            crown.leaves.pop();
            dropLeaf(sim, i, sim.px[i], sim.py[i], sim.pz[i]);
            if (sim.falling) sim.falling[i] = 1;
            crown.falling.push(i);
            fell++;
        }
        if (!crown.leaves.length) crown.owed = Math.min(crown.owed, 1);
        if (crown.leaves.length < want && F.refill > 0) {
            crown.refill += dt * F.refill;
            if (crown.refill >= 1) {
                crown.refill -= 1;
                const i = streetLeaf(sim, config.yard, crown.random);
                const p = i >= 0 ? crownPoint(crown.entry, sim.bounds, crown.random) : null;
                if (p && hangLeaf(sim, i, p.x, p.y, p.z, crown.random)) crown.leaves.push(i);
            }
        }
    }
    return fell;
}

// ---- The trees themselves (drawing) -------------------------------------------

/** Build the yard's trees into `scene`. Returns [{ entry, resolved, tree }]. */
export function buildTrees(scene, config, { mobile = false, shadows = true } = {}) {
    return config.yard.trees.map((entry) => {
        const resolved = resolveSpecies(entry.species, { ...DEFAULT_CUSTOM, height: entry.height });
        const tree = createTree(resolved, entry.seed, { mobile });
        tree.group.position.set(entry.x, 0, entry.z);
        tree.group.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = shadows;
                o.receiveShadow = shadows;
            }
        });
        scene.add(tree.group);
        return { entry, resolved, tree };
    });
}

/** Autumn, full grown, swaying in a light breeze (still under reduced
 *  motion). */
export function updateTrees(trees, time, motion = 1) {
    const breeze = { x: 0.35 + 0.15 * Math.sin(time * 0.31), z: 0.12 };
    for (const { resolved, tree } of trees) {
        updateTree(tree, {
            growth: 1, health: 1, leaf: 0.92, color: 1, spring: 0, drop: 0, bud: 0,
            snow: 0, crop: 0, fruit: null, wind: breeze, time, motion
        }, resolved);
    }
}
