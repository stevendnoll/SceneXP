// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * confetti.js - leaves thrown up in celebration (Steve's QA, 2026-10-08:
 * "Could we increase the celebration/animation if the user clears 100% of
 * the lawn?", and a bigger one for a clear lawn inside the time).
 *
 * A burst of the yard's own leaves (leafmesh.js's shader, rooftops.js's
 * colors), thrown up and out from over the person's head, tumbling as they
 * fall, slowed by the air and swinging side to side the way a leaf does. A
 * clear lawn inside the time throws more, some of them gold.
 *
 * THEY NEVER TOUCH THE LAWN. A celebration of a clean lawn must not leave
 * leaves on it, so they are not in the sim, and each one shrinks away over
 * the last half meter of its fall (`fadeAbove`).
 *
 * PURE PARTS (burstOf, stepConfetti, confettiScale) are plain numbers.
 */
import { makeRandom } from './sim.min.js';
import { leafLook } from './rooftops.min.js';
import { createLeafMesh } from './leafmesh.min.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * `n` leaves leaving `origin` ({ x, y, z }) at once, `K` config.cheer.confetti:
 * speeds between K.speed[0] and [1], up at K.up[0] to [1] radians, every way
 * round. Each { x, y, z, vx, vy, vz, yaw, pitch, roll, spinY, spinX, spinZ,
 * phase, gone }.
 */
export function burstOf(n, origin, K, seed = 1) {
    const random = makeRandom(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = random() * TAU;
        const up = K.up[0] + random() * (K.up[1] - K.up[0]);
        const s = K.speed[0] + random() * (K.speed[1] - K.speed[0]);
        out.push({
            x: origin.x + (random() - 0.5) * 0.3,
            y: origin.y + (random() - 0.5) * 0.2,
            z: origin.z + (random() - 0.5) * 0.3,
            vx: Math.cos(a) * Math.cos(up) * s,
            vy: Math.sin(up) * s,
            vz: Math.sin(a) * Math.cos(up) * s,
            yaw: random() * TAU,
            pitch: random() * TAU,
            roll: random() * TAU,
            spinY: (random() - 0.5) * 8,
            spinX: (random() - 0.5) * 10,
            spinZ: (random() - 0.5) * 6,
            phase: random() * TAU,
            gone: false
        });
    }
    return out;
}

/** Each leaf's size, 0 to 1: whole until it falls within `fadeAbove` of the
 *  lawn, then shrinking to nothing as it reaches it. */
export function confettiScale(p, K) {
    if (p.gone) return 0;
    if (p.vy > 0) return 1;
    const u = clamp(p.y / K.fadeAbove, 0, 1);
    return u * u * (3 - 2 * u);
}

/**
 * `dt` seconds of flight: gravity, the air's drag (a leaf soon falls no
 * faster than gravity / drag), a swing side to side, and the tumbling. A
 * leaf at the lawn is gone. Returns how many are still in the air.
 */
export function stepConfetti(list, dt, K, time = 0) {
    let flying = 0;
    const slow = Math.exp(-K.drag * dt);
    for (const p of list) {
        if (p.gone) continue;
        p.vy -= K.gravity * dt;
        p.vx *= slow;
        p.vy *= slow;
        p.vz *= slow;
        // The swing, once it is coming down.
        const swing = p.vy < 0 ? K.swing * Math.sin(time * 3 + p.phase) : 0;
        p.x += (p.vx + swing * Math.cos(p.phase)) * dt;
        p.y += p.vy * dt;
        p.z += (p.vz + swing * Math.sin(p.phase)) * dt;
        p.yaw += p.spinY * dt;
        p.pitch += p.spinX * dt;
        p.roll += p.spinZ * dt;
        if (p.y <= 0.01) {
            p.gone = true;
            continue;
        }
        flying++;
    }
    return flying;
}

/**
 * The confetti's mesh, for bursts up to `max` leaves `base` across (the
 * yard's leaf size). Returns { mesh, burst(origin, n, gold, seed), step(dt,
 * time) → leaves still flying, flying() }.
 */
export function createConfetti(config, base, max) {
    const K = config.cheer.confetti;
    const pose = new Float32Array(max * 6);
    const traits = new Float32Array(max * 6);
    const looks = [];
    const random = makeRandom(K.seed);
    for (let i = 0; i < max; i++) looks.push(leafLook(config, base * K.size, random));
    const leaves = createLeafMesh({ pose, count: max }, traits, { underside: config.look.underside });
    leaves.mesh.name = 'confetti';
    leaves.mesh.visible = false;
    const poseData = leaves.mesh.geometry.getAttribute('iPos').data;
    const traitData = leaves.mesh.geometry.getAttribute('iLook').data;
    let list = [];
    let gold = 0;

    function write() {
        for (let i = 0; i < max; i++) {
            const p = list[i];
            const o = i * 6;
            if (!p || p.gone) {
                pose[o + 1] = -10;
                traits[o + 4] = 0;
                continue;
            }
            pose.set([p.x, p.y, p.z, p.yaw, p.pitch, p.roll], o);
            const l = looks[i];
            const g = i < gold;
            traits.set(g ? K.goldColor : l.rgb, o);
            traits[o + 3] = l.kind;
            traits[o + 4] = l.size * confettiScale(p, K);
            traits[o + 5] = l.cup;
        }
        poseData.needsUpdate = true;
        traitData.needsUpdate = true;
    }

    let flying = 0;
    return {
        mesh: leaves.mesh,
        burst(origin, n, goldShare = 0, seed = 1) {
            const count = Math.min(max, n);
            list = burstOf(count, origin, K, seed);
            gold = Math.round(count * goldShare);
            flying = count;
            leaves.mesh.visible = count > 0;
            write();
        },
        step(dt, time) {
            if (!flying) return 0;
            flying = stepConfetti(list, dt, K, time);
            write();
            if (!flying) leaves.mesh.visible = false;
            return flying;
        },
        clear() {
            list = [];
            flying = 0;
            leaves.mesh.visible = false;
            write();
        },
        flying: () => flying,
        leaves: () => list
    };
}
