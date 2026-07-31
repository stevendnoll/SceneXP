// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * collision.js - Player AABB collision with wall-sliding (shared engine part)
 *
 * Pure with respect to world state: the caller supplies the collider list
 * (usually a snapshot of world.getColliders() plus any extras) and wires the
 * result into controls via setCollisionCallback:
 *
 *   setCollisionCallback((oldPos, newPos, radius) =>
 *       checkCollision(oldPos, newPos, radius, boxes));
 *
 * Scratch objects are module-level to avoid per-frame allocation.
 */

const _playerBox = new THREE.Box3();
const _playerSize = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _slideX = new THREE.Vector3();
const _slideZ = new THREE.Vector3();

/** AABB collision with wall-sliding (ported from the original store build).
 *  Returns the position the player may move to: the full move when clear,
 *  a single-axis slide along whichever axis is clear, or oldPos when stuck. */
export function checkCollision(oldPos, newPos, radius, collisionBoxes) {
    _playerSize.set(radius * 2, 1.7, radius * 2);

    _tempVec3.set(newPos.x, newPos.y - 0.85, newPos.z);
    _playerBox.setFromCenterAndSize(_tempVec3, _playerSize);
    if (!intersectsAny(collisionBoxes)) return newPos;

    _slideX.set(newPos.x, oldPos.y, oldPos.z);
    _tempVec3.set(_slideX.x, _slideX.y - 0.85, _slideX.z);
    _playerBox.setFromCenterAndSize(_tempVec3, _playerSize);
    const collisionX = intersectsAny(collisionBoxes);

    _slideZ.set(oldPos.x, oldPos.y, newPos.z);
    _tempVec3.set(_slideZ.x, _slideZ.y - 0.85, _slideZ.z);
    _playerBox.setFromCenterAndSize(_tempVec3, _playerSize);
    const collisionZ = intersectsAny(collisionBoxes);

    if (!collisionX && !collisionZ) {
        return Math.abs(_slideX.x - oldPos.x) > Math.abs(_slideZ.z - oldPos.z) ? _slideX : _slideZ;
    }
    if (!collisionX) return _slideX;
    if (!collisionZ) return _slideZ;
    return oldPos;
}

function intersectsAny(collisionBoxes) {
    for (const { box } of collisionBoxes) {
        if (_playerBox.intersectsBox(box)) return true;
    }
    return false;
}
