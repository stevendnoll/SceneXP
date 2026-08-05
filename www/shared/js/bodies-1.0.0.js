// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * bodies.js - Large-scale celestial bodies for space scenes (shared engine part).
 *
 * Textured spheres at planetary scale, with optional atmospheres, axial
 * rotation, and circular parented orbits. Nothing here knows which planet is
 * which: a body is a plain spec, and the experience supplies the list.
 *
 * PURE CORE / THIN SHELL. Everything with maths worth getting wrong is a pure
 * function over plain numbers (orbitPositionAt, tidalYawAt), exported so the
 * suite can assert it directly and so a caller can ask "where will the moon be
 * in ten seconds" without touching the scene graph. The THREE half only moves
 * meshes to whatever the pure half returned.
 *
 * ORBITS are circular, not elliptical. Nobody here is doing orbital mechanics,
 * and an ellipse would make an interception lead inconsistent for no visible
 * gain. The parametrisation is one angle, one radius, one inclination:
 *
 *     x = r·cos(a)
 *     y = r·sin(a)·sin(i)
 *     z = r·sin(a)·cos(i)      a = phase + 2π·elapsed / period
 *
 * which keeps |position| exactly r for every a and i, so an orbit can never
 * drift. Inclination is signed: a negative value tilts the orbit the other
 * way, which is how a caller reaches the half of the sky a positive one
 * cannot.
 *
 * TIDAL LOCK keeps one face toward the parent. The yaw that does this is
 * atan2(x, z) of the orbital position, which leaves the parent at a constant
 * local -Z. Derived rather than guessed, and locked by a test that walks the
 * orbit and asserts the parent's local bearing never moves, because the
 * failure mode is subtle: a sign error shows the far side over several
 * minutes, which nobody notices until the structures on the near face have
 * quietly rotated out of sight.
 */

const TAU = Math.PI * 2;

const bodies = new Map();     // id -> { spec, mesh, atmosphere, orbit }
let group = null;
let loader = null;
let elapsed = 0;

// ---- Pure core -------------------------------------------------------------

/** Position on a circular inclined orbit, relative to the parent's centre.
 *  Returns a plain object so this is usable without THREE. */
export function orbitPositionAt(elapsedSeconds, spec) {
    const r = spec.radius || 0;
    const period = spec.period || 1;
    const i = spec.inclination || 0;
    const a = (spec.phase || 0) + (TAU * elapsedSeconds) / period;
    const sinA = Math.sin(a);
    return {
        x: r * Math.cos(a),
        y: r * sinA * Math.sin(i),
        z: r * sinA * Math.cos(i)
    };
}

/** The Y rotation that keeps one face toward the parent for the whole orbit.
 *  The parent ends up at a constant local -Z; tidalOffset spins which
 *  longitude of the texture that is. */
export function tidalYawAt(elapsedSeconds, spec) {
    const p = orbitPositionAt(elapsedSeconds, spec);
    return Math.atan2(p.x, p.z) + (spec.tidalOffset || 0);
}

/** Axial spin angle for a body with the given rotation period, in radians.
 *  A period of 0 or undefined means the body does not rotate. */
export function spinAt(elapsedSeconds, rotationPeriod) {
    if (!rotationPeriod) return 0;
    return (TAU * elapsedSeconds) / rotationPeriod;
}

// ---- Shell -----------------------------------------------------------------

/** Prepare the registry. `manager` is an optional THREE.LoadingManager, so the
 *  experience's loading screen can report texture progress. */
export function initBodies(options = {}) {
    disposeBodies();
    group = new THREE.Group();
    group.name = options.groupName || 'bodies';
    loader = new THREE.TextureLoader(options.manager);
    elapsed = 0;
    return group;
}

/** Build one body from its spec and add it to the group.
 *
 *  spec: { id, radius, texture, segments, rotationPeriod, position,
 *          atmosphere: { scale, color, intensity, power } }
 */
export function createBody(spec) {
    if (!group) initBodies();

    const segments = spec.segments || 64;
    const geometry = new THREE.SphereGeometry(spec.radius, segments, Math.max(8, segments >> 1));
    const material = new THREE.MeshStandardMaterial({
        roughness: 1.0,
        metalness: 0.0,
        color: spec.tint === undefined ? 0xffffff : spec.tint
    });

    if (spec.texture && loader) {
        const map = loader.load(spec.texture);
        // Colour maps must be tagged sRGB or the planet renders washed out.
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        material.map = map;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.id;
    if (spec.position) mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);

    let atmosphere = null;
    if (spec.atmosphere) {
        atmosphere = createAtmosphere(spec.radius, spec.atmosphere);
        mesh.add(atmosphere);
    }

    group.add(mesh);
    bodies.set(spec.id, { spec, mesh, atmosphere, orbit: null });
    return mesh;
}

/** A Fresnel rim shell: transparent face-on, bright at the limb, which is what
 *  reads as an atmosphere. A flat translucent sphere cannot do this, because
 *  a constant opacity has no idea where the edge is. */
function createAtmosphere(radius, cfg) {
    const scale = cfg.scale || 1.025;
    const geometry = new THREE.SphereGeometry(radius * scale, 64, 32);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(cfg.color === undefined ? 0x6aa9ff : cfg.color) },
            uIntensity: { value: cfg.intensity === undefined ? 1.0 : cfg.intensity },
            uPower: { value: cfg.power === undefined ? 2.5 : cfg.power }
        },
        vertexShader: `
            varying vec3 vNormalW;
            varying vec3 vPosW;
            void main() {
                vNormalW = normalize(mat3(modelMatrix) * normal);
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vPosW = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uIntensity;
            uniform float uPower;
            varying vec3 vNormalW;
            varying vec3 vPosW;
            void main() {
                vec3 viewDir = normalize(cameraPosition - vPosW);
                float rim = 1.0 - max(dot(viewDir, normalize(vNormalW)), 0.0);
                gl_FragColor = vec4(uColor, pow(rim, uPower) * uIntensity);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.name = 'atmosphere';
    return shell;
}

/** Put `childId` on a circular orbit around `parentId`. The child's position
 *  is recomputed every update from the pure core, so nothing accumulates. */
export function orbitBody(childId, parentId, orbitSpec) {
    const child = bodies.get(childId);
    if (!child) return null;
    child.orbit = { ...orbitSpec, parentId };
    applyOrbit(child);
    return child.mesh;
}

function applyOrbit(entry) {
    const o = entry.orbit;
    if (!o) return;
    const parent = bodies.get(o.parentId);
    const p = orbitPositionAt(elapsed, o);
    const base = parent ? parent.mesh.position : { x: 0, y: 0, z: 0 };
    entry.mesh.position.set(base.x + p.x, base.y + p.y, base.z + p.z);
    if (o.tidalLock) entry.mesh.rotation.y = tidalYawAt(elapsed, o);
}

/** Advance every body: axial spin for the unlocked, orbit and lock for the
 *  rest. Tidally locked bodies do not also spin, which is what "locked" means. */
export function updateBodies(deltaTime) {
    elapsed += deltaTime;
    for (const entry of bodies.values()) {
        if (entry.orbit) {
            applyOrbit(entry);
            if (entry.orbit.tidalLock) continue;
        }
        if (entry.spec.rotationPeriod) {
            entry.mesh.rotation.y = spinAt(elapsed, entry.spec.rotationPeriod);
        }
    }
}

export function getBody(id) {
    const entry = bodies.get(id);
    return entry ? entry.mesh : null;
}

export function getBodySpec(id) {
    const entry = bodies.get(id);
    return entry ? entry.spec : null;
}

export function getBodiesGroup() { return group; }

export function getElapsed() { return elapsed; }

/** Every body's current world-space centre, as plain numbers. This is what the
 *  HUD's nav markers and any AI steering should read, because it is live: a
 *  cached moon position is what makes an interception feel broken. */
export function bodyPositions() {
    const out = {};
    for (const [id, entry] of bodies.entries()) {
        const p = entry.mesh.position;
        out[id] = { x: p.x, y: p.y, z: p.z };
    }
    return out;
}

/** Occluder list for the targeting module: a centre and a radius per body. */
export function getOccluders() {
    const out = [];
    for (const entry of bodies.values()) {
        const p = entry.mesh.position;
        out.push({ id: entry.spec.id, centre: { x: p.x, y: p.y, z: p.z }, radius: entry.spec.radius });
    }
    return out;
}

/** Release geometry, materials, and textures. Safe to call more than once. */
export function disposeBodies() {
    for (const entry of bodies.values()) {
        disposeMesh(entry.mesh);
        if (entry.atmosphere) disposeMesh(entry.atmosphere);
    }
    bodies.clear();
    group = null;
    loader = null;
    elapsed = 0;
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
    }
}
