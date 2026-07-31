// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * pedestrians.js - Sidewalk pedestrians (shared engine part)
 *
 * A small cast walking the sidewalk, pausing at storefronts, sidestepping
 * obstacles, and (unless the experience disables zombiesAtNight) turning into
 * polite zombies after dark who shamble toward the player. Count and path
 * come from the experience config (pedestrians: { count, sidewalkZ, minX,
 * maxX }).
 */
import { getScene, isNightTime } from './scene-1.0.0.min.js';
import { getWorldGroup, getWorldConfig, isMobileDevice } from './world-1.0.0.min.js';
import { createPerson, pickBalanced } from './people-1.0.0.min.js';
import { INDOOR_VISITOR_LOOK, checkWorldCollision } from './npcs-1.0.0.min.js';

// Extra "safe zone" rectangles (e.g. enterable neighbor shops) where night
// wanderers won't follow the player. Experiences with such refuges register
// them here; none exist by default.
const refugeFootprints = [];

/** Replace the refuge list with {minX, maxX, minZ, maxZ} rectangles. */
export function setRefugeFootprints(list) {
    refugeFootprints.length = 0;
    if (Array.isArray(list)) refugeFootprints.push(...list);
}

// Fold the experience's pedestrian config (count and path) over the
// minimized-world defaults above. Called when the pedestrians are created.
function applyPedestrianConfig() {
    const cfg = getWorldConfig().pedestrians || {};
    ['count', 'sidewalkZ', 'minX', 'maxX'].forEach((k) => {
        if (typeof cfg[k] === 'number') PEDESTRIAN_CONFIG[k] = cfg[k];
    });
}

// Sidewalk pedestrian configuration
const PEDESTRIAN_CONFIG = {
    count: 2,                     // Number of pedestrians (minimized world)
    walkSpeed: 1.2,               // Walking speed (meters/second) - brisk walk
    pauseChance: 0.08,            // Low chance to pause at storefronts (per second when near)
    pauseTimeMin: 2,              // Minimum pause time (seconds)
    pauseTimeMax: 4,              // Maximum pause time (seconds)
    bobAmplitude: 0.02,           // Walking bob height
    bobSpeed: 8,                  // Walking bob frequency
    sidewalkZ: 26.5,              // Z position - street side of trees (trees are at Z=24)
    minX: -18,                    // Left boundary (minimized world)
    maxX: 18,                     // Right boundary (minimized world)
    avoidDistance: 2.0            // Distance to start slowing for other pedestrians
};

// Sidewalk pedestrians
const sidewalkPedestrians = [];   // Array of { mesh, state, targetX, pauseTimer, bobPhase, direction, originalAppearance }

// Track if pedestrians are currently zombies
let pedestriansAreZombies = false;

// Track which pedestrian is currently in dialog
let pedestrianInDialog = null;
let pedestrianPreviousState = null;

export function createSidewalkPedestrians() {
    applyPedestrianConfig();
    const scene = getScene();
    const { count, sidewalkZ, minX, maxX } = PEDESTRIAN_CONFIG;

    // Reduce pedestrian count on mobile (half, rounded up)
    const isMobile = isMobileDevice();
    const pedestrianCount = isMobile ? Math.ceil(count / 2) : count;

    // A pool of pedestrian designs — a mix of masculine/feminine presentations
    // and varied skin tones. A fresh random subset is drawn on each page load,
    // so the people on the street differ between visits.
    const designPool = [
        // masculine presentation — short hair, trousers
        { presentation: 'masc', shirtColor: 0x3498db, pantsColor: 0x2c3e50, skinTone: 0xffdbac, hairColor: 0x4a3728, hairStyle: 'short' },
        { presentation: 'masc', shirtColor: 0x27ae60, pantsColor: 0x34495e, skinTone: 0xc68642, hairColor: 0x1a1a1a, hairStyle: 'short' },
        { presentation: 'masc', shirtColor: 0xf39c12, pantsColor: 0x1a1a1a, skinTone: 0xd4a574, hairColor: 0x5c4033, hairStyle: 'short' },
        // feminine presentation — long hair, some skirts
        { presentation: 'femme', shirtColor: 0xe91e63, pantsColor: 0x6a2c47, skinTone: 0xffe0bd, hairColor: 0x1a1a1a, hairStyle: 'long', hasSkirt: true },
        // Coral (was violet) so no street pedestrian echoes the indoor visitor's purple dress.
        { presentation: 'femme', shirtColor: 0xe07a5f, pantsColor: 0x2c3e50, skinTone: 0x8d5524, hairColor: 0x2c1810, hairStyle: 'long' },
        { presentation: 'femme', shirtColor: 0x1abc9c, pantsColor: 0x34495e, skinTone: 0xffdbac, hairColor: 0x6a3805, hairStyle: 'long', hasSkirt: true }
    ];
    // Reserve the indoor showroom visitor's exact shirt colour for her alone, so no
    // one on the street reads as the same person (a guard even if the pool changes).
    const streetPool = designPool.filter(d => d.shirtColor !== INDOOR_VISITOR_LOOK.shirtColor);
    // Balanced draw so the group is never all one presentation (≥1 masc, ≥1 femme).
    const appearances = pickBalanced(streetPool, pedestrianCount, d => d.presentation);

    for (let i = 0; i < appearances.length; i++) {
        // Random starting position spread across the sidewalk
        const startX = minX + (maxX - minX) * (i / pedestrianCount) + (Math.random() - 0.5) * 20;
        const direction = Math.random() > 0.5 ? 1 : -1; // Walking left or right

        // This pedestrian's randomly-chosen design
        const appearance = appearances[i];

        // Create the pedestrian mesh
        const pedestrian = createPerson({
            role: 'pedestrian',
            x: startX,
            z: sidewalkZ,
            rotationY: direction > 0 ? Math.PI / 2 : -Math.PI / 2,
            ...appearance
        });

        pedestrian.position.set(startX, 0.055, sidewalkZ);
        scene.add(pedestrian);

        // Initialize pedestrian state with original appearance for zombie transformation
        sidewalkPedestrians.push({
            mesh: pedestrian,
            state: 'walking',
            targetX: direction > 0 ? maxX : minX,
            pauseTimer: 0,
            stuckTimer: 0,
            bobPhase: Math.random() * Math.PI * 2,
            direction: direction,
            baseY: 0.055,
            originalAppearance: { ...appearance },
            zombieRestore: null,  // set by zombifyPedestrian, drained by humanizePedestrian
            isZombie: false,
            zombieSpeedMultiplier: 0.35 + Math.random() * 0.3 // 0.35 to 0.65 of player speed
        });
    }
}

/**
 * Transform a pedestrian into a zombie.
 *
 * Body parts are identified by their current material color, and every
 * material this touches is recorded (with its pre-zombie color) on
 * ped.zombieRestore, so humanizePedestrian can restore exactly this list
 * and nothing else. Restoring by color-matching on the way back is how
 * black shoes (0x1a1a1a, the same hex as zombie hair) once came home
 * recolored to the pedestrian's hair color.
 */
export function zombifyPedestrian(ped) {
    if (ped.isZombie) return;

    const mesh = ped.mesh;

    // Zombie colors
    const zombieSkin = new THREE.Color(0x5a7a5a);     // Greenish gray skin
    const zombieShirt = new THREE.Color(0x3d3d3d);   // Dark tattered shirt
    const zombiePants = new THREE.Color(0x2a2a2a);   // Dark pants
    const zombieHair = new THREE.Color(0x1a1a1a);    // Dark matted hair
    const zombieEyes = new THREE.Color(0xccff00);    // Glowing yellow-green eyes

    // The undo list: pre-zombie color per touched material, plus whether
    // the transform gave it a glow that needs clearing at dawn. Materials
    // are shared within a person (both pupils, both shoes, head and nose),
    // so each is recorded once, on first sight, while it still carries its
    // true pre-zombie color: a second entry would capture the zombie color
    // and replay it over the real restore at dawn.
    const touched = [];
    const seen = new Set();
    const remember = (mat, glowed) => {
        if (seen.has(mat)) return;
        seen.add(mat);
        touched.push({ mat, hex: mat.color.getHex(), glowed: !!glowed });
    };

    // Find and update materials in the mesh
    mesh.traverse((child) => {
        if (child.isMesh && child.material) {
            const mat = child.material;
            // Pupils are tagged at creation: their dark color is also used as a
            // hair color by some pedestrians, so the hair test below would
            // otherwise claim them and leave the zombie with normal eyes. Make
            // them glow first, then skip the color-based checks.
            if (child.userData.isPupil) {
                remember(mat, true);
                mat.color.copy(zombieEyes);
                mat.emissive = new THREE.Color(0x88ff00);
                mat.emissiveIntensity = 0.8;
                return;
            }
            // Identify the remaining body parts by their original color
            if (mat.color) {
                const hex = mat.color.getHex();
                // Skin tones (various flesh colors)
                if (hex === 0xffdbac || hex === 0xd4a574 || hex === 0xffe0bd || hex === 0xc68642 || hex === 0x8d5524) {
                    remember(mat, true);
                    mat.color.copy(zombieSkin);
                    mat.emissive = new THREE.Color(0x1a2a1a);
                    mat.emissiveIntensity = 0.2;
                }
                // Shirt colors
                else if (hex === ped.originalAppearance.shirtColor) {
                    remember(mat);
                    mat.color.copy(zombieShirt);
                }
                // Pants colors
                else if (hex === ped.originalAppearance.pantsColor) {
                    remember(mat);
                    mat.color.copy(zombiePants);
                }
                // Hair colors
                else if (hex === ped.originalAppearance.hairColor) {
                    remember(mat);
                    mat.color.copy(zombieHair);
                }
            }
        }
    });

    ped.zombieRestore = touched;
    ped.isZombie = true;
}

/**
 * Transform a zombie back into a human.
 *
 * Walks the exact undo list zombifyPedestrian recorded instead of guessing
 * parts from their current colors, so materials the transform never touched
 * (the shared black shoe material especially) are left alone, and every
 * design round-trips to its true original colors.
 */
export function humanizePedestrian(ped) {
    if (!ped.isZombie) return;

    (ped.zombieRestore || []).forEach(({ mat, hex, glowed }) => {
        mat.color.setHex(hex);
        if (glowed) {
            mat.emissive = new THREE.Color(0x000000);
            mat.emissiveIntensity = 0;
        }
    });

    ped.zombieRestore = null;
    ped.isZombie = false;
}

/**
 * Update zombie/human state based on day/night
 */
export function updatePedestrianZombieState() {
    const shouldBeZombies = getWorldConfig().zombiesAtNight !== false && isNightTime();

    if (shouldBeZombies && !pedestriansAreZombies) {
        // Night has fallen - transform to zombies!
        sidewalkPedestrians.forEach(ped => zombifyPedestrian(ped));
        pedestriansAreZombies = true;
    } else if (!shouldBeZombies && pedestriansAreZombies) {
        // Day has returned - restore to humans
        sidewalkPedestrians.forEach(ped => humanizePedestrian(ped));
        pedestriansAreZombies = false;
    }
}

/**
 * Update sidewalk pedestrians - call every frame
 */
/**
 * Move a pedestrian toward (newX, newZ): take the full move if clear, otherwise
 * slide along whichever single axis is clear, and as a last resort sidestep
 * perpendicular to the intended direction. That final step lets a chasing or
 * returning zombie walk around a narrow obstacle (such as a lamp post) instead
 * of freezing against it when the target sits directly beyond it.
 */
export function pedestrianMoveWithSlide(ped, newX, newZ, radius) {
    const curX = ped.mesh.position.x;
    const curZ = ped.mesh.position.z;
    if (!checkWorldCollision(newX, newZ, radius)) {
        ped.mesh.position.x = newX;
        ped.mesh.position.z = newZ;
        return;
    }
    if (!checkWorldCollision(newX, curZ, radius)) {
        ped.mesh.position.x = newX;
        return;
    }
    if (!checkWorldCollision(curX, newZ, radius)) {
        ped.mesh.position.z = newZ;
        return;
    }
    // Fully blocked head-on: sidestep perpendicular to slip around a thin pole.
    const dxm = newX - curX;
    const dzm = newZ - curZ;
    const mag = Math.sqrt(dxm * dxm + dzm * dzm);
    if (mag < 0.0001) return;
    const perpX = -dzm / mag;
    const perpZ = dxm / mag;
    for (const sign of [1, -1]) {
        const tryX = curX + perpX * mag * sign;
        const tryZ = curZ + perpZ * mag * sign;
        if (!checkWorldCollision(tryX, tryZ, radius)) {
            ped.mesh.position.x = tryX;
            ped.mesh.position.z = tryZ;
            return;
        }
    }
}

export function updateSidewalkPedestrians(playerPosition, deltaTime, playerSpeed) {
    // Check for zombie transformation based on day/night
    updatePedestrianZombieState();

    const { walkSpeed, pauseChance, pauseTimeMin, pauseTimeMax, bobAmplitude, bobSpeed, minX, maxX, avoidDistance, sidewalkZ } = PEDESTRIAN_CONFIG;

    // Zombies move slower and shamble
    const speedMultiplierBase = pedestriansAreZombies ? 0.4 : 1.0;
    const bobMultiplier = pedestriansAreZombies ? 1.5 : 1.0; // More pronounced shamble

    // Check if the player is sheltered inside any building (the gallery OR one of
    // the enterable shops). Zombies only give chase out in the open at night, so
    // ducking into a doorway makes the player "safe" and they revert to wandering.
    const { width, positionX, positionZ, depth } = getWorldConfig().building;
    const storeMinX = positionX - width / 2;
    const storeMaxX = positionX + width / 2;
    const storeMinZ = positionZ - depth / 2;
    const storeMaxZ = positionZ + depth / 2;
    const insideGallery = !!playerPosition &&
        playerPosition.x >= storeMinX && playerPosition.x <= storeMaxX &&
        playerPosition.z >= storeMinZ && playerPosition.z <= storeMaxZ;
    const insideShop = !!playerPosition && refugeFootprints.some(f =>
        playerPosition.x >= f.minX && playerPosition.x <= f.maxX &&
        playerPosition.z >= f.minZ && playerPosition.z <= f.maxZ);
    const playerOutsideStore = !playerPosition || (!insideGallery && !insideShop);

    // Zombie chase: follow the player only when they're out in the open at night
    const shouldChase = pedestriansAreZombies && playerOutsideStore && playerPosition;

    // Building/storefront X positions where pedestrians might pause to window shop
    // Includes the gallery (0) and neighboring buildings
    const windowShopPositions = [-38, -20, 0, 20, 38];

    sidewalkPedestrians.forEach((ped, index) => {
        // Pedestrian is in dialog - don't move or change state
        if (ped.state === 'talking') {
            ped.mesh.position.y = ped.baseY; // Keep Y stable
            return;
        }

        // Zombie chase mode
        if (shouldChase) {
            if (ped.state !== 'chasing') {
                ped.state = 'chasing';
                // Raise arms into zombie chase pose
                ped.mesh.traverse((child) => {
                    if (child.userData && child.userData.isArm) {
                        child.rotation.x = -Math.PI / 2;
                        child.rotation.z = child.userData.armSide * 0.05;
                    }
                });
            }

            const dx = playerPosition.x - ped.mesh.position.x;
            const dz = playerPosition.z - ped.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 1.5) {
                // Calculate avoidance from other zombies
                let avoidX = 0;
                let avoidZ = 0;
                const zombieAvoidDist = 2.0;

                for (let j = 0; j < sidewalkPedestrians.length; j++) {
                    if (j === index) continue;
                    const other = sidewalkPedestrians[j];
                    const odx = ped.mesh.position.x - other.mesh.position.x;
                    const odz = ped.mesh.position.z - other.mesh.position.z;
                    const oDist = Math.sqrt(odx * odx + odz * odz);

                    if (oDist < zombieAvoidDist && oDist > 0.01) {
                        const strength = (zombieAvoidDist - oDist) / zombieAvoidDist;
                        avoidX += (odx / oDist) * strength;
                        avoidZ += (odz / oDist) * strength;
                    }
                }

                // Combine chase direction with avoidance
                const chaseDirX = dx / dist;
                const chaseDirZ = dz / dist;
                let moveX = chaseDirX + avoidX * 0.8;
                let moveZ = chaseDirZ + avoidZ * 0.8;
                const moveMag = Math.sqrt(moveX * moveX + moveZ * moveZ);
                if (moveMag > 0.01) {
                    moveX /= moveMag;
                    moveZ /= moveMag;
                }

                const baseChaseSpeed = playerSpeed || 6.5;
                const chaseSpeed = baseChaseSpeed * ped.zombieSpeedMultiplier;
                const newX = ped.mesh.position.x + moveX * chaseSpeed * deltaTime;
                const newZ = ped.mesh.position.z + moveZ * chaseSpeed * deltaTime;
                const zombieRadius = 0.5;

                // Full move, axis slide, then perpendicular sidestep around poles.
                pedestrianMoveWithSlide(ped, newX, newZ, zombieRadius);
            }

            // Face the player smoothly
            const targetRotation = Math.atan2(dx, dz);
            let currentRotation = ped.mesh.rotation.y;
            let rotDiff = targetRotation - currentRotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            const maxTurn = 3 * deltaTime;
            if (Math.abs(rotDiff) < maxTurn) {
                ped.mesh.rotation.y = targetRotation;
            } else {
                ped.mesh.rotation.y += Math.sign(rotDiff) * maxTurn;
            }

            // Zombie shamble bob
            ped.bobPhase += deltaTime * bobSpeed * 0.6;
            ped.mesh.position.y = ped.baseY + Math.abs(Math.sin(ped.bobPhase)) * bobAmplitude * 1.5;
            return;
        }

        // If was chasing but player went back inside or day returned, return to sidewalk
        if (ped.state === 'chasing') {
            // Transition to returning — lower arms immediately
            ped.state = 'returning';
            ped.mesh.traverse((child) => {
                if (child.userData && child.userData.isArm) {
                    child.rotation.x = 0.1;
                    child.rotation.z = child.userData.armSide * 0.15;
                }
            });
        }
        if (ped.state === 'returning') {
            // Move back toward the sidewalk Z position
            const dzSidewalk = sidewalkZ - ped.mesh.position.z;
            const dxCenter = 0 - ped.mesh.position.x; // Move toward center-ish
            const returnDist = Math.sqrt(dxCenter * dxCenter + dzSidewalk * dzSidewalk);

            if (Math.abs(dzSidewalk) > 0.5) {
                // Still returning to sidewalk
                const returnSpeed = walkSpeed * (pedestriansAreZombies ? 0.4 : 1.0);
                const moveX = (dxCenter / returnDist) * returnSpeed * deltaTime;
                const moveZ = (dzSidewalk / returnDist) * returnSpeed * deltaTime;
                const retNewX = ped.mesh.position.x + moveX;
                const retNewZ = ped.mesh.position.z + moveZ;
                const retRadius = 0.5;

                pedestrianMoveWithSlide(ped, retNewX, retNewZ, retRadius);

                // Face movement direction
                const targetRotation = Math.atan2(dxCenter, dzSidewalk);
                let currentRotation = ped.mesh.rotation.y;
                let rotDiff = targetRotation - currentRotation;
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                const maxTurn = 3 * deltaTime;
                if (Math.abs(rotDiff) < maxTurn) {
                    ped.mesh.rotation.y = targetRotation;
                } else {
                    ped.mesh.rotation.y += Math.sign(rotDiff) * maxTurn;
                }

                // Bob animation while returning
                ped.bobPhase += deltaTime * bobSpeed * (pedestriansAreZombies ? 0.6 : 1.0);
                ped.mesh.position.y = ped.baseY + Math.abs(Math.sin(ped.bobPhase)) * bobAmplitude * bobMultiplier;
                return;
            }

            // Back on the sidewalk - resume normal walking
            ped.mesh.position.z = sidewalkZ;
            ped.state = 'walking';
            ped.stuckTimer = 0;
            ped.mesh.rotation.y = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        }

        if (ped.state === 'paused') {
            // Count down pause timer
            ped.pauseTimer -= deltaTime;
            if (ped.pauseTimer <= 0) {
                ped.state = 'walking';
                ped.stuckTimer = 0;
                // Resume facing walking direction
                ped.mesh.rotation.y = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            return;
        }

        // Walking state
        const currentX = ped.mesh.position.x;
        let canMove = true;
        let speedMultiplier = 1;

        // Check for nearby pedestrians - slow down or stop if too close
        sidewalkPedestrians.forEach((other, otherIndex) => {
            if (index === otherIndex) return;
            const dist = Math.abs(currentX - other.mesh.position.x);

            // Check if this pedestrian is ahead in our walking direction
            const otherIsAhead = (ped.direction > 0 && other.mesh.position.x > currentX) ||
                                 (ped.direction < 0 && other.mesh.position.x < currentX);

            if (dist < 1.0 && otherIsAhead) {
                // Very close to someone ahead - stop briefly
                canMove = false;
            } else if (dist < avoidDistance && otherIsAhead) {
                // Slow down when approaching someone ahead
                speedMultiplier = Math.min(speedMultiplier, dist / avoidDistance);
            }
        });

        if (canMove) {
            // Reset stuck timer when moving
            ped.stuckTimer = 0;

            // Move towards target (zombies move slower)
            const moveAmount = walkSpeed * speedMultiplier * speedMultiplierBase * deltaTime * ped.direction;
            ped.mesh.position.x += moveAmount;

            // Walking/shambling bob animation (zombies have more pronounced movement)
            ped.bobPhase += deltaTime * bobSpeed * (pedestriansAreZombies ? 0.6 : 1.0);
            ped.mesh.position.y = ped.baseY + Math.abs(Math.sin(ped.bobPhase)) * bobAmplitude * bobMultiplier;
        } else {
            // Increment stuck timer when blocked by another pedestrian
            ped.stuckTimer += deltaTime;

            // If stuck for too long behind someone, try to wait patiently
            // (they'll eventually move or we'll get a chance to pass)
            if (ped.stuckTimer > 3.0) {
                // After 3 seconds, turn around and go the other way
                ped.direction *= -1;
                ped.targetX = ped.direction > 0 ? maxX : minX;
                ped.mesh.rotation.y = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
                ped.stuckTimer = 0;
            }
        }

        // Check if reached boundary - turn around
        if (ped.direction > 0 && currentX >= maxX) {
            ped.direction = -1;
            ped.targetX = minX;
            ped.mesh.rotation.y = -Math.PI / 2; // Face left (negative X)
            ped.stuckTimer = 0;
        } else if (ped.direction < 0 && currentX <= minX) {
            ped.direction = 1;
            ped.targetX = maxX;
            ped.mesh.rotation.y = Math.PI / 2; // Face right (positive X)
            ped.stuckTimer = 0;
        }

        // Random chance to pause and window shop at storefronts (zombies don't window shop!)
        if (!pedestriansAreZombies) {
            windowShopPositions.forEach(shopX => {
                if (Math.abs(currentX - shopX) < 2 && Math.random() < pauseChance * deltaTime * 0.5) {
                    ped.state = 'paused';
                    ped.pauseTimer = pauseTimeMin + Math.random() * (pauseTimeMax - pauseTimeMin);
                    ped.stuckTimer = 0;
                    // Face the storefront (toward negative Z - toward the buildings)
                    ped.mesh.rotation.y = Math.PI;
                }
            });
        }
    });
}

/**
 * Get pedestrian meshes for raycasting
 * @returns {THREE.Object3D[]} Array of pedestrian meshes
 */
export function getPedestrianMeshes() {
    return sidewalkPedestrians.map(ped => ped.mesh);
}

/**
 * Pause a pedestrian for dialog - makes them face the player and stop moving
 * @param {THREE.Object3D} pedestrianMesh - The pedestrian mesh that was clicked
 * @param {THREE.Vector3} playerPosition - Current player position
 */
export function pausePedestrianForDialog(pedestrianMesh, playerPosition) {
    // Find the pedestrian state for this mesh
    for (const ped of sidewalkPedestrians) {
        if (ped.mesh === pedestrianMesh) {
            // Save previous state
            pedestrianInDialog = ped;
            pedestrianPreviousState = ped.state;

            // Set to talking state
            ped.state = 'talking';

            // Calculate direction to player
            const dx = playerPosition.x - ped.mesh.position.x;
            const dz = playerPosition.z - ped.mesh.position.z;

            // Rotate to face player
            ped.mesh.rotation.y = Math.atan2(dx, dz);
            return;
        }
    }
}

/**
 * Resume a pedestrian after dialog ends
 */
export function resumePedestrianFromDialog() {
    if (pedestrianInDialog) {
        const ped = pedestrianInDialog;

        if (pedestrianPreviousState === 'chasing') {
            // It was mid-pursuit. Lower the raised chase arms and send it back to
            // the sidewalk, so it does not linger in the pursue pose after the
            // dialog (e.g. once the player uses "Back to Gallery"). If the player
            // is still outside at night, the chase logic re-engages next frame.
            ped.mesh.traverse((child) => {
                if (child.userData && child.userData.isArm) {
                    child.rotation.x = 0.1;
                    child.rotation.z = child.userData.armSide * 0.15;
                }
            });
            ped.state = 'returning';
        } else {
            // Resume normal patrol, facing the walking direction again.
            ped.state = 'walking';
            ped.mesh.rotation.y = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        }

        pedestrianInDialog = null;
        pedestrianPreviousState = null;
    }
}

/**
 * Check if pedestrians are currently zombies (nighttime)
 * @returns {boolean} True if pedestrians are zombies
 */
export function arePedestriansZombies() {
    return pedestriansAreZombies;
}
