// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Every tunable in Corner Office, in one frozen object.
 *
 * THE RULES READ THIS AND NOTHING ELSE. The store, the queries and the
 * derivations all take the config as an argument rather than importing a
 * constant of their own, so a test can hand them a different one, and a
 * visitor-facing setting (the weekly goal, the follow-up gap) has exactly one
 * default here and one live value in the saved document.
 *
 * DEEP FROZEN, because a shallow freeze lets `CONFIG.settings.weeklyGoal = 9`
 * succeed silently and then every test that follows measures a different
 * office.
 */

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

export const CONFIG = deepFreeze({
    name: 'Corner Office',

    /** The one localStorage key, and the schema this build writes. A saved
     *  document with a HIGHER schema is left alone and never overwritten.
     *
     *  `budgetChars` is a conservative share of the browser's quota, which is
     *  about five million characters per site in every major browser and is
     *  shared with the site's other scenes. The office warns at `warnAt` of
     *  it, long before a save can fail. */
    storage: {
        key: 'scenexp-office-v1',
        schema: 1,
        budgetChars: 4000000,
        warnAt: 0.8
    },

    /** Defaults for the visitor-editable settings. The live values are in the
     *  saved document. The weekly goal is Steve's number (2026-09-24): five,
     *  and easy to change. */
    settings: {
        weeklyGoal: 5,
        followUpDays: 7,
        ghostAfterDays: 21,
        sortKey: 'activity',
        sortDir: 'desc'
    },

    /** Bounds the settings enforce, so a typo cannot ask for a goal of a
     *  thousand or a follow-up in zero days. */
    settingsBounds: {
        weeklyGoal: { min: 1, max: 100 },
        followUpDays: { min: 1, max: 60 },
        ghostAfterDays: { min: 1, max: 365 }
    },

    /** Application statuses, IN PIPELINE ORDER, which is also the order the
     *  status sort and the corkboard columns use. `ghosted` is not here: it is
     *  derived (query.js), never stored, because nobody should have to type
     *  that word about their own search. */
    statuses: ['saved', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'],
    closedStatuses: ['accepted', 'rejected', 'withdrawn'],
    /** The statuses that can go quiet long enough to count as ghosted. */
    ghostableStatuses: ['applied', 'screening', 'interviewing'],

    /** What an event can be, and how far logging one moves its application
     *  along. An event only ever moves an application FORWARD, and never
     *  reopens a closed one. */
    eventTypes: ['screen', 'interview', 'assessment', 'offer', 'call', 'email', 'other'],
    eventAdvances: {
        screen: 'screening',
        interview: 'interviewing',
        assessment: 'interviewing',
        offer: 'offer'
    },
    outcomes: ['pending', 'passed', 'declined', 'none'],

    workModes: ['onsite', 'hybrid', 'remote', 'unknown'],
    salaryPeriods: ['year', 'hour'],

    /** The grid's sort keys, and the direction each starts in when chosen. */
    sortKeys: {
        activity: 'desc',
        company: 'asc',
        applied: 'desc',
        status: 'asc',
        salary: 'desc'
    },

    /** Field length caps. A pasted job posting is long, so `long` is
     *  generous, and the storage budget above is what really bounds a
     *  document. `log` is how many activity entries are kept. */
    limits: {
        short: 200,
        long: 20000,
        url: 2000,
        round: 30,
        durationMinutes: 24 * 60,
        salary: 100000000,
        links: 50,
        log: 500
    },

    /** The placeholder room for M0: a floor, the back wall and a desk, seen
     *  from where a visitor would stand in the doorway. Meters.
     *
     *  THE CORNER IS THE BACK RIGHT (x = +width/2, z = -depth/2), where the
     *  two window walls meet. The desk stands against the back wall, just
     *  left of the corner, so the city is over the visitor's shoulder while
     *  they work. `desk.x` and `desk.z` are the center of its top. */
    room: {
        width: 6,
        depth: 5,
        height: 2.8,
        desk: { x: 0.9, z: -2.05, width: 1.6, depth: 0.8, height: 0.75 },
        /** The wall calendar, on the back wall left of the window, where the
         *  desk's view reaches it. `y` is its center. */
        calendar: { x: -0.32, y: 1.52, width: 0.54, height: 0.74 },
        /** The filing cabinet: a low lateral file of open-topped drawers
         *  along the back wall, left of the calendar. `x` and `z` are its
         *  center on the floor. `floor` is the drawers' floor, `pull` how far
         *  they slide out when the visitor comes over, `lift` how far a
         *  found folder rises. Meters. */
        cabinet: {
            x: -1.85, z: -2.2, width: 1.9, depth: 0.5, height: 0.66, drawers: 4,
            floor: 0.3, pull: 0.12, folderHeight: 0.26, lift: 0.17, capacity: 128
        },
        /** The corkboard, on the left wall. `z` and `y` are its center, `x`
         *  its face (the wall's inner face is at -width/2). `header` is the
         *  strip the column names are painted on, `card` an index card's
         *  width and height, all exaggerated from life so a card reads
         *  across the room. */
        board: { x: -2.97, z: -1.05, y: 1.55, width: 2.4, height: 1.1, header: 0.12, card: [0.25, 0.155] }
    },

    /** The camera's near and far planes. */
    camera: {
        near: 0.05,
        far: 60
    },

    /** Where the camera stands for each station, and what it looks at.
     *  `fov` is VERTICAL, as three's always is, and is the fov at the
     *  reference aspect. A narrower screen widens it (stations.js) so the
     *  desk keeps its width on a phone, up to `view.maxFov`. */
    stations: {
        desk: { eye: [0.35, 1.5, 0.9], aim: [0.8, 0.9, -2.05], fov: 48 },
        computer: { eye: [0.95, 1.2, -1.2], aim: [0.95, 1.05, -2.3], fov: 42 },
        calendar: { eye: [-0.22, 1.5, -1.2], aim: [-0.32, 1.52, -2.5], fov: 44 },
        cabinet: { eye: [-1.85, 1.72, -0.55], aim: [-1.85, 0.42, -2.12], fov: 50, retreat: 1.1 },
        board: { eye: [-0.95, 1.52, -1.05], aim: [-2.97, 1.52, -1.05], fov: 46, retreat: 1.6 }
    },

    view: {
        refAspect: 16 / 10,
        maxFov: 84,
        /** How long a glide between stations takes. Reduced motion cuts. */
        glideSeconds: 0.9,
        /** The narrowest screen a station's `retreat` is sized for: an
         *  upright phone backs the eye off by the whole retreat. */
        narrowAspect: 0.45,
        /** How long a folder takes to refile, and to rise or settle. */
        refileSeconds: 0.8,
        liftSeconds: 0.35,
        /** How long a card takes to cross the corkboard. */
        carrySeconds: 0.7
    },

    /** How far ahead the calendar file reaches, in days. */
    icsDays: 60,

    /** How long the undo toast stays up, unless focus is inside it. */
    toastSeconds: 7,

    quality: {
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5,
        maxFrameSeconds: 0.1
    },

    /** How often the loop re-reads the clock while the tab is open, so a
     *  follow-up can fall due without a reload. Seconds. */
    tickSeconds: 60,

    /** The loading screen holds this long after Ready so the first frame has
     *  painted under it. Milliseconds. */
    loadingReveal: 400,

    /** Usage telemetry. The same puzzle, prefix and sessionStorage key every
     *  other scene uses, so one visitor's hash is one hash across the site.
     *  Events carry counts and actions only, never anything the visitor
     *  typed. */
    telemetry: {
        proofOfWork: { prefix: '11', storageKey: 'gallery-pow' }
    }
});
