// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The karaoke night experience configuration
 *
 * One plain object holding every per-experience knob this experience's
 * modules accept. main.js imports this and passes slices into the init
 * functions: initScene(canvas, JAMAR_CONFIG), initStore(), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The eighth SceneXP micro-environment, and the second passive one: a
 * birthday present for Jamar, the builder's best friend. It is karaoke
 * night at the corner bar. Jamar has the microphone and the corner stage,
 * the lyrics screen is rolling, the speakers are thumping, and Steve and
 * Mike have the booth beside the stage with a round of drinks. The
 * visitor holds one seat-at-the-bar view while the whole room leans into
 * the song.
 *
 * There is no walking and no free-look here on purpose. The camera
 * holds its seat; the bar does the moving. So this config carries no
 * spawn point, no world bounds, and no checklist, and main.js imports
 * none of the walking controls. The one concession is portrait phones:
 * the frame is composed for landscape, so camera.portrait.pan and .zoom
 * give portrait visitors a slow bottom-center row (shared pan-1.0.0.js)
 * to look at the sides the crop hides and lean in toward the stage.
 *
 * The bar is windowless, the way the best karaoke bars are, so it is
 * karaoke night in here at every hour: the shared day/night cycle is
 * switched off and the room carries its own lighting (see store.js).
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const JAMAR_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'bar',

    // The fixed viewpoint: a stool's-eye seat in the middle of the room,
    // aimed squarely at Jamar on the corner stage so he owns the center
    // of the frame, with the booth and neon filling the right side. The
    // bar along the right wall sits just off-camera (heard in the
    // ambience more than seen). The camera is set here at init (and
    // re-derived on resize) and never moves during play; lookAt is the
    // point it faces.
    //
    // The scene is composed for a landscape frame, and three.js FOV is
    // vertical, so a portrait phone would slice off both sides. When the
    // aspect ratio drops below 1, main.js widens the FOV to portrait.fov
    // and dollies the camera straight back until minHalfWidth meters to
    // either side of center still fit in frame at the stage's distance
    // (focusZ), capped at maxZ so the dolly can never back through the
    // wall behind the camera. Landscape frames use the composed position.
    camera: {
        position: { x: 0.35, y: 1.5, z: 2.4 },
        lookAt: { x: -2.65, y: 1.25, z: -3.0 },
        fov: 60,
        portrait: {
            fov: 72,
            minHalfWidth: 2.2,
            focusZ: -3.0,
            maxZ: 3.6,
            // View controls (shared pan-1.0.0.js): the room is wider
            // than any frame, so every aspect crops the booth on one
            // side and the bar on the other. This scene runs the row at
            // ALL screen sizes (main.js passes alwaysOn, unlike gavin's
            // portrait-only default). The pan arrows yaw up to maxAngle
            // radians each way, at speed radians per second,
            // deliberately slower than the walkable experiences' look
            // controls. The zoom pair is binocular-style FOV: up to
            // maxIn degrees below the current orientation's composed fov
            // (leaning in toward Jamar on the stage) and maxOut degrees
            // above it (widening the whole room), at speed degrees per
            // second. Touch swipes drive the same yaw and zoom, and can
            // also tilt the view up to maxTilt radians up or down (the
            // pendants, disco ball, and banner live up high; the stage
            // lip and floor down low); the tilt has no buttons: swipe
            // it directly, or hold W/S or Shift+Up/Down at the pan
            // speed. Rotating between orientations recenters everything.
            pan: {
                speed: 0.4,
                maxAngle: 0.6,
                maxTilt: 0.35
            },
            zoom: {
                speed: 18,
                maxIn: 26,
                maxOut: 8
            }
        }
    },

    // The bar has no windows, so the sky is never seen and the day/night
    // cycle is off: it is always karaoke night in here. The room's own
    // lighting (stage wash, pendants, neon) is built in store.js.
    dayNight: { enabled: false },

    // No comet and no clouds: there is no sky to hang them in.
    comet: { enabled: false },
    scenery: { clouds: false },

    // A friendly bar at every hour.
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it honors the builder's best
    // friend, so the Home button goes to the serving site's root.
    site: {
        // The person this experience celebrates.
        honoree: {
            label: 'Jamar'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: "Jamar's Karaoke Night",
            text: 'A tiny 3D visit to karaoke night at the corner bar, where Jamar has the mic and the whole room knows the words:'
        },

        // The builder funnel. Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    }

    // (No autopilot tour, no settings panel, no checklist: the visitor's
    // only job here is to enjoy the show, and the bar's only job is to be
    // worth staying for.)
});
