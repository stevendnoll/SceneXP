// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * furniture.js - Interior furniture builders (shared engine part)
 *
 * Pure builders: each returns a THREE.Group positioned at the origin (or at
 * the caller-given spot) and touches no world state. The caller places the
 * group and registers any colliders it wants.
 */

/**
 * Create a tall potted plant
 */
export function createTallPlant() {
    const plant = new THREE.Group();

    // Pot
    const potMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.1
    });

    const potGeometry = new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12);
    const pot = new THREE.Mesh(potGeometry, potMaterial);
    pot.position.y = 0.2;
    pot.castShadow = true;
    plant.add(pot);

    // Soil
    const soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2817,
        roughness: 1.0
    });
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12),
        soilMaterial
    );
    soil.position.y = 0.38;
    plant.add(soil);

    // Trunk/stem
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9
    });
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 1.0, 8),
        trunkMaterial
    );
    trunk.position.y = 0.9;
    plant.add(trunk);

    // Leaves (multiple layers of green spheres/cones)
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x228B22,
        roughness: 0.8
    });

    const leafPositions = [
        { y: 1.2, scale: 0.3 },
        { y: 1.4, scale: 0.35 },
        { y: 1.6, scale: 0.3 },
        { y: 1.75, scale: 0.2 }
    ];

    leafPositions.forEach(pos => {
        const leaves = new THREE.Mesh(
            new THREE.SphereGeometry(pos.scale, 8, 6),
            leafMaterial
        );
        leaves.position.y = pos.y;
        leaves.scale.y = 0.7;
        plant.add(leaves);
    });

    return plant;
}

/**
 * Create a small potted plant
 */
export function createSmallPlant() {
    const plant = new THREE.Group();

    // Pot
    const potMaterial = new THREE.MeshStandardMaterial({
        color: 0xCD853F,
        roughness: 0.7,
        metalness: 0.1
    });

    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.1, 0.2, 10),
        potMaterial
    );
    pot.position.y = 0.1;
    pot.castShadow = true;
    plant.add(pot);

    // Leaves (bushy small plant)
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x32CD32,
        roughness: 0.8
    });

    for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(0.1 + Math.random() * 0.05, 6, 5),
            leafMaterial
        );
        leaf.position.set(
            (Math.random() - 0.5) * 0.15,
            0.25 + Math.random() * 0.1,
            (Math.random() - 0.5) * 0.15
        );
        leaf.scale.y = 0.8;
        plant.add(leaf);
    }

    return plant;
}

/**
 * Create a snake plant (sansevieria) - tall, upright pointed leaves
 */
export function createSnakePlant() {
    const plant = new THREE.Group();

    // Pot
    const potMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8b0a0,
        roughness: 0.8,
        metalness: 0.05
    });
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.14, 0.36, 12),
        potMaterial
    );
    pot.position.y = 0.18;
    pot.castShadow = true;
    plant.add(pot);

    // Soil
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 1.0 })
    );
    soil.position.y = 0.35;
    plant.add(soil);

    // Upright sword-like leaves
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e7d32,
        roughness: 0.85
    });
    const leafCount = 7;
    for (let i = 0; i < leafCount; i++) {
        const height = 0.9 + Math.random() * 0.5;
        const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, height, 4),
            leafMaterial
        );
        const angle = (i / leafCount) * Math.PI * 2;
        const radius = 0.06 + Math.random() * 0.04;
        leaf.position.set(
            Math.cos(angle) * radius,
            0.35 + height / 2,
            Math.sin(angle) * radius
        );
        // Splay slightly outward and flatten into a blade
        leaf.rotation.z = Math.cos(angle) * 0.18;
        leaf.rotation.x = -Math.sin(angle) * 0.18;
        leaf.scale.z = 0.28;
        leaf.castShadow = true;
        plant.add(leaf);
    }

    return plant;
}

/**
 * Create a bushy fern with arching fronds
 */
export function createFernPlant() {
    const plant = new THREE.Group();

    // Pot
    const potMaterial = new THREE.MeshStandardMaterial({
        color: 0x9c5a3c,
        roughness: 0.75,
        metalness: 0.05
    });
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.16, 0.3, 12),
        potMaterial
    );
    pot.position.y = 0.15;
    pot.castShadow = true;
    plant.add(pot);

    // Soil
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 1.0 })
    );
    soil.position.y = 0.29;
    plant.add(soil);

    // Arching fronds - elongated cones splaying out and down
    const frondMaterial = new THREE.MeshStandardMaterial({
        color: 0x4caf50,
        roughness: 0.85
    });
    const frondCount = 11;
    for (let i = 0; i < frondCount; i++) {
        const length = 0.45 + Math.random() * 0.25;
        const frond = new THREE.Mesh(
            new THREE.ConeGeometry(0.07, length, 4),
            frondMaterial
        );
        const angle = (i / frondCount) * Math.PI * 2 + Math.random() * 0.4;
        const tilt = 0.7 + Math.random() * 0.4; // lean outward
        frond.position.set(
            Math.cos(angle) * 0.12,
            0.45 + Math.random() * 0.1,
            Math.sin(angle) * 0.12
        );
        frond.rotation.z = Math.cos(angle) * tilt;
        frond.rotation.x = -Math.sin(angle) * tilt;
        frond.scale.z = 0.4;
        frond.castShadow = true;
        plant.add(frond);
    }

    return plant;
}

/**
 * Create a sofa/couch
 */
export function createSofa() {
    const sofa = new THREE.Group();

    const cushionMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a6a,  // Muted blue-gray
        roughness: 0.9,
        metalness: 0.0
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.7,
        metalness: 0.2
    });

    // Base/frame
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.15, 0.8),
        frameMaterial
    );
    base.position.y = 0.15;
    base.castShadow = true;
    sofa.add(base);

    // Seat cushion
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.15, 0.7),
        cushionMaterial
    );
    seat.position.y = 0.3;
    seat.castShadow = true;
    sofa.add(seat);

    // Back cushion
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.5, 0.15),
        cushionMaterial
    );
    back.position.set(0, 0.55, -0.3);
    back.castShadow = true;
    sofa.add(back);

    // Armrests
    const armrestGeometry = new THREE.BoxGeometry(0.15, 0.35, 0.7);

    const leftArm = new THREE.Mesh(armrestGeometry, cushionMaterial);
    leftArm.position.set(-0.85, 0.4, 0);
    leftArm.castShadow = true;
    sofa.add(leftArm);

    const rightArm = new THREE.Mesh(armrestGeometry, cushionMaterial);
    rightArm.position.set(0.85, 0.4, 0);
    rightArm.castShadow = true;
    sofa.add(rightArm);

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8);
    const legPositions = [
        { x: -0.75, z: 0.3 },
        { x: 0.75, z: 0.3 },
        { x: -0.75, z: -0.3 },
        { x: 0.75, z: -0.3 }
    ];

    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeometry, frameMaterial);
        leg.position.set(pos.x, 0.04, pos.z);
        sofa.add(leg);
    });

    return sofa;
}

/**
 * Create a lounge chair
 */
export function createLoungeChair() {
    const chair = new THREE.Group();

    const cushionMaterial = new THREE.MeshStandardMaterial({
        color: 0x6a4a4a,  // Muted reddish-brown
        roughness: 0.9,
        metalness: 0.0
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        roughness: 0.6,
        metalness: 0.3
    });

    // Seat
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.1, 0.5),
        cushionMaterial
    );
    seat.position.y = 0.4;
    seat.castShadow = true;
    chair.add(seat);

    // Back
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.5, 0.08),
        cushionMaterial
    );
    back.position.set(0, 0.65, -0.22);
    back.rotation.x = 0.1;
    back.castShadow = true;
    chair.add(back);

    // Armrests
    const armGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.45);

    const leftArm = new THREE.Mesh(armGeometry, frameMaterial);
    leftArm.position.set(-0.28, 0.5, 0);
    chair.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, frameMaterial);
    rightArm.position.set(0.28, 0.5, 0);
    chair.add(rightArm);

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    const legPositions = [
        { x: -0.22, z: 0.18 },
        { x: 0.22, z: 0.18 },
        { x: -0.22, z: -0.18 },
        { x: 0.22, z: -0.18 }
    ];

    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeometry, frameMaterial);
        leg.position.set(pos.x, 0.175, pos.z);
        chair.add(leg);
    });

    return chair;
}

/**
 * Create a vending machine
 */
export function createVendingMachine() {
    const machine = new THREE.Group();

    // Main body
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.5,
        metalness: 0.3
    });

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.9, 0.7),
        bodyMaterial
    );
    body.position.y = 0.95;
    body.castShadow = true;
    machine.add(body);

    // Display window (glass front)
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x87CEEB,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
        metalness: 0.3
    });

    const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.2, 0.05),
        glassMaterial
    );
    glass.position.set(0, 1.1, 0.33);
    machine.add(glass);

    // Product display backing (inside the glass)
    const displayMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a4a,
        roughness: 0.8
    });

    const display = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 1.18, 0.02),
        displayMaterial
    );
    display.position.set(0, 1.1, 0.28);
    machine.add(display);

    // Product rows (colored rectangles to represent items)
    const productColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181];

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const productMaterial = new THREE.MeshStandardMaterial({
                color: productColors[Math.floor(Math.random() * productColors.length)],
                roughness: 0.6,
                emissive: productColors[Math.floor(Math.random() * productColors.length)],
                emissiveIntensity: 0.1
            });

            const product = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.2, 0.08),
                productMaterial
            );
            product.position.set(
                -0.25 + col * 0.17,
                0.6 + row * 0.28,
                0.25
            );
            machine.add(product);
        }
    }

    // Control panel
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x333344,
        roughness: 0.4,
        metalness: 0.5
    });

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.4, 0.08),
        panelMaterial
    );
    panel.position.set(0.25, 0.9, 0.35);
    machine.add(panel);

    // Buttons on panel
    const buttonMaterial = new THREE.MeshStandardMaterial({
        color: 0x2da6ed,
        emissive: 0x2da6ed,
        emissiveIntensity: 0.3
    });

    for (let i = 0; i < 3; i++) {
        const button = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8),
            buttonMaterial
        );
        button.rotation.x = Math.PI / 2;
        button.position.set(0.25, 1.0 - i * 0.1, 0.4);
        machine.add(button);
    }

    // Coin slot
    const slotMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.7
    });

    const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, 0.03),
        slotMaterial
    );
    slot.position.set(0.25, 0.75, 0.37);
    machine.add(slot);

    // Dispensing slot at bottom
    const dispenseSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    dispenseSlot.position.set(0, 0.2, 0.3);
    machine.add(dispenseSlot);

    return machine;
}
