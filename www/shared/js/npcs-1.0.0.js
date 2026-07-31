// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * npcs.js - Indoor people systems (shared engine part)
 *
 * The greeter/host look-at behavior, wandering indoor visitors with waypoint
 * AI (waypoints registered via setWanderWaypoints), pause/resume-for-dialog,
 * spawn helpers, and the floating help sign. People meshes come
 * from people.js; the experience supplies its own host figure via
 * registerHost().
 */
import { getWorldGroup, getWorldConfig, addCollider, getColliders } from './world-1.0.0.min.js';
import { createPerson, pickBalanced } from './people-1.0.0.min.js';

// Store people
const storePeople = {
    shopkeeper: null,
    customers: [],
    shopkeeperDefaultRotation: 0,
    shopkeeperTurnSpeed: 4,       // How fast shopkeeper turns to face the visitor
    helpSign: null,               // Floating help sign above shopkeeper
    helpSignBaseY: 0              // Base Y position for help sign bobbing
};

// Customer AI configuration
const CUSTOMER_AI_CONFIG = {
    walkSpeed: 1.0,               // Walking speed (meters/second)
    turnSpeed: 4,                 // Rotation speed (radians/second)
    pauseTimeMin: 3,              // Minimum pause at table (seconds)
    pauseTimeMax: 8,              // Maximum pause at table (seconds)
    arrivalThreshold: 0.3,        // Distance to consider "arrived" at waypoint
    bobAmplitude: 0.02,           // Walking bob height
    bobSpeed: 8,                  // Walking bob frequency
    collisionRadius: 0.5,         // Customer collision radius
    customerAvoidDistance: 2.0,   // Distance to start avoiding other customers
    obstacleAvoidDistance: 0.6,   // Distance to start avoiding obstacles (reduced)
    steerStrength: 3.0,           // How strongly to steer around obstacles
    maxAvoidForce: 2.5,           // Cap on total avoidance force
    stuckThreshold: 2.0,          // Time (seconds) before considered stuck
    stuckDistanceThreshold: 0.3   // Minimum movement to not be considered stuck
};

// Customer AI states
const customerStates = [];        // Array of { mesh, state, target, pauseTimer, bobPhase }

// Table waypoints for customer navigation (generated from PRODUCTS_CONFIG)
let tableWaypoints = [];

// Gallery visitor meshes (the wandering NPCs), exposed so main.js can register
// them as clickable raycast targets.
let galleryVisitorMeshes = [];

/**
 * Spawn a single female visitor who browses the three listing podiums. She uses
 * the same wandering AI as initGalleryVisitors (updateCustomerAI over the gallery
 * waypoints), but is placed by hand at a caller-chosen spawn that sits OFF the
 * sightline between the player's spawn (~0, +16) and the podium row (Z = +10), so
 * the three homes read clean the instant the room loads. Once she starts moving
 * she's free to stroll in front of any podium — that's expected browsing; only the
 * initial spawn is constrained.
 *
 * Call AFTER setWanderWaypoints() (so there are podiums to visit).
 * @param {number} spawnX - safe, off-sightline spawn X
 * @param {number} spawnZ - safe, off-sightline spawn Z
 * @returns {THREE.Object3D[]} the visitor meshes (one), for raycast registration
 */
// The indoor showroom visitor's fixed look: a violet dress with long brown hair.
// Kept as one definition so the sidewalk pedestrian pool can reserve this exact
// style for her — no one on the street should read as the same person.
export const INDOOR_VISITOR_LOOK = {
    shirtColor: 0x9d4edd, pantsColor: 0x4a2c5a, skinTone: 0xffe0bd,
    hairColor: 0x6a3805, hairStyle: 'long', hasSkirt: true
};

// Track which customer is currently in dialog
let customerInDialog = null;

/**
 * Get a random table waypoint, optionally excluding a specific one
 * @param {Object} excludeWaypoint - Waypoint to exclude (current position)
 * @returns {Object} Random waypoint { x, z, lookAtX, lookAtZ }
 */
export function getRandomWaypoint(excludeWaypoint = null) {
    if (tableWaypoints.length === 0) return null;

    let availableWaypoints = tableWaypoints;
    if (excludeWaypoint) {
        availableWaypoints = tableWaypoints.filter(wp =>
            Math.abs(wp.x - excludeWaypoint.x) > 1 ||
            Math.abs(wp.z - excludeWaypoint.z) > 1
        );
    }

    if (availableWaypoints.length === 0) {
        availableWaypoints = tableWaypoints;
    }

    return availableWaypoints[Math.floor(Math.random() * availableWaypoints.length)];
}

/**
 * Replace the customer navigation waypoints. The gallery feeds in one "viewing
 * spot" per wall piece (see gallery.getViewingWaypoints) so visitors stroll from
 * portrait to portrait instead of around the old product tables.
 * @param {Array<{x:number,z:number,lookAtX:number,lookAtZ:number}>} waypoints
 */
export function setWanderWaypoints(waypoints) {
    tableWaypoints = Array.isArray(waypoints) ? waypoints.slice() : [];
}

/**
 * Populate the gallery with a few visitors who stroll from piece to piece and
 * pause to admire each one. Reuses the customer person model + the customer
 * wandering AI (updateCustomerAI), but navigates the gallery viewing waypoints
 * set via setWanderWaypoints() rather than the old product-table waypoints.
 *
 * Call AFTER initWorld() (so the world group + collider registry exist) and AFTER
 * setWanderWaypoints() (so there are spots to visit).
 *
 * @param {number} count - How many visitors to spawn (capped by palette count)
 * @returns {THREE.Object3D[]} the visitor meshes
 */
export function initGalleryVisitors(count = 3) {
    if (!getWorldGroup()) return [];

    // Fresh start (also clears any legacy store customers).
    customerStates.length = 0;
    galleryVisitorMeshes = [];
    if (tableWaypoints.length === 0) return [];

    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'galleryVisitors';

    // A pool of distinct visitor designs — a mix of masculine/feminine
    // presentations and varied skin tones, so the gallery crowd looks diverse.
    // A fresh random subset is chosen on each page load.
    const designPool = [
        // masculine presentation — short hair, trousers
        { presentation: 'masc', shirtColor: 0xdc143c, pantsColor: 0x2f4f4f, skinTone: 0xffdbac, hairColor: 0x4a3728, hairStyle: 'short' }, // crimson
        { presentation: 'masc', shirtColor: 0x228b22, pantsColor: 0x36454f, skinTone: 0x8d5524, hairColor: 0x1a1a1a, hairStyle: 'short' }, // forest green
        { presentation: 'masc', shirtColor: 0xc8902a, pantsColor: 0x3a3a44, skinTone: 0xd4a574, hairColor: 0x5c4033, hairStyle: 'short' }, // warm ochre — kept distinct from the slate host
        // feminine presentation — long hair, some skirts
        { presentation: 'femme', shirtColor: 0x9d4edd, pantsColor: 0x4a2c5a, skinTone: 0xffe0bd, hairColor: 0x6a3805, hairStyle: 'long', hasSkirt: true },  // violet, skirt
        { presentation: 'femme', shirtColor: 0xe07a5f, pantsColor: 0x2c3e50, skinTone: 0xd4a574, hairColor: 0x1a1a1a, hairStyle: 'long' },                  // terracotta, trousers
        { presentation: 'femme', shirtColor: 0xf4a259, pantsColor: 0x3d5a80, skinTone: 0x8d5524, hairColor: 0x3b2417, hairStyle: 'long', hasSkirt: true }   // amber, skirt
    ];
    // Balanced draw so the trio is never all one presentation (≥1 masc, ≥1 femme).
    const palettes = pickBalanced(designPool, count, d => d.presentation);
    const n = palettes.length;

    // An experience may supply its own skin-tone palette via
    // config.visitors.skinTones (repetition = weighting, drawn per visitor),
    // so a business tribute can cast its crowd to mirror the business's real
    // clientele. The design pool's own tones are the default.
    const worldConfig = getWorldConfig() || {};
    const skinTonePalette = worldConfig.visitors &&
        Array.isArray(worldConfig.visitors.skinTones) && worldConfig.visitors.skinTones.length
        ? worldConfig.visitors.skinTones : null;

    // Spawn each visitor at a different viewing spot, preferring spots nearer the
    // entrance (higher Z) so they're in view the moment the gallery loads.
    const spots = tableWaypoints.slice().sort((a, b) => b.z - a.z);
    const used = [];
    const minSpawnDistance = 3.0;

    for (let i = 0; i < n; i++) {
        const spot = pickVisitorSpawn(spots, used, minSpawnDistance);
        if (!spot) break;
        used.push(spot);

        // Face the piece this spot belongs to.
        const rotationY = Math.atan2(spot.lookAtX - spot.x, spot.lookAtZ - spot.z);
        const visitor = createPerson({
            role: 'customer',
            x: spot.x,
            z: spot.z,
            rotationY,
            shirtColor: palettes[i].shirtColor,
            pantsColor: palettes[i].pantsColor,
            skinTone: skinTonePalette
                ? skinTonePalette[Math.floor(Math.random() * skinTonePalette.length)]
                : palettes[i].skinTone,
            hairColor: palettes[i].hairColor,
            hairStyle: palettes[i].hairStyle,
            hasSkirt: !!palettes[i].hasSkirt,
            hasApron: false
        });
        peopleGroup.add(visitor);
        galleryVisitorMeshes.push(visitor);

        // Start paused, admiring their first piece, then wander between pieces.
        customerStates.push({
            mesh: visitor,
            state: 'paused',
            currentWaypoint: spot,
            targetWaypoint: null,
            pauseTimer: CUSTOMER_AI_CONFIG.pauseTimeMin +
                Math.random() * (CUSTOMER_AI_CONFIG.pauseTimeMax - CUSTOMER_AI_CONFIG.pauseTimeMin),
            bobPhase: Math.random() * Math.PI * 2,
            baseY: 0.055,
            lastX: spot.x,
            lastZ: spot.z,
            stuckTimer: 0,
            smoothedDirX: 0,
            smoothedDirZ: 1
        });
    }

    getWorldGroup().add(peopleGroup);
    return galleryVisitorMeshes;
}

export function initGalleryBrowser(spawnX, spawnZ) {
    if (!getWorldGroup()) return [];

    // Fresh start (also clears any legacy store customers).
    customerStates.length = 0;
    galleryVisitorMeshes = [];
    if (tableWaypoints.length === 0) return [];

    const peopleGroup = new THREE.Group();
    peopleGroup.name = 'galleryVisitors';

    // Always the same visitor: the reserved violet-dress / long-brown-hair look.
    const look = INDOOR_VISITOR_LOOK;

    // Face the middle of the podium row so she reads as surveying the homes.
    const cx = tableWaypoints.reduce((s, w) => s + w.lookAtX, 0) / tableWaypoints.length;
    const cz = tableWaypoints.reduce((s, w) => s + w.lookAtZ, 0) / tableWaypoints.length;
    const rotationY = Math.atan2(cx - spawnX, cz - spawnZ);

    const visitor = createPerson({
        role: 'customer',
        x: spawnX,
        z: spawnZ,
        rotationY,
        shirtColor: look.shirtColor,
        pantsColor: look.pantsColor,
        skinTone: look.skinTone,
        hairColor: look.hairColor,
        hairStyle: 'long',
        hasSkirt: look.hasSkirt,
        hasApron: false
    });
    peopleGroup.add(visitor);
    galleryVisitorMeshes.push(visitor);

    // Start paused at the spawn (a brief look around), then wander to a podium.
    // currentWaypoint is the spawn itself (not a real waypoint), so getRandomWaypoint
    // is free to send her to any of the three homes first.
    customerStates.push({
        mesh: visitor,
        state: 'paused',
        currentWaypoint: { x: spawnX, z: spawnZ, lookAtX: cx, lookAtZ: cz },
        targetWaypoint: null,
        pauseTimer: 1.0 + Math.random() * 1.5,
        bobPhase: Math.random() * Math.PI * 2,
        baseY: 0.055,
        lastX: spawnX,
        lastZ: spawnZ,
        stuckTimer: 0,
        smoothedDirX: 0,
        smoothedDirZ: 1
    });

    getWorldGroup().add(peopleGroup);
    return galleryVisitorMeshes;
}

/**
 * Pick the first viewing spot that's at least `minDist` from every already-used
 * spawn, so the visitors start spread across the gallery rather than clustered.
 */
export function pickVisitorSpawn(spots, used, minDist) {
    for (const spot of spots) {
        if (used.includes(spot)) continue;
        let ok = true;
        for (const u of used) {
            const dx = spot.x - u.x;
            const dz = spot.z - u.z;
            if (Math.sqrt(dx * dx + dz * dz) < minDist) { ok = false; break; }
        }
        if (ok) return spot;
    }
    // Relax the spacing constraint if everything is close together.
    return spots.find(s => !used.includes(s)) || null;
}

/** The visitor meshes, for click/hover raycasting in main.js. */
export function getVisitorMeshes() {
    return galleryVisitorMeshes;
}

/**
 * Pick a clear spot near a desired spawn point. The "Back to Gallery" shortcut
 * teleports the player here, so if a gallery visitor happens to be loitering on
 * the spot we nudge to the nearest nearby opening rather than landing inside
 * someone. Falls back to the desired point if everything around it is occupied.
 * @param {number} x - desired X
 * @param {number} z - desired Z
 * @param {number} radius - the player's collision radius
 * @returns {{x: number, z: number}}
 */
export function findClearSpawn(x, z, radius) {
    const clearance = radius + 0.6; // player radius + a visitor's body radius (~1m)
    const isOccupied = (px, pz) => {
        for (const customer of customerStates) {
            const dx = px - customer.mesh.position.x;
            const dz = pz - customer.mesh.position.z;
            if (dx * dx + dz * dz < clearance * clearance) return true;
        }
        return false;
    };

    if (!isOccupied(x, z)) return { x, z };

    // Search outward in a ring for the nearest spot clear of both visitors and
    // walls/fixtures, preferring the smallest nudge that works.
    for (const dist of [1.0, 1.6, 2.2]) {
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const nx = x + Math.cos(angle) * dist;
            const nz = z + Math.sin(angle) * dist;
            if (!isOccupied(nx, nz) && !checkPositionCollision(nx, nz, radius)) {
                return { x: nx, z: nz };
            }
        }
    }
    return { x, z }; // everywhere nearby is taken — land on the original spot anyway
}

/**
 * Update store people behavior (shopkeeper looks at nearby player, customers wander)
 * @param {THREE.Vector3} playerPosition - Current player position
 * @param {number} deltaTime - Time since last frame
 */
export function updateStorePeople(playerPosition, deltaTime) {
    // Update shopkeeper behavior
    updateShopkeeperBehavior(playerPosition, deltaTime);

    // Update customer wandering AI
    updateCustomerAI(playerPosition, deltaTime);
}

/**
 * Pause a customer for dialog - makes them face the player and stop moving
 * @param {THREE.Object3D} customerMesh - The customer mesh that was clicked
 * @param {THREE.Vector3} playerPosition - Current player position
 */
export function pauseCustomerForDialog(customerMesh, playerPosition) {
    // Find the customer state for this mesh
    for (const customer of customerStates) {
        if (customer.mesh === customerMesh) {
            // Save previous state
            customerInDialog = customer;

            // Set to talking state
            customer.state = 'talking';

            // Calculate direction to player
            const dx = playerPosition.x - customer.mesh.position.x;
            const dz = playerPosition.z - customer.mesh.position.z;

            // Rotate to face player
            customer.mesh.rotation.y = Math.atan2(dx, dz);
            return;
        }
    }
}

/**
 * Resume a customer after dialog ends
 */
export function resumeCustomerFromDialog() {
    if (customerInDialog) {
        // Restore previous state (or set to paused if they were walking)
        customerInDialog.state = 'paused';
        customerInDialog.pauseTimer = 1.0; // Brief pause before resuming normal behavior

        customerInDialog = null;
    }
}

/**
 * Update shopkeeper to look at nearby player
 */
export function updateShopkeeperBehavior(playerPosition, deltaTime) {
    // Find shopkeeper if not cached
    if (!storePeople.shopkeeper && getWorldGroup()) {
        getWorldGroup().traverse((child) => {
            if (child.userData && child.userData.isShopkeeper) {
                storePeople.shopkeeper = child;
            }
        });
    }

    if (!storePeople.shopkeeper) {
        return;
    }

    const shopkeeper = storePeople.shopkeeper;

    // Get the shopkeeper's world position by going through parent chain
    let worldX = shopkeeper.position.x;
    let worldZ = shopkeeper.position.z;
    let parent = shopkeeper.parent;
    while (parent) {
        worldX += parent.position.x;
        worldZ += parent.position.z;
        parent = parent.parent;
    }

    // Direction from the greeter to the player (horizontal only).
    const dx = playerPosition.x - worldX;
    const dz = playerPosition.z - worldZ;

    // Check if player is inside the store
    const { width, depth, positionX, positionZ } = getWorldConfig().building;
    const storeMinX = positionX - width / 2;
    const storeMaxX = positionX + width / 2;
    const storeMinZ = positionZ - depth / 2;
    const storeMaxZ = positionZ + depth / 2;

    const playerInsideStore =
        playerPosition.x > storeMinX && playerPosition.x < storeMaxX &&
        playerPosition.z > storeMinZ && playerPosition.z < storeMaxZ;

    // Target rotation
    let targetRotation;

    if (playerInsideStore) {
        // Player is anywhere inside the showroom - face them the whole time, with
        // no distance falloff, so the greeter never appears to stare off into
        // space while a visitor is in the building.
        targetRotation = Math.atan2(dx, dz);
    } else {
        // Player is outside the building - return to the default forward pose.
        targetRotation = storePeople.shopkeeperDefaultRotation;
    }

    // Smoothly interpolate rotation
    let currentRotation = shopkeeper.rotation.y;

    // Normalize angles to handle wraparound
    while (targetRotation - currentRotation > Math.PI) targetRotation -= Math.PI * 2;
    while (targetRotation - currentRotation < -Math.PI) targetRotation += Math.PI * 2;

    // Lerp toward target
    const rotationDiff = targetRotation - currentRotation;
    const maxRotation = storePeople.shopkeeperTurnSpeed * deltaTime;

    if (Math.abs(rotationDiff) < maxRotation) {
        shopkeeper.rotation.y = targetRotation;
    } else {
        shopkeeper.rotation.y += Math.sign(rotationDiff) * maxRotation;
    }
}

/**
 * Update customer wandering AI
 * Customers walk between tables and pause to browse
 */
export function updateCustomerAI(playerPosition, deltaTime) {
    const {
        walkSpeed,
        turnSpeed,
        pauseTimeMin,
        pauseTimeMax,
        arrivalThreshold,
        bobAmplitude,
        bobSpeed,
        collisionRadius,
        customerAvoidDistance,
        obstacleAvoidDistance,
        steerStrength,
        maxAvoidForce,
        stuckThreshold,
        stuckDistanceThreshold
    } = CUSTOMER_AI_CONFIG;

    for (let i = 0; i < customerStates.length; i++) {
        const customer = customerStates[i];
        const mesh = customer.mesh;

        // Customer is in dialog - don't move or change state
        if (customer.state === 'talking') {
            mesh.position.y = customer.baseY; // Keep Y stable
            continue;
        }

        // The visitor never reacts to the player just walking near — she keeps
        // browsing and doesn't stop to stare. She only turns to face the player
        // when actually clicked/tapped (handled by pauseCustomerForDialog, which
        // sets the 'talking' state above).

        if (customer.state === 'paused') {
            // Customer is browsing at a table
            customer.pauseTimer -= deltaTime;

            // Reset Y position when paused (no bobbing)
            mesh.position.y = customer.baseY;

            // Reset stuck tracking when paused
            customer.lastX = mesh.position.x;
            customer.lastZ = mesh.position.z;
            customer.stuckTimer = 0;

            if (customer.pauseTimer <= 0) {
                // Time to move to a new table
                customer.targetWaypoint = getRandomWaypoint(customer.currentWaypoint);
                if (customer.targetWaypoint) {
                    customer.state = 'walking';
                    // Initialize smoothed direction toward target
                    const dirX = customer.targetWaypoint.x - mesh.position.x;
                    const dirZ = customer.targetWaypoint.z - mesh.position.z;
                    const dirMag = Math.sqrt(dirX * dirX + dirZ * dirZ);
                    if (dirMag > 0.01) {
                        customer.smoothedDirX = dirX / dirMag;
                        customer.smoothedDirZ = dirZ / dirMag;
                    }
                } else {
                    // No valid waypoint, reset pause timer
                    customer.pauseTimer = pauseTimeMin + Math.random() * (pauseTimeMax - pauseTimeMin);
                }
            }
        } else if (customer.state === 'walking') {
            // Customer is walking to a new table
            const target = customer.targetWaypoint;
            if (!target) {
                customer.state = 'paused';
                customer.pauseTimer = pauseTimeMin + Math.random() * (pauseTimeMax - pauseTimeMin);
                continue;
            }

            // Check if stuck (haven't moved enough recently)
            const movedX = mesh.position.x - customer.lastX;
            const movedZ = mesh.position.z - customer.lastZ;
            const movedDist = Math.sqrt(movedX * movedX + movedZ * movedZ);

            customer.stuckTimer += deltaTime;

            if (customer.stuckTimer > 0.5) { // Check every 0.5 seconds
                if (movedDist < stuckDistanceThreshold) {
                    // Hasn't moved enough, might be stuck
                    if (customer.stuckTimer > stuckThreshold) {
                        // Definitely stuck - pick a completely different waypoint
                        customer.targetWaypoint = getRandomWaypoint(target);
                        customer.stuckTimer = 0;
                        customer.lastX = mesh.position.x;
                        customer.lastZ = mesh.position.z;
                        // Reset smoothed direction toward new target
                        if (customer.targetWaypoint) {
                            const newDirX = customer.targetWaypoint.x - mesh.position.x;
                            const newDirZ = customer.targetWaypoint.z - mesh.position.z;
                            const newDirMag = Math.sqrt(newDirX * newDirX + newDirZ * newDirZ);
                            if (newDirMag > 0.01) {
                                customer.smoothedDirX = newDirX / newDirMag;
                                customer.smoothedDirZ = newDirZ / newDirMag;
                            }
                        }
                        continue;
                    }
                } else {
                    // Made progress, reset stuck timer
                    customer.stuckTimer = 0;
                    customer.lastX = mesh.position.x;
                    customer.lastZ = mesh.position.z;
                }
            }

            // Calculate direction to target
            let dx = target.x - mesh.position.x;
            let dz = target.z - mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < arrivalThreshold) {
                // Arrived at destination
                customer.state = 'paused';
                customer.currentWaypoint = target;
                customer.targetWaypoint = null;
                customer.pauseTimer = pauseTimeMin + Math.random() * (pauseTimeMax - pauseTimeMin);
                customer.stuckTimer = 0;

                // Face the table
                const lookDx = target.lookAtX - mesh.position.x;
                const lookDz = target.lookAtZ - mesh.position.z;
                mesh.rotation.y = Math.atan2(lookDx, lookDz);

                // Reset Y position
                mesh.position.y = customer.baseY;
            } else {
                // Calculate avoidance steering
                let avoidX = 0;
                let avoidZ = 0;

                // Avoid other customers
                for (let j = 0; j < customerStates.length; j++) {
                    if (i === j) continue;
                    const other = customerStates[j].mesh;
                    const otherDx = mesh.position.x - other.position.x;
                    const otherDz = mesh.position.z - other.position.z;
                    const otherDist = Math.sqrt(otherDx * otherDx + otherDz * otherDz);

                    if (otherDist < customerAvoidDistance && otherDist > 0.01) {
                        // Gentle push away from other customer
                        const avoidStrength = (customerAvoidDistance - otherDist) / customerAvoidDistance;
                        avoidX += (otherDx / otherDist) * avoidStrength * steerStrength;
                        avoidZ += (otherDz / otherDist) * avoidStrength * steerStrength;
                    }
                }

                // Avoid tables (collision boxes) - gentle avoidance, rely on hard collision check
                const customerX = mesh.position.x;
                const customerZ = mesh.position.z;

                const allBoxes = getColliders();

                for (const collision of allBoxes) {
                    // Steer softly around solid fixtures (the host, plants, decor
                    // — anything tagged with a type). Bare wall segments carry no
                    // `type`; the hard collision check below keeps visitors off
                    // the walls, so we skip them here to avoid hugging the center.
                    if (!collision.type) continue;
                    const box = collision.box;

                    // Find closest point on box to customer
                    const closestX = Math.max(box.min.x, Math.min(customerX, box.max.x));
                    const closestZ = Math.max(box.min.z, Math.min(customerZ, box.max.z));

                    const tableDistX = customerX - closestX;
                    const tableDistZ = customerZ - closestZ;
                    const tableDist = Math.sqrt(tableDistX * tableDistX + tableDistZ * tableDistZ);

                    const avoidDist = obstacleAvoidDistance + collisionRadius;
                    if (tableDist < avoidDist && tableDist > 0.01) {
                        // Gentle linear push away from table
                        const avoidStrength = (avoidDist - tableDist) / avoidDist;
                        avoidX += (tableDistX / tableDist) * avoidStrength * steerStrength;
                        avoidZ += (tableDistZ / tableDist) * avoidStrength * steerStrength;
                    }
                }

                // Cap the total avoidance force to prevent getting trapped
                const avoidMagnitude = Math.sqrt(avoidX * avoidX + avoidZ * avoidZ);
                if (avoidMagnitude > maxAvoidForce) {
                    const scale = maxAvoidForce / avoidMagnitude;
                    avoidX *= scale;
                    avoidZ *= scale;
                }

                // Combine target direction with avoidance
                // Normalize target direction
                const targetDirX = dx / distance;
                const targetDirZ = dz / distance;

                // Add avoidance to movement direction (avoidance has priority)
                // Use the capped avoidMagnitude from above
                const cappedAvoidMag = Math.sqrt(avoidX * avoidX + avoidZ * avoidZ);
                const targetWeight = Math.max(0.5, 1 - cappedAvoidMag * 0.3);
                let desiredX = targetDirX * targetWeight + avoidX;
                let desiredZ = targetDirZ * targetWeight + avoidZ;

                // Normalize desired direction
                const desiredMag = Math.sqrt(desiredX * desiredX + desiredZ * desiredZ);
                if (desiredMag > 0.01) {
                    desiredX /= desiredMag;
                    desiredZ /= desiredMag;
                }

                // Smooth the direction to prevent twitching
                // Blend between current smoothed direction and desired direction
                // Use slower smoothing when there's high avoidance (more conflict)
                const smoothingFactor = Math.max(1.5, 4 - cappedAvoidMag * 2) * deltaTime;
                customer.smoothedDirX += (desiredX - customer.smoothedDirX) * Math.min(smoothingFactor, 1);
                customer.smoothedDirZ += (desiredZ - customer.smoothedDirZ) * Math.min(smoothingFactor, 1);

                // Normalize smoothed direction
                const smoothedMag = Math.sqrt(
                    customer.smoothedDirX * customer.smoothedDirX +
                    customer.smoothedDirZ * customer.smoothedDirZ
                );
                let moveX = customer.smoothedDirX;
                let moveZ = customer.smoothedDirZ;
                if (smoothedMag > 0.01) {
                    moveX /= smoothedMag;
                    moveZ /= smoothedMag;
                }

                // Calculate target rotation (direction of movement)
                const targetRotation = Math.atan2(moveX, moveZ);

                // Smoothly rotate toward target (slower rotation when avoiding)
                let currentRotation = mesh.rotation.y;

                // Normalize angles
                let rotDiff = targetRotation - currentRotation;
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

                // Reduce turn speed when there's high avoidance to prevent spinning
                const effectiveTurnSpeed = turnSpeed * Math.max(0.5, 1 - cappedAvoidMag * 0.3);
                const maxTurn = effectiveTurnSpeed * deltaTime;
                if (Math.abs(rotDiff) < maxTurn) {
                    mesh.rotation.y = targetRotation;
                } else {
                    mesh.rotation.y += Math.sign(rotDiff) * maxTurn;
                }

                // Calculate movement speed (slow down more when avoiding)
                const speedMultiplier = Math.max(0.4, 1 - cappedAvoidMag * 0.4);
                const moveDistance = walkSpeed * deltaTime * speedMultiplier;

                // Calculate new position
                const newX = mesh.position.x + moveX * moveDistance;
                const newZ = mesh.position.z + moveZ * moveDistance;

                // Final collision check before moving
                if (!checkCustomerCollision(newX, newZ, collisionRadius, i)) {
                    mesh.position.x = newX;
                    mesh.position.z = newZ;
                }

                // Walking bob animation
                customer.bobPhase += bobSpeed * deltaTime * speedMultiplier;
                mesh.position.y = customer.baseY + Math.sin(customer.bobPhase) * bobAmplitude;
            }
        }
    }
}

/**
 * Check if a customer position would collide with obstacles or other customers
 * @param {number} x - X position to check
 * @param {number} z - Z position to check
 * @param {number} radius - Customer collision radius
 * @param {number} customerIndex - Index of customer to exclude from check
 * @returns {boolean} True if collision detected
 */
/**
 * Check if a position collides with any collision box (walls, tables, decor, etc.)
 * @param {number} x - X position to check
 * @param {number} z - Z position to check
 * @param {number} radius - Entity collision radius
 * @returns {boolean} True if position collides
 */
export function checkPositionCollision(x, z, radius) {
    const allBoxes = getColliders();

    for (const collision of allBoxes) {
        const box = collision.box;
        const expandedMinX = box.min.x - radius;
        const expandedMaxX = box.max.x + radius;
        const expandedMinZ = box.min.z - radius;
        const expandedMaxZ = box.max.z + radius;

        if (x >= expandedMinX && x <= expandedMaxX &&
            z >= expandedMinZ && z <= expandedMaxZ) {
            return true;
        }
    }
    return false;
}

export function checkCustomerCollision(x, z, radius, customerIndex) {
    const allBoxes = getColliders();

    // Check collision with every solid box: walls, the host, plants and any
    // other fixtures all block a visitor (in the gallery there are no product
    // tables — the bare wall boxes carry no `type`, so we test them all).
    for (const collision of allBoxes) {
        const box = collision.box;

        // Expand box by customer radius
        const expandedMinX = box.min.x - radius;
        const expandedMaxX = box.max.x + radius;
        const expandedMinZ = box.min.z - radius;
        const expandedMaxZ = box.max.z + radius;

        if (x >= expandedMinX && x <= expandedMaxX &&
            z >= expandedMinZ && z <= expandedMaxZ) {
            return true;
        }
    }

    // Check collision with other customers
    for (let i = 0; i < customerStates.length; i++) {
        if (i === customerIndex) continue;
        const other = customerStates[i].mesh;
        const dx = x - other.position.x;
        const dz = z - other.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < radius * 2) {
            return true;
        }
    }

    return false;
}

/**
 * Create a floating help sign above the shopkeeper
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {THREE.Group} The sign group
 */
export function createHelpSign(x, z) {
    const signGroup = new THREE.Group();
    signGroup.name = 'helpSign';
    signGroup.userData.isShopkeeperSign = true;

    // Create canvas for the text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;

    // Draw background with rounded corners (slate to match gallery theme)
    ctx.fillStyle = '#3d5a80';  // accent-dark slate
    const radius = 20;
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, radius);
    ctx.fill();

    // Add border
    ctx.strokeStyle = '#5b86b8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Help', canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sign plane
    const signWidth = 1.0;
    const signHeight = 0.5;
    const signGeometry = new THREE.PlaneGeometry(signWidth, signHeight);
    const signMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const signMesh = new THREE.Mesh(signGeometry, signMaterial);

    // Add a slight glow effect using a larger background plane
    const glowGeometry = new THREE.PlaneGeometry(signWidth + 0.15, signHeight + 0.1);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x5b86b8,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.z = -0.01;  // Slightly behind the sign

    signGroup.add(glowMesh);
    signGroup.add(signMesh);

    // Position above the shopkeeper's head
    const signY = 2.6;  // Above the person's head (person is ~1.8m tall)
    signGroup.position.set(x, signY, z);

    // Start visible (shows when cart is empty)
    signGroup.visible = true;

    // Store base Y for bobbing animation
    storePeople.helpSignBaseY = signY;

    return signGroup;
}

/**
 * Show the help sign above the shopkeeper
 */
export function showHelpSign() {
    if (storePeople.helpSign) {
        storePeople.helpSign.visible = true;
    }
}

/**
 * Hide the help sign above the shopkeeper
 */
export function hideHelpSign() {
    if (storePeople.helpSign) {
        storePeople.helpSign.visible = false;
    }
}

/**
 * Update the shopkeeper's floating sign (bobbing effect and billboarding).
 * Legacy name kept as the public seam: every experience calls this each
 * frame, and today the help sign is the only floating sign.
 * @param {number} time - Current time in seconds
 * @param {THREE.Vector3} cameraPosition - Camera position for billboarding
 */
export function updateCheckoutSign(time, cameraPosition) {
    if (storePeople.helpSign && storePeople.helpSign.visible) {
        // Gentle bobbing animation (slightly different phase)
        const bobAmount = Math.sin(time * 2) * 0.1;
        storePeople.helpSign.position.y = storePeople.helpSignBaseY + bobAmount;

        // Billboard effect - make sign face the camera (only rotate on Y axis)
        if (cameraPosition) {
            const signPos = storePeople.helpSign.position;
            const angle = Math.atan2(
                cameraPosition.x - signPos.x,
                cameraPosition.z - signPos.z
            );
            storePeople.helpSign.rotation.y = angle;
        }
    }
}

/**
 * Get the gallery host (greeter) group, for click/hover interaction
 */
export function getGalleryHost() {
    return storePeople.shopkeeper;
}

/** The floating "Help" sign above the host, for raycasting (clicking it also
 *  opens the help dialog). It's a sibling of the host, so not covered by
 *  getGalleryHost(). */
export function getHelpSign() {
    return storePeople.helpSign;
}

/**
 * Register the experience's greeter (the host/shopkeeper figure) so the
 * look-at behavior in updateStorePeople can drive it. The experience builds
 * the person itself (its styling is content) and hands it over here.
 */
export function registerHost(host, defaultRotation = 0) {
    storePeople.shopkeeper = host;
    storePeople.shopkeeperDefaultRotation = defaultRotation;
}

/** Register the floating help sign built via createHelpSign. */
export function setHelpSign(sign) {
    storePeople.helpSign = sign;
}

/** Export checkPositionCollision for the pedestrian part (same collision
 *  semantics for street walkers as for indoor visitors). */
export { checkPositionCollision as checkWorldCollision };
