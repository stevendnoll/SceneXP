// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The bug patrol experience configuration
 *
 * One plain object holding every per-experience knob this experience's
 * modules accept. main.js imports this and passes slices into the init
 * functions: initScene(canvas, GAVIN_CONFIG), initStore(), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The seventh SceneXP micro-environment, and the first passive one. Every
 * spring, Gavin (the builder's eleven-year-old son) buys ladybugs and
 * praying mantis eggs from the garden center and releases them into the
 * patio plants. He and his friends then spend weeks searching the leaves
 * for signs of their bugs. This experience is that search, from the bug's
 * side of the branch: the visitor holds one close-up view of the
 * Confederate Jasmine in its cedar planter while ladybugs, mantises, ants,
 * a spider, and bees go about their day, and Gavin and two friends peer
 * in through the far side of the plant.
 *
 * There is no walking and no looking around here on purpose. The camera
 * never moves; the garden does. So this config carries no spawn point, no
 * world bounds, and no checklist, and main.js imports no controls at all.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const GAVIN_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'garden',

    // The fixed viewpoint: kneeling at the near edge of the patio, eye to
    // eye with the middle of the jasmine. The camera is set here at init
    // (and re-derived on resize) and never moves during play; lookAt is
    // the point it faces (roughly the center of the foliage, so the kids'
    // faces sit just past it).
    //
    // The scene is composed for a landscape frame, and three.js FOV is
    // vertical, so a portrait phone would slice off both sides. When the
    // aspect ratio drops below 1, main.js widens the FOV to portrait.fov
    // and dollies the camera straight back until minHalfWidth meters to
    // either side of center still fit in frame at the kids' distance
    // (focusZ). Landscape frames always use the composed position as-is.
    camera: {
        position: { x: 0, y: 1.18, z: 0.62 },
        lookAt: { x: 0, y: 1.22, z: -1.55 },
        fov: 60,
        portrait: {
            fov: 66,
            minHalfWidth: 1.5,
            focusZ: -2.3,
            // Portrait view controls (shared pan-1.0.0.js): even after
            // the widen-and-dolly, a portrait frame crops the flanking
            // pots and a hiding spot or two. The pan arrows yaw up to
            // maxAngle radians each way, at speed radians per second,
            // deliberately slower than the walkable experiences' look
            // controls. The zoom pair is binocular-style FOV: up to
            // maxIn degrees below the portrait fov above (leaning in
            // for a closer mantis hunt) and maxOut degrees above it
            // (widening the whole patio), at speed degrees per second.
            // Touch swipes drive the same yaw and zoom, and can also
            // tilt the view up to maxTilt radians up or down (sky and
            // fence tops above, planter base below); the tilt has no
            // buttons: swipe it directly, or hold W/S or Shift+Up/Down
            // at the pan speed. Landscape frames never show the row,
            // and rotating back to landscape recenters everything.
            pan: {
                speed: 0.4,
                maxAngle: 0.5,
                maxTilt: 0.3
            },
            zoom: {
                speed: 18,
                maxIn: 24,
                maxOut: 8
            }
        }
    },

    // Sky and time. The full day/night cycle runs, same as the rest of the
    // site: fireflies-at-dusk energy suits a garden, and the shared sky
    // handles the lighting honestly at every hour.
    dayNight: { enabled: true, cycleDuration: 480 },

    // No comet, and drifting clouds on.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A peaceful garden at every hour.
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it honors the builder's son, so
    // the Home button goes to the serving site's root in the same tab.
    site: {
        // The person this experience celebrates.
        honoree: {
            label: 'Gavin'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: "Gavin's Bug Patrol",
            text: 'A tiny 3D visit to the jasmine plant where Gavin releases his ladybugs every spring. Look closely:'
        },

        // The builder funnel. Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    }

    // (No autopilot tour, no settings panel, no checklist: the visitor's
    // only job here is to watch, and the garden's only job is to be worth
    // watching.)
});
