// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The home office experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, STEVE_CONFIG),
 * initControls(STEVE_CONFIG), initChecklist(STEVE_CONFIG.checklist), ...
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

    // Player start: a step past the entry walkway, out of the doorway and
    // toward the whiteboard end of the east wall, facing into the room the
    // way a visitor a stride inside would. Yaw 0 faces negative Z (toward
    // the window wall); the slight positive yaw turns the first look toward
    // Steve at his desk.
    spawn: { x: 1.55, z: 1.25 },
    rotation: { yaw: 0.3, pitch: 0 },

    // Walkable clamp: held off every wall's inner face by a bit more than
    // the 0.4 player radius, so the clamp (not wall collision) is what a
    // visitor rides against. The closet cut-out is handled by its collision
    // box in store.js (a clamp rectangle cannot describe an L-shaped room).
    worldBounds: { minX: -1.85, maxX: 1.85, minZ: -2.57, maxZ: 2.57 },

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
        }
    },

    // (No autopilot tour in this experience: the room is small enough to
    // see from the doorway, and walking it takes seconds. main.js does not
    // import the shared autopilot part at all.)

    // Session-scoped "things to discover" list. Every item maps to a
    // clickable prop (the ids match PROP_CONTENT checklistIds in main.js,
    // plus the greeter and whiteboard special paths), so each one is
    // genuinely findable. Order is roughly a visitor's natural path.
    checklist: {
        storageKey: 'steve-checklist',
        items: [
            { id: 'hello',  label: 'Say hi to Steve at his desk',        short: 'say hi to Steve' },
            { id: 'desk',   label: 'Check out the sit-stand desk',       short: 'visit the desk' },
            { id: 'cat',    label: 'Find the office manager (shh)',      short: 'find the office manager' },
            { id: 'board',  label: 'Read the whiteboard up close',       short: 'read the whiteboard' },
            { id: 'closet', label: 'Find the closet by the door',        short: 'find the closet' },
            { id: 'litter', label: "Spot the office manager's restroom", short: 'spot the litter box' }
        ]
    }
});
