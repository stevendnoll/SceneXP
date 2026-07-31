// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * structures.js - Building structure builders (shared engine part)
 *
 * Wall slabs, wall segments, and window/door frames. Each attaches itself to
 * the world root group; the experience registers colliders where it wants
 * them (solid walls usually via its own collision pass).
 */
import { getWorldGroup, addColliderForMesh } from './world-1.0.0.min.js';

/**
 * Create a single wall segment
 */
export function createWall(width, height, depth, x, y, z, rotationY, material, name) {
    const geometry = new THREE.BoxGeometry(width, height, depth);

    // Clone material and adjust texture repeat based on wall size (stucco
    // reads at a finer scale than the old brick coursing)
    const wallMaterial = material.clone();
    if (wallMaterial.map) {
        wallMaterial.map = material.map.clone();
        wallMaterial.map.repeat.set(width / 6, height / 3);
    }

    const wall = new THREE.Mesh(geometry, wallMaterial);
    wall.position.set(x, y, z);
    wall.rotation.y = rotationY;
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.name = name;

    getWorldGroup().add(wall);

    // Add collision box
    addColliderForMesh(wall);
}

/**
 * Create a wall segment
 */
export function createWallSegment(width, height, depth, x, y, z, material, name) {
    if (width <= 0 || height <= 0) return;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    const segmentMaterial = material.clone();
    if (segmentMaterial.map) {
        segmentMaterial.map = material.map.clone();
        segmentMaterial.map.repeat.set(width / 6, height / 3);
    }

    const segment = new THREE.Mesh(geometry, segmentMaterial);
    segment.position.set(x, y, z);
    segment.castShadow = true;
    segment.receiveShadow = true;
    segment.name = name;

    getWorldGroup().add(segment);
    addColliderForMesh(segment);
}

/**
 * Create window frame
 */
export function createWindowFrame(width, height, x, y, z, material, name) {
    const frameThickness = 0.1;
    const frameDepth = 0.15;

    // Top frame
    const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(width, frameThickness, frameDepth),
        material
    );
    topFrame.position.set(x, y + height / 2 - frameThickness / 2, z);
    topFrame.name = `${name}TopFrame`;
    getWorldGroup().add(topFrame);

    // Bottom frame
    const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(width, frameThickness, frameDepth),
        material
    );
    bottomFrame.position.set(x, y - height / 2 + frameThickness / 2, z);
    bottomFrame.name = `${name}BottomFrame`;
    getWorldGroup().add(bottomFrame);

    // Left frame
    const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, height, frameDepth),
        material
    );
    leftFrame.position.set(x - width / 2 + frameThickness / 2, y, z);
    leftFrame.name = `${name}LeftFrame`;
    getWorldGroup().add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, height, frameDepth),
        material
    );
    rightFrame.position.set(x + width / 2 - frameThickness / 2, y, z);
    rightFrame.name = `${name}RightFrame`;
    getWorldGroup().add(rightFrame);
}

/**
 * Create door frame
 */
export function createDoorFrame(width, height, x, z, material) {
    const frameThickness = 0.15;
    const frameDepth = 0.2;

    // The jambs are embedded in the wall they trim, so without a lip their
    // opening-facing surfaces would sit exactly on the wall's cut faces and
    // z-fight (striped flicker as the depth buffer flips between the two).
    // Extending each jamb a couple of centimeters past the cut face into the
    // opening gives the depth test an unambiguous winner.
    const lip = 0.02;

    // Top frame
    const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
        material
    );
    topFrame.position.set(x, height, z);
    topFrame.name = 'doorTopFrame';
    getWorldGroup().add(topFrame);

    // Left frame
    const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness + lip, height, frameDepth),
        material
    );
    leftFrame.position.set(x - width / 2 - frameThickness / 2 + lip / 2, height / 2, z);
    leftFrame.name = 'doorLeftFrame';
    getWorldGroup().add(leftFrame);
    addColliderForMesh(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness + lip, height, frameDepth),
        material
    );
    rightFrame.position.set(x + width / 2 + frameThickness / 2 - lip / 2, height / 2, z);
    rightFrame.name = 'doorRightFrame';
    getWorldGroup().add(rightFrame);
    addColliderForMesh(rightFrame);

    // Center divider
    const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, height - 0.2, frameDepth),
        material
    );
    divider.position.set(x, height / 2, z);
    divider.name = 'doorDivider';
    getWorldGroup().add(divider);
}
