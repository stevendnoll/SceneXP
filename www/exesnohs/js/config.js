// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Every tunable for X's and O's, frozen at load.
 *
 * THIS FILE HOLDS THE COORDINATE CONTRACT (PLANNING section 4), which is the
 * most consequential seam in the project. The 2D game expresses every player
 * position and every route as a formula over four measurements (`width`,
 * `height`, `lineInterval`, `gutters`) rather than as fixed pixels, and its
 * canvas is sized from its container, so those formulas already run correctly
 * across a range of aspect ratios.
 *
 * That is what makes the port tractable: the 144KB formation library does not
 * get rewritten, it gets handed different units. `measurements()` below is the
 * ONLY place the two worlds meet. No other module multiplies by a scale
 * factor, so when a position looks wrong there is exactly one place to look.
 */

/** Freeze a config tree so a stray assignment fails loudly in development
 *  instead of quietly retuning the game three modules away. */
function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((key) => {
        const value = obj[key];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

/**
 * THE FIELD, IN METRES.
 *
 * One world unit is one metre, which is what the rest of the site uses (the
 * bicycle in www/dad has a 0.34 wheel radius, for instance).
 *
 * THE PLAYING AREA IS FIVE INTERVALS LONG, NOT ONE HUNDRED YARDS. The 2D game
 * computes `lineInterval = width / 5` and every route in the library is
 * expressed against it, so a regulation field would disturb all of them to
 * satisfy nobody. This is a deliberately compressed field (PRD 4.2, D3).
 *
 * THE WIDTH IS THE ONE NUMBER THAT HAS TO BE TUNED BY EYE. In the source, X
 * positions derive from `lineInterval` while Y positions derive from `height`
 * and `gutters.y`, and those bases are independent, so no amount of arithmetic
 * settles the ratio between them. Freeze it once M1 has placed real formations
 * on it, and record the number in TASKS D14.
 *
 * WIDENED 26.6 -> 30 ON 2026-09-08 after the first screenshot. The opening
 * guess was 26.6, which gave the compressed field a real playing surface's
 * 1.876:1 proportion. 30 takes that to 1.667, so the field is now
 * proportionally wider than a regulation one.
 *
 * That is a deliberate trade and it is the right way round for this game.
 * Nothing here is regulation (D3), the camera has to be high enough to read a
 * whole route concept, and lateral space is exactly what a passing game needs
 * the visitor to be able to see. A field that measures correctly and plays
 * cramped would be the wrong kind of accurate.
 */
const FIELD = {
    lineInterval: 10,        // one of five segments down the field, metres
    segments: 5,             // so the playing area is 50m long
    width: 30,               // sideline to sideline. TUNE IN M1, then freeze.
    endZone: 5,              // metres beyond the goal line at each end
    sideline: 2.2,           // metres of paint and grass outside each sideline
};

/**
 * THE SIMULATION KEEPS ITS OWN UNITS. THE VIEW CONVERTS. (M2, 2026-09-08)
 *
 * This replaces the original plan, which was to run the ported simulation
 * directly in metres and "re-tune the speeds against the new scale". That plan
 * was wrong, and M2 found out why: the ported code carries distances that are
 * NOT reachable from config. `motion.js` hard-codes its collision radii (12
 * and 10 for a lineman, 6 and 5 for everyone else), and those are pixels. In
 * metres a lineman would collide with anything within twelve metres.
 *
 * Scaling the physics at object-creation time would have fixed the speeds and
 * left the radii twenty times too big, which is the worst kind of bug: the
 * game would still run, and it would just feel inexplicably sticky.
 *
 * So the simulation stays in FIELD UNITS, exactly as the 2D game wrote it,
 * nothing in the ported files is touched, and `view.js` multiplies by
 * `UNITS_TO_METRES` on its way to the scene graph. One conversion, one place.
 *
 * WHY 200 UNITS PER INTERVAL. It is the value that makes every constant the 2D
 * game hard-coded come out physically sensible, which is a good sign it is
 * roughly the canvas the game was tuned against:
 *
 *     collision radius 12 units -> 0.60 m   (about the width of a player)
 *     collision radius  6 units -> 0.30 m
 *     maxSpeed 2.0 units/frame  -> 6.0 m/s  (a fast human sprints about 10)
 *     maxSpeed 2.4 units/frame  -> 7.2 m/s
 *
 * The acceleration is arcade rather than physical (roughly 63 m/s^2, so a
 * receiver is at full speed in a tenth of a second). That is the 2D game's
 * feel and it is deliberately preserved, not corrected.
 */
const SIM = {
    lineInterval: 200,       // field units per interval. See above.
    segments: FIELD.segments,
    gutter: 5,               // the 2D game's gutters.x and .y, unchanged
};

/** One field unit in metres. The only scale factor in the project. */
const UNITS_TO_METRES = FIELD.lineInterval / SIM.lineInterval;

/** The cross-field extent in field units, derived so it can never drift from
 *  the tuned metre value in FIELD.width. */
const simWidth = () => FIELD.width / UNITS_TO_METRES;

/**
 * The measurements object handed to the ported simulation.
 *
 * Same shape the 2D game built from its canvas, and now the same units too.
 * Anything reading `state.measurements` in the ported code is reading this.
 */
function measurements() {
    return {
        width: SIM.lineInterval * SIM.segments,   // downfield extent, units
        height: simWidth(),                       // sideline to sideline, units
        lineInterval: SIM.lineInterval,
        gutterX: SIM.gutter,
        gutterY: SIM.gutter,
        x: 0,
        y: 0,
    };
}

/**
 * Simulation coordinates to world metres.
 *
 * sim x is downfield and becomes world x. sim y runs sideline to sideline and
 * becomes world z, centred so the middle of the field is z = 0. sim z is the
 * ball's height (see routes.getZIndex) and becomes world y, which is up.
 *
 * view.js is the only caller. Nothing else in the project converts units.
 */
function simToWorld(x, y, z = 0) {
    return {
        x: x * UNITS_TO_METRES,
        y: z * UNITS_TO_METRES,
        z: y * UNITS_TO_METRES - FIELD.width / 2,
    };
}

/**
 * The width to hand `formations.setContainerDimensions()`.
 *
 * THE ROUTES DERIVE THEIR OWN lineInterval AND IT IS NOT THE ONE ABOVE. Inside
 * `setObjectFormationPosition` the ported code computes:
 *
 *     lineInterval = (container.width - gutters.x * 10) / 5
 *
 * and `setContainerDimensions(h, w, gx, gy)` had already set
 * `container.width = w - gx`. So the value every route actually uses is
 *
 *     (w - gx - gutters.x * 10) / 5
 *
 * This function inverts that, so the derived value comes out exactly
 * FIELD.lineInterval and the players line up with the yard lines that
 * field.js painted at the same spacing.
 *
 * GETTING THIS WRONG DOES NOT THROW. It silently lines both teams up somewhere
 * other than the markings they are standing on, which looks like a modelling
 * mistake rather than an arithmetic one and would be very slow to find.
 */
function containerWidth() {
    // w = lineInterval * segments + gutter * 10 + gutter, in FIELD UNITS.
    return SIM.lineInterval * SIM.segments + SIM.gutter * 11;
}

/**
 * The height to hand `setContainerDimensions()`.
 *
 * `container.height = h - gy`, and the routes read the cross-field extent from
 * `measurements.height` rather than from the container, so this only has to
 * keep the container's own bookkeeping honest.
 */
function containerHeight() {
    return simWidth() + SIM.gutter;
}

/**
 * The settings object the ported class expects, whose `style.gutters` is the
 * unit every formation counts in. In the 2D game both were 5 pixels.
 */
function formationSettings() {
    return { style: { gutters: { x: SIM.gutter, y: SIM.gutter } } };
}

const EXESNOHS_CONFIG = {
    field: FIELD,

    /** Scene, renderer and camera. The camera numbers here are the PLAY
     *  driver's opening guess and exist to be argued with in S1, which is the
     *  spike that decides whether this game works in 3D at all. High and raked
     *  down the field, closer to coaches film than to a video game, because a
     *  visitor who cannot read the whole route concept cannot call a play. */
    scene: {
        background: 0x080b12,       // night beyond the floodlights
        fogNear: 60,
        fogFar: 190,
        fogColor: 0x0b0f18,
        maxPixelRatio: 1.5,         // the site-wide cap
    },

    camera: {
        fov: 46,
        /** Portrait gets a wider vertical field of view, because a tall thin
         *  frame converts very little of it into the horizontal angle that
         *  actually decides whether the field fits. */
        portraitFov: 58,
        /** Metres of grass that must stay visible beyond each sideline. The
         *  camera pulls back until this is true, however narrow the screen. */
        sideMargin: 1.5,
        near: 0.5,
        far: 400,
        // The play driver. Behind the offence's own goal line, up high.
        play: {
            height: 30,
            back: 34,               // metres behind the line of scrimmage
            /**
             * WHERE THE CAMERA AIMS, AND IT DECIDES WHAT FALLS OFF THE BOTTOM.
             *
             * This was 18, aiming at x=28. That put the bottom edge of the
             * frame on the ground at x=-1.4m, while players drop back as far
             * as x=-5.4m: 6.4% of all player-frames were below the frame, so
             * roughly one player in sixteen was cut off at any moment. The
             * median play had somebody off screen.
             *
             * The cure is NOT to pull the camera back, which would shrink
             * every figure on a scene where legibility is already tight.
             * Aiming lower steepens the pitch, which brings the bottom of the
             * frame CLOSER to the camera and therefore further back up the
             * field, from one fixed position.
             *
             * At 3 the visible ground runs x=-8.1m to x=80m, against a field
             * of -5 to 55 and a deepest drop-back of -5.4. It also puts the
             * line of scrimmage nearer the middle of the frame, which is where
             * a play-calling camera should be looking anyway.
             */
            lookAhead: 3,
        },

        /**
         * THE REPLAY DRIVER. Low, close, and allowed to be about one thing.
         *
         * Everything the play camera must not be. It runs in three beats:
         * establish from behind the line, track the carrier low, then settle
         * and hold on where it ended. Fractions are of the whole recording.
         */
        replay: {
            fov: 38,             // narrower than the play camera's 46
            establishBack: 24,   // metres behind the anchor at the start
            establishHeight: 9,
            establishFor: 0.3,   // fraction of the replay spent getting there
            trackBack: 13,       // metres behind the carrier once tracking
            trackHeight: 3.2,    // shoulder height, which the play camera never is
            swing: 9,            // metres of lateral orbit across the replay
            lead: 3,             // aim slightly ahead of the carrier
            settleFrom: 0.78,    // when the closing move begins
            settleCloseness: 0.72,
            settleZoom: 7,       // degrees of fov given up on the settle
            speed: 0.85,         // playback rate. Under 1 is slow motion
            holdEnd: 1.0,        // seconds to hold the last frame
        },
    },

    /** Floodlit night, deliberately. A day/night cycle is off: this is one
     *  game under the lights, and night flatters low-poly geometry while
     *  hiding the fact that the stands are an empty shell. */
    lighting: {
        ambient: { color: 0x415066, intensity: 0.55 },
        key: { color: 0xffffff, intensity: 1.15, position: [-30, 55, 30] },
        fill: { color: 0xbcd2ff, intensity: 0.45, position: [40, 48, -25] },
        pylons: 4,                  // corner floodlight towers
    },

    /** Turf appearance. The markings are baked into one canvas texture rather
     *  than built as geometry, which is the first lever in the performance
     *  plan and costs nothing to do properly the first time. */
    turf: {
        grass: '#1f5c2e',
        stripe: '#226733',          // the mown alternate band
        paint: '#eef2f0',
        endZone: '#7a1220',
        stripes: 10,                // mown bands across the playing area
        textureWidth: 2048,
    },

    /** Storage keys. Every one of these outlives the visit, so all three are
     *  named in www/privacy.html before M4 ships (TASKS M4). */
    storage: {
        audio: 'exes-n-ohs-audio-settings',
        play: 'exes-n-ohs-play-settings',
        best: 'exes-n-ohs-best-score',
    },

    /**
     * HOW FAST THE GAME RUNS, and it is the only speed control there is.
     *
     * The ported simulation's speeds are per FRAME, not per second, so the
     * rate it is stepped at is the game's pace. Lowering this slows everything
     * uniformly (players, closing speed, the ball) and preserves every
     * relative balance in the 2D game, which retuning individual speeds would
     * not. Nothing in the ported files is touched.
     *
     * 60 was too fast to watch: top speed came out at 10.2 m/s on a field only
     * 50m long, so a receiver crossed it in five seconds and the whole play
     * was over before the eye caught up. The 2D game got away with it on a
     * small canvas where everything was closer together.
     *
     * At 45 the top speed is 7.6 m/s, which crosses the field in about six and
     * a half seconds. Raise it if the game ever feels sluggish, but raise it
     * here and nowhere else.
     */
    simHz: 45,

    /** Ten plays make a game. Scoring runs from an intercepted -10 to 50 for
     *  taking it all the way across, per the PRD. */
    rules: {
        playsPerGame: 10,
        interception: -10,
        crossing: 50,
    },
};

deepFreeze(EXESNOHS_CONFIG);

export {
    EXESNOHS_CONFIG, FIELD, SIM, UNITS_TO_METRES,
    measurements, simToWorld, simWidth,
    containerWidth, containerHeight, formationSettings,
};
