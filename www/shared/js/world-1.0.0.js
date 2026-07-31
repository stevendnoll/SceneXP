// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * world.js - The experience context (shared engine part)
 *
 * Owns the three things every world-building part needs, so builders in the
 * shared library and in an experience's own content code all attach to the
 * same world without threading parameters through every call:
 *
 *   - the experience config (frozen plain object, passed to initWorld)
 *   - the root THREE.Group the whole world hangs under
 *   - the collider registry (player/NPC collision boxes)
 *
 * It also owns the click-only outdoor-prop registry (benches, lamps, planters,
 * welcome mats, bushes, trees) since street furniture registers itself while
 * being built.
 *
 * Init order contract: initScene(canvas, config) first (world adds its root
 * group to the scene), then initWorld(config), then build content, then
 * initControls(config).
 */

import { getScene } from './scene-1.0.0.min.js';

let worldConfig = {};
let worldGroup = null;
const colliders = [];
const outdoorProps = [];

/**
 * Install the experience config and create the world's root group (named
 * config.rootName so an experience can keep a legacy scene-graph label).
 * Also resets the collider and prop registries, so a re-init starts clean.
 * @returns {THREE.Group} the root group (already added to the scene)
 */
export function initWorld(config) {
    // Shallow copy (experience configs are frozen) so missing optional
    // sections can be defaulted: parts destructure config.building freely,
    // and a bare config must not make them throw.
    worldConfig = Object.assign({}, config);
    if (!worldConfig.building) worldConfig.building = {};
    colliders.length = 0;
    outdoorProps.length = 0;
    worldGroup = new THREE.Group();
    worldGroup.name = worldConfig.rootName || 'world';
    const scene = getScene();
    if (scene) scene.add(worldGroup);
    return worldGroup;
}

/** The root group all world content attaches to (ex-storeGroup). */
export function getWorldGroup() {
    return worldGroup;
}

/** The experience config passed to initWorld (read-only by convention). */
export function getWorldConfig() {
    return worldConfig;
}

/**
 * Register a collision entry. Accepts the shapes the builders already use:
 * { box: THREE.Box3, mesh } or { box: THREE.Box3, type: 'bench' | ... }.
 */
export function addCollider(entry) {
    colliders.push(entry);
}

/** Compute a mesh's world-space AABB and register it (ex-addCollisionBox). */
export function addColliderForMesh(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push({ box: box, mesh: mesh });
}

/** The live collider registry (the same array instance across the session,
 *  so callers may keep a reference and see later registrations). */
export function getColliders() {
    return colliders;
}

/**
 * Tag a group as a click-only outdoor prop and register it for raycasting.
 * Returns the group so calls can wrap builders inline.
 */
export function registerOutdoorProp(group, kind) {
    if (!group) return group;
    group.userData.isProp = true;
    group.userData.propKind = kind;
    outdoorProps.push(group);
    return group;
}

/** The clickable outdoor-prop groups, for the experience's click targets. */
export function getOutdoorPropMeshes() {
    return outdoorProps;
}

/**
 * Check if device is mobile (affects rendering quality and geometry detail).
 * Kept alongside the world context because build-time "cheaper geometry on
 * phones" decisions are made by world-building parts.
 */
export function isMobileDevice() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
}
