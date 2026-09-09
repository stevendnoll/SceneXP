// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ball.js - The football.
 *
 * A prop, not a figure. Its flight arc is not computed here and never will be:
 * `routes.getZIndex` already produces it, rising to the midpoint of a throw and
 * falling after, and view.js turns that into a world Y. This module owns the
 * mesh, how it is pointed, and how it spins.
 *
 * IT POINTS ALONG ITS OWN VELOCITY, WHICH IT DID NOT USED TO. The old version
 * set `rotation.y` from the simulation's horizontal speeds and nothing else, so
 * a ball climbing to the top of a 4m arc and dropping again stayed resolutely
 * level the whole way. A thrown ball that does not tip its nose up and then
 * down reads as a bead sliding along a wire.
 *
 * IT SPIRALS, WHICH IS THE PART THAT MAKES IT LOOK THROWN. A real pass rotates
 * about its long axis several times a second. The spin is only visible because
 * of the two white bands: a smooth brown ellipsoid rotating about its own axis
 * of symmetry is, to the eye, completely motionless.
 *
 * AND IT CASTS A SPOT ON THE GRASS while it is up. From the play camera a ball
 * in flight is a dozen pixels against a dark field and, with no contact with
 * the ground, no fixed idea of how high or how far away it is. The spot is the
 * cheapest possible depth cue and it is what makes the arc readable.
 */

import { EXESNOHS_CONFIG as CFG } from './config.min.js';

let mesh = null;      // the ball itself
let spot = null;      // the shadow on the grass under it

/** An ellipsoid with a seam and two bands. Small enough at the play camera's
 *  distance that the laces would be a waste of triangles, but the long axis
 *  reads clearly when it is in the air, which is the only time anyone is
 *  looking at it. */
export function initBall(scene) {
    disposeBall();
    mesh = new THREE.Group();
    mesh.name = 'ball';

    // LIGHTER THAN A REAL FOOTBALL, ON PURPOSE. The field is dark green under
    // floodlights at night and the sky behind the arc is nearly black, so a
    // regulation dark brown ball is invisible for the whole of its flight,
    // which was the complaint. This is roughly a new ball under stadium light.
    const leather = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 11),
        new THREE.MeshStandardMaterial({ color: 0xb4642c, roughness: 0.62, metalness: 0 })
    );
    // The long axis is local X, and everything that aims this ball assumes so.
    leather.scale.set(1.7, 1, 1);
    mesh.add(leather);

    const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.55 });

    // THE TWO BANDS ARE WHAT MAKE THE SPIRAL VISIBLE. Without a mark off the
    // axis, spinning a solid of revolution about that axis changes nothing on
    // screen, and the ball would rotate correctly and look completely still.
    for (const side of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.014, 6, 18), white);
        band.rotation.y = Math.PI / 2;
        band.position.x = side * 0.115;
        mesh.add(band);
    }

    const seam = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.012, 5, 14, Math.PI * 0.9),
        white
    );
    seam.rotation.set(0, Math.PI / 2, Math.PI / 2);
    seam.position.y = 0.055;
    mesh.add(seam);

    // Bigger than life, on purpose: the ball is the one thing the visitor is
    // actually following and it is the smallest object on the field.
    mesh.scale.setScalar(CFG.ballScale);
    mesh.visible = false;
    scene.add(mesh);

    spot = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 16),
        new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.34,
            depthWrite: false, toneMapped: false,
        })
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.03;
    spot.renderOrder = 1;
    spot.visible = false;
    spot.name = 'ball-spot';
    scene.add(spot);

    return mesh;
}

/**
 * Point the ball along a heading and roll it about that axis.
 *
 * `dir` is a world-space direction, not necessarily normalised, and may be
 * anything at all when the ball is at rest, so a degenerate one leaves the
 * current attitude alone rather than snapping the ball flat.
 *
 * The rotation is built by hand rather than with `lookAt`, because lookAt aims
 * an object's -Z and this ball's long axis is +X.
 */
const AIM = { axis: null, quat: null, roll: null, forward: null };
export function aimBall(dir, spin) {
    if (!mesh) return;
    if (!AIM.quat) {
        // Built on first use rather than at module scope, because THREE is a
        // global this module does not import and is not guaranteed to exist
        // when the file is first evaluated.
        AIM.quat = new THREE.Quaternion();
        AIM.roll = new THREE.Quaternion();
        AIM.axis = new THREE.Vector3();
        AIM.forward = new THREE.Vector3(1, 0, 0);
    }
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-4) return;      // at rest: keep the attitude it already has
    AIM.axis.set(dir.x / len, dir.y / len, dir.z / len);
    AIM.quat.setFromUnitVectors(AIM.forward, AIM.axis);
    // The spiral, about the ball's own long axis, applied after the aim so it
    // stays a roll rather than becoming a wobble.
    AIM.roll.setFromAxisAngle(AIM.forward, spin);
    AIM.quat.multiply(AIM.roll);
    mesh.quaternion.copy(AIM.quat);
}

/**
 * Show or hide the spot on the grass, and put it under the ball.
 *
 * It fades and spreads with height, the way a real shadow does, so the arc's
 * apex is legible from the spot alone.
 */
export function placeSpot(x, y, z, visible) {
    if (!spot) return;
    spot.visible = visible;
    if (!visible) return;
    spot.position.set(x, 0.03, z);
    const lift = Math.max(0, Math.min(y / 4, 1));
    const spread = 1 + lift * 1.5;
    spot.scale.set(spread, spread, 1);
    spot.material.opacity = 0.36 * (1 - lift * 0.55);
}

export function getBall() {
    return mesh;
}

export function disposeBall() {
    for (const obj of [mesh, spot]) {
        if (!obj) continue;
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        if (obj.parent) obj.parent.remove(obj);
    }
    mesh = null;
    spot = null;
}
