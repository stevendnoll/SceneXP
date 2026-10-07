// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * critters.js - the cat in the pile and the squirrel on the fence (M6).
 *
 * THE CAT. Now and then, once a pile off the tarp is deep enough to hide a
 * cat and nobody is standing over it, a cat is curled up in it. Nothing
 * shows until the pile twitches, twice, and then the cat bursts out of it in
 * a spray of leaves and trots off: into the hedge if the pile is on the left
 * of the yard, or over the picket fence and the side gate if it is on the
 * right, ploughing through the leaves as it goes. Blowing the pile it is in
 * sends it out at once. Never in the tarp's pile, which the dive needs, and
 * at most once a round.
 *
 *   away       somewhere else, looking for a pile every few seconds
 *   hiding     in the pile, out of sight
 *   twitch     the pile twitches
 *   run        out and away along its route, hopping what is in the way
 *
 * THE SQUIRREL lives behind the side gate. It comes over the gate onto the
 * top of the picket fence, runs to a spot and sits watching the yard,
 * chatters when leaves fly past it, moves along now and then, and runs back
 * over the gate when the air reaches it or somebody comes too close.
 *
 *   away       behind the gate
 *   move       running along the fence (or hopping the gate)
 *   sit        sitting up, watching
 *   chatter    sitting up, scolding, its tail flicking
 *
 * PURE: both are stepped with what main.js measured (the piles, the air, the
 * leaves going past, who is near) and say what happened as events. main.js
 * does the bursts and draws them from what they say.
 */
import { inBox } from './sim.min.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const between = (pair, r) => pair[0] + (pair[1] - pair[0]) * r;
const inRect = (r, x, z, m = 0) => x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m;

// ---- Routes ------------------------------------------------------------------

/** Whether the straight line from a to b keeps `margin` clear of every box. */
export function segmentClear(a, b, boxes, margin) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 0.1));
    for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (inBox(boxes, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, margin)) return false;
    }
    return true;
}

/** Move along a route: legs of { x, z, hop } (a hop's height, or 0), each
 *  walked at `speed`, a hop taking at least `hopTime`. Updates x, y, z,
 *  heading, speed and stride on `who`; returns true at the end of the last
 *  leg. */
function follow(who, dt, speed, hopTime = 0.45) {
    const leg = who.route[who.leg];
    if (!leg) return true;
    if (who.legT === 0) {
        who.from = { x: who.x, z: who.z };
        const d = Math.hypot(leg.x - who.x, leg.z - who.z);
        who.legTime = Math.max(leg.hop ? hopTime : 0, d / speed, 1e-3);
        if (d > 1e-3) who.heading = Math.atan2(leg.x - who.x, leg.z - who.z);
    }
    who.legT += dt;
    const s = Math.min(1, who.legT / who.legTime);
    const px = who.x;
    const pz = who.z;
    who.x = who.from.x + (leg.x - who.from.x) * s;
    who.z = who.from.z + (leg.z - who.from.z) * s;
    who.y = (who.base || 0) + (leg.hop ? 4 * leg.hop * s * (1 - s) : 0) + ((leg.to ?? who.base ?? 0) - (who.base || 0)) * s;
    const moved = Math.hypot(who.x - px, who.z - pz);
    who.speed = dt > 0 ? moved / dt : 0;
    who.stride += moved;
    who.hopping = Boolean(leg.hop);
    if (s >= 1) {
        if (leg.to !== undefined) who.base = leg.to;
        who.leg += 1;
        who.legT = 0;
        return who.leg >= who.route.length;
    }
    return false;
}

// ---- The cat (pure) --------------------------------------------------------------

export function createCat() {
    return {
        state: 'away', t: 0, wait: 0, look: 0, cooldown: 0, visits: 0,
        x: 0, y: 0, z: 0, base: 0, heading: 0, speed: 0, stride: 0,
        visible: false, hopping: false, ploughing: false, twitches: 0, minDepth: 0,
        route: [], leg: 0, legT: 0, legTime: 0, from: null
    };
}

/** Gone, and every visit forgotten: a new round. */
export function resetCat(cat) {
    return Object.assign(cat, createCat());
}

/**
 * The way out from a pile at (x, z): into the hedge from the left of the
 * yard, or over the picket fence and the side gate from the right, always
 * by a lane clear of the porch and the maple's trunk. null if the first
 * steps would go through something solid.
 */
export function catRoute(x, z, K, yard, boxes) {
    const lane = clamp(Math.max(z, K.laneZ), yard.lawn.minZ + 1, yard.lawn.maxZ - 0.3);
    const legs = [];
    const start = { x, z };
    let at = start;
    if (Math.abs(lane - z) > 0.05) {
        legs.push({ x, z: lane, hop: 0 });
        at = { x, z: lane };
    }
    const fence = yard.walls.find((w) => w.axis === 'x' && w.height < 1.2);
    const left = !fence || x < (yard.lawn.minX + fence.at) / 2;
    if (left) {
        const edge = { x: yard.lawn.minX + 0.4, z: lane };
        legs.push({ x: edge.x, z: lane, hop: 0 }, { x: yard.lawn.minX - 0.5, z: lane, hop: 0 });
        if (!segmentClear(start, at, boxes, 0.2) || !segmentClear(at, edge, boxes, 0.2)) return null;
        return legs;
    }
    const near = { x: fence.at - 0.25, z: lane };
    const over = fence.at + 0.45;
    const gate = yard.lawn.minZ;
    legs.push(
        { x: near.x, z: lane, hop: 0 },
        { x: over, z: lane, hop: K.fenceHop },
        { x: over, z: gate + 0.5, hop: 0 },
        { x: over, z: gate - 0.6, hop: K.gateHop }
    );
    if (!segmentClear(start, at, boxes, 0.2) || !segmentClear(at, near, boxes, 0.2)) return null;
    return legs;
}

/**
 * The deepest pile a cat would curl up in: on our lawn, off the tarp and
 * off anything raised (the porch, a pumpkin), at least `shy` meters from
 * the person, with a way out. { x, z, height } or null.
 */
export function catPile(sim, yard, person, K, boxes) {
    const b = sim.bounds;
    const L = yard.lawn;
    let best = -1;
    let top = K.pile;
    const x0 = Math.max(0, Math.floor((L.minX + 0.5 - b.minX) / sim.cell));
    const x1 = Math.min(sim.nx - 1, Math.floor((L.maxX - 0.5 - b.minX) / sim.cell));
    const z0 = Math.max(0, Math.floor((L.minZ - b.minZ) / sim.cell));
    const z1 = Math.min(sim.nz - 1, Math.floor((L.maxZ - 0.5 - b.minZ) / sim.cell));
    for (let iz = z0; iz <= z1; iz++) {
        const z = b.minZ + (iz + 0.5) * sim.cell;
        for (let ix = x0; ix <= x1; ix++) {
            const c = iz * sim.nx + ix;
            if (sim.floor[c] > 0) continue;
            const h = sim.height[c];
            if (h < top) continue;
            const x = b.minX + (ix + 0.5) * sim.cell;
            if (inRect(yard.tarp, x, z, 0.4)) continue;
            if (person && Math.hypot(person.x - x, person.z - z) < K.shy) continue;
            top = h;
            best = c;
        }
    }
    if (best < 0) return null;
    const ix = best % sim.nx;
    const iz = (best - ix) / sim.nx;
    const x = b.minX + (ix + 0.5) * sim.cell;
    const z = b.minZ + (iz + 0.5) * sim.cell;
    if (!catRoute(x, z, K, yard, boxes)) return null;
    return { x, z, height: top };
}

/** Straight into the twitches at `pile` (the lab's "Cat now"), however
 *  shallow it is. */
export function forceCat(cat, pile) {
    return Object.assign(cat, { state: 'twitch', t: 0, x: pile.x, z: pile.z, twitches: 0, minDepth: -1, visible: false });
}

/** Out of the pile and off along its route. */
function bolt(cat, K, yard, boxes) {
    cat.route = catRoute(cat.x, cat.z, K, yard, boxes) || [{ x: yard.lawn.minX - 0.5, z: cat.z, hop: 0 }];
    cat.leg = 0;
    cat.legT = 0;
    cat.state = 'run';
    cat.visible = true;
    cat.y = 0;
    cat.base = 0;
    cat.t = 0;
}

/**
 * Advance the cat by `dt`. `input`:
 *   active    the round lets it come (playing or free play, its time is up)
 *   findPile  () => a pile from catPile, or null (only called to look)
 *   depthAt   (x, z) => how deep the leaves are there
 *   random    () => 0..1
 * Returns 'hide', 'twitch', 'out', 'gone' or null.
 */
export function stepCat(cat, dt, input, K, yard, boxes) {
    const step = dt > 0 ? dt : 0;
    cat.t += step;
    switch (cat.state) {
        case 'away': {
            cat.cooldown -= step;
            if (!input.active || cat.cooldown > 0) return null;
            cat.look += step;
            if (cat.look < K.look) return null;
            cat.look = 0;
            const pile = input.findPile();
            if (!pile) return null;
            Object.assign(cat, { state: 'hiding', t: 0, x: pile.x, z: pile.z, wait: between(K.wait, input.random()), twitches: 0, minDepth: K.pile * 0.5 });
            return 'hide';
        }
        case 'hiding':
        case 'twitch': {
            // The round over, or the yard behind a card, it slips away unseen.
            if (!input.active) {
                Object.assign(cat, { state: 'away', t: 0, cooldown: between(K.cooldown, input.random()) });
                return null;
            }
            // Its pile blown off it: out it comes, there and then.
            if (input.depthAt(cat.x, cat.z) < cat.minDepth) {
                bolt(cat, K, yard, boxes);
                cat.visits += 1;
                return 'out';
            }
            if (cat.state === 'hiding') {
                if (cat.t >= cat.wait) {
                    cat.state = 'twitch';
                    cat.t = 0;
                }
                return null;
            }
            if (cat.twitches < K.twitchAt.length && cat.t >= K.twitchAt[cat.twitches]) {
                cat.twitches += 1;
                return 'twitch';
            }
            if (cat.t >= K.outAt) {
                bolt(cat, K, yard, boxes);
                cat.visits += 1;
                return 'out';
            }
            return null;
        }
        case 'run': {
            const done = follow(cat, step, K.speed);
            cat.ploughing = !cat.hopping && !done;
            if (done) {
                Object.assign(cat, {
                    state: 'away', t: 0, visible: false, ploughing: false, speed: 0, hopping: false,
                    cooldown: between(K.cooldown, input.random())
                });
                return 'gone';
            }
            return null;
        }
        default:
            return null;
    }
}

// ---- The squirrel (pure) -------------------------------------------------------

export function createSquirrel(Q, random) {
    return {
        state: 'away', t: 0, timer: between(Q.first, random()), pose: 'run', visits: 0, chatters: 0,
        x: Q.fence.x, y: 0, z: Q.home.z, base: 0, heading: 0, speed: 0, stride: 0, hopping: false,
        visible: false, sinceLook: 0,
        route: [], leg: 0, legT: 0, legTime: 0, from: null
    };
}

function run(sq, route) {
    sq.route = route;
    sq.leg = 0;
    sq.legT = 0;
    sq.state = 'move';
    sq.pose = 'run';
    sq.t = 0;
}

/** Whether it should be off: air at it, or a person (or the neighbor) too
 *  close. */
function startled(sq, input, Q) {
    if (input.airAt(sq.x, sq.y + 0.1, sq.z) >= Q.air) return true;
    return (input.people || []).some((p) => p && Math.hypot(p.x - sq.x, p.z - sq.z) < Q.personNear);
}

/**
 * Advance the squirrel by `dt`. `input`:
 *   active       the yard is in view
 *   airAt        (x, y, z) => the blowers' air speed there
 *   leavesPast   () => how many fast leaves are near it (called a few
 *                times a second, while it sits)
 *   people       [{ x, z }] the person and the neighbor
 *   random       () => 0..1
 * Returns 'arrive', 'chatter', 'flee', 'gone' or null.
 */
export function stepSquirrel(sq, dt, input, Q) {
    const step = dt > 0 ? dt : 0;
    sq.t += step;
    const top = Q.fence.top;
    // A hop's height is over the straight line from where it leaves to where
    // it lands, which crosses the gate halfway up the fence.
    const over = Q.gateHop - top / 2;
    const home = () => [{ x: Q.fence.x, z: Q.onto, hop: 0 }, { x: Q.fence.x, z: Q.home.z, hop: over, to: 0 }];
    switch (sq.state) {
        case 'away':
            if (!input.active) return null;
            sq.timer -= step;
            if (sq.timer > 0) return null;
            Object.assign(sq, { x: Q.fence.x, z: Q.home.z, y: 0, base: 0, visible: true, chatters: 0 });
            run(sq, [
                { x: Q.fence.x, z: Q.onto, hop: over, to: top },
                { x: Q.fence.x, z: between(Q.perch, input.random()), hop: 0 }
            ]);
            sq.fleeing = false;
            sq.visits += 1;
            return 'arrive';
        case 'move': {
            if (!sq.fleeing && sq.base === top && !sq.hopping && startled(sq, input, Q)) {
                run(sq, home());
                sq.fleeing = true;
                return 'flee';
            }
            const done = follow(sq, step, Q.speed, 0.5);
            if (!done) return null;
            if (sq.fleeing) {
                Object.assign(sq, { state: 'away', visible: false, speed: 0, timer: between(Q.cooldown, input.random()) });
                return 'gone';
            }
            Object.assign(sq, { state: 'sit', pose: 'sit', t: 0, speed: 0, timer: between(Q.restless, input.random()) });
            // Sitting, it faces the yard.
            sq.heading = -Math.PI / 2;
            return null;
        }
        case 'sit':
        case 'chatter': {
            if (startled(sq, input, Q)) {
                run(sq, home());
                sq.fleeing = true;
                return 'flee';
            }
            if (sq.state === 'chatter') {
                if (sq.t >= Q.chatter) Object.assign(sq, { state: 'sit', pose: 'sit', t: 0 });
                return null;
            }
            sq.sinceLook += step;
            if (sq.sinceLook >= 0.15) {
                sq.sinceLook = 0;
                if (input.leavesPast() >= Q.many) {
                    Object.assign(sq, { state: 'chatter', pose: 'chatter', t: 0 });
                    sq.chatters += 1;
                    return 'chatter';
                }
            }
            if (input.active) sq.timer -= step;
            if (sq.timer <= 0) {
                run(sq, [{ x: Q.fence.x, z: between(Q.perch, input.random()), hop: 0 }]);
                sq.fleeing = false;
            }
            return null;
        }
        default:
            return null;
    }
}

/** How many awake leaves are within `near` meters of (x, y, z) and moving
 *  faster than `fast` m/s. Walks the awake leaves only. */
export function leavesNear(sim, x, y, z, near, fast) {
    let n = 0;
    const r2 = near * near;
    const f2 = fast * fast;
    for (let a = 0; a < sim.activeCount; a++) {
        const i = sim.active[a];
        const dx = sim.px[i] - x;
        const dy = sim.py[i] - y;
        const dz = sim.pz[i] - z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        if (sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i] + sim.vz[i] * sim.vz[i] >= f2) n++;
    }
    return n;
}

// ---- Drawing -------------------------------------------------------------------

const lambert = (color) => new THREE.MeshLambertMaterial({ color });

function mesh(geometry, material, x, y, z) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
}

/** A leg hung from its hip at (x, y, z), `length` long, with a paw. */
function leg(material, paw, x, y, z, length, r) {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    hip.add(mesh(new THREE.CylinderGeometry(r, r * 0.85, length, 6), material, 0, -length / 2, 0));
    hip.add(mesh(new THREE.SphereGeometry(r * 1.15, 6, 4), paw, 0, -length, r * 0.3));
    return hip;
}

/**
 * The cat: a tuxedo (black, white chest and socks), facing +z, its feet at
 * y = 0. Returns { group, update(cat, time) }.
 */
export function createCatFigure(K) {
    const C = K.colors;
    const group = new THREE.Group();
    group.name = 'cat';
    const body = new THREE.Group();
    group.add(body);
    body.scale.setScalar(K.scale);
    const fur = lambert(C.fur);
    const white = lambert(C.chest);
    const torso = mesh(new THREE.SphereGeometry(1, 14, 10), fur, 0, 0.19, 0);
    torso.scale.set(0.085, 0.085, 0.19);
    body.add(torso);
    const chest = mesh(new THREE.SphereGeometry(1, 10, 8), white, 0, 0.17, 0.12);
    chest.scale.set(0.06, 0.07, 0.07);
    body.add(chest);
    const head = new THREE.Group();
    head.position.set(0, 0.27, 0.2);
    body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.068, 14, 10), fur, 0, 0, 0));
    head.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), white, 0, -0.025, 0.045));
    for (const s of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.026, 0.055, 4), fur, s * 0.038, 0.06, -0.005);
        ear.rotation.z = -s * 0.25;
        head.add(ear);
        head.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), lambert(C.eyes), s * 0.027, 0.012, 0.058));
    }
    head.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), lambert(C.nose), 0, -0.008, 0.07));
    const legs = [];
    for (const [x, z] of [[-0.045, 0.12], [0.045, 0.12], [-0.045, -0.12], [0.045, -0.12]]) {
        const l = leg(fur, white, x, 0.16, z, 0.13, 0.018);
        body.add(l);
        legs.push(l);
    }
    // The tail: three pieces from the rump, up and curling over.
    const tail = new THREE.Group();
    tail.position.set(0, 0.22, -0.18);
    body.add(tail);
    let joint = tail;
    const tailParts = [];
    for (let k = 0; k < 3; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : 0.09;
        seg.rotation.x = k === 0 ? -0.7 : -0.35;
        seg.add(mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.1, 6), fur, 0, 0.045, 0));
        joint.add(seg);
        joint = seg;
        tailParts.push(seg);
    }
    group.visible = false;

    function update(cat, time) {
        group.visible = cat.visible;
        if (!cat.visible) return;
        group.position.set(cat.x, cat.y, cat.z);
        group.rotation.y = cat.heading;
        // A trot: diagonal pairs together. In a hop the legs stretch out.
        const gait = Math.sin(cat.stride * 9);
        legs.forEach((l, k) => {
            const pair = k === 0 || k === 3 ? 1 : -1;
            l.rotation.x = cat.hopping ? (k < 2 ? -0.9 : 0.9) : pair * gait * 0.6 * Math.min(1, cat.speed / 1.2);
        });
        body.rotation.x = cat.hopping ? -0.25 : 0;
        head.rotation.y = 0.15 * Math.sin(time * 1.3);
        tailParts.forEach((seg, k) => { seg.rotation.z = 0.25 * Math.sin(time * 3 + k); });
    }
    return { group, update };
}

/**
 * The squirrel: gray, a big tail, facing +z, its feet at y = 0. Returns
 * { group, update(sq, time) }.
 */
export function createSquirrelFigure(Q) {
    const C = Q.colors;
    const group = new THREE.Group();
    group.name = 'squirrel';
    const body = new THREE.Group();
    body.scale.setScalar(Q.scale);
    group.add(body);
    // Everything leans about the haunches, so sitting up is one turn.
    const lean = new THREE.Group();
    lean.position.set(0, 0.03, -0.04);
    body.add(lean);
    const fur = lambert(C.fur);
    const torso = mesh(new THREE.SphereGeometry(1, 12, 8), fur, 0, 0.03, 0.05);
    torso.scale.set(0.045, 0.045, 0.085);
    lean.add(torso);
    const belly = mesh(new THREE.SphereGeometry(1, 10, 6), lambert(C.belly), 0, 0.015, 0.07);
    belly.scale.set(0.035, 0.03, 0.06);
    lean.add(belly);
    const head = mesh(new THREE.SphereGeometry(0.034, 12, 8), fur, 0, 0.06, 0.13);
    head.scale.set(1, 0.95, 1.2);
    lean.add(head);
    for (const s of [-1, 1]) {
        lean.add(mesh(new THREE.ConeGeometry(0.011, 0.025, 4), fur, s * 0.018, 0.093, 0.12));
        lean.add(mesh(new THREE.SphereGeometry(0.007, 6, 4), lambert(C.eyes), s * 0.02, 0.07, 0.155));
    }
    // The tail: four puffs from the rump, up the back and over.
    const tail = new THREE.Group();
    tail.position.set(0, 0.03, -0.05);
    body.add(tail);
    const tailMat = lambert(C.tail);
    let joint = tail;
    const puffs = [];
    for (let k = 0; k < 4; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : 0.05;
        joint.add(seg);
        const puff = mesh(new THREE.SphereGeometry(1, 8, 6), tailMat, 0, 0.03, 0);
        puff.scale.set(0.03 + k * 0.004, 0.04, 0.03);
        seg.add(puff);
        joint = seg;
        puffs.push(seg);
    }
    group.visible = false;

    function update(sq, time) {
        group.visible = sq.visible;
        if (!sq.visible) return;
        group.position.set(sq.x, sq.y, sq.z);
        group.rotation.y = sq.heading;
        const running = sq.pose === 'run';
        // Running it bounds, nose down. Sitting it rears up on its haunches.
        lean.rotation.x = running ? 0.15 * Math.sin(sq.stride * 14) : -1.05;
        lean.position.y = running ? 0.03 + 0.012 * Math.abs(Math.sin(sq.stride * 14)) : 0.03;
        const flick = sq.pose === 'chatter' ? 0.35 * Math.sin(time * 28) : 0.08 * Math.sin(time * 1.7);
        puffs.forEach((seg, k) => {
            seg.rotation.x = running ? (k === 0 ? -1.2 : 0.15) : (k === 0 ? -0.35 : -0.45) + flick;
        });
        if (sq.pose === 'chatter') body.position.x = 0.004 * Math.sin(time * 41);
        else body.position.x = 0;
    }
    return { group, update };
}
