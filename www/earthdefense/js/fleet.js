// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fleet.js - The Martian raiders and the small amount of thinking they do.
 *
 * Experience code rather than a shared part, and deliberately so: everything
 * below is about THIS scenario. Twelve ships, three depth groups, two bodies
 * worth of installations to pick between. A later space game would want a
 * different shape entirely, and pretending otherwise would push scenario
 * knowledge into the shared kit, which is the one thing PRD 9.4 forbids.
 *
 * THE WHOLE FLEET EXISTS AT SPAWN. There is no spawner. Every ship is placed
 * once, at init, along the approach vector at its group's start distance, and
 * from then on it only ever flies. Waves that appear from nowhere are the
 * cheapest trick in the genre and this game does not use it: what the visitor
 * sees in the opening frame is a line of hostile lights strung back toward
 * Mars, and the "waves" are simply that line arriving.
 *
 * THE MOTION IS PLAIN NUMBERS. Positions, headings, and steering are all
 * `{ x, y, z }` objects and the meshes are told where to be afterwards, which
 * is the same pure-core / thin-shell split the shared modules use. It means the
 * steering can be tested with real values rather than through a scene graph,
 * and it is why `steerToward` and `assignBodies` are exported.
 *
 * NOTHING HERE IS RANDOM. The formation scatter comes from a hash of the ship
 * index, so the opening frame is identical on every visit and the arrival times
 * stay assertable. Math.random would have made both untestable in exchange for
 * a variation nobody would notice.
 *
 * THE PLANETS ARE SOLID FOR RAIDERS TOO, and they were not always. The steering
 * was a straight line to an aim point, so a raider sent to an installation on
 * the far side of Earth flew through the planet to reach it: measured at ten of
 * twelve ships below the surface in one run, the worst 6,282 units inside a
 * body with a radius of 6,371. The fix is in three parts, and each one covers a
 * case the others do not. A transit leg now ends a standoff height ABOVE its
 * beacon rather than on it, `avoidBody` bends a heading around the limb of
 * anything in the way, and a hard floor after the move is the backstop for
 * whatever the first two did not see coming.
 *
 * ONE DRAW CALL FOR EVERY RUNNING LIGHT. A hull 220 units long is about a
 * hundredth of a degree at 200,000 units, which is nothing, so a distant raider
 * is carried by its light and its HUD pip instead (PRD 6.3). All twelve lights
 * are vertices of a single Points object with attenuation switched OFF, so they
 * hold the same few pixels whether a ship is a thousand units away or two
 * hundred thousand, and the dead ones are dropped by shortening the draw range
 * rather than by any trickery with positions.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

const STATE = {
    TRANSIT: 'transit',
    ATTACK: 'attack',
    EVADE: 'evade',
    RETARGET: 'retarget'
};

const WORLD_UP = { x: 0, y: 1, z: 0 };

let cfg = null;
let hooks = {};
let group = null;
let host = null;        // the scene the group was added to, so dispose can undo it
let ships = [];
let shared = null;
let lights = null;          // { points, positions, attribute, geometry, material }
let lightTexture = null;    // the generated dot, released with everything else
let beams = [];
let playerFireClock = 0;
let alert = null;           // { id, label, body, position, age }

// Reused per-frame scratch, so a full fleet update allocates nothing.
const candidateList = [];
const aim = { x: 0, y: 0, z: 0 };
const desired = { x: 0, y: 0, z: 0 };
const away = { x: 0, y: 0, z: 0 };
const tangent = { x: 0, y: 0, z: 0 };
const binormal = { x: 0, y: 0, z: 0 };
const sideways = { x: 0, y: 0, z: 0 };
const perp = { x: 0, y: 0, z: 0 };
// The planets, read fresh every frame. The Moon moves 838 units a second, so a
// cached list is a raider steering around where the Moon used to be.
const bodyList = [];
// The velocity a station-keeping raider borrows from whatever it is circling.
const carry = { x: 0, y: 0, z: 0 };
// Retargeting is rare, so this is filled on demand rather than every frame.
const attackerCount = Object.create(null);

// ---- Pure core --------------------------------------------------------------

/** A deterministic -1..1 from an integer, standing in for Math.random.
 *
 *  Integer avalanche rather than a seeded PRNG because there is no sequence to
 *  keep: ship 7 wants the same offset every run, in any order, whether or not
 *  ships 0 through 6 were built first. */
export function hashUnit(n) {
    let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Turn a unit heading toward a unit target by at most `maxTurn` radians.
 *
 *  Exact rather than a normalised lerp, which turns by less than it promises
 *  and by a different amount depending on how far off the target already is.
 *  A ship that steers at a knowable rate is a ship whose turn radius is a
 *  design number instead of an emergent one.
 *
 *  THE RESULT IS RENORMALISED, and that is not tidiness. The rotation is only
 *  unit-preserving in exact arithmetic, so each turn leaves the heading a few
 *  parts in 10^16 off the unit sphere. That was invisible for as long as ships
 *  were chasing distant points, because a raider that catches its target's
 *  bearing takes the `angle <= maxTurn` branch and is handed an exactly unit
 *  vector, which wiped the error out several times a second.
 *
 *  Station keeping removed that accident. A raider holding a post beside a
 *  moving installation is perpetually a fraction over `maxTurn` off its aim
 *  point, so it takes the rotation branch on every single frame and never gets
 *  the reset. The error then compounds, and it compounds in the worst possible
 *  way: `clamp` starts pinning the dot product at 1 once the heading is longer
 *  than unit, `acos` returns 0, and the early return hands the inflated heading
 *  straight back, locking it in. A raider was measured at |heading| 1.68, which
 *  is a ship flying at 1.68 times its own speed limit, and two of the twelve
 *  eventually left the world entirely at tens of thousands of units a second.
 *
 *  One hypot and three divides per ship per frame closes it for good. */
export function steerToward(heading, target, maxTurn, out = {}) {
    const dot = clamp(heading.x * target.x + heading.y * target.y + heading.z * target.z, -1, 1);
    const angle = Math.acos(dot);

    if (!(maxTurn > 0) || angle === 0) return copyInto(out, heading);
    if (angle <= maxTurn) return copyInto(out, target);

    // The component of the target perpendicular to the heading, normalised.
    // At exactly 180 degrees that vanishes, so any perpendicular will do: the
    // ship has to commit to a side and one is as good as the other.
    let px = target.x - heading.x * dot;
    let py = target.y - heading.y * dot;
    let pz = target.z - heading.z * dot;
    let length = Math.hypot(px, py, pz);
    if (length < 1e-9) {
        const fallback = perpendicularTo(heading, sideways);
        px = fallback.x; py = fallback.y; pz = fallback.z;
        length = 1;
    }

    const cos = Math.cos(maxTurn), sin = Math.sin(maxTurn);
    // `normalise` reads all three components before writing any, so passing the
    // same object as `out` and as the source of `heading` is safe.
    return normalise(out,
        heading.x * cos + (px / length) * sin,
        heading.y * cos + (py / length) * sin,
        heading.z * cos + (pz / length) * sin);
}

/** Expand a group's weights into one body name per ship.
 *
 *  `{ earth: 2, moon: 2 }` becomes ['earth', 'earth', 'moon', 'moon'], and the
 *  list is INTERLEAVED rather than left in blocks so that a group cut short, or
 *  a group whose count does not match its weights, still splits roughly the way
 *  the weights asked for instead of sending every early ship to one body. */
export function assignBodies(weight, count) {
    const names = Object.keys(weight || {}).filter(k => weight[k] > 0);
    if (names.length === 0) return new Array(Math.max(0, count)).fill(null);

    // Round-robin over the distinct bodies, taking from each body's share until
    // it runs out, which is what interleaves them.
    const remaining = {};
    for (const name of names) remaining[name] = weight[name];
    const out = [];
    let i = 0;
    while (out.length < count) {
        let placed = false;
        for (let n = 0; n < names.length && out.length < count; n++) {
            const name = names[(i + n) % names.length];
            if (remaining[name] > 0) {
                remaining[name]--;
                out.push(name);
                placed = true;
                break;
            }
        }
        i++;
        // Every share spent but ships left over: start the shares again, so the
        // proportions repeat rather than the remainder all landing on one body.
        if (!placed) {
            for (const name of names) remaining[name] = weight[name];
        }
    }
    return out;
}

/** How high above its installation's horizon ship `index` of `total` circles.
 *
 *  ONE NUMBER PER SHIP, AND IT IS AN ELEVATION rather than a full position. A
 *  raider has a turn rate and no brakes, so it cannot be given a fixed post: it
 *  arrives, overshoots, and loops back, which was measured swinging a ship
 *  between 465 and 3,161 units of a target it was supposed to be holding
 *  station on. What it CAN do is circle, and a circle only needs to be told how
 *  high and how wide. `aimAtSlot` supplies the rest by aiming a little ahead of
 *  wherever the ship already is.
 *
 *  Spread by equal AREA over the sky above the installation, so the elevations
 *  do not bunch toward the zenith. `limit` keeps the highest of them clear of
 *  straight overhead, where an azimuth stops meaning anything.
 *
 *  ALWAYS ABOVE THE HORIZON, never below. Below is inside the planet the
 *  installation stands on, and half of the raiders orbiting through rock is the
 *  version of this that looks worse than the bug it replaced. */
export function formationElevation(index, total, limit = 0.8) {
    const count = Math.max(1, total);
    return Math.asin(clamp((index + 0.5) / count, 0, 1)) * limit;
}

/** The best surviving installation for a raider that has just lost its own.
 *  Returns the candidate record, or null when the last one has fallen (in which
 *  case the game is already lost and nothing here has to care).
 *
 *  `attackers` is `{ [structureId]: howManyRaidersAreAlreadyOnIt }`, and it is
 *  the whole reason this is not simply "the nearest one", which is what it used
 *  to be. When Earth's last installation falls, six raiders lose their target on
 *  the SAME FRAME, and nearest-wins sent all six to whichever lunar site
 *  happened to be closest. Twelve ships then shared three aim points and the
 *  Moon's defence became one fight instead of three.
 *
 *  THREE TESTS, IN ORDER. The preferred body first, so the group weights still
 *  mean something after a retarget and the whole fleet does not collapse onto
 *  one world. Then the fewest attackers, which is the spread. Then distance,
 *  which only breaks ties. Distance last is deliberate: a raider crossing to a
 *  quieter installation is the behaviour worth having, and it costs it a flight
 *  the visitor can see coming. Pass no census and the three tests collapse to
 *  the original two. */
export function leastPressuredStructure(from, structures, attackers = {}, body = null) {
    let best = null;
    let bestOnBody = false;
    let bestAttackers = Infinity;
    let bestDistanceSq = Infinity;

    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!s || !s.position) continue;
        const dx = s.position.x - from.x, dy = s.position.y - from.y, dz = s.position.z - from.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        const onBody = body !== null && s.body === body;
        const load = attackers[s.id] || 0;

        if (best) {
            if (onBody !== bestOnBody) { if (!onBody) continue; }
            else if (load !== bestAttackers) { if (load > bestAttackers) continue; }
            else if (distanceSq >= bestDistanceSq) continue;
        }

        best = s;
        bestOnBody = onBody;
        bestAttackers = load;
        bestDistanceSq = distanceSq;
    }
    return best;
}

/** `leastPressuredStructure` with the attacker census taken first.
 *
 *  Counted on demand rather than once a frame because a retarget is a rare
 *  event: it happens when an installation falls and at no other time, so a
 *  dozen ships worth of counting a handful of times a run is cheaper than the
 *  same work sixty times a second forever. */
function chooseStructure(ship, structures) {
    for (const key in attackerCount) delete attackerCount[key];
    for (let i = 0; i < ships.length; i++) {
        const other = ships[i];
        if (!other.alive || other === ship || !other.targetStructureId) continue;
        attackerCount[other.targetStructureId] = (attackerCount[other.targetStructureId] || 0) + 1;
    }
    return leastPressuredStructure(ship.position, structures, attackerCount, ship.preferredBody);
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function copyInto(out, v) { out.x = v.x; out.y = v.y; out.z = v.z; return out; }

function normalise(out, x, y, z) {
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) { out.x = 0; out.y = 0; out.z = -1; return out; }
    out.x = x / length; out.y = y / length; out.z = z / length;
    return out;
}

/** Any unit vector at right angles to `v`. Picks the axis `v` leans on least,
 *  so the cross product never lands on zero. Writes into `out`, because this is
 *  on the per-frame path for every evading raider. */
function perpendicularTo(v, out = { x: 0, y: 0, z: 0 }) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    const axisX = ax <= ay && ax <= az ? 1 : 0;
    const axisY = axisX === 0 && ay <= az ? 1 : 0;
    const axisZ = axisX === 0 && axisY === 0 ? 1 : 0;
    return normalise(out,
        v.y * axisZ - v.z * axisY,
        v.z * axisX - v.x * axisZ,
        v.x * axisY - v.y * axisX);
}

/** Bend a desired heading around a body it would otherwise fly into.
 *
 *  MEASURED FIRST: with nothing here at all, ten of the twelve raiders went
 *  below the surface of Earth on a single run, and the worst reached 6,282 units
 *  inside a body whose radius is 6,371. It was not a graze, it was the whole
 *  fleet taking the short way through the planet, and it happened because the
 *  steering was a straight line to an aim point and nothing in this file had
 *  ever been told the planets exist.
 *
 *  THE ANSWER IS THE LIMB, NOT A REPULSIVE FORCE. A force has to be tuned, it
 *  fights the turn rate, and it is either too weak near the surface or visible
 *  from a long way out. This asks one geometric question instead: is the body's
 *  angular radius, seen from here, wider than the angle between my heading and
 *  its centre. If it is, the path goes through it, and the answer is to fly at
 *  the edge of the disc rather than at the middle of it.
 *
 *  That has two properties worth the arithmetic. It engages EARLY, from tens of
 *  thousands of units out where a degree of correction is free, so a raider
 *  curves around a planet rather than swerving at it. And as the ship comes
 *  round, the limb sweeps ahead of it and the heading follows, which is a slow
 *  arc around the horizon that resolves itself the moment the target comes into
 *  view. Nothing has to decide when to stop avoiding.
 *
 *  `radius` should already carry whatever clearance is wanted. `desired` and
 *  `out` may be the same object. */
export function avoidBody(from, desired, centre, radius, out = { x: 0, y: 0, z: 0 }) {
    const dx = desired.x, dy = desired.y, dz = desired.z;
    const wx = centre.x - from.x, wy = centre.y - from.y, wz = centre.z - from.z;
    const distance = Math.hypot(wx, wy, wz);

    // Already inside the shell. The only heading worth having is straight out,
    // and the floor below will be doing the real work this frame anyway.
    if (distance <= radius) return normalise(out, -wx, -wy, -wz);

    const inv = 1 / distance;
    const cx = wx * inv, cy = wy * inv, cz = wz * inv;
    const along = dx * cx + dy * cy + dz * cz;
    // Flying away from it, so there is nothing in the way.
    if (along <= 0) { out.x = dx; out.y = dy; out.z = dz; return out; }

    const limb = Math.asin(clamp(radius * inv, -1, 1));
    if (Math.acos(clamp(along, -1, 1)) >= limb) { out.x = dx; out.y = dy; out.z = dz; return out; }

    // The component of the heading at right angles to the centre line is the
    // side the ship is already leaning toward, so rounding the body that way is
    // the shorter way round and the way it is already turning.
    let px = dx - cx * along, py = dy - cy * along, pz = dz - cz * along;
    const plen = Math.hypot(px, py, pz);
    if (plen < 1e-6) {
        // Dead on for the centre, with no side to prefer. Any perpendicular
        // will do, and picking one deterministically keeps the run repeatable.
        perpendicularTo({ x: cx, y: cy, z: cz }, perp);
        px = perp.x; py = perp.y; pz = perp.z;
    } else {
        px /= plen; py /= plen; pz /= plen;
    }

    const s = Math.sin(limb), c = Math.cos(limb);
    return normalise(out, cx * c + px * s, cy * c + py * s, cz * c + pz * s);
}

/** Angle in radians between a unit forward and the direction to a point. */
function angleTo(forward, dx, dy, dz) {
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) return 0;
    return Math.acos(clamp((forward.x * dx + forward.y * dy + forward.z * dz) / length, -1, 1));
}

// ---- Build ------------------------------------------------------------------

/** Place the whole fleet and return the group to add to the scene.
 *
 *  `hooksIn` is how the fleet reaches the rest of the game without importing
 *  it: `structures()` hands back the live candidate list, `bodies()` the
 *  planets as centres and radii, `damageStructure` puts a shot on the ledger
 *  weapons owns, and `onPlayerHit` is called when a raider lands one on the
 *  visitor. Everything the fleet does to the world goes through one of those
 *  four, which is what keeps this file free of structures.js, bodies-1.0.0 and
 *  weapons-1.0.0 alike. `bodies` is optional: a caller that offers none gets
 *  straight-line steering, which is how the suite drives the maths with plain
 *  numbers and nothing in the way. */
export function initFleet(config = EARTHDEFENSE_CONFIG, scene = null, hooksIn = {}) {
    disposeFleet();
    cfg = config.fleet;
    hooks = hooksIn || {};

    group = new THREE.Group();
    group.name = 'fleet';
    shared = buildSharedParts();

    let index = 0;
    for (let g = 0; g < cfg.groups.length; g++) {
        const spec = cfg.groups[g];
        const bodies = assignBodies(spec.weight, spec.count);
        for (let n = 0; n < spec.count; n++) {
            ships.push(buildShip(index, g, spec, bodies[n]));
            index++;
        }
    }

    buildLights(ships.length);
    buildBeams();
    assignTargets();
    writeMeshes();

    if (scene) {
        host = scene;
        scene.add(group);
    }
    return group;
}

/** Put the whole fleet back on the start line without rebuilding a single
 *  mesh. This is what a restart wants: twelve hulls, a light buffer, and six
 *  beams are already on the GPU, and throwing them away to make identical ones
 *  is churn a phone pays for. */
export function resetFleet() {
    if (!cfg) return 0;
    for (const ship of ships) {
        ship.position.x = ship.start.x;
        ship.position.y = ship.start.y;
        ship.position.z = ship.start.z;
        ship.heading.x = ship.startHeading.x;
        ship.heading.y = ship.startHeading.y;
        ship.heading.z = ship.startHeading.z;
        ship.state = STATE.TRANSIT;
        ship.alive = true;
        ship.mesh.visible = true;
        ship.fireTimer = cfg.fireInterval;
        ship.playerFireTimer = cfg.playerFireInterval;
        ship.evadeTimer = 0;
        ship.evadeCooldown = 0;
        ship.distanceToPlayer = Infinity;
        ship.distanceToTarget = Infinity;
    }
    for (const b of beams) {
        b.active = false;
        b.age = 0;
        b.line.visible = false;
    }
    playerFireClock = 0;
    alert = null;
    clearShields();
    assignTargets();
    writeMeshes();
    return ships.length;
}

function buildSharedParts() {
    // One hull, twelve meshes. A four-sided cone is a delta: three or four
    // pixels of it still reads as a pointed thing heading somewhere, which is
    // the only job geometry has at these distances.
    const hull = new THREE.ConeGeometry(cfg.hullWidth * 0.5, cfg.hullLength, 4);
    // ConeGeometry points along +Y. Object3D.lookAt aims a mesh's +Z at its
    // subject, so the nose is rotated onto +Z once here rather than per ship.
    hull.rotateX(Math.PI / 2);

    const wing = new THREE.BoxGeometry(cfg.hullWidth * 1.6, cfg.hullLength * 0.06, cfg.hullLength * 0.34);

    // One sphere, twelve meshes, the same as the hull. The MATERIAL cannot be
    // shared, because opacity is what each shield says about its own ship.
    const s = cfg.shield;
    const shield = new THREE.SphereGeometry(
        cfg.hullLength * s.radiusFactor, s.segments, Math.max(2, Math.round(s.segments / 2)));

    return {
        hull,
        wing,
        shield,
        hullMaterial: new THREE.MeshStandardMaterial({
            color: cfg.hullColor, roughness: 0.72, metalness: 0.28
        })
    };
}

/** A raider's shield bubble, parented to the ship's own group.
 *
 *  PARENTED RATHER THAN POSITIONED, which is the whole reason this is three
 *  lines instead of a pool with its own update. A child of the ship follows it
 *  for free, and it inherits the LOD hide in `writeMeshes` for free as well: a
 *  raider too far away to resolve into geometry should not have a bubble
 *  floating where its hull is not being drawn.
 *
 *  Additive and depth-write off, so it reads as light rather than as a ball of
 *  paint, and so two raiders overlapping never punch a hole in each other. */
function buildShield(mesh) {
    const material = new THREE.MeshBasicMaterial({
        color: cfg.shield.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const bubble = new THREE.Mesh(shared.shield, material);
    bubble.name = 'shield';
    bubble.visible = false;
    mesh.add(bubble);
    return { mesh: bubble, material, age: 0, peak: 0, active: false };
}

function buildShip(index, groupIndex, spec, body) {
    const a = cfg.approach;
    // The approach line, tilted off the Earth-to-Mars axis. See config.js for
    // why it is tilted at all.
    const direction = {
        x: Math.sin(a.azimuth),
        y: Math.sin(a.elevation),
        z: -1
    };
    normalise(direction, direction.x, direction.y, direction.z);

    const s = cfg.spread;
    const position = {
        x: direction.x * spec.startDistance + hashUnit(index * 3 + 1) * s.lateral,
        y: direction.y * spec.startDistance + hashUnit(index * 3 + 2) * s.vertical,
        z: direction.z * spec.startDistance + hashUnit(index * 3 + 3) * s.depth
    };

    const mesh = new THREE.Group();
    mesh.name = `raider-${index}`;
    mesh.add(new THREE.Mesh(shared.hull, shared.hullMaterial));
    const wing = new THREE.Mesh(shared.wing, shared.hullMaterial);
    wing.position.z = -cfg.hullLength * 0.22;
    mesh.add(wing);
    group.add(mesh);

    const ship = {
        id: `raider-${index}`,
        index,
        group: groupIndex,
        preferredBody: body,
        startDistance: spec.startDistance,
        position,
        heading: { x: 0, y: 0, z: 0 },
        state: STATE.TRANSIT,
        targetStructureId: null,
        fireTimer: cfg.fireInterval,
        playerFireTimer: cfg.playerFireInterval,
        evadeTimer: 0,
        evadeCooldown: 0,
        weavePhase: hashUnit(index * 7 + 5) * Math.PI,
        distanceToPlayer: Infinity,
        distanceToTarget: Infinity,
        // This ship's own circle around whatever it attacks, so four raiders on
        // one installation are four raiders rather than one light with a count
        // of four beside it. Both are constants for the life of the ship, which
        // is why a restart has nothing to put back.
        slotElevation: formationElevation(index, cfg.total, cfg.slotLatitude),
        // A per-ship radius on top of the shared standoff, so two ships that
        // pass through the same bearing are still not in the same place.
        slotDepth: hashUnit(index * 19 + 11),
        alive: true,
        mesh,
        shield: buildShield(mesh)
    };
    // Aimed inward from the start, so the opening frame shows a fleet already
    // on its way rather than twelve ships pointing in arbitrary directions.
    normalise(ship.heading, -position.x, -position.y, -position.z);
    // Kept so a restart can put the fleet back without rebuilding it.
    ship.start = { x: position.x, y: position.y, z: position.z };
    ship.startHeading = { x: ship.heading.x, y: ship.heading.y, z: ship.heading.z };

    ship.candidate = {
        id: ship.id,
        position: ship.position,
        allegiance: 'hostile',
        radius: cfg.effectRadius
    };
    return ship;
}

/** A soft round dot, drawn once into a small canvas.
 *
 *  A PointsMaterial with no map draws SQUARES, which is what the first round of
 *  screenshots showed: the fleet read as a scatter of orange blocks rather than
 *  as running lights, and a square is the one shape nothing in space is. The
 *  texture is generated rather than downloaded, so it costs nothing and needs no
 *  CSP exception. A browser with no canvas gets squares back, which is a worse
 *  picture rather than a broken one. */
function runningLightTexture() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext && canvas.getContext('2d');
    if (!g || !g.createRadialGradient || !THREE.CanvasTexture) return null;

    const half = size / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    // A hot core with a soft falloff, so a light reads as a light rather than
    // as a disc with an edge.
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

/** Every running light in one Points object, with attenuation off so a raider
 *  at 200,000 units is the same handful of pixels as one at 2,000. */
function buildLights(count) {
    const positions = new Float32Array(Math.max(1, count) * 3);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', attribute);
    lightTexture = runningLightTexture();
    const material = new THREE.PointsMaterial({
        color: cfg.lightColor,
        size: cfg.lightSize,
        sizeAttenuation: false,
        map: lightTexture,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
    });
    const points = new THREE.Points(geometry, material);
    // The buffer is rewritten every frame, so a bounding sphere computed once
    // would cull the whole fleet the moment it moved.
    points.frustumCulled = false;
    points.name = 'raider-lights';
    group.add(points);
    lights = { points, geometry, material, positions, attribute };
}

/** Pooled lines for incoming fire. Six is comfortably more than the number of
 *  shots that can be in flight at a twelve second cadence. */
function buildBeams() {
    for (let i = 0; i < 6; i++) {
        const positions = new Float32Array(6);
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(positions, 3);
        geometry.setAttribute('position', attribute);
        const material = new THREE.LineBasicMaterial({
            color: cfg.beamColor, transparent: true, opacity: 0, depthWrite: false
        });
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.visible = false;
        line.name = `raider-beam-${i}`;
        group.add(line);
        beams.push({ line, geometry, material, positions, attribute, active: false, age: 0 });
    }
}

/** Hand every ship its first structure. Runs once at init and again whenever a
 *  raider is left without one. */
function assignTargets() {
    const structures = readStructures();
    if (structures.length === 0) return;
    // Round-robin within each preferred body, so two raiders from the same
    // group open on two different installations rather than doubling up and
    // flattening one in half the time.
    const nextForBody = {};
    for (const ship of ships) {
        if (!ship.alive) continue;
        const onBody = structures.filter(s => !ship.preferredBody || s.body === ship.preferredBody);
        const pool = onBody.length > 0 ? onBody : structures;
        const cursor = nextForBody[ship.preferredBody] || 0;
        ship.targetStructureId = pool[cursor % pool.length].id;
        nextForBody[ship.preferredBody] = cursor + 1;
    }
}

function readStructures() {
    const list = hooks.structures ? hooks.structures() : null;
    return Array.isArray(list) ? list : [];
}

/** The planets, as centres and radii. Refreshed ONCE a frame into a list the
 *  whole fleet shares: twelve ships asking twice each would be twenty four
 *  calls and twenty four small allocations for three objects that cannot have
 *  changed in between.
 *
 *  A caller that offers no bodies gets an empty list and no avoidance, which is
 *  how the suite drives the steering with plain numbers and nothing in the way. */
function refreshBodies() {
    bodyList.length = 0;
    const list = hooks.bodies ? hooks.bodies() : null;
    if (!Array.isArray(list)) return bodyList;
    for (let i = 0; i < list.length; i++) {
        const body = list[i];
        if (body && body.centre && body.radius > 0) bodyList.push(body);
    }
    return bodyList;
}

function readBodies() { return bodyList; }

// ---- One frame --------------------------------------------------------------

/** Advance every raider.
 *
 *  `player` is `{ position, forward }`, the visitor's live flight state. It is
 *  passed in rather than imported for the same reason the hooks exist: the
 *  fleet should be drivable from a test with two plain objects.
 *
 *  Called AFTER the bodies have moved, so a raider steers at where its
 *  installation is this frame rather than where it was last one. On the Moon,
 *  which is travelling at 838 units a second, a frame of lag is a visible
 *  miss. */
export function updateFleet(deltaTime, player) {
    if (!cfg) return 0;
    const dt = deltaTime || 0;
    const structures = readStructures();
    refreshBodies();

    playerFireClock = Math.max(0, playerFireClock - dt);
    advanceBeams(dt);
    advanceShields(dt);
    advanceAlert(dt);

    let alive = 0;
    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!ship.alive) continue;
        alive++;
        updateShip(ship, dt, player, structures);
    }

    writeMeshes();
    return alive;
}

function updateShip(ship, dt, player, structures) {
    const target = findTarget(ship, structures);

    if (player && player.position) {
        const dx = player.position.x - ship.position.x;
        const dy = player.position.y - ship.position.y;
        const dz = player.position.z - ship.position.z;
        ship.distanceToPlayer = Math.hypot(dx, dy, dz);
    } else {
        ship.distanceToPlayer = Infinity;
    }

    // Held on the ship rather than recomputed, because the state decision below
    // and the fire clock further down are the same question asked twice.
    ship.distanceToTarget = target ? distanceToPoint(ship.position, target.position) : Infinity;

    ship.evadeCooldown = Math.max(0, ship.evadeCooldown - dt);
    if (ship.state === STATE.EVADE) {
        ship.evadeTimer -= dt;
        if (ship.evadeTimer <= 0) {
            ship.state = target ? STATE.TRANSIT : STATE.RETARGET;
            ship.evadeCooldown = cfg.evade.cooldown;
        }
    } else if (shouldEvade(ship, player)) {
        ship.state = STATE.EVADE;
        ship.evadeTimer = cfg.evade.duration;
    } else if (!target) {
        // RETARGET is a decision, not a place to sit: it resolves on the frame
        // it is entered, or there is nothing left to attack and the run is over.
        ship.state = STATE.RETARGET;
        const replacement = chooseStructure(ship, structures);
        if (replacement) {
            ship.targetStructureId = replacement.id;
            ship.distanceToTarget = distanceToPoint(ship.position, replacement.position);
            ship.state = STATE.TRANSIT;
        }
    } else {
        // THE TIGHT RADIUS, and deliberately tighter than the one the fire clock
        // runs in. The two are a hysteresis band rather than a duplication, and
        // collapsing them into one was tried and undone: raiders settle a little
        // OUTSIDE whichever radius flips them into station keeping, because that
        // is where they slow down, so widening this one to match the clock's
        // simply moved the whole formation out to sit on the clock's edge and
        // the Moon went back to never being fired on.
        //
        // Tight here pulls a raider in close. Wide there means the frame-by-
        // frame chatter along this edge, which is what holding station beside a
        // moving installation looks like, costs it nothing.
        ship.state = ship.distanceToTarget <= cfg.standoff * cfg.attackRadius
            ? STATE.ATTACK
            : STATE.TRANSIT;
    }

    steerAndMove(ship, dt, target);
    fireAtStructure(ship, dt, target);
    fireAtPlayer(ship, dt, player);
}

function findTarget(ship, structures) {
    if (!ship.targetStructureId) return null;
    for (let i = 0; i < structures.length; i++) {
        if (structures[i].id === ship.targetStructureId) return structures[i];
    }
    return null;
}

/** Close and NEARLY lined up, rather than the PRD's "holding a lock".
 *
 *  A raider has one hit point, so a lock and a kill are the same frame and a
 *  break-off triggered by the lock could never be seen. Triggering on the wider
 *  threat cone puts the dodge where it belongs: while the shot is being set up.
 *  Rate limited by a cooldown, or a raider that is being chased would weave
 *  forever and never be killable at all. */
function shouldEvade(ship, player) {
    if (!player || !player.position || !player.forward) return false;
    if (ship.evadeCooldown > 0) return false;
    if (ship.distanceToPlayer > cfg.evade.triggerDistance) return false;

    // From the PLAYER outward: the question is whether the visitor is pointing
    // at this ship, not whether this ship is pointing at the visitor.
    const angle = angleTo(player.forward,
        ship.position.x - player.position.x,
        ship.position.y - player.position.y,
        ship.position.z - player.position.z);
    return angle <= cfg.evade.threatCone;
}

function steerAndMove(ship, dt, target) {
    let speed = cfg.cruiseSpeed;
    // Nothing is borrowed unless this ship is holding station, so a raider in
    // transit or mid-dodge flies on its own engine exactly as it always did.
    carry.x = 0; carry.y = 0; carry.z = 0;

    if (ship.state === STATE.EVADE) {
        ship.weavePhase += cfg.evade.weaveRate * dt;
        speed = cfg.cruiseSpeed * cfg.evade.speedFactor;
        // Hold the current heading and slide the aim point sideways, so the
        // ship carves rather than turning back on itself.
        perpendicularTo(ship.heading, sideways);
        const swing = Math.sin(ship.weavePhase) * cfg.evade.weaveOffset;
        aim.x = ship.position.x + ship.heading.x * 2000 + sideways.x * swing;
        aim.y = ship.position.y + ship.heading.y * 2000 + sideways.y * swing;
        aim.z = ship.position.z + ship.heading.z * 2000 + sideways.z * swing;
    } else if (ship.state === STATE.ATTACK && target) {
        // STATION KEEPING, DONE IN THE TARGET'S FRAME. A raider circling an
        // installation is flying formation with it, so it borrows the whole of
        // its target's velocity and spends its own engine ONLY on the circle.
        // `attackSpeedFactor` is therefore a speed relative to the installation
        // rather than relative to space, and 420 units a second around a 1,200
        // unit circle is 0.35 radians a second, inside the 0.55 turn rate.
        //
        // THE CARRY USED TO BE PROJECTED ONTO THE HEADING, on the reasoning that
        // a ship only has a speed along its nose. That is true of the engine and
        // false of the manoeuvre, and the difference was not academic. On the
        // near half of a lunar lap the projection is +838 and the raider keeps
        // up. On the far half it is -838, `attackSpeedFloor` clamps it back to
        // 180, and the raider sheds roughly 650 units a second until it is
        // adrift. Measured over four minutes against a real lunar installation:
        // the gap swung between 734 and 23,538 units, the raider was inside its
        // own firing radius 49.5% of the time, and because `fireAtStructure`
        // resets the twelve second clock on every frame spent outside, it landed
        // its first shot at t=90s and settled at one shot per twenty seconds
        // instead of one per twelve. The same probe against a stationary Earth
        // site held 1,053 to 1,175 units, stayed in radius 100% of the time, and
        // fired on the interval exactly. The Moon was not harder to attack, it
        // was very nearly impossible to attack.
        //
        // Borrowing the velocity whole makes the two cases identical by
        // construction: in the installation's frame every raider now flies the
        // same circle whether that frame is standing still or moving at 838.
        if (target.velocity) {
            carry.x = target.velocity.x;
            carry.y = target.velocity.y;
            carry.z = target.velocity.z;
        }
        speed = cfg.cruiseSpeed * cfg.attackSpeedFactor;

        aimAtSlot(ship, target);
    } else if (target) {
        // TRANSIT AIMS ABOVE THE BEACON, NOT AT IT. A beacon stands 179 units
        // off the surface, so a raider that flies at the point itself arrives
        // with a 2,200 unit turn radius and no room to use it: measured at 129
        // to 288 units UNDER the surface on the near side, where nothing was
        // in the way at all. Aiming a standoff height above puts the end of the
        // transit leg exactly where the attack circle already is, so the ship
        // arrives level with its station rather than diving through it.
        const up = target.up || WORLD_UP;
        const rise = cfg.avoid.rise * cfg.standoff;
        aim.x = target.position.x + up.x * rise;
        aim.y = target.position.y + up.y * rise;
        aim.z = target.position.z + up.z * rise;
    } else {
        // Nothing to attack: hold the current line rather than stopping dead.
        aim.x = ship.position.x + ship.heading.x * 2000;
        aim.y = ship.position.y + ship.heading.y * 2000;
        aim.z = ship.position.z + ship.heading.z * 2000;
    }

    const reach = Math.hypot(
        aim.x - ship.position.x, aim.y - ship.position.y, aim.z - ship.position.z);
    normalise(desired, aim.x - ship.position.x, aim.y - ship.position.y, aim.z - ship.position.z);
    // NOT WHILE ATTACKING. The station-keeping circle is built in the
    // installation's own frame with a never-negative elevation, so it is above
    // the local horizon by construction, but parts of it pass well inside the
    // clearance shell this would defend. Avoidance there would fight the lap
    // rather than protect it. The floor after the move still holds.
    if (ship.state !== STATE.ATTACK) avoidPlanets(ship, reach);
    steerToward(ship.heading, desired, cfg.turnRate * dt, ship.heading);

    // The engine along the nose, plus whatever the target's frame is carrying.
    let vx = ship.heading.x * speed + carry.x;
    let vy = ship.heading.y * speed + carry.y;
    let vz = ship.heading.z * speed + carry.z;

    // ONE CAP ON THE TOTAL, which is where the old `attackSpeedCap` moved to and
    // why it is still worth having. A raider must never quietly become faster
    // than the visitor, so a target moving faster than this is left behind
    // honestly rather than matched. It binds on nothing the game currently
    // contains: the Moon's 838 plus a 420 unit circle is 1,258, and cruise and
    // the evade sprint are both under it too, so this only speaks up if a body
    // is ever given a speed no raider should be able to hold.
    const limit = cfg.cruiseSpeed * cfg.attackSpeedCap;
    const worldSpeed = Math.hypot(vx, vy, vz);
    if (worldSpeed > limit) {
        const scale = limit / worldSpeed;
        vx *= scale; vy *= scale; vz *= scale;
    }

    ship.position.x += vx * dt;
    ship.position.y += vy * dt;
    ship.position.z += vz * dt;

    keepAboveSurfaces(ship);
}

/** Bend `desired` around whichever planet is most in the way.
 *
 *  ONE BODY AT A TIME, and the worst offender. Avoiding all of them in turn
 *  would let the second correction undo the first, and there is no case in this
 *  scenario where two planets block the same path: the nearest other body is
 *  63,000 units away and 1,737 across.
 *
 *  A body BEYOND the aim point is not in the way, however well it lines up.
 *  Without that check a raider on its way to an Earth installation would dodge
 *  Mars, which is 200,000 units past it. */
function avoidPlanets(ship, reach) {
    const bodies = readBodies();
    if (!bodies.length) return;

    let worst = null;
    let deepest = 0;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const shell = body.radius + cfg.avoid.clearance;
        const dx = body.centre.x - ship.position.x;
        const dy = body.centre.y - ship.position.y;
        const dz = body.centre.z - ship.position.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance - shell > reach) continue;          // past the destination
        if (distance <= shell) { worst = body; deepest = Infinity; break; }

        const along = (dx * desired.x + dy * desired.y + dz * desired.z) / distance;
        if (along <= 0) continue;                        // heading away from it
        const limb = Math.asin(clamp(shell / distance, -1, 1));
        const intrusion = limb - Math.acos(clamp(along, -1, 1));
        if (intrusion > deepest) { deepest = intrusion; worst = body; }
    }

    if (worst) {
        avoidBody(ship.position, desired, worst.centre,
            worst.radius + cfg.avoid.clearance, desired);
    }
}

/** The hard floor, and the last word. Steering is a plan and a plan can be
 *  beaten: a raider already committed at cruise cannot always out-turn a body,
 *  the Moon can arrive somewhere a ship already is, and an evading raider weaves
 *  wherever the weave takes it. This is the same guarantee the visitor's own
 *  ship gets from `altitudeFloorAdjust`, said again here because the fleet
 *  reaches the planets through a hook rather than through that module. */
function keepAboveSurfaces(ship) {
    const bodies = readBodies();
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const c = body.centre;
        const dx = ship.position.x - c.x;
        const dy = ship.position.y - c.y;
        const dz = ship.position.z - c.z;
        const distance = Math.hypot(dx, dy, dz);
        const minimum = body.radius + cfg.avoid.floor;
        if (distance > 0 && distance < minimum) {
            const k = minimum / distance;
            ship.position.x = c.x + dx * k;
            ship.position.y = c.y + dy * k;
            ship.position.z = c.z + dz * k;
            return;
        }
    }
}

/** Write this ship's next aim point around `target` into the shared `aim`.
 *
 *  A CIRCLE, EXPRESSED AS A BEARING THAT LEADS. The station is not a place, it
 *  is "the same height I am at, a little further around than I am", recomputed
 *  every frame from where the raider actually is. Chasing a point that keeps
 *  moving ahead by a fixed angle is what settles a ship with a turn rate and no
 *  brakes into a steady circle. Aiming at a fixed post instead makes it
 *  overshoot, loop wide, and come back, which is both ugly and enough to carry
 *  it out of the radius its fire clock runs in.
 *
 *  THE FRAME IS THE INSTALLATION'S OWN. Azimuth is measured around the surface
 *  normal, and the elevation is never negative, so a raider circles in the sky
 *  above its target rather than through the body underneath it. On the Moon
 *  that is not a nicety: a beacon stands 1,916 units from the centre of a body
 *  with a radius of 1,737, so any station much below the local horizon is
 *  underground.
 *
 *  Falling back to the world's up when no normal is offered keeps this working
 *  for a caller with plain objects, which is how the suite drives it. */
function aimAtSlot(ship, target) {
    const up = target.up || WORLD_UP;

    // A local east and north, so an azimuth around the installation means
    // something. `normalise` hands back a usable perpendicular of its own when
    // the cross product vanishes, which is an installation standing directly
    // under the world's own up axis.
    normalise(tangent,
        WORLD_UP.y * up.z - WORLD_UP.z * up.y,
        WORLD_UP.z * up.x - WORLD_UP.x * up.z,
        WORLD_UP.x * up.y - WORLD_UP.y * up.x);
    binormal.x = up.y * tangent.z - up.z * tangent.y;
    binormal.y = up.z * tangent.x - up.x * tangent.z;
    binormal.z = up.x * tangent.y - up.y * tangent.x;

    // Where the raider stands now, as a bearing around the installation.
    normalise(away,
        ship.position.x - target.position.x,
        ship.position.y - target.position.y,
        ship.position.z - target.position.z);
    const azimuth = Math.atan2(
        away.x * binormal.x + away.y * binormal.y + away.z * binormal.z,
        away.x * tangent.x + away.y * tangent.y + away.z * tangent.z);

    // A little further around, at this ship's own height, on this ship's own
    // shell. Two raiders that reach the same bearing are still separated by the
    // other two, which is what keeps twelve ships reading as twelve.
    const ahead = azimuth + cfg.slotLead;
    const rise = Math.sin(ship.slotElevation);
    const ring = Math.cos(ship.slotElevation);
    const east = Math.cos(ahead) * ring;
    const north = Math.sin(ahead) * ring;
    // Held inside the ATTACK threshold on purpose. A station the state machine
    // does not count as attacking is a raider that flies to its post and then
    // resets its own fire clock for arriving.
    const radius = cfg.standoff * (1 + ship.slotDepth * cfg.slotDepth);

    aim.x = target.position.x + (up.x * rise + tangent.x * east + binormal.x * north) * radius;
    aim.y = target.position.y + (up.y * rise + tangent.y * east + binormal.y * north) * radius;
    aim.z = target.position.z + (up.z * rise + tangent.z * east + binormal.z * north) * radius;
    return aim;
}

/** The twelve second clock, run on PROXIMITY rather than on the ATTACK label.
 *
 *  The label is not a fact about where a raider is, it is a fact about which
 *  side of one threshold it was on when the frame started, and beside a moving
 *  installation it can flip every single frame. Resetting the clock on that flip
 *  meant a lunar attacker restarted its twelve seconds sixty times a second: in
 *  a fifteen minute run the three installations on the Moon were never fired on
 *  once, by any of the six raiders sent to do it.
 *
 *  `holdRadius` is the honest version of the same intent. A raider still has to
 *  arrive before its clock starts, so a long approach banks nothing, but once it
 *  is loitering in the neighbourhood a frame of drift does not cost it twelve
 *  seconds of work. */
function fireAtStructure(ship, dt, target) {
    if (!target || ship.distanceToTarget > cfg.standoff * cfg.holdRadius) {
        ship.fireTimer = cfg.fireInterval;
        return;
    }
    ship.fireTimer -= dt;
    if (ship.fireTimer > 0) return;
    ship.fireTimer = cfg.fireInterval;

    spawnBeam(ship.position, target.position);
    raiseAlert(target);
    if (hooks.damageStructure) hooks.damageStructure(target.id, cfg.fireDamage, ship);
}

function fireAtPlayer(ship, dt, player) {
    if (!player || !player.position) return;
    // The clock only runs while the visitor is in range, so closing on a raider
    // costs a beat before it answers rather than being met with an instant shot.
    if (ship.distanceToPlayer > cfg.playerFireRange) {
        ship.playerFireTimer = cfg.playerFireInterval;
        return;
    }
    ship.playerFireTimer -= dt;
    if (ship.playerFireTimer > 0) return;
    // The fleet-wide gap on top of the per-ship cadence. Twelve raiders in one
    // place should still feel like harassment rather than a wall of fire.
    if (playerFireClock > 0) return;

    ship.playerFireTimer = cfg.playerFireInterval;
    playerFireClock = cfg.playerFireGap;
    spawnBeam(ship.position, player.position);
    if (hooks.onPlayerHit) hooks.onPlayerHit(cfg.playerDamage, ship);
}

// ---- Shields ----------------------------------------------------------------

/** Light a raider's shield for a hit it absorbed.
 *
 *  `hitPointsRemaining` is what the ship has LEFT, which is what makes the
 *  flash a readout rather than an effect. A full shield lights up at
 *  `peakOpacity` and the last point at `minOpacity`, so four hits on the same
 *  raider are four visibly weaker flashes and the visitor can see a kill
 *  coming without any counter being drawn anywhere.
 *
 *  RE-TRIGGERED RATHER THAN STACKED. At four shots a second a raider takes its
 *  four hits inside one second, and spawning a fade per hit would leave four
 *  overlapping spheres summing to something much brighter than any of them.
 *  One bubble per ship, restarted, keeps every flash worth the same as the
 *  number it stands for.
 *
 *  Called for absorbed hits only. The fatal one is answered by the destruction
 *  burst, which is a better payoff than a fifth flicker. */
export function flashShield(id, hitPointsRemaining) {
    const ship = getShip(id);
    if (!ship || !ship.alive || !ship.shield || !cfg) return null;

    const s = cfg.shield;
    const max = Math.max(1, cfg.hitPoints);
    const fraction = clamp(hitPointsRemaining / max, 0, 1);

    const shield = ship.shield;
    shield.peak = s.minOpacity + (s.peakOpacity - s.minOpacity) * fraction;
    shield.age = 0;
    shield.active = true;
    shield.mesh.visible = true;
    shield.material.opacity = shield.peak;
    return shield;
}

function advanceShields(dt) {
    for (let i = 0; i < ships.length; i++) {
        const shield = ships[i].shield;
        if (!shield || !shield.active) continue;
        shield.age += dt;
        const life = shield.age / cfg.shield.life;
        if (life >= 1) {
            shield.active = false;
            shield.mesh.visible = false;
            shield.material.opacity = 0;
            continue;
        }
        shield.material.opacity = shield.peak * (1 - life);
    }
}

/** Put every bubble out. Used by a restart and by a raider's own death, so a
 *  ship cannot come back from a reset still glowing from its last run. */
function clearShields() {
    for (let i = 0; i < ships.length; i++) {
        const shield = ships[i].shield;
        if (!shield) continue;
        shield.active = false;
        shield.age = 0;
        shield.peak = 0;
        shield.material.opacity = 0;
        shield.mesh.visible = false;
    }
}

// ---- Alerts -----------------------------------------------------------------

function raiseAlert(target) {
    alert = {
        id: target.id,
        label: target.label || 'An installation',
        body: target.body || null,
        position: target.position,
        age: 0
    };
}

function advanceAlert(dt) {
    if (!alert) return;
    alert.age += dt;
    if (alert.age >= cfg.alertLife) alert = null;
}

/** The installation currently under attack, or null. Polled by the HUD rather
 *  than pushed, so a banner that is already up is not rewritten sixty times a
 *  second while the shots keep landing. */
export function getAlert() {
    return alert;
}

export function clearAlert() {
    alert = null;
}

// ---- Beams ------------------------------------------------------------------

function spawnBeam(from, to) {
    const slot = beams.find(b => !b.active) || beams[0];
    if (!slot) return null;
    slot.active = true;
    slot.age = 0;
    slot.positions[0] = from.x; slot.positions[1] = from.y; slot.positions[2] = from.z;
    slot.positions[3] = to.x; slot.positions[4] = to.y; slot.positions[5] = to.z;
    slot.attribute.needsUpdate = true;
    slot.line.visible = true;
    slot.material.opacity = 0.9;
    return slot;
}

function advanceBeams(dt) {
    for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        if (!b.active) continue;
        b.age += dt;
        const life = b.age / cfg.beamLife;
        if (life >= 1) {
            b.active = false;
            b.line.visible = false;
            continue;
        }
        b.material.opacity = 0.9 * (1 - life);
    }
}

// ---- The scene half ---------------------------------------------------------

/** Push the numbers into the meshes: position, facing, LOD, and the packed
 *  running-light buffer. The only part of this file that touches THREE. */
function writeMeshes() {
    if (!lights) return;
    let lit = 0;
    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!ship.alive) continue;

        ship.mesh.position.set(ship.position.x, ship.position.y, ship.position.z);
        ship.mesh.lookAt(
            ship.position.x + ship.heading.x,
            ship.position.y + ship.heading.y,
            ship.position.z + ship.heading.z
        );
        // Beyond the resolve distance the hull is a pixel of noise, so it is
        // switched off and the running light carries the ship on its own.
        ship.mesh.visible = ship.distanceToPlayer <= cfg.lodResolveDistance;

        lights.positions[lit * 3] = ship.position.x;
        lights.positions[lit * 3 + 1] = ship.position.y;
        lights.positions[lit * 3 + 2] = ship.position.z;
        lit++;
    }
    lights.attribute.needsUpdate = true;
    // Dead raiders leave by shortening the draw range, which is what draw
    // ranges are for. Parking their vertices somewhere harmless would work
    // until somebody flew there.
    lights.geometry.setDrawRange(0, lit);
}

function distanceToPoint(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

// ---- Inspection and lifecycle ----------------------------------------------

export function getShips() { return ships; }

export function getShip(id) {
    return ships.find(s => s.id === id) || null;
}

export function shipsRemaining() {
    let n = 0;
    for (const ship of ships) if (ship.alive) n++;
    return n;
}

/** Take a raider out of the game. The mesh is hidden rather than removed, so a
 *  restart can put the fleet back without rebuilding any geometry. */
export function destroyShip(id) {
    const ship = getShip(id);
    if (!ship || !ship.alive) return null;
    ship.alive = false;
    ship.mesh.visible = false;
    // The bubble is a child of that hidden group so it goes with it, but the
    // flags have to come back too or a restart would resume a dead fade.
    if (ship.shield) {
        ship.shield.active = false;
        ship.shield.material.opacity = 0;
        ship.shield.mesh.visible = false;
    }
    return ship;
}

/** Every living raider as a targeting candidate. Reused between frames, like
 *  the installation list, because this runs on every tick. */
export function fleetCandidates() {
    candidateList.length = 0;
    for (let i = 0; i < ships.length; i++) {
        if (ships[i].alive) candidateList.push(ships[i].candidate);
    }
    return candidateList;
}

export function getFleetGroup() { return group; }

export function disposeFleet() {
    // Taking the group back out of the scene, not only releasing what is in it.
    // An empty group left parented is still walked by the renderer every frame,
    // and a restart would leave one behind per run.
    if (host && group && typeof host.remove === 'function') host.remove(group);
    host = null;
    if (shared) {
        shared.hull.dispose();
        shared.wing.dispose();
        shared.shield.dispose();
        shared.hullMaterial.dispose();
    }
    // One material per ship, because opacity is per ship. The geometry above is
    // shared and released once.
    for (const ship of ships) {
        if (ship.shield) ship.shield.material.dispose();
    }
    if (lights) {
        lights.geometry.dispose();
        lights.material.dispose();
    }
    if (lightTexture) lightTexture.dispose();
    lightTexture = null;
    for (const b of beams) {
        b.geometry.dispose();
        b.material.dispose();
    }
    cfg = null;
    hooks = {};
    group = null;
    ships = [];
    shared = null;
    lights = null;
    beams = [];
    playerFireClock = 0;
    alert = null;
    candidateList.length = 0;
}

export const __test__ = {
    STATE,
    // Read through functions rather than exported directly: dispose replaces
    // both, so a captured reference would go stale after a restart.
    allBeams: () => beams,
    getLights: () => lights
};
