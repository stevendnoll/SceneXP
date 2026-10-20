// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * tuneups.js - the four tune-ups on the bench as short animations (M5.1,
 * PRD Wheels and axles), one tap a step:
 *
 *   deburr    a file rubs the burr off under each nail head
 *   polish    an axle spins in a drill against the grit, and the heads on
 *             the car come back shinier (carmesh.shineOf)
 *   graphite  a puff of graphite into each wheel, the wheels spun to work
 *             it in
 *   align     the car rolls down a test board, drifting toward the side,
 *             the axles are tapped straight, and it rolls again, true
 *
 * THE BUILD CHANGES FIRST, THE PICTURE CATCHES UP, as with the Cut
 * (tools.js, D30): bench.js keeps the tuned car the moment the button is
 * pressed, and `swap` puts its mesh on the turntable when the animation
 * gets to the change. Reduced motion is the before and after.
 *
 * TWO GROUPS: `inCar` rides in the car's own frame (the file, the drill,
 * the graphite and the puffs, at the wheels), `onBench` stays on the
 * turntable (the test board). Align moves the car itself, which `update`
 * returns as an offset for main.js to apply.
 */

import { DERBY_CONFIG } from './config.min.js';

const mat = (color, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** How long each tune-up's animation runs, in seconds. Pure. */
export function lengthOf(kind, C = DERBY_CONFIG) {
    const T = C.tuneups;
    if (kind === 'align') return 2 * T.align.run + T.align.fix + 2 * T.align.back;
    return T[kind] || 0;
}

/**
 * Where the car is during Align, `t` seconds in: { x, z } from its place on
 * the turntable, and whether the hammer is tapping. The first run drifts
 * toward the side, the second rolls true. Pure.
 */
export function alignAt(t, C = DERBY_CONFIG) {
    const A = C.tuneups.align;
    const L = C.tuneups.board;
    const D = C.tuneups.drift;
    const ease = (u) => u * u * (3 - 2 * u);
    let at = t;
    if (at < A.run) {
        const u = ease(at / A.run);
        return { x: u * L, z: u * u * D, tapping: false };
    }
    at -= A.run;
    if (at < A.back) {
        const u = ease(at / A.back);
        return { x: L * (1 - u), z: D * (1 - u), tapping: false };
    }
    at -= A.back;
    if (at < A.fix) return { x: 0, z: 0, tapping: true };
    at -= A.fix;
    if (at < A.run) return { x: ease(at / A.run) * L, z: 0, tapping: false };
    at -= A.run;
    const u = ease(Math.min(1, at / A.back));
    return { x: L * (1 - u), z: 0, tapping: false };
}

/**
 * The tune-ups' tools. `sounds` is { file(s), drill(s), puff(), tap(),
 * roll(amount) }. Returns { inCar, onBench, busy, turning, play, update,
 * finish }.
 */
export function createTuneups(C = DERBY_CONFIG, sounds = {}) {
    const K = C.kit;
    const inCar = new THREE.Group();
    inCar.name = 'tuneups';
    const onBench = new THREE.Group();
    onBench.name = 'test-board';

    const file = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.012), mat(0x6f767f, 0.6, 0.6));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.01, 0.014), mat(0xc8322b, 0.6));
    grip.position.x = 0.05;
    file.add(blade, grip);

    const drill = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.06, 18), mat(0xf2c230, 0.45));
    body.rotation.z = Math.PI / 2;
    body.position.x = 0.04;
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.016, 14), mat(0x3a3d42, 0.4, 0.6));
    chuck.rotation.z = Math.PI / 2;
    chuck.position.x = 0.003;
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.045, 8), mat(0xc9ced6, 0.3, 0.9));
    nail.rotation.z = Math.PI / 2;
    nail.position.x = -0.026;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.012), mat(0x6a5a48, 1));
    paper.position.set(-0.03, -0.003, 0);
    drill.add(body, chuck, nail, paper);

    const bottle = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.032, 14), mat(0x2b2b30, 0.6));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.014, 10), mat(0x2b2b30, 0.6));
    tip.position.y = -0.023;
    tip.rotation.x = Math.PI;
    bottle.add(tube, tip);
    const puffMat = new THREE.MeshBasicMaterial({ color: 0x55575c, transparent: true, opacity: 0.6, depthWrite: false });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8), puffMat);

    const hammer = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), mat(0x6f767f, 0.5, 0.6));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 8), mat(0xe2b77c, 0.6));
    shaft.position.y = 0.03;
    hammer.add(head, shaft);

    for (const g of [file, drill, bottle, puff, hammer]) {
        g.visible = false;
        inCar.add(g);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(K.length + C.tuneups.board, 0.006, 0.07), mat(0xd9b07a, 0.7));
    board.position.set(C.tuneups.board / 2, -0.003, 0);
    board.visible = false;
    onBench.add(board);

    let job = null;

    function hideAll() {
        for (const g of [file, drill, bottle, puff, hammer, board]) g.visible = false;
    }

    function end() {
        if (!job) return;
        const { done } = job;
        if (!job.swapped && job.swap) job.swap();
        job = null;
        hideAll();
        if (sounds.roll) sounds.roll(0);
        if (done) done();
    }

    function swapNow() {
        if (job && !job.swapped) {
            job.swapped = true;
            if (job.swap) job.swap();
        }
    }

    return {
        inCar,
        onBench,
        busy: () => Boolean(job),
        /** Whether the car should be held side on to the camera. */
        turning: () => Boolean(job),
        /**
         * Play a tune-up: `kind` is deburr, polish, graphite or align.
         * `wheels` are the wheel spots in the car's frame (carmesh.
         * wheelSpots), `spin(meters)` turns the car's wheels.
         */
        play(kind, { wheels = [], spin = null, reducedMotion = false, swap = null, done = null } = {}) {
            end();
            job = { kind, t: 0, wheels, spin, swap, done, swapped: false, puffed: 0, taps: 0 };
            if (reducedMotion || !lengthOf(kind, C)) {
                end();
                return;
            }
            if (kind === 'deburr' && sounds.file) sounds.file(lengthOf(kind, C));
            if (kind === 'polish' && sounds.drill) sounds.drill(lengthOf(kind, C));
            if (kind === 'align') board.visible = true;
        },
        /** One frame. Returns the car's offset from the turntable (Align),
         *  or null. */
        update(dt) {
            if (!job) return null;
            job.t += dt;
            const t = job.t;
            const span = lengthOf(job.kind, C);
            if (t >= span) {
                end();
                return { x: 0, z: 0 };
            }
            // The two wheels on the camera's side, rear then front.
            const near = job.wheels.filter((w) => w[2] > 0).sort((a, b) => a[0] - b[0]);
            const hub = near[Math.min(near.length - 1, Math.floor((t / span) * near.length))] || [0, K.wheel.radius, K.width / 2];
            if (job.kind === 'deburr') {
                file.visible = true;
                file.position.set(hub[0] + Math.sin(t * 34) * 0.008, hub[1], hub[2] + 0.02);
                if (t > span * 0.5) swapNow();
            } else if (job.kind === 'polish') {
                drill.visible = true;
                drill.position.set(-K.length * 0.3, K.wheel.radius + K.height + 0.05, 0.06);
                nail.rotation.x += dt * 90;
                if (t > span * 0.8) swapNow();
            } else if (job.kind === 'graphite') {
                bottle.visible = true;
                bottle.position.set(hub[0], hub[1] + 0.03, hub[2] + 0.02);
                const which = Math.floor((t / span) * near.length);
                if (which >= job.puffed && which < near.length) {
                    job.puffed = which + 1;
                    if (sounds.puff) sounds.puff();
                }
                const local = ((t / span) * near.length) % 1;
                puff.visible = local > 0.25;
                puff.position.set(hub[0], hub[1], hub[2] + 0.004);
                puff.scale.setScalar(0.4 + local * 1.8);
                puffMat.opacity = 0.6 * (1 - local);
                if (job.spin) job.spin(t * 0.25);
                if (t > span * 0.9) swapNow();
            } else if (job.kind === 'align') {
                const a = alignAt(t, C);
                const rear = job.wheels.slice().sort((p, q) => p[0] - q[0])[0] || [-K.rearAxle, K.wheel.radius, 0.03];
                hammer.visible = a.tapping;
                if (a.tapping) {
                    swapNow();
                    const beat = Math.floor(t * 6);
                    if (beat > job.taps) {
                        job.taps = beat;
                        if (sounds.tap) sounds.tap();
                    }
                    hammer.position.set(rear[0], rear[1] + 0.02 + Math.abs(Math.sin(t * 19)) * 0.02, Math.abs(rear[2]) + 0.03);
                }
                if (job.spin) job.spin(a.x);
                if (sounds.roll) sounds.roll(a.tapping ? 0 : 0.35);
                return { x: a.x, z: a.z };
            }
            return null;
        },
        /** Skip to the end (the bench closing, another step pressed). */
        finish: end
    };
}
