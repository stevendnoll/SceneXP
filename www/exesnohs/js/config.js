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

/**
 * THE SPACE AROUND EACH PLAYER, IN FIELD UNITS, ADDED TO EVERY COLLISION BOX.
 *
 * A SCALE ALONE CANNOT PUT A BOX OUTSIDE ITS OWN BODY. The 2D game gives a
 * lineman twice the half-extent of everybody else, and every figure here is the
 * same size, so any multiplier that lifts a receiver's box out to his own
 * shoulders throws a lineman's out to twice that. `collisionScale` keeps the
 * ported RATIO and this sets the FLOOR. At 12 units, or 0.42m, a receiver's box
 * reaches 0.81m against a 0.73m half-width and a lineman's reaches 1.27m.
 *
 * IT HAS TO STAY LARGER THAN `separation`, and that is not a detail: a tackle
 * fires on box overlap, so holding bodies further apart than the boxes reach
 * would mean nobody could ever be brought down and no play would ever end.
 */
const COLLISION_PAD = 12;

const SIM = {
    lineInterval: 200,       // field units per interval. See above.
    segments: FIELD.segments,
    /**
     * THE GUTTER IS HOW FAR APART THE FORMATIONS STAND, and it was 5 because
     * that is what the 2D game used.
     *
     * Every lateral position in the 144KB formation library is a count of
     * these (D15 rewrote the last raw constants into exactly that shape), so
     * this one number is the designed spacing of both teams. At 5, with figures
     * drawn at 2.2 (see `figureScale`), TEN OF FOURTEEN players stood closer
     * than one body width from their nearest neighbour before the ball was even
     * snapped, and the closest pair was 0.53m apart inside bodies 1.45m across.
     * The library is right and the figures are big.
     *
     * 8 IS SAFE BECAUSE THE ROUTES DO NOT DERIVE FROM IT. `containerWidth()`
     * below inverts the routes' own lineInterval calculation, so widening the
     * gutter leaves the downfield spacing pinned to the painted yard lines.
     * Swept over all 190 combinations of ten offensive plays and nineteen
     * defences: the derived interval stays 7.000m at every value, nobody lands
     * outside a touchline, and the median nearest-neighbour gap goes from 0.89m
     * to 1.51m, which is just over a body.
     *
     * IT ALSO PULLS THE OUTERMOST PLAYERS IN, which sounds wrong and is what
     * makes this safe: `container.height` is `h - gutterY`, so a wider gutter
     * spreads the crowded middle while narrowing the extremes. The widest
     * player moved from 9.80m off centre to 9.38m against a 10.50m touchline.
     */
    gutter: 8,
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
        collisionPad: COLLISION_PAD,
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
     * THE BALL'S FLIGHT, AND THE UNIT ERROR THAT FLATTENED IT.
     *
     * `routes.getZIndex` returns a number that climbs 1, 1.5, 2 ... to a
     * ceiling of 7 and back down. The 2D renderer used it to SCALE a drawn
     * ellipse, which is how a flat plan view fakes height. view.js was handing
     * it to `simToWorld` as though 7 were seven field units, and seven field
     * units is 0.245 metres. Measured across a real throw, the entire arc was
     * 24 CENTIMETRES, and a `Math.max(p.y, 0.2)` floor then squeezed it to
     * four. That is both reported faults at once: the ball is not invisible in
     * the air, it is skimming the grass behind everybody's legs, and it does
     * not look like it travels in a straight line, it does.
     *
     * `apex` IS WHAT SEVEN MEANS IN METRES. About one and a half times a
     * player's height at this figure scale, which is what a thrown ball looks
     * like against people.
     *
     * `release` is where the arc starts and ends. Low, because the same value
     * has to leave a hand and then lie on the turf when nobody catches it.
     *
     * THE STAIRCASE BECOMES A PARABOLA WITHOUT MOVING A SINGLE FRAME, which
     * routes.js explicitly asks for: "keep its timing when the crude ramp is
     * eventually replaced by a real parabola, so catches land on the frame they
     * land on today". Normalising the index to u = (z - 1) / 6 gives a triangle
     * over the flight, u = 2p rising and 2(1 - p) falling. A real arc is
     * 4p(1 - p), and substituting gives 2u - u², or 1 - (1 - u)². So the shape
     * is a closed-form function of the index the simulation already produces,
     * every catch still lands on its own frame, and nothing in routes.js moved.
     */
    ball: {
        apex: 5.8,           // metres above `release` at the top of the arc
        /** The throw length, in metres, at which the arc reaches full height.
         *  Below it the apex scales down, so a flick stays a bullet. Measured
         *  against the library: passes run 1.5m to 13.5m, median 7.2m. */
        fullArcAt: 12,
        release: 0.28,       // metres, where the arc starts, ends and rests
        indexFloor: 1,       // getZIndex at rest
        indexCeil: 7,        // ...and at the top, which it clamps to
        /** Seconds to ease the height toward its target. The index steps in
         *  halves at 45Hz, so without this the ball climbs in visible stairs. */
        smooth: 0.06,
    },

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
    collisionPad: COLLISION_PAD,

    /**
     * HOW CLOSE TWO BODIES MAY EVER GET, IN METRES, AND WHY IT IS NOT THE
     * COLLISION RADIUS.
     *
     * `motion.checkCollisions` detects an overlap and responds by DAMPING
     * SPEED. It never resolves the overlap it just found, and the route that
     * owns the player re-accelerates him at his target on the very next frame,
     * so two figures settle happily inside one another. Measured over 400
     * plays, players reached 0.01m apart at EVERY collision radius from 0.46m
     * to 1.5m, which is what proves the radius was never the lever on its own.
     * `play.separate` is the missing half: it pushes bodies apart once
     * everybody has moved.
     *
     * 1.45m IS EXACTLY ONE BODY WIDTH (1.75 x 0.38 x 2.2), so figures come to
     * rest touching rather than overlapping.
     *
     * WHAT THE PAIR OF THEM BUYS IS BLOCKING. A blocker whose engagement zone
     * is smaller than his own body is a blocker a defender walks through, so
     * the line never visibly holds anybody up and the offense rallying in front
     * of a carrier, which is most of what makes a short pass worth watching,
     * does not happen. Measured against the old behaviour: bodies went from
     * 0.01m apart to 1.22m, interceptions fell from 13% to 2%, which is roughly
     * where the real game sits, and mean points rose from 8.1 to 9.8.
     *
     * THE COST IS A LONGER TAIL, and it was checked rather than assumed. Plays
     * running past the twelve second backstop went from 0.5% to 7%. Every one
     * of those scored, mean 26 points: they are long runs behind blockers,
     * which is the thing this was built for, so the backstop stays at twelve.
     */
    separation: 1.45,

    /**
     * TWO PASSES ON LINE-UP AND ONE PER TICK, and the asymmetry is measured.
     *
     * A single pass resolves half the shortfall between each pair, so it
     * reaches equilibrium short of what it asked for. At line-up, where nothing
     * is pushing back, two passes reach 1.51m against one pass's 0.86m. During
     * a play the opposite holds: one pass beats two on every measure, because
     * two over-correct against routes that push back the next frame and the
     * churn costs more than it buys.
     */
    separationPasses: { lineUp: 2, live: 1 },

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

    /**
     * HOW A PLAYER STANDS, RUNS, CARRIES AND BLOCKS.
     *
     * THE THREE CARRIES ARE THE 2D GAME'S OWN, read off `drawFrame` in
     * exes-and-ohs.class.tsx, which picks between them by DRAW ORDER:
     *
     *   qb, hasBall, !state.run   ball drawn AFTER the player, on top of him
     *   qb, hasBall,  state.run   ball drawn BEFORE, underneath him
     *   anyone else with the ball  drawn before, offset to (x + 4, y + 8)
     *
     * On a flat plan view, drawing the ball over the player is how you say it
     * is held UP, and drawing it under him is how you say it is tucked away.
     * So the original already distinguished a quarterback surveying the field
     * from a quarterback running with it, and a receiver carrying it at his
     * hip. In 3D those become an actual cocked arm, an actual tuck, and an
     * actual hip. `state.run` is the same flag, and `keepAndRun` already sets
     * it. Nothing here is invented (D29).
     *
     * Offsets are in FIGURE-LOCAL units and multiplied by `figureScale`, so a
     * bigger player holds the ball further from his own spine rather than
     * inside it. `right` is toward the throwing hand, `up` is up, `ahead` is
     * the way he is facing.
     *
     * Angles are radians on the shoulder pivot. NEGATIVE rotation.x IS FORWARD:
     * the arm group hangs down local -Y, and rotating about +X carries it to
     * -Z while the rig faces +Z. Worked out from the axes rather than guessed,
     * because guessing it produces a player throwing over his own back.
     */
    pose: {
        /** Cap on the stride swing, radians at the shoulder. */
        armSwing: 0.55,
        /**
         * STRIDE ADVANCES WITH DISTANCE COVERED, IN RADIANS PER METRE, and the
         * old version only claimed to. It read the simulation's `xSpeed` and
         * `ySpeed` fields and advanced ONCE PER RENDERED FRAME, which is wrong
         * twice over. Per frame means a 120Hz display swings the arms twice as
         * fast as a 60Hz one for the same run. And reading the speed FIELD
         * rather than measuring the movement means the arms keep swinging after
         * the whistle: the simulation simply stops ticking, so nothing zeroes
         * those fields, and measured at the whistle FOURTEEN OF FIFTEEN players
         * still carry a speed above the stride deadzone while standing
         * perfectly still. The quarterback sits at 3.32.
         *
         * Distance is frame-rate independent for free, and a player who is not
         * moving covers no distance, so both faults close together.
         *
         * 1.4 rad/m puts a sprinting figure at about 1.7 arm cycles a second.
         * A real sprinter is nearer 2.2, but these figures are 2.2 times life
         * size and a giant taking normal-length steps reads as scurrying.
         */
        stridePerMetre: 1.4,
        /** Metres per second at which the swing reaches full amplitude. */
        fullEffort: 7.5,
        /** Below this, in m/s, a player is standing and the arms settle. */
        stillSpeed: 0.35,
        /** Seconds for a pose to blend in or out. Nothing snaps. */
        blend: 0.12,

        /**
         * SECONDS OF SMOOTHING ON THE MEASURED SPEED, AND WHY IT IS NOT ZERO.
         *
         * Distance covered is exact and needs no smoothing, but SPEED is that
         * distance divided by a frame, and the frames do not all contain a
         * simulation step: `simHz` runs on a fixed clock while the view runs
         * once per rendered frame, so a 60Hz display sees no step on a quarter
         * of its frames and a 120Hz display on three fifths of them. Those
         * frames measure a dead stop. Fed straight to the swing amplitude, the
         * arms collapsed and sprang back forty times a second, which is what
         * "very glitchy" was.
         *
         * A tenth of a second bridges two missing steps at 120Hz and is still
         * short enough that a player who stops drops his arms within a stride.
         */
        speedSmooth: 0.10,

        /**
         * AND SECONDS OF SMOOTHING ON THE DRAWN POSITION ITSELF.
         *
         * The same mismatch, one level up. Figures were placed straight from
         * the simulation, so at 45Hz on a 120Hz display every position held for
         * two or three frames and then jumped: motion that is correct and looks
         * like a slideshow. Easing the drawn position toward the simulated one
         * turns a stepped 60Hz feed into continuous movement at any display
         * rate, for about fifty milliseconds of lag that nobody can see from
         * sixty metres up.
         *
         * IT IS ALSO WHAT THE STRIDE IS MEASURED FROM, deliberately, so the
         * legs and arms are driven by the motion actually on screen rather than
         * by a position the figure has not reached yet.
         */
        motionSmooth: 0.05,

        /**
         * WHERE THE HAND ACTUALLY ENDS UP, DERIVED FROM THE SHARED RIG.
         *
         * people-1.0.0 puts the shoulder pivot at `legLength + torsoHeight -
         * 0.05`, which is 1.25, hangs the hand `armLength + 0.02` below it at
         * 0.57, and centres the head at 1.62. So rotating the shoulder by x
         * puts the hand at y = 1.25 - 0.57·cos(x) and z = -0.57·sin(x).
         *
         * That arithmetic is the whole reason these angles are what they are.
         * An arm cocked at 1.15 radians, which sounds like a lot, leaves the
         * hand at y = 1.02 and BELOW the shoulder: a man holding a ball against
         * his chest. Past a right angle it swings above the shoulder, and at
         * 2.15 the hand reaches y = 1.56 and 0.47 behind, which is beside the
         * ear with the ball behind the head. That is the pose.
         *
         * The ball offsets below are simply where that hand is, so the ball is
         * never floating next to a hand that is somewhere else.
         */
        /**
         * THESE ANGLES WERE SOLVED, NOT CHOSEN, and they could not have been
         * chosen because the arm now has TWO joints.
         *
         * people-1.0.0 gained an elbow, so a pose is a shoulder in two axes and
         * a forearm in one, and where the hand ends up is the composition of
         * all three. Searching that by eye is hopeless, and the previous
         * single-joint version is why: with only a shoulder, the only way to
         * get a hand up beside the ear is to swing the whole straight limb back
         * over the shoulder, which reads as a javelin thrower rather than a
         * quarterback.
         *
         * Forward kinematics, written out and searched. The shoulder sits at
         * (0.2125, 1.25), the upper arm is 0.275 to the elbow and the forearm
         * and hand 0.295 beyond it, and the forearm group inherits the
         * shoulder's rotation, so the hand lands at
         *
         *     Rx(armX)·Rz(armZ)·[0,-1,0]·0.275   +
         *     Rx(armX)·Rz(armZ)·Rx(foreX)·[0,-1,0]·0.295
         *
         * THE ELBOW FOLDS ON A POSITIVE foreX, which is the opposite of what it
         * looks like it should do and cost a whole search to find: the first
         * sweep only looked at negative values and reported that the target was
         * unreachable by a quarter of a metre.
         */
        /** Surveying the field. Elbow up and back at (0.25, 1.36, -0.25), hand
         *  beside the ear at (0.26, 1.65, -0.19), 78 degrees of elbow. */
        throwHold: {
            ball: { right: 0.25, up: 1.64, ahead: -0.16 },
            armX: 1.99,          // positive is back, and past 90 degrees is up
            armZ: 0.15,          // a little out, so the elbow clears the ribs
            foreX: 1.36,         // and folded, which is what a cocked arm is
            offX: -0.45,         // the off arm points forward, across the body
            offZ: 0.26,
            offFore: 0.85,       // and is bent, because a straight one is a plank
        },
        /** Tucked and running, for the quarterback or anyone who caught it.
         *  The hand comes to (0.09, 0.78, -0.07), which is across the body at
         *  the hip, and the ball rides in the crook just above it. */
        tuck: {
            // Cradled just above and inside the hand, against the ribs, which
            // is where the solved pose actually puts it (0.09, 0.78, -0.07).
            ball: { right: 0.13, up: 0.86, ahead: 0.00 },
            armX: -0.45,         // forward
            armZ: -0.30,         // in, toward the chest
            foreX: 1.10,         // folded across the ball
        },
        /**
         * The release. The shoulder sweeps from `throwHold` to this over
         * `time` while the elbow STRAIGHTENS, which is what a throw is: the
         * hand finishes at (0.30, 0.99, 0.50), forward and down, a follow
         * through rather than an arm that stopped where the ball left it.
         */
        throwRelease: { armX: -1.20, foreX: 0.20, time: 0.34 },

        /**
         * GOING IN FOR THE TACKLE. Both arms out and low, reaching around the
         * carrier rather than up at him, and the whole body pitched forward.
         *
         * The rig has no waist (its own note says so), so the lean is the whole
         * figure rotating about its feet, which is what a diving tackle looks
         * like anyway. It is applied on the LOCAL x axis after the yaw, so it
         * has to be an Euler order of YXZ or a defender facing across the field
         * tips sideways instead of forward.
         */
        tackle: {
            reach: 2.2,          // metres to the carrier before he commits
            armX: -1.05,
            armZ: 0.34,
            foreX: 0.45,
            lean: 0.34,          // radians of forward pitch, whole figure
        },
        /** And the carrier, going down. Pitched back rather than forward, and
         *  only once the simulation says contact has actually started. */
        tackled: { lean: -0.26 },

        /**
         * BLOCKING: BOTH ARMS OUT AT THE MAN IN FRONT.
         *
         * There is no blocking flag in the ported simulation, so this is
         * derived in the view: a lineman with an opponent inside `reach` is
         * engaged. That is what the position group is FOR, and it is the whole
         * visible content of a running play, so inferring it is worth more than
         * waiting for the simulation to say so.
         */
        block: {
            reach: 2.6,          // metres to the nearest opponent
            /**
             * -0.95, PULLED BACK FROM -1.30, AND THE LIMIT IS THE RIG.
             *
             * The shared figure's shoulder is a ball of radius `armRadius *
             * 1.15` sitting in a flat-sided torso, which is enough to cover the
             * stride's half-radian swing and not much more. At -1.30 the upper
             * arm is 75 degrees off the body and clears the shoulder entirely,
             * so the arm reads as a detached stick floating beside the player.
             * That is most of what the screenshots show as glitchy arms.
             *
             * Under a radian the joint stays covered, and 0.95 is still an
             * unmistakable reach: the hand comes forward 0.46 of the rig's own
             * height, which at this figure scale is most of a metre.
             */
            armX: -0.95,         // forward, arms extended
            armZ: 0.22,          // slightly out, to fill a gap
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
        /**
         * A SCOREBOARD IS LAMPS BEHIND A DARK PANEL, not orange type on slate.
         *
         * The first pass borrowed the HUD's amber, which is the colour of an
         * interface element and reads as one: flat, evenly lit, the same amber
         * as the buttons at the bottom of the screen. A real board is a grid of
         * bulbs, so the numerals are near-white at the centre with the colour
         * in the GLOW around them, the panel behind is almost black, and the
         * labels are dim because nobody is meant to read them twice.
         */
        face: '#05070b',
        frame: 0x2b3342,
        ink: '#fff3d0',          // the lamps themselves, hot and nearly white
        glow: '#ffa22a',         // and what they throw onto the panel
        label: '#6f7d93',
        rule: 'rgba(255, 255, 255, 0.07)',
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
     *
     * BACK TO 60, AND THE PARAGRAPH ABOVE IS WHY IT IS SAFE NOW. It was written
     * against a 50m field, and the field is 35m (D54), so its own reasoning no
     * longer applies to the number it produced.
     *
     * WHAT MAKES IT NECESSARY IS `figureScale` AGAIN. Measured, the fastest
     * anybody moved at 45Hz was 5.35 m/s, which sounds brisk until it is
     * measured against the player rather than the pitch: a figure is drawn at
     * 2.2 times life size, so 3.85m tall, and 5.35 m/s is 1.4 BODY-HEIGHTS PER
     * SECOND. A real sprinter covers about 5.5. The figures grew and the clock
     * did not, which is the same oversight as the collision radii and the
     * replay camera heights.
     *
     * 60 takes it to 7.1 m/s, or 1.85 body-heights, and crosses the field in
     * 4.9 seconds. Matching a real sprinter's APPARENT speed would need 21 m/s
     * and a field crossed in a second and a half, which is not a game anybody
     * can watch, so this is a deliberate compromise rather than a fix.
     *
     * AND THEN 80, BECAUSE 60 WAS STILL REPORTED AS TOO SLOW. That is the third
     * time this number has moved and the reason has been the same every time,
     * so it is worth stating plainly: the figures are 2.2 times life size and
     * every judgement about speed is made against THEM, not against the pitch.
     *
     *     45   5.0 m/s   1.31 body-heights/s   crosses in 7.0s
     *     60   7.1 m/s   1.85                  4.9s
     *     72   8.6 m/s   2.22                  4.1s
     *     80   9.5 m/s   2.47                  3.7s
     *     90  10.7 m/s   2.78                  3.3s
     *
     * 80 is where it stops being a compromise and starts being a choice. It is
     * still under half a real sprinter's apparent pace, and 3.7 seconds is the
     * shortest a whole-field run can be and still be followed by an eye that
     * has to find the ball first. Past 90 the play is over before the frame is
     * read, which is the fault the original note at 45 was guarding against and
     * was right about, on a field half as long again.
     */
    simHz: 80,

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
