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
        /** The back window runs the whole wall (QA, 2026-09-25: "ideally the
         *  window would take up the entire field of view"), from the left
         *  corner to the right, and from the floor to the ceiling (QA,
         *  2026-09-28), with the cabinet and the printer standing in front
         *  of it. The wall calendar that hung here gave its place up;
         *  the calendar is a card from Places. Its mullions stand at a
         *  curtain wall's even module, about 1.45 m, one where it always
         *  was just right of the monitor, and none behind it. */
        backWindow: { x0: -2.9, mullions: [-1.4, 0.05, 1.5] },
        /** The filing cabinet: a low lateral file of open-topped drawers
         *  along the back wall, under the window. `x` and `z` are its
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
        board: { x: -2.97, z: -1.05, y: 1.55, width: 2.4, height: 1.1, header: 0.12, card: [0.25, 0.155] },
        /** The door in the front wall: `x` its middle. */
        door: { x: 0.3, width: 0.92, height: 2.05 },
        /** The whiteboard, on the left wall's front half. */
        whiteboard: { x: -2.97, z: 1.25, y: 1.5, width: 1.8, height: 1.0 },
        /** The printer, on a stand under the right-hand window. */
        printer: { x: -0.4, z: -2.2, stand: 0.6 }
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
        cabinet: { eye: [-1.85, 1.72, -0.55], aim: [-1.85, 0.42, -2.12], fov: 50, retreat: 1.1 },
        board: { eye: [-0.95, 1.52, -1.05], aim: [-2.97, 1.52, -1.05], fov: 46, retreat: 1.6 },
        whiteboard: { eye: [-0.95, 1.5, 1.25], aim: [-2.97, 1.5, 1.25], fov: 46, retreat: 1.4 },
        /** At the back window, just right of the desk (the desk hides the
         *  view down through the rest of it), looking west and down the
         *  canyon of towers to slivers of the bay and the mountains beyond:
         *  the view the office is named for. Framed by a census of what each
         *  pixel sees (tests/office-view.test.mjs). */
        window: { eye: [2.45, 1.6, -1.9], aim: [1.4, -2.9, -14], fov: 62, maxFov: 66, holdWidth: true, holdTop: true }
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
        carrySeconds: 0.7,
        /** The room's exposure (its tone mapping), by day and by night. The
         *  filmic curve at 1 laid a daylit white wall near 60% gray, warmed
         *  a little, so the white room read taupe (QA, 2026-09-29); by night
         *  it stays at 1, as dark as Steve likes the office then. */
        roomExposure: { day: 1.3, night: 1 },
        /** How long "Watch a day go by" takes for the whole 24 hours. */
        daySeconds: 30,
        /** How many times faster than life the cars, the jet and the
         *  ripples go while a day goes by (QA, 2026-09-29: the jet flew in
         *  at its own pace while the clock raced). Not the day's own 2,880:
         *  at that a landing is a twentieth of a second and jets flicker
         *  across several times a second. At 30 the jet crosses the view in
         *  under a second, as the ferries do. */
        lapseScenery: 30,
        /** While a day goes by, the reflections are captured again at most
         *  this often, and outside it whenever the sun has moved this far
         *  (each capture draws the world twelve times). */
        captureSeconds: 1,
        captureDegrees: 20,
        /** How often the ferries, ships, cars and clouds move on when nothing
         *  else is drawing: a few frames a second is all slow things need. */
        ambientFps: 15,
        /** While a jet crosses the view it is drawn this often instead:
         *  at 15 frames a second a jet steps across the sky in visible
         *  jumps (QA, 2026-09-25), and it is in sight well under a minute. */
        jetFps: 60,
        /** The city's lit offices are repainted when the share of them
         *  with their lights on moves by this much (daylight.js officesLit). */
        officeStep: 0.03
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
