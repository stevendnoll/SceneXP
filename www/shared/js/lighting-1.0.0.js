// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * lighting.js - Interior lighting machinery (shared engine part)
 *
 * Ceiling track lights, the interior ambient rig that brightens at night (fed
 * by the scene's day/night cycle), the user-facing dimmer, the clickable wall
 * light switch, and the EXIT sign. Intensities come from the experience
 * config: lighting: { base: { rectArea, hemi, corner, ceiling }, nightBoost }.
 */
import { getScene, isNightTime, getInteriorLightState } from './scene-1.0.0.min.js';
import { getWorldGroup, getWorldConfig, addCollider } from './world-1.0.0.min.js';

// Ceiling lights (always on)
let ceilingLights = [];

// Interior ambient lights (intensity increases at night)
let interiorAmbientLight = null;
let interiorHemiLight = null;
let interiorCornerLights = [];

// Base intensities for interior lights (daytime values)
const DEFAULT_LIGHT_BASE = {
    rectArea: 3,
    hemi: 0.8,
    corner: 1.5,
    ceiling: 3.5   // each ceiling track light (the dominant interior source)
};

// Boost multiplier for nighttime (how much brighter at night)
let INTERIOR_LIGHT_NIGHT_BOOST = 2.2;

// User-controlled dimmer (1 = normal), set via the light switch by the door and
// folded into the per-frame ambient update so it survives the day/night cycle.
let interiorLightUserScale = 1;

const INTERIOR_LIGHT_BASE = Object.assign({}, DEFAULT_LIGHT_BASE);

// Fold the experience's lighting config over the defaults. Called by the
// builders so intensities are settled before any light is created.
function applyLightingConfig() {
    const cfg = getWorldConfig().lighting || {};
    Object.assign(INTERIOR_LIGHT_BASE, DEFAULT_LIGHT_BASE, cfg.base || {});
    INTERIOR_LIGHT_NIGHT_BOOST = typeof cfg.nightBoost === 'number' ? cfg.nightBoost : 2.2;
}

let lightSwitchMesh = null;

/**
 * Create ceiling light fixtures with point lights
 * Lights are always on to provide consistent interior illumination
 */
/**
 * @param {{xs?: number[], zs?: number[]}} [layout] - optional explicit world
 *   coordinates for the fixture columns/rows. The default grid is spaced
 *   purely from the building's dimensions, blind to whatever an experience
 *   hangs from its ceiling, so experiences with beams or full-height
 *   partitions can pass positions that thread the gaps.
 */
export function createCeilingLights(layout) {
    applyLightingConfig();
    const { width, depth, height, positionX, positionZ } = getWorldConfig().building;

    // Light fixture material (always on - with emissive glow)
    const fixtureMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.5,
        metalness: 0.3,
        emissive: 0xfff5e6,
        emissiveIntensity: 0.3
    });

    // Light panel material (always glowing)
    const panelMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff8f0
    });

    // Fixture positions: an explicit layout when provided, otherwise the
    // default dimension-spaced grid (4 across, 3 deep).
    const lightsPerRow = 4;
    const lightRows = 3;
    const xSpacing = (width - 4) / (lightsPerRow + 1);
    const zSpacing = (depth - 4) / (lightRows + 1);
    const xs = (layout && layout.xs) ||
        Array.from({ length: lightsPerRow }, (_, i) => positionX - (width - 4) / 2 + xSpacing * (i + 1));
    const zs = (layout && layout.zs) ||
        Array.from({ length: lightRows }, (_, i) => positionZ - (depth - 4) / 2 + zSpacing * (i + 1));

    const fixtureWidth = 1.5;
    const fixtureDepth = 0.6;
    const fixtureHeight = 0.15;

    // Shared geometries for all fixtures (2 instead of 40)
    const housingGeometry = new THREE.BoxGeometry(fixtureWidth, fixtureHeight, fixtureDepth);
    const panelGeometry = new THREE.PlaneGeometry(fixtureWidth - 0.1, fixtureDepth - 0.1);

    for (let row = 1; row <= zs.length; row++) {
        for (let col = 1; col <= xs.length; col++) {
            const x = xs[col - 1];
            const z = zs[row - 1];
            const y = height - 0.2;

            // Create light fixture group
            const fixtureGroup = new THREE.Group();
            fixtureGroup.name = `ceilingLight_${row}_${col}`;

            // Fixture housing
            const housing = new THREE.Mesh(housingGeometry, fixtureMaterial);
            housing.position.set(0, 0, 0);
            housing.castShadow = true;
            fixtureGroup.add(housing);

            // Light panel (bottom of fixture)
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.rotation.x = Math.PI / 2;
            panel.position.set(0, -fixtureHeight / 2 - 0.01, 0);
            panel.name = 'lightPanel';
            fixtureGroup.add(panel);

            // Point light (the dominant interior source; scaled by the dimmer in
            // updateInteriorAmbientLight).
            const pointLight = new THREE.PointLight(0xfff5e6, INTERIOR_LIGHT_BASE.ceiling, 18, 1.2);
            pointLight.position.set(0, -0.3, 0);
            pointLight.castShadow = false; // Performance optimization
            pointLight.name = 'pointLight';
            fixtureGroup.add(pointLight);

            fixtureGroup.position.set(x, y, z);
            getWorldGroup().add(fixtureGroup);

            // Store reference
            ceilingLights.push({
                group: fixtureGroup,
                housing: housing,
                panel: panel,
                light: pointLight
            });
        }
    }

    // Add dedicated interior ambient light - constant brightness regardless of day/night
    createInteriorAmbientLight();
}

/**
 * Create interior ambient lighting
 * Intensity increases slightly at night for better visibility
 */
export function createInteriorAmbientLight() {
    applyLightingConfig();
    const { width, depth, height, positionX, positionZ } = getWorldConfig().building;
    const scene = getScene();

    // Clear previous corner lights array
    interiorCornerLights = [];

    // Interior ambient light - provides base illumination
    interiorAmbientLight = new THREE.RectAreaLight(0xfff8f0, INTERIOR_LIGHT_BASE.rectArea, width - 2, depth - 2);
    interiorAmbientLight.position.set(positionX, height - 0.5, positionZ);
    interiorAmbientLight.rotation.x = Math.PI / 2; // Point downward
    interiorAmbientLight.name = 'interiorAmbientLight';
    scene.add(interiorAmbientLight);

    // Add a hemisphere light inside the store for even ambient fill
    interiorHemiLight = new THREE.HemisphereLight(0xfff8f0, 0x444444, INTERIOR_LIGHT_BASE.hemi);
    interiorHemiLight.position.set(positionX, height / 2, positionZ);
    interiorHemiLight.name = 'interiorHemiLight';
    getWorldGroup().add(interiorHemiLight);

    // Add additional point lights in corners for more even coverage
    const cornerLightDistance = 20;
    const cornerOffset = 5;
    const cornerY = height * 0.6;

    const cornerPositions = [
        [positionX - width/2 + cornerOffset, cornerY, positionZ - depth/2 + cornerOffset],
        [positionX + width/2 - cornerOffset, cornerY, positionZ - depth/2 + cornerOffset],
        [positionX - width/2 + cornerOffset, cornerY, positionZ + depth/2 - cornerOffset],
        [positionX + width/2 - cornerOffset, cornerY, positionZ + depth/2 - cornerOffset]
    ];

    cornerPositions.forEach((pos, i) => {
        const cornerLight = new THREE.PointLight(0xfff5e6, INTERIOR_LIGHT_BASE.corner, cornerLightDistance, 1.5);
        cornerLight.position.set(pos[0], pos[1], pos[2]);
        cornerLight.name = `interiorCornerLight_${i}`;
        getWorldGroup().add(cornerLight);
        interiorCornerLights.push(cornerLight);
    });
}

/**
 * Update interior ambient lighting based on day/night cycle
 * Increases brightness slightly at night for better visibility
 */
export function updateInteriorAmbientLight() {
    const { shouldBeOn, intensity } = getInteriorLightState();

    // Day/night boost: 1.0 during day, up to NIGHT_BOOST at full night.
    const boostFactor = 1 + (INTERIOR_LIGHT_NIGHT_BOOST - 1) * intensity;

    // The hemisphere light is global — it fills the street too — so the dimmer
    // never touches it; it tracks only the day/night cycle. (It's the ambient
    // floor that keeps the room from going fully black: lowering it would dim the
    // outdoors, which we don't want.)
    if (interiorHemiLight) {
        interiorHemiLight.intensity = INTERIOR_LIGHT_BASE.hemi * boostFactor;
    }

    // Local interior fixtures (rect-area light + corner fills) carry the dimmer
    // and the night boost.
    const interiorFactor = boostFactor * interiorLightUserScale;
    if (interiorAmbientLight) {
        interiorAmbientLight.intensity = INTERIOR_LIGHT_BASE.rectArea * interiorFactor;
    }
    interiorCornerLights.forEach(light => {
        light.intensity = INTERIOR_LIGHT_BASE.corner * interiorFactor;
    });

    // The ceiling track lights are the dominant interior source. They were
    // previously static (and never night-boosted), so scale them by the dimmer
    // alone — local lights, so the room darkens without touching the street.
    ceilingLights.forEach(cl => {
        if (cl.light) cl.light.intensity = INTERIOR_LIGHT_BASE.ceiling * interiorLightUserScale;
    });
}

/** Set the visitor's interior dimmer (0 = off, 1 = normal). Applied immediately
 *  and preserved across the day/night cycle by updateInteriorAmbientLight. */
export function setInteriorLightScale(scale) {
    interiorLightUserScale = Math.max(0, scale);
    updateInteriorAmbientLight();
}

/** The current interior dimmer value (1 = normal). */
export function getInteriorLightScale() {
    return interiorLightUserScale;
}

/**
 * Set ceiling lights on or off
 * @param {boolean} on - Whether lights should be on
 * @param {number} intensity - Light intensity (0-1), used for transitions
 */
export function setCeilingLights(on, intensity = 1) {
    const targetIntensity = on ? intensity : 0;
    const emissiveColor = on ? 0xfff5e6 : 0x000000;
    const panelColor = on ? 0xfff8f0 : 0x111111;

    ceilingLights.forEach(light => {
        // Update point light intensity
        light.light.intensity = targetIntensity * 1.5;

        // Update panel glow
        light.panel.material.color.setHex(panelColor);

        // Update housing emissive
        light.housing.material.emissive.setHex(emissiveColor);
        light.housing.material.emissiveIntensity = targetIntensity * 0.3;
    });
}

/** The clickable light switch group, for the click raycast in main.js. */
export function getLightSwitchMesh() {
    return lightSwitchMesh;
}

/**
 * Create a small wall light switch on the inside of the front wall, on the far
 * side of the door from the window (closer to the side wall). Clickable — opens
 * the gallery lighting control in main.js.
 */
export function createLightSwitch() {
    const { positionX, positionZ, depth, doorOffsetX, doorWidth, wallThickness } = getWorldConfig().building;
    const frontZ = positionZ + depth / 2;

    const group = new THREE.Group();
    group.name = 'lightSwitch';
    group.userData.isLightSwitch = true;

    // Cover plate (ivory plastic).
    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.14, 0.015),
        new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7, metalness: 0.0 })
    );
    plate.castShadow = true;
    group.add(plate);

    // Rocker, proud of the plate toward the room with a slight "on" tilt.
    const rocker = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.07, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 })
    );
    rocker.position.set(0, 0.006, -0.013); // -Z is the room side (no group rotation)
    rocker.rotation.x = 0.18;
    group.add(rocker);

    // Invisible, enlarged hit area so this small switch is easy to tap on a phone.
    // opacity-0 (not visible:false) still intersects rays, and it inherits the
    // group's isLightSwitch flag so a hit anywhere on it opens the panel.
    const hitArea = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.44, 0.14),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitArea.position.set(0, 0, -0.05); // straddle the plate, extending toward the room
    group.add(hitArea);

    // Solid wall segment just left of the door (door left edge − a little), at a
    // standard switch height, tucked just inside the front wall facing the room.
    const switchX = positionX + doorOffsetX - doorWidth / 2 - 0.45;
    group.position.set(switchX, 1.15, frontZ - wallThickness / 2 - 0.02);
    getWorldGroup().add(group);

    lightSwitchMesh = group;
}

/**
 * Create an illuminated green EXIT sign mounted on the inside of the front wall,
 * just above the entrance door — the standard public-building safety sign.
 */
export function createExitSign() {
    const { positionX, positionZ, depth, doorOffsetX, doorHeight, wallThickness } = getWorldConfig().building;
    const frontZ = positionZ + depth / 2;

    const w = 0.85, h = 0.27, d = 0.05;
    const tex = createExitSignTexture();

    const sign = new THREE.Group();
    sign.name = 'exitSign';

    // Green housing/body.
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x0a7a37, emissive: 0x064d23, emissiveIntensity: 0.4, roughness: 0.6 })
    );
    sign.add(body);

    // Illuminated EXIT face on the local +Z side (the group is rotated so this
    // turns toward the room). emissiveMap makes the green field and white letters
    // glow like a backlit sign.
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.97, h * 0.86),
        new THREE.MeshStandardMaterial({
            map: tex,
            emissive: 0xffffff,
            emissiveMap: tex,
            emissiveIntensity: 0.9,
            roughness: 0.5
        })
    );
    face.position.z = d / 2 + 0.002;
    sign.add(face);

    // A pair of small mounting tabs to the wall behind.
    const tabMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5, metalness: 0.3 });
    [-w * 0.4, w * 0.4].forEach(tx => {
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.06), tabMat);
        tab.position.set(tx, 0, -d / 2 - 0.03);
        sign.add(tab);
    });

    // Mount it centered over the door, just inside the front wall, facing the room.
    sign.position.set(positionX + doorOffsetX, doorHeight + 0.33, frontZ - wallThickness / 2 - 0.06);
    sign.rotation.y = Math.PI; // turn the +Z face toward the room (-Z)
    getWorldGroup().add(sign);

    // A faint green glow so the sign reads as illuminated in the space.
    const glow = new THREE.PointLight(0x36e07a, 0.3, 3.5);
    glow.position.set(positionX + doorOffsetX, doorHeight + 0.33, frontZ - wallThickness / 2 - 0.4);
    glow.name = 'exitSignGlow';
    getWorldGroup().add(glow);
}

/**
 * Draw a standard green EXIT sign (white lettering on a green field) onto a
 * canvas, returned as a texture.
 */
export function createExitSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 144;             // matches the sign face's ~3.55 : 1 proportions
    const ctx = canvas.getContext('2d');

    // Green field.
    ctx.fillStyle = '#0a8a3f';
    ctx.fillRect(0, 0, 512, 144);

    // Subtle inner keyline.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 488, 120);

    // White EXIT lettering, evenly spaced.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'EXIT';
    const spacing = 104;
    const startX = 256 - spacing * (letters.length - 1) / 2;
    for (let i = 0; i < letters.length; i++) {
        ctx.fillText(letters[i], startX + i * spacing, 74);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}
