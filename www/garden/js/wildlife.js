// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wildlife.js - Butterflies, fireflies, birds, bats and ducks.
 *
 * ---- NONE OF THE FOUR THAT FLY ARE SWITCHED ON ----
 *
 * All four sit behind `world.wildlife.enabled` and all four are currently
 * false. That is a product decision and not a state of disrepair: the
 * butterflies, birds and bats pulled the eye off the growing trees (M8-1), and
 * the fireflies came off later because neither drawing of them landed (M12-9).
 * Everything below is whole, tested and tuned, and each one comes back by
 * turning its own word to true.
 *
 * ---- THE DUCKS ARE ON, AND THEY DO NOT HAVE THAT PROBLEM ----
 *
 * The four above competed with the one thing this scene is about, which is
 * trees moving. Ducks are on the LAKE, which is already where the eye goes when
 * it leaves the plot, and they DRIFT rather than fly: at 51 to 78 m a duck
 * crosses a couple of pixels a second. They add life to the far half of the
 * view without asking for any of the attention.
 *
 * ---- AND THREE MORE WERE BUILT AND DELETED ----
 *
 * Bees on the wildflowers, butterflies at the blossom, and birds that perched
 * on the visitor's own branches, over 2026-08-30 and 31. All three read fine in
 * the arithmetic and none of them read on a phone, which is the section below.
 * They are gone rather than flagged off because the flocks above already cover
 * "a butterfly" and "a bird", and a second implementation that never worked is
 * only a thing to trip over. `config.js` has the full note and the names to
 * search git for.
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
 * or thousands of instances. There are eighteen fireflies. Composing eighteen
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
import { pondHalfWidth, pondWaterLevel } from './terrain.min.js';
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


/**
 * Where the ducks drift, as seeded closed paths on the water.
 *
 * ---- THE LAKE IS AN ELLIPSE AND THEY HAVE TO STAY IN IT ----
 *
 * Not in the BASIN, which is the dug bowl, but inside the WATERLINE, which is
 * where the ground actually falls below the water. Since M14-5 levelled the bed
 * those two differ by a bank several metres wide, and a duck on the bank is a
 * duck standing on grass.
 *
 * Each path is a slow closed loop rather than a wander, for the same reason the
 * flyers' are: a random walk needs state, drifts out of its box, and cannot be
 * asserted. A loop is a function of time, so a duck is exactly where it should
 * be on any frame, including the first one after a tab comes back.
 *
 * Pure and seeded, so they are the same three ducks on every visit.
 */
export function duckPaths(config = GARDEN_CONFIG, options = {}) {
    const D = config.world.wildlife.ducks;
    if (!D) return [];
    const P = config.world.pond;
    const random = makeRandom(config.world.seed ^ 0xD0CC5);
    const count = options.mobile ? D.countMobile : D.count;
    // The waterline, not the basin rim. `pondHalfWidth` is the bowl; the water
    // reaches `fill` of the way up it, and `keepInside` holds them well clear
    // of even that.
    const reach = duckWaterReach(config);
    const out = [];
    for (let i = 0; i < count; i++) {
        // A loop small enough that the whole of it stays inside the water,
        // placed anywhere in the part of the lake the loop leaves room for.
        const loop = 0.10 + random() * 0.12;
        const room = 1 - loop;
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * room;
        out.push({
            cx: P.x + Math.cos(a) * r * reach.x,
            cz: P.z + Math.sin(a) * r * reach.z,
            rx: loop * reach.x,
            rz: loop * reach.z,
            // Awkward speeds, so three ducks never fall into step.
            sx: 0.055 + random() * 0.045,
            sz: 0.050 + random() * 0.045,
            px: random() * 6.283,
            pz: random() * 6.283,
            bob: 0.7 + random() * 0.6,
            tint: random()
        });
    }
    return out;
}

/**
 * How far the water reaches, in metres, less the margin the ducks keep.
 *
 * SOLVED RATHER THAN GUESSED. The basin is dug by a smoothstep, so the
 * waterline is where `t * t * (3 - 2t) = fill` with `t = 1 - r`, and that has no
 * tidy closed form. A first attempt used `1 - cbrt(fill)` as an approximation
 * and put the ducks at 0.25 of the basin instead of 0.84: three birds huddled
 * in the very middle of the lake. Ten steps of bisection is exact enough and
 * follows `fill` if the lake is ever made fuller.
 */
export function duckWaterReach(config = GARDEN_CONFIG) {
    const D = config.world.wildlife.ducks;
    const P = config.world.pond;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (t * t * (3 - 2 * t) < P.fill) lo = t; else hi = t;
    }
    // `t` is measured inward from the rim, so the waterline is 1 - t.
    const share = (1 - (lo + hi) / 2) * (D ? D.keepInside : 0.6);
    return { x: pondHalfWidth(config.world) * share, z: P.halfDepth * share };
}

/**
 * Where the ducks live, and how far from it any of them ever gets.
 *
 * ---- THE LAKE'S CENTRE IS NOT WHERE THE DUCKS ARE ----
 *
 * `duckPaths` seeds each loop at a random point inside the water, so the three
 * of them sit wherever the seed put them: measured, seven metres off the lake's
 * own centre. The card's camera aimed at the centre of the water and the ducks
 * came out to one side of the frame, which is exactly what QA saw. The shot has
 * to be composed on the birds, and the birds are not where the arithmetic of the
 * pond says the middle is.
 *
 * `radius` IS ANALYTIC RATHER THAN SAMPLED, so no rare moment between two
 * samples can put a bird outside the frame, and it follows the loops on its own
 * if they are ever retuned.
 *
 * AND THE LOOP IS A BOX, NOT AN ELLIPSE. `duckAt` oscillates x and z at
 * INDEPENDENT frequencies and phases, so the path is a Lissajous figure that
 * fills the rectangle `rx` by `rz` rather than tracing its inscribed ellipse.
 * The furthest a duck gets from its own loop centre is therefore the
 * rectangle's CORNER and not its long axis. Bounding it by `max(rx, rz)` is the
 * obvious reading and it is too small by a fifth, which is a duck and a half of
 * frame: the walked paths caught it.
 *
 * Pure and seeded, so it is the same shot on every visit.
 */
export function lakeShot(config = GARDEN_CONFIG, options = {}) {
    const P = config.world.pond;
    const paths = duckPaths(config, options);
    if (!paths.length) return { x: P.x, z: P.z, radius: 0 };
    const x = paths.reduce((a, p) => a + p.cx, 0) / paths.length;
    const z = paths.reduce((a, p) => a + p.cz, 0) / paths.length;
    const radius = Math.max(...paths.map(
        (p) => Math.hypot(p.cx - x, p.cz - z) + Math.hypot(p.rx, p.rz)));
    return { x, z, radius };
}

/**
 * How far through its migration a duck is: 0 on the water, 1 away.
 *
 * ---- THE ONLY WILDLIFE IN THIS SCENE THE CALENDAR DRIVES ----
 *
 * Everything else here keeps HOURS, which is a time of day. This keeps a
 * season. Ducks go south for the winter, so they lift off in mid autumn and
 * come back as spring opens, and the lake is empty for the cold half of the
 * year. It is the same kind of seasonal beat the blossom is: something a
 * visitor watching a year notices happening rather than something always there.
 *
 * REBASED ON THE DEPARTURE, like `fruitStageAt`, because the away window runs
 * from 18.5 round through midnight to 3.0 and every off-by-one in this scene
 * has landed in exactly that sort of interval.
 */
export function duckFlightAt(hour, config = GARDEN_CONFIG) {
    const D = config.world.wildlife.ducks;
    if (!D || D.leaveAt === undefined) return 0;
    const at = (h) => wrapHour(h - D.leaveAt);
    const t = at(hour);
    const gone = D.span;
    const back = at(D.arriveAt);
    const down = back + D.span;
    if (t < gone) return smoothTo(t / gone);
    if (t < back) return 1;
    if (t < down) return 1 - smoothTo((t - back) / D.span);
    return 0;
}

/** Smoothstep on an already-clamped 0..1. */
function smoothTo(t) {
    const c = clamp01(t);
    return c * c * (3 - 2 * c);
}

/**
 * Where a duck is when it is `f` of the way through leaving.
 *
 * ONE PATH FOR BOTH DIRECTIONS. Arriving is leaving played backwards, which is
 * true of a real migration and saves the scene a second set of numbers that
 * could disagree with the first about where the lake is.
 *
 * ---- POSTURE IS NOT DISTANCE, AND CONFLATING THEM HID THE WHOLE ANIMATION ----
 *
 * The first version scaled the wings, the neck and the turn by `f`, the same
 * number that carries the birds away. So every one of them reached full only
 * once the duck was a speck. Measured, the wings peaked at 3.4 px when the body
 * was already 2.7: QA reported never seeing them, and reported the ducks
 * keeping their floating pose, and both were the same fault.
 *
 * `duckPosture` below rises to 1 over the first sixth of the flight, while the
 * birds are still close and about ten pixels across, and everything about how a
 * duck HOLDS itself reads from that. `f` is left to do only what it is for,
 * which is where the bird is.
 *
 * ---- AND THE CLIMB LAGS THE RUN ----
 *
 * An earlier attempt reached full height by 60 percent of the way while the
 * ground track was at 39, which left the water at 63 degrees: a helicopter. A
 * duck runs across the surface, gets up, and climbs shallow. Both curves are
 * powers of `f` chosen so the angle RISES through the flight, and so that the
 * first quarter of it happens NEAR THE WATER: at f = 0.25 they have travelled
 * twelve metres, which is what leaves the take-off somewhere it can be seen.
 */

/**
 * How far a duck is into its flying POSE, 0 sitting to 1 fully airborne.
 *
 * Deliberately not `f`. See the note above: this is the number the wings, the
 * neck and the heading read, and it is finished long before the bird is far.
 */
export function duckPosture(f, config = GARDEN_CONFIG) {
    const D = config.world.wildlife.ducks;
    const over = (D && D.postureOver) || 0.16;
    return smoothTo(Math.min(1, f / over));
}
export function duckFlightPos(swim, f, index, count, config = GARDEN_CONFIG) {
    const D = config.world.wildlife.ducks;
    const P = config.world.pond;
    const away = {
        x: P.x + D.awayX,
        y: D.awayHeight,
        z: P.z + D.awayZ
    };
    // The formation builds as they climb: on the water they are scattered, and
    // by the time they are specks they are a skein.
    const dx = away.x - swim.x;
    const dz = away.z - swim.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const rank = index - (count - 1) / 2;
    const side = index % 2 === 0 ? 1 : -1;
    const form = smoothTo(f);
    const bx = -fx * D.fileBehind * Math.abs(rank) + -fz * side * D.fileSide * Math.abs(rank);
    const bz = -fz * D.fileBehind * Math.abs(rank) + fx * side * D.fileSide * Math.abs(rank);

    const track = Math.pow(f, 2.2);      // the run, held near the water at first
    const climb = Math.pow(f, 2.5);      // and the climb, always a little behind
    const ground = Math.hypot(dx * track + bx * form, dz * track + bz * form);
    return {
        x: swim.x + dx * track + bx * form,
        z: swim.z + dz * track + bz * form,
        lift: away.y * climb,
        yaw: Math.atan2(fx, fz),
        // Nose up along the climb. Small, because the whole path averages 16
        // degrees, but it is the difference between a bird flying and a bird
        // sliding along an invisible ramp.
        pitch: Math.atan2(away.y * climb, Math.max(0.5, ground))
    };
}

/** Where one duck is at a time, and which way it is pointing. */
export function duckAt(path, t, config = GARDEN_CONFIG) {
    const D = config.world.wildlife.ducks;
    const s = D ? D.speed : 0.3;
    const x = path.cx + Math.sin(t * path.sx * s + path.px) * path.rx;
    const z = path.cz + Math.cos(t * path.sz * s + path.pz) * path.rz;
    // A moment ahead, which is what a duck faces: the derivative of the loop.
    const ahead = 0.6;
    const nx = path.cx + Math.sin((t + ahead) * path.sx * s + path.px) * path.rx;
    const nz = path.cz + Math.cos((t + ahead) * path.sz * s + path.pz) * path.rz;
    return { x, z, yaw: Math.atan2(nx - x, nz - z) };
}

// ---- State -----------------------------------------------------------------

let sceneRef = null;
let butterflies = null;
let fireflies = null;
let birds = null;
let bats = null;

let ducks = null;
let duckHeads = null;
let duckBills = null;
let duckWings = null;
let duckPaths_ = [];

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
    // THE FLAGS GATE CONSTRUCTION, NOT VISIBILITY. A creature that is off is
    // never built, so it costs no geometry, no instance matrices and no
    // per-frame walk. Hiding one would leave every one of those still being
    // paid for, which is the usual way a "removed" feature keeps its bill.
    const on = (W.enabled || {});

    // ---- Butterflies -------------------------------------------------------
    // A crossed pair of quads so a wing shows from any angle, flown through
    // the near foreground where 30 cm still covers a dozen pixels.
    if (on.butterflies) {
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
    }

    // ---- Fireflies ---------------------------------------------------------
    // MeshBasicMaterial and fog off: a firefly is a light, so it must not be
    // lit by the scene and must not dim with distance.
    //
    // A QUAD AND A FALLOFF, NOT A SPHERE. It used to be a 5 by 4 sphere, and a
    // sphere is a BODY: it has a silhouette, that silhouette has countable
    // edges, and it grows as it comes toward the lens. None of those are true
    // of a light. What is drawn now is one camera-facing card carrying a soft
    // radial glow, held at a constant size on screen by `driveFireflies`, so
    // what a visitor sees is a point of light with an edge that fades rather
    // than a green polygon on the grass.
    //
    // `depthWrite` off because the glow is mostly transparent and two of them
    // crossing must not punch each other out.
    if (on.fireflies) {
        const glow = fireflyTexture();
        fireflies = buildFlyer(
            mobile ? W.fireflies.countMobile : W.fireflies.count,
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                color: W.fireflies.color, map: glow, transparent: true,
                opacity: 1, fog: false, depthWrite: false
            }),
            W.fireflies.box, seed ^ 0xF11E);
        fireflies.mesh.name = 'fireflies';
        if (glow) disposables.push(glow);
        scene.add(fireflies.mesh);
    }

    // ---- Ducks -------------------------------------------------------------
    // TWO MESHES AND NOT ONE, because the head is what makes the silhouette
    // read as a bird. At this distance a duck is about 12 px of pale body and
    // 3 px of dark head, and the body alone is a floating leaf.
    if (on.ducks) {
        const D = W.ducks;
        duckPaths_ = duckPaths(config, { mobile });
        const bodyGeo = new THREE.SphereGeometry(0.5, 7, 5);
        // Long, low and narrow: a duck on water is mostly waterline.
        bodyGeo.scale(0.52, 0.42, 1.0);
        ducks = new THREE.InstancedMesh(
            bodyGeo,
            new THREE.MeshLambertMaterial({ color: W.ducks.bodyColor }),
            Math.max(1, duckPaths_.length));
        ducks.name = 'ducks';
        ducks.frustumCulled = false;
        duckHeads = new THREE.InstancedMesh(
            new THREE.SphereGeometry(0.5, 6, 5),
            new THREE.MeshLambertMaterial({ color: W.ducks.headColor }),
            Math.max(1, duckPaths_.length));
        duckHeads.name = 'duck-heads';
        duckHeads.frustumCulled = false;
        duckHeads.count = duckPaths_.length;
        ducks.count = duckPaths_.length;
        // ---- THE BILL, WHICH THE LAKE CARD IS WHAT EARNS ------------------
        // A cone laid along +Z so it points where the duck faces, drawn in its
        // own mesh because it is the one part of the bird that is not the
        // bird's colour. Two pixels out on the lake and nearly eight in the
        // card, which is where it does its work.
        // BLUNT, not pointed: a cylinder tapering to most of its width rather
        // than to nothing. A duck's bill is a paddle, and a cone at this size
        // reads as a heron. Rotated so its axis lies along +Z, which is where
        // the same yaw that turns the body points it.
        const billGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 6);
        billGeo.rotateX(Math.PI / 2);
        duckBills = new THREE.InstancedMesh(
            billGeo,
            new THREE.MeshLambertMaterial({ color: W.ducks.billColor }),
            Math.max(1, duckPaths_.length));
        duckBills.name = 'duck-bills';
        duckBills.frustumCulled = false;
        duckBills.count = duckPaths_.length;
        // ---- THE WINGS, WHICH ONLY EXIST IN FLIGHT --------------------
        // The same dihedral pair the birds and bats use, because at ten pixels
        // a wing is a silhouette and not an anatomy. What differs for a duck is
        // PROPORTION: long and narrow rather than broad, and beaten far faster.
        duckWings = new THREE.InstancedMesh(
            wingGeometry(),
            new THREE.MeshLambertMaterial({
                color: W.ducks.bodyColor, side: THREE.DoubleSide
            }),
            Math.max(1, duckPaths_.length));
        duckWings.name = 'duck-wings';
        duckWings.frustumCulled = false;
        duckWings.count = duckPaths_.length;
        disposables.push(ducks.geometry, ducks.material,
            duckHeads.geometry, duckHeads.material,
            duckWings.geometry, duckWings.material);
        scene.add(ducks);
        scene.add(duckHeads);
        scene.add(duckBills);
        scene.add(duckWings);
    }

    // ---- Birds -------------------------------------------------------------
    // Drawn against the sky, so a silhouette reads at any size.
    if (on.birds) {
        birds = buildFlyer(
            mobile ? W.birds.countMobile : W.birds.count,
            wingGeometry(),
            new THREE.MeshBasicMaterial({
                color: W.birds.color, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: false
            }),
            W.birds.box, seed ^ 0xB12D);
        birds.mesh.name = 'birds';
        scene.add(birds.mesh);
    }

    // ---- Bats --------------------------------------------------------------
    if (on.bats) {
        bats = buildFlyer(
            mobile ? W.bats.countMobile : W.bats.count,
            wingGeometry(),
            new THREE.MeshBasicMaterial({
                color: W.bats.color, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: false
            }),
            W.bats.box, seed ^ 0xBA75);
        bats.mesh.name = 'bats';
        scene.add(bats.mesh);
    }

    return { butterflies, fireflies, birds, bats, ducks, duckHeads, duckBills, duckWings };
}

/** Two triangles meeting at a spine: a pair of wings, from any angle. */
// The tip height of `wingGeometry` at |x| = 1. Named, because the flap's
// amplitude is derived from it and a bare 0.25 in that arithmetic is the sort
// of number that goes stale the moment the mesh changes.
const WING_TIP_Y = 0.25;

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

/**
 * The firefly's glow, drawn once: white, so the instance colour tints it, and
 * soft all the way out to nothing at the rim.
 *
 * THE ALPHA MUST REACH ZERO AT THE EDGE OF THE CARD or the quad shows as a
 * square, which is a worse artefact than the polygon this replaces. Hence the
 * gradient running to the half-width and the last stop being fully clear.
 *
 * Three stops rather than two, because a light is not a linear ramp: a small
 * near-solid core carries the insect and a wide faint halo carries the glow.
 */
function fireflyTexture(size = 64) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    const mid = size / 2;

    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.20, 'rgba(255,255,255,0.94)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.10)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * The frame every measurement in this scene is quoted at, in pixels of height.
 * Only a fallback here: the live viewport is what the scene actually hands in.
 */
export const REFERENCE_FRAME_PX = 800;

/**
 * How wide a firefly has to be DRAWN, in metres, to cover the same handful of
 * pixels wherever it is.
 *
 * This is the whole fix, and it is one line of arithmetic: pixels are
 * `(metres / depth) * pxPerRadian`, so metres are `depth * pixels /
 * pxPerRadian`. Size becomes a function of depth instead of a constant, which
 * is the exact inversion of what a body does and what a light needs.
 *
 * PURE, AND TAKING A NUMBER RATHER THAN A CAMERA, for the reason `updateBeds`
 * gives for the water level: the module has no camera and no window, and the
 * measurement is worth being able to assert without either.
 *
 * @param {number} depth  metres in front of the lens, along the view axis
 * @param {number} pxPerRadian  viewport height over the vertical field
 * @param {number} blink  0 to 1, how hard this one is glowing right now
 */
export function fireflyGlowSize(depth, pxPerRadian, config = GARDEN_CONFIG, blink = 0) {
    const F = config.world.wildlife.fireflies;
    // A frame we have not been told the size of is the reference one. Without
    // this, a first frame that arrives before the viewport is measured would
    // put every firefly at zero and they would flicker in from nothing.
    const perRad = pxPerRadian > 0
        ? pxPerRadian
        : REFERENCE_FRAME_PX / (config.camera.fov * Math.PI / 180);
    // Never behind the lens, and never in the half metre where the arithmetic
    // stops meaning anything.
    return Math.max(0.4, depth) * (F.sizePx * (1 + F.bloom * blink)) / perRad;
}

/**
 * How far in front of the lens a point is.
 *
 * The DEPTH along the view axis rather than the distance to the eye, because
 * that is what a perspective projection divides by. Using the radial distance
 * would draw the fireflies at the edges of a wide frame about 15 percent large,
 * which is small but is exactly the kind of thing this change exists to stop.
 * With no camera to ask, the radial distance is the honest answer.
 */
function viewDepth(p, eye, forward) {
    const dx = p.x - eye.x;
    const dy = p.y - eye.y;
    const dz = p.z - eye.z;
    if (!forward) return Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dx * forward.x + dy * forward.y + dz * forward.z;
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
 * @param {object} view  `{ camera, pxPerRadian }`, the live lens. Optional:
 *        without it the fireflies fall back to the composed viewpoint in the
 *        config, which is what the pure tests exercise.
 */
export function updateWildlife(hour, elapsed, snowCoverage = 0, config = GARDEN_CONFIG, view = null) {
    // ONE GUARD PER CREATURE, NEVER ONE FOR ALL OF THEM. This used to read
    // `if (!butterflies) return`, which was harmless while everything was
    // always built and became a bug the moment one creature could be switched
    // off on its own: the butterflies going would have taken the fireflies with
    // them, silently. `driveFlyer` already tolerates a null group.
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

    driveDucks(hour, elapsed, config);

    // ---- Fireflies: position, and a blink each --------------------------
    if (!fireflies) return;
    const presence = presenceAt(hour, WINDOWS.fireflies) * calm;
    fireflies.mesh.visible = presence > 0.01;
    if (fireflies.mesh.visible) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3();
        const colour = new THREE.Color();
        const base = new THREE.Color(W.fireflies.color);

        // ---- The lens, live ------------------------------------------------
        // THE LIVE ONE AND NOT THE CONFIGURED ONE, because both halves of it
        // move: the portrait layout widens the field to 72 degrees and dollies
        // straight back, and the window can be resized at any moment. A size
        // pinned to the composed camera would be a third out on a phone.
        const camera = view && view.camera ? view.camera : null;
        const pxPerRadian = view && view.pxPerRadian > 0 ? view.pxPerRadian : 0;
        const eye = camera ? camera.position : config.camera.position;
        // The card faces the lens exactly, which is what the camera's own
        // rotation means. Nothing else in this file needs to billboard, so
        // this is the one place it is done.
        let forward = null;
        if (camera) {
            q.copy(camera.quaternion);
            forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        } else {
            q.identity();
        }

        for (let i = 0; i < fireflies.count; i++) {
            const path = fireflies.paths[i];
            pathAt(path, elapsed * 0.55, p);
            // EACH ONE ON ITS OWN CLOCK. Fireflies blinking together would
            // read as a string of fairy lights rather than as insects.
            const blink = Math.pow(
                clamp01(Math.sin(elapsed * (1.1 + path.tint * 0.9) + path.px) * 0.5 + 0.5), 3);
            // THE BLINK IS BRIGHTNESS. It used to be size as well, running
            // from 0.55 to 1.45, which meant the nearest firefly at its
            // brightest was also its largest: 28.8 px of flat green. What
            // varies now is the colour below, and all the size does is the
            // small swell of `bloom`.
            const size = fireflyGlowSize(viewDepth(p, eye, forward), pxPerRadian, config, blink);
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

/**
 * Move the ducks.
 *
 * ON THE WATER'S OWN LEVEL, read from `pondWaterLevel` rather than carried as a
 * number here: the lake's surface has moved twice already (M14-5 re-measured
 * `fill`) and a second copy of that height would have put three birds in the
 * air or under the surface without anything failing.
 *
 * They are out at every hour. A duck asleep on the water looks exactly like a
 * duck awake on it at this distance, so a window would cost a draw call's worth
 * of bookkeeping to hide something nobody could see change.
 */
function driveDucks(hour, elapsed, config) {
    if (!ducks || !duckPaths_.length) return;
    const D = config.world.wildlife.ducks;
    const level = pondWaterLevel(config.world);
    const body = D.bodyLength;
    const flight = duckFlightAt(hour, config);
    // AWAY IS NOT HIDDEN, IT IS FAR. They recede past the fog ceiling and
    // dissolve, so there is no frame where three birds wink out. The meshes go
    // invisible only once nothing could be seen of them anyway, which saves the
    // per-frame walk for the cold half of the year.
    const gone = flight >= 0.999;
    ducks.visible = !gone;
    duckHeads.visible = !gone;
    if (duckBills) duckBills.visible = !gone;
    if (duckWings) duckWings.visible = !gone && flight > 0.005;
    if (gone) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();

    for (let i = 0; i < duckPaths_.length; i++) {
        const path = duckPaths_[i];
        const swim = duckAt(path, elapsed, config);
        // A slow bob, each on its own clock, so three of them never rise
        // together like a row of floats. It goes as they leave the water.
        const bob = Math.sin(elapsed * path.bob * 0.55 + path.px)
            * D.bob * (1 - flight);

        let x = swim.x;
        let z = swim.z;
        let yaw = swim.yaw;
        let lift = 0;
        let pitch = 0;
        // POSTURE, NOT DISTANCE. Finished within the first sixth of the flight,
        // while the birds are still close and about ten pixels across, which is
        // the only window in which any of this can be seen at all.
        const pose = flight > 0 ? duckPosture(flight, config) : 0;
        if (flight > 0) {
            const air = duckFlightPos(swim, flight, i, duckPaths_.length, config);
            x = air.x;
            z = air.z;
            lift = air.lift;
            pitch = air.pitch * pose;
            // The heading swings from wherever it was drifting onto the line of
            // travel, rather than snapping to it at the first frame.
            yaw = swim.yaw + Math.atan2(Math.sin(air.yaw - swim.yaw),
                Math.cos(air.yaw - swim.yaw)) * pose;
        }
        // YXZ, so the yaw is applied about the world's up and the pitch about
        // the bird's own wing axis. In the default order a pitched duck would
        // also roll, which at this size reads as a bird falling over.
        e.set(pitch, yaw, 0, 'YXZ');
        q.setFromEuler(e);

        const y = level + body * 0.16 + bob + lift;
        p.set(x, y, z);
        s.setScalar(body);
        m.compose(p, q, s);
        ducks.setMatrixAt(i, m);

        // The head rides forward and up, in the duck's OWN frame, so it stays
        // at the front however the bird is pointing. IN FLIGHT IT REACHES: a
        // duck on water tucks its neck and a duck in the air stretches it out,
        // and that change of outline is worth more than the wings at this size.
        const reach = body * (0.34 + 0.30 * pose);
        p.set(x + Math.sin(yaw) * reach,
            y + body * (0.24 - 0.14 * pose) + Math.sin(pitch) * reach,
            z + Math.cos(yaw) * reach);
        s.setScalar(body * 0.30);
        m.compose(p, q, s);
        duckHeads.setMatrixAt(i, m);

        // The bill, on the same heading, a little further forward again. It
        // rides the head's own reach so it stays on the front of the face
        // whichever way the bird is pointing and however far it has stretched
        // its neck to fly.
        if (duckBills) {
            const out = reach + body * D.billReach;
            p.set(x + Math.sin(yaw) * out,
                y + body * (0.24 - 0.14 * pose) + Math.sin(pitch) * out,
                z + Math.cos(yaw) * out);
            s.set(body * D.billWidth, body * D.billWidth * D.billFlat, body * D.billLength);
            m.compose(p, q, s);
            duckBills.setMatrixAt(i, m);
        }

        if (duckWings) {
            // THE FLAP IS A SQUASH, NOT A HINGE, which is this file's own rule
            // for everything it draws: at this distance the silhouette is all
            // that reads. A hinge would move a wingtip by a pixel and a half.
            // A full beat is up AND down, so the dihedral is signed rather
            // than folded: `abs` would have beaten at twice the rate with the
            // wings never going below level.
            const beat = Math.sin(elapsed * D.flapHz * Math.PI * 2 + path.px);
            p.set(x, y + body * 0.10, z);
            // SIZED BY THE POSE, NOT BY THE DISTANCE. This is the whole of
            // M23-2: scaled by `flight` the wings reached full span only once
            // the duck was a speck.
            //
            // THE STROKE IS AN ANGLE. `wingGeometry` puts its tips at y = 0.25
            // for |x| = 1, so the Y scale that reaches a given sweep is
            // tan(angle) / 0.25 times the span. Setting that multiplier by hand
            // is what left the wings sweeping six degrees: a shiver rather than
            // a flap, which QA read as a hummingbird.
            // HALF, BECAUSE THE MESH IS ALREADY TWO UNITS WIDE. `wingGeometry`
            // runs from x = -1 to x = +1, so its scale is a HALF span. Handing
            // it the full one drew wings twice as long as the config asked for:
            // a span three times the body against a real duck's one and a half,
            // which QA saw as the wings being too long. The name says span, so
            // the number is a span and the halving lives here.
            const halfSpan = D.wingSpan * body * 0.5;
            const sweep = Math.tan(D.flapDegrees * Math.PI / 180) / WING_TIP_Y;
            s.set(halfSpan * pose,
                halfSpan * sweep * beat * pose,
                D.wingChord * body * pose);
            m.compose(p, q, s);
            duckWings.setMatrixAt(i, m);
        }
    }
    // EVERY MESH WRITTEN ABOVE IS MARKED HERE. An instanced matrix buffer is
    // not uploaded until it is flagged, so a mesh that is written and not
    // flagged draws at the IDENTITY: the bills shipped for one round as three
    // unit cones standing at the world origin, which is nowhere near a duck and
    // is why QA could not see them. There is a test that pairs these two lists.
    ducks.instanceMatrix.needsUpdate = true;
    duckHeads.instanceMatrix.needsUpdate = true;
    if (duckBills) duckBills.instanceMatrix.needsUpdate = true;
    if (duckWings) duckWings.instanceMatrix.needsUpdate = true;
}

export function disposeWildlife() {
    for (const group of [butterflies, fireflies, birds, bats]) {
        if (group && sceneRef) sceneRef.remove(group.mesh);
    }
    for (const mesh of [ducks, duckHeads, duckBills, duckWings]) {
        if (mesh && sceneRef) sceneRef.remove(mesh);
    }
    for (const item of disposables) {
        if (item && typeof item.dispose === 'function') item.dispose();
    }
    disposables.length = 0;
    butterflies = null;
    fireflies = null;
    ducks = null;
    duckHeads = null;
    duckBills = null;
    duckWings = null;
    duckPaths_ = [];
    birds = null;
    bats = null;
    sceneRef = null;
}
