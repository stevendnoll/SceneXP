// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/hall.js - the props of Not That Simple (template 13): a torch on the
 * painted stone wall (backdrops.js `stone`), on the side away from the raised
 * hand so the hand stands against the dark, and on the figure a plain cloak
 * over an open collar (Steve's QA, 2026-11-04: a ring of fur round the neck read
 * as a rope and took the eye from the hand and the face). Generic (PRD section
 * 7): any old hall has a torch, and a cloak is a cloak, with no crest, badge or
 * weapon about it.
 *
 * The flame moves when the stage ticks it, which it does not under reduced
 * motion, and the picture takes it as it stands.
 */

import { flameMaterial } from './fine.min.js';
import { chestFront } from './wear.min.js';
import { bodyParts, torsoBox } from '../../../shared/js/avatar-wardrobe-1.0.0.min.js';

/**
 * The measures, meters. The `torch` runs from `from` on the wall up and out to
 * `to` ([x, y, z off the wall]), `r` thick, an iron `cup` at its top, a flame
 * `size` tall above that, and a warm `light` a little in front of it. The
 * `cloak`, in the figure's own frame: a `mantle` drawn from behind the neck over
 * the shoulders and down (`profile`, [how far out, height, how many radians it is
 * open either side of the front] points from the neck to the hem), flattened `deep`
 * front to back, its opening widest at the neck so the throat stays clear; and a
 * `cape` behind the back, `top` wide under the mantle and `w` at its hem. The open
 * `collar`: skin from the neck (`neck` either side) out over the torso's top and
 * down its rounded edge (`over`, `half` either side) to a point `deep` under the
 * top, with a `flap` of cloth `w` wide along each edge, in a lighter `color`.
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
        mantle: Object.freeze({
            deep: 0.74,
            profile: Object.freeze([
                Object.freeze([0.1, 1.335, 1.25]), Object.freeze([0.17, 1.358, 1.0]), Object.freeze([0.245, 1.34, 0.72]),
                Object.freeze([0.29, 1.26, 0.52]), Object.freeze([0.33, 1.1, 0.42]), Object.freeze([0.46, 0.68, 0.42])
            ])
        }),
        collar: Object.freeze({
            neck: 0.047, half: 0.058, deep: 0.13,
            over: Object.freeze([Object.freeze([-0.003, 0.78]), Object.freeze([0.002, 0.9]), Object.freeze([0.006, 0.945]), Object.freeze([0.012, 0.98]), Object.freeze([0.022, 1])]),
            flap: Object.freeze({ w: 0.024, color: 0x5b4738 })
        }),
        cape: Object.freeze({ y: 1.34, top: 0.34, w: 0.74, h: 1.1, t: 0.02, off: 0.03 })
    })
});

/** One surface from `points` ([x, y, z]) and `faces` (index triples). */
function sheet(points, faces, material, name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex(faces.flat());
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
}

/**
 * The open collar on `figure`'s tunic, in `group`, measured from its torso: the
 * skin running unbroken from the neck over the torso's top to a V on the chest
 * (Steve's QA, 2026-11-04: a V on the chest alone stood apart from the neck, a band
 * of shirt between them), and a flap of the tunic down each edge. The rig's round
 * collar goes. It takes the figure's own skin.
 */
export function openCollar(figure, group) {
    const K = HALL.cloak.collar;
    const { torso, collar } = bodyParts(figure.person);
    if (!torso) return;
    if (collar) collar.visible = false;
    let skin = null;
    figure.person.traverse((o) => { if (!skin && o.userData && o.userData.isHead) skin = o.material; });
    const { height, depth } = torsoBox(torso);
    const top = torso.position.y + height / 2;
    const front = depth / 2;
    // The way over the torso's rounded top edge, as [under the top, share of the
    // front]: a straight line from the top to the chest would be cut by the curve,
    // leaving a band of shirt across the skin (measured on the rig; a deeper build
    // has the same curve drawn deeper).
    const stand = 0.003;
    const curve = K.over.map(([under, share]) => [top - under, front * share + stand]);
    const point = top - K.deep;
    const edge = (x) => curve.map(([y, z]) => [x, y, z]);
    // Skin: back at the neck, then a row either side down the curve, then the V's
    // point.
    const rows = curve.length;
    const left = edge(-K.half);
    const right = edge(K.half);
    const skinPoints = [[-K.neck, curve[0][0], 0.015], [K.neck, curve[0][0], 0.015]];
    const skinFaces = [];
    for (let r = 0; r < rows; r++) skinPoints.push(left[r], right[r]);
    const at = (r, s) => 2 + r * 2 + (s > 0 ? 1 : 0);
    skinFaces.push([0, at(0, -1), at(0, 1)], [0, at(0, 1), 1]);
    for (let r = 0; r < rows - 1; r++) {
        skinFaces.push([at(r, -1), at(r + 1, -1), at(r + 1, 1)], [at(r, -1), at(r + 1, 1), at(r, 1)]);
    }
    skinPoints.push([0, point, front + stand]);
    skinFaces.push([at(rows - 1, -1), skinPoints.length - 1, at(rows - 1, 1)]);
    group.add(sheet(skinPoints, skinFaces, skin, 'throat'));
    // The flaps lie just over the skin's edges, along the same way.
    const cloth = new THREE.MeshStandardMaterial({ color: K.flap.color, roughness: 0.9, side: THREE.DoubleSide });
    const w = K.flap.w;
    const over = 0.002;
    for (const s of [-1, 1]) {
        const points = [[s * K.neck, curve[0][0] + over, -0.005], [s * (K.neck + w), curve[0][0] + over, -0.005]];
        for (const [y, z] of curve) points.push([s * K.half, y + over * 0.5, z + over], [s * (K.half + w), y + over * 0.5, z + over]);
        points.push([0, point, front + stand + over], [s * w * 0.8, point - w * 0.5, front + stand + over]);
        const faces = [];
        for (let r = 0; r < rows + 1; r++) {
            const [a, b, c, d] = [r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 3];
            faces.push([a, c, d], [a, d, b]);
        }
        group.add(sheet(points, faces, cloth, 'collarFlap'));
    }
}

/** The mantle's surface: `profile` rows turned about the neck, each open at the
 *  front by its own angle, and flattened `deep` front to back. */
function mantleGeometry(profile, deep, segments = 36) {
    const points = [];
    const faces = [];
    profile.forEach(([out, y, gap]) => {
        for (let k = 0; k <= segments; k++) {
            const a = gap + (k / segments) * (Math.PI * 2 - 2 * gap);
            points.push([out * Math.sin(a), y, out * Math.cos(a) * deep]);
        }
    });
    const row = segments + 1;
    for (let r = 0; r < profile.length - 1; r++) {
        for (let k = 0; k < segments; k++) {
            const [a, b, c, d] = [r * row + k, r * row + k + 1, (r + 1) * row + k, (r + 1) * row + k + 1];
            faces.push([a, c, b], [b, c, d]);
        }
    }
    return { points, faces };
}

/** The cloak on `figure`, a group added to its person. Null for a figure with
 *  no person. */
export function cloakOn(figure) {
    if (!figure.person) return null;
    const C = HALL.cloak;
    const group = new THREE.Group();
    group.name = 'cloak';
    const cloth = new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.92 });
    const front = chestFront(figure);
    openCollar(figure, group);
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
    // The mantle: cloth turned about the neck, behind it and over the shoulders,
    // open at the front; a raised arm comes through it, as an arm does.
    const Ma = C.mantle;
    const { points, faces } = mantleGeometry(Ma.profile, Ma.deep);
    group.add(sheet(points, faces, new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.92, side: THREE.DoubleSide }), 'mantle'));
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
