// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * trophy.js - the pile on the results card (Steve's QA, 2026-10-08: "Can we
 * make the final results card more flashy looking? Maybe we could have a
 * rotating 3D view of a pile of leaves, and the pile's size is dynamic based
 * on how the user did?").
 *
 * The yard's own leaves (leafmesh.js's shader, rooftops.js's colors and
 * sizes) heaped on a little round of lawn, turning slowly. How big the heap
 * is says how the round went: a sad handful for a few percent, a proper
 * heap for a clear lawn. The size is exaggerated on purpose, so a glance
 * tells 10% from 50% from 100%. When the card opens the leaves rain down
 * onto it, bottom first so it builds up, while the card's percent counts up
 * to the score, and anything found under the leaves sits on top. A clear
 * lawn inside the time gets golden glints drifting down over it. Under
 * reduced motion it is simply there, finished, still.
 *
 * ITS OWN SMALL CANVAS AND RENDERER, made the first time the card opens and
 * drawn only while the card is up. The yard's canvas is under the card's
 * dimmed backdrop, so borrowing a corner of it would show a dimmed pile.
 *
 * PURE PARTS (pileSize, pileLeaves, rainAt) are plain numbers.
 */
import { makeRandom } from './sim.min.js';
import { leafLook } from './rooftops.min.js';
import { createLeafMesh } from './leafmesh.min.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const TAU = Math.PI * 2;

/** How big the heap is for a cleared share (0 to 1): { radius, height,
 *  count }. The radius grows as share ^ `T.grow`, so small results look
 *  small; the count keeps the leaves as thick on any size of heap. */
export function pileSize(share, T) {
    const k = Math.pow(clamp(share, T.least, 1), T.grow);
    const radius = T.radius * k;
    const height = radius * Math.tan((T.slope * Math.PI) / 180);
    const count = Math.max(T.min, Math.round(T.max * k * k));
    return { radius, height, count };
}

/**
 * Where each leaf of the heap lies: on a cone of `size`, thickest at its
 * foot, each tipped to the slope where it lies and spun its own way, some
 * face down. Sorted from the bottom up, the order they land in. Returns
 * [{ x, y, z, face, tilt, spin, flip, delay }], `face` the way its slope
 * faces (radians about y), `delay` 0 to 1 through the rain.
 */
export function pileLeaves(size, T, seed = 1) {
    const random = makeRandom(seed);
    const out = [];
    const tilt = Math.atan2(size.height, size.radius);
    for (let i = 0; i < size.count; i++) {
        // More leaves nearer the foot, where a heap's surface is widest.
        const r = size.radius * Math.sqrt(random());
        const a = random() * TAU;
        const y = size.height * (1 - r / size.radius) + random() * 0.02;
        out.push({
            x: Math.sin(a) * r, y, z: Math.cos(a) * r,
            face: a, tilt: tilt + (random() - 0.5) * 0.5, spin: random() * TAU, flip: random() < 0.3
        });
    }
    out.sort((p, q) => p.y - q.y);
    out.forEach((p, i) => { p.delay = (i / Math.max(1, out.length - 1)) * 0.85 + random() * 0.15; });
    return out;
}

/** Where a leaf is `t` seconds into the rain: { y, landed, turn }, falling
 *  `T.drop` meters over `T.fall` seconds once its turn comes (delay times
 *  `T.rain`), easing into place. */
export function rainAt(p, t, T) {
    const start = p.delay * T.rain;
    // A hair of slack, so a leaf at exactly its landing time has landed.
    const u = clamp((t - start) / T.fall + 1e-9, 0, 1);
    // Falls faster as it goes, and settles.
    const ease = 1 - (1 - u) * (1 - u);
    return { y: p.y + T.drop * (1 - ease), landed: u >= 1, turn: (1 - ease) * 2.5, shown: t >= start };
}

/** The glints' starting heights and places, and where each is `t` seconds
 *  on: drifting down `G.fall` meters a second, from `G.height` back to the
 *  top when they reach the lawn. [{ x, y, z }]. */
export function glintsAt(G, radius, t, seed = 5) {
    const random = makeRandom(seed);
    const out = [];
    for (let i = 0; i < G.count; i++) {
        const a = random() * TAU;
        const r = radius * 1.2 * Math.sqrt(random());
        const y0 = random() * G.height;
        const y = (((y0 - t * G.fall) % G.height) + G.height) % G.height;
        out.push({ x: Math.sin(a) * r, y: y + 0.05, z: Math.cos(a) * r });
    }
    return out;
}

/** How long the whole rain takes, in seconds. */
export function rainSeconds(T) {
    return T.rain + T.fall;
}

// ---- Drawing -------------------------------------------------------------------

/** A soft round of lawn on clear: a disc fading out at its edge. */
function lawnRound(color, radius) {
    let map = null;
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (ctx && ctx.createRadialGradient) {
            const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.7, 'rgba(255,255,255,0.85)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 128);
            map = new THREE.CanvasTexture(canvas);
        }
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40),
        new THREE.MeshLambertMaterial({ color, transparent: true, alphaMap: map, opacity: map ? 1 : 0.9, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    return disc;
}

/**
 * The pile's scene for a cleared `share`, its leaves `base` across (the
 * yard's size), and `finds` (find models from finds.js) to sit on top.
 * Returns { scene, group, leaves, mesh, size, place(t) }: place(t) lays the
 * leaves where the rain has them at `t` seconds (Infinity for done).
 */
export function buildPile(config, share, base, finds = [], { glints = false } = {}) {
    const T = config.trophy;
    const size = pileSize(share, T);
    const leaves = pileLeaves(size, T, T.seed);
    const random = makeRandom(T.seed + 1);
    const traits = new Float32Array(leaves.length * 6);
    leaves.forEach((p, i) => {
        const l = leafLook(config, base * T.leafScale, random);
        traits.set([l.rgb[0], l.rgb[1], l.rgb[2], l.kind, l.size, l.cup], i * 6);
    });
    const pose = new Float32Array(leaves.length * 6);
    const leafMesh = createLeafMesh({ pose, count: leaves.length }, traits, { underside: config.look.underside });
    const poseAttr = leafMesh.mesh.geometry.getAttribute('iPos');
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3(1, 0, 0);
    const flipAxis = new THREE.Vector3(0, 0, 1);
    const qa = new THREE.Quaternion();

    function place(t) {
        let landedAll = true;
        leaves.forEach((p, i) => {
            const at = rainAt(p, t, T);
            if (!at.landed) landedAll = false;
            // Facing out down its slope, tipped to it, spun about itself,
            // tumbling while it falls.
            q.setFromAxisAngle(up, p.face);
            q.multiply(qa.setFromAxisAngle(side, p.tilt + at.turn));
            q.multiply(qa.setFromAxisAngle(up, p.spin + at.turn));
            if (p.flip) q.multiply(qa.setFromAxisAngle(flipAxis, Math.PI));
            e.setFromQuaternion(q, 'YXZ');
            // Not yet in the air: out of sight under the lawn.
            const y = at.shown ? at.y : -10;
            pose.set([p.x, y, p.z, e.y, e.x, e.z], i * 6);
        });
        if (poseAttr && poseAttr.data) poseAttr.data.needsUpdate = true;
        return landedAll;
    }

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x6b5a3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const group = new THREE.Group();
    group.name = 'pile';
    group.add(lawnRound(config.look.lawn, T.radius * 1.35));
    leafMesh.mesh.position.y = 0.004;
    group.add(leafMesh.mesh);
    // The finds on top, side by side, or beside a heap too small to hold them.
    finds.forEach((model, k) => {
        const spread = (k - (finds.length - 1) / 2) * 0.28;
        const onTop = size.radius > 0.35;
        model.group.visible = true;
        model.group.position.set(onTop ? spread : size.radius + 0.25 + k * 0.3, onTop ? size.height * 0.85 : 0, onTop ? 0.05 : 0.2);
        model.group.rotation.y = 0.4 + k;
        group.add(model.group);
    });
    // Golden glints for a clear lawn inside the time.
    let sparkle = null;
    if (glints) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(T.glints.count * 3), 3));
        sparkle = new THREE.Points(geometry, new THREE.PointsMaterial({
            color: T.glints.color, size: T.glints.size, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        sparkle.name = 'glints';
        group.add(sparkle);
    }
    function drift(t) {
        if (!sparkle) return;
        const pos = sparkle.geometry.getAttribute('position');
        glintsAt(T.glints, T.radius, t).forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
        pos.needsUpdate = true;
    }
    drift(0);
    scene.add(group);
    place(Infinity);
    return { scene, group, leaves, mesh: leafMesh.mesh, size, place, drift, glints: sparkle, dispose: leafMesh.dispose };
}

/**
 * The card's view: `canvas` gets its own renderer, made now. Returns
 * { show(share, base, finds, reduced), hide(), step(dt) → percent share
 * shown so far (for the count up), dispose() }, or null where WebGL cannot
 * start (the card then simply has no pile).
 */
export function createTrophy(canvas, config, { exposure = 1 } = {}) {
    const T = config.trophy;
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (e) {
        return null;
    }
    if (!renderer || !renderer.render) return null;
    renderer.setClearColor(0x000000, 0);
    if (THREE.NeutralToneMapping !== undefined) renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = exposure;
    const camera = new THREE.PerspectiveCamera(T.fov, 2, 0.1, 30);
    let pile = null;
    let t = 0;
    let clock = 0;
    let turn = 0;
    let reduced = false;
    let share = 0;

    function fit() {
        const w = canvas.clientWidth || 360;
        const h = canvas.clientHeight || 160;
        const ratio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Framed on the biggest heap, so a smaller one looks smaller.
        const top = T.radius * Math.tan((T.slope * Math.PI) / 180);
        const half = Math.tan((T.fov * Math.PI) / 360);
        const across = (T.radius * 1.35) / (half * camera.aspect);
        const tall = (top + T.view.above) / half;
        const dist = Math.max(across, tall) * T.view.back;
        camera.position.set(0, dist * T.view.up, dist);
        camera.lookAt(0, top * 0.45, 0);
        camera.updateProjectionMatrix();
    }

    return {
        show(nextShare, base, finds = [], reducedMotion = false, glints = false) {
            if (pile) {
                pile.dispose();
                pile = null;
            }
            share = clamp(nextShare, 0, 1);
            reduced = reducedMotion;
            pile = buildPile(config, share, base, finds, { glints });
            clock = 0;
            t = reduced ? Infinity : 0;
            turn = 0.6;
            pile.place(t);
            fit();
        },
        hide() {
            if (pile) {
                pile.dispose();
                pile = null;
            }
        },
        /** One frame. Returns how far the count up is, 0 to 1. */
        step(dt) {
            if (!pile) return 1;
            if (!reduced) {
                t += dt;
                clock += dt;
                turn += dt * T.spin;
                pile.place(t);
                pile.drift(clock);
            }
            pile.group.rotation.y = turn;
            renderer.render(pile.scene, camera);
            return reduced ? 1 : clamp(t / rainSeconds(T), 0, 1);
        },
        resize: fit,
        dispose() {
            if (pile) pile.dispose();
            if (renderer.dispose) renderer.dispose();
        },
        pile: () => pile
    };
}
