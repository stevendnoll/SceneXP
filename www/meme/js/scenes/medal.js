// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/medal.js - the props of The Medal (template 11): a gold medal on a
 * ribbon, hung on the figure being honored, with the ribbon's loop round the
 * neck where the other figure's hands hold it (poses.js `drape`), and on both a
 * white shirt front and a tie over the template's dark clothes, so the gold
 * stands out on any avatar (Steve's QA, 2026-11-03: it fought a jersey's number
 * and collar). The stage is the template's own painted curtain and nothing
 * else. Generic (PRD section 7): a medal on a ribbon is anybody's, with no
 * seal, flag or crest about it.
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
    disc: Object.freeze({ y: 1.09, r: 0.075, depth: 0.014, off: 0.018, color: 0xd9ad3c, face: 0.72, faceColor: 0xf0cf6a }),
    ribbon: Object.freeze({
        color: 0x2a56d6,
        loop: Object.freeze({ y: 1.372, r: 0.085, tube: 0.014 }),
        straps: Object.freeze({ w: 0.046, t: 0.005, from: Object.freeze([0.07, 0.05]) })
    }),
    /** The shirt front: a white V `top` wide at height `y`, down to `bottom`,
     *  `off` the chest, and a tie down its middle, `w` wide. */
    shirt: Object.freeze({
        y: 1.35, top: 0.17, bottom: 1.1, off: 0.003, color: 0xf4f2ec,
        tie: Object.freeze({ y: 1.335, w: 0.05, knot: 0.03, bottom: 1.1, off: 0.005, color: 0x8a1f2c })
    })
});

/** The white shirt front and the tie on `figure`, a group added to its person.
 *  Null for a figure with no person. */
export function dress(figure) {
    if (!figure.person) return null;
    const S = MEDAL.shirt;
    const front = chestFront(figure);
    const group = new THREE.Group();
    group.name = 'shirtFront';
    const flat = (points, z, color, name) => {
        const shape = new THREE.Shape();
        points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
        shape.closePath();
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
        mesh.name = name;
        mesh.position.z = z;
        group.add(mesh);
    };
    flat([[-S.top / 2, S.y], [S.top / 2, S.y], [0, S.bottom]], front + S.off, S.color, 'shirt');
    const T = S.tie;
    flat([[-T.knot / 2, T.y], [T.knot / 2, T.y], [T.w * 0.36, T.y - 0.04], [T.w / 2, T.bottom + 0.05], [0, T.bottom], [-T.w / 2, T.bottom + 0.05], [-T.w * 0.36, T.y - 0.04]], front + T.off, T.color, 'tie');
    figure.person.add(group);
    return group;
}

/** The ribbon and the medal on `figure`, a group added to its person. Null
 *  for a figure with no person. */
export function hang(figure, front = chestFront(figure)) {
    if (!figure.person) return null;
    const M = MEDAL;
    const group = new THREE.Group();
    group.name = 'medal';
    const gold = new THREE.MeshStandardMaterial({ color: M.disc.color, roughness: 0.32, metalness: 0.7 });
    const bright = new THREE.MeshStandardMaterial({ color: M.disc.faceColor, roughness: 0.28, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: M.ribbon.color, roughness: 0.85 });
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

/** The shirt front on both figures in `box` and the medal on the one being
 *  honored, the one not draping it, and on either built again later. Returns
 *  the group. */
export function build(box, config, { figures = [] } = {}) {
    const group = new THREE.Group();
    group.name = 'medalScene';
    const fit = (figure) => {
        const chest = chestFront(figure);
        dress(figure);
        return figure.spec && figure.spec.pose !== 'drape' ? hang(figure, chest) : null;
    };
    for (const figure of figures) fit(figure);
    group.userData.fit = fit;
    box.add(group);
    return group;
}
