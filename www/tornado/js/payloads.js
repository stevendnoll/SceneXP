// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * payloads.js - what else the tornado picks up, for a replay.
 *
 * THE FIRST WATCH IS THE COW (cow.js), always: it is the headline and the
 * thing people describe when they share. Watch it again and the storm
 * carries something else: a plastic lawn flamingo, an outhouse, a
 * trampoline or a mailbox, each of them once in a shuffled order, and then
 * anything but the last one. Nothing is stored, so a fresh visit starts with
 * the cow again. See config.payloads.
 *
 * THE SAME FLIGHT, ANOTHER LANDING. Each rides the cow's orbit round the
 * funnel and is flung on the cow's clock, then flies its own last curve
 * (cow.js flightPosition) to a spot 20 to 45 m out, left of center, where it
 * reads in a glance. Unlike the cow it does not drift down: it arrives at a
 * run and thumps in, and then does its one thing (a twang, a creaking door,
 * a bounce, a flag).
 *
 * THE POSE IS PURE, as the cow's is: surprisePoseAt(name, t) answers from the
 * story clock alone, so a seek lands on the same frame an untouched watch
 * has. The three.js half builds the four rigs once, at load, and shows the
 * one this run drew.
 *
 * EACH RIG'S OWN AXES: its base stands on y = 0 at the origin, and its front
 * (the outhouse's door, the flamingo's and the mailbox's near side) faces +z,
 * which the landing turns toward the camera.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { flightPosition, sizeFloor } from './cow.min.js';

/** Every payload, the cow first. */
export const PAYLOADS = Object.freeze(['cow', 'flamingo', 'outhouse', 'trampoline', 'mailbox']);
/** The ones a replay can surprise a visitor with. */
export const SURPRISES = Object.freeze(PAYLOADS.slice(1));

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function smooth(x) { const k = clamp01(x); return k * k * (3 - 2 * k); }
function smoothstep(a, b, x) { return smooth((x - a) / (b - a)); }

/**
 * What this run carries, given what this visit has shown so far (oldest
 * first). The cow first; then each surprise once, in a random order; then
 * anything but the payload just shown.
 */
export function nextPayload(shown = [], random = Math.random) {
    if (shown.length === 0) return 'cow';
    let pool = SURPRISES.filter((name) => !shown.includes(name));
    if (pool.length === 0) pool = PAYLOADS.filter((name) => name !== shown[shown.length - 1]);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** The ending card's punch line for a payload. */
export function payloadLine(name, config = TORNADO_CONFIG) {
    const P = config.payloads[name];
    return P ? P.line : config.cow.line;
}

/** The heading that turns a payload's front (+z) to the camera, plus its own
 *  turn from config. */
export function landingHeading(name, config = TORNADO_CONFIG) {
    const L = config.payloads[name].landing;
    return Math.atan2(-L.x, -L.z) + L.yaw;
}

/** A damped twang, radians, `s` seconds after the landing. */
export function wobbleAt(s, wobble) {
    if (!wobble || s < 0) return 0;
    return wobble.amount * Math.exp(-s / wobble.decay) * Math.sin(wobble.rate * s);
}

/** A trampoline's height off the ground `s` seconds after it first lands:
 *  hop after hop, each `restitution` times as fast as the last, until one
 *  would be slower than `stop` m/s and it settles. */
export function bounceAt(s, bounce, g = 9.8) {
    if (s <= 0) return 0;
    let v = bounce.speed;
    let t = s;
    while (v >= bounce.stop) {
        const hop = 2 * v / g;
        if (t < hop) return v * t - 0.5 * g * t * t;
        t -= hop;
        v *= bounce.restitution;
    }
    return 0;
}

/** When a trampoline's bouncing is over, seconds after it lands. */
export function bounceSeconds(bounce, g = 9.8) {
    let v = bounce.speed;
    let total = 0;
    while (v >= bounce.stop) {
        total += 2 * v / g;
        v *= bounce.restitution;
    }
    return total;
}

/** Overshoots a little and comes back, 0 to 1. */
function backOut(x) {
    const k = clamp01(x) - 1;
    return 1 + k * k * (2.7 * k + 1.7);
}

/**
 * A surprise's whole pose at story second t:
 *   visible, x, y, z, scale
 *   tumble { pitch, roll, yaw } and upright (0 tumbling, 1 upright), which the
 *   rig blends between; yaw, the upright heading
 *   lean (radians, in the picture's plane, about its base)
 *   door (radians open), flag (0 down, 1 up)
 *   shadow (the contact shadow's opacity)
 */
export function surprisePoseAt(name, t, config = TORNADO_CONFIG) {
    const K = config.cow;
    const P = config.payloads[name];
    const heading = landingHeading(name, config);
    const rest = {
        visible: false, x: P.landing.x, y: 0, z: P.landing.z, scale: 1,
        tumble: { pitch: 0, roll: 0, yaw: 0 }, upright: 1, yaw: heading,
        lean: 0, door: 0, flag: 0, shadow: 0
    };
    if (t < K.pickupAt) return rest;
    const p = flightPosition(t, P, config);
    const air = t - K.pickupAt;
    const settle = t - K.landAt;
    const landed = settle >= 0;
    const w = K.tumbleRate;

    let tumble;
    let yaw = heading;
    if (name === 'trampoline') {
        // Flat, spinning like a flying disc, with a wobble. The spin runs on
        // after it lands and dies away, so it never stops dead.
        const flying = Math.min(t, K.landAt) - K.pickupAt;
        const coast = landed ? 0.4 * (1 - Math.exp(-settle / 0.4)) : 0;
        const spin = heading + P.spin * (flying + coast);
        tumble = { pitch: 0.35 * Math.sin(air * 1.7), roll: 0.35 * Math.cos(air * 1.3), yaw: spin };
        yaw = spin;
    } else if (name === 'outhouse') {
        // Heavy: slowly end over end.
        tumble = { pitch: 0.5 * w * air, roll: 0.3 * Math.sin(air * 1.3), yaw: 0.25 * w * air };
    } else {
        tumble = { pitch: w * air, roll: 0.7 * w * air + 1, yaw: 0.4 * w * air };
    }

    // Down on landing: spiked in, hopping, or bouncing.
    let y = p.y;
    if (landed) {
        if (P.sink) y = -P.sink * smooth(settle / 0.08);
        if (P.hop && settle < P.hop.seconds) y = P.hop.height * Math.sin(Math.PI * settle / P.hop.seconds);
        if (P.bounce) y = bounceAt(settle, P.bounce);
    }

    // The door and the flag bang about in the air, are shut by the landing,
    // and then do their one thing.
    const banging = 1 - smoothstep(K.landAt - 0.6, K.landAt, t);
    let door = 0;
    if (P.door) {
        const D = P.door;
        door = landed
            ? D.open * smooth((settle - D.opensAt) / D.seconds)
                + 0.08 * D.open * Math.sin(Math.PI * clamp01((settle - D.opensAt - D.seconds) / 0.5))
            : (0.5 + 0.5 * Math.sin(air * 6)) * banging;
    }
    let flag = 0;
    if (P.flag) {
        flag = landed
            ? (settle >= P.flag.upAt ? backOut((settle - P.flag.upAt) / P.flag.seconds) : 0)
            : (0.5 + 0.5 * Math.sin(air * 7)) * banging;
    }

    const S = config.payloads.shadow;
    return {
        visible: true,
        x: p.x,
        y,
        z: p.z,
        scale: sizeFloor(p, config, P.length),
        tumble,
        upright: smoothstep(K.landAt - K.uprightFrom, K.landAt - K.uprightBy, t),
        yaw,
        lean: wobbleAt(settle, P.wobble),
        door,
        flag,
        shadow: S.opacity * (1 - smoothstep(0, S.height, Math.max(0, y)))
    };
}

// ---------------------------------------------------------------------------
// The rigs
// ---------------------------------------------------------------------------

const lit = (color, roughness = 0.8, map = null, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, map });

function part(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
}

function canvas2d(width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
}

/** The outhouse door: weathered boards and the crescent moon. */
export function doorTexture() {
    const c = canvas2d(64, 128);
    if (!c) return null;
    const { canvas, ctx } = c;
    ctx.fillStyle = '#8c6b4b';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#6f5238';
    for (const x of [15, 31, 47]) ctx.fillRect(x, 0, 2, 128);
    // The crescent: a pale disc with a board-colored one over most of it.
    ctx.fillStyle = '#f0e2b4';
    ctx.beginPath();
    ctx.arc(32, 26, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c6b4b';
    ctx.beginPath();
    ctx.arc(38, 22, 10, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A plastic lawn flamingo on two wire legs, about 0.9 m tall. */
export function createFlamingo() {
    const group = new THREE.Group();
    group.name = 'payload-flamingo';
    const pink = lit(0xf2609e, 0.45);
    const wire = lit(0x3b3b3e, 0.5, null, 0.6);
    const black = lit(0x1b1a1a, 0.6);
    const bodyGeo = new THREE.SphereGeometry(1, 14, 10);
    bodyGeo.scale(0.2, 0.12, 0.1);
    group.add(part(bodyGeo, pink, 0, 0.6, 0));
    const tail = new THREE.ConeGeometry(0.06, 0.16, 8);
    tail.rotateZ(Math.PI / 2 - 0.4);
    group.add(part(tail, pink, -0.22, 0.66, 0));
    // The S of the neck, rising from the breast to the head.
    const neck = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.14, 0.64, 0),
        new THREE.Vector3(0.24, 0.72, 0),
        new THREE.Vector3(0.16, 0.8, 0),
        new THREE.Vector3(0.1, 0.88, 0),
        new THREE.Vector3(0.16, 0.95, 0)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 12, 0.028, 6, false), pink));
    group.add(part(new THREE.SphereGeometry(0.05, 10, 8), pink, 0.17, 0.96, 0));
    const beak = new THREE.ConeGeometry(0.02, 0.1, 6);
    beak.rotateZ(-(Math.PI / 2 + 0.9));
    group.add(part(beak, black, 0.22, 0.93, 0));
    // The legs go on below the ground: they are its stake.
    const legGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.72, 5);
    for (const z of [0.035, -0.035]) group.add(part(legGeo, wire, 0.01, 0.2, z));
    return { group };
}

/** A wooden outhouse, about 2.3 m tall, door at the front (+z). */
export function createOuthouse() {
    const group = new THREE.Group();
    group.name = 'payload-outhouse';
    const wood = lit(0x8c6b4b, 0.9);
    const roof = lit(0x5b4533, 0.85);
    const dark = lit(0x16110d, 1);
    const plank = lit(0x4b3a2b, 0.9);
    group.add(part(new THREE.BoxGeometry(1.2, 2.05, 1.2), wood, 0, 1.025, 0));
    const lid = part(new THREE.BoxGeometry(1.45, 0.1, 1.5), roof, 0, 2.15, 0);
    lid.rotation.x = -0.18;
    group.add(lid);
    // The inside, which is all anyone sees through the open door: dark, and
    // the bench seat. Nobody.
    group.add(part(new THREE.BoxGeometry(0.8, 1.75, 0.01), dark, 0, 0.9, 0.605));
    group.add(part(new THREE.BoxGeometry(0.8, 0.1, 0.01), plank, 0, 0.5, 0.612));
    // The door on a hinge at its left edge, swinging out toward the camera.
    const door = new THREE.Group();
    door.position.set(-0.4, 0.9, 0.64);
    const boards = doorTexture();
    door.add(part(new THREE.BoxGeometry(0.8, 1.75, 0.04), lit(boards ? 0xffffff : 0x8c6b4b, 0.9, boards), 0.4, 0, 0));
    group.add(door);
    return { group, door };
}

/** A backyard trampoline, 3.7 m across: black mat, blue pad, six legs. */
export function createTrampoline() {
    const group = new THREE.Group();
    group.name = 'payload-trampoline';
    const mat = lit(0x19191b, 0.9);
    const pad = lit(0x2f6fd0, 0.6);
    const steel = lit(0x8d939a, 0.4, null, 0.6);
    group.add(part(new THREE.CylinderGeometry(1.6, 1.6, 0.03, 32), mat, 0, 0.9, 0));
    const ring = new THREE.TorusGeometry(1.72, 0.13, 8, 40);
    ring.rotateX(Math.PI / 2);
    group.add(part(ring, pad, 0, 0.92, 0));
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        group.add(part(legGeo, steel, Math.cos(a) * 1.72, 0.45, Math.sin(a) * 1.72));
    }
    return { group };
}

/** A rural mailbox on its post, flag on the near side (+z). */
export function createMailbox() {
    const group = new THREE.Group();
    group.name = 'payload-mailbox';
    const post = lit(0x7a5a3c, 0.9);
    const tin = lit(0xb9bfc5, 0.35, null, 0.5);
    const red = lit(0xd62b2b, 0.5);
    // The post runs on below the ground: it is spiked in.
    group.add(part(new THREE.BoxGeometry(0.1, 1.25, 0.1), post, 0, 0.4, 0));
    group.add(part(new THREE.BoxGeometry(0.52, 0.14, 0.2), tin, 0.05, 1.1, 0));
    const top = new THREE.CylinderGeometry(0.1, 0.1, 0.52, 14, 1, false, 0, Math.PI);
    // The half-round lid, along the box.
    top.rotateZ(Math.PI / 2);
    group.add(part(top, tin, 0.05, 1.17, 0));
    // The flag's arm pivots on the side: along the box when down, straight
    // up when it is raised.
    const flag = new THREE.Group();
    flag.position.set(-0.1, 1.1, 0.11);
    flag.add(part(new THREE.BoxGeometry(0.025, 0.24, 0.012), red, 0, 0.12, 0));
    flag.add(part(new THREE.BoxGeometry(0.1, 0.07, 0.012), red, 0.05, 0.2, 0));
    group.add(flag);
    return { group, flag };
}

const BUILDERS = {
    flamingo: createFlamingo,
    outhouse: createOuthouse,
    trampoline: createTrampoline,
    mailbox: createMailbox
};

/** A soft dark disc on the ground, drawn once. */
function shadowTexture() {
    const c = canvas2d(64, 64);
    if (!c) return null;
    const { canvas, ctx } = c;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

/** Put a rig in a pose from surprisePoseAt. */
export function applySurprisePose(rig, pose) {
    const g = rig.group;
    g.visible = pose.visible;
    if (!pose.visible) return;
    g.position.set(pose.x, pose.y, pose.z);
    g.scale.setScalar(pose.scale);
    rig.euler.set(pose.tumble.roll, pose.tumble.yaw, pose.tumble.pitch);
    rig.tumbleQ.setFromEuler(rig.euler);
    rig.euler.set(0, pose.yaw, 0);
    rig.uprightQ.setFromEuler(rig.euler);
    rig.euler.set(0, 0, pose.lean);
    rig.leanQ.setFromEuler(rig.euler);
    g.quaternion.copy(rig.tumbleQ).slerp(rig.uprightQ, pose.upright).multiply(rig.leanQ);
    if (rig.door) rig.door.rotation.y = -pose.door;
    // Down is along the box, toward its back; up is straight up.
    if (rig.flag) rig.flag.rotation.z = (Math.PI / 2) * (1 - pose.flag);
}

const rigs = {};
let shadow = null;

export function initPayloads(scene, config = TORNADO_CONFIG) {
    for (const name of SURPRISES) {
        const rig = BUILDERS[name]();
        Object.assign(rig, {
            tumbleQ: new THREE.Quaternion(), uprightQ: new THREE.Quaternion(),
            leanQ: new THREE.Quaternion(), euler: new THREE.Euler()
        });
        rig.group.visible = false;
        scene.add(rig.group);
        rigs[name] = rig;
    }
    shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({
        color: 0x000000, map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false
    }));
    shadow.name = 'payload-shadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    scene.add(shadow);
    return rigs;
}

/** Pose this run's surprise for story second t, and hide the others. On the
 *  cow's runs every one of them is hidden. */
export function updatePayloads(t, name, config = TORNADO_CONFIG) {
    for (const key of SURPRISES) {
        const rig = rigs[key];
        if (!rig) continue;
        if (key !== name) {
            rig.group.visible = false;
            continue;
        }
        const pose = surprisePoseAt(key, t, config);
        applySurprisePose(rig, pose);
        if (shadow) {
            const P = config.payloads[key];
            shadow.visible = pose.visible && pose.shadow > 0.001;
            shadow.material.opacity = pose.shadow;
            shadow.position.set(pose.x, 0.04, pose.z);
            shadow.scale.setScalar(0.55 * P.length);
        }
    }
    if (shadow && !SURPRISES.includes(name)) shadow.visible = false;
}
