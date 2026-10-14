// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * config.js - Every tunable in Whitestone Home Care, in one frozen object.
 *
 * THE RULES READ THIS AND NOTHING ELSE. Pricing, scheduling and the store
 * take the config as an argument rather than importing a constant of their
 * own (the Corner Office pattern), so a test can hand them a different one.
 *
 * DEEP FROZEN, because a shallow freeze lets `CONFIG.room.width = 20` succeed
 * silently and then every test that follows measures a different studio.
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

    /** The studio shell (PLANNING 6.1): 12 m by 8 m, x across, z from the
     *  street (-z) to the entrance wall (+z), y up. Meters.
     *
     *  THE GLASS IS ACROSS THE ROOM FROM THE ARRIVAL VIEW, not behind it as
     *  PLANNING 6.1 first drew it: the first thing a visitor sees is the
     *  house model on its plinth in the morning light with the street beyond
     *  it, floor to ceiling between `glass.x0` and `glass.x1`. The plaster
     *  piers either side carry the service menu (left) and the plan board
     *  (right). */
    room: {
        width: 12,
        depth: 8,
        height: 3.4,
        floor: '#E8E4DC',      // pale stone, a shade under the wall white
        walls: '#F7F5F1',      // white plaster
        ceiling: '#F3F1ED',
        /** The curtain wall: aluminum mullions every `mullionEvery` meters,
         *  a slim frame `frame` wide, and glass faintly tinted. */
        glass: { x0: -4, x1: 4, mullionEvery: 2, frame: 0.05, frameDepth: 0.1, tint: '#DCE6EC', opacity: 0.08 },
        /** The baseboard's shadow gap, a dark line where wall meets floor. */
        reveal: 0.012
    },

    /** The furniture, each by its middle on the floor plan. Meters. The menu
     *  and the board hang on the glass wall's piers, facing the room.
     *
     *  THE DESK AND THE PRINTER FLANK THE PLINTH, in front of the glass, so
     *  the arrival view holds every touch point, even on an upright phone:
     *  the concierge's halo is the only one a first visit sees, and by the
     *  entrance it was out of frame (whitestone-marks tests the view). The
     *  concierge stands behind the desk with the street behind them. */
    studio: {
        /** A stone top on a recessed base (`inset` meters in), so it reads as a
         *  display plinth rather than a block (QA, 2026-10-13). */
        plinth: { x: 0, z: -0.7, width: 2.7, depth: 1.3, height: 0.72, top: 0.08, inset: 0.14 },
        desk: { x: -1.95, z: -2.45, length: 1.8, depth: 0.7, height: 1.05 },
        console: { x: 1.95, z: -2.5, length: 1.3, depth: 0.45, height: 0.86 },
        printer: { width: 0.46, depth: 0.36, height: 0.22 },
        menu: { x: -5, y: 1.55, width: 1.5, height: 1.0 },
        board: { x: 5, y: 1.55, width: 1.6, height: 1.1 },
        /** Slim linear pendants: [x, z, length along x], hung `drop` below
         *  the ceiling. */
        pendants: { drop: 0.75, width: 0.06, height: 0.035, list: [[0, -0.7, 2.0], [-1.95, -2.45, 1.4]] },
        /** Plants in white stone planters: [kind, x, z], kind 'tree' or
         *  'grass'. */
        plants: [['tree', -5.5, 3.5], ['tree', 5.5, 3.5], ['grass', -3.55, -3.55], ['grass', 3.55, -3.55], ['tree', 5.45, 0.4]]
    },

    /** The house model on the plinth (model.js; where its rooms go is
     *  layout.js's). A white architectural model of a modern home: floor
     *  plates, walls with dark windows, a front door, an aluminum gable roof
     *  (QA, 2026-10-13: the trays did not read as a house). Lifting a level
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
            tileBath: '#E2E4E3',
            tile: '#E1DDD6',
            concrete: '#BEBBB5',
            counter: '#EEEBE6',    // white quartz
            white: '#F4F2EE',      // cabinets, a tub, the crib
            duvet: '#F6F3EE',
            fabric: '#CFC8BC',     // a greige sofa, an upholstered headboard
            charcoal: '#3E4146',   // dining chairs, a desk chair
            rug: '#DCD4C6',
            pot: '#E9E5DD',        // white ceramic planters
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
        markerGlow: 0.22,      // how much the task dots light themselves
        lift: { raise: 0.02, open: 0.34, seconds: 0.6 },
        /** Drawn larger than layout.js's numbers, up to `max`, and smaller
         *  only when a home is too wide to fit the plinth with `margin` to
         *  spare (QA: the model sat small on a big plinth). */
        scale: { max: 1.25, margin: 0.2 }
    },

    /** The painted faces (boards.js), in canvas pixels. Each is the face's
     *  own aspect, so nothing is stretched. */
    boards: {
        board: { width: 1024, height: 694, background: '#F6F7F7' },
        menu: { width: 1024, height: 672, background: '#1E2125' }
    },

    /** Where the camera stands (stations.js): `eye`, `aim`, vertical `fov`
     *  at the reference aspect. A station with `retreat` steps back up to that
     *  many meters on an upright phone, so its subject still fits. */
    stations: {
        overview: { eye: [0, 1.65, 3.5], aim: [0, 1.1, -1.6], fov: 52, retreat: 0.35 },
        model: { eye: [0, 2.05, 1.9], aim: [0, 1.2, -0.7], fov: 44, retreat: 1.2 },
        menu: { eye: [-5, 1.55, -1.5], aim: [-5, 1.52, -4], fov: 42, retreat: 1.2 },
        board: { eye: [5, 1.55, -1.5], aim: [5, 1.52, -4], fov: 42, retreat: 1.2 },
        printer: { eye: [3.6, 1.5, -0.2], aim: [1.95, 0.98, -2.5], fov: 44, retreat: 0.6 },
        desk: { eye: [-3.6, 1.6, -0.2], aim: [-1.95, 1.12, -2.45], fov: 46, retreat: 0.6 }
    },

    camera: { near: 0.05, far: 160 },

    view: {
        refAspect: 16 / 10,
        narrowAspect: 0.45,
        maxFov: 80,
        /** Slow and eased, for a screen share (PLANNING 6.1). A cut under
         *  reduced motion. */
        glideSeconds: 1.8,
        /** Looking around from a station (the shared pan part): turn and
         *  tilt in radians, zoom in doublings of magnification. Every
         *  station starts from its composed view. */
        look: {
            pan: { speed: 0.7, maxAngle: 0.55, maxTilt: 0.3 },
            zoom: { speed: 1.2, wheel: 0.15, maxIn: 1.2, maxOut: 0.3 }
        }
    },

    /** Morning light through the glass: a warm sun from the street side,
     *  high enough to lay a bright patch on the floor around the plinth, and
     *  a soft sky fill. Its shadows cover the room only (`reach` meters
     *  either side of the light's line through the room's middle), so the
     *  map's pixels go where they are seen. Anything outside that box is
     *  lit as if unshadowed, so it must take in every corner of the room
     *  (whitestone-studio.test.mjs). */
    light: {
        sun: {
            color: '#FFF1DC', intensity: 3.0, position: [-5.5, 10.7, -12], target: [0, 1.7, 0],
            shadow: { size: 2048, sizeMobile: 1024, reach: 8, near: 4, far: 36, bias: -0.0004, normalBias: 0.03 }
        },
        // QA, 2026-10-13: the room read dim and gray, the ceiling taupe. A
        // stronger, near-white fill, its ground color no longer beige.
        sky: { color: '#F3F6FA', ground: '#EFEBE4', intensity: 2.7 },
        /** A soft cool fill from the entrance side, for the faces turned
         *  away from the sun. */
        fill: { color: '#E2EAF4', intensity: 0.6, position: [-3, 3.5, 7] },
        /** The light off the pale floor, shining up, so the ceiling and the
         *  undersides of things are not left in the hemisphere's ground tone. */
        bounce: { color: '#F2EEE8', intensity: 0.9 },
        /** Where the room is captured from for the metals' reflections. */
        reflectFrom: [0, 1.5, 0.8],
        exposure: 1.1
    },

    /** The street beyond the glass (street.js). Distances run from the glass
     *  outward along -z, meters. Seen only through the glass, so it casts no
     *  shadows and is drawn in a handful of meshes. */
    street: {
        sky: { top: '#9DBFDF', horizon: '#E9EFF3' },
        ground: '#C9C4BA',
        sidewalk: '#D9D5CD',
        road: '#707377',
        line: '#ECE7DA',
        lawn: '#8FAA68',
        hedge: '#5F7F45',
        leaves: ['#6F9150', '#5E8445', '#7FA05A'],
        trunk: '#6A6158',
        homes: ['#F4F2EE', '#E6E3DD', '#F8F7F4', '#DCDAD6'],
        trim: '#3A3D42',
        windows: '#55636E',
        /** Where each band of the street ends, from the glass: the studio's
         *  own sidewalk, the planting strip with the street trees, the road,
         *  the far sidewalk, and the front yards across the street. */
        bands: { sidewalk: 2.4, verge: 3.6, road: 10.6, farSidewalk: 12.6, lawns: 18 },
        homeDepth: 9,
        span: 90,              // how far the street runs either way
        treeEvery: 7,
        /** No tree within this many meters of the middle of the view, so
         *  nothing outside competes with the model (QA, 2026-10-13). */
        clearCenter: 6.5,
        homeEvery: 15
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
