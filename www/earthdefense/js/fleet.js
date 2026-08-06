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
const sideways = { x: 0, y: 0, z: 0 };

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
 *  design number instead of an emergent one. */
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
    out.x = heading.x * cos + (px / length) * sin;
    out.y = heading.y * cos + (py / length) * sin;
    out.z = heading.z * cos + (pz / length) * sin;
    return out;
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

/** The nearest surviving structure to a point, preferring `body` when one is
 *  named and something on it is still standing. Returns the candidate record,
 *  or null when the last installation has fallen (in which case the game is
 *  already lost and nothing here has to care). */
export function nearestStructure(from, structures, body = null) {
    let best = null;
    let bestDistanceSq = Infinity;
    let bestOnBody = false;

    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!s || !s.position) continue;
        const dx = s.position.x - from.x, dy = s.position.y - from.y, dz = s.position.z - from.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        const onBody = body !== null && s.body === body;

        // A structure on the preferred body always beats one that is not, at
        // any distance. That is what keeps the group weights meaningful after
        // the first retarget instead of collapsing every raider onto Earth.
        if (best && !onBody && bestOnBody) continue;
        if (best && onBody === bestOnBody && distanceSq >= bestDistanceSq) continue;

        best = s;
        bestDistanceSq = distanceSq;
        bestOnBody = onBody;
    }
    return best;
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
 *  it: `structures()` hands back the live candidate list, `damageStructure`
 *  puts a shot on the ledger weapons owns, and `onPlayerHit` is called when a
 *  raider lands one on the visitor. Everything the fleet does to the world goes
 *  through one of those three, which is what keeps this file free of both
 *  structures.js and weapons-1.0.0. */
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
    }
    for (const b of beams) {
        b.active = false;
        b.age = 0;
        b.line.visible = false;
    }
    playerFireClock = 0;
    alert = null;
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

    return {
        hull,
        wing,
        hullMaterial: new THREE.MeshStandardMaterial({
            color: cfg.hullColor, roughness: 0.72, metalness: 0.28
        })
    };
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
        alive: true,
        mesh
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

    playerFireClock = Math.max(0, playerFireClock - dt);
    advanceBeams(dt);
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
        const replacement = nearestStructure(ship.position, structures, ship.preferredBody);
        if (replacement) {
            ship.targetStructureId = replacement.id;
            ship.state = STATE.TRANSIT;
        }
    } else {
        const distance = distanceToPoint(ship.position, target.position);
        ship.state = distance <= cfg.standoff * 1.15 ? STATE.ATTACK : STATE.TRANSIT;
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
        speed = cfg.cruiseSpeed * cfg.attackSpeedFactor;
        // A slow circle at standoff: out along the line from the installation,
        // plus a tangential nudge. An attacker that parks reads as a bug.
        normalise(away,
            ship.position.x - target.position.x,
            ship.position.y - target.position.y,
            ship.position.z - target.position.z);
        normalise(tangent,
            WORLD_UP.y * away.z - WORLD_UP.z * away.y,
            WORLD_UP.z * away.x - WORLD_UP.x * away.z,
            WORLD_UP.x * away.y - WORLD_UP.y * away.x);
        aim.x = target.position.x + away.x * cfg.standoff + tangent.x * cfg.standoff * 0.6;
        aim.y = target.position.y + away.y * cfg.standoff + tangent.y * cfg.standoff * 0.6;
        aim.z = target.position.z + away.z * cfg.standoff + tangent.z * cfg.standoff * 0.6;
    } else if (target) {
        aim.x = target.position.x; aim.y = target.position.y; aim.z = target.position.z;
    } else {
        // Nothing to attack: hold the current line rather than stopping dead.
        aim.x = ship.position.x + ship.heading.x * 2000;
        aim.y = ship.position.y + ship.heading.y * 2000;
        aim.z = ship.position.z + ship.heading.z * 2000;
    }

    normalise(desired, aim.x - ship.position.x, aim.y - ship.position.y, aim.z - ship.position.z);
    steerToward(ship.heading, desired, cfg.turnRate * dt, ship.heading);

    ship.position.x += ship.heading.x * speed * dt;
    ship.position.y += ship.heading.y * speed * dt;
    ship.position.z += ship.heading.z * speed * dt;
}

function fireAtStructure(ship, dt, target) {
    if (ship.state !== STATE.ATTACK || !target) {
        // The clock only runs while a raider is actually in position, so a long
        // approach does not bank a free opening shot.
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
        shared.hullMaterial.dispose();
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
