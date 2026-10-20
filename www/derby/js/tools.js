// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * tools.js - the workshop's two tap-then-watch moments (M4.3, M4.4): the
 * Cut, a coping saw running along the pencil line while the offcuts fall
 * away, and the sanding block rubbing the edges round.
 *
 * THE BUILD CHANGES FIRST, THE PICTURE CATCHES UP. bench.js keeps the cut
 * car the moment Cut is pressed (so nothing a tap does mid-cut can find a
 * half-cut car), and this only shows it happening: the old body stays on
 * the turntable while the saw runs, then `swap` puts the new one there and
 * the wood that came off falls away. Reduced motion skips straight to the
 * after (PRD, Accessibility: a single before-and-after).
 *
 * THE OFFCUTS ARE WHAT CAME OFF: at every station, the old cross-section
 * less the new one, as up to four slabs (above the new top, below the new
 * bottom, and either side of the new width), each lofted nose to tail and
 * falling on its own.
 *
 * Everything here is in the car's own frame (carmesh.js): the nose at the
 * origin, the car reaching back along -x.
 */

import { DERBY_CONFIG } from './config.min.js';
import { profileAt } from './car.min.js';

/**
 * The wood a cut takes off, as four slabs: rows [d, y0, y1, z0, z1] at the
 * new car's stations, d meters from the nose, heights above the block's
 * bottom face. A slab is zero thick where nothing came off. Pure.
 */
export function offcutsOf(from, to) {
    const top = [];
    const bottom = [];
    const left = [];
    const right = [];
    for (const [d, nb, nt, nw] of to) {
        const [ob, ot, ow] = profileAt(from, d);
        const keepTop = Math.min(nt, ot);
        const keepBottom = Math.max(nb, ob);
        top.push([d, keepTop, Math.max(ot, keepTop), -ow / 2, ow / 2]);
        bottom.push([d, ob, Math.max(keepBottom, ob), -ow / 2, ow / 2]);
        const inner = Math.min(nw, ow) / 2;
        left.push([d, keepBottom, Math.max(keepTop, keepBottom), -ow / 2, -inner]);
        right.push([d, keepBottom, Math.max(keepTop, keepBottom), inner, ow / 2]);
    }
    return { top, bottom, left, right };
}

/** How much wood a slab holds (cubic meters), to tell an empty one. Pure. */
export function slabVolume(rows) {
    let v = 0;
    for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i];
        const b = rows[i + 1];
        const area = (r) => Math.max(0, r[2] - r[1]) * Math.max(0, r[4] - r[3]);
        v += ((area(a) + area(b)) / 2) * (b[0] - a[0]);
    }
    return v;
}

/** A slab's surface: rectangles lofted along the car, closed at the ends. */
function slabGeometry(rows, base) {
    const positions = [];
    const indices = [];
    for (const [d, y0, y1, z0, z1] of rows) {
        positions.push(-d, base + y0, z1, -d, base + y1, z1, -d, base + y1, z0, -d, base + y0, z0);
    }
    for (let i = 0; i < rows.length - 1; i++) {
        for (let j = 0; j < 4; j++) {
            const a = i * 4 + j;
            const c = i * 4 + ((j + 1) % 4);
            const b = a + 4;
            const e = c + 4;
            indices.push(a, c, b, c, e, b);
        }
    }
    const last = (rows.length - 1) * 4;
    indices.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/** A coping saw, its blade across the car (along z), the frame arching up. */
function buildSaw() {
    const saw = new THREE.Group();
    saw.name = 'saw';
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.7 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.4, metalness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0xc8322b, roughness: 0.55 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0007, 0.003, 0.15), steel);
    saw.add(blade);
    for (const z of [-0.075, 0.075]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.09, 0.004), frameMat);
        arm.position.set(0, 0.045, z);
        saw.add(arm);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.154), frameMat);
    bar.position.y = 0.09;
    saw.add(bar);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.06, 14), wood);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.105;
    saw.add(handle);
    saw.visible = false;
    return saw;
}

/** A sanding block: a little block of wood with the paper under it. */
function buildSander() {
    const sander = new THREE.Group();
    sander.name = 'sander';
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.034), new THREE.MeshStandardMaterial({ color: 0xe2b77c, roughness: 0.7 }));
    block.position.y = 0.011;
    sander.add(block);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.002, 0.036), new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1 }));
    paper.position.y = 0.001;
    sander.add(paper);
    sander.visible = false;
    return sander;
}

/**
 * The tools, in a group to set in the car's frame. `sounds` is { saw(s),
 * sand(s) }, each started with its seconds. Returns { group, busy, cut,
 * sand, update, finish }.
 */
export function createTools(C = DERBY_CONFIG, sounds = {}) {
    const K = C.kit;
    const base = K.wheel.radius - K.axleHeight;
    const T = C.workshop.cut;
    const group = new THREE.Group();
    group.name = 'tools';
    const saw = buildSaw();
    const sander = buildSander();
    group.add(saw);
    group.add(sander);
    let job = null;

    function clearOffcuts() {
        if (!job || !job.offcuts) return;
        for (const o of job.offcuts) {
            group.remove(o.mesh);
            o.mesh.geometry.dispose();
            o.mesh.material.dispose();
        }
        job.offcuts = [];
    }

    function end() {
        if (!job) return;
        const done = job.done;
        if (job.kind === 'cut' && !job.swapped) job.swap();
        clearOffcuts();
        saw.visible = false;
        sander.visible = false;
        job = null;
        if (done) done();
    }

    /** The wood that came off, made and set falling, each its own way. */
    function drop() {
        const pieces = offcutsOf(job.from, job.to);
        const dirs = { top: [0.4, 0.2], bottom: [-0.2, 0.1], left: [0, -1], right: [0, 1] };
        job.offcuts = [];
        for (const [name, rows] of Object.entries(pieces)) {
            if (slabVolume(rows) < 1e-8) continue;
            const mesh = new THREE.Mesh(slabGeometry(rows, base), new THREE.MeshStandardMaterial({ color: job.color, roughness: 0.6, transparent: true }));
            group.add(mesh);
            job.offcuts.push({ mesh, dir: dirs[name] });
        }
    }

    return {
        group,
        busy: () => Boolean(job),
        /** Whether the car should be turning side on to the camera. */
        turning: () => Boolean(job) && job.kind === 'cut',
        /**
         * The Cut: `from` and `to` are the old and new stations, `color` the
         * paint (for the offcuts), `swap()` puts the cut car on the
         * turntable, `done()` follows the last offcut.
         */
        cut({ from, to, color = 0xd9b07a, reducedMotion = false, swap, done }) {
            end();
            job = { kind: 'cut', t: 0, from, to, color, swap, done, swapped: false, offcuts: [] };
            if (reducedMotion) {
                job.swap();
                job.swapped = true;
                end();
                return;
            }
            if (sounds.saw) sounds.saw(T.saw);
        },
        /** The sanding block rubbing along the top, a few strokes. */
        sand({ stations, reducedMotion = false, done }) {
            end();
            if (reducedMotion) {
                if (done) done();
                return;
            }
            job = { kind: 'sand', t: 0, stations, done };
            if (sounds.sand) sounds.sand(C.workshop.sandSeconds);
        },
        update(dt) {
            if (!job) return;
            job.t += dt;
            const t = job.t;
            if (job.kind === 'sand') {
                const S = C.workshop.sandSeconds;
                if (t >= S) {
                    end();
                    return;
                }
                // Three strokes there and back, nose to tail.
                const u = 0.5 - 0.5 * Math.cos((t / S) * Math.PI * 6);
                const d = 0.025 + u * (K.length - 0.05);
                const [, top] = profileAt(job.stations, d);
                const [, ahead] = profileAt(job.stations, d + 0.004);
                const [, behind] = profileAt(job.stations, d - 0.004);
                sander.visible = true;
                sander.position.set(-d, base + top, 0);
                sander.rotation.z = Math.atan2(behind - ahead, 0.008);
                return;
            }
            const sawFrom = T.turn;
            const sawTo = T.turn + T.saw;
            if (t < sawFrom) return;
            if (t < sawTo) {
                const u = (t - sawFrom) / T.saw;
                const d = u * K.length;
                const [, top] = profileAt(job.to, d);
                saw.visible = true;
                // The stroke: back and forth across the car, a few a second.
                saw.position.set(-d, base + top, Math.sin(t * 40) * 0.012);
                return;
            }
            if (!job.swapped) {
                saw.visible = false;
                job.swap();
                job.swapped = true;
                drop();
            }
            const f = (t - sawTo) / T.fall;
            if (f >= 1) {
                end();
                return;
            }
            for (const o of job.offcuts) {
                o.mesh.position.set(o.dir[0] * f * 0.05, -0.6 * f * f, o.dir[1] * f * 0.06);
                o.mesh.rotation.x = o.dir[1] * f * 0.8;
                o.mesh.rotation.z = -o.dir[0] * f * 0.8;
                o.mesh.material.opacity = 1 - f;
            }
        },
        /** Skip to the end (a tap elsewhere, or the bench closing). */
        finish: end
    };
}
