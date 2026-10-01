// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Starfall's one plain settings object.
 *
 * Starfall is SceneXP's first scene drawn with three.js's WebGPU renderer and
 * TSL (three's shading language, written in JavaScript). Every star is placed
 * on the graphics card each frame, which is what lets the galaxy hold a few
 * hundred thousand of them and still turn smoothly under a finger.
 *
 * Units are scene units. The galaxy's disk is `galaxy.radius` across its
 * half-width and lies in the y = 0 plane, turning about +y.
 */
export const STARFALL_CONFIG = Object.freeze({
    proofOfWork: { prefix: '11', storageKey: 'starfall-pow' },

    site: {
        home: { path: '/' }
    },

    // How many stars, by what is drawing them. The count is chosen after the
    // renderer has started, because only then is it known whether WebGPU or
    // the WebGL 2 fallback is doing the work.
    stars: {
        webgpu: 320000,
        webgpuMobile: 120000,
        webgl: 120000,
        webglMobile: 60000,
        seed: 1977
    },

    galaxy: {
        radius: 40,
        coreRadius: 6,
        arms: 2,
        // The pitch of the logarithmic spiral, in radians: how tightly the
        // arms wind. About 13 degrees is a classic grand-design spiral.
        pitch: 0.23,
        // How far a star strays from its arm's center line, in radians,
        // growing a little toward the rim where arms fray.
        armSpread: 0.32,
        // Disk half-thickness at the center and at the rim.
        thicknessCore: 1.6,
        thicknessRim: 0.45,
        // Shares of the stars by population. They need not sum to one.
        bulgeShare: 0.18,
        armShare: 0.67,
        haloShare: 0.15,
        // A few arm stars are the pink of star-forming knots.
        knotChance: 0.035,
        // The pattern's turn, in radians per second. Slow on purpose: the
        // galaxy should read as turning, never as spinning.
        turnRate: 0.035
    },

    look: {
        background: 0x02030a,
        coreColor: 0xffd59a,
        armColor: 0x9fc4ff,
        knotColor: 0xff8fb8,
        // Every star's light is multiplied by this. Stars add up where they
        // crowd (additive blending), so this is the one number that decides
        // whether the core glows or burns out to a white disc. The first
        // thing to tune from a screenshot.
        gain: 0.55,
        sizeMin: 0.09,
        sizeMax: 0.32,
        // The soft glow behind the core, a single large sprite.
        glowSize: 26,
        glowOpacity: 0.32
    },

    camera: {
        fov: 50,
        distance: 82,
        // Margin around the disk when the frame is narrow (a phone upright).
        fitMargin: 1.12
    },

    // Turning the view (view.js). The camera rides a sphere around the core:
    // azimuth around the disk, elevation from edge-on (0) toward straight
    // above (+) or below (-), held short of the poles.
    view: {
        azimuth: 0.6,
        elevation: 0.95,
        elevationMin: -1.35,
        elevationMax: 1.35,
        dragSpeed: 0.006,      // radians per CSS pixel of drag
        keySpeed: 1.1,         // radians per second while an arrow key is held
        glide: 3.2,            // how fast a flick's spin dies away, per second
        maxSpin: 4,            // radians per second, the most a flick can carry
        // A slow drift around the galaxy, in radians per second. Off for
        // visitors who ask for reduced motion.
        drift: 0.012
    },

    // Visitors who ask for reduced motion get a galaxy that barely turns and
    // a camera that holds still until they turn it themselves.
    reducedMotion: {
        turnScale: 0.2
    },

    // The pixel ratio ceiling. Hundreds of thousands of additive sprites are
    // a fill-rate job, so phones stop lower.
    maxPixelRatio: { desktop: 2, mobile: 1.5 }
});
