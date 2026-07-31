// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * street.js - Street furniture builders (shared engine part)
 *
 * Trees, street lamps, benches, and flower planters. Each attaches itself to
 * the world root, registers a collider, and registers as a click-only outdoor
 * prop. The experience's layout code chooses positions.
 */
import { getWorldGroup, getWorldConfig, addCollider, registerOutdoorProp, isMobileDevice } from './world-1.0.0.min.js';

/**
 * Create a tree
 */
export function createTree(x, z, scale = 1) {
    const treeGroup = new THREE.Group();
    treeGroup.name = `tree_${x}_${z}`;

    // Trunk
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9,
        metalness: 0.0
    });

    const trunkHeight = 2 * scale;
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, trunkHeight, 8),
        trunkMaterial
    );
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    // Foliage (multiple spheres for fuller look)
    const foliageMaterial = new THREE.MeshStandardMaterial({
        color: 0x228B22,
        roughness: 0.8,
        metalness: 0.0
    });

    const foliagePositions = [
        { x: 0, y: trunkHeight + 0.8 * scale, z: 0, r: 1.2 * scale },
        { x: 0.5 * scale, y: trunkHeight + 0.3 * scale, z: 0.3 * scale, r: 0.8 * scale },
        { x: -0.4 * scale, y: trunkHeight + 0.4 * scale, z: -0.3 * scale, r: 0.9 * scale },
        { x: 0, y: trunkHeight + 1.5 * scale, z: 0, r: 0.7 * scale },
    ];

    foliagePositions.forEach(pos => {
        const foliage = new THREE.Mesh(
            new THREE.SphereGeometry(pos.r, 8, 8),
            foliageMaterial
        );
        foliage.position.set(pos.x, pos.y, pos.z);
        foliage.castShadow = true;
        treeGroup.add(foliage);
    });

    // Tree planter box
    const planterMaterial = new THREE.MeshStandardMaterial({
        color: 0x696969,
        roughness: 0.7,
        metalness: 0.1
    });

    const planter = new THREE.Mesh(
        new THREE.BoxGeometry(1 * scale, 0.4 * scale, 1 * scale),
        planterMaterial
    );
    planter.position.y = 0.2 * scale;
    planter.castShadow = true;
    treeGroup.add(planter);

    // Add collision for tree trunk/planter
    const collisionBox = new THREE.Box3();
    collisionBox.min.set(x - 0.5 * scale, 0, z - 0.5 * scale);
    collisionBox.max.set(x + 0.5 * scale, trunkHeight, z + 0.5 * scale);
    addCollider({ box: collisionBox, type: 'tree' });

    treeGroup.position.set(x, 0, z);
    registerOutdoorProp(treeGroup, 'tree');
    getWorldGroup().add(treeGroup);
}

/**
 * Create a street lamp
 */
export function createStreetLamp(x, z) {
    const lampGroup = new THREE.Group();
    lampGroup.name = `streetLamp_${x}_${z}`;

    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.4,
        metalness: 0.7
    });

    // Main pole
    const poleHeight = 4;
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, poleHeight, 8),
        poleMaterial
    );
    pole.position.y = poleHeight / 2;
    pole.castShadow = true;
    lampGroup.add(pole);

    // Decorative base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8),
        poleMaterial
    );
    base.position.y = 0.15;
    lampGroup.add(base);

    // Lamp arm
    const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.08, 0.08),
        poleMaterial
    );
    arm.position.set(0.35, poleHeight - 0.1, 0);
    lampGroup.add(arm);

    // Lamp housing
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.3,
        metalness: 0.6
    });

    const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.25, 0.4),
        housingMaterial
    );
    housing.position.set(0.7, poleHeight - 0.2, 0);
    lampGroup.add(housing);

    // Lamp glass/light emitter
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFF8DC,
        emissive: 0xFFF8DC,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9
    });

    const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.15, 0.35),
        glassMaterial
    );
    glass.position.set(0.7, poleHeight - 0.35, 0);
    lampGroup.add(glass);

    // Add point light
    const light = new THREE.PointLight(0xFFF8DC, 0.4, 15);
    light.position.set(0.7, poleHeight - 0.4, 0);
    light.castShadow = false;
    lampGroup.add(light);

    // Collision for pole
    const collisionBox = new THREE.Box3();
    collisionBox.min.set(x - 0.15, 0, z - 0.15);
    collisionBox.max.set(x + 0.15, poleHeight, z + 0.15);
    addCollider({ box: collisionBox, type: 'lamp' });

    lampGroup.position.set(x, 0, z);
    registerOutdoorProp(lampGroup, 'lamppost');
    getWorldGroup().add(lampGroup);
}

/**
 * Create a bench
 */
export function createBench(x, z, rotation = 0) {
    const benchGroup = new THREE.Group();
    benchGroup.name = `bench_${x}_${z}`;

    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.0
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.4,
        metalness: 0.7
    });

    const benchWidth = 1.8;
    const benchDepth = 0.5;
    const seatHeight = 0.45;

    // Seat planks
    for (let i = 0; i < 4; i++) {
        const plank = new THREE.Mesh(
            new THREE.BoxGeometry(benchWidth, 0.05, 0.1),
            woodMaterial
        );
        plank.position.set(0, seatHeight, -benchDepth / 2 + 0.1 + i * 0.12);
        plank.castShadow = true;
        benchGroup.add(plank);
    }

    // Back rest planks
    for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(
            new THREE.BoxGeometry(benchWidth, 0.08, 0.02),
            woodMaterial
        );
        plank.position.set(0, seatHeight + 0.15 + i * 0.15, -benchDepth / 2 - 0.05);
        plank.rotation.x = -0.1;
        plank.castShadow = true;
        benchGroup.add(plank);
    }

    // Metal legs/supports
    const legPositions = [-benchWidth / 2 + 0.15, benchWidth / 2 - 0.15];
    legPositions.forEach(lx => {
        // Front leg
        const frontLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, seatHeight, 0.05),
            metalMaterial
        );
        frontLeg.position.set(lx, seatHeight / 2, benchDepth / 2 - 0.1);
        benchGroup.add(frontLeg);

        // Back leg
        const backLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, seatHeight + 0.5, 0.05),
            metalMaterial
        );
        backLeg.position.set(lx, (seatHeight + 0.5) / 2, -benchDepth / 2 - 0.05);
        benchGroup.add(backLeg);

        // Arm rest support
        const armRest = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.05, benchDepth + 0.1),
            metalMaterial
        );
        armRest.position.set(lx, seatHeight + 0.25, 0);
        benchGroup.add(armRest);
    });

    // Collision box
    const collisionBox = new THREE.Box3();
    collisionBox.min.set(x - benchWidth / 2, 0, z - benchDepth / 2 - 0.2);
    collisionBox.max.set(x + benchWidth / 2, seatHeight + 0.6, z + benchDepth / 2);
    addCollider({ box: collisionBox, type: 'bench' });

    benchGroup.rotation.y = rotation;
    benchGroup.position.set(x, 0, z);
    registerOutdoorProp(benchGroup, 'bench');
    getWorldGroup().add(benchGroup);
}

/**
 * Create a flower planter
 */
export function createPlanter(x, z) {
    const planterGroup = new THREE.Group();
    planterGroup.name = `planter_${x}_${z}`;

    // Planter box
    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.0
    });

    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.8),
        boxMaterial
    );
    box.position.y = 0.25;
    box.castShadow = true;
    planterGroup.add(box);

    // Soil
    const soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2817,
        roughness: 1.0,
        metalness: 0.0
    });

    // The soil surface sits 1cm PROUD of the box's solid top face (a gentle
    // mound). Flush placement put the two faces in the same plane, which
    // z-fights (the flickering "shading" across the soil).
    const soil = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.1, 0.7),
        soilMaterial
    );
    soil.position.y = 0.46;
    planterGroup.add(soil);

    // Flowers (colorful spheres/cones)
    const flowerColors = [0xFF69B4, 0xFF6347, 0xFFD700, 0x9370DB, 0xFF4500];
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x228B22,
        roughness: 0.8
    });

    for (let i = 0; i < 5; i++) {
        const flowerMaterial = new THREE.MeshStandardMaterial({
            color: flowerColors[i % flowerColors.length],
            roughness: 0.6
        });

        const angle = (i / 5) * Math.PI * 2;
        const radius = 0.2;
        const fx = Math.cos(angle) * radius;
        const fz = Math.sin(angle) * radius;

        // Stem
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4),
            leafMaterial
        );
        stem.position.set(fx, 0.6, fz);
        planterGroup.add(stem);

        // Flower head
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 6, 6),
            flowerMaterial
        );
        flower.position.set(fx, 0.78, fz);
        planterGroup.add(flower);
    }

    // Center tall flower
    const centerStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.45, 4),
        leafMaterial
    );
    centerStem.position.set(0, 0.7, 0);
    planterGroup.add(centerStem);

    const centerFlower = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xFF1493, roughness: 0.6 })
    );
    centerFlower.position.set(0, 0.95, 0);
    planterGroup.add(centerFlower);

    // Collision
    const collisionBox = new THREE.Box3();
    collisionBox.min.set(x - 0.4, 0, z - 0.4);
    collisionBox.max.set(x + 0.4, 1, z + 0.4);
    addCollider({ box: collisionBox, type: 'planter' });

    planterGroup.position.set(x, 0, z);
    registerOutdoorProp(planterGroup, 'planter');
    getWorldGroup().add(planterGroup);
}
