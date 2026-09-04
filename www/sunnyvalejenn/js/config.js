// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Sunnyvale Jenn Consulting experience configuration
 *
 * One plain object holding every per-experience knob this experience's
 * modules accept. main.js imports this and passes slices into the init
 * functions: initScene(canvas, SVJ_CONFIG), initStore(), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The tenth SceneXP micro-environment, and the third passive one: a
 * tribute to Jenn of Sunnyvale Jenn Consulting, a talented entrepreneur
 * and a former colleague of the builder, whose calling is helping small
 * businesses untangle and improve their operations. It is a bright
 * weekday morning in her home office. Jenn is at her desk, deep in a
 * client's operations, facing the doorway where the visitor stands.
 * Sunlight pours through the window behind her, and birds come and go on
 * the cedar fence outside. (The yoga mat and exercise ball in the corner
 * are only small visual nods to her pre-consulting past. The scene's
 * focus, like every dialog and tag, stays on the consulting practice.)
 *
 * There is no walking and no free-look here on purpose, the same passive
 * contract as the jamar and gavin experiences: the camera holds the
 * doorway, and the room does the living. So this config carries no spawn
 * point, no world bounds, and no checklist, and main.js imports none of
 * the walking controls. The shared pan/zoom row (pan-1.0.0.js) runs at
 * every aspect so visitors can look around the office, tilt up and down,
 * and lean in, with swipe and pinch driving the same moves on touch.
 *
 * Unlike the windowless karaoke bar, this room has a window and the sky
 * matters: the day/night cycle is DISABLED so the shared sky holds at
 * noon, and it is a bright, sunny morning in here at every hour. Clouds
 * stay on and drift past the window.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const SVJ_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'office',

    // The room rectangle, for the shared interior lighting rig
    // (lighting-1.0.0.js reads building.{width, depth, height, positionX,
    // positionZ} to place its fixture grid and ambient fills). Mirrors
    // LAYOUT.room in store.js.
    building: {
        width: 6.4,
        depth: 6.4,
        height: 2.95,
        positionX: 0,
        positionZ: -0.2
    },

    // The fixed viewpoint: standing just inside the doorway, aimed at Jenn
    // at her desk so she owns the center of the frame, with the sunny
    // window and the fence birds filling the right side. The camera is set
    // here at init (and re-derived on resize) and never moves during play;
    // lookAt is the point it faces.
    //
    // The scene is composed for a landscape frame, and three.js FOV is
    // vertical, so a portrait phone would slice off both sides. When the
    // aspect ratio drops below 1, main.js widens the FOV to portrait.fov
    // and dollies the camera straight back until minHalfWidth meters to
    // either side of center still fit in frame at the desk's distance
    // (focusZ), capped at maxZ so the dolly can never back through the
    // wall behind the camera. Landscape frames use the composed position.
    camera: {
        position: { x: 0.4, y: 1.42, z: 2.3 },
        lookAt: { x: -0.55, y: 1.0, z: -2.4 },
        fov: 58,
        portrait: {
            fov: 70,
            minHalfWidth: 2.1,
            focusZ: -2.4,
            maxZ: 2.9,
            // View controls (shared pan-1.0.0.js): the office is wider
            // than any frame, so every aspect crops the whiteboard on one
            // side and the sideboard on the other. This scene runs the
            // row at ALL screen sizes (main.js passes alwaysOn, like
            // jamar). The pan arrows yaw up to maxAngle radians each way,
            // at speed radians per second. The zoom pair is
            // binocular-style FOV: up to maxIn degrees below the current
            // orientation's composed fov (leaning in toward Jenn and her
            // desk) and maxOut degrees above it (widening the whole
            // room), at speed degrees per second. Touch swipes drive the
            // same yaw and zoom, and can also tilt the view up to maxTilt
            // radians up or down (the ceiling fixture up high; the rug
            // and the exercise ball down low). The tilt has no buttons:
            // swipe it directly, or hold W/S or Shift+Up/Down at the pan
            // speed. Rotating between orientations recenters everything.
            pan: {
                speed: 0.4,
                maxAngle: 0.6,
                maxTilt: 0.32
            },
            zoom: {
                speed: 18,
                maxIn: 24,
                maxOut: 8
            }
        }
    },

    // The window makes the sky part of the room, so unlike the windowless
    // bar the sky must look good at all times: the cycle is disabled and
    // the shared rig holds at noon. It is a bright, sunny morning in
    // Jenn's office at every hour.
    dayNight: { enabled: false },

    // No comet (a quiet suburban sky), but the drifting clouds stay: the
    // window frames them, and they keep the view alive between birds.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A friendly office at every hour.
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience DOES feature a business: Sunnyvale Jenn Consulting. Its
    // outbound links are the one set of absolute external URLs, and they
    // live here.
    site: {
        // The person this experience celebrates, and her business.
        honoree: {
            label: 'Jenn',
            business: 'Sunnyvale Jenn Consulting'
        },

        // The featured business's own site (the floating logo button and
        // the outbound links in the cards and the no-JS fallback).
        business: {
            name: 'Sunnyvale Jenn Consulting',
            tagline: 'Small business operations consulting',
            websiteUrl: 'https://sunnyvalejenn.com/'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: "Sunnyvale Jenn Consulting",
            text: "A tiny 3D visit to the sunny home office of Sunnyvale Jenn Consulting, where Jenn is at her desk, the birds are on the fence, and the door is always open:"
        },

        // The builder funnel. Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    }

    // (No autopilot tour, no settings panel, no checklist: the visitor's
    // only job here is to enjoy the visit, and the office's only job is to
    // be worth the stay.)
});
