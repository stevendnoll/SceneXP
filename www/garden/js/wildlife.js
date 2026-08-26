// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wildlife.js - Butterflies, fireflies, birds and bats.
 *
 * ---- SCALE IS THE WHOLE PROBLEM ----
 *
 * `www/gavin/js/store.js` is the reference for HOW these move: a closed curve
 * per creature, a flutter on its own clock, a blink that never syncs with its
 * neighbour. It is NOT the reference for size. A Gavin bee is 1 cm across and
 * its camera is a metre away; ours is 22 m back, where 1 cm is a third of a
 * pixel and the most careful flight path in the world is invisible.
 *
 * So everything here is either flown through the NEAR FOREGROUND, in the ten
 * metres between the camera and the plot where a small thing still covers
 * pixels, or drawn against the SKY where a silhouette reads at any size. And
 * all of it is honestly exaggerated: these butterflies have a 30 cm wingspan.
 *
 * ---- WHY THE CPU DRIVES THESE ----
 *
 * Everything else in this scene animates in a shader because it has hundreds
 * or thousands of instances. There are sixteen fireflies. Composing sixteen
 * matrices a frame is nothing, and it buys code that can be read, so the trade
 * that was right for the leaves is wrong here.
 *
 * ---- EACH ONE KEEPS ITS OWN HOURS ----
 *
 * Butterflies are a daytime thing, fireflies belong to dusk, birds to the two
 * twilights, bats to the night. A firefly blinking at noon would say the
 * calendar is decorative.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { makeRandom } from './species.min.js';
import { wrapHour, clamp01 } from './clock.min.js';

// ---- When each one is out (pure) -------------------------------------------

/**
 * How present a creature is at an hour, 0 to 1, with soft edges.
 *
 * Handles the wrap, because the bats' window runs through midnight and every
 * off-by-one in this scene has landed in exactly that kind of interval.
 */
export function presenceAt(hour, window) {
    const h = wrapHour(hour);
    const from = window.from;
    const to = window.to;
    const fade = window.fade;

    // Distance INTO the window, measured the wrapping way.
    const span = wrapHour(to - from) || 24;
    const into = wrapHour(h - from);
    if (into > span) return 0;

    const rise = clamp01(into / fade);
    const fall = clamp01((span - into) / fade);
    const t = Math.min(rise, fall);
    return t * t * (3 - 2 * t);
}

/** Every creature's hours, in one place so they can be read together. */
export const WINDOWS = {
    // Daylight, and gone before the light goes.
    butterflies: { from: 7.0, to: 16.5, fade: 1.2 },
    // Dusk and the early night. Not the deep cold of midwinter.
    fireflies: { from: 17.8, to: 22.5, fade: 1.0 },
    // The two twilights, which is when birds actually move.
    birdsDawn: { from: 4.8, to: 7.8, fade: 0.8 },
    birdsDusk: { from: 16.2, to: 19.2, fade: 0.8 },
    // Through midnight, which is the interval that wraps.
    bats: { from: 20.0, to: 3.5, fade: 1.0 }
};

// ---- State -----------------------------------------------------------------

let sceneRef = null;
let butterflies = null;
let fireflies = null;
let birds = null;
let bats = null;
const disposables = [];

const _m = typeof THREE !== 'undefined' ? null : null;

/** A closed wandering loop, as three sine terms per axis. Cheap, smooth, and
 *  it never repeats visibly because the three periods do not divide. */
function makePath(random, box) {
    return {
        cx: box.x0 + random() * (box.x1 - box.x0),
        cy: box.y0 + random() * (box.y1 - box.y0),
        cz: box.z0 + random() * (box.z1 - box.z0),
        rx: box.rx * (0.5 + random()),
        ry: box.ry * (0.4 + random()),
        rz: box.rz * (0.5 + random()),
        sx: 0.19 + random() * 0.16,
        sy: 0.27 + random() * 0.2,
        sz: 0.15 + random() * 0.14,
        px: random() * 6.283,
        py: random() * 6.283,
        pz: random() * 6.283,
        flap: 6 + random() * 5,
        tint: random()
    };
}

function pathAt(p, t, out) {
    out.set(
        p.cx + Math.sin(t * p.sx + p.px) * p.rx,
        p.cy + Math.sin(t * p.sy + p.py) * p.ry,
        p.cz + Math.cos(t * p.sz + p.pz) * p.rz
    );
    return out;
}

/** Give a flock per-instance colours from a palette, picked by each path's own
 *  seeded tint so the assignment is stable across visits. */
function tintFlyers(group, palette) {
    if (!group || !palette || !palette.length) return;
    const colour = new THREE.Color();
    for (let i = 0; i < group.count; i++) {
        colour.setHex(palette[Math.floor(group.paths[i].tint * palette.length) % palette.length]);
        group.mesh.setColorAt(i, colour);
    }
    if (group.mesh.instanceColor) group.mesh.instanceColor.needsUpdate = true;
}

function buildFlyer(count, geometry, material, box, seed) {
    const random = makeRandom(seed);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.frustumCulled = false;
    mesh.visible = false;
    const paths = [];
    for (let i = 0; i < count; i++) paths.push(makePath(random, box));
    disposables.push(geometry, material);
    return { mesh, paths, count };
}

export function initWildlife(scene, config = GARDEN_CONFIG, options = {}) {
    sceneRef = scene;
    const W = config.world.wildlife;
    const mobile = !!options.mobile;
    const seed = config.world.seed;

    // ---- Butterflies -------------------------------------------------------
    // A crossed pair of quads so a wing shows from any angle, flown through
    // the near foreground where 30 cm still covers a dozen pixels.
    const wingMask = butterflyTexture();
    butterflies = buildFlyer(
        mobile ? W.butterflies.countMobile : W.butterflies.count,
        butterflyGeometry(),
        new THREE.MeshLambertMaterial({
            color: 0xffffff, map: wingMask, alphaTest: 0.45,
            side: THREE.DoubleSide, transparent: true, opacity: 1
        }),
        W.butterflies.box, seed ^ 0xB47);
    butterflies.mesh.name = 'butterflies';
    if (wingMask) disposables.push(wingMask);
    // NOT ALL ONE COLOUR. A dozen identical white flyers read as one repeated
    // prop; a mixed brood reads as insects. The tint already on each path is
    // reused, so nothing new has to be seeded.
    tintFlyers(butterflies, W.butterflies.palette);
    scene.add(butterflies.mesh);

    // ---- Fireflies ---------------------------------------------------------
    // MeshBasicMaterial and fog off: a firefly is a light, so it must not be
    // lit by the scene and must not dim with distance.
    fireflies = buildFlyer(
        mobile ? W.fireflies.countMobile : W.fireflies.count,
        new THREE.SphereGeometry(W.fireflies.size, 5, 4),
        new THREE.MeshBasicMaterial({
            color: W.fireflies.color, transparent: true, opacity: 1, fog: false
        }),
        W.fireflies.box, seed ^ 0xF11E);
    fireflies.mesh.name = 'fireflies';
    scene.add(fireflies.mesh);

    // ---- Birds -------------------------------------------------------------
    // Drawn against the sky, so a silhouette reads at any size.
    birds = buildFlyer(
        mobile ? W.birds.countMobile : W.birds.count,
        wingGeometry(),
        new THREE.MeshBasicMaterial({
            color: W.birds.color, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: false
        }),
        W.birds.box, seed ^ 0xB12D);
    birds.mesh.name = 'birds';
    scene.add(birds.mesh);

    // ---- Bats --------------------------------------------------------------
    bats = buildFlyer(
        mobile ? W.bats.countMobile : W.bats.count,
        wingGeometry(),
        new THREE.MeshBasicMaterial({
            color: W.bats.color, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: false
        }),
        W.bats.box, seed ^ 0xBA75);
    bats.mesh.name = 'bats';
    scene.add(bats.mesh);

    return { butterflies, fireflies, birds, bats };
}

/** Two triangles meeting at a spine: a pair of wings, from any angle. */
function wingGeometry() {
    const geo = new THREE.BufferGeometry();
    const position = new Float32Array([
        0, 0, 0, -1, 0.25, -0.55, -1, 0.25, 0.55,
        0, 0, 0, 1, 0.25, -0.55, 1, 0.25, 0.55
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.computeVertexNormals();
    return geo;
}

/**
 * A butterfly: the same dihedral pair, but as quads carrying UVs.
 *
 * A BARE TRIANGLE IS A PAPER DART, NOT A BUTTERFLY. Against the lawn the
 * untextured version read as scattered litter in the QA screenshots, which is
 * the one thing a garden must never look like. The silhouette has to come from
 * an alpha mask, because at a 30 cm wingspan there is no room to spend
 * triangles on the shape of a wing.
 *
 * The spine is at u = 0.5 and each wing runs out to its own edge of the
 * texture, so one drawn butterfly maps across both halves.
 */
function butterflyGeometry() {
    const geo = new THREE.BufferGeometry();
    const position = new Float32Array([
        // Left wing, hinged at the spine.
        0, 0, -0.55, 0, 0, 0.55, -1, 0.25, 0.55, -1, 0.25, -0.55,
        // Right wing.
        0, 0, -0.55, 0, 0, 0.55, 1, 0.25, 0.55, 1, 0.25, -0.55
    ]);
    const uv = new Float32Array([
        0.5, 0, 0.5, 1, 0, 1, 0, 0,
        0.5, 0, 0.5, 1, 1, 1, 1, 0
    ]);
    const index = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    return geo;
}

/**
 * The wing mask, drawn once. White, so an instance colour can tint it.
 *
 * Four rounded shapes and a body: forewing and hindwing either side of a spine
 * at the middle of the canvas.
 */
function butterflyTexture(size = 64) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;

    ctx.fillStyle = 'rgba(255,255,255,1)';
    for (const side of [-1, 1]) {
        // Forewing: the long one, swept back toward the tail.
        ctx.beginPath();
        ctx.ellipse(mid + side * size * 0.27, size * 0.34,
            size * 0.24, size * 0.17, side * -0.42, 0, Math.PI * 2);
        ctx.fill();
        // Hindwing: rounder and smaller.
        ctx.beginPath();
        ctx.ellipse(mid + side * size * 0.20, size * 0.68,
            size * 0.17, size * 0.15, side * 0.30, 0, Math.PI * 2);
        ctx.fill();
    }
    // The body, which is what stops the two wings reading as two blobs.
    ctx.beginPath();
    ctx.ellipse(mid, size * 0.5, size * 0.035, size * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const _pos = { set: () => { } };

/** Drive one flyer group. Returns nothing; everything is in the matrices. */
function driveFlyer(group, time, presence, config, options = {}) {
    if (!group) return;
    group.mesh.visible = presence > 0.01;
    if (!group.mesh.visible) return;
    group.mesh.material.opacity = presence;
    group.mesh.material.transparent = presence < 0.999;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const s = new THREE.Vector3();

    for (let i = 0; i < group.count; i++) {
        const path = group.paths[i];
        pathAt(path, time, p);
        // Look where it is going: sample the path a moment ahead and face it,
        // which is what stops a flyer drifting sideways like a leaf.
        pathAt(path, time + 0.35, ahead);
        const yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
        // The flap squashes the wings rather than hinging them. At this
        // distance the silhouette is all that reads, and a squash reads.
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * path.flap + path.px));
        const size = options.size * (0.8 + path.tint * 0.4) * presence;

        e.set(0, yaw, 0);
        q.setFromEuler(e);
        s.set(size * flap, size, size);
        m.compose(p, q, s);
        group.mesh.setMatrixAt(i, m);
    }
    group.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Move everything alive. Called every frame.
 *
 * @param {number} hour
 * @param {number} elapsed  in-world seconds, which is also the animation clock
 * @param {number} snowCoverage  nothing flies in a snowstorm
 */
export function updateWildlife(hour, elapsed, snowCoverage = 0, config = GARDEN_CONFIG) {
    if (!butterflies) return;
    const W = config.world.wildlife;
    const calm = 1 - clamp01(snowCoverage);

    driveFlyer(butterflies, elapsed, presenceAt(hour, WINDOWS.butterflies) * calm,
        config, { size: W.butterflies.size });

    // Birds get two windows, dawn and dusk, so the presence is whichever is
    // open. A single window spanning both would have them out at noon.
    const birdPresence = Math.max(
        presenceAt(hour, WINDOWS.birdsDawn), presenceAt(hour, WINDOWS.birdsDusk));
    driveFlyer(birds, elapsed * 0.55, birdPresence, config, { size: W.birds.size });

    driveFlyer(bats, elapsed * 1.5, presenceAt(hour, WINDOWS.bats), config, { size: W.bats.size });

    // ---- Fireflies: position, and a blink each --------------------------
    const presence = presenceAt(hour, WINDOWS.fireflies) * calm;
    fireflies.mesh.visible = presence > 0.01;
    if (fireflies.mesh.visible) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        const colour = new THREE.Color();
        const base = new THREE.Color(W.fireflies.color);

        for (let i = 0; i < fireflies.count; i++) {
            const path = fireflies.paths[i];
            pathAt(path, elapsed * 0.55, p);
            // EACH ONE ON ITS OWN CLOCK. Fireflies blinking together would
            // read as a string of fairy lights rather than as insects.
            const blink = Math.pow(
                clamp01(Math.sin(elapsed * (1.1 + path.tint * 0.9) + path.px) * 0.5 + 0.5), 3);
            const size = 0.55 + blink * 0.9;
            q.identity();
            s.setScalar(size);
            m.compose(p, q, s);
            fireflies.mesh.setMatrixAt(i, m);
            colour.copy(base).multiplyScalar(0.25 + blink * 0.75);
            fireflies.mesh.setColorAt(i, colour);
        }
        fireflies.mesh.instanceMatrix.needsUpdate = true;
        if (fireflies.mesh.instanceColor) fireflies.mesh.instanceColor.needsUpdate = true;
        fireflies.mesh.material.opacity = presence;
        fireflies.mesh.material.transparent = true;
    }
}

export function disposeWildlife() {
    for (const group of [butterflies, fireflies, birds, bats]) {
        if (group && sceneRef) sceneRef.remove(group.mesh);
    }
    for (const item of disposables) {
        if (item && typeof item.dispose === 'function') item.dispose();
    }
    disposables.length = 0;
    butterflies = null;
    fireflies = null;
    birds = null;
    bats = null;
    sceneRef = null;
}
