// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/hall.js - the props of Not That Simple (template 13): a torch on the
 * painted stone wall (backdrops.js `stone`), on the side away from the raised
 * hand so the hand stands against the dark, and a plain cloak with a fur collar
 * on the figure. Generic (PRD section 7): any old hall has a torch, and a cloak
 * is a cloak, with no crest, badge or weapon about it.
 *
 * The flame moves when the stage ticks it, which it does not under reduced
 * motion, and the picture takes it as it stands.
 */

import { flameMaterial } from './fine.min.js';
import { chestFront } from './wear.min.js';

/**
 * The measures, meters. The `torch` runs from `from` on the wall up and out to
 * `to` ([x, y, z off the wall]), `r` thick, an iron `cup` at its top, a flame
 * `size` tall above that, and a warm `light` a little in front of it. The
 * `cloak`, in the figure's own frame: `collar` lumps of fur round the neck on
 * an oval `rx` by `rz` at height `y`; a `cape` behind the back, its top at
 * height `y` under the collar, `top` wide there and `w` at its hem; and two
 * `edges` down the chest, `x` either side.
 */
export const HALL = Object.freeze({
    torch: Object.freeze({
        from: Object.freeze([0.62, 1.28, 0.02]), to: Object.freeze([0.62, 1.56, 0.16]), r: 0.018, color: 0x4a3626,
        cup: Object.freeze({ r: 0.04, h: 0.06, color: 0x2a2826 }),
        flame: Object.freeze({ size: 0.26, color: 0xff9a2e, above: 0.12 }),
        light: Object.freeze({ color: 0xffb066, intensity: 1.1, distance: 2.2, ahead: 0.25 })
    }),
    cloak: Object.freeze({
        color: 0x26312b,
        collar: Object.freeze({ count: 18, y: 1.355, rx: 0.17, rz: 0.125, r: 0.05, color: 0x6e5c49, tip: 0x8a7760 }),
        cape: Object.freeze({ y: 1.34, top: 0.34, w: 0.74, h: 1.1, t: 0.02, off: 0.03 }),
        edges: Object.freeze({ x: 0.14, y: 1.32, w: 0.09, h: 0.62, t: 0.012, off: 0.006 })
    })
});

/** The cloak on `figure`, a group added to its person. Null for a figure with
 *  no person. */
export function cloakOn(figure) {
    if (!figure.person) return null;
    const C = HALL.cloak;
    const group = new THREE.Group();
    group.name = 'cloak';
    const cloth = new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.92 });
    const front = chestFront(figure);
    // Narrow at the neck and falling wider, so its corners do not stand over
    // the shoulders like a sandwich board's.
    const Ca = C.cape;
    const outline = new THREE.Shape();
    outline.moveTo(-Ca.top / 2, 0);
    outline.lineTo(Ca.top / 2, 0);
    outline.lineTo(Ca.w / 2, -Ca.h);
    outline.lineTo(-Ca.w / 2, -Ca.h);
    outline.closePath();
    const cape = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: Ca.t, bevelEnabled: false }), cloth);
    cape.name = 'cape';
    cape.position.set(0, Ca.y, -front - Ca.off - Ca.t);
    group.add(cape);
    for (const s of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(C.edges.w, C.edges.h, C.edges.t), cloth);
        edge.name = 'edge';
        edge.position.set(s * C.edges.x, C.edges.y - C.edges.h / 2, front + C.edges.off);
        group.add(edge);
    }
    const F = C.collar;
    const lump = new THREE.IcosahedronGeometry(F.r, 0);
    const fur = [new THREE.MeshStandardMaterial({ color: F.color, roughness: 1 }), new THREE.MeshStandardMaterial({ color: F.tip, roughness: 1 })];
    for (let i = 0; i < F.count; i++) {
        const a = (i / F.count) * Math.PI * 2;
        const piece = new THREE.Mesh(lump, fur[i % 2]);
        piece.name = 'fur';
        piece.position.set(Math.cos(a) * F.rx, F.y + (i % 2) * 0.008, Math.sin(a) * F.rz);
        piece.rotation.set(a, a * 2, 0);
        group.add(piece);
    }
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
    });
    figure.person.add(group);
    return group;
}

/** The torch in `box` and the cloak on its figures. Returns the group, with
 *  `tick(dt)` to move the flame and `fit(figure)` for a figure built again. */
export function build(box, config, { figures = [] } = {}) {
    const T = HALL.torch;
    const wall = -config.box.depth / 2;
    const group = new THREE.Group();
    group.name = 'hall';
    const from = new THREE.Vector3(T.from[0], T.from[1], wall + T.from[2]);
    const to = new THREE.Vector3(T.to[0], T.to[1], wall + T.to[2]);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r * 0.8, from.distanceTo(to), 10), new THREE.MeshStandardMaterial({ color: T.color, roughness: 0.85 }));
    shaft.name = 'shaft';
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    shaft.castShadow = true;
    group.add(shaft);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(T.cup.r, T.cup.r * 0.6, T.cup.h, 14), new THREE.MeshStandardMaterial({ color: T.cup.color, roughness: 0.6, metalness: 0.4 }));
    cup.name = 'cup';
    cup.position.copy(to);
    cup.castShadow = true;
    group.add(cup);
    const flame = new THREE.Sprite(flameMaterial(T.flame.color));
    flame.name = 'flame';
    flame.position.set(to.x, to.y + T.flame.above, to.z);
    flame.scale.set(T.flame.size * 0.8, T.flame.size, 1);
    group.add(flame);
    const light = new THREE.PointLight(T.light.color, T.light.intensity, T.light.distance, 1.5);
    light.name = 'torchLight';
    light.position.set(to.x, to.y + T.flame.above, to.z + T.light.ahead);
    group.add(light);
    for (const figure of figures) cloakOn(figure);
    group.userData.fit = cloakOn;
    let t = 0;
    group.userData.tick = (dt) => {
        t += dt;
        const flick = 1 + 0.1 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23);
        flame.scale.set(T.flame.size * 0.8 * flick, T.flame.size / flick, 1);
        light.intensity = T.light.intensity * flick;
    };
    box.add(group);
    return group;
}
