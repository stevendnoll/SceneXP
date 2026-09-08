// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ball.js - The football.
 *
 * A prop, not a figure. Its flight arc is not computed here and never will be:
 * `routes.getZIndex` already produces it, rising to the midpoint of a throw
 * and falling after, and view.js turns that into a world Y. All this module
 * does is own the mesh.
 */

let mesh = null;

/** An ellipsoid with a seam. Small enough at the play camera's distance that
 *  the laces would be a waste of triangles, but the long axis reads clearly
 *  when it is in the air, which is the only time anyone is looking at it. */
export function initBall(scene) {
    disposeBall();
    mesh = new THREE.Group();
    mesh.name = 'ball';

    const leather = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.75, metalness: 0 })
    );
    leather.scale.set(1.7, 1, 1);
    mesh.add(leather);

    const seam = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.011, 5, 14, Math.PI * 0.9),
        new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.6 })
    );
    seam.rotation.set(0, Math.PI / 2, Math.PI / 2);
    seam.position.y = 0.055;
    mesh.add(seam);

    mesh.visible = false;
    scene.add(mesh);
    return mesh;
}

export function getBall() {
    return mesh;
}

export function disposeBall() {
    if (!mesh) return;
    mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
    });
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh = null;
}
