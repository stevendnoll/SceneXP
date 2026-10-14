// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * config.js - Every tunable in Whitestone Home Care, in one frozen object.
 *
 * THE RULES READ THIS AND NOTHING ELSE. Pricing, scheduling and the store
 * take the config as an argument rather than importing a constant of their
 * own (the Corner Office pattern), so a test can hand them a different one.
 *
 * DEEP FROZEN, because a shallow freeze lets `CONFIG.stage.cove.width = 2` succeed
 * silently and then every test that follows measures a different stage.
 *
 * The API base and polling intervals arrive with the server (M3). Every
 * other tunable the PRD names is here.
 */

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

export const CONFIG = deepFreeze({
    name: 'Whitestone Home Care',

    /** The approved palette (PLANNING 13, 2026-10-12). One accent, the calm
     *  slate blue, for markers, halos and primary buttons. The report colors
     *  are listed now so every later module reads them from here. */
    colors: {
        stone: '#F4F2EE',
        warmGray: '#8A857D',
        graphite: '#22252A',
        accent: '#3E5C76',
        done: '#3F8F5A',
        attention: '#C98A1B',
        skipped: '#9AA0A6'
    },

    /** Where the house stands (stage.js, PLANNING 6.1): a seamless white
     *  cove and a round stone turntable. Meters, x across, z toward the
     *  camera, y up, the turntable's middle on the floor at the origin.
     *
     *  THE COVE: a floor running from `front` (behind the camera) back to
     *  `back`, where it curves up through a quarter circle of `radius` into
     *  a wall `height` tall, `width` wide. Far larger than any frame, so its
     *  edges are never seen.
     *
     *  THE TURNTABLE: `radius` by `height`, a stone drum with a `chamfer`
     *  round its top edge on a dark `toe` set `inset` in. The house's lawn
     *  stops `rim` short of its edge, so a ring of stone shows round it. */
    stage: {
        cove: { color: '#F1F0EC', width: 80, front: 30, back: 7, radius: 3.5, height: 22 },
        turntable: {
            radius: 1.5, height: 0.35, toe: 0.05, inset: 0.07, chamfer: 0.012, rim: 0.05,
            stone: '#E6E1D8', toeColor: '#2A2D31'
        },
        /** The soft shadow under the turntable: `alpha` dark from `inside`
         *  meters within its rim, fading out over `soft` meters past it. */
        contact: { alpha: 0.38, inside: 0.25, soft: 0.6, lift: 0.002 }
    },

    /** The house model on the turntable (model.js; where its rooms go is
     *  layout.js's). A model of the visitor's home, on a round lawn on the
     *  turntable (QA, 2026-10-13: the trays did not read as a house). Lifting a level
     *  opens the house there like a dollhouse: every story above it, roof
     *  included, rises by `open`, the level itself by `raise`, and its front
     *  wall steps aside so its rooms can be seen. The move takes `seconds`,
     *  and is instant under reduced motion. */
    model: {
        /** Every color the house is painted in (model.js): an Eastside new
         *  build, the developer home of Bothell, Sammamish and Woodinville
         *  (Steve's choice, 2026-10-13, from specs/whitestone/previews/
         *  houses.html). Gray lap siding, a white board-and-batten cross
         *  gable, a dark asphalt roof, black windows, a stone base, cedar
         *  porch posts and garage door. Inside, white oak and white with one
         *  muted accent per room. Still no dark walnut browns
         *  (whitestone-model tests the palette). */
        palette: {
            // QA, 2026-10-13: the dark gray body, roof and floor edges made
            // one gloomy mass. A lighter body, crisp white trim, and the
            // dark kept for the roof and the windows, as real ones are.
            wall: '#959A9C',       // gray lap siding
            lapLine: '#82878A',    // the siding's courses
            whiteTrim: '#F4F3EF',  // corner boards, the band between floors, fascia, gutters, railings' caps
            gable: '#F2F1EC',      // the cross gable's board and batten
            batten: '#D9D6CE',
            stone: '#A49C90',      // the stone base, the porch piers
            stoneLine: '#8C857A',
            roof: '#45484C',       // asphalt
            trim: '#2C2F33',       // the ridge, the gutters
            frame: '#1F2124',      // the windows' black frames
            glass: '#6F8796',
            lite: '#7F95A3',       // the glass in the front door and the garage door
            door: '#1F2124',       // the front door, black
            porch: '#1F2124',      // the porch's black metal roof
            cedar: '#A8714A',      // porch posts, the garage door
            lamp: '#1F2124',
            plate: '#F2F1EC',      // the floor plates' white edges
            interior: '#F7F5F1',   // the rooms' own walls, white
            oak: '#D9C3A1',        // white oak floors
            tileKitchen: '#E8E5DF',
            tileBath: '#CBCECC',   // a soft gray, so white fixtures read on it
            tile: '#E1DDD6',
            concrete: '#BEBBB5',
            counter: '#EEEBE6',    // white quartz
            white: '#F4F2EE',      // cabinets, a tub, the crib
            duvet: '#F6F3EE',
            fabric: '#CFC8BC',     // a greige sofa, an upholstered headboard
            charcoal: '#3E4146',   // dining chairs, a desk chair
            rug: '#DCD4C6',
            pot: '#E9E5DD',        // white ceramic planters
            // The rooms' furnishings (rooms.js): stainless appliances, a
            // black cooktop and screens, a sink's basin, a bath's water and
            // glass, a mirror, a lamp's shade.
            steel: '#C3C7CA',
            appliance: '#2A2D31',
            sinkBasin: '#9EA5AA',
            water: '#CFE0E6',
            showerGlass: '#D4E2E8',
            mirror: '#DCE6EA',
            lampshade: '#F2ECE1',
            plant: '#5E8A4A',
            car: '#3A4452',
            carGlass: '#8EA3B4',
            /** Each room's one muted accent and a second for a cushion, by
             *  the room's id: navy, sage, rust, ochre, slate, clay. */
            accent1: '#3E4F6A',
            accent2: '#8DA08A',
            accent3: '#B5683F',
            accent4: '#C9A04E',
            accent5: '#5F6B78',
            accent6: '#C98F78',
            lawn: '#8DAE68',
            // The context round a townhome or a condo (PRD 8.9), a sketch:
            // a faint slate fill (at model.context.opacity) and slate
            // edges, and a condo's plaza, a step darker than the studio.
            massing: '#8A9BA8',
            contextEdge: '#8A9BA8',
            paving: '#C4BEB3',
            mulch: '#5B4C40',
            path: '#D3CFC7',       // concrete
            drive: '#C9C5BD',
            shrub: '#4F6E3F',      // clipped boxwood
            hydrangea: '#F2F0EA',
            trunk: '#5E544B',
            leaves: '#6E9752',
            maple1: '#A2452F',     // a Japanese maple
            maple2: '#B8563A',
            fir1: '#3F5E3B',       // Douglas firs behind the house
            fir2: '#4A6B42'
        },
        marker: '#5A82A6',     // the tasks, a lighter accent
        outlineHover: '#9FB3C4', // the room under the pointer, faintly
        /** The context's fill, see-through (model.js massing). */
        context: { opacity: 0.12 },
        markerGlow: 0.22,      // how much the task dots light themselves
        lift: { raise: 0.02, open: 0.34, seconds: 0.6 },
        /** Drawn larger than layout.js's numbers, up to `max`, and smaller
         *  only when the house's half-diagonal would come within `margin`
         *  meters of the lawn's edge (QA: the model sat small on a big
         *  plinth). */
        scale: { max: 1.5, margin: 0.3 }
    },

    camera: { near: 0.05, far: 120 },

    /** The camera on the house (turntable.js, PLANNING 6.2). Angles in
     *  radians.
     *
     *  THE FRAME: a screen narrower than `tallBelow` is `tall` (a phone
     *  upright), else `wide`. A wide frame holds Maya too (`host`): it is at
     *  least her height, and leaves her the room right of the turntable,
     *  her bubble beside her. On a phone she is out of the frame, a
     *  portrait in her bubble instead. Each has a vertical `fov`, the share of the
     *  screen's width and height the turntable and the house may fill
     *  (`use`), and how far the subject is moved off center (`shift`, as
     *  shares of the width and height, positive is left and up): on a wide
     *  screen a little left for Maya and the panel, on a phone into the top
     *  part above the bottom sheet.
     *
     *  THE LOOK: the house's turn (`yaw`, from a three-quarter view of its
     *  front), the camera's `tilt` above level, and the `zoom` as a share of
     *  the framed distance. A drag of a pixel turns by `turn.perPixel` and
     *  tilts by `turn.tiltPerPixel` (on an 800 pixel tall screen), a released
     *  turn slows at `turn.damping` per second (none if the finger rested
     *  `turn.hold` seconds before lifting), and after `idle.after`
     *  seconds untouched the house drifts round at `idle.speed` (never while
     *  a floor is open). Opening a floor turns the house's open front to the
     *  camera over `turn.face` seconds, the view lowered to `tilt.open` so
     *  the floors above do not hide its rooms. The arrival
     *  starts `arrival.from` times farther out. A frame refits over
     *  `subject.ease` seconds when the house grows or shrinks. A press that
     *  moves less than `tap.slop` pixels and lifts within `tap.ms` is a tap. */
    view: {
        tallBelow: 1,
        wide: { fov: 30, use: [0.48, 0.8], shift: [0.17, 0], host: true },
        tall: { fov: 34, use: [0.9, 0.48], shift: [0, 0.23], host: false },
        yaw: { start: -0.55 },
        tilt: { start: 0.42, min: 0.16, max: 0.72, open: 0.3 },
        zoom: { min: 0.6, max: 1.4, wheel: 0.0012, key: 0.25 },
        turn: { perPixel: 0.007, tiltPerPixel: 0.0035, damping: 4.5, stop: 0.03, maxSpeed: 4, key: 0.3, hold: 0.12, face: 0.9 },
        idle: { after: 20, speed: 0.07 },
        arrival: { seconds: 2.5, from: 1.7 },
        subject: { ease: 0.8 },
        tap: { slop: 8, ms: 600 }
    },

    /** Maya on the stage (cast.js, PLANNING 6.4): a Hispanic woman, she
     *  and her, standing on the cove's floor to the right of the turntable
     *  at `x`, `z`, turned `facing` radians toward the house, `height`
     *  meters tall with her hair. A white Whitestone polo with the accent's
     *  mark, charcoal trousers, a warm medium skin tone, dark hair. */
    cast: {
        maya: {
            x: 2.0, z: 0.1, facing: -0.55, height: 1.72,
            skin: '#BF8A66', hair: '#22170F', eyes: '#3A2416',
            shirt: '#F6F5F1', pants: '#2F353D', accent: '#3E5C76'
        }
    },

    /** Maya's timing (host.js, ONBOARDING section 8), in seconds: she
     *  speaks `delay` after the house arrives (at once under reduced
     *  motion), the next step pulses after `pulse` seconds of nothing, and
     *  she says the hint once more, in other words, after `again`. */
    guide: { delay: 1.2, pulse: 8, again: 20 },

    /** Soft daylight from an unseen skylight: an even sky over the white,
     *  one sun from high in front whose shadows cover the turntable only
     *  (`reach` meters either side of its line), and a cool fill from the
     *  left. */
    light: {
        sun: {
            color: '#FFF6EA', intensity: 2.2, position: [2.5, 9, 6], target: [0, 0.4, 0],
            shadow: { size: 2048, sizeMobile: 1024, reach: 2.6, near: 4, far: 20, bias: -0.0004, normalBias: 0.02, radius: 4 }
        },
        sky: { color: '#F6F8FB', ground: '#EEEAE3', intensity: 2.6 },
        fill: { color: '#E6EDF5', intensity: 0.5, position: [-6, 4, 5] },
        /** Where the stage is captured from for the stone's soft sheen. */
        reflectFrom: [0, 1.2, 3],
        exposure: 1.0
    },

    /** The one localStorage key (store.js), and the schema this build
     *  writes. A saved document with a HIGHER schema is left alone and never
     *  overwritten. `budgetChars` is a conservative share of the browser's
     *  quota of about five million characters, which every SceneXP scene
     *  shares. Deleted records are kept for undo and dropped after
     *  `keepDeletedDays`. */
    storage: {
        key: 'scenexp-whitestone-v1',
        schema: 1,
        budgetChars: 3000000,
        warnAt: 0.8,
        keepDeletedDays: 30
    },

    /** The PRD's limits (11.1 to 11.8). Text limits are characters. */
    limits: {
        checklists: 20,
        rooms: 40,
        items: 200,
        quantity: 50,
        photosPerItem: 5,
        photosPerChecklist: 60,
        title: 80,
        label: 40,
        household: 500,
        notes: 500,
        avoid: 500,
        products: 200,
        preferenceNote: 300
    },

    /** How often the customer expects a visit: context for the cleaner. */
    frequencies: ['once', 'weekly', 'biweekly', 'monthly'],

    /** Photos (PRD 11.6): resized and re-encoded in the browser, which also
     *  drops every bit of metadata, GPS location included. */
    photos: {
        database: 'scenexp-whitestone',
        fullMax: 1600,
        thumbMax: 320,
        quality: 0.8,
        maxFullBytes: 2000000,
        maxThumbBytes: 250000
    },

    /** Where the shared links point (PLANNING 7.3). The origin is the page's
     *  own at run time, so a local copy makes local links. */
    links: {
        share: '/whitestone/tasks/',
        edit: '/whitestone/'
    },

    quality: {
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5,
        maxFrameSeconds: 0.1
    },

    /** The loading screen holds this long after Ready so the first frame has
     *  painted under it. Milliseconds. */
    loadingReveal: 400,

    /** Usage telemetry. The same puzzle, prefix and sessionStorage key every
     *  other scene uses, so one visitor's hash is one hash across the site. */
    telemetry: {
        proofOfWork: { prefix: '11', storageKey: 'gallery-pow' }
    }
});
