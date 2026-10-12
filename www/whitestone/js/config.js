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
     *  and the board hang on the glass wall's piers, facing the room. */
    studio: {
        plinth: { x: 0, z: -0.7, width: 2.7, depth: 1.3, height: 0.82 },
        desk: { x: -3.7, z: 1.6, length: 2.4, depth: 0.72, height: 1.05 },
        console: { x: 3.8, z: 1.6, length: 1.3, depth: 0.45, height: 0.86 },
        printer: { width: 0.46, depth: 0.36, height: 0.22 },
        menu: { x: -5, y: 1.55, width: 1.5, height: 1.0 },
        board: { x: 5, y: 1.55, width: 1.6, height: 1.1 },
        /** Slim linear pendants: [x, z, length along x], hung `drop` below
         *  the ceiling. */
        pendants: { drop: 0.75, width: 0.06, height: 0.035, list: [[0, -0.7, 2.0], [-3.7, 1.6, 1.8]] },
        /** Plants in white stone planters: [kind, x, z], kind 'tree' or
         *  'grass'. */
        plants: [['tree', -5.5, 3.5], ['tree', 5.5, 3.5], ['grass', -3.55, -3.55], ['grass', 3.55, -3.55], ['tree', 5.45, 0.4]]
    },

    /** Where the camera stands (stations.js): `eye`, `aim`, vertical `fov`
     *  at the reference aspect. A station with `retreat` steps back up to that
     *  many meters on an upright phone, so its subject still fits. */
    stations: {
        overview: { eye: [0, 1.65, 3.5], aim: [0, 1.1, -1.6], fov: 52, retreat: 0.35 },
        model: { eye: [0, 1.95, 1.5], aim: [0, 0.98, -0.7], fov: 42, retreat: 1.3 },
        menu: { eye: [-5, 1.55, -1.5], aim: [-5, 1.52, -4], fov: 42, retreat: 1.2 },
        board: { eye: [5, 1.55, -1.5], aim: [5, 1.52, -4], fov: 42, retreat: 1.2 },
        printer: { eye: [2.55, 1.5, 3.3], aim: [3.85, 0.98, 1.6], fov: 44, retreat: 0.6 },
        desk: { eye: [-2.35, 1.6, 3.3], aim: [-3.75, 1.12, 1.6], fov: 46, retreat: 0.7 }
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
        sky: { color: '#EEF3F8', ground: '#D6CFC3', intensity: 1.4 },
        /** A soft cool fill from the entrance side, for the faces turned
         *  away from the sun. */
        fill: { color: '#DCE6F2', intensity: 0.45, position: [-3, 3.5, 7] },
        /** The light off the pale floor, shining up, so the ceiling and the
         *  undersides of things are not left in the hemisphere's ground tone. */
        bounce: { color: '#EFEAE2', intensity: 0.35 },
        /** Where the room is captured from for the metals' reflections. */
        reflectFrom: [0, 1.5, 0.8],
        exposure: 1
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
