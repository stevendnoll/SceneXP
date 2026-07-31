// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The pirate mini golf experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, FAMILY_CONFIG),
 * initControls(FAMILY_CONFIG), initChecklist(FAMILY_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * Phase 8: a nostalgic tribute to Steve's parents, set at a pirate themed
 * miniature golf course on Coastal Highway in Ocean City, Maryland, the kind
 * of place the family visited every summer. The world is fully outdoors: a
 * winding putt putt course, a boardable pirate ship floating in a lagoon
 * with holes on its deck, and the famous plank hole where the ball has to
 * roll a wooden plank over the water. Mom, Dad, and ten year old Steve are
 * playing a round together. There is no greeter: the family is busy playing,
 * and visitors are welcome to wander, watch, and say hi. No street traffic,
 * no zombies, just a perfect summer evening at the shore.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const FAMILY_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'course',

    // There is no building and no greeter in this experience, but a few
    // shared parts read this rectangle (npcs updateShopkeeperBehavior guards
    // on it, and it is a convenient "inside the course" test). Sized to the
    // fenced course grounds (x -32..32, z -5..33). The other fields are
    // unused outdoors and kept at harmless values.
    building: {
        width: 64,
        depth: 38,
        height: 0,
        wallThickness: 0,
        positionX: 0,
        positionZ: 14
    },

    // Player start: on the main front walk directly in front of the
    // scorecard board (it stands just south at x -17, z -4.2), facing up
    // hole 1's green (the felt runs along x -16, z 0.7 to 8.8). Camera yaw
    // convention: 0 looks down -Z, so looking north up the course is ~PI.
    spawn: { x: -17, z: -1.6 },
    rotation: { yaw: -2.99, pitch: 0 },

    // Walkable clamp: the fenced course grounds. The sidewalk and Coastal
    // Highway to the south are backdrop only. The lagoon inside these bounds
    // is sealed off by its own perimeter colliders (with exactly two
    // crossings: the gangplank and the plank).
    worldBounds: { minX: -32, maxX: 32, minZ: -5, maxZ: 33 },

    // Sky and time. Mini golf is best on a bright summer afternoon, so the
    // cycle is off and the shared scene freezes the sky at a pleasant noon.
    // cycleDuration is kept for if this ever changes.
    dayNight: { enabled: false, cycleDuration: 480 },

    // No comet, and drifting clouds on.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A family place at every hour. (Kept explicit so no future shared part
    // re-introduces night wanderers.)
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business: it honors a family. The Home
    // button therefore goes to the serving site's root in the same tab.
    site: {
        // The family this experience celebrates. These labels are used in
        // in-world copy. If Steve wants real names shown one day, this is
        // the one place to change them (plus the static meta copy in
        // index.html).
        honoree: {
            mom: 'Mom',
            dad: 'Dad',
            kid: 'Steve',
            place: 'Ocean City'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'Putt Putt with Mom and Dad',
            text: 'A 3D round of pirate mini golf in Ocean City, built from a son\'s favorite summer memory of playing putt putt with his parents. Worth a visit:'
        },

        // The builder funnel (the nudge and completion modals' "Get in
        // touch"). Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    },

    // Course population beyond the family trio (the trio is experience code
    // in store.js). Three passersby stroll the Coastal Highway sidewalk just
    // outside the fence, and a pair of background players putt on the far
    // hole on desktop.
    pedestrians: { count: 3, sidewalkZ: -8, minX: -30, maxX: 30 },
    backgroundGolfers: { enabled: true },

    // Autopilot tour route (the shared autopilot part walks it in order,
    // looping). Nodes keep to the entrance walk, the fairway lanes, and the
    // lagoon's dry edge; the ship is admired from shore (the deck and plank
    // stay a reward for hands-on visitors). Toggled with the top-left tour
    // button or the T key; any movement input hands the controls back.
    autopilot: {
        speed: 2.3,
        route: [
            { x: -24.5, z: -1.4, lookAt: { x: -24.5, z: -3.2, y: 1.4 }, pause: 3 },  // the ticket booth
            { x: -17,   z: -2.2, lookAt: { x: -17,   z: -4.2, y: 1.6 }, pause: 3 },  // the scorecard board
            { x: -8,    z: 3 },                                                      // onto the course
            { x: 2,     z: 9,    lookAt: { x: 26,   z: 8,  y: 0.4 }, pause: 2.5 },   // down the fairways
            { x: 10,    z: 15,   lookAt: { x: 17.5, z: 25, y: 3 },   pause: 3.5 },   // the pirate ship
            { x: 14.9,  z: 15.2, lookAt: { x: 14,   z: 20, y: 1.2 }, pause: 2.5 },   // the gangplank
            { x: 29,    z: 15.5, lookAt: { x: 27,   z: 23, y: 1.6 }, pause: 3 },     // the stern, across the water
            { x: 4,     z: 12 }                                                      // an easy loop back
        ]
    },

    // Session-scoped "things to discover" list. label shows in copy and on
    // the scorecard board by the entrance; short is the terser phrasing
    // painted on the board itself. Order is roughly the path a visitor
    // takes: booth and board first, then out onto the course, then aboard
    // the ship.
    checklist: {
        storageKey: 'family-checklist',
        items: [
            { id: 'booth',    label: 'Stop by the ticket booth window',        short: 'visit the booth' },
            { id: 'scorecard', label: 'Read the scorecard board',              short: 'read the scorecard' },
            { id: 'tee',      label: 'Meet the family playing their round',    short: 'meet the family' },
            { id: 'cannon',   label: 'Inspect one of the cannons',             short: 'inspect a cannon' },
            { id: 'treasure', label: 'Find the treasure chest',                short: 'find the treasure' },
            { id: 'ship',     label: 'Climb aboard the pirate ship',           short: 'board the ship' },
            { id: 'plank',    label: 'Walk the plank yourself',                short: 'walk the plank' },
            { id: 'splash',   label: 'Ask about the ball skimmer net',         short: 'ask about the skimmer' },
            { id: 'conch',    label: 'Hold the conch shell to your ear',       short: 'try the conch shell' },
            { id: 'sky',      label: 'Look up and click the sun',              short: 'click the sun' }
        ]
    }
});
