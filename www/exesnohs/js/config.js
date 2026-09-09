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
    lineInterval: 7,         // one of five segments down the field, metres
    segments: 5,             // so the playing area is 35m long
    width: 21,               // sideline to sideline
    endZone: 3.5,            // metres beyond the goal line at each end
    sideline: 1.55,          // metres of paint and grass outside each sideline
};

/*
 * SHRUNK FROM 50m x 30m ON 2026-09-08, AND THE REASON IS PHONES.
 *
 * A phone held upright is the primary way this game will be played, and on a
 * 390 pixel screen the whole field has to fit. It did, and a player came out
 * 23 pixels tall, which is not enough to follow.
 *
 * The camera cannot fix that. It always frames to fit, so the absolute size of
 * the field is invisible: halve it and the camera simply comes closer.
 * EXCEPT for the players. They are a fixed 1.75 metres while the field is
 * measured in tens, so shrinking the field makes them a larger fraction of it,
 * and therefore of the screen. It is the only lever that moves the number
 * without either hiding part of the field or reaching for a telephoto lens
 * that turns the scene into a tactics diagram.
 *
 * At 35 x 21 a player is 34 pixels on that same phone, up 42%.
 *
 * THE FLOOR IS ABOUT A 5.4 METRE INTERVAL, and it is set by collisions rather
 * than by looks. `motion.js` hard-codes its radii in FIELD UNITS (12 for a
 * lineman, 6 for everyone else), so they shrink with the field while the
 * players do not. Below 5.4 the radius drops under a player's half-width and
 * figures begin walking through each other. Seven leaves a comfortable margin:
 * 0.42m of radius against 0.33m of half-width.
 *
 * THAT MARGIN WAS SPENT LATER THE SAME DAY, and the paragraph above is left
 * standing because it is the reasoning, not because the numbers still hold.
 * 0.33m is a LIFE SIZE player's half-width, and figures are drawn at 2.2 (see
 * `figureScale`), so the real comparison became 0.42m against 0.73m and the
 * figures did begin walking through each other, on a field that never got
 * anywhere near 5.4. The fix is `collisionScale`, which keeps the radii in step
 * with how big the players are actually drawn. Read that note next.
 *
 * NOTHING IN THE SIMULATION CHANGED. It works in field units and only
 * `UNITS_TO_METRES` moved, which is exactly the separation D17 bought.
 */

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
/**
 * How much bigger than life the players are drawn.
 *
 * Named here rather than written inline because TWO things have to agree with
 * it: how big a figure looks (`figureScale`) and how big it is to the physics
 * (`collisionScale`). They came apart once already. See the long note at each.
 */
const FIGURE_SCALE = 2.2;

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
 * The settings object the ported classes expect, whose `style.gutters` is the
 * unit every formation counts in. In the 2D game both were 5 pixels.
 *
 * `collisionScale` RIDES ALONG HERE, and this is the only route it takes.
 * motion.js hard-codes its half-extents for a life-size player and we draw one
 * at 2.2, so the physics has to be told. It arrives on the settings object the
 * class is already constructed with rather than by importing config, because
 * the ported simulation reaching for config is the thing that would stop it
 * being testable with plain numbers (PLANNING D1, and the same reasoning as
 * D40's injected audio). Anything constructing MotionClass without it gets 1,
 * which is the 2D game's own behaviour.
 */
function formationSettings() {
    return {
        style: { gutters: { x: SIM.gutter, y: SIM.gutter } },
        collisionScale: FIGURE_SCALE,
    };
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
        /** Metres of grass that must stay visible beyond each sideline. */
        sideMargin: 1.05,

        /**
         * THE FRAMING SOLVE, which replaced a width-only one.
         *
         * The first version only guaranteed the field's WIDTH fitted, and
         * bought that by pulling the camera back at a fixed height. That
         * flattens the pitch, and a flat pitch drags the bottom of the frame
         * far behind the field: on a phone in portrait the visible ground
         * started 18m behind an end zone that begins at -5, so a quarter of the
         * screen was empty black under a field that had shrunk to fit.
         *
         * So the solve now fits BOTH axes. It aims at mid-field, puts the near
         * edge of the frame just behind the near end line, and searches for the
         * narrowest field of view and closest camera that still show the whole
         * width. Narrower and further turns out to make players BIGGER, not
         * smaller, because apparent size is distance divided by the tangent of
         * the half-angle and the angle falls away faster than the distance
         * grows.
         */
        solve: {
            nearBehind: 1,    // metres of ground visible behind the near end line
            farBeyond: 1,     // and past the far one
            minPitch: 28,     // degrees. Flatter than this stops reading as a field
            /**
             * 68, NOT 50, AND THE REASON IS PORTRAIT.
             *
             * A tall narrow frame has to look further DOWN to fit a long field,
             * and the steeper it looks the closer it can sit, which is what
             * finally gets both sidelines into shot. Capped at 50 there was no
             * solution at all on a phone and the camera fell back to a default
             * that clipped the touchlines clean off the screen.
             *
             * Landscape is unaffected: the search keeps whichever framing makes
             * a player biggest, and on a wide screen that is still a raked 28
             * degrees. Nothing above about 68 is worth having, because at that
             * point the field reads as a diagram rather than a place.
             */
            maxPitch: 68,
            minFov: 28,
            maxFov: 60,
        },
        near: 0.5,
        far: 400,
        // The play driver. Behind the offense's own goal line, up high.
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
        /**
         * THE REPLAY DRIVER. Low, close, and allowed to be about one thing.
         *
         * EVERY DISTANCE IS IN INTERVALS, NOT METRES, and that is the whole
         * point of this comment. They were metres, and when the field shrank
         * from 50m to 35m they did not shrink with it: the camera ended up
         * 13m behind a carrier on a 35m field, which put it at x = -6 when the
         * near goal post stands at -3.5. Every replay was shot through the
         * uprights, with a player filling three quarters of the frame.
         *
         * Multiply by FIELD.lineInterval and they follow the field wherever it
         * goes next.
         */
        replay: {
            /**
             * 52, WIDENED FROM 38 AND THEN FROM 46, FOR THE SAME REASON BOTH
             * TIMES: at these distances a narrow lens fills the frame with one
             * torso and shows none of the play.
             *
             * The radius comment below claims a player comes out "roughly a
             * third of the frame height", and it did when this was written for
             * a life-size figure. At `figureScale` 2.2 a player is 3.85m and
             * the settled shot sits 11.1m away, so at 46 degrees he was 48% of
             * the frame: half the picture is one man, which is a portrait.
             *
             * A third is not actually reachable. It wants either a 58 degree
             * lens, which bends a figure noticeably at eleven metres, or a
             * radius past the 12.4m the field's tightest corner allows. 52 puts
             * him at 41%, which is the most this field has room for, and the
             * honest version of the sentence below.
             */
            fov: 52,
            /**
             * IT ORBITS THE CARRIER RATHER THAN CHASING HIM.
             *
             * A camera directly behind needs field behind the ball, and on a
             * 35m field there is barely any: with the carrier at the line of
             * scrimmage a two-interval chase wanted to stand behind the goal
             * post, so it spent the whole replay pinned against a clamp,
             * static, at the one distance it was allowed.
             *
             * Swinging round a circle instead keeps the distance CONSTANT, so
             * the framing never changes size, and trades the space behind the
             * ball for space beside it, which a field has plenty of.
             *
             * THE RADIUS IS CAPPED BY THE TIGHTEST SPOT ON THE FIELD, which is
             * a carrier standing on the near try line in the middle. From
             * there the camera has 3m of room behind before the goal post and
             * 12m to either touchline before the seats, so no circle wider
             * than sqrt(3^2 + 12^2), about 12.4m, has anywhere to be. 12.6m is
             * that limit less a whisker, and it puts a player at roughly a
             * third of the frame height, which is a replay rather than a
             * portrait.
             */
            radius: 1.8,             // intervals from the carrier, held
            /**
             * THE HARD FLOOR ON HOW CLOSE IT EVER GETS, raised from 1.1.
             *
             * These heights and distances are in intervals, which is what makes
             * them follow the field (see the note above). What they do NOT
             * follow is `figureScale`, and that is how the replay ended up
             * inside the pack rather than watching it.
             *
             * A player is 1.75m, so at 2.2 they stand 3.85m, which is 0.55 of
             * an interval. `trackHeight` was 0.55. The camera was flying at
             * EXACTLY head height, which is why the close replay frames are a
             * wall of shoulders with the ball somewhere behind them, and why
             * everything the low-poly rig does not have (a face, hands, a seam
             * between two figures) is the first thing the shot shows.
             *
             * 0.95 puts the lens a little under two players up, looking down
             * over them, so figures read against grass instead of against each
             * other. 1.35 of an interval is 9.4m, at which a 3.85m player is
             * about a third of the frame: a replay rather than a portrait,
             * which is what the radius comment above always claimed it was.
             */
            minRadius: 1.35,         // ...unless the seats force it closer
            angleFrom: 168,          // degrees. 180 is directly behind
            angleTo: 118,            // swinging round to the side
            establishHeight: 1.5,    // intervals
            establishFor: 0.3,       // fraction of the replay spent getting there
            trackHeight: 0.95,
            lead: 0.4,               // aim slightly ahead of the carrier
            settleFrom: 0.78,
            settleCloseness: 0.88,   // was 0.72, which closed in too hard, then
                                     // 0.82, which still finished inside the pack
            settleZoom: 6,
            speed: 0.85,
            holdEnd: 1.0,
        },
    },

    /**
     * HOW BIG THE PLAYERS AND THE BALL LOOK.
     *
     * Deliberately not life size. A 1.75m figure on a 50m field seen from a
     * raked camera is a handful of pixels, and this is a game rather than a
     * simulation: legibility beats scale accuracy every time. The same reason
     * the field itself is compressed to five intervals rather than a hundred
     * yards (D3).
     *
     * The ball is pushed harder than the players because it is the one object
     * whose position the visitor is actually tracking, and it starts smaller
     * than anything else on the field.
     *
     * 2.2 AND 2.6, RAISED FROM 1.3 AND 1.5, AND HERE IS THE MEASUREMENT.
     * Projected through a real camera at 393x852, a player at 1.3 stood 9
     * pixels tall at the line of scrimmage and 2 in the near end zone, because
     * a 66 degree pitch views a standing figure almost end on. At 2.2 that
     * becomes 15 and 4, and the figure's WIDTH, which the pitch does not
     * foreshorten, goes from 12 pixels to 21.
     *
     * Width is why the number stops at 2.2 rather than climbing until the
     * height looks right. Reaching a comfortable 30 pixels of height would
     * take about 3.9, and a 6.8m player is taller than the goal post crossbar
     * and a third the width of the field. The rest of the legibility comes
     * from the ground markers below, which do not foreshorten at all.
     */
    figureScale: FIGURE_SCALE,
    ballScale: 2.6,

    /**
     * WHO IS WHO, AND IN WHAT COLOUR. ONE TABLE, TWO READERS.
     *
     * markers.js paints these onto the grass and hud.js paints them onto the
     * throw buttons, and the whole point of a receiver's letter is that the
     * button and the player agree. Two copies of this table would agree right
     * up until somebody edited one of them, so there is one.
     *
     * THE HUES ARE THE 2D GAME'S OWN, read off playbook.class.tsx where each
     * route is drawn: A is rgb(125, 0, 0), B is rgb(0, 0, 125), C is
     * rgb(125, 0, 125) and D is rgb(0, 125, 0). Those are chosen as dark ink on
     * a near-white diagram, so they are lifted here to sit on floodlit grass at
     * night and on a dark button, but the hue is unchanged. A receiver's disc,
     * their route on the playbook card and their throw button are all the same
     * colour, which is what makes "Throw B" mean something.
     */
    receivers: {
        wr1: { letter: 'A', ink: '#ff6a5e' },   // was 125, 0, 0
        wr2: { letter: 'B', ink: '#6d9cff' },   // was 0, 0, 125
        wr3: { letter: 'C', ink: '#e57bff' },   // was 125, 0, 125
        wr4: { letter: 'D', ink: '#5fd873' },   // was 0, 125, 0
    },

    /** The quarterback is the other thing a visitor presses, and an unmarked
     *  figure does not look pressable. */
    qb: { letter: 'Q', ink: '#ffd166' },

    /** The two kits, from the 2D game's own rgba(255,153,44) and
     *  rgba(155,207,255). Two hues rather than two values, which is what keeps
     *  them separable at 45m under floodlights (D23). */
    teamInk: { 0: '#ff992c', 1: '#9bcfff' },

    /**
     * HOW BIG A PLAYER IS TO THE PHYSICS, AND WHY IT IS NOT 1.
     *
     * `motion.js` hard-codes its collision half-extents in FIELD UNITS: 12
     * across and 10 downfield for a lineman, 6 and 5 for everybody else. Those
     * were tuned in the 2D game against a player drawn as a 20-unit letter, so
     * the collision box came out at roughly 0.6 of the drawn player. Two bodies
     * overlapped a little at the edges and nobody minded.
     *
     * `figureScale` broke that ratio without anybody noticing. The comment in
     * config's field block still reasons about "0.42m of radius against 0.33m
     * of half-width", and that comparison was made when a figure was life size.
     * At 2.2 a player is 1.45m across, so a receiver carries a 0.21m collision
     * radius inside a 0.73m half-width and the ratio is 0.29 rather than 0.6.
     * Figures walk through each other, which is exactly what the screenshots
     * show at the line of scrimmage and in every close replay.
     *
     * Scaling the radii by the same number the figures are scaled by restores
     * the 2D game's own ratio: a receiver goes to 0.46m against 0.73m, or 0.63.
     * NOTHING IN motion.js IS RETUNED BY HAND. It reads this one factor through
     * the settings object it is already handed, in the same way audio is
     * injected (D40), so the ported constants stay the constants the 2D game
     * wrote and there is one number to argue with.
     *
     * It tracks figureScale deliberately rather than being a free number: if a
     * future change makes the players smaller, the physics should follow them
     * without anybody having to remember. Give it its own value only if the
     * game ever wants collisions that deliberately disagree with what is drawn.
     */
    collisionScale: FIGURE_SCALE,

    /**
     * THE FLAT DISC UNDER EACH PLAYER (see markers.js for why it exists).
     *
     * Sizes are world metres, not intervals, because what matters is how many
     * pixels they cover and that is set by the camera rather than by the
     * field. A 0.6m radius measures 16 to 23 pixels everywhere on the field,
     * against a figure that swings between 2 and 21.
     */
    markers: {
        // The plain ring is deliberately the quieter of the two. Six linemen
        // stand shoulder to shoulder at the line of scrimmage, so anything
        // bigger or brighter merges into one orange puddle and the eye goes
        // to the wrong place. The lettered discs are the ones meant to be
        // read, and they are the ones a visitor presses.
        plainRadius: 0.55,      // the team-coloured ring under everybody
        namedRadius: 0.78,      // the lettered disc under a receiver or the QB
        plainOpacity: 0.42,
        namedOpacity: 0.92,
        lift: 0.035,            // above the turf and the painted lines
        /** The breath on a marker that can be tapped. The floor is how far
         *  down the pulse dips, so it never fades toward invisible. */
        pulseFloor: 0.55,
        pulseScale: 1.18,
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

        /**
         * THE LINE OF SCRIMMAGE, IN THE 2D GAME'S YELLOW.
         *
         * Every other line on this field is the same white, so from the play
         * camera there is nothing to say where the play starts. The 2D game
         * never had that problem: it paints the scrimmage line yellow and it is
         * the most useful mark on the screen.
         *
         * It lands on the first yard line at x = FIELD.lineInterval, which is
         * measured rather than assumed: lining up pass2, run3 and jumbo1 puts
         * the centre at exactly 200 field units and the rest of the line within
         * 5 either side. The 5-point threshold sits at 196 units, 14cm short of
         * it, so ONE painted line is both the scrimmage line and the first rung
         * of the scoring ladder, which is exactly what the 2D game shows.
         */
        scrimmage: '#f4d03f',
        scrimmageWidth: 0.22,       // metres of paint, wider than a yard line

        /**
         * THE SCORING LADDER, PAINTED ON THE GRASS.
         *
         * The 2D game writes "0 pts / 5 pts / 15 pts / 30 pts / 50 pts" along
         * the touchline, so a visitor always knows what the ball is worth right
         * now and how far the next rung is. Without them the 3D field is five
         * identical white stripes and the ladder has to live in prose on the
         * welcome card, which is a card nobody can see once the play starts
         * (D47 predicted exactly this).
         *
         * THEY ARE STRETCHED DOWNFIELD, and that is not decoration. The camera
         * pitches between 28 degrees on a wide screen and 68 on a phone, and a
         * numeral painted square on the turf loses its height to that rake: a
         * downfield length projects as sin(pitch), which is 0.47 at 28 degrees
         * and 0.87 at 60. Real fields stretch their numbers for the same reason
         * a road paints an elongated arrow. 1.6 is the middle of the range this
         * camera actually uses, so the numbers read as numbers at both ends of
         * it rather than being correct at one.
         *
         * THE POSITIONS ARE NOT WRITTEN DOWN HERE. field.js asks scoring.js for
         * the real thresholds, so the paint cannot claim a rung the arithmetic
         * does not award.
         */
        ladderInk: 'rgba(238, 242, 240, 0.5)',
        ladderHeight: 2.6,          // metres of numeral, across the field
        ladderStretch: 1.6,         // ...times taller downfield, for the rake
        ladderInset: 2.4,           // metres in from each touchline
    },

    /**
     * THE BAND THE BALL IS IN, LIT WHILE THE PLAY RUNS.
     *
     * The other half of what the 2D game's touchline labels do: the band the
     * carrier is standing in lights up, so "the farther you carry it the more
     * it is worth" is something a visitor watches happen rather than something
     * they were told once. Painted numerals alone say where the rungs are; this
     * says which one you are on.
     *
     * A SEPARATE MESH RATHER THAN A REPAINT. The markings are baked into one
     * 2048px canvas texture, and re-uploading that every time the carrier
     * crosses a line would be the most expensive thing in the frame. A single
     * translucent plane that moves is free.
     */
    band: {
        ink: 0xffb14a,
        opacity: 0.13,
        lift: 0.02,                 // above the turf, below the markers
        fade: 0.18,                 // seconds to cross-fade between bands
    },

    /**
     * THE SCOREBOARD BEYOND THE FAR END ZONE.
     *
     * IT IS THERE TO FILL A HOLE, and the hole is real: the play camera looks
     * downfield and slightly up, so the top quarter of every frame is empty
     * black above the far goal post. The 2D game fills the same strip with a
     * crowd, which was dropped (D8) and never replaced.
     *
     * A board rather than scenery, because it can do a job while it is there.
     * The score and the play count already live in the HUD, so this is not the
     * only place they are readable, which is what allows it to be small enough
     * to sit in the distance and be atmosphere rather than instrumentation.
     *
     * The stadium as a whole is deliberately unfinished (the night setting is
     * not settled), so nothing here tries to be the last word on how the far
     * end looks. It is a structure standing where a structure belongs.
     */
    scoreboard: {
        width: 13,
        height: 5.4,
        standHeight: 5.2,           // metres of post under the board
        beyond: 6.5,                // metres past the far end line
        face: '#0d1117',
        frame: 0x2b3342,
        ink: '#ffb14a',
        label: '#7f8a9c',
        textureWidth: 1024,
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
