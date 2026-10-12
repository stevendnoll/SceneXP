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

    /** The studio shell (PLANNING 6.1): about 12 m by 8 m, the long walls
     *  running along x. The glass faces the street on the +z long wall, behind
     *  the arrival camera, so the morning sun falls into the room toward the
     *  back wall where the menu and the plan board will hang. Meters. */
    room: {
        width: 12,
        depth: 8,
        height: 3.4,
        floor: '#E9E5DD',      // pale stone, a shade under the wall white
        walls: '#F7F5F1',      // white plaster
        ceiling: '#F2F0EC'
    },

    /** The arrival view. The camera stands inside the glass and looks across
     *  the room at the back wall. Every other station arrives in M2. */
    camera: {
        fov: 50,
        near: 0.05,
        far: 120,
        position: [0, 1.6, 3.4],
        lookAt: [0, 1.25, -2.5]
    },

    /** Morning light through the glass: a warm sun from the street side and
     *  a soft sky fill, so plaster reads white and the floor pale. */
    light: {
        sun: { color: '#FFF4E2', intensity: 2.2, position: [3.5, 6, 9] },
        sky: { color: '#EAF1F8', ground: '#D9D2C6', intensity: 1.15 }
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
