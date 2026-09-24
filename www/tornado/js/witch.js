// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * witch.js - a witch on a broomstick, once round the funnel (2026-09-24).
 *
 * A NOD TO THE MOST FAMOUS TORNADO IN FILM, AND ONLY A NOD. Steve asked for a
 * small witch to fly in, loop the funnel and fly off. A pointed hat, a cape and
 * a broom are the folk figure, which belongs to everyone; the film's own look
 * does not. So she is a dark silhouette with no face and no color, and nothing
 * on the page names a film, a character or a line from one
 * (tests/tornado-witch.test.mjs holds that).
 *
 * EVERY WATCH, EARLY: she swoops in from the left as the first tumbleweed
 * rolls (config.witch.enterAt), loops the funnel as it touches down, and is off
 * to the right before the cow rises, so the payoff keeps the stage.
 *
 * SIXTY METRES LONG, ON PURPOSE (Steve, 2026-09-24). The funnel is 1.8 km
 * out, where a witch of true size covers a pixel. The outline reads at about
 * forty pixels on a phone, which takes about sixty metres there, about the
 * width of the funnel's trunk. The cow is scaled up for the same reason.
 *
 * NOT ROUND THE VERY TOP, round the upper trunk. The top flares into the wall
 * cloud, which is as dark as she is (about 1.5 to 1). Lower down she is seen
 * against the white funnel and the gray sky (about 12 and 6 to 1).
 *
 * ONE MOTION. The flight is a straight run in, one full circle round the
 * funnel's axis, and a straight run out, joined where the circle's tangent
 * points the way she is already going, so her heading never jumps. Her speed
 * eases down into the circle and back up out of it and never stops (the
 * cow's lesson: a pause mid-air reads as a fault). The pose is a pure function
 * of story time, so a seek lands on the same witch an untouched watch has.
 *
 * HER AXES: +x is where she faces, y is up, and the broom's centre is at the
 * origin. The model is BODY_LENGTH long, bristles to broom tip.
 */
import { TORNADO_CONFIG } from './config.min.js';
import { funnelStateAt, spineAt } from './funnel.min.js';

/** Bristles to broom tip, in model units, before scaling to config.witch.length. */
export const BODY_LENGTH = 2.52;

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function smooth(x) { const k = clamp01(x); return k * k * (3 - 2 * k); }

/** The timeline and the speeds it implies, from config. */
export function witchPlan(config = TORNADO_CONFIG) {
    const W = config.witch;
    const inSeconds = W.loopAt - W.enterAt;
    const loopSpeed = (2 * Math.PI * W.radius) / W.loopSeconds;
    // The straight runs ease from `runSpeed` to the loop's speed (and back),
    // v(τ) = loop + (run - loop)(1 - τ)², which covers `lead` metres in
    // `inSeconds` when run = loop + 3 (lead / inSeconds - loop).
    const runSpeed = loopSpeed + 3 * (W.lead / inSeconds - loopSpeed);
    const loopEnd = W.loopAt + W.loopSeconds;
    return { inSeconds, loopSpeed, runSpeed, loopEnd, exitAt: loopEnd + inSeconds };
}

/** The point on the funnel's axis she circles: its spine at her height, at
 *  the middle of the loop, without the snaking (which is on the animation
 *  clock, and which the clearance test allows for). */
export function loopCenter(config = TORNADO_CONFIG) {
    const W = config.witch;
    const mid = W.loopAt + W.loopSeconds / 2;
    const s = funnelStateAt(mid, mid, config);
    const c = spineAt(Math.min(1, W.height / s.top), { ...s, snake: 0 });
    return { x: c.x, y: W.height, z: c.z };
}

/**
 * Where she is and which way she faces at story second t.
 * Returns { visible, x, y, z, forward: [x, y, z], up: [x, y, z], speed, phase }.
 * `forward` and `up` are unit vectors; `up` leans into the turn.
 */
export function witchPoseAt(t, config = TORNADO_CONFIG) {
    const W = config.witch;
    const P = witchPlan(config);
    if (t < W.enterAt || t > P.exitAt) return { visible: false, phase: 'away' };
    const C = loopCenter(config);
    const R = W.radius;
    // Where the run in meets the circle: its point nearest the camera, where
    // the circle's tangent points to the right, the way she is flying.
    const P0 = { x: C.x, y: C.y, z: C.z + R };

    if (t < W.loopAt) {
        const T = P.inSeconds;
        const tau = (t - W.enterAt) / T;
        const s = T * (P.loopSpeed * tau + (P.runSpeed - P.loopSpeed) * (1 - (1 - tau) ** 3) / 3);
        const k = 1 - s / W.lead;
        const speed = P.loopSpeed + (P.runSpeed - P.loopSpeed) * (1 - tau) ** 2;
        const dy = -2 * W.drop * k / W.lead;
        return pose(P0.x - W.lead + s, C.y + W.drop * k * k, P0.z, [1, dy, 0], [0, 1, 0], speed, 'in');
    }
    if (t <= P.loopEnd) {
        const phi = 2 * Math.PI * (t - W.loopAt) / W.loopSeconds;
        const x = C.x + R * Math.sin(phi);
        const z = C.z + R * Math.cos(phi);
        // Into the turn and out of it smoothly, not all at once where the
        // straight meets the circle.
        const ease = smooth(phi / 0.8) * smooth((2 * Math.PI - phi) / 0.8);
        const bank = W.bank * ease;
        const inward = [-Math.sin(phi), 0, -Math.cos(phi)];
        const up = [inward[0] * Math.sin(bank), Math.cos(bank), inward[2] * Math.sin(bank)];
        return pose(x, C.y, z, [Math.cos(phi), 0, -Math.sin(phi)], up, P.loopSpeed, 'loop');
    }
    const T = P.inSeconds;
    const tau = (t - P.loopEnd) / T;
    const s = T * (P.loopSpeed * tau + (P.runSpeed - P.loopSpeed) * tau ** 3 / 3);
    const k = s / W.lead;
    const speed = P.loopSpeed + (P.runSpeed - P.loopSpeed) * tau ** 2;
    return pose(P0.x + s, C.y + W.rise * k * k, P0.z, [1, 2 * W.rise * k / W.lead, 0], [0, 1, 0], speed, 'out');
}

function pose(x, y, z, forward, up, speed, phase) {
    const f = unit(forward);
    // Up, made square to the heading.
    const d = up[0] * f[0] + up[1] * f[1] + up[2] * f[2];
    const u = unit([up[0] - f[0] * d, up[1] - f[1] * d, up[2] - f[2] * d]);
    return { visible: true, x, y, z, forward: f, up: u, speed, phase };
}

function unit(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

/** Her seated figure, turned on a lathe: the skirt draped over the broom,
 *  waist, shoulders, head, the brim, and the tall pointed hat. */
const FIGURE = [
    [0, -0.3], [0.3, -0.3], [0.2, -0.05], [0.12, 0.15], [0.17, 0.4], [0.08, 0.52],
    [0.11, 0.6], [0.11, 0.68], [0.3, 0.7], [0.3, 0.73], [0.12, 0.76], [0.02, 1.2], [0, 1.22]
];
/** The broom, along its own axis: the bristles fanned at the back, the binding,
 *  and the handle out to its tip. */
const BROOM = [
    [0, -1.5], [0.24, -1.45], [0.1, -1.05], [0.035, -0.95], [0.03, -0.9], [0.03, 1.0], [0, 1.02]
];

let rig = null;
let scratch = null;

/** Build her. Dark, and lit like the rest of the props so she sits in the
 *  same haze: at 1.8 km she is an outline, not a costume. */
export function createWitch(config = TORNADO_CONFIG) {
    const W = config.witch;
    const dark = new THREE.MeshStandardMaterial({ color: W.color, roughness: 0.95, metalness: 0 });
    const cloth = new THREE.MeshStandardMaterial({
        color: W.color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide
    });
    const wood = new THREE.MeshStandardMaterial({ color: W.broomColor, roughness: 0.9, metalness: 0 });

    const group = new THREE.Group();
    group.name = 'witch';
    const body = new THREE.Group();
    body.scale.setScalar(W.length / BODY_LENGTH);
    group.add(body);

    const broomGeo = new THREE.LatheGeometry(BROOM.map(([r, y]) => new THREE.Vector2(r, y)), 10);
    broomGeo.rotateZ(-Math.PI / 2);          // its axis along +x
    const broom = new THREE.Mesh(broomGeo, wood);
    broom.name = 'witch-broom';
    body.add(broom);

    const figure = new THREE.Mesh(
        new THREE.LatheGeometry(FIGURE.map(([r, y]) => new THREE.Vector2(r, y)), 12), dark);
    figure.name = 'witch-figure';
    figure.position.set(-0.1, 0.05, 0);
    figure.rotation.z = -0.25;               // leaning into the flight
    body.add(figure);

    // One arm reaching forward to the handle.
    const from = new THREE.Vector3(-0.02, 0.42, 0);
    const to = new THREE.Vector3(0.42, 0.04, 0);
    const reach = to.clone().sub(from);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, reach.length(), 6), dark);
    arm.name = 'witch-arm';
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), reach.normalize());
    body.add(arm);

    // The cape, streaming back from the shoulders, hinged there to flutter.
    const capeGeo = new THREE.BufferGeometry();
    capeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0.08, -0.85, -0.3, 0.1, -0.7, 0.05, 0,
        0, 0, -0.08, -0.7, 0.05, 0, -0.85, -0.3, -0.1
    ], 3));
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeo, cloth);
    cape.name = 'witch-cape';
    const hinge = new THREE.Group();
    hinge.position.set(-0.05, 0.47, 0);
    hinge.add(cape);
    body.add(hinge);

    group.visible = false;
    return { group, hinge };
}

export function initWitch(scene, config = TORNADO_CONFIG) {
    rig = createWitch(config);
    scratch = {
        basis: new THREE.Matrix4(),
        f: new THREE.Vector3(),
        u: new THREE.Vector3(),
        r: new THREE.Vector3()
    };
    scene.add(rig.group);
    return rig.group;
}

/** Put her where she is at story second t. `motion` is 1, or less under
 *  reduced motion, which damps the cape. */
export function updateWitch(t, config = TORNADO_CONFIG, motion = 1) {
    if (!rig) return;
    const p = witchPoseAt(t, config);
    rig.group.visible = p.visible;
    if (!p.visible) return;
    rig.group.position.set(p.x, p.y, p.z);
    const { basis, f, u, r } = scratch;
    f.set(p.forward[0], p.forward[1], p.forward[2]);
    u.set(p.up[0], p.up[1], p.up[2]);
    r.crossVectors(f, u);
    basis.makeBasis(f, u, r);
    rig.group.quaternion.setFromRotationMatrix(basis);
    // The cape flaps on the story clock, harder the faster she goes.
    const W = config.witch;
    const pace = p.speed / witchPlan(config).loopSpeed;
    rig.hinge.rotation.z = motion * W.flap * Math.sin(t * W.flapRate) * Math.min(pace, 1.5) + 0.12;
}
