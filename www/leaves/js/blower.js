// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * blower.js - the person with the leaf blower: where they walk, which way
 * they face, and what they look like doing it.
 *
 * TWO WAYS TO STEER, ONE PERSON. A pointer (a mouse, or a finger held on the
 * lawn) names a spot, and the person walks toward it, stopping `standoff`
 * meters short (less with the camera in close, standoffFor), and points the
 * blower at it. That reads as "blow the leaves
 * over there", which is all a visitor has to know. The keyboard walks them
 * directly (WASD or the arrow keys, relative to the screen), and the blower
 * points the way they walk.
 *
 * stepOperator() is pure, so the walking is tested without a browser. The
 * figure is the shared person rig with a blower in the right hand.
 */
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { closeHand, gripPoint } from '../../shared/js/hands-1.0.0.min.js';
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
/** How far short of a pointed spot the person stops, with the camera
 *  `distance` meters away: `standoff` in the usual view, and in close a
 *  share of the distance, so a walk starts within the lawn on screen. */
export function standoffFor(B, distance) {
    if (!Number.isFinite(distance) || !B.standoffScale) return B.standoff;
    return clamp(distance * B.standoffScale, B.minStandoff ?? 0, B.standoff);
}

export function stepOperator(op, aim, dt, B, area, boxes = []) {
    let want = op.heading;
    let vx = 0;
    let vz = 0;
    if (aim && aim.mode === 'point') {
        const dx = aim.x - op.x;
        const dz = aim.z - op.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) want = Math.atan2(dx, dz);
        const gap = dist - (aim.standoff ?? B.standoff);
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
//   carry   the right arm hanging straight and a little out from the side,
//           the hand turned palm in (`twist`) and closed into a fist round
//           the blower's handle, the knuckles' line front to back within 3
//           degrees of level (re-solved 2026-10-28 on the real rig, Steve:
//           the hand hovered over the blower; the fist lands at hip height,
//           0.70 m up, and the blower's body hangs under it 5 cm or more
//           clear of the thigh on every build). The left hangs.
//   folded  both hands crossed in front of the chest, at 1.08 m
//   wave    the right hand up beside the head, at 1.71 m, swinging
//   up      both arms straight overhead, hands at 1.87 m (the dive, M3)
//   back    the right hand on the small of the back, 0.92 m up and 17 cm
//           behind (the flop, M3)
//   down    both arms hanging (no blower)
export const ARM_POSES = Object.freeze({
    carry: { right: { arm: [-0.1, 0, -0.25], fore: 0, twist: Math.PI / 2 }, left: null },
    folded: { arm: [-0.6, -1.6], fore: -1.5 },
    wave: { right: { arm: [0, 0, -2], fore: [0, 0, -1.2] }, swing: 0.5 },
    up: { arm: [-3.08, 0, -0.04] },
    back: { right: { arm: [0.94, 0.95, -0.15], fore: -1.25 } }
});

/**
 * The small blower's handle (Steve, 2026-10-28: "a little round handle" on
 * top, which the hand holds): an arch `radius` meters across the bar's line,
 * of `thick` tube, standing on the body, its top the bar the fist closes
 * round. The body (`body`: across, tall, long) hangs under it; the hose is
 * `hose` meters thick.
 */
export const HANDHELD = Object.freeze({ radius: 0.075, thick: 0.016, body: Object.freeze([0.2, 0.26, 0.36]), hose: Object.freeze([0.035, 0.045]), handle: 0x2b2b2b });

/**
 * A person holding a leaf blower whose nozzle tip sits where the jet starts
 * (B.reach ahead, B.height up, B.side to the right). THE BLOWER IS HUNG FROM
 * THE HAND (2026-10-28): the carrying pose is set once, the fist's grip
 * (hands-1.0.0 `gripPoint`) measured where it lands on this body, and the
 * handle built round it, so every build and hand size holds it; only the
 * hose bends to meet the nozzle, which never moves. Returns { group,
 * update(op, blowing, time, arms, big) }: `arms` is a pose from ARM_POSES
 * ('carry' when absent), and `big` swaps in the big blower (a backpack
 * model). Away from 'carry' the blower is set down on the grass beside them.
 * `op.pitch` tips the whole body forward about the hips, `op.roll` turns a
 * lying body about its length, `op.lift` raises it, and `op.hideBlower`
 * puts the blower away (the finale's dive).
 *
 * `options` dresses them: { person } for createPerson, or a figure already
 * built on the shared rig (the visitor's avatar, avatar-figure's
 * `createAvatar(...).person`, M6 2026-10-26), { blower, bigBlower } for the
 * blowers' colors, and { hand } 'right' (as written) or 'left' (the avatar's
 * handedness, Steve 2026-10-26): the blower in the other hand, every
 * one-armed pose and the blower's pieces mirrored across the body. The jet
 * the simulation blows must agree: see main.js `jetBlower`. The visitor's
 * defaults are a flannel shirt and jeans with an orange blower.
 */
export function createOperatorFigure(B, look, options = {}) {
    const group = new THREE.Group();
    group.name = options.name || 'operator';
    // The mirror: 1 keeps every x and every sideways angle as written (the
    // right hand), -1 flips them (the left). The carrying arm's side is the
    // rig's: -1 is the figure's right.
    const h = options.hand === 'left' ? -1 : 1;
    const carrySide = -h;
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
    const person = options.person && options.person.isObject3D ? options.person : createPerson({
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
    // The carrying hand (the rig tags it), its own turn kept to give back,
    // and the fist it closes into while it carries (hands-1.0.0).
    const carryArm = arms.find((a) => a.userData.armSide === carrySide);
    let carryHand = null;
    if (carryArm) carryArm.traverse((o) => { if (!carryHand && o.userData && o.userData.isHand) carryHand = o; });
    const handTurn = carryHand ? carryHand.rotation.y : 0;
    let fist = null;
    // How much further out than the pose the carrying arm swings on this
    // body (radians), so the blower's body clears its legs and a skirt's
    // hem (solved below).
    let carryOut = 0;

    // The blower, in the figure's own frame, built round the fist's grip
    // (measured below, once the carrying pose is set): the body under its
    // handle and a hose out to the nozzle. The big one is a backpack whose
    // hose runs down to a sleeve in the fist and on to the nozzle.
    const carried = new THREE.Group();
    holder.add(carried);
    const tubeTo = new THREE.Vector3(-B.side * h, B.height, B.reach);
    const dark = new THREE.MeshLambertMaterial({ color: HANDHELD.handle });
    /** A hose of radii `r0` to `r1` from `from` to `to`, named. */
    const hose = (from, to, r0, r1, name) => {
        const span = to.clone().sub(from);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, span.length(), 10), dark);
        tube.position.copy(from).addScaledVector(span, 0.5);
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
        tube.castShadow = true;
        tube.name = name;
        return tube;
    };
    function blowerModel(color, backpack, grip) {
        const model = new THREE.Group();
        const tubes = [];
        const H = HANDHELD;
        if (!backpack) {
            // The handle: an arch over the body along its length, its top
            // the bar in the fist.
            const handle = new THREE.Mesh(new THREE.TorusGeometry(H.radius, H.thick, 8, 18, Math.PI), dark);
            handle.name = 'handle';
            handle.rotation.y = Math.PI / 2;
            handle.position.set(grip.x, grip.y - H.radius, grip.z);
            handle.castShadow = true;
            model.add(handle);
        }
        const [bw, bh, bl] = H.body;
        const body = new THREE.Mesh(
            backpack ? new THREE.BoxGeometry(0.34, 0.46, 0.24) : new THREE.BoxGeometry(bw, bh, bl),
            new THREE.MeshLambertMaterial({ color }));
        body.name = 'body';
        // The handheld's top a little into the handle's feet.
        if (backpack) body.position.set(0, 1.15, -0.24);
        else body.position.set(grip.x, grip.y - H.radius - bh / 2 + 0.004, grip.z);
        body.castShadow = true;
        model.add(body);
        if (backpack) {
            // As a backpack blower is built: a flexible hose from the
            // bottom of the pack, down behind the arm, to the back of a
            // rigid tube the fist holds (so the hose never runs down the
            // arm), and the tube on from the fist to the nozzle.
            const sleeveBack = grip.clone().add(new THREE.Vector3(0, 0, -0.2));
            const sleeveFront = grip.clone().add(new THREE.Vector3(0, 0, 0.07));
            tubes.push(hose(new THREE.Vector3(-0.15 * h, 0.94, -0.24), sleeveBack, 0.04, 0.04, 'hose'));
            tubes.push(hose(sleeveBack, sleeveFront, 0.045, 0.045, 'sleeve'));
            tubes.push(hose(sleeveFront, tubeTo, 0.045, 0.06, 'tube'));
        } else {
            tubes.push(hose(new THREE.Vector3(grip.x, body.position.y - 0.04, body.position.z + bl / 2 - 0.02), tubeTo, H.hose[0], H.hose[1], 'tube'));
        }
        for (const t of tubes) model.add(t);
        model.userData.tubes = tubes;
        model.userData.body = body;
        return model;
    }
    const base = legs.map((l) => l.rotation.x);
    let shown = '';
    function pose(name, time) {
        arms.forEach((a, k) => {
            a.rotation.copy(rest[k].arm);
            if (rest[k].fore) a.userData.forearm.rotation.copy(rest[k].fore);
        });
        // The carrying hand is a fist round the handle only while it
        // carries, and the rig's own open hand for everything else.
        if (carryHand) {
            const carrying = name === 'carry';
            if (carrying && !fist) fist = closeHand(carryHand);
            if (!carrying && fist) {
                fist.open();
                fist = null;
            }
            carryHand.rotation.y = carrying ? carrySide * ARM_POSES.carry.right.twist : handTurn;
        }
        // The one-armed poses are written for the right arm; on the left
        // they are mirrored: the lift as written, the sideways angles flipped.
        const right = arms.find((a) => a.userData.armSide === carrySide);
        if (name === 'folded') {
            const P = ARM_POSES.folded;
            arms.forEach((a) => {
                const s = a.userData.armSide;
                a.rotation.set(P.arm[0], s * P.arm[1], s * 0.15);
                if (a.userData.forearm) a.userData.forearm.rotation.set(P.fore, 0, 0);
            });
        } else if (name === 'wave' && right) {
            const P = ARM_POSES.wave;
            right.rotation.set(P.right.arm[0], P.right.arm[1] * h, P.right.arm[2] * h);
            if (right.userData.forearm) {
                right.userData.forearm.rotation.set(P.right.fore[0], P.right.fore[1] * h,
                    (P.right.fore[2] + P.swing * 0.5 * (1 + Math.sin(time * 7))) * h);
            }
        } else if (name === 'up') {
            const P = ARM_POSES.up;
            arms.forEach((a) => {
                const s = a.userData.armSide;
                a.rotation.set(P.arm[0], P.arm[1], s * P.arm[2]);
            });
        } else if (name === 'back' && right) {
            const P = ARM_POSES.back.right;
            right.rotation.set(P.arm[0], P.arm[1] * h, P.arm[2] * h);
            if (right.userData.forearm) right.userData.forearm.rotation.x = P.fore;
        } else if (name === 'carry' && right) {
            const P = ARM_POSES.carry.right;
            right.rotation.set(P.arm[0], P.arm[1] * h, (P.arm[2] - carryOut) * h);
            if (right.userData.forearm) right.userData.forearm.rotation.x = P.fore;
        }
    }

    // Where the fist closes on this body: the carrying pose set, the grip
    // measured in the figure's own frame (the hand found by the rig's tag),
    // or the old hip spot for a figure with no hand to find.
    const measureGrip = () => {
        pose('carry', 0);
        group.updateMatrixWorld(true);
        return fist
            ? holder.worldToLocal(gripPoint(fist.unit).applyMatrix4(carryHand.matrixWorld))
            : new THREE.Vector3(-0.3 * h, 0.7, 0.05);
    };
    // THE ARM SWINGS OUT AS FAR AS THIS BODY NEEDS (2026-10-28): the
    // blower's body, hung under the fist, must clear the legs and a
    // skirt's hem, which flares out as wide as the blower hangs. Measured
    // on the drawn legs and skirt (their boxes, at the body's heights), in
    // small steps, from the solved pose, which every pair of trousers
    // already clears.
    const [bodyW, bodyH] = HANDHELD.body;
    const outward = (box) => (carrySide < 0 ? -box.min.x : box.max.x);
    const obstacles = [];
    person.traverse((o) => {
        if (!o.isMesh) return;
        for (let p = o; p && p !== person; p = p.parent) {
            if (p.userData && (p.userData.isLeg || p.userData.isSkirt)) {
                obstacles.push(o);
                return;
            }
        }
    });
    let grip = measureGrip();
    for (let k = 0; k < 16 && fist; k++) {
        const top = grip.y - HANDHELD.radius;
        let reach = 0;
        for (const o of obstacles) {
            const box = new THREE.Box3().setFromObject(o, true);
            box.min.copy(holder.worldToLocal(box.min.clone()));
            box.max.copy(holder.worldToLocal(box.max.clone()));
            if (box.max.y < top - bodyH || box.min.y > top) continue;
            reach = Math.max(reach, outward(box));
        }
        if (Math.abs(grip.x) - bodyW / 2 >= reach + 0.015) break;
        carryOut += 0.03;
        grip = measureGrip();
    }
    const small = blowerModel(options.blower ?? look.blower, false, grip);
    const bigOne = blowerModel(options.bigBlower ?? look.blower, true, grip);
    bigOne.visible = false;
    carried.add(small, bigOne);
    shown = 'carry';
    // Set down, the handheld's body rests on the grass.
    const setDown = -(small.userData.body.position.y - HANDHELD.body[1] / 2) + 0.005;

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
        for (const t of [...small.userData.tubes, ...bigOne.userData.tubes]) t.visible = carrying;
        if (carrying) {
            carried.position.set(0, blowing ? 0.006 * Math.sin(time * 90) : 0, 0);
            carried.rotation.set(0, 0, 0);
        } else {
            // On the grass: the body only (and the handheld's handle), since
            // the hose would reach into the ground. The backpack sits lower
            // than it rides.
            carried.position.set(-0.45 * h, big ? -1.0 : setDown, big ? 0.35 : 0.1);
            carried.rotation.set(0, 0.4 * h, 0);
        }
    }
    return { group, update, hand: h < 0 ? 'left' : 'right' };
}
