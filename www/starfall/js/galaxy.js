// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * galaxy.js - The galaxy: where every star belongs, and how it is drawn.
 *
 * WHERE A STAR BELONGS is worked out once, in JavaScript, by layoutStars():
 * its orbit's radius and starting angle, its height above the disk, how warm
 * or cool it burns, its size and brightness. Three populations make the
 * shape: a warm bulge at the core, two logarithmic spiral arms, and a thin
 * scatter of halo stars between and beyond them. The layout is seeded, so
 * every visitor sees the same galaxy and the suite can measure it.
 *
 * WHERE A STAR IS, each frame, is worked out on the graphics card as it is
 * drawn. The stars are one instanced Sprite, and its TSL position node turns
 * each star's orbit by the pattern's current angle (one uniform), so a few
 * hundred thousand stars move with nothing sent from the CPU but that angle.
 * The pattern turns rigidly, which is the small cheat that keeps the arms
 * from winding up over the minutes a visitor watches (the "winding problem"
 * real galaxies solve with density waves). A soft round falloff and additive
 * blending make crowded regions glow.
 *
 * Until 2026-10-01 a compute shader moved the stars instead, so a press could
 * stir them like a gravity well. Steve's first look said the stirring did
 * not feel right, and turning the view replaced it (see view.js). With
 * nothing pulling stars off their orbits, a star's place is a pure function
 * of the pattern's angle, and the vertex stage is the cheaper home for it.
 *
 * THREE is the global set by ../lib/three/r186/three.webgpu.min.js, and the
 * shading functions come from THREE.TSL. Nothing here touches the DOM.
 */

const TAU = Math.PI * 2;

/** Mulberry32: a tiny seeded PRNG, so the layout is reproducible. */
export function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A standard normal sample (Box-Muller). */
function gaussian(rng) {
    const u = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
}

/** How many stars each population gets, summing exactly to `count`. */
export function populationCounts(count, galaxy) {
    const total = galaxy.bulgeShare + galaxy.armShare + galaxy.haloShare;
    const bulge = Math.round(count * galaxy.bulgeShare / total);
    const halo = Math.round(count * galaxy.haloShare / total);
    return { bulge, arm: count - bulge - halo, halo };
}

/** The angle of an arm's center line at radius r: a logarithmic spiral. */
export function armAngle(arm, r, galaxy) {
    const r0 = galaxy.coreRadius * 0.5;
    return arm * TAU / galaxy.arms + Math.log(Math.max(r, r0) / r0) / Math.tan(galaxy.pitch);
}

/**
 * Lay out `count` stars. Returns two typed arrays, one row per star:
 *   orbit  (vec4): radius, starting angle, height, warmth (0 warm, 1 cool)
 *   look   (vec4): size, brightness, knot (1 for a pink star-forming knot), 0
 */
export function layoutStars(count, galaxy, look, rng) {
    const orbit = new Float32Array(count * 4);
    const looks = new Float32Array(count * 4);
    const R = galaxy.radius;
    const core = galaxy.coreRadius;
    const pops = populationCounts(count, galaxy);
    const thickness = (r) => galaxy.thicknessCore +
        (galaxy.thicknessRim - galaxy.thicknessCore) * Math.min(1, r / R);
    const size = (bias) => look.sizeMin + (look.sizeMax - look.sizeMin) * Math.pow(rng(), bias);

    // Disk stars thin out with radius, exponentially, between rMin and R.
    const rMin = core * 0.45;
    const scale = R * 0.33;
    const spanFactor = 1 - Math.exp(-(R - rMin) / scale);

    for (let i = 0; i < count; i++) {
        let r;
        let angle;
        let height;
        let warmth;
        let s;
        let bright;
        let knot = 0;

        if (i < pops.bulge) {
            r = Math.min(Math.abs(gaussian(rng)) * core * 0.55, core * 1.6);
            angle = rng() * TAU;
            height = gaussian(rng) * core * 0.32 * (1 - 0.5 * r / (core * 1.6));
            warmth = rng() * 0.15;
            s = size(2.2);
            bright = 0.7 + rng() * 0.5;
        } else if (i < pops.bulge + pops.arm) {
            r = rMin - scale * Math.log(1 - rng() * spanFactor);
            const arm = Math.floor(rng() * galaxy.arms);
            const fray = 0.6 + 0.8 * (r / R);
            angle = armAngle(arm, r, galaxy) + gaussian(rng) * galaxy.armSpread * fray;
            height = gaussian(rng) * thickness(r) * 0.5;
            warmth = Math.min(1, Math.max(0, 0.25 + 0.75 * (r / R) + gaussian(rng) * 0.08));
            s = size(3);
            bright = 0.5 + rng() * 0.6;
            if (r > core && rng() < galaxy.knotChance) {
                knot = 1;
                s = look.sizeMax * (0.9 + rng() * 0.4);
                bright += 0.4;
            }
        } else {
            r = Math.sqrt(rng()) * R * 1.05;
            angle = rng() * TAU;
            height = gaussian(rng) * thickness(r) * 1.3;
            warmth = 0.4 + rng() * 0.4;
            s = size(4);
            bright = 0.3 + rng() * 0.35;
        }

        orbit[i * 4] = r;
        orbit[i * 4 + 1] = angle;
        orbit[i * 4 + 2] = height;
        orbit[i * 4 + 3] = warmth;
        looks[i * 4] = s;
        looks[i * 4 + 1] = bright;
        looks[i * 4 + 2] = knot;
    }
    return { orbit, look: looks };
}

/**
 * Build the galaxy's sprites. Returns { object, count, uniforms, update(dt),
 * dispose() }; update advances the pattern's turn.
 */
export function createGalaxy({ count, config, reducedMotion = false }) {
    const {
        instancedBufferAttribute, uniform, float, vec3, vec4,
        uv, length, smoothstep, mix, sin, cos, color
    } = THREE.TSL;
    const G = config.galaxy;
    const L = config.look;

    const layout = layoutStars(count, G, L, makeRng(config.stars.seed));
    const orbit = instancedBufferAttribute(new THREE.InstancedBufferAttribute(layout.orbit, 4));
    const look = instancedBufferAttribute(new THREE.InstancedBufferAttribute(layout.look, 4));

    const uniforms = { turn: uniform(0) };

    const material = new THREE.SpriteNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    // The star's place on the turning pattern. It turns toward decreasing
    // angle so the arms trail, as real arms do.
    const a = orbit.y.sub(uniforms.turn);
    material.positionNode = vec3(orbit.x.mul(cos(a)), orbit.z, orbit.x.mul(sin(a)));
    material.scaleNode = look.x;
    let tint = mix(color(L.coreColor), color(L.armColor), orbit.w);
    tint = mix(tint, color(L.knotColor), look.z);
    material.colorNode = vec4(tint.mul(look.y).mul(L.gain), 1);
    // A soft round star: bright at the center, gone at the sprite's edge.
    const edge = smoothstep(float(1), float(0), length(uv().sub(0.5)).mul(2));
    material.opacityNode = edge.mul(edge);

    const stars = new THREE.Sprite(material);
    stars.count = count;
    stars.frustumCulled = false;
    stars.name = 'stars';

    // The core's glow: one large soft sprite behind the bulge.
    const glowMaterial = new THREE.SpriteNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const glowEdge = smoothstep(float(1), float(0), length(uv().sub(0.5)).mul(2));
    glowMaterial.colorNode = vec4(color(L.coreColor), 1);
    glowMaterial.opacityNode = glowEdge.mul(glowEdge).mul(glowEdge).mul(L.glowOpacity);
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(L.glowSize, L.glowSize, 1);
    glow.name = 'core-glow';

    const object = new THREE.Group();
    object.name = 'galaxy';
    object.add(glow);
    object.add(stars);

    const turnRate = G.turnRate * (reducedMotion ? config.reducedMotion.turnScale : 1);

    /** Advance the pattern's turn. A long frame (a tab back from the
     *  background) is clamped, so the galaxy never jumps. */
    function update(dt) {
        const h = Math.min(Math.max(dt, 0), 0.1);
        uniforms.turn.value = (uniforms.turn.value + turnRate * h) % TAU;
    }

    function dispose() {
        material.dispose();
        glowMaterial.dispose();
    }

    return { object, count, uniforms, update, dispose };
}
