// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/medal.js - the prop of The Medal (template 11): a gold medal on a
 * ribbon, hung on the figure being honored. The ribbon goes round the neck as a
 * ribbon does (Steve's QA, 2026-11-03: a ring with a bar across the throat did
 * not read as one): a band behind the neck, open at the front, and two straps
 * from its ends over the collarbones, meeting at the disc on the chest. The other
 * figure's hands hold the band at the nape (poses.js `drape`). The clothes are
 * the shared suit and the stage the template's own painted curtain. Generic (PRD
 * section 7): a medal on a ribbon is anybody's, with no seal, flag or crest about
 * it.
 */

import { chestFront } from './wear.min.js';

/**
 * The measures, meters in the figure's own frame. The `disc` of radius `r` hangs
 * at height `y`, standing `off` from the chest with a raised `face`. The ribbon's
 * `band` rings the neck at height `y`, radius `r` and `h` tall, open `gap`
 * radians either side of the front; its `straps`, `w` wide, run from the band's
 * ends to `over` ([across, height], on the chest, `off` from it) and on to the
 * disc's top.
 */
export const MEDAL = Object.freeze({
    disc: Object.freeze({ y: 1.09, r: 0.075, depth: 0.014, off: 0.018, color: 0xd9ad3c, face: 0.72, faceColor: 0xf0cf6a }),
    ribbon: Object.freeze({
        color: 0x2a56d6,
        band: Object.freeze({ y: 1.335, r: 0.06, h: 0.036, gap: 0.8 }),
        straps: Object.freeze({ w: 0.04, t: 0.005, over: Object.freeze([0.07, 1.285]), off: 0.01 })
    })
});

/** The ribbon and the medal on `figure`, a group added to its person. Null for a
 *  figure with no person. */
export function hang(figure) {
    if (!figure.person) return null;
    const M = MEDAL;
    const front = chestFront(figure);
    const group = new THREE.Group();
    group.name = 'medal';
    const gold = new THREE.MeshStandardMaterial({ color: M.disc.color, roughness: 0.32, metalness: 0.7 });
    const bright = new THREE.MeshStandardMaterial({ color: M.disc.faceColor, roughness: 0.28, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: M.ribbon.color, roughness: 0.85, side: THREE.DoubleSide });
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
    // The band: round the back of the neck, open at the front. A cylinder's
    // angle starts at +z (the front) and runs toward +x.
    const B = M.ribbon.band;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 1.08, B.h, 28, 1, true, B.gap, Math.PI * 2 - 2 * B.gap), cloth);
    band.name = 'band';
    band.position.y = B.y;
    group.add(band);
    const St = M.ribbon.straps;
    const strap = (from, to) => {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(St.w, from.distanceTo(to) + St.w * 0.3, St.t), cloth);
        piece.name = 'strap';
        piece.position.copy(from).add(to).multiplyScalar(0.5);
        piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
        group.add(piece);
    };
    for (const s of [-1, 1]) {
        const end = new THREE.Vector3(s * B.r * Math.sin(B.gap), B.y, B.r * Math.cos(B.gap));
        const over = new THREE.Vector3(s * St.over[0], St.over[1], front + St.off);
        const top = new THREE.Vector3(s * 0.012, M.disc.y + M.disc.r * 0.8, front + St.off);
        strap(end, over);
        strap(over, top);
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
