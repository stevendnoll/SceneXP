// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * structures.js - The installations on Earth and the Moon.
 *
 * Experience code, not a shared part: the silhouette and the health readout
 * are specific to this game, while the surface anchoring underneath them is
 * general and lives in bodies-1.0.0.
 *
 * ONE FORM, SEVEN COPIES. Every installation shares a single set of geometries
 * and materials, cloned into place, so seven of them cost about what one does.
 * That matters more than it looks: from M5 there are also twelve raiders and a
 * tracer pool in the same frame, on a phone.
 *
 * THE HEALTH READOUT IS SHAPE-CODED. Three pips sit above each installation.
 * A live pip is a solid octahedron; a lost one collapses to a flat, dark
 * sliver. The shape carries the meaning and the colour only reinforces it,
 * because nothing in this experience may depend on colour alone to be read.
 *
 * THE BEACON IS NOT A LIGHT. It is an emissive sphere. Seven real point lights
 * would cost far more than they are worth, and at these distances the visitor
 * cannot tell the difference: what reads as a beacon is a bright dot, not the
 * illumination it casts.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';
import { anchorToSurface } from '../../shared/js/bodies-1.0.0.min.js';

const structures = new Map();   // id -> { spec, group, pips, hitPoints, side, body }

let shared = null;

// Scratch, so the per-frame candidate and position reads allocate nothing.
let scratchVec = null;
const candidateList = [];

function scratch() {
    if (!scratchVec) scratchVec = new THREE.Vector3();
    return scratchVec;
}

/** Build the one set of geometries and materials every installation clones. */
function sharedParts(config) {
    if (shared) return shared;
    const h = config.height;
    shared = {
        // A wide hexagonal footing, so it reads as planted rather than balanced.
        baseGeometry: new THREE.CylinderGeometry(h * 0.42, h * 0.55, h * 0.16, 6),
        // The mast, the tallest and most legible part at a distance.
        mastGeometry: new THREE.CylinderGeometry(h * 0.07, h * 0.11, h * 0.72, 8),
        // A dish, angled skyward, which is what makes the silhouette read as an
        // installation rather than as a tower block.
        dishGeometry: new THREE.ConeGeometry(h * 0.3, h * 0.22, 12, 1, true),
        beaconGeometry: new THREE.SphereGeometry(h * 0.09, 8, 6),
        pipGeometry: new THREE.OctahedronGeometry(h * 0.075),

        hullMaterial: new THREE.MeshStandardMaterial({ color: 0xb8c4d0, roughness: 0.55, metalness: 0.5 }),
        trimMaterial: new THREE.MeshStandardMaterial({ color: 0x6a7684, roughness: 0.7, metalness: 0.35 }),
        pipLive: new THREE.MeshBasicMaterial({ color: 0x9be7ff }),
        pipLost: new THREE.MeshBasicMaterial({ color: 0x3a2a26 }),
        // Burnt out. Unlit rather than merely dark, so a wreck reads the same
        // on the night side as it does in full sun.
        wreckMaterial: new THREE.MeshBasicMaterial({ color: 0x2b2320 })
    };
    return shared;
}

function buildOne(config, side) {
    const p = sharedParts(config);
    const h = config.height;
    const group = new THREE.Group();

    const base = new THREE.Mesh(p.baseGeometry, p.trimMaterial);
    base.position.y = h * 0.08;
    group.add(base);

    const mast = new THREE.Mesh(p.mastGeometry, p.hullMaterial);
    mast.position.y = h * 0.52;
    group.add(mast);

    const dish = new THREE.Mesh(p.dishGeometry, p.hullMaterial);
    dish.position.y = h * 0.95;
    dish.rotation.z = 0.35;
    group.add(dish);

    const beaconColor = side === 'hostile' ? config.hostileBeaconColor : config.beaconColor;
    const beacon = new THREE.Mesh(
        p.beaconGeometry,
        new THREE.MeshBasicMaterial({ color: beaconColor })
    );
    beacon.position.y = h * 1.12;
    beacon.name = 'beacon';
    group.add(beacon);

    // Three pips in a row above the beacon, spaced so they stay countable when
    // the whole installation is only a few pixels tall.
    const pips = [];
    for (let i = 0; i < 3; i++) {
        const pip = new THREE.Mesh(p.pipGeometry, p.pipLive);
        pip.position.set((i - 1) * h * 0.24, h * 1.38, 0);
        pip.name = `pip-${i}`;
        group.add(pip);
        pips.push(pip);
    }

    return { group, pips, beacon };
}

/** Place every installation from config onto its body. */
export function initStructures(config = EARTHDEFENSE_CONFIG) {
    structures.clear();
    candidateList.length = 0;
    const spec = config.structures;

    for (const [bodyId, list] of [['earth', spec.earth], ['moon', spec.moon]]) {
        for (const site of list) {
            // Parented to the body, so it inherits the spin and, for the Moon,
            // the orbit. Nothing here has to be moved again.
            const anchor = anchorToSurface(bodyId, site.lat, site.lon, 0);
            if (!anchor) continue;

            const built = buildOne(spec, 'friendly');
            built.group.name = site.id;
            built.group.userData = {
                id: site.id,
                label: site.label,
                side: 'friendly',
                hitPoints: spec.hitPoints
            };
            anchor.add(built.group);

            const entry = {
                site,
                body: bodyId,
                group: built.group,
                pips: built.pips,
                beacon: built.beacon,
                hitPoints: spec.hitPoints,
                side: 'friendly',
                // The aim point and the candidate record are built ONCE and
                // rewritten in place every frame. Targeting runs over all seven
                // of these on every tick, and a fresh object each time would
                // hand the collector seven allocations a frame for nothing.
                aim: { x: 0, y: 0, z: 0 }
            };
            entry.candidate = {
                id: site.id,
                position: entry.aim,
                allegiance: entry.side,
                radius: spec.height,
                // `targeting` ignores these two. They are here because the
                // fleet reads the SAME list to choose what to attack, and
                // deriving "which body is this on" from the id prefix would be
                // a naming convention masquerading as data.
                body: bodyId,
                label: site.label
            };
            structures.set(site.id, entry);
        }
    }
    return structures;
}

/** Apply damage and update the readout. Returns the surviving hit points, or
 *  null for an unknown id.
 *
 *  The hit point ARITHMETIC is not owned here. weapons-1.0.0 keeps the real
 *  ledger, and this is the scene reacting to it: pips fall, and at zero the
 *  installation goes dark. Two places counting the same thing would eventually
 *  disagree, so this one is told rather than deciding. */
export function damageStructure(id, hitPointsRemaining) {
    const entry = structures.get(id);
    if (!entry) return null;
    entry.hitPoints = Math.max(0, hitPointsRemaining);
    entry.group.userData.hitPoints = entry.hitPoints;
    refreshPips(entry);
    if (entry.hitPoints === 0) destroyStructure(id);
    return entry.hitPoints;
}

/** Take an installation out of the game: the beacon goes out, the hull goes
 *  dark, and the mast leans off true so the loss reads in SILHOUETTE from a
 *  distance where no colour is legible at all. It stays in the world as a
 *  wreck rather than vanishing, because something disappearing from under the
 *  reticle reads as a rendering fault, not as a defeat. */
export function destroyStructure(id) {
    const entry = structures.get(id);
    if (!entry || entry.destroyed) return null;
    const p = sharedParts(EARTHDEFENSE_CONFIG.structures);

    entry.destroyed = true;
    entry.hitPoints = 0;
    entry.group.userData.hitPoints = 0;
    entry.group.userData.destroyed = true;
    refreshPips(entry);

    if (entry.beacon) entry.beacon.visible = false;
    entry.group.children.forEach((child) => {
        if (child.name && child.name.startsWith('pip-')) return;
        if (child === entry.beacon) return;
        child.material = p.wreckMaterial;
    });
    // A few degrees off vertical. Enough to read as broken, not so much that it
    // looks like it fell over, which at 160 units tall would be comic.
    entry.group.rotation.z = 0.21;
    return entry;
}

/** A lost pip changes SHAPE as well as colour: it flattens to a dark sliver,
 *  so the readout survives being seen by someone who cannot separate the two
 *  colours, and stays countable at a distance. */
function refreshPips(entry) {
    const p = sharedParts(EARTHDEFENSE_CONFIG.structures);
    entry.pips.forEach((pip, i) => {
        const alive = i < entry.hitPoints;
        pip.material = alive ? p.pipLive : p.pipLost;
        pip.scale.set(1, alive ? 1 : 0.22, 1);
    });
}

export function getStructures() {
    return Array.from(structures.values());
}

export function getStructure(id) {
    return structures.get(id) || null;
}

export function structuresRemaining(side = 'friendly') {
    let n = 0;
    for (const entry of structures.values()) {
        if (entry.side === side && entry.hitPoints > 0) n++;
    }
    return n;
}

/** Every installation's live world position, for the HUD's markers and, from
 *  M5, for the raiders' steering. Read fresh each frame: the Moon's three are
 *  moving, and a cached position is what makes an interception feel broken. */
/** Every installation still standing, as targeting candidates.
 *
 *  THE AIM POINT IS THE BEACON, not the anchor at the visitor's feet. That is
 *  an occlusion fix rather than a cosmetic one: an anchor sits exactly ON the
 *  planet's surface, which is exactly on the occluder sphere, so a
 *  segment-versus-sphere test can go either way on a rounding error and the
 *  lock flickers as though the planet keeps swallowing its own installation.
 *  The beacon stands 179 units clear of the surface, which settles it, and it
 *  is also the more honest place to aim.
 *
 *  The returned array and every object in it are reused between calls, so
 *  hold the values rather than the references if they need to outlive a frame.
 */
export function targetCandidates() {
    candidateList.length = 0;
    const v = scratch();
    for (const entry of structures.values()) {
        if (entry.hitPoints <= 0) continue;
        const source = entry.beacon || entry.group;
        source.getWorldPosition(v);
        entry.aim.x = v.x;
        entry.aim.y = v.y;
        entry.aim.z = v.z;
        candidateList.push(entry.candidate);
    }
    return candidateList;
}

export function structurePositions() {
    const out = {};
    for (const [id, entry] of structures.entries()) {
        const v = new THREE.Vector3();
        entry.group.getWorldPosition(v);
        out[id] = { x: v.x, y: v.y, z: v.z };
    }
    return out;
}

export function disposeStructures() {
    structures.clear();
    candidateList.length = 0;
    scratchVec = null;
    shared = null;
}

export const __test__ = { refreshPips, sharedParts };
