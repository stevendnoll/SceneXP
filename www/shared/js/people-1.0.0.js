// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * people.js - Procedural human figures (shared engine part)
 *
 * createPerson builds a complete low-poly person from a config (role, colors,
 * hair, skirt/apron flags). shuffled/pickBalanced help draw varied casts.
 * All pure: no world state touched.
 */

/**
 * Create a detailed person figure
 * @param {Object} config - Person configuration
 * @returns {THREE.Group} The person group
 */
export function createPerson(config) {
    const {
        role = 'customer',
        x = 0,
        z = 0,
        rotationY = 0,
        shirtColor = 0x4a90d9,
        pantsColor = 0x2c3e50,
        skinTone = 0xffdbac,
        hairColor = 0x4a3728,
        eyeColor = 0x2c1810,   // iris/pupil color (dark brown by default)
        hasApron = false,
        apronColor = 0x1a1a2e,
        hairStyle = 'short',   // 'short' | 'long' (shoulder-length) | 'buzz' (close-cropped)
        hasSkirt = false,      // render an A-line skirt in place of the belt
        bald = false,          // skip all hair for a clean bald head
        muscular = false,      // broader torso + shoulders and thicker arms and legs
        handScale = 1,         // relative hand size (1 = standard)
        footScale = 1,         // relative shoe size (1 = standard)
        hasSuit = false,       // jacket lapels, a dress shirt, and a necktie
        tieColor = 0x8c1d2c,   // necktie color (used when hasSuit)
        dressShirt = false     // button-down dress shirt: center placket + long sleeves, no jacket/tie
    } = config;

    const person = new THREE.Group();
    person.name = `person_${role}_${x}_${z}`;
    person.userData.role = role;
    person.userData.isShopkeeper = role === 'shopkeeper';
    person.userData.isCustomer = role === 'customer';
    person.userData.isPedestrian = role === 'pedestrian';

    // Materials
    const skinMaterial = new THREE.MeshStandardMaterial({
        color: skinTone,
        roughness: 0.8,
        metalness: 0.0
    });

    const shirtMaterial = new THREE.MeshStandardMaterial({
        color: shirtColor,
        roughness: 0.7,
        metalness: 0.0
    });

    const pantsMaterial = new THREE.MeshStandardMaterial({
        color: pantsColor,
        roughness: 0.8,
        metalness: 0.0
    });

    const hairMaterial = new THREE.MeshStandardMaterial({
        color: hairColor,
        roughness: 0.9,
        metalness: 0.0
    });

    const shoeMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.6,
        metalness: 0.1
    });

    // Forearms/elbows are bare skin by default (short sleeves); a suit or a
    // long-sleeved dress shirt covers them to the wrist with the shirt material.
    const sleeveMaterial = (hasSuit || dressShirt) ? shirtMaterial : skinMaterial;

    // Body measurements (realistic proportions)
    const height = 1.75;
    const headRadius = 0.12;
    const neckHeight = 0.08;
    const torsoHeight = 0.55;
    const torsoWidth = 0.38 * (muscular ? 1.3 : 1);    // broader chest & shoulders
    const torsoDepth = 0.22 * (muscular ? 1.18 : 1);
    const armLength = 0.55;
    const armRadius = 0.045 * (muscular ? 1.55 : 1);   // thicker arms
    const legLength = 0.75;
    const legRadius = 0.065 * (muscular ? 1.35 : 1);   // thicker legs on a muscular build
    const footLength = 0.18;

    // === HEAD ===
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 12),
        skinMaterial
    );
    head.position.y = legLength + torsoHeight + neckHeight + headRadius;
    head.castShadow = true;
    person.add(head);

    // Face details - eyes
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: eyeColor });

    [-0.035, 0.035].forEach(offsetX => {
        // Eye white
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 8, 8),
            eyeMaterial
        );
        eye.position.set(offsetX, head.position.y + 0.02, headRadius - 0.01);
        eye.scale.z = 0.5;
        person.add(eye);

        // Pupil. Tagged so the zombie transform can recolor it reliably: the
        // dark pupil color is shared by some pedestrians' hair, so color alone
        // can't tell the two apart (see zombifyPedestrian).
        const pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.01, 6, 6),
            pupilMaterial
        );
        pupil.userData.isPupil = true;
        pupil.position.set(offsetX, head.position.y + 0.02, headRadius + 0.005);
        person.add(pupil);
    });

    // Nose
    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.03, 6),
        skinMaterial
    );
    nose.position.set(0, head.position.y - 0.01, headRadius);
    nose.rotation.x = Math.PI / 2;
    person.add(nose);

    // Ears
    [-1, 1].forEach(side => {
        const ear = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 6, 6),
            skinMaterial
        );
        ear.position.set(side * (headRadius - 0.01), head.position.y, 0);
        ear.scale.set(0.4, 0.7, 0.5);
        person.add(ear);
    });

    // Hair (styled based on role) - positioned to not cover face
    const hairGroup = new THREE.Group();
    if (hairStyle === 'buzz') {
        // Close-cropped buzz cut: one tight cap hugging the skull with no
        // added volume, trimmed to expose the forehead and clear the ears.
        // Checked before the role branches so any figure can wear it.
        const buzz = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius * 1.015, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
            hairMaterial
        );
        buzz.position.y = head.position.y + 0.012;
        buzz.position.z = -0.012;  // expose the forehead
        hairGroup.add(buzz);
    } else if (role === 'shopkeeper') {
        // Neat, shorter hair for shopkeeper
        const hairTop = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius * 1.02, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
            hairMaterial
        );
        hairTop.position.y = head.position.y + 0.05;
        hairTop.position.z = -0.02;  // Shift back to expose forehead
        hairGroup.add(hairTop);

        // Side/back hair
        const hairSide = new THREE.Mesh(
            new THREE.BoxGeometry(headRadius * 2.1, headRadius * 0.4, headRadius * 1.4),
            hairMaterial
        );
        hairSide.position.y = head.position.y + 0.06;
        hairSide.position.z = -0.04;  // Further back
        hairGroup.add(hairSide);
    } else if (hairStyle === 'long') {
        // Shoulder-length hair: a fuller crown, a curtain falling down the back
        // to the shoulders, and two strands framing the face. A clearly distinct
        // silhouette so the crowd reads as more varied.
        const hairTop = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius * 1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
            hairMaterial
        );
        hairTop.position.y = head.position.y + 0.04;
        hairTop.position.z = -0.008;
        hairGroup.add(hairTop);

        // Curtain of hair down the back of the head to the shoulders
        const hairBack = new THREE.Mesh(
            new THREE.BoxGeometry(headRadius * 2.0, 0.30, headRadius * 1.3),
            hairMaterial
        );
        hairBack.position.y = head.position.y - 0.10;
        hairBack.position.z = -headRadius * 0.55;
        hairGroup.add(hairBack);

        // Two strands framing the face
        [-1, 1].forEach(side => {
            const lock = new THREE.Mesh(
                new THREE.BoxGeometry(headRadius * 0.5, 0.20, headRadius * 1.0),
                hairMaterial
            );
            lock.position.set(side * headRadius * 0.95, head.position.y - 0.05, headRadius * 0.1);
            hairGroup.add(lock);
        });
    } else {
        // Varied hair styles for customers - raised hairline
        const hairTop = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius * 1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
            hairMaterial
        );
        hairTop.position.y = head.position.y + 0.045;
        hairTop.position.z = -0.015;  // Shift back slightly
        hairGroup.add(hairTop);

        // Back of hair
        const hairBack = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius * 0.95, 8, 8),
            hairMaterial
        );
        hairBack.position.y = head.position.y + 0.02;
        hairBack.position.z = -headRadius * 0.6;
        hairBack.scale.set(1, 1.1, 0.6);
        hairGroup.add(hairBack);
    }
    if (!bald) person.add(hairGroup);  // bald: leave the head clean

    // === NECK ===
    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.05, neckHeight, 8),
        skinMaterial
    );
    neck.position.y = legLength + torsoHeight + neckHeight / 2;
    person.add(neck);

    // === TORSO ===
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        shirtMaterial
    );
    torso.position.y = legLength + torsoHeight / 2;
    torso.castShadow = true;
    person.add(torso);

    // Shirt collar
    const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.015, 6, 12, Math.PI),
        shirtMaterial
    );
    collar.position.y = legLength + torsoHeight - 0.02;
    collar.position.z = torsoDepth / 2 - 0.01;
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI;
    person.add(collar);

    // === DRESS SHIRT (button-down placket, no jacket) ===
    // A subtle center placket with a row of small buttons, so the torso reads as
    // a proper button-down shirt rather than a plain tee. Skipped under a suit,
    // which draws its own (white) placket and tie.
    if (dressShirt && !hasSuit) {
        const frontZ = torsoDepth / 2;
        const torsoTop = legLength + torsoHeight;
        const placketMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(shirtColor).multiplyScalar(0.9), roughness: 0.7
        });
        const buttonMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(shirtColor).multiplyScalar(0.72), roughness: 0.5
        });
        const placket = new THREE.Mesh(
            new THREE.BoxGeometry(0.045, torsoHeight * 0.82, 0.014), placketMat
        );
        placket.position.set(0, torsoTop - torsoHeight * 0.44, frontZ + 0.006);
        person.add(placket);
        for (let i = 0; i < 4; i++) {
            const button = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 6), buttonMat);
            button.position.set(0, torsoTop - torsoHeight * 0.2 - i * (torsoHeight * 0.17), frontZ + 0.014);
            person.add(button);
        }
    }

    // === SUIT (jacket lapels, dress shirt, necktie) ===
    if (hasSuit) {
        const frontZ = torsoDepth / 2;
        const torsoTop = legLength + torsoHeight;   // shoulders/collar height
        const lapelMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(shirtColor).multiplyScalar(0.8), roughness: 0.6, metalness: 0.05
        });
        const dressShirtMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.7 });
        const tieMat = new THREE.MeshStandardMaterial({ color: tieColor, roughness: 0.5, metalness: 0.1 });

        // Dress-shirt placket peeking out of the jacket, down the center chest.
        const placket = new THREE.Mesh(
            new THREE.BoxGeometry(0.11, torsoHeight * 0.62, 0.012), dressShirtMat
        );
        placket.position.set(0, torsoTop - torsoHeight * 0.34, frontZ + 0.006);
        person.add(placket);

        // Necktie: a small knot at the collar and a blade down toward the waist.
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.02), tieMat);
        knot.position.set(0, torsoTop - 0.045, frontZ + 0.016);
        person.add(knot);
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, torsoHeight * 0.5, 0.014), tieMat);
        tie.position.set(0, torsoTop - torsoHeight * 0.34, frontZ + 0.014);
        person.add(tie);

        // Jacket lapels: two angled panels framing the shirt and tie.
        [-1, 1].forEach(side => {
            const lapel = new THREE.Mesh(
                new THREE.BoxGeometry(0.07, torsoHeight * 0.5, 0.014), lapelMat
            );
            lapel.position.set(side * 0.075, torsoTop - torsoHeight * 0.27, frontZ + 0.004);
            lapel.rotation.z = side * 0.32;
            person.add(lapel);
        });
    }

    // === APRON (for shopkeeper) ===
    if (hasApron) {
        const apronMaterial = new THREE.MeshStandardMaterial({
            color: apronColor,
            roughness: 0.8,
            metalness: 0.0
        });

        // Main apron body
        const apron = new THREE.Mesh(
            new THREE.BoxGeometry(torsoWidth * 0.85, torsoHeight * 0.9 + legLength * 0.3, 0.02),
            apronMaterial
        );
        apron.position.y = legLength * 0.85 + torsoHeight * 0.4;
        apron.position.z = torsoDepth / 2 + 0.02;
        person.add(apron);

        // Apron pocket
        const pocket = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.1, 0.015),
            apronMaterial
        );
        pocket.position.y = legLength + torsoHeight * 0.3;
        pocket.position.z = torsoDepth / 2 + 0.035;
        person.add(pocket);

        // Apron straps (neck strap)
        const strapMaterial = new THREE.MeshStandardMaterial({
            color: apronColor,
            roughness: 0.8
        });

        [-0.08, 0.08].forEach(offsetX => {
            const strap = new THREE.Mesh(
                new THREE.BoxGeometry(0.025, 0.15, 0.01),
                strapMaterial
            );
            strap.position.set(offsetX, legLength + torsoHeight + 0.02, torsoDepth / 2 - 0.02);
            strap.rotation.x = -0.3;
            person.add(strap);
        });

        // Name tag on apron
        const nameTagBacking = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.03, 0.005),
            new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        nameTagBacking.position.set(0.08, legLength + torsoHeight * 0.7, torsoDepth / 2 + 0.04);
        person.add(nameTagBacking);
    }

    // === ARMS ===
    [-1, 1].forEach(side => {
        const armGroup = new THREE.Group();

        // Upper arm
        const upperArm = new THREE.Mesh(
            new THREE.CylinderGeometry(armRadius, armRadius * 1.1, armLength * 0.5, 8),
            shirtMaterial
        );
        upperArm.position.y = -armLength * 0.25;
        armGroup.add(upperArm);

        // Elbow
        const elbow = new THREE.Mesh(
            new THREE.SphereGeometry(armRadius * 1.05, 8, 8),
            sleeveMaterial
        );
        elbow.position.y = -armLength * 0.5;
        armGroup.add(elbow);

        // Forearm
        const forearm = new THREE.Mesh(
            new THREE.CylinderGeometry(armRadius * 0.9, armRadius, armLength * 0.45, 8),
            sleeveMaterial
        );
        forearm.position.y = -armLength * 0.75;
        armGroup.add(forearm);

        // Hand (handScale enlarges it relative to the figure)
        const hand = new THREE.Mesh(
            new THREE.SphereGeometry(0.04 * handScale, 8, 8),
            skinMaterial
        );
        hand.position.y = -armLength - 0.02;
        hand.scale.set(0.8, 1, 0.5);
        armGroup.add(hand);

        // Position arm group at shoulder
        armGroup.position.set(
            side * (torsoWidth / 2 + armRadius * 0.5),
            legLength + torsoHeight - 0.05,
            0
        );

        // Slight arm rotation for natural pose
        armGroup.rotation.z = side * 0.15;
        armGroup.rotation.x = 0.1;

        // Tag arm for zombie pose manipulation
        armGroup.userData.isArm = true;
        armGroup.userData.armSide = side;

        person.add(armGroup);
    });

    // === LEGS ===
    [-1, 1].forEach(side => {
        const legGroup = new THREE.Group();

        // Upper leg (thigh)
        const thigh = new THREE.Mesh(
            new THREE.CylinderGeometry(legRadius, legRadius * 1.1, legLength * 0.5, 8),
            pantsMaterial
        );
        thigh.position.y = -legLength * 0.25;
        legGroup.add(thigh);

        // Knee
        const knee = new THREE.Mesh(
            new THREE.SphereGeometry(legRadius * 0.95, 8, 8),
            pantsMaterial
        );
        knee.position.y = -legLength * 0.5;
        legGroup.add(knee);

        // Lower leg (shin)
        const shin = new THREE.Mesh(
            new THREE.CylinderGeometry(legRadius * 0.8, legRadius * 0.9, legLength * 0.48, 8),
            pantsMaterial
        );
        shin.position.y = -legLength * 0.75;
        legGroup.add(shin);

        // Foot/shoe (footScale enlarges it; the sole stays at floor level, so
        // the extra height grows upward and the extra length toward the toe)
        const shoeHeight = 0.06 * footScale;
        const shoe = new THREE.Mesh(
            new THREE.BoxGeometry(0.09 * footScale, shoeHeight, footLength * footScale),
            shoeMaterial
        );
        shoe.position.y = -legLength - 0.05 + shoeHeight / 2;
        shoe.position.z = footLength * footScale * 0.2;
        legGroup.add(shoe);

        // Position leg group at hip
        legGroup.position.set(
            side * (torsoWidth / 4),
            legLength,
            0
        );

        person.add(legGroup);
    });

    // === BELT (skipped when wearing a skirt) ===
    if (!hasSkirt) {
        const belt = new THREE.Mesh(
            new THREE.BoxGeometry(torsoWidth + 0.02, 0.04, torsoDepth + 0.02),
            new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.5, metalness: 0.2 })
        );
        belt.position.y = legLength + 0.02;
        person.add(belt);

        // Belt buckle
        const buckle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.035, 0.01),
            new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.8 })
        );
        buckle.position.y = legLength + 0.02;
        buckle.position.z = torsoDepth / 2 + 0.015;
        person.add(buckle);
    }

    // === SKIRT (A-line) ===
    // Flares from the waist to mid-thigh in the pants/skirt color; the shins and
    // shoes show below it. Paired with `hairStyle: 'long'` for a feminine look.
    if (hasSkirt) {
        const skirt = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.30, 0.34, 12),
            pantsMaterial
        );
        skirt.position.y = legLength - 0.12; // waist (~0.80) down to mid-thigh (~0.46)
        skirt.castShadow = true;
        person.add(skirt);
    }

    // Position and rotate the person
    // Shoe bottoms are at local y = -0.05, so raise by 0.055 to sit on floor (y = 0.005)
    person.position.set(x, 0.055, z);
    person.rotation.y = rotationY;

    return person;
}

/**
 * Create pedestrians walking on the sidewalk
 */
/** Fisher–Yates shuffle of a copy of `arr` (source untouched). */
export function shuffled(arr) {
    const c = arr.slice();
    for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
}

/**
 * Pick `n` items from `pool` while keeping the result balanced across the groups
 * defined by `keyFn` — every group contributes at least one item before any
 * group contributes a second (provided n ≥ the number of groups). Used so each
 * area's NPC cast always mixes presentations (e.g. never three of one gender),
 * while still varying randomly between page loads. Returns a shuffled subset.
 */
export function pickBalanced(pool, n, keyFn) {
    const groups = new Map();
    for (const item of pool) {
        const k = keyFn(item);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(item);
    }
    // Random group order, each group's items shuffled.
    const groupLists = shuffled([...groups.values()].map(shuffled));

    const chosen = [];
    const used = new Set();
    // Round-robin one item per group at a time, so coverage comes first.
    let added = true;
    while (added && chosen.length < n) {
        added = false;
        for (const list of groupLists) {
            if (chosen.length >= n) break;
            const pick = list.shift();
            if (pick) { chosen.push(pick); used.add(pick); added = true; }
        }
    }
    return shuffled(chosen);
}
