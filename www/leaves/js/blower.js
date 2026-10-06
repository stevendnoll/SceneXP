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

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/** A person at `start`, facing the house (-z). */
export function createOperator(B) {
    return { x: B.start.x, z: B.start.z, heading: Math.PI, speed: 0, stride: 0 };
}

/** The unit direction a heading faces: 0 is +z, PI / 2 is +x. */
export function facing(heading) {
    return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * One frame of walking. `aim` is one of:
 *   { mode: 'point', x, z }       walk toward a spot and point at it
 *   { mode: 'keys', x, z }        walk along (x, z), a vector of length 0 to 1
 *   null                          stand still
 * `area` is the rectangle the person can walk in. Mutates and returns `op`.
 */
export function stepOperator(op, aim, dt, B, area) {
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
    const nx = clamp(op.x + vx * dt, area.minX, area.maxX);
    const nz = clamp(op.z + vz * dt, area.minZ, area.maxZ);
    op.speed = dt > 0 ? Math.hypot(nx - op.x, nz - op.z) / dt : 0;
    op.x = nx;
    op.z = nz;
    op.stride += op.speed * dt;
    return op;
}

/**
 * The figure: a person in a flannel shirt and jeans, holding a blower whose
 * nozzle tip sits where the jet starts (B.reach ahead, B.height up, B.side
 * to the right). Returns { group, update(op, blowing, time) }.
 */
export function createOperatorFigure(B, look) {
    const group = new THREE.Group();
    group.name = 'operator';
    const person = createPerson({
        role: 'operator',
        shirtColor: 0x9c2b25,
        pantsColor: 0x34495e,
        skinTone: 0xe0ac86,
        hairColor: 0x3b2a1e,
        shoulderRound: 0.4,
        sleeveColor: 0x9c2b25
    });
    group.add(person);

    const arms = [];
    const legs = [];
    person.traverse((o) => {
        if (o.userData && o.userData.isArm) arms.push(o);
        if (o.userData && o.userData.isLeg) legs.push(o);
    });
    // The right arm is the one on -x (the figure faces +z). It reaches down
    // and forward to the blower's handle.
    const right = arms.find((a) => a.userData.armSide === -1);
    if (right) {
        right.rotation.x = -0.55;
        right.rotation.z = -0.25;
        if (right.userData.forearm) right.userData.forearm.rotation.x = -0.45;
    }

    // The blower: an orange body at the right hip, and a tube down to the
    // nozzle, in the figure's own frame.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.36),
        new THREE.MeshLambertMaterial({ color: look.blower }));
    body.position.set(-0.3, 0.72, 0.22);
    body.castShadow = true;
    group.add(body);
    const from = new THREE.Vector3(-0.28, 0.66, 0.4);
    const to = new THREE.Vector3(-B.side, B.height, B.reach);
    const span = to.clone().sub(from);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, span.length(), 10),
        new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
    tube.position.copy(from).addScaledVector(span, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
    tube.castShadow = true;
    group.add(tube);

    const base = legs.map((l) => l.rotation.x);
    function update(op, blowing, time) {
        group.position.set(op.x, 0, op.z);
        group.rotation.y = op.heading;
        // A walk: legs swing with the distance walked, and settle when still.
        const swing = Math.min(1, op.speed / 1.2) * 0.5 * Math.sin(op.stride * 4.2);
        legs.forEach((l, i) => { l.rotation.x = base[i] + (l.userData.legSide === 1 ? swing : -swing); });
        // The blower trembles while it runs.
        const buzz = blowing ? 0.006 * Math.sin(time * 90) : 0;
        body.position.y = 0.72 + buzz;
        tube.position.y = (from.y + to.y) / 2 + buzz;
    }
    return { group, update };
}
