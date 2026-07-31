// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Zumba studio experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, ROQUI_CONFIG),
 * initControls(ROQUI_CONFIG), initChecklist(ROQUI_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * Phase 7: a tribute experience honoring Roqui, a wonderful Zumba instructor
 * who teaches a weekly class at the Matt Griffin YMCA in SeaTac, Washington.
 * The world is a bright indoor activity room: sprung wood floor, a mirror
 * wall behind the instructor, speakers wired to her iPhone, and a class of
 * six dancers following her latin routine. Roqui leads from the front and
 * greets visitors between songs.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const ROQUI_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'studio',

    // The activity room. Unlike the trail this is a real building again: the
    // shared lighting rig reads width/depth/height to place the ceiling
    // lights, and the interior sits centered on the origin. The mirror wall
    // is the north wall (negative Z); the door is in the south wall.
    building: {
        width: 19,
        depth: 14,
        height: 4.2,
        wallThickness: 0.25,
        positionX: 0,
        positionZ: 0
    },

    // Shared interior lighting rig intensities (lighting-1.0.0 reads this
    // block via the world config). A bright, energetic room: Zumba is not a
    // mood-lighting activity. nightBoost stays modest since the day/night
    // cycle is off anyway.
    lighting: {
        base: { rectArea: 2.6, hemi: 0.75, corner: 1.3, ceiling: 3.2 },
        nightBoost: 1.4
    },

    // Player start: at the back of the room on the water table side (the
    // east half, positive X), behind the last row of dancers. From here the
    // first look runs diagonally through the aisle between the center and
    // east dancer columns, so nobody blocks the view of Roqui. The yaw
    // turns that first look onto her at the mirror wall: yaw 0 faces
    // negative Z, and positive yaw swings the view toward negative X.
    spawn: { x: 4.8, z: 3.8 },
    rotation: { yaw: 0.53, pitch: 0 },

    // Walkable clamp: inside the walls, held half a step off the mirror
    // glass and the baseboards.
    worldBounds: { minX: -8.9, maxX: 8.9, minZ: -5.7, maxZ: 6.3 },

    // Sky and time. Class is always in session: the cycle is off and the
    // shared scene freezes the sky at a pleasant noon outside the windows.
    dayNight: { enabled: false, cycleDuration: 480 },

    // No comet, and drifting clouds on (visible through the windows).
    comet: { enabled: false },
    scenery: { clouds: true },

    // A happy place at every hour.
    zombiesAtNight: false,

    // The floating greeter sign (the "Help"/"Hello" bubble earlier
    // experiences hang over their hosts). Roqui is the first greeter to go
    // without one: she is front and center leading the class, and a floating
    // tag would only clutter her. Flip to true to bring the ¡Hola! sign
    // back; the experience honors this in store.js when building the host.
    greeterSign: { enabled: false },

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it honors a person. The Home
    // button therefore goes to the serving site's root in the same tab.
    site: {
        // The person this experience celebrates. 'Roqui' is the label used
        // in in-world copy. Her class schedule lives on the Matt Griffin
        // YMCA's website, which the dialogs point visitors toward (spoken,
        // not linked: the experience keeps no outbound links by design).
        honoree: {
            label: 'Roqui',
            studio: 'the Matt Griffin YMCA in SeaTac, Washington'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'Zumba with Roqui',
            text: 'A joyful little 3D Zumba class, built with love for a wonderful instructor. Step in and catch the beat:'
        },

        // The builder funnel (the nudge and completion modals' "Get in
        // touch"). Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    },

    // The class: six dancers in two rows, following Roqui's routine.
    dancers: { count: 6 },

    // One clock drives everything rhythmic: the dance routine, the disco
    // ball, and the WebAudio percussion groove the speakers play. A merengue
    // friendly 128 beats per minute.
    music: { bpm: 128 },

    // Autopilot tour route (the shared autopilot part walks it in order,
    // looping). The studio is small, so the route hugs the side aisles and
    // the open floor in front of the class, never cutting through the
    // dancers' rows. Toggled with the top-left tour button or the T key;
    // any movement input hands the controls back.
    autopilot: {
        speed: 1.9,
        route: [
            { x: 5.4,  z: 3.0,  lookAt: { x: 0,    z: -4.4, y: 1.5 }, pause: 3 },   // take in the class
            { x: -5.4, z: 3.4 },                                                    // around the back row
            { x: -8.2, z: 2.6,  lookAt: { x: -9.3, z: 2.6,  y: 1.5 }, pause: 3 },   // the schedule board
            { x: -5.6, z: -2.6, lookAt: { x: 0,    z: -1.2, y: 3.3 }, pause: 2.5 }, // the disco ball
            { x: -3.1, z: -4.6, lookAt: { x: -3.7, z: -5.7, y: 0.9 }, pause: 2.5 }, // the speakers
            { x: -1.7, z: -5.2, lookAt: { x: -1.7, z: -6.9, y: 1.5 }, pause: 2.5 }, // the mirror wall
            { x: 0,    z: -2.9, lookAt: { x: 0,    z: -4.4, y: 1.5 }, pause: 3.5 }, // hola, Roqui
            { x: 2.4,  z: -4.8, lookAt: { x: 2.1,  z: -5.9, y: 1.0 }, pause: 2.5 }, // the playlist phone
            { x: 5.6,  z: -1.5 },                                                   // up the east aisle
            { x: 7.6,  z: 3.2,  lookAt: { x: 8.55, z: 3.2,  y: 1.0 }, pause: 2.5 }  // the water table
        ]
    },

    // Session-scoped "things to discover" list. label shows in copy and on
    // the schedule board; short is the terser phrasing painted on the board
    // itself. Order is roughly the path a visitor takes: say hola first,
    // then explore the studio.
    checklist: {
        storageKey: 'roqui-checklist',
        items: [
            { id: 'hello',    label: 'Say hola to Roqui up front',            short: 'say hola to Roqui' },
            { id: 'dancer',   label: 'Meet one of the dancers in class',      short: 'meet a dancer' },
            { id: 'board',    label: 'Read the class schedule board',         short: 'read the schedule board' },
            { id: 'speakers', label: 'Fire up the speakers',                  short: 'fire up the speakers' },
            { id: 'iphone',   label: "Spot the phone running the playlist",   short: 'spot the playlist phone' },
            { id: 'mirror',   label: 'Walk up to the mirror wall',            short: 'visit the mirror wall' },
            { id: 'disco',    label: 'Look up and click the disco ball',      short: 'click the disco ball' },
            { id: 'water',    label: 'Find the water break table',            short: 'find the water table' }
        ]
    }
});
