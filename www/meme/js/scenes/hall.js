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
 * `cloak`, in the figure's own frame: a `collar` of soft fur, `rings` of lumps
 * ([height, across, deep, how many]) round the neck; a `mantle` over the
 * shoulders, `top` to `hem` across and `h` tall, its top at height `y`, flattened
 * `deep` front to back and open `gap` radians down the front; and a `cape` behind
 * the back, `top` wide under the collar and `w` at its hem (Steve's QA,
 * 2026-11-03: flat lumps read as rocks, and two strips down the chest as a towel).
 */
export const HALL = Object.freeze({
    torch: Object.freeze({
        from: Object.freeze([0.52, 1.3, 0.02]), to: Object.freeze([0.52, 1.58, 0.16]), r: 0.018, color: 0x4a3626,
        cup: Object.freeze({ r: 0.04, h: 0.06, color: 0x2a2826 }),
        flame: Object.freeze({ size: 0.26, color: 0xff9a2e, above: 0.12 }),
        light: Object.freeze({ color: 0xffb066, intensity: 1.1, distance: 2.2, ahead: 0.25 })
    }),
    cloak: Object.freeze({
        color: 0x2c3a31,
        collar: Object.freeze({
            r: 0.046, color: 0x6e5c49, tip: 0x8f7c64,
            rings: Object.freeze([Object.freeze([1.345, 0.2, 0.135, 22]), Object.freeze([1.312, 0.255, 0.165, 26])])
        }),
        mantle: Object.freeze({ y: 1.34, top: 0.24, hem: 0.46, h: 0.66, deep: 0.74, gap: 0.5 }),
        cape: Object.freeze({ y: 1.34, top: 0.34, w: 0.74, h: 1.1, t: 0.02, off: 0.03 })
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
    // The mantle: a cone of cloth over the shoulders, open down the front; a
    // raised arm comes through it, as an arm does.
    const Ma = C.mantle;
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(Ma.top, Ma.hem, Ma.h, 32, 1, true, Ma.gap, Math.PI * 2 - 2 * Ma.gap), new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.92, side: THREE.DoubleSide }));
    mantle.name = 'mantle';
    mantle.scale.z = Ma.deep;
    mantle.position.y = Ma.y - Ma.h / 2;
    group.add(mantle);
    // The fur: smooth lumps, so it reads soft, in two rings of two tones.
    const F = C.collar;
    const lump = new THREE.SphereGeometry(F.r, 10, 8);
    const fur = [new THREE.MeshStandardMaterial({ color: F.color, roughness: 1 }), new THREE.MeshStandardMaterial({ color: F.tip, roughness: 1 })];
    F.rings.forEach(([y, rx, rz, count], ring) => {
        for (let i = 0; i < count; i++) {
            const a = ((i + ring / 2) / count) * Math.PI * 2;
            const piece = new THREE.Mesh(lump, fur[(i + ring) % 2]);
            piece.name = 'fur';
            piece.position.set(Math.cos(a) * rx, y + (i % 3) * 0.006, Math.sin(a) * rz);
            piece.scale.set(1, 0.85, 1);
            group.add(piece);
        }
    });
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
