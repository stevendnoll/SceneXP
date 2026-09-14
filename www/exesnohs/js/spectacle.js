// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * spectacle.js - Draws the milestone shows, and the stadium they wake up.
 *
 * milestones.js says what a show looks like at time `t` and fireworks.js says
 * where every spark is. This file owns the meshes and does nothing but apply
 * those answers, in the same split view.js keeps with the simulation.
 *
 * BUILT ON FIRST USE, NOT AT LOAD. Most visitors never reach 200, and a phone
 * loading the page should not pay for a spark buffer and four light cones that
 * may never be drawn. Everything here is created the first time a show needs it
 * and then kept for the rest of the visit.
 *
 * THE STADIUM STAYS AWAKE. Once a show has played, what it switched on stays
 * switched on for the rest of the game (`setAwake`): after 100 the lamp banks
 * glow brighter and carry a halo. The rest of what a level leaves behind is on
 * the scoreboard, which is the one part of the stadium the play camera always
 * has in frame (see `field.updateScoreboard`).
 */
import { EXESNOHS_CONFIG as CFG, FIELD } from './config.min.js';
import { getPylonBanks, pylonSpots, BANK_GLOW } from './field.min.js';
import { planFireworks, sparksAt } from './fireworks.min.js';
import { fireworksSetup } from './milestones.min.js';

const M = CFG.milestones;

let scene = null;
let lights = null;
let base = null;
let cones = null;
let halos = null;
let sparks = null;
let glow = null;
let plan = null;
let calmShow = false;
let awake = 0;

/**
 * Hand over the scene and the lights the shows dim and raise. `lights` is
 * `{ ambient, key, fill }`, and their intensities as they are now are what "normal"
 * means for the rest of the visit.
 */
export function initSpectacle(target, handles = {}) {
    scene = target;
    lights = handles;
    base = {};
    for (const [name, light] of Object.entries(lights)) {
        if (light) base[name] = Number(light.intensity) || 0;
    }
    base.fog = scene && scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null;
    awake = 0;
}

function setFog(scale = 1) {
    if (!scene || !scene.fog || !base || !base.fog) return;
    scene.fog.near = base.fog.near * scale;
    scene.fog.far = base.fog.far * scale;
}

/** A soft round glow, drawn once and shared by the sparks and the halos. */
function glowTexture() {
    if (glow) return glow;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.createRadialGradient) return null;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glow = new THREE.CanvasTexture(canvas);
    glow.colorSpace = THREE.SRGBColorSpace;
    return glow;
}

/**
 * THE LIGHT CONES, one from each bank down to the middle of the field.
 *
 * Only ever drawn DURING the lights show. A beam across the top of the frame for
 * the rest of the game would sit over the play, and real floodlights only show
 * a beam in haze anyway. They are brightest at the lamp and fade to nothing at
 * the grass, which additive blending does with vertex colours alone: black adds
 * nothing, so there is no transparency sorting to get wrong.
 */
function buildCones() {
    if (cones || !scene) return cones;
    const len = FIELD.lineInterval * FIELD.segments;
    const aim = new THREE.Vector3(len / 2, 0, 0);
    cones = pylonSpots().map((spot) => {
        const reach = Math.hypot(aim.x - spot.x, spot.y, spot.z);
        const geometry = new THREE.CylinderGeometry(0.6, 11, reach, 20, 6, true);
        // Axis along +z, narrow end at the origin, so `lookAt` aims it.
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0, reach / 2);
        const position = geometry.attributes && geometry.attributes.position;
        if (position && position.count) {
            const colours = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i += 1) {
                const along = 1 - Math.min(1, Math.max(0, position.getZ(i) / reach));
                const v = along * along;
                colours[i * 3] = v;
                colours[i * 3 + 1] = v * 0.95;
                colours[i * 3 + 2] = v * 0.82;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        }
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(spot.x, spot.y, spot.z);
        mesh.lookAt(aim);
        mesh.visible = false;
        mesh.name = 'milestone-cone';
        scene.add(mesh);
        return mesh;
    });
    return cones;
}

/** A glow around each bank, which is how a lamp reads as ON from far away. */
function buildHalos() {
    if (halos || !scene) return halos;
    halos = pylonSpots().map((spot) => {
        const material = new THREE.SpriteMaterial({
            map: glowTexture(),
            color: 0xfff0c8,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(spot.x, spot.y, spot.z);
        sprite.scale.set(16, 16, 1);
        sprite.visible = false;
        sprite.name = 'milestone-halo';
        scene.add(sprite);
        return sprite;
    });
    return halos;
}

/** One buffer for every spark of every show, sized once. */
function buildSparks() {
    if (sparks || !scene) return sparks;
    const F = M.fireworks;
    const positions = new Float32Array(F.pool * 3);
    const colours = new Float32Array(F.pool * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({
        size: F.size,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
        toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    // The buffer is rewritten every frame and spans half the sky, so its
    // bounding sphere would be stale the moment it was computed.
    points.frustumCulled = false;
    points.visible = false;
    points.name = 'milestone-sparks';
    scene.add(points);
    sparks = { points, geometry, positions, colours };
    return sparks;
}

/**
 * GET READY FOR A SHOW. `seed` rolls the fireworks, so every game's are its own;
 * `calm` is somebody who asked not to be moved about.
 */
export function beginShow(level, { seed = 1, calm = false } = {}) {
    calmShow = !!calm;
    plan = null;
    if (level === 100) {
        buildCones();
        buildHalos();
    }
    if (level === 200) {
        buildSparks();
        plan = planFireworks({ ...fireworksSetup(level), seed });
    }
}

/** Apply one frame of `milestones.showFrame`, `t` seconds in. */
export function applyShow(frame, t) {
    if (!frame) return;
    setLights(frame.light);
    setFog(frame.fog);

    const banks = getPylonBanks();
    if (frame.banks) {
        frame.banks.forEach((v, i) => {
            if (banks[i] && banks[i].material) banks[i].material.emissiveIntensity = BANK_GLOW * v;
            if (halos && halos[i]) {
                halos[i].visible = v > 0.01;
                halos[i].material.opacity = Math.min(1, v * 0.32);
            }
        });
    }
    if (cones) {
        cones.forEach((cone, i) => {
            const v = frame.cones ? frame.cones[i] || 0 : 0;
            cone.visible = v > 0.001;
            cone.material.opacity = v;
        });
    }
    if (sparks) {
        sparks.points.visible = !!(frame.sparks && plan);
        if (sparks.points.visible) {
            sparksAt(t, plan, sparks.positions, sparks.colours, { calm: calmShow });
            sparks.geometry.setDrawRange(0, Math.min(plan.count, M.fireworks.pool));
            sparks.geometry.attributes.position.needsUpdate = true;
            sparks.geometry.attributes.color.needsUpdate = true;
        }
    }
}

function setLights(fraction = 1) {
    if (!lights || !base) return;
    for (const [name, light] of Object.entries(lights)) {
        if (light && base[name] !== undefined) light.intensity = base[name] * fraction;
    }
}

/**
 * THE STADIUM AS IT STANDS BETWEEN SHOWS, woken up to `level`.
 *
 * Called when a show ends or is skipped, and when a game starts or is resumed,
 * so it is the only place the resting state is decided. Zero is the stadium as
 * it was before any of this existed, exactly.
 */
export function setAwake(level = 0) {
    awake = level;
    const on = level >= 100;
    if (on) buildHalos();
    getPylonBanks().forEach((bank, i) => {
        if (bank && bank.material) {
            bank.material.emissiveIntensity = BANK_GLOW * (on ? M.lights.awakeBanks : 1);
        }
        if (halos && halos[i]) {
            halos[i].visible = on;
            halos[i].material.opacity = on ? M.lights.awakeBanks * 0.32 : 0;
        }
    });
}

export function awakeLevel() {
    return awake;
}

/** The show is over, however it ended. Everything it borrowed goes back. */
export function endShow() {
    setLights(1);
    setFog(1);
    if (cones) cones.forEach((c) => { c.visible = false; c.material.opacity = 0; });
    if (sparks) sparks.points.visible = false;
    plan = null;
    setAwake(awake);
}

export function disposeSpectacle() {
    const drop = (obj) => {
        if (!obj) return;
        if (scene) scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    };
    (cones || []).forEach(drop);
    (halos || []).forEach(drop);
    if (sparks) drop(sparks.points);
    if (glow) glow.dispose();
    cones = null;
    halos = null;
    sparks = null;
    glow = null;
    plan = null;
    scene = null;
}
