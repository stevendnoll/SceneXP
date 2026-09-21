// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The home office experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, STEVE_CONFIG),
 * initPortraitControls(... STEVE_CONFIG.camera ...),
 * initChecklist(STEVE_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * The first SceneXP micro-environment: the real home office in Steve's
 * house, the room where SceneXP itself gets built. One small dark green
 * room, a single window, a closet by the door, and (in the passes to come)
 * a sit-stand desk with Steve at it, working on this very site. Super meta,
 * and cozy on purpose.
 *
 * The room is built from the real office's measurements, in meters
 * (1 ft = 0.3048 m): about 10 ft wide, 13 ft deep, 8 ft ceiling. It runs
 * generous in both directions (store.js's PLAN_SCALE and VERT_SCALE)
 * because exact scale read as cramped and low through the first-person
 * camera and left no floor for the furniture; proportions stay true. It is
 * still comfortably the smallest environment on the site.
 *
 * It was walked through until 2026-09-18, with WASD and a pair of on-screen
 * joysticks. In a room this size that was mostly bumping into furniture, and
 * the scene's job had become showing one wall screen, so it now stands still
 * and lets the visitor look around instead (see `camera` below, and view.js
 * for where the eye stands and why).
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const STEVE_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'office',

    // The room envelope. The shared lighting rig and gallery read
    // width/depth/height from this block; the interior sits centered on the
    // origin. The window wall is the north wall (negative Z); the door is in
    // the south wall, tucked beside the closet. The detailed floor plan
    // (closet, door, and window positions) lives in store.js's LAYOUT.
    building: {
        width: 4.76,        // 10 plan ft, the window wall
        depth: 6.19,        // 13 plan ft, the long east wall
        height: 3.05,       // 8 vertical ft, the ceiling
        wallThickness: 0.15,
        positionX: 0,
        positionZ: 0
    },

    // Shared interior lighting rig intensities (lighting-1.0.0 reads this
    // block via the world config). Softer than the activity-room themes: a
    // small home office should feel warm and calm, not gymnasium bright.
    lighting: {
        base: { rectArea: 2.2, hemi: 0.7, corner: 1.0, ceiling: 2.4 },
        nightBoost: 1.2
    },

    // The one viewpoint. The eye stands in front of the closet doors and looks
    // north across the room at Steve's left side as he works, so his profile
    // is the first thing a visitor sees, whatever the screen. view.js has the
    // measurements that chose this spot over the middle of the room, and
    // tests/steve-view.test.mjs holds them against the real room.
    //
    // three.js FOV is vertical. Below an aspect of 1 the lens widens to
    // portrait.fov and the camera stays put (it has the closet at its back).
    //
    // The view controls are the shared pan part, running at every screen size
    // like the other rooms with pan and zoom: drag, the arrow buttons, or A and
    // D to turn, W and S to look up and down, pinch or scroll to zoom. The one
    // difference is `wrap`. Every other scene composes its subject IN FRONT of
    // the eye and stops the turn at maxAngle. This room SURROUNDS the eye, with
    // something worth finding on all four walls, so the turn goes all the way
    // round and never meets an invisible wall (maxAngle is then ignored, so it
    // is not set). speed is radians per second while a button or key is held:
    // a full turn in about ten seconds.
    camera: {
        position: { x: -0.8, y: 1.6, z: 1.05 },
        lookAt: { x: -1.09, y: 1.0, z: -0.88 },
        fov: 58,
        portrait: {
            fov: 70,
            pan: {
                speed: 0.6,
                maxTilt: 0.35,
                wrap: true
            },
            zoom: {
                speed: 18,
                maxIn: 24,
                maxOut: 10
            }
        }
    },

    // Sky and time. The full day/night cycle runs: Steve keeps side-project
    // hours, so the office is honestly lit at every one of them. The shared
    // interior rig's nightBoost keeps the room readable after dark.
    dayNight: { enabled: true, cycleDuration: 480 },

    // No comet, and drifting clouds on (visible through the window).
    comet: { enabled: false },
    scenery: { clouds: true },

    // A peaceful place at every hour.
    zombiesAtNight: false,

    // No floating greeter tag here: the room is small enough that Steve at
    // his desk needs no signpost.
    greeterSign: { enabled: false },

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it depicts the builder himself,
    // so the welcome screen's directory link goes to the serving site's root.
    site: {
        // The person this experience celebrates. Meta by design: the host of
        // SceneXP, at the desk where SceneXP gets built.
        honoree: {
            label: 'Steve'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: "Steve's Home Office",
            text: 'A tiny 3D visit to the home office where SceneXP gets built. Step inside and look around:'
        },

        // The builder funnel (the nudge and completion modals' "Get in
        // touch"). Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        },

        // THE ONE LINK IN THIS ROOM THAT LEAVES THE SITE. Every other
        // destination here is root-relative, because this experience honors
        // the builder and the builder's marketing pages are on the serving
        // domain. The portfolio is his own site, off this domain, so it is an
        // absolute URL and it opens in a tab of its own, the way the featured
        // business links in the tribute scenes do.
        portfolio: {
            url: 'https://devsteve.com/',
            label: 'devSteve.com'
        }
    },

    // (No autopilot tour in this experience: the room is small enough to
    // see from the doorway, and walking it takes seconds. main.js does not
    // import the shared autopilot part at all.)

    // Session-scoped "things to discover" list. Every item maps to a
    // clickable prop (the ids match PROP_CONTENT checklistIds in main.js,
    // plus the greeter and wall-display special paths), so each one is
    // genuinely findable. Order is roughly a visitor's natural path.
    checklist: {
        storageKey: 'steve-checklist',
        items: [
            { id: 'hello',  label: 'Say hi to Steve at his desk',        short: 'say hi to Steve' },
            { id: 'desk',   label: 'Check out the sit-stand desk',       short: 'visit the desk' },
            { id: 'cat',    label: 'Find the office manager (shh)',      short: 'find the office manager' },
            { id: 'dashboard', label: 'Notice the big screen behind Steve', short: 'notice the big screen' },
            { id: 'closet', label: 'Find the closet by the door',        short: 'find the closet' },
            { id: 'litter', label: "Spot the office manager's restroom", short: 'spot the litter box' }
        ]
    }
});
