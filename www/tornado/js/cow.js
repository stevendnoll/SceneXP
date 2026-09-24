// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cow.js - the payoff.
 *
 * A Holstein is lifted out of the dust at the tornado's foot, carried round
 * the edge of the debris, flung toward the camera as the tornado ropes out,
 * and set down gently on all four feet among the herd in the pasture, where
 * it turns its head toward the visitor and chews while the four grazing
 * there look up. See config.cow for the timeline.
 *
 * A RIG FOR DISTANCES. It is low-poly, and QA (2026-09-23) found its facets
 * show up close, so it lands about 190 m out, never in the foreground.
 *
 * THE POSE IS PURE. cowPoseAt(t) and pasturePoseAt(i, t) answer where each
 * cow is and how it is holding itself at story second t, from the story clock
 * alone, so a seek lands on the same cow an untouched watch has and the whole
 * flight can be tested without a browser. The three.js half only builds the
 * rig and applies a pose to it.
 *
 * THREE PIECES OF THE FLIGHT, joined so the cow never jumps:
 *   orbit   round the funnel's foot, rising out of the dust, tumbling
 *   flight  one cubic curve from where the orbit lets go of it to the ground,
 *           slowing the whole way, righting itself and bringing its legs in
 *           as it comes down, and stopping only as its hooves touch
 *   landed  standing, then looking round at the camera, chewing
 *
 * There used to be a fourth: the flight stopped dead in the air over the
 * herd and the cow then sank straight down. QA saw straight through the
 * pause (2026-09-23), so it is one motion now.
 *
 * THE COW'S OWN AXES: +x is where it faces, y is up, and its feet stand on
 * y = 0 at the origin. It is about 2 m long and 1.45 m at the shoulder.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { funnelStateAt, spineAt } from './funnel.min.js';
import { makeRandom } from '../../shared/js/treespecies-1.0.0.min.js';

// Its length, for the apparent-size floor.
export const COW_LENGTH = 2.4;

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function smooth(x) { const k = clamp01(x); return k * k * (3 - 2 * k); }
function smoothstep(a, b, x) { return smooth((x - a) / (b - a)); }

/** Where the orbit has the cow at `time` (between pickup and fling). */
export function orbitPosition(time, config = TORNADO_CONFIG) {
    const K = config.cow;
    const s = funnelStateAt(time, time, config);
    const g = spineAt(0, s);
    const r = s.dustRadius * K.orbit.radiusScale;
    const a = K.orbit.rate * (time - K.pickupAt);
    const rise = smooth((time - K.pickupAt) / K.orbit.rise);
    return { x: g.x + Math.cos(a) * r, y: 2 + K.orbit.height * rise, z: g.z + Math.sin(a) * r };
}

function bezier(p0, p1, p2, p3, s) {
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    return {
        x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        z: a * p0.z + b * p1.z + c * p2.z + d * p3.z
    };
}

/**
 * Where anything the tornado carries is at story second t (before any size
 * floor): round the funnel on the cow's orbit, then flung along one cubic
 * curve to `flight.landing`, through `flight.cruise`, braking by
 * `flight.brake`. The cow is one such flight; the replay surprises
 * (payloads.js) are the others, on the same clock.
 */
export function flightPosition(t, flight, config = TORNADO_CONFIG) {
    const K = config.cow;
    const L = flight.landing;
    if (t < K.flingAt) return orbitPosition(Math.max(t, K.pickupAt), config);
    if (t >= K.landAt) return { x: L.x, y: 0, z: L.z };
    // Leaves fast, as a fling does, and brakes toward the ground.
    const u = (t - K.flingAt) / (K.landAt - K.flingAt);
    const s = 1 - Math.pow(1 - u, flight.brake);
    const p0 = orbitPosition(K.flingAt, config);
    const [c1, c2] = flight.cruise.map(([x, y, z]) => ({ x, y, z }));
    return bezier(p0, c1, c2, { x: L.x, y: 0, z: L.z }, s);
}

/** Where the cow's feet are at story second t (before any size floor). */
export function cowPosition(t, config = TORNADO_CONFIG) {
    return flightPosition(t, config.cow, config);
}

/** How large to draw it so a far-off cow (or anything `length` metres long)
 *  is never less than a few pixels. */
export function sizeFloor(p, config = TORNADO_CONFIG, length = COW_LENGTH) {
    const d = Math.max(Math.hypot(p.x, p.y - config.camera.height, p.z), 1);
    const fov = config.camera.fovDegrees * Math.PI / 180;
    const pixels = (length / d) / fov * 900;
    return Math.max(1, config.cow.minPixels / pixels);
}

/** The head's turn toward the camera, relative to the body, within the neck. */
export function lookTurn(config = TORNADO_CONFIG) {
    const L = config.cow.landing;
    // The camera, in the landed cow's own axes.
    const dx = -L.x;
    const dz = -L.z;
    const cx = Math.cos(L.yaw);
    const sx = Math.sin(L.yaw);
    const lx = dx * cx - dz * sx;
    const lz = dx * sx + dz * cx;
    const turn = Math.atan2(-lz, lx);
    return Math.max(-config.cow.neckLimit, Math.min(config.cow.neckLimit, turn));
}

/**
 * The whole pose at story second t:
 *   visible, x, y, z, scale
 *   tumble { pitch, roll, yaw } and upright (0 tumbling, 1 upright), which the
 *   rig blends between; yaw, the upright heading
 *   splay (legs out), dip (the knees giving on touchdown)
 *   headYaw, headPitch, chew, tail, ear
 */
export function cowPoseAt(t, config = TORNADO_CONFIG) {
    const K = config.cow;
    if (t < K.pickupAt) {
        return { visible: false, x: 0, y: 0, z: 0, scale: 1, tumble: { pitch: 0, roll: 0, yaw: 0 },
            upright: 1, yaw: K.landing.yaw, splay: 0, dip: 0, headYaw: 0, headPitch: 0, chew: 0, tail: 0, ear: 0 };
    }
    const p = cowPosition(t, config);
    const air = t - K.pickupAt;
    const w = K.tumbleRate;
    const landed = t >= K.landAt;
    // A gentle rock on the way down, gone by touchdown.
    const down = K.landAt - K.uprightBy;
    const rock = t >= down && !landed
        ? 0.08 * Math.sin((t - down) * 2.4) * (1 - smoothstep(K.landAt - 0.8, K.landAt, t))
        : 0;
    const settle = t - K.landAt;
    return {
        visible: true,
        x: p.x,
        y: p.y,
        z: p.z,
        scale: sizeFloor(p, config),
        tumble: { pitch: w * air, roll: 0.7 * w * air + 1, yaw: 0.4 * w * air },
        upright: smoothstep(K.landAt - K.uprightFrom, K.landAt - K.uprightBy, t),
        yaw: K.landing.yaw + rock,
        splay: 1 - smoothstep(K.landAt - K.legsFrom, K.landAt - K.legsBy, t),
        dip: landed && settle < 0.5 ? 0.06 * Math.sin(Math.PI * settle / 0.5) : 0,
        headYaw: lookTurn(config) * smoothstep(K.lookAt, K.lookAt + 0.8, t),
        headPitch: landed ? 0 : -0.25,
        chew: t > K.landAt + 0.3 ? Math.sin(t * K.chewRate) : 0,
        // Streams behind it in the air; swishes once it stands.
        tail: landed ? Math.sin(t * 1.7) : 0.9,
        ear: Math.max(0, Math.sin(t * 0.9) - 0.85) * 6
    };
}

/** A pasture cow's pose: grazing, head down, until it looks up at the lander. */
export function pasturePoseAt(i, t, config = TORNADO_CONFIG) {
    const P = config.cow.pasture[i];
    const up = smoothstep(config.cow.lookUpAt + i * 0.25, config.cow.lookUpAt + i * 0.25 + 0.6, t);
    const graze = -0.85 + 0.06 * Math.sin(t * 0.8 + i * 1.7);
    return {
        visible: true, x: P.x, y: 0, z: P.z, scale: 1,
        tumble: { pitch: 0, roll: 0, yaw: 0 }, upright: 1, yaw: P.yaw,
        splay: 0, dip: 0,
        headYaw: 0,
        headPitch: graze + (0.1 - graze) * up,
        chew: up < 1 ? Math.sin(t * 2.6 + i) : 0,
        tail: Math.sin(t * 1.3 + i * 2.1),
        ear: 0
    };
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

const lit = (color, roughness = 0.85, map = null) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, map });

/** Black patches on white, drawn once. Seeded, so it is the same cow. */
export function holsteinTexture(seed = 0xC0) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const random = makeRandom(seed);
    ctx.fillStyle = '#f2efe8';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#1c1b1a';
    for (let i = 0; i < 8; i++) {
        const cx = random() * 256;
        const cy = 20 + random() * 88;
        const r = 14 + random() * 22;
        // A patch is a clump of circles, so its edge is ragged, not round.
        for (let j = 0; j < 7; j++) {
            ctx.beginPath();
            ctx.arc(cx + (random() - 0.5) * r * 1.4, cy + (random() - 0.5) * r, r * (0.45 + random() * 0.4), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// THE PLAIN-COLORED PARTS ARE INSTANCED ACROSS THE HERD (M7, 2026-09-24).
// Each cow was 18 meshes, so the five were 90 draw calls, half the frame's.
// Every part but the two that wear the hide (the body and the head, whose
// patches are drawn per cow) has the same shape and the same color on every
// cow, so each of those nine kinds is one InstancedMesh for the whole herd,
// and the rig keeps an empty placeholder where the mesh was. The rig still
// takes every pose exactly as it did; the placeholders' world matrices are
// copied into the instances after each pose. 90 draw calls became 19, and the
// pixels are the same (proved against the old rig at every pose of the story).

/** Each kind of plain part: its shape and its color, built once. */
const KINDS = {
    udder: () => [new THREE.SphereGeometry(0.13, 12, 8), 'pink'],
    leg: () => [new THREE.CylinderGeometry(0.075, 0.06, 0.72, 8), 'white'],
    hoof: () => [new THREE.CylinderGeometry(0.075, 0.08, 0.08, 8), 'hoof'],
    skull: () => [new THREE.BoxGeometry(0.5, 0.28, 0.26), 'black'],
    blaze: () => [new THREE.BoxGeometry(0.34, 0.03, 0.08), 'white'],
    jaw: () => [new THREE.BoxGeometry(0.16, 0.18, 0.22), 'pink'],
    ear: () => [new THREE.BoxGeometry(0.1, 0.04, 0.14), 'black'],
    tail: () => [new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), 'white'],
    tailTip: () => [new THREE.SphereGeometry(0.05, 8, 6), 'black']
};

let parts = null;

/** The shared shapes and colors, built on first use. */
function partKinds() {
    if (parts) return parts;
    const colors = {
        black: lit(0x1c1b1a, 0.8),
        white: lit(0xf2efe8, 0.85),
        pink: lit(0xd9a3a0, 0.7),
        hoof: lit(0x2a2522, 0.6)
    };
    parts = {};
    for (const [kind, build] of Object.entries(KINDS)) {
        const [geometry, color] = build();
        parts[kind] = { geometry, material: colors[color] };
    }
    return parts;
}

/** A plain part: a placeholder the herd's instances follow when `holders`
 *  is given, or a mesh of its own when it is not (a cow built on its own). */
function plain(kind, x, y, z, holders) {
    let node;
    if (holders) {
        node = new THREE.Object3D();
        node.userData.kind = kind;
        holders.push(node);
    } else {
        const { geometry, material } = partKinds()[kind];
        node = new THREE.Mesh(geometry, material);
    }
    node.position.set(x, y, z);
    return node;
}

function part(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** Build one cow. Returns the rig applyCowPose drives. With
 *  `options.holders` (an array), its plain parts are placeholders pushed onto
 *  it, for the herd's instances to follow; without, they are meshes. */
export function createCow(options = {}) {
    const hide = lit(0xffffff, 0.9, holsteinTexture(options.seed));
    const holders = options.holders || null;

    const group = new THREE.Group();
    group.name = options.name || 'cow';

    const bodyGeo = new THREE.CapsuleGeometry(0.36, 1.25, 6, 14);
    bodyGeo.rotateZ(Math.PI / 2);
    bodyGeo.scale(1, 1, 0.86);
    const body = part(bodyGeo, hide, 0, 1.1, 0);
    group.add(body);
    group.add(plain('udder', -0.45, 0.72, 0, holders));

    // Legs hang from pivots at the hips and shoulders, so they can splay.
    const legs = [];
    for (const [x, z] of [[0.62, 0.2], [0.62, -0.2], [-0.62, 0.2], [-0.62, -0.2]]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.8, z);
        pivot.add(plain('leg', 0, -0.36, 0, holders));
        pivot.add(plain('hoof', 0, -0.76, 0, holders));
        pivot.userData.front = x > 0;
        pivot.userData.side = Math.sign(z);
        group.add(pivot);
        legs.push(pivot);
    }

    // The head on a neck pivot, angled down as a cow holds it.
    const head = new THREE.Group();
    head.position.set(0.9, 1.25, 0);
    head.add(part(new THREE.BoxGeometry(0.4, 0.32, 0.3), hide, 0.12, 0, 0));
    const skull = new THREE.Group();
    skull.position.set(0.32, -0.02, 0);
    skull.rotation.z = -0.5;
    skull.add(plain('skull', 0.2, 0, 0, holders));
    skull.add(plain('blaze', 0.22, 0.14, 0, holders));
    const jaw = new THREE.Group();
    jaw.position.set(0.45, -0.03, 0);
    jaw.add(plain('jaw', 0.03, 0, 0, holders));
    skull.add(jaw);
    const ears = [];
    for (const side of [1, -1]) {
        const ear = new THREE.Group();
        ear.position.set(0.04, 0.08, side * 0.14);
        ear.add(plain('ear', 0, 0, side * 0.06, holders));
        ear.userData.side = side;
        skull.add(ear);
        ears.push(ear);
    }
    head.add(skull);
    group.add(head);

    const tail = new THREE.Group();
    tail.position.set(-0.98, 1.3, 0);
    tail.add(plain('tail', 0, -0.35, 0, holders));
    tail.add(plain('tailTip', 0, -0.72, 0, holders));
    group.add(tail);

    return {
        group, body, head, jaw, ears, legs, tail,
        tumbleQ: new THREE.Quaternion(), uprightQ: new THREE.Quaternion(), euler: new THREE.Euler()
    };
}

/** Put the rig in a pose from cowPoseAt or pasturePoseAt. */
export function applyCowPose(rig, pose) {
    const g = rig.group;
    g.visible = pose.visible;
    if (!pose.visible) return;
    g.position.set(pose.x, pose.y - pose.dip, pose.z);
    g.scale.setScalar(pose.scale);
    rig.euler.set(pose.tumble.roll, pose.tumble.yaw, pose.tumble.pitch);
    rig.tumbleQ.setFromEuler(rig.euler);
    rig.euler.set(0, pose.yaw, 0);
    rig.uprightQ.setFromEuler(rig.euler);
    g.quaternion.copy(rig.tumbleQ).slerp(rig.uprightQ, pose.upright);

    for (const leg of rig.legs) {
        // Front legs reach forward, back legs back, all a little outward.
        leg.rotation.z = (leg.userData.front ? 0.9 : -0.9) * pose.splay;
        leg.rotation.x = leg.userData.side * 0.35 * pose.splay;
    }
    rig.head.rotation.y = pose.headYaw;
    rig.head.rotation.z = pose.headPitch;
    // A cow chews side to side.
    rig.jaw.position.z = 0.02 * pose.chew;
    rig.jaw.rotation.z = -0.12 * Math.abs(pose.chew);
    rig.tail.rotation.x = 0.3 * pose.tail;
    rig.tail.rotation.z = pose.tail > 0.8 && pose.splay > 0 ? -1.2 : 0;
    for (const ear of rig.ears) ear.rotation.x = ear.userData.side * 0.4 * pose.ear;
}

// ---------------------------------------------------------------------------
// The herd
// ---------------------------------------------------------------------------

let flyer = null;
const pasture = [];
// The herd's instanced parts: per kind, the InstancedMesh and, in instance
// order, each placeholder with the rig it belongs to.
let herd = [];
const HIDDEN = { matrix: null };

export function initCows(scene, config = TORNADO_CONFIG) {
    const holders = [];
    const slots = [];
    const collect = (rig) => {
        for (const node of holders.splice(0)) slots.push({ node, rig });
    };
    flyer = createCow({ name: 'cow', seed: 0xC0, holders });
    collect(flyer);
    scene.add(flyer.group);
    pasture.length = 0;
    config.cow.pasture.forEach((_, i) => {
        const rig = createCow({ name: `pasture-cow-${i}`, seed: 0xC1 + i, holders });
        collect(rig);
        scene.add(rig.group);
        pasture.push(rig);
    });
    herd = [];
    for (const [kind, { geometry, material }] of Object.entries(partKinds())) {
        const mine = slots.filter((s) => s.node.userData.kind === kind);
        const mesh = new THREE.InstancedMesh(geometry, material, mine.length);
        mesh.name = `cow-parts-${kind}`;
        // The instances move every frame and the bounds three computes once
        // would not follow them.
        mesh.frustumCulled = false;
        scene.add(mesh);
        herd.push({ mesh, slots: mine });
    }
    // A hidden cow's parts are scaled to nothing: no triangle of it rasterizes.
    HIDDEN.matrix = new THREE.Matrix4().makeScale(0, 0, 0);
}

/** Copy every placeholder's place into its instance, after the poses. */
function syncHerd() {
    for (const rig of [flyer, ...pasture]) if (rig.group.visible) rig.group.updateMatrixWorld(true);
    for (const { mesh, slots } of herd) {
        slots.forEach(({ node, rig }, i) => {
            mesh.setMatrixAt(i, rig.group.visible ? node.matrixWorld : HIDDEN.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    }
}

/** Pose every cow for story second t. `flies` is false on a run where the
 *  tornado carries something else (payloads.js): the herd is still there. */
export function updateCows(t, config = TORNADO_CONFIG, flies = true) {
    if (!flyer) return;
    applyCowPose(flyer, flies ? cowPoseAt(t, config) : cowPoseAt(-1, config));
    pasture.forEach((rig, i) => applyCowPose(rig, pasturePoseAt(i, t, config)));
    syncHerd();
}
