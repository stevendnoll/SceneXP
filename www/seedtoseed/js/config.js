// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Seed to Seed garden experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, SEED_CONFIG),
 * initControls(SEED_CONFIG), initChecklist(SEED_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * A business experience honoring Seed to Seed (bakersgardens.com), a home
 * vegetable and edible gardening company serving Maryland and the
 * surrounding region. The world is the owner's own backyard: a very
 * professional home garden with raised planter boxes, a walk-in greenhouse,
 * a pumpkin patch, and vegetables growing from the ground. The owner is the
 * greeter, standing among his beds, and the visitors strolling the paths
 * can't stop talking about how much he knows about plants.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const SEED_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'garden',

    // There is no store building in this experience, but the shared greeter
    // look-at behavior (npcs updateShopkeeperBehavior) uses this rectangle
    // as "the greeter can see you" zone: while the player is inside it, the
    // owner turns to face them; outside it he returns to his default pose,
    // keeping an eye on his beds. Sized to the garden's heart (the raised
    // beds and the paths between them). The other building fields are
    // unused outdoors and kept at harmless values.
    building: {
        width: 24,
        depth: 18,
        height: 0,
        wallThickness: 0,
        positionX: 0,
        positionZ: 2
    },

    // Player start: mid-garden on the main mulch path (the path runs up
    // x 0 from the gate), facing the owner where he stands at about
    // x 1.5, z -1 among his beds.
    spawn: { x: 0, z: 3.5 },
    rotation: { yaw: -0.32, pitch: 0 },

    // Walkable clamp: the backyard. The picket fence rings the yard just
    // past these bounds on all four sides.
    worldBounds: { minX: -20, maxX: 20, minZ: -12.5, maxZ: 14 },

    // Sky and time. The full day/night cycle runs here: gardens are lovely
    // at golden hour, and the moon keeps watch over the beds after dark
    // (clicking it ticks the same discovery as the sun).
    dayNight: { enabled: true, cycleDuration: 480 },

    // No comet, and drifting clouds on.
    comet: { enabled: false },
    scenery: { clouds: true },

    // A peaceful place at every hour, and certainly no zombies among the
    // tomatoes. (This experience never spawns the shared sidewalk
    // pedestrians, the only cast the zombie feature applies to, so this
    // flag is a guard against any future shared part re-introducing them.)
    zombiesAtNight: false,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Hosting model: builder-funnel links are root-relative (the marketing
    // pages live at the serving domain's root), and anything that names the
    // serving domain is derived from location at runtime. This experience
    // DOES feature a business: Seed to Seed. Its outbound links are the one
    // set of absolute external URLs, and they live here.
    site: {
        // The business this experience honors. label is used in in-world
        // copy ("say hello to the gardener").
        honoree: {
            label: 'the gardener',
            business: 'Seed to Seed'
        },

        // The featured business's own pages. servicesUrl is the in-world
        // funnel (the Our Services sign, the hello card, the celebration
        // cards); websiteUrl appears alongside it where a general link
        // reads better.
        business: {
            name: 'Seed to Seed',
            tagline: 'Grow more food',
            websiteUrl: 'https://bakersgardens.com/welcome.html',
            servicesUrl: 'https://bakersgardens.com/services.html'
        },

        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime.
        share: {
            title: 'The Seed to Seed Garden',
            text: 'A 3D backyard garden built for Seed to Seed, a home vegetable gardening company. Wander the raised beds, step inside the greenhouse, and meet the gardener:'
        },

        // The builder funnel (the completion and nudge cards' secondary
        // "get in touch" link). Root-relative on purpose.
        builder: {
            contactPath: '/contact.html'
        }
    },

    // Garden population: the owner as greeter, plus visitors strolling the
    // paths (the shared waypoint NPC system drives them). Two on desktop
    // (the balanced draw then guarantees one masculine and one feminine
    // presentation), one on mobile: every moving figure re-renders the
    // shadow map each frame, and phones get the conservative crowd.
    walkers: { count: 2, mobileCount: 1 },

    // Guest skin tones, weighted (by repetition) to mirror the business's
    // real clientele in its service area while keeping the cast varied.
    // Drawn per guest on each page load; the shared pool's presentation
    // mix (hair, outfits) is unaffected.
    visitors: {
        skinTones: [0xffdbac, 0xffe0bd, 0xf0c8a0, 0xd4a574, 0x8d5524]
    },

    // Autopilot tour route (the shared autopilot part walks it in order,
    // looping). Nodes follow the mulch paths and open lawn, and the lookAt
    // targets are the same sights the discovery list celebrates. The tour
    // starts on its own the first time the visitor steps through the welcome
    // screen, and can be toggled with the top-left tour button or the T key.
    // Any movement input hands the controls back.
    autopilot: {
        speed: 2.1,
        route: [
            { x: -2,   z: 9.5,  lookAt: { x: 2.5,   z: 11.6, y: 1.5 }, pause: 2.5 }, // the services sign
            { x: -8,   z: 6.4,  lookAt: { x: -8,    z: 8.6,  y: 1.6 }, pause: 3 },   // the chalkboard
            { x: -7.9, z: 3.4,  lookAt: { x: -12,   z: 4.5,  y: 0.5 }, pause: 3 },   // the pumpkin patch
            { x: -8,   z: 0.2 },                                                     // around the patch's south edge
            { x: -15,  z: -6.6, lookAt: { x: -17.8, z: -6.8, y: 0.8 }, pause: 3 },   // the compost bins
            { x: -2,   z: -8.4, lookAt: { x: 0.5,   z: -10,  y: 1.3 }, pause: 3 },   // the corn block
            { x: 8.4,  z: -5.9, lookAt: { x: 9.6,   z: -7.2, y: 0.8 }, pause: 2 },   // the rain barrel
            { x: 13.4, z: -2.2 },                                                    // the greenhouse door
            { x: 13.5, z: -6,   lookAt: { x: 13.5,  z: -7.6, y: 1.0 }, pause: 3 },   // inside, at the seedling table
            { x: 13.5, z: -2.2 },                                                    // back out the door
            { x: 17.2, z: 0.5,  lookAt: { x: 18.2,  z: 0.5,  y: 1.1 }, pause: 2.5 }, // the potting bench
            { x: 12.3, z: 9.0,  lookAt: { x: 0,     z: 3.5,  y: 0.8 }, pause: 3 },   // the bench view of it all
            { x: 3.6,  z: 3.5,  lookAt: { x: 1.5,   z: -1,   y: 1.6 }, pause: 3.5 }, // say hello to the gardener
            { x: 4.4,  z: 8 }                                                        // clear of the beds, then loop
        ]
    },

    // Session-scoped "things to discover" list. label shows in copy and on
    // the garden chalkboard; short is the terser phrasing painted on the
    // board itself. Order is roughly the path a visitor takes: say hello
    // first, then work outward through the garden. The 'kiosk' id is kept
    // for the chalkboard so the shared board plumbing carries over as-is.
    checklist: {
        storageKey: 'seedtoseed-checklist',
        items: [
            { id: 'hello',      label: 'Say hello to the gardener',            short: 'say hello' },
            { id: 'kiosk',      label: 'Read the garden chalkboard',           short: 'read the chalkboard' },
            { id: 'planter',    label: 'Look closely at a raised bed',         short: 'inspect a raised bed' },
            { id: 'greenhouse', label: 'Step inside the greenhouse',           short: 'enter the greenhouse' },
            { id: 'pumpkin',    label: 'Find the pumpkin patch',               short: 'find the pumpkins' },
            { id: 'compost',    label: 'Pay the compost bins a visit',         short: 'visit the compost' },
            { id: 'services',   label: 'Check the Our Services sign',          short: 'check the services sign' },
            { id: 'sky',        label: 'Look up and click the sun',            short: 'click the sun' }
        ]
    }
});
