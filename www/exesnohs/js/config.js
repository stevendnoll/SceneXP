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

/**
 * HOW MUCH OF HIS OWN DOUBLE-SIZED BOX AN OFFENSIVE LINEMAN KEEPS.
 *
 * The 2D game gives a lineman half-extents of 12 by 10 against everybody else's
 * 6 by 5: exactly twice the man, which is what makes a line hold. QA round
 * twenty-four says it holds TOO WELL, with a blitzer never really reaching the
 * quarterback.
 *
 * IT IS THE LINEMAN'S OWN DOUBLING AND NOTHING ELSE, which is what the request
 * asked for. `collisionScale` corrects every box on the field for a figure
 * drawn at 2.2 times life size and must not move: shrinking that to loosen the
 * line would walk receivers and defenders through each other again.
 *
 * Measured over 612 plays, and the line is a REAL limiter rather than the whole
 * story. At 1.00 the keenest rusher closes 3.59m and stops 4.54m short; at 0.85
 * he gets a third of a metre further in and the share of plays where somebody
 * reaches the pocket goes 29% to 35%. Nothing else moves: completions 60% to
 * 59%, sacks 1% either way.
 *
 *     lineman box   rushers closing 2m+   the keenest closed   ...stopping at
 *         1.00           0.97 a play            3.59m              4.54m
 *         0.85           1.27 a play            4.36m              4.07m
 *         0.60           1.40 a play            4.74m              3.80m
 *
 * It is deliberately a SLIGHT cut, as asked. Most of the four metres a blitzer
 * still finishes short is not the line at all, and shrinking this far enough to
 * close it would let defenders through the middle of the line rather than round
 * it (see TASKS D171, still open).
 */
const LINEMAN_SCALE = 0.85;

/**
 * HOW MUCH OF A BLITZER'S DRIVE SURVIVES CONTACT WITH A BLOCKER.
 *
 * QA ROUND TWENTY-FIVE, AND THE WALL WAS NEVER A BOX SIZE. The four collision
 * responders in motion.js treat a blocker and a defender completely
 * differently: the blocker is set to 40% of his own TOP speed and then bodily
 * DISPLACES the other man after zeroing his speed, while the defender, on his
 * own pass through the same pair, merely keeps a fifth of whatever he had. A
 * blocker shoves; a rusher had no way to shed. That is the 2D game's own
 * arithmetic and it is exactly why blocking works for the run, which is the
 * half worth keeping.
 *
 * SCOPED TO THE POCKET, which is the whole design. A blitz route runs at
 * whoever has the ball, so on a running play a shedding blitzer sheds the
 * blocks in front of the CARRIER: measured that way the run game lost 18% of
 * its points, 17.5 a play down to 14.3 with the screen from 28.2 to 21.1.
 * Those are the plays this game is really about. Held to pass protection, the
 * run game does not move at all: 17.5 to 17.8.
 *
 * WHAT IT BUYS IS A CLOCK ON THE POCKET, which the game did not have. Holding
 * the ball used to be free. Over 323 plays at each hold:
 *
 *     held for        1.0s   1.8s   2.6s   3.4s
 *     as it was         0%     1%     3%     5%   sacked
 *     shed 0.75         0%     2%    10%    19%
 *     shed 1.00         0%     8%    24%    37%
 *
 * 0.75, because a quick throw stays free and dawdling costs something, and
 * because 1.00 collapses the pocket: points per play fall from 10.4 to 5.5 and
 * the quarterback is on his back a third of the time. Completions do not move
 * at any of these, 63% to 67%.
 */
const RUSH_SHED = 0.75;

/**
 * HOW BIG A CATCH IS, AND IT IS THE SAME OVERSIGHT `collisionScale` FIXED.
 *
 * `motion.checkCatch` builds its own boxes by hand and was never given the
 * treatment the collision boxes got: five units either side of the ball against
 * eleven by eighteen around the player, all measured for a player DRAWN AS A
 * 20-UNIT LETTER. At `figureScale` 2.2 the figure on screen is 1.45m across and
 * the part of him that can catch is 0.385m, so he can stand squarely under the
 * ball with three quarters of himself outside his own hands. QA reported it as
 * "a lot of passes falling incomplete", and it is not the ported routes: the
 * throw is aimed correctly and the receiver gets there.
 *
 * MEASURED OVER 1,224 THROWS, which is all 17 plays against six defensive
 * formations at three release times to each of four receivers. Completions:
 *
 *     1.0   49.8%     the port, and what QA was playing
 *     1.4   59.4%
 *     1.7   65.7%
 *     1.9   67.8%
 *     2.2   77.7%
 *
 * 1.9 lands just above a real completion rate, which is around 65%, and it is
 * where the curve starts to flatten. It is deliberately NOT tied to
 * `figureScale` the way `collisionScale` is, because this one is a difficulty
 * knob as well as a fidelity fix and it should be turnable without moving the
 * physics.
 */
const CATCH_SCALE = 1.9;

/**
 * ...AND HOW MUCH OF IT A DEFENDER GETS, WHICH IS LESS.
 *
 * Widening the catch hands the same reach to the secondary, and an interception
 * is the harshest outcome on the ladder at minus ten. Measured over the same
 * 1,224 throws at a catch scale of 1.9, interceptions run:
 *
 *     share 1.0   17.9%     both boxes widened together
 *     share 0.7   15.0%
 *     share 0.55  10.6%
 *     share 0.4    8.3%     the port's own rate is 8.5%
 *
 * QA asked for more catches, not more turnovers, so this is set where the
 * turnover rate is the one the game already had. It does mean a defender's box
 * finishes at 0.76 of the ported one, which is a deliberate trade and is
 * written down rather than hidden: the receiver gets the body he is drawn with
 * and the defender keeps the reach the 2D game gave him.
 */
const INTERCEPT_SHARE = 0.40;

/**
 * HOW FAR A LEAPING RECEIVER REACHES, IN METRES, and it is deliberately the
 * SAME NUMBER `pose.jump.range` uses to decide he may jump at all.
 *
 * That is the whole point of it. The view lets him leave his feet when the ball
 * is within this distance and over his hands; the catch then honours exactly
 * that promise, rather than measuring him again with a box drawn for a
 * letterform. Measured, a jump that ends in no catch has the ball a median of
 * 0.45m away, which is well inside it.
 *
 * It lives up here rather than inside `pose` because `formationSettings` has to
 * hand it to the ported physics and `pose` is the drawing half.
 */
const JUMP_RANGE = 1.5;

/**
 * A SHORT PASS AND A HAIL MARY ARE NOT THE SAME EVENT.
 *
 * `CATCH_SCALE` was one number for every throw, so widening it to stop short
 * passes falling incomplete widened the deep ball by exactly as much. Measured
 * by throw length before this:
 *
 *     0-8m     87% caught,  1% intercepted, 16% scored fifty
 *     8-14m    81%,         3%,              5%
 *     14-20m   74%,         8%,              7%
 *     20-26m   74%,        14%,             11%
 *     26m+     52%,        21%,             27%
 *
 * A bomb completing over half the time and scoring fifty on a quarter of
 * attempts makes it the obvious play, and this game is meant to be WATCHED: the
 * pleasure is a short pass that turns into a run nobody can predict, not one
 * answer repeated ten times.
 *
 * So the catch now falls off with the length of the throw. Below `near`
 * nothing changes, which leaves the short game exactly where it was tuned. From
 * there the receiver's box shrinks toward `farScale` and, on the same ramp, the
 * defender's share of it rises to a full share, because a ball hanging in the
 * air that long is one a defender has time to get under.
 */
const CATCH_NEAR = 14;     // metres: below this a throw is unchanged
const CATCH_FAR = 30;      // ...and at this it is as hard as it gets
const CATCH_FAR_SCALE = 0.42;   // what the receiver's box is multiplied by there

/**
 * HOW CLOSE TO HIS LINE COUNTS AS ON IT, IN METRES.
 *
 * THE PORTED STEER HAS NO THIRD BRANCH. Every route holds a player on a line by
 * accelerating one way when he is below it and the other way when he is above
 * it, and nothing anywhere decelerates. That is an undamped oscillator: the
 * acceleration always opposes the displacement and no term ever removes energy,
 * so whatever lateral speed a man carries when he first crosses his line he
 * keeps for the whole play. Measured on the steering law alone, a receiver on a
 * straight go route who arrives on his line at top speed oscillates across it
 * at TOP SPEED, reversing every 11 frames, forever.
 *
 * That is both of the faults reported on 2026-09-11. The visible one is the
 * squiggle. The expensive one is that `generateBallObject` leads a pass off the
 * receiver's ySpeed at the instant of the tap, times as much as 45, so the same
 * man on the same straight route is led anywhere from 0.08m to 3.78m sideways
 * depending on which frame of the cycle the visitor pressed.
 *
 * 0.15m IS ABOUT A FIFTH OF A BODY WIDTH, so a man held inside it is running a
 * line nobody can see a kink in, and it is wider than the 0.22m peak-to-peak the
 * undamped cycle reached, which is what lets him settle rather than skim the
 * edge of the band. Inside it the steer bleeds lateral speed at `decel` (1.5
 * against an accel of 0.4), so he is straight within three units of entering.
 *
 * SET IT TO 0 TO GET THE 2D GAME BACK EXACTLY, which is what motion.js defaults
 * to for any caller that does not mention it.
 */
const STEER_DEADBAND = 0.15;

/**
 * ...AND HOW LONG A HEADING IS AVERAGED OVER BEFORE A PASS IS LED OFF IT.
 *
 * THE SECOND HALF OF THE SAME FAULT, and it is kept as its own number because
 * it is its own question. Damping the steer removes the wobble at source, but
 * the throw would still be leading off a SINGLE FRAME of a receiver's velocity,
 * and a single frame is the wrong thing to ask either way: a man cutting has a
 * different velocity every frame and the one the visitor happened to tap on is
 * not the direction he is going.
 *
 * 0.15s IS ONE FULL CYCLE OF THE UNDAMPED WOBBLE at simHz 80, deliberately. An
 * average over exactly one period of a square wave is zero, so even with the
 * deadband turned off a straight runner leads at nothing, which is the right
 * answer. A man genuinely crossing the field averages his real crossing speed
 * and is still led properly, half a frame-window late.
 *
 * See `state.heading` in play.js, which is where it is measured.
 */
const LEAD_WINDOW = 0.15;

/** The fraction a team's speed and acceleration move at full difficulty. Up
 *  here because `formationSettings` has to hand it to the ported formations
 *  class. See `difficulty` in the config below for what it means. */
const DIFFICULTY_SWING = 0.10;

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
    gutter: 5,

    /**
     * HOW WIDE A PLAYER IS, IN METRES BEFORE `figureScale`.
     *
     * people-1.0.0 builds a torso 0.38 across and hangs an arm off each side,
     * which comes to 0.505 shoulder to shoulder. Kept here rather than read off
     * a figure because `play.keepInbounds` is simulation and must not reach
     * into a Three module to find out how big somebody is drawn.
     *
     * IT EXISTS BECAUSE THE TOUCHLINE DID NOT KNOW. The wall clamped a
     * COORDINATE, so a man came to rest with his centre exactly on the paint
     * and three quarters of a metre of himself beyond it. That is the
     * quarterback QA watched run off the side of the field, and he never
     * actually left it.
     */
    bodyWidth: 0.505,
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
        linemanScale: LINEMAN_SCALE,
        rushShed: RUSH_SHED,
        catchScale: CATCH_SCALE,
        interceptShare: INTERCEPT_SHARE,
        // How far a man in the air reaches, in FIELD UNITS, which is the same
        // distance the view required before it let him leave the ground. See
        // `pose.jump.range` and the note on `airborneReach` in motion.js.
        airborneReach: JUMP_RANGE / UNITS_TO_METRES,
        catchNear: CATCH_NEAR / UNITS_TO_METRES,
        catchFar: CATCH_FAR / UNITS_TO_METRES,
        catchFarScale: CATCH_FAR_SCALE,
        // How close to his line counts as on it, in FIELD UNITS. See
        // `steerDeadband` in motion.js for what the ported steer does without
        // it, and `STEER_DEADBAND` above for why this is the value.
        steerDeadband: STEER_DEADBAND / UNITS_TO_METRES,
        /** How hard the game is leaning right now, -1 to +1, written by
         *  `play.setDifficulty` before each line-up. See `difficulty` below. */
        difficulty: 0,
        difficultySwing: DIFFICULTY_SWING,
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
        /**
         * Metres of grass that must stay visible beyond each sideline.
         *
         * 0.6, DOWN FROM 1.05, alongside `nearBehind` and `farBeyond`. The
         * painted surface already carries 1.55m of grass outside each
         * touchline, so this is a margin on top of a margin, and QA asked for
         * the field rather than the stadium. It stays above zero because a
         * touchline running exactly along the edge of the screen reads as the
         * field having been cropped rather than framed.
         */
        sideMargin: 0.6,

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
            /**
             * METRES OF GROUND THE FRAME MUST KEEP BEYOND EACH END LINE.
             *
             * HALVED FROM 1, WHICH IS THE SMALL HALF OF QA ITEM 4. It is a
             * comfort margin so the turf does not end exactly at the edge of
             * the screen, and a metre of it at each end is a metre of stadium
             * nobody asked for. Measured, the pair of them plus `sideMargin`
             * are worth about three points of screen coverage between them,
             * which is real but is not where the space was going.
             */
            nearBehind: 0.5,  // metres of ground visible behind the near end line
            farBeyond: 0.5,   // and past the far one
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
            /**
             * 18, DOWN FROM 28, AND THIS IS WHERE THE SCREEN WAS GOING.
             *
             * QA ITEM 4: too much stadium, not enough field. Projected through
             * the real camera at 1196x826, the turf covered 79% of the width
             * and 72% of the height, so nearly half the screen was not the
             * game.
             *
             * The instinct is to steepen the shot, and it is wrong. Measured,
             * forcing the frame's far edge down to the end line takes the
             * height from 72% to 88% and the WIDTH from 79% to 43%, because a
             * steeper camera sits further away from everything: the field's
             * area on screen falls from 57% to 38%. It looks better on one axis
             * and is worse overall.
             *
             * What was actually binding is this floor. A 28 degree lens from
             * 29m is a wide shot with a lot of perspective divergence, so the
             * far end of the field shrinks away from the near end and the
             * rectangle cannot fill a rectangle. A LONGER lens from further
             * back flattens that convergence, and the field fills more of the
             * frame while every player gets BIGGER rather than smaller:
             *
             *     minFov   fov  height   area   player px
             *       28      28    29m     57%      48
             *       20      20    36m     64%      54
             *       18      18    39m     65%      55
             *       16      16    43m     66%      57
             *
             * 18 is where it flattens off. The chosen PITCH is unchanged at 28
             * degrees on every landscape shape, so the rake and the character
             * of the shot are the same: it is the same view through a longer
             * lens from further away, which is also what a real broadcast
             * camera is.
             *
             * Portrait is untouched by this. There the width is binding, the
             * solve picks a 51 degree lens at 68 degrees of pitch whatever this
             * says, and it gains only from the margins above.
             */
            minFov: 18,
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

            /**
             * WHICH SHOULDER THE CAMERA ORBITS FROM, AND WHY IT NOW HAS A
             * MEMORY.
             *
             * The shot rounds the near shoulder when the carrier is on the far
             * touchline and the far one when he is near, so the arc always
             * crosses the middle of the field. That choice was
             * `focus.z > 0 ? -1 : 1`, read fresh every frame, so it SWAPPED
             * SIDES the instant a carrier crossed the middle of the field, and
             * a swap is an immediate 180 degree jump of the whole orbit.
             *
             * Measured over 102 recorded plays: a mean of 1.6 swaps per replay,
             * a worst case of 16, and 137 of the 160 arriving less than a second
             * after the previous one. A carrier running anywhere near the middle
             * makes the sign of his own z chatter, and the camera chattered with
             * it. QA called it flickering, which is exactly what it is.
             *
             * Three things fix it and all three are needed. A DEAD BAND, so a
             * carrier has to be properly on the other half before the question
             * is even asked. A HOLD, so the answer cannot change more often than
             * QA asked for. And an EASE, so when it does change the camera swings
             * across the middle rather than cutting, which is the shot the
             * original comment was describing in the first place.
             */
            shoulderSwap: 3.0,       // metres off centre before the other side counts
            shoulderHold: 4.0,       // ...and seconds before it may change again
            shoulderEase: 1.2,       // seconds to swing across, rather than cut
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
     * THE X AND THE O ON THE SHIRT, WHICH IS WHAT THE GAME IS CALLED.
     *
     * Drawn as GEOMETRY rather than as a texture, and that is a deliberate
     * choice rather than a convenience. A canvas texture needs a font, needs a
     * UV layout on a torso that is an extruded rounded profile rather than a
     * box, and costs a texture upload per kit. Two crossed bars and a flat
     * ring need none of those, stay crisp at every distance the camera ever
     * reaches, and are interned by `shareGeometryAndMaterials` like everything
     * else on the roster, so seventeen players cost two geometries.
     *
     * SIZED AS FRACTIONS OF THE TORSO THAT IS ACTUALLY THERE, never as
     * metres. Linemen are built `muscular`, which is 30% wider and 18% deeper
     * than everybody else, and a mark written in absolute numbers would be a
     * different size on them. `height` is the fraction of the torso's own
     * height: 0.55 puts a mark a little over half the shirt, which is the
     * "at least half" a real number on a real jersey occupies.
     */
    jersey: {
        height: 0.55,       // of the torso's height
        width: 0.62,        // of the torso's width
        stroke: 0.15,       // of the mark's own height
        /** How far clear of the shirt the mark floats, as a fraction of the
         *  torso's depth. Enough to clear the extruded bevel on the front face
         *  without reading as a sticker held off the chest. */
        lift: 0.10,
        colour: 0xffffff,
        /** A little glow, because this field is lit by four floodlights and a
         *  white mark on the shaded side of a player is otherwise the same
         *  value as the shirt it is on. */
        glow: 0.35,
    },

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
     * `release` IS WHERE A HAND IS, AND IT USED TO BE WHERE THE GRASS IS.
     *
     * One number was doing two jobs, and the note here said so outright: "low,
     * because the same value has to leave a hand and then lie on the turf when
     * nobody catches it". A hand is 3.5m up at this figure scale and the turf is
     * 0.36m, so at 0.28 every pass was drawn LEAVING the quarterback's hand at
     * shoelace height and ARRIVING at the receiver's feet.
     *
     * Measured over 612 throws, at the frame a receiver is closest to the ball
     * it is a median 0.60m off the ground on a catch, against figures 3.85m
     * tall. That is a ball caught below the knee, every time, and it is why
     * catches never looked like catches.
     *
     * The two jobs are already separate in the code and nobody noticed:
     * `view.landingHeight` computes the resting height itself, as
     * `BALL_FAT * ballScale`, and eases an uncaught ball down to it. So this
     * value never had to describe the turf at all. It is now the height a ball
     * leaves a hand at and arrives at a pair of hands at, which is what an arc
     * that starts and ends at the same height means.
     *
     * `apex` came down with it, from 5.8, so the peak over the GROUND is
     * unchanged: it was 6.08m and is now 6.4m, or about 1.7 times a player.
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
        apex: 3.4,           // metres above `release` at the top of the arc
        /** The throw length, in metres, at which the arc reaches full height.
         *  Below it the apex scales down, so a flick stays a bullet. Measured
         *  against the library: passes run 1.5m to 13.5m, median 7.2m. */
        fullArcAt: 12,
        release: 3.0,        // metres: hand height, where the arc starts and ends
        indexFloor: 1,       // getZIndex at rest
        indexCeil: 7,        // ...and at the top, which it clamps to
        /** Seconds to ease the height toward its target. The index steps in
         *  halves at 45Hz, so without this the ball climbs in visible stairs. */
        smooth: 0.06,

        /**
         * AND WHAT IT DOES WHEN NOBODY CATCHES IT, which is QA item 6.
         *
         * Nothing, until now. The flight ended and the ball stopped, holding
         * whatever attitude its last measured movement gave it, which on the
         * way down is nearly vertical, and holding its spiral, which never
         * stops on its own. So an incomplete pass finished as a football
         * balanced on its nose in mid-air, turning: reported exactly that way.
         *
         * `stillStep` and `stillFor` are how the landing is DETECTED rather
         * than announced, which is the same trick the throw release uses (D90)
         * and works unchanged in a replay. Nothing in the simulation says the
         * ball has arrived; it simply stops covering ground, because the
         * whistle has gone and nothing is ticking it any more.
         */
        landing: {
            stillStep: 0.02,   // metres a frame, under which it is not moving
            stillFor: 0.07,    // seconds of that before it counts as down
            drop: 0.16,        // seconds from where it stopped to the turf
            hop: 0.42,         // metres of the first bounce
            bounce: 0.34,      // seconds that bounce takes
            creep: 0.55,       // metres it travels on while bouncing
            roll: 0.30,        // seconds for the spin to die away
        },
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
    linemanScale: LINEMAN_SCALE,
    rushShed: RUSH_SHED,

    /** How close to his line counts as on it, in FIELD UNITS. The value and the
     *  reasoning are at `STEER_DEADBAND` above; motion.js reads it through
     *  `formationSettings`, and it is repeated here so the suite can measure
     *  against the same number rather than against a copy of it. */
    steerDeadband: STEER_DEADBAND / UNITS_TO_METRES,

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
     * WHAT TO DO WITH A RECEIVER WHO HAS RUN OUT OF ROUTE. QA ITEM 3.
     *
     * THE SPIN IS A LIMIT CYCLE, AND HERE IS THE MEASUREMENT. Every route in
     * the ported library steers with a bang-bang controller and no arrival
     * behaviour: `if (y < target) accelerate one way, else accelerate the
     * other`, on two axes, with nothing that ever decelerates. A player who
     * reaches his target therefore overshoots, is accelerated back, overshoots
     * again, and settles into a circle. Traced frame by frame, jumbo2's wr1
     * orbits a 0.4m circle with a 27 frame period at 6 m/s, forever. Across
     * all 17 plays, 38 of 61 receivers spend the last second of the play
     * turning through more than 180 degrees while covering under 1.5m of
     * ground, and the worst of them turns 4,355 degrees, which is twelve full
     * rotations in one second.
     *
     * THE CURE IS A SPEED CAP, NOT A STOP, AND THAT IS THE WHOLE TRICK. The
     * radius of that circle is v squared over twice the acceleration, so
     * cutting the speed to a tenth shrinks the orbit a hundredfold, from 0.4m
     * to a few millimetres. A man who genuinely has somewhere to be still
     * covers ground at the capped speed, so he clears the `net` test below
     * within one window and gets his legs back. Nothing is frozen, nothing is
     * exempted by name, and a receiver who has merely paused mid-route jogs
     * for half a second instead of sprinting. Zeroing the speed instead was
     * tried and is worse: the route re-accelerates from zero every frame, so
     * he jitters at one acceleration step per frame and never releases.
     *
     * MEASURED ON THE DRAWN TRACK, which is the only one anybody sees: median
     * rotation over the last second falls from 305 degrees to 29, and the
     * receivers who turn more than 180 while going nowhere fall from 97 to 3.
     * The three that remain are covered by the view's own standing test.
     *
     * IT MOVES THE GAME, AND HERE IS BY HOW MUCH. A stationary receiver is an
     * easier target, so over 204 measured throws completions go from 37.3% to
     * 43.6% and the mean play from 4.2 points to 5.9.
     */
    settle: {
        /** Seconds of history the arrival test looks back over. */
        window: 0.45,
        /** Metres of NET travel in that window below which he has arrived.
         *  Net, not path: a man going in circles covers plenty of path. */
        net: 1.0,
        /** ...and the fraction of his own top speed he is held to while he
         *  has. Not zero. See above. */
        speed: 0.10,
    },

    /**
     * WHERE THE RECEIVER IS ACTUALLY GOING, WHICH IS NOT WHERE HE IS GOING
     * THIS FRAME. See `LEAD_WINDOW` above and `markHeading` in play.js.
     */
    lead: {
        /** Seconds of travel averaged into the heading a pass is led off. */
        window: LEAD_WINDOW,
    },

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
     * POSITIONS ARE WHERE THE HAND IS, IN THE RIG'S OWN SPACE, and they used to
     * be angles. The change is not cosmetic and it is the fix for QA item 2.
     *
     * The rig grew an elbow last round and every angle written against it was
     * POSITIVE, which is the wrong sign: the forearm hangs down its local -Y, so
     * rotating it about +X carries the hand to -Z, and the rig faces +Z. Every
     * pose in this file was hyperextending an elbow. It was reported as the
     * players' arms being on backwards, and that is exactly what it was.
     *
     * Flipping the signs would not have fixed it, because three angles through
     * two joints do not put a hand anywhere a person can predict: D121 searched
     * for this pose once already, looked at one sign only, and concluded the
     * target was unreachable. So a pose is now the one thing about it that can
     * be pictured and checked, which is WHERE THE HAND IS, and arm.js solves the
     * three angles that reach it. `x` is toward the throwing hand, `y` is up,
     * `z` is the way he is facing, all in rig metres before `figureScale`.
     *
     * THE BALL RIDES WHERE THE HAND ENDS UP, which is the same relationship
     * D88 wanted and had to maintain by hand. Every ball offset below sits on
     * or beside its own pose's hand, so the two cannot drift apart.
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

        /**
         * AND WHEN A PLAYER HAS STOPPED GETTING ANYWHERE, WHICH IS NOT THE
         * SAME QUESTION.
         *
         * `stillSpeed` asks how fast he is going. A man circling a half-metre
         * patch is going 6 m/s and is not going anywhere, and speed cannot
         * tell the difference: it is the reason the heading deadzone alone
         * never stopped the spin, because the deadzone was comfortably
         * exceeded the whole time. NET DISPLACEMENT over a window can tell the
         * difference, and it is the same test `settle` runs on the simulation
         * side, applied here to the position actually DRAWN.
         *
         * A figure that is standing by this test holds the heading he had,
         * stops striding, and if he is a receiver, turns to whoever has the
         * ball and puts his hands up. Measured over 183 receivers, adding this
         * on top of the simulation's cap takes the median drawn rotation in
         * the last second of a play from 34 degrees to 0.1, and leaves 3
         * turning on the spot rather than 97.
         *
         * The window is slightly shorter than the simulation's and the
         * distance slightly smaller, deliberately: the view should notice a
         * man has stopped a little AFTER he has actually stopped, never
         * before, or it poses a receiver who is still running.
         */
        standing: { window: 0.45, net: 0.9 },
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
         * HOW MUCH ELBOW A RUNNER CARRIES, in radians of FLEXION.
         *
         * Stated as a positive amount and applied as a negative angle, because
         * flexion has one direction and writing it as a signed number here is
         * how the sign got lost in the first place. A person standing still
         * carries a little; a sprinter holds close to a right angle, and a
         * figure sprinting with two straight arms reads as a mannequin on
         * wheels.
         */
        runElbow: { rest: 0.22, sprint: 0.95 },

        /**
         * SURVEYING THE FIELD, and this is the pose the whole rewrite was for.
         *
         * Solved rather than chosen, and then checked against a real three: the
         * hand at (0.41, 1.50, -0.13) puts the elbow at (0.49, 1.25, 0.00),
         * which is straight out to the side at exactly shoulder height with 74
         * degrees of elbow and the ball up beside the ear. That is a
         * quarterback. The previous version reached the same hand position by
         * bending the elbow the wrong way, which from behind is the one angle
         * that hides it and from the side is unmistakable.
         */
        throwHold: {
            hand: { x: 0.41, y: 1.50, z: -0.13 },
            /**
             * THE OFF ARM, AND IT USED TO BE INSIDE HIS CHEST.
             *
             * This asked for a hand at x 0.02, which is on the body's own
             * midline, and the rig cannot get a hand there from the far
             * shoulder without carrying the elbow across with it. Solved, the
             * old target put the elbow at x +0.063 on the arm whose shoulder
             * is at -0.2125: a horizontal upper arm buried 5cm inside the
             * torso, running from the shoulder to the sternum. That is QA
             * item 2's "right arm disappears through his body", and it was
             * never an animation fault. It was a target the arm could only
             * reach by going through him.
             *
             * 0.21 is the nearest the hand can come to the middle while the
             * elbow stays OUTSIDE the ribs, checked by sampling the upper arm
             * along its length: the elbow lands at (-0.208, 0.986, 0.077),
             * which is a hand held up in front of the chest with the elbow
             * down at the side. That is what a quarterback's off hand does.
             */
            offHand: { x: 0.21, y: 1.19, z: 0.29 },
            /**
             * AND THE BALL, WHICH IS HELD BY ITS BACK POINT AND NOT BY ITS
             * MIDDLE.
             *
             * `ballScale` is 2.6 against `figureScale` 2.2, so the ball is
             * 1.24m long beside a head 0.53m across. That is a deliberate
             * legibility choice and it stays. What could not stay is drawing
             * its CENTRE at the hand: a 1.24m object centred on a 0.18m hand
             * hides the hand, the wrist and most of the forearm, and what a
             * visitor sees is a football parked over a shoulder with no arm
             * attached. Both screenshots of the hold show exactly that.
             *
             * So the ball is pushed up its own axis until the hand sits near
             * its back point, which is also where a hand actually goes. It is
             * canted forward and up along `aim`, clearing the helmet by 15cm
             * and finishing below the crown, so the arm reads as an arm.
             */
            ball: { x: 0.386, y: 1.560, z: 0.061 },
            /** Which way it points, in the rig's own space, so the yaw and the
             *  body's pitch both carry it. Nose forward and up. */
            aim: { x: -0.12, y: 0.30, z: 0.95 },
        },

        /**
         * BEFORE THE SNAP, WHICH IS QA ITEM 1 AND DID NOT EXIST.
         *
         * The quarterback stood in the cocked throwing pose from the moment
         * the formation appeared, so a visitor reading the play saw a man who
         * had already wound up to throw, and the snap changed nothing because
         * there was nothing to change from.
         *
         * He now waits under centre: both hands out in front at waist height
         * with the ball across them, and the whole figure pitched a little
         * forward. The rig has no waist, so the pitch is the figure rotating
         * about its own feet, which is the same trick the tackle uses.
         *
         * THE HANDS DO NOT MEET AT THE MIDLINE, AND THAT IS THE RIG. Bringing
         * them together carries both elbows inside the chest, for the same
         * reason the off hand did. At x 0.17 the elbow sits at 0.181, which is
         * an arm pressed against the ribs rather than through them, and the
         * hands finish 0.75m apart at figure scale. Against a ball 1.24m long
         * that reads as two hands ON the ball, which is what it is.
         */
        underCentre: {
            hand: { x: 0.17, y: 0.96, z: 0.36 },
            ball: { x: 0, y: 0.97, z: 0.36 },
            /** Lying across both hands rather than pointing anywhere. */
            aim: { x: 1, y: 0, z: 0 },
            /** Radians of forward pitch on the whole figure. Small: at this
             *  figure scale a tenth of a radian already carries the helmet a
             *  third of a metre downfield. */
            lean: 0.13,
        },

        /**
         * AND THE SNAP ITSELF: the seconds it takes him to bring the ball back
         * and the arm up.
         *
         * Both ends are solved hand positions, so the sweep between them is a
         * real motion rather than a keyframe, exactly like the throw. The ball
         * rides the same interpolation, so it can never arrive before or after
         * the hand carrying it.
         */
        snap: { time: 0.55 },

        /**
         * WALKING TO A NEW FORMATION. "Change play", before the snap.
         *
         * ONE CLOCK FOR EVERYBODY, not a speed each. A formation is a shape, and
         * a shape that assembles itself all at once reads as a team getting set;
         * one where each man travels at his own pace and arrives when he arrives
         * reads as everybody wandering. So the far side of the field and the man
         * who has to shuffle a metre take the same two seconds, which also means
         * the visitor knows exactly when they can snap it.
         *
         * Two seconds because of what it does to the man who moves FURTHEST. A
         * smoothstep peaks at one and a half times the average, so the widest
         * relocation in the library, about twelve metres, tops out near 10 m/s.
         * That is a brisk jog for a figure 3.85m tall and it is under
         * `fullEffort`, so his arms are swinging at full amplitude when he
         * arrives rather than clipping.
         */
        relocate: { time: 2.0 },

        /**
         * GOING UP FOR IT, AND THIS TIME KEYED TO WHERE THE BALL ACTUALLY IS.
         *
         * A JUMP WAS BUILT ONCE BEFORE AND BACKED OUT (D149). That version rode
         * the simulation's `coords.z`, which is `getZIndex`, which is a crude
         * ramp with a clamp that view.js had ALREADY replaced with a real
         * parabola. It fired on 95% of throws at moments that had nothing to do
         * with where the ball was, and it converted nothing.
         *
         * WHAT WAS ACTUALLY MISSING WAS THE ARC'S HEIGHT. `ball.release` was
         * 0.28m, doing duty as both a hand and the turf, so every pass was drawn
         * arriving at a receiver's ankles: measured, the ball was a median 0.60m
         * off the ground at the frame he was closest to it, against figures
         * 3.85m tall. Nobody jumps for that. With the arc running hand to hands
         * the same measurement reads 3.19m on a catch and 3.92m on a miss, and
         * 93 of 212 misses are balls passing just above his fingertips.
         *
         * So the jump is a VIEW animation keyed to the DRAWN ball: how high it
         * really is, and how far from him it really is. Nothing in the
         * simulation moves, which also means a replay reproduces it exactly,
         * because playback recomputes the same arc from the same recording.
         */
        jump: {
            /** Metres of world lift at the peak. A person leaves the ground by
             *  about 0.6m and these figures are drawn at 2.2. */
            lift: 1.32,
            /** Seconds off the ground. A real standing leap is nearer 0.5, and
             *  a giant who hangs for a normal time reads as being on wires. */
            hang: 0.62,
            /** Metres from the ball, measured flat on the ground. THE SAME
             *  NUMBER the catch honours, so the two cannot come apart: see
             *  `JUMP_RANGE`. */
            range: JUMP_RANGE,
            /**
             * AND HOW FAR ABOVE HIS OWN FINGERTIPS IT HAS TO BE. THIS IS THE
             * NUMBER THAT DECIDES WHETHER A JUMP IS AN EVENT.
             *
             * Everything else was swept and none of it separated: at a ball
             * merely LEVEL with his hands, a receiver leaves his feet on 86% of
             * throws whatever the range, whatever the prediction, and whether or
             * not the closest approach is solved for. A ball that is genuinely
             * over his head is rare, and that is the whole difference.
             *
             *     clearance   range 1.0m   range 1.5m
             *       -0.35        65%          86%
             *        0.0         37%          75%
             *        0.4         19%          22%
             *        0.8          0%           0%
             *
             * 0.4 is the last step before it never happens at all, which is
             * also what makes it an event rather than a mannerism: a receiver
             * goes up on about a fifth of passes. Raise it and he stops
             * jumping, lower it and he starts jumping for everything.
             */
            clearance: 0.4,
            /**
             * ...AND HOW LITTLE HE NEEDS IN THE SCORING ZONES.
             *
             * QA ROUND TWENTY: too many passes into the 15 and 30 bands are
             * overthrown. Measured, they are: the ball's target is a median
             * 1.5m past the man it was aimed at, and it goes by him a median
             * 0.5 to 0.7m away.
             *
             * WHAT DOES NOT FIX IT IS A HIGHER JUMP, and the measurement is an
             * exact zero rather than a small number: over 612 throws, not one
             * incompletion in any band failed the gate that asks whether the
             * ball is further up than a jump would get. Raising `lift` to 1.9m
             * moves every figure in the table by nothing at all.
             *
             * What stops him is the OTHER end of the same window. The ball
             * comes over him early in its arc, while it is still up, and he
             * declines to leave his feet for it unless it clears his fingertips
             * by 0.4m. Ask for half that in the painted zones and he goes up as
             * it arrives, and the jump carries the rest: a man in the air has a
             * `JUMP_RANGE` box in every direction and is excused the ported
             * height gate, so going up for it IS catching it.
             *
             *     gate in 15 and 30    5 pt   15 pt   30 pt   50 pt   he jumped
             *     0.40 (as it was)      82%     75%     65%     50%         20%
             *     0.20                  82%     83%     82%     50%         35%
             *     0.00                  82%     86%     88%     50%         43%
             *    -0.20                  82%     87%     88%     50%         46%
             *
             * 0.20 takes most of what is there and leaves the jump an event.
             * Past it the returns fall off and he starts going up on half the
             * passes in the game.
             */
            zoneClearance: 0.2,
            /**
             * WHICH PAINTED BANDS PLAY BY THAT GENTLER RULE, by their points.
             *
             * KEYED ON WHERE THE BALL WAS AIMED rather than where the receiver
             * is standing, and the difference is not cosmetic: a man catching a
             * fifty is usually still short of the target when it comes over
             * him, so keying on his own feet would hand the same help to the
             * hail mary and undo round seventeen. Measured that way the 50 band
             * went 50% to 61%. Keyed on the throw it does not move at all.
             */
            zones: [15, 30],
        },

        /**
         * WANTING THE BALL, WHICH IS QA ITEM 3'S SECOND HALF.
         *
         * A receiver who has run out of route used to keep milling on the
         * spot. Now he stops, turns back to whoever has the ball, and puts
         * both hands up. Solved at (0.32, 1.60, 0.18) the elbows land at
         * (0.317, 1.313, 0.246), which is both arms raised and forward with
         * the hands at head height and nothing near the torso.
         */
        posting: { hand: { x: 0.32, y: 1.60, z: 0.18 } },
        /**
         * TUCKED, HIGH AND TIGHT, which is where a ball carrier actually holds
         * it and not where this used to put it.
         *
         * The old pose dropped the hand to the hip at y 0.78 and hung the ball
         * off it. A carrier clamps the elbow at his side and brings the forearm
         * up across the ribs, so the ball rides in the crook between the two
         * with a hand over its point. The hand lands at (0.20, 1.06, 0.26) and
         * the elbow at (0.19, 0.98, -0.02), which is that.
         */
        tuck: {
            hand: { x: 0.20, y: 1.06, z: 0.26 },
            ball: { x: 0.17, y: 1.02, z: 0.12 },
            /** Nose forward, in the rig's own space. Written the same way the
             *  throwing hold writes it so the two cannot drift apart. */
            aim: { x: 0, y: 0, z: 1 },
        },
        /**
         * THE RELEASE, AND THE SWEEP BETWEEN THE TWO IS A REAL THROW.
         *
         * Interpolating the solved angles from `throwHold` to here carries the
         * hand up over the shoulder, forward past the ear and down across the
         * body: measured at five points it runs (0.41, 1.50, -0.13) to
         * (0.48, 1.56, 0.07) to (0.48, 1.46, 0.33) to (0.38, 1.20, 0.49) to
         * (0.20, 0.92, 0.44). That is an over-the-top throwing motion with a
         * follow through, and none of it had to be keyframed.
         */
        throwRelease: {
            hand: { x: 0.20, y: 0.92, z: 0.44 },
            time: 0.34,
        },

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
            hand: { x: 0.15, y: 0.95, z: 0.40 },
            lean: 0.52,          // radians of forward pitch, whole figure
            /** Seconds to commit. Much shorter than the general pose blend,
             *  because a tackle that eases in is not a tackle. */
            snap: 0.05,
        },

        /**
         * AND THE TACKLE ITSELF, WHICH IS AN EVENT AND NOT A DISTANCE.
         *
         * THIS IS QA ITEM 3, AND THE MEASUREMENT IS WHY IT NEVER FIRED ONCE.
         * The knockdown used to be driven by how close the nearest defender
         * was: full commitment inside 1.25m, and the carrier went over at 0.72
         * of it. But the ported simulation does not blow its whistle when two
         * bodies touch, it blows it when two COLLISION BOXES overlap, and those
         * boxes are drawn for a figure 2.2 times life size. Measured over 84
         * tackles the nearest defender at the whistle was a median of 1.85m
         * away, the commitment came out at a median of 0.31, and it reached the
         * trigger on NONE of them. The lean was nine degrees and the carrier
         * never fell over in the entire history of the game.
         *
         * So it is no longer inferred. `state.tackled` is a fact the simulation
         * already knows, and when it says so, the nearest opponent DIVES: he
         * covers the last two metres himself, leaves his feet, and puts the
         * carrier on his back. Everything below is that animation, in seconds.
         */
        takedown: {
            /** Seconds for the tackler to cross the gap and arrive. */
            dive: 0.34,
            /** ...for the carrier to be driven off his feet once hit. */
            fall: 0.42,
            /** ...and to lie there before the result card opens over it. */
            settle: 0.40,
            /** How close the dive finishes, in metres. Not zero: a tackler who
             *  ends up standing exactly where the carrier is has walked through
             *  him rather than hit him. */
            close: 0.55,
            /** How high he leaves the ground at the top of the dive, in metres
             *  at figure scale. */
            leap: 0.70,
            /** How far back the carrier is driven, in metres. */
            driven: 1.05,
            /**
             * WHERE THE BODIES ACTUALLY MEET, IN METRES BETWEEN THEIR CENTRES,
             * AND THIS IS QA ITEM 5.
             *
             * The carrier's fall used to be clocked from the END of the dive,
             * so he stood upright through the whole thing and only started to
             * go over once the tackler had landed. Measured against the median
             * 1.85m gap, the two of them are within a body's width of each
             * other 17% of the way in, which leaves 0.28 of a second of a
             * defender lying on the grass beside a man who has not been
             * touched yet. That is exactly what QA reported.
             *
             * So contact is now solved from the geometry rather than assumed:
             * the fall starts on the frame the closing gap first reaches this
             * distance. One body width, which is `separation`, because that is
             * already the distance at which this game says two figures are
             * touching.
             */
            contact: 1.45,
            /**
             * ...clamped to this window of the dive, because neither end is a
             * tackle. A hit on the first frame is the whistle knocking a man
             * over on its own, and one at the very end is what we started
             * with. Fractions of `dive`.
             */
            contactAt: { min: 0.22, max: 0.62 },
            /** How much of the carrier's drive the tackler is carried along
             *  with, 0 to 1. A tackler who stops dead while the man he hit
             *  flies backwards has not tackled him, he has been run into. */
            carry: 0.55,
            /** Radians of pitch: the tackler laid out flat, and the carrier on
             *  his back. Negative is backwards. */
            tacklerLean: 1.15,
            carrierLean: -1.45,
            /** And how far the tackler's hands reach on the way in. */
            hand: { x: 0.16, y: 1.02, z: 0.46 },
        },

        /**
         * HOW FAR OFF HIS RUNNING LINE ANY FIGURE WILL TURN TO ATTEND TO
         * SOMEBODY, in radians, and it only applies WHILE HE IS RUNNING.
         *
         * ONE NUMBER BECAUSE IT IS ONE JOINT. A receiver tracking a ball over
         * his shoulder and a blocker squaring up to the man he is on are the
         * same question: how far do the shoulders come off the direction the
         * legs are carrying him. Turned the whole way either of them is drawn
         * travelling backwards at six metres a second, because everything about
         * how a figure looks while moving hangs off its yaw.
         *
         * 120 degrees is a man looking hard over one shoulder, which is the
         * picture in both cases, and for the catch it leaves the ball inside
         * `catching.armLimit` so his hands still get to it.
         *
         * A man who has STOPPED has no stride to protect and turns all the way
         * round: a receiver waiting on a ball, or a lineman wrestling somebody.
         */
        turnLimit: 2.09,

        /**
         * CATCHING IT, WHICH IS QA ITEM 5 AND THE ONLY POSE SOLVED PER FRAME.
         *
         * Everything else here is a fixed hand position that arm.js turns into
         * angles once. A catch cannot be: the hands go to the BALL, which is
         * somewhere different on every frame of every throw. So the target is
         * the ball's own position expressed in the receiver's local space, and
         * the same solver answers it.
         *
         * IT RAMPS IN WITH DISTANCE rather than switching on, because a
         * receiver puts his hands up as the ball arrives and not the instant it
         * is thrown. Full commitment at `close`, nothing at all beyond `range`.
         */
        catching: {
            range: 8.0,          // metres from the ball before he reaches at all
            close: 2.6,          // ...and where his hands are fully up
            /** The two hands cradle the ball rather than both stabbing at its
             *  centre, in rig metres either side of it. */
            split: 0.11,
            /** A defender only goes up for a ball he could plausibly get to,
             *  measured in metres from where it is passing. */
            defenderRange: 3.4,
            /** Seconds for the ball to settle from the catch into the tuck. A
             *  ball that teleports to the hip is a ball nobody caught. */
            gather: 0.26,
            /**
             * ...and how far round from his own forward an arm will go, which
             * is a fact about a shoulder rather than a tuning.
             *
             * QA: a ball passing behind a player had both arms sticking out
             * BACKWARDS through his own back. The solver was doing as it was
             * told: `reachAt` is the ball in his local space and nothing said
             * the ball could be behind him. 100 degrees is past square and
             * short of the shoulder blade.
             */
            armLimit: 1.75,
        },

        /**
         * BLOCKING: BOTH ARMS OUT AT THE MAN IN FRONT.
         *
         * There is no blocking flag in the ported simulation, so this is
         * derived in the view: a lineman with an opponent inside `reach` is
         * engaged. That is what the position group is FOR, and it is the whole
         * visible content of a running play, so inferring it is worth more than
         * waiting for the simulation to say so.
         *
         * The hand at (0.26, 1.20, 0.42) puts the elbow at (0.25, 1.04, 0.17),
         * which is hands up and elbows down: a blocker, and also a pose that
         * keeps the upper arm inside the shoulder ball. The previous version
         * had to be pulled back from -1.30 to -0.95 radians because at 75
         * degrees off the body the joint stopped being covered at all (D102).
         * Asking for a hand position rather than an angle makes that limit
         * something the solver respects for free.
         */
        /**
         * BLOCKING, AND IT TAKES TWO. QA ITEM 5.
         *
         * Only the offensive lineman was ever posed, so he reached out and the
         * man he was reaching at ran past him with his arms swinging, which
         * reads as neither of them blocking. view.js now pairs them and both
         * ends get this pose and, more to the point, both get turned to face
         * each other.
         *
         * THE HANDS WENT UP ONTO THE SHOULDERS. At y 1.20 they were below the
         * shoulder joint at 1.25, which is a man pushing somebody's ribs. At
         * 1.26 they are level with it and 1.01m in front of his own chest.
         *
         * AND THEY REACH, which had to be checked rather than assumed:
         * `separation` holds bodies 1.45m apart, so with a torso 0.48m deep at
         * figure scale their chests are 0.97m apart. Any less and they push at
         * thin air.
         *
         * 1.26 AND NOT 1.32, AND A TEST SAID SO. The shared rig's shoulder ball
         * is `armRadius * 1.15` in a flat-sided torso, and past about a radian
         * of `armX` the upper arm clears the joint entirely and the limb reads
         * as a detached stick, which is what the old screenshots called glitchy
         * arms. At 1.32 the solve came out at 1.085 and
         * `exesnohs-gameplay`'s "no held pose swings an arm out of its own
         * shoulder" failed. This is the highest and furthest forward the hands
         * go while the shoulder still covers them, at 0.939.
         */
        block: {
            /**
             * WHERE A BLOCK STARTS AND WHERE IT IS FULLY LOCKED, AND THE
             * SECOND ONE USED TO BE UNREACHABLE.
             *
             * The ramp ran to full commitment at HALF the reach, which is
             * 1.30m, and two bodies in this game are never closer than 1.45m.
             * So the pose could not complete: measured over 204 plays, a pair
             * the pose calls engaged sits a median 2.23m apart, at which it was
             * only 28% of the way into the block, with both men's hands 0.21m
             * short of each other. QA read that exactly right as "a blitzer
             * often doesn't get close enough to the blocker for them to lock
             * arms". They never locked, because the pose never finished.
             *
             * `lock` is now the distance the PHYSICS actually holds an engaged
             * pair at, so arriving there is arriving. `reach` is where they
             * start reaching for each other, a stride before it.
             */
            reach: 2.7,          // metres: nothing beyond this
            lock: 2.3,           // ...and fully into it by here
            hand: { x: 0.26, y: 1.26, z: 0.46 },
            /**
             * AND THEY LEAN INTO IT, WHICH IS WHAT CLOSES THE LAST GAP.
             *
             * A lineman's collision box is 2.38m across against a drawn body of
             * 1.45m, so the game holds an engaged pair further apart than two
             * men can reach: at 2.23m their hands finish 0.21m short whatever
             * the pose does with their arms. That box is load-bearing for the
             * whole game and is not this file's to shrink (see the note in
             * TASKS), so the figures close it themselves.
             *
             * 0.14 radians carries a shoulder 0.54m forward at this figure
             * scale. At the median 2.25m the two men's hands then pass each
             * other by 0.27m, which is arms locked; at the tenth percentile of
             * 1.58m their heads still finish half a metre apart, which is why
             * it is not more. It rides the engagement, so a pair only reaching
             * for each other only leans a little. The rig has no waist, so it
             * is the whole figure about its feet, the same as the tackle.
             */
            lean: 0.14,
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
        /**
         * LOWERED AND BROUGHT IN, BECAUSE THE CAMERA MOVED UNDER IT.
         *
         * D147 traded a 28 degree lens for an 18 degree one to fill the screen
         * with field, and a longer lens is a narrower frame: the visible ground
         * now stops at x = 57m and, more to the point, HEIGHT climbs toward the
         * top edge much faster. Projected, the board's face landed at 1.38 in a
         * frame that ends at 1.0, so it was entirely off the top of the screen.
         * QA reported it as the scoreboard having gone.
         *
         * Solved rather than nudged. The frame's top edge is a ray 19 degrees
         * below horizontal from a camera 38.8m up at x = -55.5, so a point is in
         * shot while `y <= 38.8 - 0.3443 * (x + 55.5)`: 4.2m of headroom at the
         * old x = 45, and 5.9m at x = 40. Lower AND closer, therefore. At a
         * 1.0m stand, 1.5m past the end line and a 4.0m face, it runs from 0.71
         * to 0.94 of the frame on every landscape shape and 0.63 to 0.80 in
         * portrait, which is in shot with a margin at both ends.
         *
         * It sits behind the end line either way, so nothing about this puts it
         * in front of the field.
         */
        width: 13,
        height: 4.0,
        standHeight: 1.0,           // metres of post under the board
        beyond: 1.5,                // metres past the far end line
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

    /**
     * LEANING ON THE GAME WHEN IT IS GOING TOO WELL, OR TOO BADLY.
     *
     * The 2D game kept a count of successful or unsuccessful plays in a row and
     * adjusted difficulty from it, and the right lever is the one it used: the
     * random speed and acceleration every player is rolled on every line-up
     * (see `formations.generateTeamFormationObject`). Nothing new is invented.
     * The roll already exists, and this leans the whole band one way or the
     * other.
     *
     * IT IS SILENT. The visitor is never told, because being told that the game
     * has decided to go easy on you is worse than the game being hard.
     *
     * `swing` IS THE WHOLE FEEL OF IT and is deliberately small. It is the
     * fraction by which a team's top speed and acceleration move at full
     * difficulty, applied in opposite directions to the two sides, so the gap
     * between them opens by twice it. At 0.10 a dominant visitor faces a
     * defense 10% quicker than usual while his own side is 10% slower, which is
     * roughly one step of the game's own random roll: enough to feel, not
     * enough to make a play look broken.
     */
    difficulty: {
        /** Points at or above which a play counts as a success, which is the
         *  third rung: past two lines is a good play by anybody's reckoning. */
        good: 30,
        /** ...and at or below which it counts as a failure. Zero, so an
         *  incompletion counts alongside a sack and an interception. */
        bad: 0,
        /** How many in a row saturate it. Three, because "three fifties" and
         *  "seven fifties" want the same answer. */
        run: 3,
        /** The fraction a team's speed and acceleration move at full tilt. */
        swing: 0.10,
    },

    /** Storage keys. Every one of these outlives the visit, so all three are
     *  named in www/privacy.html before M4 ships (TASKS M4). */
    storage: {
        audio: 'exes-n-ohs-audio-settings',
        play: 'exes-n-ohs-play-settings',
        best: 'exes-n-ohs-best-score',
        /** The game in progress, so a reload does not cost ten plays. Written
         *  at each whistle by progress.js, cleared when a game ends or is
         *  started over. Named in www/privacy.html like every other key here. */
        game: 'exes-n-ohs-game',
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
