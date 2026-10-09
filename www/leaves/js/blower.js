// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * blower.js - the person with the leaf blower: where they walk, which way
 * they face, and what they look like doing it.
 *
 * TWO WAYS TO STEER, ONE PERSON. A pointer (a mouse, or a finger held on the
 * lawn) names a spot, and the person walks toward it, stopping `standoff`
 * meters short, and points the blower at it. That reads as "blow the leaves
 * over there", which is all a visitor has to know. The keyboard walks them
 * directly (WASD or the arrow keys, relative to the screen), and the blower
 * points the way they walk.
 *
 * stepOperator() is pure, so the walking is tested without a browser. The
 * figure is the shared person rig with a blower in the right hand.
 */
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { PIVOT } from './finale.min.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/** A person at `start`, facing the house (-z). */
export function createOperator(B) {
    // pitch, lift and hideBlower are the finale's (finale.js): the body tipped
    // forward about the hips, raised or lowered, and the blower set aside.
    return { x: B.start.x, z: B.start.z, heading: Math.PI, speed: 0, stride: 0, pitch: 0, roll: 0, lift: 0, hideBlower: false };
}

/** The unit direction a heading faces: 0 is +z, PI / 2 is +x. */
export function facing(heading) {
    return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * One frame of walking. `aim` is one of:
 *   { mode: 'point', x, z }       walk toward a spot and point at it
 *   { mode: 'keys', x, z }        walk along (x, z), a vector of length 0 to 1
 *   { mode: 'face', x, z }        turn to face (x, z) where they stand (a
 *                                 light push on the touch stick, stick.js)
 *   null                          stand still
 * `area` is the rectangle the person can walk in, and `boxes` the solid
 * things in it (the trees' trunks, M5), which they walk round. Mutates and
 * returns `op`.
 */
export function stepOperator(op, aim, dt, B, area, boxes = []) {
    let want = op.heading;
    let vx = 0;
    let vz = 0;
    if (aim && aim.mode === 'point') {
        const dx = aim.x - op.x;
        const dz = aim.z - op.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) want = Math.atan2(dx, dz);
        const gap = dist - B.standoff;
        if (gap > 0.15) {
            const speed = Math.min(B.walkSpeed, gap * 3);
            vx = (dx / dist) * speed;
            vz = (dz / dist) * speed;
        }
    } else if (aim && aim.mode === 'face') {
        if (Math.hypot(aim.x, aim.z) > 0.01) want = Math.atan2(aim.x, aim.z);
    } else if (aim && aim.mode === 'keys') {
        const len = Math.hypot(aim.x, aim.z);
        if (len > 0.01) {
            want = Math.atan2(aim.x, aim.z);
            const k = Math.min(1, len) * B.walkSpeed / len;
            vx = aim.x * k;
            vz = aim.z * k;
        }
    }
    const turn = wrap(want - op.heading);
    const step = B.turnRate * dt;
    op.heading = wrap(op.heading + clamp(turn, -step, step));
    let nx = clamp(op.x + vx * dt, area.minX, area.maxX);
    let nz = clamp(op.z + vz * dt, area.minZ, area.maxZ);
    // Out of any box, by the shortest way, a body's width clear of it.
    const r = 0.3;
    for (const b of boxes) {
        if (nx <= b.minX - r || nx >= b.maxX + r || nz <= b.minZ - r || nz >= b.maxZ + r) continue;
        const out = [
            [b.minX - r - nx, 0], [b.maxX + r - nx, 0], [0, b.minZ - r - nz], [0, b.maxZ + r - nz]
        ].sort((p, q) => Math.hypot(...p) - Math.hypot(...q))[0];
        nx += out[0];
        nz += out[1];
    }
    op.speed = dt > 0 ? Math.hypot(nx - op.x, nz - op.z) / dt : 0;
    op.x = nx;
    op.z = nz;
    op.stride += op.speed * dt;
    return op;
}

// THE ARM POSES, found by measuring hand positions with the real three.js
// (2026-10-06), since a pose on the shared rig that looks right in numbers
// can put a hand inside the chest. Angles are for the arm on side `s`
// (+1 the figure's left, -1 its right; the figure faces +z).
//   carry   the right hand down at the blower's handle (the left hangs)
//   folded  both hands crossed in front of the chest, at 1.08 m
//   wave    the right hand up beside the head, at 1.71 m, swinging
//   up      both arms straight overhead, hands at 1.87 m (the dive, M3)
//   back    the right hand on the small of the back, 0.92 m up and 17 cm
//           behind (the flop, M3)
//   down    both arms hanging (no blower)
export const ARM_POSES = Object.freeze({
    carry: { right: { arm: [-0.55, 0, -0.25], fore: -0.45 }, left: null },
    folded: { arm: [-0.6, -1.6], fore: -1.5 },
    wave: { right: { arm: [0, 0, -2], fore: [0, 0, -1.2] }, swing: 0.5 },
    up: { arm: [-3.08, 0, -0.04] },
    back: { right: { arm: [0.94, 0.95, -0.15], fore: -1.25 } }
});

/**
 * A person holding a leaf blower whose nozzle tip sits where the jet starts
 * (B.reach ahead, B.height up, B.side to the right). Returns { group,
 * update(op, blowing, time, arms, big) }: `arms` is a pose from ARM_POSES
 * ('carry' when absent), and `big` swaps in the big blower (a backpack
 * model). Away from 'carry' the blower is set down on the grass beside them.
 * `op.pitch` tips the whole body forward about the hips, `op.roll` turns a
 * lying body about its length, `op.lift` raises it, and `op.hideBlower`
 * puts the blower away (the finale's dive).
 *
 * `options` dresses them: { person } for createPerson, { blower, bigBlower }
 * for the blowers' colors. The visitor's defaults are a flannel shirt and
 * jeans with an orange blower.
 */
export function createOperatorFigure(B, look, options = {}) {
    const group = new THREE.Group();
    group.name = options.name || 'operator';
    // The body tips about the hips: a pivot `PIVOT` up, holding everything
    // else lowered by as much, so with no tip the figure stands as before.
    // And a lying body rolls about its own length: the roll joint, at the
    // hips, outside the tip, so it turns the body that the tip laid down.
    const roller = new THREE.Group();
    roller.position.y = PIVOT;
    group.add(roller);
    const tilt = new THREE.Group();
    roller.add(tilt);
    const holder = new THREE.Group();
    holder.position.y = -PIVOT;
    tilt.add(holder);
    const person = createPerson({
        role: 'operator',
        shirtColor: 0x9c2b25,
        pantsColor: 0x34495e,
        skinTone: 0xe0ac86,
        hairColor: 0x3b2a1e,
        shoulderRound: 0.4,
        sleeveColor: 0x9c2b25,
        ...(options.person || {})
    });
    holder.add(person);

    const arms = [];
    const legs = [];
    person.traverse((o) => {
        if (o.userData && o.userData.isArm) arms.push(o);
        if (o.userData && o.userData.isLeg) legs.push(o);
    });
    const rest = arms.map((a) => ({ arm: a.rotation.clone(), fore: a.userData.forearm ? a.userData.forearm.rotation.clone() : null }));

    // The blower, in the figure's own frame: a body at the right hip and a
    // tube down to the nozzle. The big one is a backpack with a longer tube.
    const carried = new THREE.Group();
    holder.add(carried);
    const tubeTo = new THREE.Vector3(-B.side, B.height, B.reach);
    function blowerModel(color, backpack) {
        const model = new THREE.Group();
        const body = new THREE.Mesh(
            backpack ? new THREE.BoxGeometry(0.34, 0.46, 0.24) : new THREE.BoxGeometry(0.2, 0.26, 0.36),
            new THREE.MeshLambertMaterial({ color }));
        body.position.set(backpack ? 0 : -0.3, backpack ? 1.15 : 0.72, backpack ? -0.24 : 0.22);
        body.castShadow = true;
        model.add(body);
        const from = backpack ? new THREE.Vector3(-0.22, 0.95, 0.05) : new THREE.Vector3(-0.28, 0.66, 0.4);
        const span = tubeTo.clone().sub(from);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(backpack ? 0.045 : 0.035, backpack ? 0.06 : 0.045, span.length(), 10),
            new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
        tube.position.copy(from).addScaledVector(span, 0.5);
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
        tube.castShadow = true;
        model.add(tube);
        model.userData.tube = tube;
        return model;
    }
    const small = blowerModel(options.blower ?? look.blower, false);
    const bigOne = blowerModel(options.bigBlower ?? look.blower, true);
    bigOne.visible = false;
    carried.add(small, bigOne);

    const base = legs.map((l) => l.rotation.x);
    let shown = '';
    function pose(name, time) {
        arms.forEach((a, k) => {
            a.rotation.copy(rest[k].arm);
            if (rest[k].fore) a.userData.forearm.rotation.copy(rest[k].fore);
        });
        const right = arms.find((a) => a.userData.armSide === -1);
        if (name === 'folded') {
            const P = ARM_POSES.folded;
            arms.forEach((a) => {
                const s = a.userData.armSide;
                a.rotation.set(P.arm[0], s * P.arm[1], s * 0.15);
                if (a.userData.forearm) a.userData.forearm.rotation.set(P.fore, 0, 0);
            });
        } else if (name === 'wave' && right) {
            const P = ARM_POSES.wave;
            right.rotation.set(...P.right.arm);
            if (right.userData.forearm) {
                right.userData.forearm.rotation.set(P.right.fore[0], P.right.fore[1],
                    P.right.fore[2] + P.swing * 0.5 * (1 + Math.sin(time * 7)));
            }
        } else if (name === 'up') {
            const P = ARM_POSES.up;
            arms.forEach((a) => {
                const s = a.userData.armSide;
                a.rotation.set(P.arm[0], P.arm[1], s * P.arm[2]);
            });
        } else if (name === 'back' && right) {
            const P = ARM_POSES.back.right;
            right.rotation.set(...P.arm);
            if (right.userData.forearm) right.userData.forearm.rotation.x = P.fore;
        } else if (name === 'carry' && right) {
            const P = ARM_POSES.carry.right;
            right.rotation.set(...P.arm);
            if (right.userData.forearm) right.userData.forearm.rotation.x = P.fore;
        }
    }

    function update(op, blowing, time, armsName = 'carry', big = false) {
        group.position.set(op.x, op.lift || 0, op.z);
        group.rotation.y = op.heading;
        tilt.rotation.x = op.pitch || 0;
        roller.rotation.z = op.roll || 0;
        carried.visible = !op.hideBlower;
        // A walk: legs swing with the distance walked, and settle when still.
        const swing = Math.min(1, op.speed / 1.2) * 0.5 * Math.sin(op.stride * 4.2);
        legs.forEach((l, i) => { l.rotation.x = base[i] + (l.userData.legSide === 1 ? swing : -swing); });
        // Arms: a pose is set when it changes, and every frame while waving.
        if (armsName !== shown || armsName === 'wave') {
            pose(armsName, time);
            shown = armsName;
        }
        small.visible = !big;
        bigOne.visible = big;
        // Carried, the blower trembles while it runs. Otherwise it is set down
        // on the grass to their right.
        const carrying = armsName === 'carry';
        small.userData.tube.visible = carrying;
        bigOne.userData.tube.visible = carrying;
        if (carrying) {
            carried.position.set(0, blowing ? 0.006 * Math.sin(time * 90) : 0, 0);
            carried.rotation.set(0, 0, 0);
        } else {
            // On the grass: the body only, since the tube would reach into
            // the ground. The backpack sits lower than it rides.
            carried.position.set(-0.45, big ? -1.0 : -0.62, big ? 0.35 : 0.1);
            carried.rotation.set(0, 0.4, 0);
        }
    }
    return { group, update };
}
