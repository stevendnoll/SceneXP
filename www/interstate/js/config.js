// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Interstate Tire experience configuration
 *
 * One plain object holding every per-experience knob the shared 3D engine
 * parts (www/shared/js) accept. main.js imports this and passes slices into
 * the shared init functions: initScene(canvas, INTERSTATE_CONFIG),
 * initControls(INTERSTATE_CONFIG), initChecklist(INTERSTATE_CONFIG.checklist), ...
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that).
 *
 * A business experience honoring Interstate Tire of historic Cockeysville,
 * MD (www.interstatetireco.com). The world is the shop and its block: the
 * waiting room and garage, the host behind the counter, the street out
 * front, and Railroad Ave running down the west side to the 1892
 * Pennsylvania RR freight depot. Two pedestrians walk the sidewalk (and
 * still turn into polite zombies after dark).
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const INTERSTATE_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'store',

    // Building dimensions (meters). Consumed by store.js/world.js, so every
    // dimension has one home. Front wall sits at positionZ + depth / 2 = +20.
    building: {
        width: 32,
        depth: 26,
        height: 5,
        wallThickness: 0.4,

        // Front wall openings. The customer entrance and its tinted display
        // window sit on the left (waiting-room) side; the open garage bay is
        // on the right.
        doorWidth: 3.2,
        doorHeight: 2.6,
        doorOffsetX: -10,

        windowWidth: 5,
        windowHeight: 2.2,
        windowBottom: 0.6,
        windowOffsetX: -5,

        // Open garage bay (no door mesh across it; visitors can walk in)
        bayWidth: 9,
        bayHeight: 4.2,
        bayOffsetX: 9,

        // Interior partition between the customer waiting room (left) and the
        // garage (right), with a connecting door and a viewing window
        partitionX: -2,

        // Exterior
        groundSize: 100,
        sidewalkDepth: 8,
        streetWidth: 12,

        // Position (building center)
        positionX: 0,
        positionZ: 7
    },

    // Player start: just inside the customer entrance, in the waiting room,
    // facing into the store (negative Z direction).
    spawn: { x: -10, z: 17 },
    rotation: { yaw: 0, pitch: 0 },

    // Walkable clamp: the shop's block plus its historic west side. Visitors
    // can cross the street to the grass strip (sidewalk 20 to 28, street 28
    // to 40, greenery from 40), and walk down Railroad Ave (x -21.5 to -28.5)
    // to the 1892 freight depot (centered at x -34, z -3).
    worldBounds: { minX: -40, maxX: 20, minZ: -18, maxZ: 46 },

    // Sky and time. The 8 minute cycle gives visitors a sunset without asking
    // them to wait around for one.
    dayNight: { enabled: true, cycleDuration: 480 },

    // Widen the sun's shadow box beyond the shared default (30) so the
    // freight depot out on Railroad Ave grounds properly. Costs a little
    // shadow resolution across the scene, which the soft look absorbs.
    shadowRange: 42,

    // No comet in the minimized world (the shared engine defaults it off too).
    comet: { enabled: false },

    // Sidewalk pedestrians turn into (polite) zombies after dark.
    zombiesAtNight: true,

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay
    // valid on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // Hosting model: the serving domain is the builder's marketing site, and
    // each experience is a subfolder hosted on behalf of a business. So the
    // one absolute URL an experience carries is the featured business's own
    // website. Builder-funnel links are root-relative
    // (the marketing pages live at the serving domain's root), and anything
    // that names the serving domain (share URL, business-card domain line)
    // is derived from location at runtime. The static SEO meta tags in
    // index.html are the only other per-deployment values.
    site: {
        // The business this experience was built for. Its website is the
        // in-world funnel (the shop button, the hello card, the celebration
        // cards, the business card). The counter business card (painted
        // texture + close-up modal) speaks for the shop itself, no named
        // contact person: name, phone, and website only.
        business: {
            name: 'Interstate Tire',
            websiteUrl: 'https://www.interstatetireco.com/',
            phone: '410-666-7333'
        },

        // The floating Home button returns to the serving site's root in the
        // same tab (the marketing pages live at every hosting domain's root).
        home: {
            path: '/',
            title: 'Back to the main site'
        },

        // Native share sheet / clipboard copy. The shared URL itself is
        // derived from location at runtime, so it always names whichever
        // domain served the tour.
        share: {
            title: 'Interstate Tire, a walkable 3D shop tour',
            text: 'I just walked through a tire shop in 3D, built by one developer and an AI. Worth a look:'
        },

        // The builder funnel (the nudge and completion modals' "Get in
        // touch"). contactPath is root-relative on purpose: every domain
        // that hosts an experience serves the builder's marketing pages at
        // its root, so the link follows the serving domain with no
        // per-domain configuration.
        builder: {
            contactPath: '/contact.html'
        }
    },

    // Street + room population: a greeter (the host) plus two visitors in the
    // waiting room, and two pedestrians on the sidewalk.
    indoorVisitors: { count: 2 },
    pedestrians: { count: 2, sidewalkZ: 26.5, minX: -18, maxX: 18 },

    // Autopilot tour route (the shared autopilot part walks it in order,
    // looping). The camera bypasses collision while engaged, so every
    // segment is authored along clear floor and passes through real
    // openings: the partition doorway (z 14.8 to 16.2), the open garage
    // bay, and the sliding entrance doors, which open on approach. The
    // lookAt targets are the same sights the discovery list celebrates.
    // The tour starts on its own the first time the visitor steps through
    // the welcome screen, and can be toggled with the top-left tour button
    // or the T key. Any movement input hands the controls back.
    autopilot: {
        speed: 2.2,
        route: [
            { x: -6.5,  z: 15,   lookAt: { x: -9,    z: 9,    y: 1.4 },  pause: 2.5 }, // the host at the counter
            { x: -6.5,  z: 16.5, lookAt: { x: -2.2,  z: 13,   y: 3.0 },  pause: 2.5 }, // the waiting room TV
            { x: -6,    z: -1.5, lookAt: { x: -6,    z: -4.5, y: 1.45 }, pause: 3 },   // the discovery whiteboard
            { x: -4,    z: 8,    lookAt: { x: -2,    z: 8,    y: 1.7 },  pause: 2.5 }, // the garage viewing window
            { x: -2.6,  z: 15.5 },                                                     // to the partition doorway
            { x: 2,     z: 15.5 },                                                     // through it, into the garage
            { x: 6.5,   z: 9.5,  lookAt: { x: 9,     z: 5,    y: 1.8 },  pause: 2.5 }, // the SUV up on the lift
            { x: 6.5,   z: 8.5,  lookAt: { x: 4,     z: 5,    y: 1.6 },  pause: 2.5 }, // the sports car on the second bay
            { x: 6.5,   z: -2,   lookAt: { x: 8,     z: -5.3, y: 1.2 },  pause: 2.5 }, // the tire racks, threading the bays
            { x: 12,    z: 0 },                                                        // around the lift's far side
            { x: 12.5,  z: 8,    lookAt: { x: 15.1,  z: 11,   y: 1.2 },  pause: 2.5 }, // the workbench
            { x: 9,     z: 17 },                                                       // out through the open bay
            { x: 9,     z: 24 },                                                       // onto the sidewalk
            { x: -16,   z: 24.5, lookAt: { x: -20.7, z: 27.2, y: 2.5 },  pause: 2 },   // the Railroad Ave sign
            { x: -25,   z: 20 },                                                       // onto the avenue
            { x: -25,   z: 2,    lookAt: { x: -30.8, z: 1.2,  y: 2 },    pause: 2.5 }, // the depot's freight door
            { x: -28.5, z: -1,   lookAt: { x: -34,   z: -3,   y: 3.5 },  pause: 3 },   // the 1892 depot, in full
            { x: -33.5, z: -1.8, lookAt: { x: -35.5, z: -7.5, y: 1.2 },  pause: 3 },   // inside, the freight room (through the open doorway, world z -3 to -0.6)
            { x: -28.2, z: -0.9 },                                                     // back out the doorway
            { x: -25,   z: 24 },                                                       // back up the avenue
            { x: -12,   z: 24 },                                                       // along the sidewalk
            { x: -10,   z: 22.5 },                                                     // the sliding doors open ahead
            { x: -10,   z: 17 }                                                        // back inside, then loop
        ]
    },

    // Session-scoped "things to discover" list. label shows in the HUD panel;
    // short is the terser phrasing drawn on the garage whiteboard. Order is
    // roughly the path a visitor takes: inside first, then out onto the street.
    checklist: {
        storageKey: 'interstate-checklist',
        items: [
            { id: 'host',     label: 'Say hello to the host at the counter',  short: 'meet the host' },
            { id: 'tv',       label: 'Check the TV in the waiting room',      short: 'watch the shop TV' },
            { id: 'lift',     label: 'See the car up on the lift',            short: 'see the car on the lift' },
            { id: 'tires',    label: 'Find the tire racks in the garage',     short: 'find the tire racks' },
            { id: 'switch',   label: 'Flip the light switch by the door',     short: 'flip the light switch' },
            { id: 'passerby', label: 'Say hello to someone on the sidewalk',  short: 'greet a passerby' },
            { id: 'depot',    label: 'Visit the 1892 freight depot',          short: 'visit the old depot' },
            { id: 'sky',      label: 'Look up and click the sun or the moon', short: 'click the sun or moon' },
            { id: 'zombie',   label: 'Greet a night wanderer after dark',     short: 'meet a night wanderer' }
        ]
    }
});
