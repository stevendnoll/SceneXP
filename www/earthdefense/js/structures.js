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
        pipLost: new THREE.MeshBasicMaterial({ color: 0x3a2a26 })
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

    return { group, pips };
}

/** Place every installation from config onto its body. */
export function initStructures(config = EARTHDEFENSE_CONFIG) {
    structures.clear();
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

            structures.set(site.id, {
                site,
                body: bodyId,
                group: built.group,
                pips: built.pips,
                hitPoints: spec.hitPoints,
                side: 'friendly'
            });
        }
    }
    return structures;
}

/** Apply damage and update the readout. Returns the surviving hit points, or
 *  null for an unknown id. Destruction lands at M4; for now the pips fall. */
export function damageStructure(id, amount = 1) {
    const entry = structures.get(id);
    if (!entry) return null;
    entry.hitPoints = Math.max(0, entry.hitPoints - amount);
    entry.group.userData.hitPoints = entry.hitPoints;
    refreshPips(entry);
    return entry.hitPoints;
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
    shared = null;
}

export const __test__ = { refreshPips };
