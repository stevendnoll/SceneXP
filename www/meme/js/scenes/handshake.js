// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/handshake.js - the light of The Handshake (template 2, M8): the
 * back wall is dark clouds with a pool of light behind the clasp
 * (backdrops.js `storm`), and the clasp is the brightest thing in the
 * panel: a warm glow behind the hands (the soft disc Galaxy Brain's halo
 * is drawn with) and a warm light on them (Steve, 2026-10-28: "a cloudy
 * dark gray look with a highlight around the handshake"). Generic (PRD
 * section 7): two people shaking hands in a pool of light are nobody's.
 */

import { haloTexture } from '../backdrops.min.js';

/** The glow's measures: a disc `radius` meters across laid `off` meters
 *  in front of the back wall, where the camera's line through the clasp
 *  meets it, so it is centered on the hands in the picture and behind
 *  everything in the box (a figure's resting hand reaches nearly to the
 *  wall, so a disc standing any nearer would cut through a figure and
 *  light a band across it), `color` added at `opacity`; and a warm light
 *  `ahead` of the clasp toward the camera and `up` of it, of `intensity`,
 *  reaching `distance`. backdrops.js PAINTS.storm pools its light on the
 *  same spot of the wall. */
export const CLASP_GLOW = Object.freeze({
    radius: 0.6, off: 0.02, color: 0xffe2a8, opacity: 0.85,
    light: Object.freeze({ ahead: 0.5, up: 0.15, intensity: 1.6, distance: 1.6, color: 0xffe6bf })
});

/** Where the two leading hands meet, in the box's own meters: the middle
 *  of the hands of the figures that shake, or null with fewer than two. */
export function claspOf(box, figures) {
    box.updateMatrixWorld(true);
    const hands = [];
    for (const figure of figures) {
        if (!figure.spec || figure.spec.pose !== 'shake') continue;
        const limb = figure.arms && figure.arms[figure.spec.side || 'right'];
        let hand = null;
        if (limb) limb.traverse((o) => { if (!hand && o.userData && o.userData.isHand) hand = o; });
        if (hand) hands.push(box.worldToLocal(hand.getWorldPosition(new THREE.Vector3())));
    }
    if (hands.length < 2) return null;
    return hands.reduce((sum, h) => sum.add(h), new THREE.Vector3()).multiplyScalar(1 / hands.length);
}

/** The glow and the light at the clasp in `box`, the glow on the back
 *  wall where the line from the `cell`'s camera through the clasp meets it
 *  (straight behind the clasp without a camera). Returns the group. */
export function build(box, config, { figures = [], cell = null } = {}) {
    const G = CLASP_GLOW;
    const group = new THREE.Group();
    group.name = 'handshake';
    const clasp = claspOf(box, figures);
    if (clasp) {
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(G.radius * 2, G.radius * 2),
            new THREE.MeshBasicMaterial({ color: G.color, map: haloTexture(), transparent: true, opacity: G.opacity, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        glow.name = 'claspGlow';
        const z = -config.box.depth / 2 + G.off;
        const eye = cell && cell.camera ? new THREE.Vector3(...cell.camera.eye) : null;
        if (eye && eye.z > clasp.z) glow.position.copy(eye).lerp(clasp, (eye.z - z) / (eye.z - clasp.z));
        else glow.position.set(clasp.x, clasp.y, z);
        group.add(glow);
        const light = new THREE.PointLight(G.light.color, G.light.intensity, G.light.distance, 1.5);
        light.name = 'claspLight';
        light.position.set(clasp.x, clasp.y + G.light.up, clasp.z + G.light.ahead);
        group.add(light);
    }
    box.add(group);
    return group;
}
