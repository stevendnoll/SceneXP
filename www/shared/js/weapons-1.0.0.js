// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * weapons.js - Automatic fire, damage bookkeeping, and shot effects
 * (shared engine part).
 *
 * There is no fire control here and no trigger to wire up. The caller hands
 * this module a target every frame and it fires while there is one, which is
 * the whole control scheme: the reticle IS the weapon.
 *
 * HITS RESOLVE THE MOMENT THEY ARE FIRED. The tracer is scenery. At closing
 * speeds of thousands of units a second a simulated projectile is unreliable
 * and, worse, feels broken: the visitor sees a hit and the game disagrees a
 * moment later. So `updateWeapons` decides the damage immediately and the
 * streak that follows is a visual echo that is allowed to arrive late. Getting
 * this backwards is the single most tempting mistake in the module.
 *
 * CADENCE IS A COUNT, NOT A BOOLEAN. `stepCadence` returns how many shots a
 * frame earned, so a long frame fires the right number rather than silently
 * dropping the rest. It is also CAPPED, because the other failure mode is a tab
 * that was backgrounded for a minute returning and emptying four hundred shots
 * into whatever happens to be centred. The cap discards the backlog rather than
 * deferring it, since a delayed burst is the same bug arriving late.
 *
 * NOTHING HERE KNOWS WHAT A SHIP LOOKS LIKE. Muzzle positions are passed in by
 * the caller (the cockpit owns those), the damageable registry is ids and
 * numbers, and the hit points per target come from the caller's config rather
 * than from any rule in this file. That is what makes the module reusable by a
 * space game that has no Earth in it.
 *
 * EVERY EFFECT IS POOLED. Tracers, hit flashes, and destruction bursts are all
 * preallocated at init and recycled, so a firefight allocates nothing and the
 * garbage collector never stutters the frame.
 */

const DEFAULTS = {
    shotsPerSecond: 4,
    damagePerShot: 1,
    maxShotsPerFrame: 4,

    tracerSpeed: 30000,
    tracerLife: 0.35,
    tracerLength: 900,
    tracerColor: 0xffd9a0,

    flashLife: 0.18,
    flashColor: 0xfff0c4,
    flashScale: 1.8,

    burstLife: 0.9,
    burstColor: 0xffa657,
    burstParticles: 24,
    burstSpeed: 900,
    burstSize: 90,

    // Fallback radius for the flash and burst when a candidate carries none.
    effectRadius: 200
};

const damageables = new Map();   // id -> { id, hitPoints, maxHitPoints }

let settings = null;
let group = null;
let host = null;        // the scene the group was added to, so dispose can undo it
let tracers = [];
let flashes = [];
let flashGeometry = null;   // one sphere, shared by every flash in the pool
let bursts = [];
let accumulator = 0;
let interval = 0.25;
let muzzleIndex = 0;
let hitCallback = null;
let destroyedCallback = null;

// ---- Pure core -------------------------------------------------------------

/** How many shots a frame of `dt` earned, and what is carried into the next.
 *
 *  The returned accumulator is always in [0, interval), so nothing accumulates
 *  across frames except the genuine remainder. When the cap bites, the excess
 *  whole shots are DISCARDED rather than carried: the cap exists to stop a
 *  backgrounded tab firing a burst on return, and deferring the burst by one
 *  frame would not stop it at all.
 */
export function stepCadence(accumulatorIn, dt, intervalIn, maxShots = DEFAULTS.maxShotsPerFrame) {
    if (!(intervalIn > 0)) return { shots: 0, accumulator: 0 };

    const total = Math.max(0, (accumulatorIn || 0) + (dt || 0));
    const earned = Math.floor(total / intervalIn);
    const remainder = total - earned * intervalIn;

    return { shots: Math.min(earned, maxShots), accumulator: remainder };
}

// ---- The damageable registry -----------------------------------------------

/** Put something on the books at a starting hit point total. Re-registering an
 *  id resets it, which is what a restart wants. */
export function registerDamageable(id, hitPoints) {
    const entry = { id, hitPoints, maxHitPoints: hitPoints };
    damageables.set(id, entry);
    return entry;
}

/** Take hit points off. Returns the surviving state, or null for an id nobody
 *  registered. Damage to something already at zero is a no-op that reports
 *  `destroyed: false`, so a caller cannot be told twice that the same target
 *  died. */
export function applyDamage(id, amount = 1) {
    const entry = damageables.get(id);
    if (!entry) return null;
    if (entry.hitPoints <= 0) return { id, hitPoints: 0, destroyed: false };

    entry.hitPoints = Math.max(0, entry.hitPoints - amount);
    return { id, hitPoints: entry.hitPoints, destroyed: entry.hitPoints === 0 };
}

export function getDamageable(id) {
    return damageables.get(id) || null;
}

export function isAlive(id) {
    const entry = damageables.get(id);
    return !!entry && entry.hitPoints > 0;
}

export function clearDamageables() {
    damageables.clear();
}

export function onHit(cb) { hitCallback = cb; }
export function onDestroyed(cb) { destroyedCallback = cb; }

// ---- Shell -----------------------------------------------------------------

/** Build the effect pools and add them to the scene.
 *  `config` is the weapons slice; `scene` is the WORLD scene, not the overlay,
 *  because a tracer crossing three thousand kilometres belongs to the world. */
export function initWeapons(config = {}, scene = null) {
    disposeWeapons();
    settings = { ...DEFAULTS, ...config };

    interval = settings.shotsPerSecond > 0 ? 1 / settings.shotsPerSecond : 0;
    // Primed, so the first frame with a target fires at once. Waiting a quarter
    // second for the first shot is exactly what makes automatic fire read as
    // passive, and this is the cheapest half of the fix.
    accumulator = interval;
    muzzleIndex = 0;

    group = new THREE.Group();
    group.name = 'weapons';

    buildTracerPool();
    buildFlashPool();
    buildBurstPool();

    if (scene) {
        host = scene;
        scene.add(group);
    }
    return group;
}

/** Sized from the cadence and the lifetime, plus headroom for the frame where
 *  a long dt fires several at once. Never grows after this. */
function buildTracerPool() {
    const size = Math.max(2, Math.ceil(settings.shotsPerSecond * settings.tracerLife) +
        settings.maxShotsPerFrame);

    for (let i = 0; i < size; i++) {
        // Two vertices: the head and the tail of the streak. A line is the
        // right primitive here, since a tracer has no thickness worth modelling
        // at a range where it is a few pixels long.
        const positions = new Float32Array(6);
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(positions, 3);
        geometry.setAttribute('position', attribute);
        // Culling a two-point line whose bounding sphere we rewrite every frame
        // makes it flicker out at the edges of the view.
        const material = new THREE.LineBasicMaterial({
            color: settings.tracerColor,
            transparent: true,
            opacity: 1,
            depthWrite: false
        });
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.visible = false;
        line.name = `tracer-${i}`;
        group.add(line);

        tracers.push({
            line, geometry, material, positions, attribute,
            active: false, age: 0,
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 0, y: 0, z: -1 },
            travelLimit: 0
        });
    }
}

/** A hit flash is a bright shell that swells and fades over about a sixth of a
 *  second, sized to the thing it landed on. Four is plenty: at four shots a
 *  second nothing lives long enough to need a fifth. */
function buildFlashPool() {
    // A unit sphere, built once and scaled per flash, so four flashes cost one
    // geometry. Only the materials differ, because each fades on its own clock.
    flashGeometry = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 4; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: settings.flashColor,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(flashGeometry, material);
        mesh.visible = false;
        mesh.name = `hit-flash-${i}`;
        group.add(mesh);
        flashes.push({ mesh, material, active: false, age: 0, radius: 1 });
    }
}

/** Destruction bursts. Three, because two things dying inside a second is
 *  normal and three at once is not. */
function buildBurstPool() {
    const count = settings.burstParticles;
    for (let i = 0; i < 3; i++) {
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(positions, 3);
        geometry.setAttribute('position', attribute);
        const material = new THREE.PointsMaterial({
            color: settings.burstColor,
            size: settings.burstSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.visible = false;
        points.name = `burst-${i}`;
        group.add(points);
        bursts.push({
            points, geometry, material, positions, velocities, attribute,
            active: false, age: 0, count
        });
    }
}

/** One frame of gunnery.
 *
 *  `target`  the result of targeting's pickTarget, or null
 *  `muzzles` world-space points the tracers leave from, supplied by the cockpit
 *
 *  Fires, resolves the damage immediately, then advances every effect. Effects
 *  keep running with no target, which is what lets a burst finish playing after
 *  the thing that caused it has gone. */
export function updateWeapons(deltaTime, target, muzzles) {
    if (!settings) return 0;
    const dt = deltaTime || 0;

    // EFFECTS ADVANCE BEFORE THE GUNS FIRE. A tracer created this frame has an
    // age of zero and must not immediately be aged by the same dt: on a slow
    // frame that is enough to fly it past its own target and retire it before
    // it was ever drawn, so fast shots would simply not appear.
    advanceTracers(dt);
    advanceFlashes(dt);
    advanceBursts(dt);

    let fired = 0;
    if (target && isAlive(target.id)) {
        const stepped = stepCadence(accumulator, dt, interval, settings.maxShotsPerFrame);
        accumulator = stepped.accumulator;

        for (let i = 0; i < stepped.shots; i++) {
            fireOneShot(target, muzzles);
            fired++;
            // Stop the moment it dies. The remaining shots of this frame have
            // nothing left to hit, and firing them would let one long frame
            // punch through a target and out the other side.
            if (!isAlive(target.id)) break;
        }
    } else {
        // No target: hold the accumulator primed rather than letting it run up,
        // so acquiring a lock fires immediately and losing one costs nothing.
        accumulator = interval;
    }

    return fired;
}

function fireOneShot(target, muzzles) {
    const result = applyDamage(target.id, settings.damagePerShot);
    const radius = effectRadiusFor(target);

    spawnTracer(nextMuzzle(muzzles), target.position, target.distance);

    if (!result) return;
    if (result.destroyed) {
        spawnBurst(target.position, radius);
        if (destroyedCallback) destroyedCallback(result, target);
    } else {
        spawnFlash(target.position, radius);
    }
    if (hitCallback) hitCallback(result, target);
}

function effectRadiusFor(target) {
    const c = target && target.candidate;
    return (c && c.radius) || settings.effectRadius;
}

/** Alternate between the muzzles, so the two guns take turns the way a pair of
 *  cannon does rather than both firing from the same point. */
function nextMuzzle(muzzles) {
    if (!muzzles || muzzles.length === 0) return { x: 0, y: 0, z: 0 };
    const m = muzzles[muzzleIndex % muzzles.length];
    muzzleIndex++;
    return m;
}

function spawnTracer(from, to, distance) {
    const slot = tracers.find(t => !t.active);
    // Pool exhausted: drop the streak rather than allocate. The hit already
    // landed, so nothing about the game changes, and the pool is sized so this
    // does not happen in practice.
    if (!slot) return null;

    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz) || 1;

    slot.origin.x = from.x; slot.origin.y = from.y; slot.origin.z = from.z;
    slot.direction.x = dx / length;
    slot.direction.y = dy / length;
    slot.direction.z = dz / length;
    // Stop at the target rather than sailing on through the planet behind it.
    slot.travelLimit = distance || length;
    slot.active = true;
    slot.age = 0;
    slot.line.visible = true;
    slot.material.opacity = 1;
    writeTracerPoints(slot, 0);
    return slot;
}

function advanceTracers(dt) {
    for (let i = 0; i < tracers.length; i++) {
        const t = tracers[i];
        if (!t.active) continue;
        t.age += dt;

        const travelled = t.age * settings.tracerSpeed;
        if (t.age >= settings.tracerLife || travelled >= t.travelLimit) {
            t.active = false;
            t.line.visible = false;
            continue;
        }
        writeTracerPoints(t, travelled);
        // Fade out over the back half of the life, so it thins away rather than
        // snapping off mid-flight.
        const life = t.age / settings.tracerLife;
        t.material.opacity = life < 0.5 ? 1 : Math.max(0, 2 * (1 - life));
    }
}

/** Head at the travelled distance, tail one streak-length behind it but never
 *  behind the muzzle, so a tracer grows out of the gun instead of appearing
 *  whole in front of it. */
function writeTracerPoints(t, travelled) {
    const tail = Math.max(0, travelled - settings.tracerLength);
    const p = t.positions;
    p[0] = t.origin.x + t.direction.x * tail;
    p[1] = t.origin.y + t.direction.y * tail;
    p[2] = t.origin.z + t.direction.z * tail;
    p[3] = t.origin.x + t.direction.x * travelled;
    p[4] = t.origin.y + t.direction.y * travelled;
    p[5] = t.origin.z + t.direction.z * travelled;
    t.attribute.needsUpdate = true;
}

function spawnFlash(at, radius) {
    // Oldest wins the slot when every one is busy, which is right: the newest
    // hit is the one the visitor is looking for.
    const slot = flashes.find(f => !f.active) || oldest(flashes);
    if (!slot) return null;
    slot.active = true;
    slot.age = 0;
    slot.radius = radius;
    slot.mesh.visible = true;
    slot.mesh.position.set(at.x, at.y, at.z);
    slot.mesh.scale.setScalar(radius * 0.6);
    slot.material.opacity = 0.85;
    return slot;
}

function advanceFlashes(dt) {
    for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i];
        if (!f.active) continue;
        f.age += dt;
        const life = f.age / settings.flashLife;
        if (life >= 1) {
            f.active = false;
            f.mesh.visible = false;
            continue;
        }
        f.mesh.scale.setScalar(f.radius * (0.6 + life * settings.flashScale));
        f.material.opacity = 0.85 * (1 - life);
    }
}

function spawnBurst(at, radius) {
    const slot = bursts.find(b => !b.active) || oldest(bursts);
    if (!slot) return null;
    slot.active = true;
    slot.age = 0;
    slot.points.position.set(at.x, at.y, at.z);
    slot.points.visible = true;
    slot.material.opacity = 1;

    // Particles start at the centre and fly outward on a sphere, with a spread
    // of speeds so the cloud has depth instead of reading as one expanding
    // shell. Positions are LOCAL to the Points object, which is parked at the
    // impact, so nothing here has to know where in the world that was.
    for (let i = 0; i < slot.count; i++) {
        const z = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const speed = settings.burstSpeed * (0.35 + Math.random() * 0.65);
        slot.positions[i * 3] = 0;
        slot.positions[i * 3 + 1] = 0;
        slot.positions[i * 3 + 2] = 0;
        slot.velocities[i * 3] = r * Math.cos(theta) * speed;
        slot.velocities[i * 3 + 1] = r * Math.sin(theta) * speed;
        slot.velocities[i * 3 + 2] = z * speed;
    }
    slot.attribute.needsUpdate = true;
    // Sized to the thing that died, so a structure goes up bigger than a ship.
    slot.material.size = settings.burstSize * Math.max(0.4, radius / DEFAULTS.effectRadius);
    return slot;
}

function advanceBursts(dt) {
    for (let i = 0; i < bursts.length; i++) {
        const b = bursts[i];
        if (!b.active) continue;
        b.age += dt;
        const life = b.age / settings.burstLife;
        if (life >= 1) {
            b.active = false;
            b.points.visible = false;
            continue;
        }
        for (let j = 0; j < b.count; j++) {
            b.positions[j * 3] += b.velocities[j * 3] * dt;
            b.positions[j * 3 + 1] += b.velocities[j * 3 + 1] * dt;
            b.positions[j * 3 + 2] += b.velocities[j * 3 + 2] * dt;
        }
        b.attribute.needsUpdate = true;
        b.material.opacity = 1 - life;
    }
}

function oldest(pool) {
    let best = null;
    for (let i = 0; i < pool.length; i++) {
        if (!best || pool[i].age > best.age) best = pool[i];
    }
    return best;
}

/** Play a destruction burst at a point, for something this module did not
 *  shoot. The player's own ship is the case that needs it: it dies to a
 *  collision or to accumulated damage rather than to a registered hit, and it
 *  should still go up the same way everything else does. */
export function spawnDestruction(at, radius) {
    if (!settings || !at) return null;
    return spawnBurst(at, radius || settings.effectRadius);
}

// ---- Inspection, for the HUD and the suite ---------------------------------

export function getWeaponsGroup() { return group; }
export function activeTracerCount() { return tracers.filter(t => t.active).length; }
export function tracerPoolSize() { return tracers.length; }
export function getCadenceAccumulator() { return accumulator; }

/** Release every pooled geometry and material, and take the group back out of
 *  the scene. Safe to call more than once, which matters because init calls it
 *  first.
 *
 *  THE SCENE REMOVAL IS NOT COSMETIC. Releasing the GPU resources while leaving
 *  an empty group parented is how a restart quietly accumulates one dead group
 *  per run, each one still walked by the renderer every frame. */
export function disposeWeapons() {
    if (host && group && typeof host.remove === 'function') host.remove(group);
    host = null;
    for (const t of tracers) {
        if (t.geometry) t.geometry.dispose();
        if (t.material) t.material.dispose();
    }
    for (const f of flashes) {
        if (f.material) f.material.dispose();
    }
    if (flashGeometry) flashGeometry.dispose();
    for (const b of bursts) {
        if (b.geometry) b.geometry.dispose();
        if (b.material) b.material.dispose();
    }
    tracers = [];
    flashes = [];
    flashGeometry = null;
    bursts = [];
    damageables.clear();
    group = null;
    settings = null;
    accumulator = 0;
    muzzleIndex = 0;
    hitCallback = null;
    destroyedCallback = null;
}

export const __test__ = {
    DEFAULTS, spawnTracer, spawnFlash, spawnBurst, oldest,
    // Read through a function rather than exported directly: dispose replaces
    // the arrays, so a captured reference would go stale after a restart.
    allTracers: () => tracers
};
