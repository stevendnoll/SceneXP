// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/medal.js - the prop of The Medal (template 11): a gold medal on a
 * ribbon, hung on the figure being honored, with the ribbon's loop round the
 * neck where the other figure's hands hold it (poses.js `drape`). The stage is
 * the template's own painted curtain and nothing else. Generic (PRD section
 * 7): a medal on a ribbon is anybody's, with no seal, flag or crest about it.
 */

import { chestFront } from './wear.min.js';

/**
 * The measures, meters in the figure's own frame. The `disc` of radius `r`
 * hangs at height `y`, standing `off` from the chest with a raised `face`; the
 * `ribbon`'s `loop` rings the neck at height `y`, radius `r`, and two flat
 * `straps` of width `w` run from its sides (`from`, either side of the middle
 * and forward of it) down to the disc's top.
 */
export const MEDAL = Object.freeze({
    disc: Object.freeze({ y: 1.1, r: 0.066, depth: 0.012, off: 0.016, color: 0xd9ad3c, face: 0.72, faceColor: 0xf0cf6a }),
    ribbon: Object.freeze({
        color: 0x1f3a8a,
        loop: Object.freeze({ y: 1.372, r: 0.085, tube: 0.012 }),
        straps: Object.freeze({ w: 0.036, t: 0.004, from: Object.freeze([0.07, 0.05]) })
    })
});

/** The ribbon and the medal on `figure`, a group added to its person. Null
 *  for a figure with no person. */
export function hang(figure) {
    if (!figure.person) return null;
    const M = MEDAL;
    const group = new THREE.Group();
    group.name = 'medal';
    const gold = new THREE.MeshStandardMaterial({ color: M.disc.color, roughness: 0.32, metalness: 0.7 });
    const bright = new THREE.MeshStandardMaterial({ color: M.disc.faceColor, roughness: 0.28, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: M.ribbon.color, roughness: 0.85 });
    const front = chestFront(figure);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(M.disc.r, M.disc.r, M.disc.depth, 32), gold);
    disc.name = 'disc';
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, M.disc.y, front + M.disc.off);
    group.add(disc);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(M.disc.r * M.disc.face, M.disc.r * M.disc.face, M.disc.depth * 1.4, 32), bright);
    face.name = 'face';
    face.rotation.x = Math.PI / 2;
    face.position.copy(disc.position);
    group.add(face);
    const L = M.ribbon.loop;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(L.r, L.tube, 6, 28), cloth);
    loop.name = 'loop';
    loop.rotation.x = Math.PI / 2;
    loop.position.y = L.y;
    group.add(loop);
    const St = M.ribbon.straps;
    const top = new THREE.Vector3(0, M.disc.y + M.disc.r * 0.8, front + M.disc.off);
    for (const s of [-1, 1]) {
        const from = new THREE.Vector3(s * St.from[0], L.y, St.from[1]);
        const length = from.distanceTo(top);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(St.w, length, St.t), cloth);
        strap.name = 'strap';
        strap.position.copy(from).add(top).multiplyScalar(0.5);
        strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(top).normalize());
        group.add(strap);
    }
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
    });
    figure.person.add(group);
    return group;
}

/** The medal on the figure being honored in `box`, the one not draping it, and
 *  on that figure built again later. Returns the group. */
export function build(box, config, { figures = [] } = {}) {
    const group = new THREE.Group();
    group.name = 'medalScene';
    const fit = (figure) => (figure.spec && figure.spec.pose !== 'drape' ? hang(figure) : null);
    for (const figure of figures) fit(figure);
    group.userData.fit = fit;
    box.add(group);
    return group;
}
