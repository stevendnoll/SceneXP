// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The NCR Trail experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, DAD_CONFIG),
 * initControls(DAD_CONFIG), initChecklist(DAD_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * Phase 6: a memorial experience honoring Steve's late dad, set on the NCR
 * trail in Maryland where he loved to ride. The world is fully outdoors: a
 * crushed-gravel rail trail running east-west through the woods, the old
 * railroad tracks on one side, and the Gunpowder River (with a small
 * waterfall) on the other. Dad is the greeter, standing beside his hybrid
 * bike. A few of his riding friends pass by on the trail. No street, no
 * building, and, out of respect for the place, no zombies after dark.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const DAD_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'trail',

    // There is no building in this experience, but the shared greeter
    // look-at behavior (npcs updateShopkeeperBehavior) uses this rectangle
    // as "the greeter can see you" zone: while the player is inside it, Dad
    // turns to face them; outside it he returns to his default pose facing
    // the trail. Sized to the stretch of trail and grass around where he
    // stands (x -18..18, z -8..8). The other building fields are unused
    // outdoors and kept at harmless values.
    building: {
        width: 36,
        depth: 16,
        height: 0,
        wallThickness: 0,
        positionX: 0,
        positionZ: 0
    },

    // Player start: on the trail a little west of Dad, facing him and his
    // bike (he stands at about x 2, z 3 on the grass shoulder). Yaw -1.8
    // points the camera mostly east with a slight lean toward the shoulder.
    spawn: { x: -8, z: 0.5 },
    rotation: { yaw: -1.8, pitch: 0 },

    // Walkable clamp: the trail corridor. East-west along the trail, and
    // from the woods edge on the north side to the split-rail fence line
    // above the riverbank on the south side (the river itself is off
    // limits, as it should be).
    worldBounds: { minX: -38, maxX: 38, minZ: -9, maxZ: 8.2 },

    // Sky and time. The trail is a daytime place (nobody rides the NCR at
    // night), so the cycle is off and the shared scene freezes the sky at
    // a pleasant noon. cycleDuration is kept for if this ever changes.
    dayNight: { enabled: false, cycleDuration: 480 },

    // No comet, and drifting clouds on.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A peaceful place at every hour. (The shared pedestrian system is not
    // used here at all, cyclists are experience code, but the flag is kept
    // explicit so no future shared part re-introduces night wanderers.)
    zombiesAtNight: false,

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
        // The person this experience remembers. 'Dad' is the label used in
        // in-world copy ("say hello to Dad"). If Steve wants the real name
        // shown one day, this is the one place to change it (plus the
        // static meta copy in index.html).
        honoree: {
            label: 'Dad',
            trail: 'the NCR Trail'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'A Ride on the NCR Trail',
            text: 'A quiet 3D walk on the NCR Trail, built by a son in memory of his dad, who loved to ride it. Worth a visit:'
        },

        // The builder funnel (the nudge and completion modals' "Get in
        // touch"). Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    },

    // Trail population: Dad the greeter, three of his riding friends on
    // bikes, and two people out for a walk (the shared waypoint NPC system
    // drives the walkers; the cyclists are experience code in store.js).
    walkers: { count: 2 },
    cyclists: { count: 3 },

    // Autopilot tour route (the shared autopilot part walks it in order,
    // looping). Nodes keep to the trail and its grass shoulder, and the
    // lookAt targets are the discoveries. Toggled with the top-left tour
    // button or the T key; any movement input hands the controls back.
    autopilot: {
        speed: 2.3,
        route: [
            { x: -8,  z: 0.5,  lookAt: { x: 2,    z: 3,   y: 1.5 },  pause: 3 },   // Dad, by his bike
            { x: -13, z: 3.2,  lookAt: { x: -13,  z: 4.8, y: 1.6 },  pause: 3 },   // the trailhead kiosk
            { x: -14, z: 6.2,  lookAt: { x: -14,  z: 12,  y: 0 },    pause: 3 },   // bench with the river view
            { x: -25, z: 0.2 },                                                    // west along the trail
            { x: -30, z: -4.2, lookAt: { x: -30,  z: -6,  y: 0.2 },  pause: 2.5 }, // the old rails
            { x: -5,  z: 0.6 },                                                    // back east
            { x: 6,   z: 2.5 },                                                    // angling toward the water
            { x: 10,  z: 6.4,  lookAt: { x: 10,   z: 12,  y: 0 },    pause: 2.5 }, // the second bench
            { x: 18,  z: 6.6,  lookAt: { x: 18.7, z: 14,  y: -0.5 }, pause: 4 },   // the falls overlook
            { x: 29,  z: 1.4,  lookAt: { x: 30,   z: 2.6, y: 0.8 },  pause: 2.5 }, // mile marker 7
            { x: 10,  z: 0.4 }                                                     // an easy stretch home
        ]
    },

    // Session-scoped "things to discover" list. label shows in copy and on
    // the trailhead notice board; short is the terser phrasing painted on
    // the board itself. Order is roughly the path a visitor takes: say
    // hello first, then wander the trail down to the river.
    checklist: {
        storageKey: 'dad-checklist',
        items: [
            { id: 'hello',   label: 'Say hello to the rider by his bike',      short: 'say hello' },
            { id: 'cyclist', label: 'Meet one of the riders out on the trail', short: 'meet a rider' },
            { id: 'kiosk',   label: 'Read the trailhead notice board',         short: 'read the notice board' },
            { id: 'bench',   label: 'Find a bench with a view of the water',   short: 'find a bench' },
            { id: 'rails',   label: 'Spot the old railroad tracks',            short: 'spot the old rails' },
            { id: 'river',   label: 'Visit the river overlook at the fence',   short: 'visit the overlook' },
            { id: 'falls',   label: 'Find the little waterfall',               short: 'find the waterfall' },
            { id: 'sky',     label: 'Look up and click the sun',               short: 'click the sun' }
        ]
    }
});
