// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenery.js - Background scenery (shared engine part)
 *
 * Distant drifting clouds behind the world, with per-key toggles read from
 * the experience config (scenery: { clouds: true }).
 */
import { getWorldGroup, getWorldConfig, isMobileDevice } from './world-1.0.0.min.js';

// Store references for animated elements
const backgroundAnimations = {
    clouds: []
};

/**
 * Create the complete background scenery package
 */
export function createBackgroundScenery() {
    // Per-key toggles from the experience config; the minimized world keeps a
    // few background clouds by default. (Mountains, grass fields, and other
    // large backdrops were not carried into the shared library.)
    const cfg = getWorldConfig().scenery || {};
    backgroundAnimations.clouds.length = 0;
    if (cfg.clouds !== false) createClouds();
}

/**
 * Create fluffy clouds in the sky
 */
export function createClouds() {
    // Reduce cloud count on mobile (half)
    const isMobile = isMobileDevice();

    const allCloudPositions = [
        { x: -80, y: 50, z: -100, scale: 1.2 },
        { x: 40, y: 60, z: -120, scale: 1.5 },
        { x: -30, y: 55, z: -80, scale: 1.0 },
        { x: 100, y: 45, z: -140, scale: 1.3 },
        { x: -120, y: 65, z: -110, scale: 1.4 },
        { x: 70, y: 70, z: -90, scale: 1.1 },
        { x: -60, y: 75, z: -150, scale: 1.6 },
        { x: 20, y: 48, z: -130, scale: 0.9 }
    ];

    // Use half the clouds on mobile
    const cloudPositions = isMobile
        ? allCloudPositions.filter((_, i) => i % 2 === 0)
        : allCloudPositions;

    cloudPositions.forEach((pos, index) => {
        const cloud = createCloud(pos.scale);
        cloud.position.set(pos.x, pos.y, pos.z);
        cloud.name = `cloud_${index}`;

        // Store for animation
        backgroundAnimations.clouds.push({
            mesh: cloud,
            speed: 0.5 + Math.random() * 0.5,
            startX: pos.x
        });

        getWorldGroup().add(cloud);
    });
}

/**
 * Create a single fluffy cloud from grouped spheres
 */
export function createCloud(scale) {
    const cloudGroup = new THREE.Group();

    const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
    });

    // Create cloud from multiple overlapping spheres
    const puffs = [
        { x: 0, y: 0, z: 0, r: 4 },
        { x: 3, y: 0.5, z: 0, r: 3.5 },
        { x: -3, y: 0.3, z: 0, r: 3.2 },
        { x: 1.5, y: 1.5, z: 0, r: 2.8 },
        { x: -1.5, y: 1.2, z: 0, r: 2.5 },
        { x: 4.5, y: -0.5, z: 0.5, r: 2.5 },
        { x: -4.5, y: -0.3, z: -0.5, r: 2.8 }
    ];

    puffs.forEach(puff => {
        const geometry = new THREE.SphereGeometry(puff.r * scale, 8, 6);
        const sphere = new THREE.Mesh(geometry, cloudMaterial);
        sphere.position.set(puff.x * scale, puff.y * scale, puff.z * scale);
        cloudGroup.add(sphere);
    });

    return cloudGroup;
}

/**
 * Update background scenery animations
 */
export function updateBackgroundAnimations(deltaTime) {
    // Animate clouds - slow drift
    backgroundAnimations.clouds.forEach(cloud => {
        cloud.mesh.position.x += cloud.speed * deltaTime;

        // Reset position when cloud drifts too far
        if (cloud.mesh.position.x > 200) {
            cloud.mesh.position.x = -200;
        }
    });
}
