// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - Fractal Garden.
 *
 * One deep-frozen object holding every per-experience knob this scene's modules
 * accept. main.js imports it and passes slices into the init functions. These
 * are final literal values: nothing mutates this object at runtime, and
 * deepFreeze below enforces it.
 *
 * The thirteenth SceneXP experience, and the first one the visitor BUILDS. An
 * open plot of grassland. Tap a spot, choose a tree, and it goes in as a
 * sapling. Every day and night cycle is a year, and the sun's own hours are the
 * seasons, so the trees bud, deepen, turn, drop, and stand bare while the light
 * goes round. They grow older each year, they ask to be watered through the warm
 * hours, and they are still there when the visitor comes back tomorrow.
 *
 * Like earthdefense and highwater, this one honors nobody. It is here to
 * introduce an interaction the site does not have yet.
 *
 * THIS FILE GROWS BY MILESTONE. Today it carries what M0 and M1 need: the plot,
 * the camera, the quality policy, the clock, and the outward-facing links.
 * Weather, species, growth, water, and snow arrive with their own milestones
 * (see specs/garden/TASKS.md). Every number below is either measured or has its
 * reasoning written beside it, because a config full of unexplained constants is
 * a config nobody can safely tune.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const GARDEN_CONFIG = deepFreeze({
    // Name of the root THREE.Group the world builds under (scene-graph label).
    rootName: 'garden',

    // ---- The clock ----------------------------------------------------------
    // ONE NUMBER DRIVES THE WHOLE EXPERIENCE. Seasons, growth, thirst, health,
    // weather, and snow are all pure functions of elapsed in-world seconds, and
    // this is the only place the rate is written down.
    //
    // 240 seconds is one full day and night, which is one in-world YEAR. So an
    // in-world hour is 10 seconds and a season is 60. A sapling reaches maturity
    // at 4.5 years, about 18 minutes of watching, which is long enough that
    // growth feels earned and short enough to see a whole year in one sitting.
    //
    // THE CLOCK RUNS ONLY WHILE THE PAGE IS OPEN. What gets persisted is
    // `elapsedSeconds`, the total in-world time this garden has ever been
    // watched, never a wall-clock timestamp. There is deliberately no
    // Date.now() anywhere in this scene's model: a real-time clock would greet
    // somebody returning from a week away with a garden full of dead trees,
    // which is the exact opposite of what this scene is for.
    clock: {
        cycleSeconds: 240,

        // WHERE A BRAND NEW GARDEN OPENS. Hour zero is midnight in the deep of
        // winter, half under snow, with the watering window shut: an odd
        // welcome for a garden, and it invites the visitor to plant their
        // first tree in the dark. Six is sunrise and the exact middle of
        // spring, the snow has just gone, and the growing season is about to
        // open. A year begins where a year should.
        //
        // This shifts only the STARTING point. `elapsedSeconds` still counts
        // from zero as a duration, and a returning visitor resumes from
        // whatever they had rather than from here.
        startHour: 6,
        // A frame longer than this is a tab coming back or a machine waking.
        // Letting it through would age the garden for time nobody watched.
        maxFrameSeconds: 0.1
    },

    // ---- The calendar -------------------------------------------------------
    // THE SEASONS ARE THE SUN'S OWN HOURS. Each one is a quarter of the day
    // centred on a solar event: spring on sunrise, summer on noon, autumn on
    // sunset, winter on midnight. Warmth and light rise and fall together,
    // which is what a year actually feels like, and it means the growing
    // season and the watering season are the bright hours.
    //
    // The intervals are half-open, opening exclusive and closing inclusive, so
    // hour 9.0 is the last instant of spring. Winter is the one that wraps.
    season: {
        boundaries: { spring: 3, summer: 9, autumn: 15, winter: 21 },

        // When the trees drink: the last third of spring, all of summer, and
        // the first third of autumn. Ten of the twenty four hours, all of them
        // in daylight.
        thirst: { start: 7, end: 17 },

        // Snow falls, holds, and melts across the back half of winter and the
        // first hours of spring. Hours of the day, and the melt runs past
        // midnight into spring on purpose: the thaw IS the arrival of spring.
        snow: {
            firstFlakes: 22.5,
            accumulatedBy: 1.5,
            holdUntil: 3,
            meltBy: 5
        },

        // The deciduous year. Every key is an hour of the day.
        phenology: {
            budStart: 3,        // buds swell as the sky starts to lift
            budEnd: 6,          // bud break, at sunrise
            expandEnd: 7.5,     // leaves at full size
            turnStart: 15,      // colour begins, as autumn opens
            turnEnd: 18,        // peak colour, at sunset
            dropStart: 18,
            dropEnd: 21,        // bare, as winter opens
            // How big a leaf is when it first breaks out of the bud, as a
            // fraction of full size. Not zero: a bud that opens onto nothing
            // reads as a rendering fault rather than as spring.
            budLeafSize: 0.18,
            // How far an evergreen's needles desaturate at the coldest hour.
            evergreenWinterFade: 0.35
        }
    },

    // The sun's highest elevation, in degrees, reached at noon in high summer.
    // A temperate garden rather than a tropical one: high enough for short
    // shadows at midday, low enough that the long ones at either end of the
    // year are the picture.
    sun: { maxElevation: 58 },

    // ---- The plot -----------------------------------------------------------
    // 24 by 24 metres of gently undulating grassland, centred on the origin, so
    // x and z both run from -12 to +12. -Z is away from the camera.
    plot: {
        halfSize: 12,
        // ---- THE PLANTING GRID, COARSENED FROM 1.5 (M24-1) ----------------
        // Trees have always snapped to a grid and have always been centred in
        // their cell. At 1.5 m that was invisible as a lattice: twenty trees
        // among 169 cells land wherever they were tapped, so the result read as
        // scattered even though every one of them was exactly on a node.
        //
        // At 3.0 m there are 49 cells, so a row of trunks and mulch beds lines
        // up where the planting happens to line up, and the beds sit 1.7 m
        // apart instead of 0.22.
        //
        // IT DOES NOT STOP THE CANOPIES OVERLAPPING, and no spacing this plot
        // can hold would. Measured off the built skeletons the mean mature
        // canopy is 10.1 m across and the widest is 19.6, against a 24 m plot:
        // twenty of them cannot help interpenetrating. The neatness this buys
        // is at the trunks and the beds, which is what an orchard looks like
        // anyway.
        //
        //     spacing   cells   mean canopy overlap   bed gap
        //       1.5      169          8.6 m            0.22 m
        //       3.0       49          7.1 m            1.72 m
        //       5.0       25          5.1 m            3.72 m
        //
        // 5.0 was the other candidate and was turned down for the interaction
        // rather than the look: twenty trees into twenty-five cells fills
        // nearly all of them, and "a tree goes where you tapped" stops meaning
        // anything.
        gridSpacing: 3.0,
        // What the grid used to be. Kept, because a saved garden stores CELL
        // INDICES rather than positions, so migrating one needs the spacing it
        // was written against. See `hydrate`.
        legacyGridSpacing: 1.5,
        // ---- TWO DISTANCES THAT USED TO BE THE GRID SPACING ---------------
        // Both of these read `gridSpacing` until M24-1, and both were wrong to.
        // Neither is about how far apart trees stand, so coarsening the grid
        // moved them for no reason: the plantable area SHRANK from 169 cells to
        // 25, and the aiming grace doubled to three metres of open meadow.
        //
        // plantMargin  how far inside the wall a trunk must stand. The widest
        //              mature trunk measured across every species and forty
        //              seeds is 0.148 m of radius and a mulch bed is 0.64, so
        //              1.5 is generous on purpose and has room to spare.
        // reachGrace   how far outside the wall still counts as asking to
        //              plant. This is aiming tolerance, which is about how
        //              precisely a person can point at a thing, and a person's
        //              aim does not change when the lattice does.
        //
        // Both hold the exact numbers that the old formula produced at the old
        // 1.5 m spacing, so decoupling them changed nothing on its own.
        plantMargin: 1.5,
        reachGrace: 1.5,
        // ---- Capacity, by device tier, and it is a TRIANGLE BUDGET --------
        // The plant modal says so plainly when the plot is full and offers to
        // remove a tree instead.
        //
        // ---- WHY 16 WAS EXACTLY RIGHT, AND WHAT 20 COSTS ----
        //
        // Re-measured 2026-08-30 across 400 SEEDS PER SPECIES, because a tree's
        // cost varies with its seed by about a third and a single sample is
        // worth nothing here. The worst single tree in the set is 17,412
        // triangles (Sugar Maple; the Blue Spruce and Coast Redwood land within
        // 50 of it because the 1,200 segment cap binds for all three).
        //
        //     fixed scene, trees aside      120,654
        //       of which the fractal wood    75,000
        //     budget                        400,000
        //     left for planted trees        279,346
        //
        //     16 x 17,412 = 278,592   fits, with 754 to spare
        //     20 x 17,412 = 348,240   over by 68,894
        //
        // So 16 was not a round number, it was the answer. **20 IS OVER BUDGET
        // IN THE WORST CASE** and is shipped anyway as a deliberate call: the
        // worst case is a plot of twenty trees all of the single most expensive
        // species on unlucky seeds. A realistic mixed plot of 20 is about
        // 150,000, and even twenty Blue Spruces average 303,000, which fits.
        //
        // THE LEVER IF THIS EVER BITES is `tree.maxSegments`, not this number.
        // Only three species reach the 1,200 cap, so lowering it costs nothing
        // anywhere else, and 900 would bring a worst-case plot of 20 back
        // inside. It is not done here because the cap truncates the LAST-BORN
        // segments, which are the outer canopy, and the note beside
        // `maxSegmentsMobile` records what that did to the Coast Redwood.
        maxTrees: 20,
        // The 480 segment cap truncates hard on this tier, so a mobile tree is
        // 6,978 triangles at worst against the desktop's 17,412, and 12 of them
        // is 83,736. Moved with the desktop tier at roughly the ratio it always
        // had (10/16, now 12/20), with a great deal of room to spare.
        maxTreesMobile: 12,
        // THE TALLEST SPECIES, IN METRES, AND IT IS A CAMERA CONSTRAINT. The
        // camera block below is composed so that a tree this tall standing at
        // the middle of the plot fits inside the vertical frame. Raising it
        // without re-deriving the camera silently crops every large tree, so
        // tests/garden-init.test.mjs asserts the two agree.
        maxTreeHeight: 14
    },

    // ---- The camera ---------------------------------------------------------
    // Fixed, elevated, at the near edge looking across and down the plot. The
    // garden provides all the motion. Metres.
    //
    // THE TALLEST TREE IS 14 METRES AND THAT IS A CAMERA DECISION, not a
    // botanical one. The PRD first asked for a 22 metre Coast Redwood. Worked
    // against this viewpoint, a 22 metre tree standing at the middle of the plot
    // sits 61 degrees off the view axis, so framing it would need a vertical FOV
    // near 120, and pulling back far enough to get one instead makes a 3 metre
    // Japanese Maple a smudge. At 14 metres the same tree sits 28.3 degrees off
    // axis and fits inside a 60 degree frame with margin, while 3 to 14 metres
    // still reads as a plain four-and-a-half-to-one difference between the
    // smallest species and the largest. See specs/garden/TASKS.md M2-1.
    //
    // KNOWN LIMIT, ACCEPTED: a 14 metre tree planted at the NEAR edge of the
    // plot sits 45.6 degrees off axis and crops at the top of the frame. The
    // zoom-out below covers it, and M2-9 should consider easing the zoom out a
    // little when a large species is planted close in.
    camera: {
        position: { x: 0, y: 7, z: 22 },
        lookAt: { x: 0, y: 2.5, z: -2 },
        // Vertical, which is what three.js means by fov. The pitch this implies
        // is about 10.6 degrees down.
        fov: 60,
        near: 0.1,
        far: 400,

        // A PORTRAIT FRAME IS ABOUT A THIRD AS WIDE. three.js fov is vertical,
        // so a phone held upright keeps the height and loses both sides: at
        // this fov and a 0.46 aspect the horizontal frame is only 29.7 degrees,
        // which shows about 11.7 of the plot's 24 metres. So below an aspect of
        // 1, main.js widens to portrait.fov and dollies straight back until
        // minHalfWidth metres either side of centre fit at focusZ. Landscape
        // frames always use the composed position as-is.
        portrait: {
            fov: 72,
            // 9 metres either side of centre, so 18 of the 24 are in frame. The
            // outer 3 metres each side are reachable with a pan.
            minHalfWidth: 9,
            focusZ: 0,

            // Pan, tilt, and zoom (shared pan-1.0.0.js). Unlike the other
            // composed views these are on at EVERY aspect, via alwaysOn and the
            // 'always-on' class, because a desktop visitor needs to reach the
            // far corners of a 24 metre plot as much as a phone does. The zoom
            // hangs off the portrait fov above, which is what the shared part
            // takes as its anchor.
            pan: {
                speed: 0.45,
                maxAngle: 0.55,
                // ---- AND IT GROWS AS THE EYE COMES IN (QA 2026-08-31) -------
                // `maxAngle` is the clamp at the COMPOSED viewpoint, where it
                // is right: the eye is 22 m back, the whole 24 m plot subtends
                // 35 degrees, and 31.5 either way reaches all of it. But this
                // scene's zoom is a DOLLY, so the eye travels to z = 6, and the
                // same plot then subtends 108 degrees. Measured, the angle
                // needed to centre the nearest front corner cell (9, 9):
                //
                //     dolly   0     0.25   0.5   0.7   0.85   1
                //     eye z   22    18     14    10.8  8.4    6
                //     need    35    45     61    79    94     108
                //
                // At 31.5 the corner is off a portrait frame past dolly 0.25
                // and off a 16:9 one past 0.7, which is exactly the report:
                // "hard to zoom in on the front corners, which is fine while
                // zoomed out but limiting while zoomed in".
                //
                // DOUBLED AT THE NEAR END, and interpolated linearly between,
                // which at the middle of the track (where anybody actually
                // sits) takes the corner from 29 degrees off centre to 13.7:
                // off a portrait screen to comfortably on it. The far end is
                // deliberately NOT solved. At dolly 1 the eye is at z = 6 and a
                // corner tree at z = 9 is BEHIND it, and turning to look over
                // your own shoulder is a free-look camera rather than a wider
                // pan. See `panLimitFor` in view.js, and the mountain arc,
                // which had to become a closed ring to cover this.
                maxAngleNear: 1.10,

                // ---- AND THE FRAME'S OWN WIDTH IS THE OTHER HALF ----------
                // `maxAngleNear` alone was LENS-BLIND, and QA caught it: a
                // portrait phone composes at fov 72 on a narrow window, which
                // is 18.7 degrees of frame either side of the aim against a
                // 16:9 desktop's 45.7. So the same clamp lands the front corner
                // comfortably in frame on a desktop and clean off it on a
                // phone past a dolly of 0.7. "Works perfectly on a desktop,
                // still not able to pan far enough on a phone" is what a
                // lens-blind rule feels like.
                //
                // So the limit is ALSO whatever holds the far corner this far
                // out in the frame this device actually has, as a fraction of
                // the half-width, and the larger of the two rules wins. At 0.6
                // the corner sits well inside the frame rather than hugging its
                // edge, which is the difference between reaching a tree and
                // glimpsing it.
                //
                // It is a fraction and NOT an angle on purpose: an angle would
                // be another number sized for one screen, which is the bug.
                cornerAt: 0.6,
                maxTilt: 0.32
            },
            zoom: {
                // In units of the dolly parameter per second, because the
                // garden delegates the zoom (see `dolly` below) and the shared
                // part's own note says the units are whatever the experience
                // counts in. A held button crosses the whole track in about
                // three and a half seconds.
                speed: 0.55,
                // Doublings of "in" per wheel notch. The whole track is 2.0
                // units wide, so this is about 17 notches end to end, which is
                // a comfortable flick rather than a jump.
                wheel: 0.12,
                // Kept so the shared part still renders the zoom pair, which
                // is what carries the pinch gesture and the arrow keys. The
                // numbers themselves are unused in delegate mode.
                maxIn: 26,
                maxOut: 16
            }
        },

        // ---- The dolly ------------------------------------------------------
        // THE ZOOM USED TO BE A LENS AND WHAT WAS ASKED FOR WAS A MOVE. From a
        // fixed eye at (0, 7, 22) the control narrowed the field of view, which
        // is a crop: a bigger picture of exactly the same view, with no
        // parallax and no sense of being anywhere different. Measured, it ran
        // 60 degrees to 34 (1.9x magnification) and out to 76 (1.35x wider),
        // and neither end is "amongst the trees" or "the plot from above",
        // because both of those are POSITIONS.
        //
        // One parameter, -1 to +1, with 0 at the composed viewpoint the whole
        // scene is framed for. The lens is left alone.
        //
        // `near.z` is 6, which is INSIDE the plot (it runs -12 to +12), so the
        // close end really does stand the visitor among their own trees. The
        // eye clears the ground with 1.3 m to spare at the highest relief the
        // plot has, and it passes over the wall rather than through it.
        //
        // `far` rises much more than it retreats, because height is what makes
        // an overhead view and distance only makes a small one. From (0, 26,
        // 40) aimed at (0, 3, -14) the whole 24 m plot sits inside the middle
        // of the frame with a band of sky still showing above the hills.
        dolly: {
            near: { z: 6, y: 2.2, lookY: 3.2, lookZ: -2 },
            far: { z: 40, y: 26, lookY: 3.0, lookZ: -14 },
            // Both ends are clamped against the composed z rather than trusted:
            // `framingFor` dollies a portrait phone back on its own, and a tall
            // enough window composes past 40, at which point an unclamped
            // "out" would move the camera FORWARD.
            //
            // Tilt is NOT here. The shared part owns it, on `portrait.pan`
            // above, so the buttons, W and S, and a drag are all one axis.
        },

        // ---- BEING SHOWN THE TREE YOU JUST PLANTED --------------------------
        // From the composed viewpoint a newly planted sapling is a few hundred
        // pixels of nothing, 25 metres away and anywhere across a 24 metre
        // plot, and on a portrait phone it can be off the side of the frame
        // entirely. The visitor has just made a decision and the scene answers
        // it by showing them something they have to hunt for. So the camera
        // turns to the new tree and moves in on it.
        //
        // IT IS A COURTESY AND NOT A CUTSCENE. It eases, the first touch of any
        // control cancels it, and reduced motion arrives without travelling.
        // See view.js, which owns the move.
        focus: {
            seconds: 1.15,

            // ---- FRAMED IN THE TREE'S OWN HEIGHTS -------------------------
            // How many of them the vertical frame should hold, so a 3 m
            // Japanese Maple and a 14 m Coast Redwood land at the same share of
            // the picture rather than one filling it and the other vanishing.
            // At 2.2 a mature tree is about 45 percent of the frame's height.
            //
            // The tree going in is a SAPLING, not the mature specimen this is
            // measured against, and that is deliberate: the framing is chosen
            // once, at planting, and has to still make sense in ten years. A
            // distance chosen to fill the frame with a two metre sapling would
            // stand the eye inside the tree for the rest of the garden's life.
            frameHeights: 2.2,
            // Metres, and the floor is what stops a small tree pulling the eye
            // in on top of its own mulch. The ceiling keeps the move worth
            // making at all: past this it is barely closer than composed.
            minDistance: 8,
            maxDistance: 20,

            // ---- THE EYE MUST NOT END UP BEHIND THE TREE ------------------
            // The near end of the dolly track is z = 6, which is INSIDE a plot
            // that runs -12 to +12, so a tree planted at the front of it can
            // finish behind the camera, which looks down -z. This is how far in
            // front of the tree the eye stays, whatever distance was asked for.
            clearance: 8,
            // The other end of the promise: always a move worth noticing, and
            // never so far in that the plot around the tree stops reading.
            // `minDolly` yields to `clearance` when the two disagree.
            minDolly: 0.3,
            maxDolly: 0.85,

            // Where on the tree to aim: a little way up it rather than at the
            // ground, so the trunk is centred and the canopy has the top of the
            // frame to grow into. Scaled by the species and then clamped, or a
            // redwood is framed on empty sky and a maple on its own roots.
            aimHeightRatio: 0.35,
            minAimHeight: 1.4,
            maxAimHeight: 4.5,

            // ---- AND PULLING BACK LETS THE TREE GO ------------------------
            // The aim used to hold its tree forever: `resetView` had one
            // caller, "start a new garden", so the only route back to the
            // composed wide shot was deleting the plot. The release rides the
            // DOLLY rather than a control of its own, because the dolly already
            // owns part of the aim (`dollyView` moves lookY and lookZ across
            // the track). It is measured from where the move landed and
            // smoothstepped, so a small pull back opens the frame rather than
            // turning the camera. See `focusHold` in view.js, which needs no
            // number of its own: `minDolly` above is the floor it uses.
            //
            // How near the composed viewpoint counts as being AT it, and it
            // answers that question for two things at once so they cannot
            // disagree: where the aim lets its tree go, and whether the "show
            // the whole garden" control has anything to do. Both need a
            // deadband because the dolly is a continuous value: an exact test
            // would flicker the button on a hair either side of zero, and it
            // would hold an invisible aim forever after a move interrupted in
            // its first millisecond (a dolly of 2e-8 is a hold of 2e-14, which
            // is not zero).
            composedEpsilon: 0.02
        }
    },

    // ---- The trees ----------------------------------------------------------
    tree: {
        // The branch budget. A recursion three deep with three children a node
        // is already a thousand segments, so this is the backstop that keeps a
        // generous slider setting from costing a frame.
        maxSegments: 1200,
        maxSegmentsMobile: 480,
        // Sides on a trunk tube, dropping by one per level of branching down to
        // a floor of three. A twig is a few pixels across and nobody has ever
        // counted its sides.
        trunkSides: 9,
        // Trunk radius as a fraction of the tree's height, before the trunk
        // slider. A ten metre tree with a 28 cm radius trunk is about right.
        trunkRadiusRatio: 0.028,
        // ---- The leaf card --------------------------------------------------
        // A leaf card is a crossed quad wearing an alpha mask, and these two
        // numbers are what make it read as foliage rather than as confetti.
        //
        // MEASURED: at the composed camera's 23.09 m a 0.16 m card covers about
        // five pixels. Five pixels of hard-edged rectangle is the "canopy of
        // cards" the QA screenshots caught. The mask paints roughly the middle
        // half of the quad, so keeping the old size would have made the leaves
        // smaller still. Doubling puts a card near eleven pixels, which is wide
        // enough for neighbours to overlap into a canopy mass instead of
        // reading as separate dots.
        // How far a tree's tip swings, as a fraction of its own height, at a
        // wind of 1.0 and the top of the sine. 0.1 keeps a 10 m tree moving
        // exactly as far as it did before this number existed, and makes every
        // other tree agree with it: a 3 m maple now swings 0.30 m rather than
        // the full 1.0 m it used to, which was a third of the whole tree.
        swayPerMetre: 0.1,

        // ---- Leaf flutter (M8-7) --------------------------------------------
        // A LEAF AND ITS BRANCH ARE TWO MOTIONS, and at one frequency they read
        // as one. The branch runs at 1.35 rad/s; the flutter ran at 1.6, close
        // enough that the two beat slowly and the canopy looked like a rigid
        // thing being pushed. It was also ONE-SIDED, sin * 0.5 + 0.5, so it
        // never came back through rest: at a steady wind that is a static
        // offset with a wobble on it rather than a flutter.
        //
        // 4.6 against 1.35 is a ratio of 3.4, which never lines up, and `cross`
        // adds a component ACROSS the wind so a leaf turns rather than only
        // sliding. Both ride uWind, so they ride the gust envelope for free.
        leafFlutter: {
            rate: 4.6,
            along: 0.16,
            cross: 0.11
        },

        // ---- Reduced motion (M8-9) ------------------------------------------
        // THIS INVERTS THE HOUSE RULE ON PURPOSE. Everywhere else on the site
        // the flag removes movement. Here the movement IS the content, so
        // removing it would be taking the scene away. What is left is a gentle
        // drift. The clock is untouched either way: reduced motion asks for
        // less movement, never for less garden.
        reducedMotion: 0.35,

        leafCardScale: 2.0,
        // Against mask alpha that runs 0.62 to 0.92 in a single blob. Low
        // enough that one blob survives on its own, high enough that the soft
        // edges do not leave a halo.
        leafAlphaTest: 0.45,

        // How many levels of branching carry leaves, counted in from the tips.
        //
        // THIS NUMBER DECIDES WHEN A PLANTED TREE FIRST HAS ANY LEAVES AT ALL,
        // which is not obvious from reading it. Leaves ride the branch that
        // carries them, and the outermost orders are the last to be born, so at
        // 3 levels the first leaf on every species arrived at growth 0.57 to
        // 0.62: more than half of the eighteen minutes from planting to
        // maturity spent looking at a bare stick. Measured cost of going wider,
        // worst case per tree against the 4,000 card budget:
        //
        //   3 levels  2,156 cards  first leaf at growth 0.57 to 0.62
        //   5 levels  2,276 cards  first leaf at growth 0.32 to 0.39
        //   6 levels  2,292 cards  first leaf at growth 0.19 to 0.28
        //
        // Five costs 5 percent and buys back about a third of the wait. Six was
        // not taken: on the depth-7 species it puts leaves on the first order
        // out of the trunk, and a bare lower trunk is most of what makes a
        // redwood read as a redwood.
        leafLevels: 5,
        // What a newly planted sapling looks like: a fraction of mature size,
        // and proportionally MORE slender rather than less, because that is
        // what a young tree is.
        //
        // MEASURED AT THE COMPOSED CAMERA, which is 23.09 m from the middle of
        // the plot (hypot of z 22 and eye height 7) across a 60 degree vertical
        // frame. At 0.14 a planted Japanese Maple stood 0.42 m and covered 1.7
        // percent of frame height, and a Coast Redwood's trunk came out about
        // two pixels wide: the QA screenshots show a hairline, which is the
        // honest rendering of an honest number and still reads as nothing
        // happening. At 0.24 the maple is 0.72 m and the redwood trunk is near
        // five pixels, which is a small tree rather than a scratch.
        saplingScale: 0.24,
        saplingThickness: 0.72
    },

    // ---- Growth, water, and health ------------------------------------------
    garden: {
        // Sapling to mature tree. At a 240 second year that is about 18
        // minutes of watching, which is long enough to feel earned and short
        // enough to see inside one sitting.
        maturityYears: 4.5,

        // Below this, a tree has stopped growing rather than merely slowed.
        // It never goes backwards.
        minGrowthHealth: 0.15,

        // ---- You plant a sapling, not a seed (M10-1) -------------------------
        // A tree planted at age zero is not merely small, it is BARE: the first
        // leaves do not arrive until growth 0.32, so a fresh planting was a
        // colourless twig for the first ninety seconds. That is what QA meant
        // by "the saplings are not even visible".
        //
        // ONLY THE GROWTH STARTS FORWARD. `plantedAt`, `health`, `moisture` and
        // `lastWateredAt` all still start where they started, because the
        // decline schedule is measured from `plantedAt` and backdating it would
        // hand the visitor a tree already part-way through its first drought.
        // The story is a nursery-grown sapling rather than a seed, which is
        // also what a person actually buys.
        //
        // Measured height as a percentage of mature, which is what the note was
        // about rather than the growth number:
        //
        //     age 0    24 percent, and bare
        //     age 1    34
        //     age 2    56          <- here
        //     age 3    80
        //     age 4.5  100
        //
        // TWO IS DELIBERATE AND THREE WAS ASKED FOR. At three a Bur Oak goes
        // into the ground at 11.2 m of its 14 and there is almost nothing left
        // to watch, which gives away the one thing the care loop pays for. Two
        // is plainly a young tree, carries leaves from the first frame, and
        // leaves nearly half the arc still to come. See PRD Addendum D.1: this
        // is a screenshot decision and the number is here to be moved.
        plantAgeYears: 2,

        // ---- The mulch bed (M10-2, M10-3, M10-4) ----------------------------
        // A round bed of raised mulch under every planted tree. It grounds a
        // sapling that would otherwise look pasted onto a lawn, it carries the
        // water level, and above all IT IS THE TREE'S TAP TARGET.
        bed: {
            // 1.28 m across against a 1.5 m planting grid, so two beds on
            // adjacent cells leave 0.22 m of grass between them and can never
            // overlap. That is what makes the tap unambiguous by construction
            // rather than by tuning, and the grid is also the ceiling on how
            // wide a bed may get in the name of being seen.
            radius: 0.64,
            taper: 0.86,        // top radius as a fraction of the bottom
            segments: 20,
            // The bed spans from `skirt` below the lowest ground it covers to
            // `lip` above the highest, so nothing buries and nothing floats.
            // Capped, or the steepest corner of the plot draws a pillar.
            // THE LIP IS THE ONLY PART OF A BED THAT IS NOT FORESHORTENED,
            // and that is why it is this deep. The camera looks along the
            // ground at about 17 degrees, so the top face of a bed at the back
            // of the plot is FIVE PIXELS tall while a Coast Redwood's trunk is
            // nine pixels wide straight through the middle of it: QA reported
            // the mulch as missing, and the probe proved it was drawn, in the
            // scene, visible, and simply too small to see. A vertical edge
            // survives the view angle where a flat disc does not, so raising
            // the lip buys more legibility than widening the bed ever could,
            // and the grid caps the width anyway.
            lip: 0.24,
            skirt: 0.06,
            // Room for the lip on top of the worst slope the plot has, or the
            // cap quietly eats the edge exactly where the ground is steepest.
            maxHeight: 0.75,
            color: 0x4a3527,
            // How far toward the snow a covered bed goes. NOT ALL THE WAY: at
            // 1.0 it came out a flat uniform white against ground that carries
            // a thaw pattern and a grass mottle, and QA read the beds as a row
            // of pale slabs. It is also the tap target, so a bed that vanishes
            // under snow takes the care loop with it for a quarter of the year.
            snowMix: 0.78,

            // ---- Picking ----------------------------------------------------
            // THE BED IS NEVER RAYCAST. Measured on a 1280x800 frame, a bed of
            // this radius is 60 x 30 px at the near edge of the plot, 36 x 11
            // in the middle and 24 x 5 at the far edge, because the camera
            // looks along the ground at about 17 degrees. Five pixels tall is
            // not a touch target and a bigger bed cannot fix it: at 1.5 m
            // spacing, one tappable at the back would swallow its neighbours
            // at the front. So the pick is done in screen space against the
            // projected base points. See beds.js.
            //
            // The radius follows the drawn bed, with a floor so the back row
            // stays reachable. Measured, the floor binds everywhere except the
            // front of the plot: half-widths run 30 px near, 18 mid and 12 far,
            // so most beds get a slightly generous target. That costs little,
            // because `nearestFreeCell` already snaps a planting tap to the
            // nearest spot that works and planting never needed pixel
            // precision in the first place.
            minPickPx: 22,
            pickScale: 1.0,

            // ---- The water level --------------------------------------------
            // An upright camera-facing bar at the front of the bed. Always
            // present, always showing how full the tank is, so the whole garden
            // can be read at a glance instead of only the trees that have
            // already crossed a threshold.
            // Measured on a 941 px frame: at these metres alone the bar was
            // 24 x 3.3 px in the middle of the plot and 17 x 2.3 at the back,
            // and three pixels cannot show a fraction of anything. So it has a
            // FLOOR IN PIXELS as well, which holds it near 31 x 7 px right
            // across the plot and lets it grow past that once the dolly brings
            // the eye close. Seven is chosen against the 1.5 m planting grid:
            // two adjacent trees are 41 px apart at the back of the plot, and
            // at this aspect a 7 px bar is 31 px wide, so neighbours never
            // collide.
            levelWidth: 0.44,
            levelHeight: 0.10,
            minLevelPx: 8,
            levelLift: 0.05,
            levelOpacity: 0.95,
            // MEASURED IN SHOWN LUMINANCE, against the two things the gauge
            // ever lies on: mulch (0.125) and snow (0.822). The first version
            // put the track at 1.53:1 against mulch and the fill at 1.32:1
            // against snow, so on a bed you could see the water and not the
            // tank, and in winter the other way round. A MID-VALUE TRACK reads
            // on both (2.13:1 and 2.34:1) and gives the best internal reading,
            // which is the one that matters: fill against track is 2.05:1, and
            // that IS the gauge.
            levelTrackColor: 0x59666d,
            // The blue the thirst droplet used to be, which this replaced.
            levelFullColor: 0x8fd3f4,
            // ---- THE AMBER IS ON THE DRY SIDE, NOT THE WET ONE (M13-1) ------
            // It used to tint the FILL, as `mix(uFull, uEmpty, urgency)`, and
            // the fill is the part that is not there when the tank is empty.
            // So the colour built to signal thirst was, by construction, the
            // one colour that could never be seen at maximum thirst: at
            // moisture 0 the whole gauge was track and rim, which measures
            // 2.13:1 and 2.71:1 against the mulch it lies on. QA read a row of
            // dead trees as having no gauges at all, and was right.
            //
            // Painted on the DRY side it is the empty tank that goes amber,
            // which is 3.87:1 on mulch, and the fill stays blue and means
            // water. Measured against every ground the gauge lies on:
            //
            //                  mulch  snowy bed  summer grass
            //     blue fill    4.37       1.03       1.80
            //     amber dry    3.87       1.16       1.59
            //     rim         *2.71     *12.14      *6.57
            //
            // Starred is the one carrying that background, and after this
            // change every background has one at 3:1 or better. Mulch was the
            // only one that did not, and mulch is the one it is always on.
            levelEmptyColor: 0xf0a63c,
            // ---- AND A DARK TICK AT THE FILL EDGE ---------------------------
            // Blue against amber is 1.13:1, because they are a hue pair and
            // not a luminance pair. The BOUNDARY between them is the whole
            // reading of a gauge, so it gets drawn rather than left to emerge:
            // a tick in the rim colour, which is 11.82:1 against the water and
            // 10.47:1 against the dry side. It is also what keeps the gauge
            // readable without colour vision, which the hue pair alone would
            // not be. Drawn only when there is a boundary to draw, so a full
            // tank and an empty one stay unbroken.
            //
            // IN THE SAME UNITS AS `levelBorder`, which is bar HEIGHTS: the
            // shader scales the x distance by the aspect, so both numbers mean
            // the same thing whatever the bar's proportions are. The bar floors
            // at 8 px tall, so 0.11 is a tick 1.76 px wide against a rim of
            // 1.44, which is the narrowest an edge can be and still survive
            // being resampled.
            levelTickWidth: 0.11,
            // A rim, worth more than any colour at 35 x 8 px: 2.71:1 against
            // mulch and 13.5:1 against snow, so the gauge has a silhouette
            // whatever it is standing on.
            levelBorderColor: 0x0d1418,
            levelBorder: 0.18,
            // How visible a FULL tank is, as a fraction of the empty one. It
            // was 0.35, which is where "quiet when full" tipped over into
            // "cannot be read at all". Urgency is carried by the colour now.
            levelQuiet: 0.82,
            // QUIET WHEN FULL. Addendum B took everything out of this frame
            // that competed with the swaying, and this milestone puts sixteen
            // small readouts back in. A level stays nearly transparent until
            // the tank is down to here, so a healthy garden looks like a garden
            // and only a thirsty one looks like it wants something.
            noticeAbove: 0.55,

            // ---- The droplet, which is a BUTTON (M13-2) ---------------------
            // A tap on the droplet waters that tree on the spot. It is drawn
            // above the gauge, and both come off the same world anchor and the
            // same two numbers below, so what is drawn and what is tappable
            // cannot drift apart. Same rule as `radiusPx` on the bed.
            //
            // SIZED AND LIFTED IN PIXELS, for the reason the gauge is: the
            // gauge floors at 8 x 35 px right across the plot, so a droplet
            // placed a fixed number of METRES above it would sit on top of the
            // gauge at the back row and halfway up the trunk at the front.
            dropSizePx: 17,
            // ---- THE RISE IS SET BY THE TAP, NOT BY THE LOOK ----------------
            // Measured on a 1280x800 frame, from the gauge's anchor: the gauge
            // itself floors at 8 px, so its top edge is 4 px up, and the bed's
            // own base point is 3 to 4 px DOWN. That is the whole of the room
            // there is, and both targets have to fit in it.
            //
            //   droplet target   26 rise - 22 radius = 4 px above the anchor,
            //                    so about 7.5 px above the bed's base point
            //   bed target       a 22 px circle on the base point, of which
            //                    everything below that line survives
            //
            // Which leaves the droplet a 44 px circle and the bed a band 29 px
            // tall and 44 px wide. A shorter rise buys the droplet nothing it
            // does not already have and takes the tree card's only route away,
            // and this is the number to move if QA finds the card hard to open
            // on a thirsty tree.
            dropRisePx: 26,
            // ---- WHY THE TARGET IS BIGGER THAN THE DRAWING ------------------
            // A 17 px droplet is not a touch target: 44 px is the figure, and
            // a radius of 22 is how you get one. The drawing stays small
            // because a 44 px droplet over a 30 px bed would look like weather
            // rather than like a control.
            //
            // The two targets DO overlap, and that is expected rather than
            // tolerated. `pickDrop` is tried first and `pickBase` second, so
            // what settles a tap in the overlap is an order and not a distance
            // of a couple of pixels. A tree with no droplet is untouched by any
            // of this.
            dropPickPx: 22,
            // A droplet only exists on a tree that is asking, so it fades in
            // across the last of the thirst rather than appearing at a hard
            // edge. `garden.moisture.thirstyBelow` is where it starts.
            dropFadeSpan: 0.08,

            // ---- MAKING IT LOOK PRESSABLE (M13-4) --------------------------
            // The first version shipped a size pulse of 0.06 and QA reported
            // the droplet did not look tappable. Both are true at once: the
            // pulse was there and it was worth about HALF A PIXEL on a 17 px
            // drawing, which is not a signal, it is a rounding error. A swell
            // is also the weakest motion available at this size, because the
            // eye reads a change of POSITION far more readily than a change of
            // extent. So the swell stays small and two better signals join it.
            dropPulse: 0.07,
            dropPulseHz: 0.55,
            // A BOB, which is the change of position. Two pixels of travel at
            // 17 px reads from across the plot where two pixels of swell does
            // not, and a droplet that rises and settles is the one motion this
            // shape is expected to make.
            dropBobPx: 2.0,
            // ---- AND A RING, which is the part that says "press me" --------
            // An expanding ring is the one idiom that means "tap here" without
            // words, and unlike the drawing it is allowed to be large, because
            // it is gone again a moment later. It sweeps from the droplet's own
            // edge out to the edge of the TARGET, so what a visitor watches is
            // the actual size of the thing they have to hit.
            // ---- AND THE RING NEEDS AN EDGE, for the same reason the gauge
            // and the droplet do. Measured against summer grass, the droplet's
            // blue is 1.80:1 and even pure white is only 2.10:1, so no colour
            // wins there on luminance and picking a brighter one is just
            // picking a losing number more loudly. What wins is a boundary: the
            // ring is light on its inside and takes the droplet's own dark
            // outline on its leading edge, which is 6.57:1 on that same grass.
            // A soft halo on mulch at night and a visible edge on daylight
            // grass, from one shape.
            levelRingColor: 0xe6f6ff,
            dropRingSeconds: 2.8,
            // How much of the cycle the ring is travelling. The rest is the
            // pause, and the pause is what keeps sixteen of these from reading
            // as a second weather system.
            dropRingSweep: 0.42,
            dropRingWidth: 0.075,
            dropRingOpacity: 0.5,
            // The quad has to be wide enough to hold the ring at full reach.
            // The droplet is drawn at its own size inside it, so this number
            // changes the room and never the drawing.
            dropCardScale: 2.7,
            // ---- HOVER, which is the desktop half of the answer ------------
            // A pointer is the one input that can ask "what is this" before
            // committing, and the web's answer has always been the cursor. The
            // canvas takes a pointer cursor over a droplet and the droplet
            // itself swells and brightens, so a mouse visitor knows it is a
            // control before they press it rather than after.
            dropHoverGrow: 0.22,
            dropHoverLift: 0.35
        },

        moisture: {
            // A full tank lasts exactly one thirst window, so a diligent
            // visitor waters each tree about once a year and a slightly late
            // one is never punished for it.
            windowsPerFill: 1,
            // THERE IS NO `rainFill` AND THAT IS DELIBERATE. Precipitation used
            // to deliver 2.39 tank-fills a year against a drain of 1.00, so the
            // care loop was arithmetically dead. Nothing waters a tree now
            // except the visitor, and the reasoning is in `moistureAfter`.
            // The thirst marker appears below this.
            thirstyBelow: 0.25,

            // ---- "Water all" APPEARS AT ONE THIRSTY TREE (QA 2026-08-31) ----
            // It was three, and the reasoning was about protecting the care
            // loop: M11-4 took the free water out of this scene so that nothing
            // waters a tree but the visitor, and a permanent Water all would
            // hand that straight back, becoming the only control anybody used
            // while the droplets turned into decoration. One or two thirsty
            // trees was called the ordinary state of a garden being tended.
            //
            // THE ARGUMENT WAS SOUND AND IT WAS ANSWERING THE WRONG QUESTION.
            // This button is also THE KEYBOARD'S ONLY ROUTE TO THE CARE LOOP: a
            // tree is reachable only by tapping a few pixels of 3D canvas, and
            // the droplet (M13-2) took away the tree card's own Water button
            // for exactly the trees that need watering. So at one or two
            // thirsty trees a visitor without a pointer could not water at all.
            // The threshold was not protecting the loop from being too easy, it
            // was closing it for part of the audience, and the shape of a
            // garden that has ONE thirsty tree is precisely when a keyboard
            // visitor most needs a way in.
            //
            // The droplets are unharmed: they are still the one-tap route and
            // still the only one that works on a specific tree.
            waterAllFrom: 1
        },

        // ---- Blossom and fruit (M11-6, M11-7) -------------------------------
        // Shared shape. The HOURS are per species and live in species.js beside
        // the foliage colours, because an orange ripening through midwinter is
        // a fact about oranges and not a global.
        fruit: {
            // How big newly set fruit is, as a fraction of ripe size. Not zero
            // and not small: a single ramp from nothing to full across six
            // in-world hours spends the whole of high summer at a size that
            // reads as a rendering artefact rather than as a young fruit.
            setSize: 0.30,

            // ---- Fruit has to be EARNED, and these two gates are why the
            // feature is worth building at all -------------------------------
            // M11-4 took away the free water, which leaves the honest question
            // of what showing up buys the visitor. This is the answer: fruit is
            // the first thing in this scene that care BUYS rather than merely
            // preserves.
            //
            // A SAPLING DOES NOT FRUIT. Planting growth is 0.444
            // (`plantAgeYears` 2 over `maturityYears` 4.5), so a first blossom
            // at 0.62 is a little under an in-world year of watching away. Real
            // orchard trees take three to five years to bear, and this is the
            // same promise at the scene's own scale.
            bearFrom: 0.62,
            bearFull: 0.85,

            // A NEGLECTED TREE DOES NOT FRUIT EITHER. Nothing at or below the
            // `failing` band, a full crop by 0.75. The lower number is
            // deliberately `health.failingBelow` rather than a new one, so the
            // crop and the words the tree card already uses agree by
            // construction.
            cropFrom: 0.25,
            cropFull: 0.75,

            // ---- Sized against the scene budget, not by eye ------------------
            // These two are a share of the LEAF CARD count, and the first pass
            // at 0.55 and 0.12 cost 43,776 triangles for sixteen cherries in
            // blossom against a scene already measured near 371,600 of its
            // 400,000. That is not a tuning question, it is the wood's entire
            // remaining headroom spent on flowers.
            //
            // A BLOSSOM CARD IS A CLUSTER, WHICH IS WHAT MAKES THE SMALLER
            // NUMBER FREE. The mask draws five flowers per card, exactly as a
            // leaf card draws nine leaves, so one card per four or five leaf
            // clusters is still hundreds of flowers on a tree. Measured at
            // these values, worst case sixteen cherries in blossom: 303 cards
            // a tree, 4,848 instances, 19,392 triangles. Under 5 percent of the
            // budget, against 43,776 before.
            //
            // Fruit is per-card rather than per-cluster, so its number is the
            // one that has to read as a real count. Measured: 40 apples on an
            // apple tree, 48 oranges, 82 pears, 96 cherries. These two are the
            // levers if it bites on mobile, not the feature.
            density: 0.07,
            // Blossom is far denser than fruit, because most flowers never set.
            // Drawn from the same anchors, so this is a share of them.
            blossomDensity: 0.22,
            // ---- Metres across the CARD, and it is a PIXEL decision -----------
            // SIZED IN PIXELS, NOT IN BOTANY, and the first pass got this
            // exactly backwards. At 0.11 m the drawn fruit measured 1.6 px at
            // the composed camera and a cherry measured 0.9, so the whole
            // feature was invisible on the screen while being perfectly correct
            // in the data. Third time in this scene: the mulch beds were 22x5
            // px and the water level was 24x3.3.
            //
            // AND TRUE SCALE CANNOT WORK HERE, which is the part worth keeping.
            // Measured on a 1280x800 frame with a tree at the middle of the
            // plot, a LIFE-SIZE apple is 2.8 px and a life-size cherry is 0.7.
            // The scene's own precedent is the answer: a leaf card is a clump
            // of NINE leaves at 0.425 m and reads 14.7 px, which is what it
            // takes. So a fruit card is a CLUSTER of three, drawn a little over
            // life size, and it lands in the same range.
            //
            // The mask spends 82 percent of the card on the blossom and
            // between 49 and 62 percent on the fruit cluster, which is now a
            // different drawing per species (`FRUIT_SHAPES` in tree.js). A
            // pear spends part of its card on the neck and a cherry most of
            // its own on two long stalks, so the share is theirs rather than
            // shared. Measured at 0.50 with the per-species multipliers in
            // species.js, on a 1280x800 frame, tree at the middle of the plot:
            //
            //              cluster   at back edge   one fruit   blossom
            //     apple     10.0 px      6.5 px       4.2 px     13.3 px
            //     pear       9.3         6.1          4.3        15.3
            //     orange     8.3         5.5          3.8        11.9
            //     cherry     7.2         4.6          3.1        12.0
            //
            // Individual fruit stay a few pixels, exactly as individual leaves
            // inside a leaf clump do, and nobody counts those either. What
            // carries at this distance is the CLUSTER and its colour.
            //
            // `tests/garden-tree.test.mjs` asserts these in PIXELS. A metre
            // value on its own has never once been the thing that was wrong.
            size: 0.50
        },

        health: {
            // 1/6 per fully dry year, so three dry summers reaches 0.5 (the
            // wilt) and six reaches 0 (bare). Straight from the requirements.
            dryPerYear: 1 / 6,
            // Three watered summers bring a bare tree all the way back.
            recoverPerYear: 1 / 3,
            wiltBelow: 0.5,
            failingBelow: 0.25,
            bareBelow: 0.05
        },

        bud: {
            // THE IMMEDIATE REWARD. Watering an unhealthy tree puts buds on it
            // within this many seconds, in ANY season, or the visitor will not
            // believe the tree can come back.
            riseSeconds: 1.5,
            // Health at or below which watering triggers the reward at all. A
            // healthy tree gets a quieter acknowledgement instead.
            below: 0.6,
            // The buds hand over to real leaves once the season has produced
            // this much natural canopy. In autumn and winter that never
            // happens, so they hold as a promise until spring.
            handoverLeaf: 0.35
        }
    },

    // ---- The world beyond the wall ------------------------------------------
    // A CLEARING WITH A VIEW. Woods close east, west and south; the north
    // opens onto meadow, a pond and mountains. The camera looks north, so the
    // opening is away from the viewer, which is where depth belongs.
    //
    // Every number here was measured against the fixed frame rather than
    // guessed. See PRD Addendum A for the table: a 16 m tree in the side
    // forest reaches 96 percent of frame height, the pond band sits at 56, and
    // a ridge at 340 m lands at 90. `camera.far` is 400, so nothing may be
    // placed past it, and scene fog is total past 260, so the mountains carry
    // their own aerial perspective instead.
    world: {
        // ONE SEED FOR THE WHOLE WOOD. Every tree, bush and flower outside the
        // wall is placed from this, so the surroundings are the same
        // surroundings on every visit, exactly like the planted trees.
        seed: 0x5EED1E,

        clearing: {
            // Where the woods begin, measured from the plot centre. The plot
            // is 12 m half-width, so this leaves a margin of grass around the
            // wall before the trees start.
            innerRadius: 16,
            // How far it takes the wood to reach full density. A hard edge
            // reads as a hedge rather than as a forest.
            rampWidth: 9,

            // The northern opening. It widens with distance so the view
            // funnels outward rather than running down a corridor.
            openFromZ: -14,
            // THE LAKE CAN ONLY BE AS WIDE AS THE GAP IT SITS IN, which is what
            // turned "make the pond a lake" into a change to the clearing. At
            // 15 and 0.30 the opening was 21 m either side at the water's
            // depth, so a lake filling it spanned 37 percent of frame width and
            // still read as a pond. At 20 and 0.42 the gap is 31.8 m and the
            // water spans about 61 percent, which is a lake.
            //
            // Widening the gap also suits M8: it takes wood out of the one
            // direction the scene is composed to look along, and PRD Addendum B
            // wants sky between the trees rather than a wall of them.
            openHalfWidth: 20,
            openSpread: 0.42,

            // How far out the wood is drawn at all.
            // Out to the fog ceiling. Past about 135 m a tree shows at less
            // than 63 percent and we would be re-walking the M7-5 mountain
            // trap: painting trees the colour of the sky behind them.
            outerRadius: 135
        },

        // Gentle relief beyond the plot. Zero at the plot boundary (so the
        // seam stays perfect) and growing outward, which is the mirror of the
        // edge damp that flattens the plot's own relief at its edge.
        outerRelief: {
            rampFrom: 12,
            rampOver: 22,
            waves: [
                { amp: 1.15, fx: 0.031, fz: 0.027, phase: 1.3 },
                { amp: 0.55, fx: 0.062, fz: -0.048, phase: 3.9 }
            ]
        },

        meadow: {
            // The ground beyond the plot. Segmented, unlike the old flat
            // surround, so the outer relief has vertices to move.
            size: 360,
            segments: 96,
            segmentsMobile: 56
        },

        // ---- The far forest -------------------------------------------------
        // Instanced crossed quads. THE FIXED CAMERA IS WHAT MAKES THIS WORK:
        // impostors betray themselves when a viewer walks around them, and
        // ours only pans a little.
        //
        // A real fractal tree here would be fifty triangles per pixel: at 40 m
        // a tree covers about 60 pixels, and 120 of them at 3k each is 360k
        // triangles on their own, against a whole-scene budget of 400k.
        farForest: {
            // HOW CLOSE A SOLID IMPOSTOR MAY COME TO THE EYE. The near treeline
            // gets 12 m and that is right for it: a fractal tree at 12 m is
            // see-through. An impostor is a crossed quad with an opaque canopy,
            // so at the same distance it is a wall, and one of them filled the
            // left fifth of the frame. Measured: at 18 m tall (this tier's
            // maximum) a tree subtends about 40 degrees of the 60 degree frame
            // at 25 m, and the whole frame at 16 m.
            minCameraDistance: 26,
            // THE FLAT TIER IS A HORIZON CLOSER NOW, NOT A WOOD. It used to
            // start at the clearing edge and do middle-distance work it was
            // never built for, which is why it read as a row of cut-outs. M8-4
            // gives that ground to real trees and this starts where they stop.
            // Back IN to 30 m, to meet the real trees where they stop. Pushing
            // this out to 52 left the middle distance to deeply cut fractal
            // trees, and they are worse at that distance than the flat ones
            // they replaced: see the note on nearTreeline.tiers.
            minRadius: 30,
            // Trunks and limbs. The canopy texture marks wood in its green
            // channel so the season can tint the leaves without tinting this.
            barkColor: 0x4a3b2c,
            spacing: 5.2,
            spacingMobile: 7.4,
            jitter: 0.42,
            minHeight: 9,
            maxHeight: 18,
            // How much of the wood keeps its needles through winter.
            evergreenShare: 0.42,
            // ONE THRESHOLD, ALL YEAR. It used to be raised for winter on the
            // theory that the texture's opaque branches would survive it while
            // its softer leaves would not. THEY DID NOT: the 34 foliage blobs
            // composite source-over, so where three overlap the alpha reaches
            // 0.97 and the old winter value of 0.82 could not touch them, while
            // any value that could would have eaten the mipped branches this
            // threshold exists to protect. See the note in buildFarTier.
            //
            // The bareness now lives in the fragment mask, so `bareAlphaTest`
            // is GONE rather than set to something. A live-looking knob that
            // does nothing is how somebody loses an afternoon later.
            leafyAlphaTest: 0.34,
            textureSize: 128
        },

        // ---- The near treeline ----------------------------------------------
        // Real fractal trees at reduced recursion, close enough that their
        // silhouette is what the eye reads. These carry the join: without
        // them the impostor wood starts abruptly.
        nearTreeline: {
            // ---- THE MIDDLE DISTANCE IS REAL TREES NOW (M8-4) ---------------
            // Three tiers, cut deeper the further out they stand, because
            // recursion is what costs and distance is what hides it. Measured
            // cost per tree, averaged over the twelve species, bark triangles
            // plus two per leaf card:
            //
            //   -1  2,683    -2  1,395    -3  711    -4  424
            //
            // And the budget is tighter than PRD Addendum B guessed. Measured
            // rather than estimated: 16 mature planted trees are 276,896 of the
            // 400,000, the impostors 5,324, and the rest of the scene about
            // 34,961. That leaves 82,819 for this wood once the old 16-tree
            // treeline gives its 22,320 back. These tiers come to 79,153 for
            // 115 trees, which is a fifth of the 1,331 impostors they replace.
            //
            // A fifth is the right scene, not a compromise. A dense mat is what
            // you need when the trees are cardboard and their job is to fill a
            // hole. When the trees are the subject you want sky between them.
            // FEW, NEAR, AND LIGHTLY CUT. The first version of this ran 104
            // trees out to 52 m at cuts of -2, -3 and -4, and QA called it a
            // tangled mess, which it was. Measured why, and it is not the count:
            //
            //   cut   segments   leaf cards   leaves per segment
            //    -1      276        546             2.0
            //    -2      109        216             2.0
            //    -3       48         94             2.0
            //    -4       24         45             2.0
            //
            // The ratio never moves, so a deep cut does not strip foliage
            // relative to wood. WHAT IT STRIPS IS THE FINE STRUCTURE. A real
            // tree's silhouette is made of thousands of twigs; cut to 48
            // segments you keep the long structural branches and delete
            // everything that would have hidden them, so you get an antenna.
            //
            // The conclusion that follows: **past about 30 m a deeply cut
            // fractal tree is strictly worse than an impostor**, which at least
            // has a coherent canopy. So the real trees stop at 30 m and the flat
            // wood starts there. 26 trees where there were 104.
            tiers: [
                { count: 12, countMobile: 7, minRadius: 16, maxRadius: 24, depthReduction: 1, species: 5 },
                { count: 14, countMobile: 8, minRadius: 24, maxRadius: 30, depthReduction: 2, species: 5 }
            ],
            // What the tiers above are allowed to add up to, asserted, so a
            // tier that grows has to be paid for out of another one. 104 trees
            // come to 72,392, which leaves the whole scene near 390,000.
            triangleBudget: 75000,
            minScale: 0.75,
            maxScale: 1.25,

            // How many leaf cards one treeline skeleton carries. THESE TREES
            // NEED FOLIAGE OR THEY ARE THE ONLY BARE THING IN A SUMMER FRAME,
            // and a bare armature at this distance reads as broken scenery
            // rather than as a tree. Sampled down from the full leaf set the
            // planted trees use, because at 17 m and beyond the silhouette is
            // all that survives: 400 cards is 800 triangles per species, and
            // 16 instances of that is 12,800 against the 60k of headroom
            // Addendum A left spare.
            // RAISED, because the cap was biting exactly where it hurt. A tree
            // at -1 has 546 leaf clumps and only 400 were being kept, so the
            // lightest cut was also the one being thinned most. And the cards
            // were 6 to 11 px at 30 m, too small to merge into a canopy: at 3.6
            // a bur oak's clump is 0.61 m, about 16 px, which reads as foliage
            // rather than as specks on a wire.
            // ---- WINTER IS A SHED, NOT A THRESHOLD (QA 2026-08-31) --------
            // `bareAlphaTest: 0.99` used to live here, and no value could have
            // worked. The cluster mask paints nine ellipses at 0.62 to 0.92
            // alpha and they COMPOSITE: three overlapping clumps reach 0.99 and
            // five reach a flat 1.0, so the core of every canopy passed any
            // threshold a leaf could also pass, and the wood kept solid crowns
            // on branches too thin to see at 20 m. QA read it exactly as it
            // looked: leaves floating in the air (garden-1 through garden-3).
            //
            // So the canopy sheds on the material's OPACITY instead, which
            // scales the alpha the fixed threshold then reads. That is the same
            // move the flat tier's fragment hook makes, and it is exact at
            // every density of overlap because it scales rather than compares.
            // A leaf pixel survives while `mask * (1 - shed) >= leafyAlphaTest`,
            // so the canopy thins from its soft edges inward and is gone
            // outright once the shed completes.
            //
            // COMPLETED BEFORE THE DROP ENDS, at 0.86 of it, which is hour 20.3
            // of a drop that runs 18 to 21. The last stretch of the fall is
            // when a real wood is already bare, and finishing early is what
            // guarantees that midnight is never the hour the last clump pops
            // out of existence.
            shedBy: 0.86,
            leafCards: 700,
            leafScale: 3.6,

            // ---- THE CAMERA STANDS INSIDE THIS RING ----------------------
            // The ring is measured from the plot centre and runs 17 to 38 m.
            // The camera sits at z = 22 and a portrait phone dollies it
            // straight back down the +z axis, so the eye travels through the
            // band rather than sitting outside it. Without a keep-out the
            // generator is free to plant a 17 m tree a couple of metres in
            // front of the eye, and the visitor spends the whole visit looking
            // up through one trunk's branches.
            //
            // `dollyToZ` is where the dolly ends at the narrowest aspect worth
            // supporting: z = focusZ + minHalfWidth / (tan(portraitFov / 2) *
            // aspect), which is 9 / (0.7265 * 0.32) = 38.7. `clearance` is a
            // horizontal distance from that whole segment, set wider than a
            // mature crown's radius so the eye stays outside the drip line
            // rather than merely outside the trunk.
            cameraKeepOut: {
                // THE EYE NOW TRAVELS A LONGER TRACK THAN THIS NUMBER KNEW
                // ABOUT. It used to describe the portrait dolly alone, z 22 to
                // 39, because that was everywhere the camera had ever been.
                // `clearsCamera` reads the dolly track's own ends as well, so
                // this is the backstop rather than the whole story.
                dollyToZ: 39,
                clearance: 12
            }
        },

        // ---- The pond -------------------------------------------------------
        // A HORIZONTAL PLANE SEEN FROM A SHALLOW ANGLE IS COMPRESSED, and no
        // amount of tuning changes that: from this camera the water occupies a
        // band about four percent of frame height. It is made WIDE rather than
        // deep for that reason, and it reads through brightness and sky
        // reflection the way a river seen from a hillside does.
        //
        // Sat in the northern opening, offset east so the low morning sun lays
        // its glitter path back toward the viewer.
        pond: {
            // CENTRED, because a lake that fills the opening has water under
            // wherever the sun happens to be. The old offset of -4 existed to
            // lay the morning glitter path back toward the viewer, and it cost
            // 4 m of width to do it: with water spanning the whole gap the
            // glint lands on the lake regardless, so the reason has dissolved.
            x: 0,
            // Further out and much deeper front to back. A horizontal plane at
            // this angle is compressed brutally (PRD A.1), so depth in z is
            // what buys height in frame: 10 to 16 takes the water from about
            // 4.3 percent of frame height to 5.5.
            z: -42,
            halfDepth: 16,
            // There is NO halfWidth here on purpose. It is derived from the
            // opening by `pondHalfWidth` in terrain.js, so the water cannot be
            // given a width that puts trees in it. This is the band of dry
            // ground left between the water and the wood.
            shoreMargin: 2.0,
            // ---- THE GROUND UNDER THE LAKE IS LEVELLED (M14-5) -----------
            // In basin radii: fully flat inside `from`, back to open meadow by
            // `to`. A basin dug into rolling ground is a dent in a hillside
            // rather than a bowl, and the meadow rose 3.7 m across this one, so
            // the west end sat a metre under the waterline and the east end
            // stood 1.9 m proud of it. A third of the lake bed was dry land and
            // the real waterline fell at x = +12 instead of +29.
            //
            // `to` is well outside the basin on purpose: the blend has to
            // finish clear of the water, or the waves come back inside the lake
            // and the problem returns in miniature. It is also wide, 0.65 of a
            // radius or about 19 m, so the meadow returns as a slope rather
            // than as a terrace rim around a flat disc.
            shelf: { from: 1.15, to: 1.8 },
            // How far the ground is dug out, and how much of that is filled.
            // Less than full, so there is a band of damp shore.
            depth: 1.9,
            // HOW FAR BELOW THE RIM THE WATER SITS, as a fraction of the dig.
            // This decides how much of the basin is actually WET, and it reads
            // backwards: a LOWER number is a FULLER lake. Measured water
            // half-width against the 29 m basin, and share of frame width:
            //
            // ---- RE-MEASURED AFTER THE BED WAS LEVELLED (M14-5) ----------
            // The old table was taken against a rectangle of water on tilted
            // ground, where the visible lake was whatever the terrain left of
            // it: 41 m across, off centre, and 35 percent of a 1280 frame. On
            // a level bed the water fills the basin evenly and the numbers
            // mean what they say. Half-width, the grass bank left between the
            // waterline and the basin rim, and share of frame width:
            //
            //   0.15  21.9 m   7.1 m bank   37%
            //   0.10  23.3 m   5.7 m bank   39%
            //   0.07  24.3 m   4.7 m bank   41%
            //   0.05  25.1 m   3.9 m bank   42%
            //   0.03  26.0 m   3.0 m bank   44%
            //
            // 0.07 is more water than the scene has ever actually shown and
            // still leaves a bank wide enough to read as a shore. The bank is
            // the thing the old comment called a band of damp shore, and on a
            // level bed it is finally the same all the way round.
            fill: 0.07,
            // Still water, so the ripples are small and slow.
            // THE PLANE IS NOW THREE TIMES THE OLD SIZE and the ripple scale
            // did not move with it, so the pattern repeated about eight times
            // across the water and read as diagonal stripes on fabric. Finer
            // and shallower: at this distance a ripple should disturb the
            // reflection, not draw a pattern in it.
            rippleScale: 2.6,
            rippleSpeed: 0.28,
            rippleHeight: 0.018,
            bodyColor: 0x24402f,
            // How reflective the surface is when looked at straight down. Real
            // water is about 2 percent, and the Fresnel term takes it to
            // nearly 1 at the grazing angles that matter here.
            baseReflectance: 0.02,
            // Winter. The freeze follows the same snow coverage everything
            // else does, so the pond and the ground change together.
            iceColor: 0xcfdce6,
            snowOnIce: 0.55
        },

        // ---- The mountains --------------------------------------------------
        // SCENE FOG IS TOTAL PAST 260 m, so a ridge drawn with fog on is an
        // invisible ridge. These carry `fog: false` and compute their own
        // aerial perspective, tinting toward the sky's horizon colour. That is
        // how a real range reads anyway. `camera.far` is 400, so they must sit
        // inside it: at 340 m a 110 m ridge lands at 90 percent of frame
        // height, just under the top edge.
        mountains: {
            layers: [
                // SEGMENTS ROSE WITH THE SPREAD, or the same profile stretched
                // over 1.7 times the arc and the ridgeline went soft. 952
                // triangles for the pair, which is nothing.
                { distance: 340, height: 112, roughness: 0.42, haze: 0.72, segments: 440 },
                { distance: 285, height: 74, roughness: 0.55, haze: 0.5, segments: 377 }
            ],
            // ---- HALF-ANGLE OF THE ARC, AND IT IS SET BY THE CAMERA -------
            // Centred on north. It was 62, which is short on EVERY landscape
            // aspect once the view is panned, and QA caught the range simply
            // stopping with pale sky beyond it.
            //
            // Two things add up and only the first was accounted for. The
            // camera's `fov` is VERTICAL, so the horizontal half-angle is
            // atan(tan(fov/2) * aspect) and grows with the window: 37.6 degrees
            // at 4:3, 45.8 at 16:9, 53.4 at 21:9. The pan then adds its own
            // 31.5 on top, and the pan is why this is not simply a wide-screen
            // bug:
            //
            //     4:3     37.6 + 31.5 =  69.1   short by  7.1
            //     16:9    45.8 + 31.5 =  77.3   short by 15.3
            //     21:9    53.4 + 31.5 =  84.9   short by 22.9
            //     32:9    64.0 + 31.5 =  95.5   short by 33.5
            //
            // ---- AND A THIRD TERM ARRIVED WITH THE FOCUS MOVE -------------
            // `camera.focus` turns the COMPOSED AIM to a newly planted tree,
            // which is a third rotation on top of the two above and by far the
            // largest. Its worst case is set by the plot's own half-width and
            // the focus `clearance`: the eye stops 8 m in front of a tree that
            // can be 9 m off the track, so atan(9/8) = 48.4 degrees, and the
            // pan then composes on top of THAT rather than on north.
            //
            //     4:3     48.4 + 37.6 + 31.5 = 117.5
            //     16:9    48.4 + 45.8 + 31.5 = 125.6
            //     21:9    48.4 + 53.4 + 31.5 = 133.3
            //     32:9    48.4 + 64.0 + 31.5 = 143.9
            //
            // ---- AND THEN THE PAN TERM STOPPED BEING A CONSTANT -----------
            // `camera.portrait.pan.maxAngleNear` doubles the yaw clamp as the
            // dolly comes in, so the third column is 63 degrees rather than
            // 31.5 wherever the visitor is zoomed in, and the widest window
            // reaches 175.4.
            //
            // SO IT IS A CLOSED RING NOW, which is the last time this number
            // needs to move. 180 cannot be exceeded by any combination of aim,
            // lens and pan, so the class of bug this key exists for (QA: "the
            // range simply stops, with pale sky beyond it") is gone by
            // construction rather than by arithmetic that has already had to be
            // redone twice. It costs 1,634 triangles for the pair against a
            // 400,000 budget, and the segment counts above rose with the arc to
            // hold the ridgeline's density.
            //
            // NONE OF THE EXTRA ARC IS VISIBLE FROM ANY VIEW THAT EXISTED
            // BEFORE. Fully panned and at the widest aspect the ORIGINAL frame
            // reached 77.3 degrees, so everything past 105 can only be seen
            // once the camera has been turned to a tree in a corner of the plot
            // and dollied in. Beyond 90 the arc curves behind the camera plane,
            // which costs nothing: it is a curtain and its far side is only
            // ever seen from inside.
            spreadDegrees: 180,
            rockColor: 0x4a5566
        },

        // ---- The path and the gate ------------------------------------------
        // The cheapest thing out here and the one that does the most for the
        // brief: a path implies somewhere else, and somebody who comes here.
        // That is most of the difference between a place that is secret and a
        // place that is merely empty.
        path: {
            // THE EYE SHOULD STAY ON THE TREES. Both of these were built to
            // lead it out of the clearing, which is the opposite of what the
            // scene is now for. Off by a flag rather than by a deletion: this
            // is prototype work and PRD Addendum B.5 says so.
            enabled: false,
            gateEnabled: false,
            width: 1.6,
            // Waypoints from the gate in the north wall, past the pond's near
            // shore, and away into the trees.
            points: [
                { x: 0, z: 12 },
                { x: 0.5, z: 4 },
                { x: -1, z: -6 },
                { x: -2.5, z: -14 },
                { x: -6, z: -22 },
                { x: -11, z: -30 },
                { x: -14, z: -44 },
                { x: -12, z: -58 },
                { x: -6, z: -74 }
            ],
            color: 0x8a7d66,
            gate: {
                width: 2.6,
                height: 1.5,
                color: 0x6d5f4a
            }
        },

        // ---- What lives here ------------------------------------------------
        // SCALE IS THE WHOLE PROBLEM. A Gavin bee is 1 cm across at a 1 m
        // camera; ours is 22 m back, where 1 cm is a third of a pixel. So
        // everything here either flies through the near foreground, in the ten
        // metres between the camera and the plot, or is drawn against the sky
        // where a silhouette reads at any size. The sizes are honestly
        // exaggerated: these butterflies have a 30 cm wingspan.
        wildlife: {
            // ONE FLAG PER CREATURE, AND THEY GATE CONSTRUCTION RATHER THAN
            // VISIBILITY. A creature that is off is never built, so it costs no
            // geometry, no instance matrices and no per-frame walk.
            //
            // The butterflies, birds and bats are moving things that pull the
            // eye off the only motion that matters.
            //
            // THE FIREFLIES ARE OFF TOO, as of the third screenshot pass, and
            // for a different reason: not that they competed but that they
            // never landed. The first version was a sphere sized in metres,
            // which drew countable octagons on the lawn. The second held its
            // size on screen and read as too faint, which is the other side of
            // the same coin, because a soft glow that is 12 px wide is only
            // about 5 px of solid light and the rest is halo. Getting from
            // there to something worth having is a lighting problem rather
            // than a sizing one, and that is not this milestone's work.
            //
            // NOTHING WAS DELETED TO DO THIS. All four still live in
            // `wildlife.js` in full working order, the firefly sizing below is
            // still measured by the guard, and bringing any of them back is
            // this one word. See M12-9.
            enabled: {
                butterflies: false,
                birds: false,
                bats: false,
                fireflies: false,
                // THE ONE THING ALIVE OUT THERE. Everything above was switched
                // off for pulling the eye away from the trees, and ducks do not
                // have that problem: they are on the LAKE, which is already
                // where the eye goes when it leaves the plot, and they move at
                // the speed of drifting rather than of flying.
                ducks: true
            },

            // ---- Ducks (M22-1) --------------------------------------------
            // SIZED IN PIXELS, BECAUSE A REAL DUCK IS A SPECK. The lake sits 51
            // to 78 m from the eye, where a true 0.55 m mallard measures 5 to
            // 7.5 px and reads as dirt on the screen. This scene has been
            // caught by that three times now, on the mulch beds, the water
            // gauges and the fruit.
            //
            //     body     px near   px far
            //     0.55 m      7.5       4.9   a speck
            //     0.95 m     14.2       9.3   reads as a bird
            //
            // 0.95 m is a swan rather than a mallard, and it is the honest
            // trade: the alternative is something nobody can see.
            ducks: {
                count: 3,
                countMobile: 2,
                bodyLength: 0.95,
                // A pale body and a dark head. At this size the head is about
                // 3 px, and that dark dot at one end is most of what makes the
                // silhouette read as a bird rather than as a leaf.
                bodyColor: 0xe8e4da,
                headColor: 0x33403a,
                // Metres per second, on the animation clock. A duck on still
                // water drifts rather than swims, and anything faster reads as
                // a wind-up toy.
                speed: 0.30,
                // How far into the lake they keep, as a share of the waterline.
                // Well clear of the shore, so none of them ever appears to be
                // standing on the bank.
                keepInside: 0.62,
                // A slow bob, in metres, so they sit ON the water rather than
                // in it.
                bob: 0.035,

                // ---- THEY MIGRATE (M23-1) ---------------------------------
                // Gone for the cold half of the year, which is the only piece
                // of this scene's wildlife that the CALENDAR drives rather than
                // the clock. Hours, in the same scale everything else uses:
                // spring is 03 to 09, autumn 15 to 21, winter 21 to 03.
                //
                //     17.5  they lift off the water, mid autumn
                //     18.5  gone
                //      3.0  specks over the mountains, spring has just begun
                //      4.0  down on the water again
                //
                // `span` of 1.0 in-world hour is 10 real seconds at the shipped
                // cycle, which is long enough to watch and short enough that a
                // visitor who looks away has not missed the year.
                leaveAt: 17.5,
                arriveAt: 3.0,
                span: 1.0,
                // WHERE THEY GO. Away over the far end of the lake and up, so
                // they recede rather than cross: at 291 m they are past the fog
                // ceiling of 260 and dissolve into the haze instead of popping
                // out of existence. Flying them SOUTH over the camera was the
                // other option and it is the one a real skein does, but at 20 m
                // a duck is 36 px of low-poly sphere and the whole illusion is
                // built on never being that close.
                awayX: 30,
                awayHeight: 75,
                awayZ: -260,
                // ---- POSTURE IS NOT DISTANCE (M23-2) ----------------------
                // How much of the flight the take-off POSE takes: wings out,
                // neck reaching, body swinging onto the heading. Short, and
                // that is the point. The first version tied all three to the
                // flight parameter itself, so they reached full only once the
                // birds were specks: the wings peaked at 3.4 px when the body
                // was 2.7, and QA reported never seeing them and the ducks
                // keeping their floating pose, which were one fault.
                postureOver: 0.16,
                // ---- THE BEAT IS SLOWER THAN A REAL DUCK'S, ON PURPOSE ----
                // A mallard beats 8 to 10 times a second. At 6.5 QA read it as
                // a hummingbird, and was right: at ten pixels and sixty frames
                // a beat that fast has no shape, it just shimmers. The eye
                // needs to SEE a stroke, which wants something nearer 2.5.
                //
                // Same family as sizing a duck at 0.95 m instead of 0.55: the
                // physically true number is the wrong one for this frame, and
                // the honest move is to say so rather than to pretend the
                // accurate one looks right.
                flapHz: 2.6,
                // ---- AND THE STROKE IS AN ANGLE, WHICH IS WHY IT WAS WRONG --
                // It used to be a raw multiplier on the wing mesh's Y scale,
                // and that mesh puts its tips at y = 0.25 for |x| = 1. So a
                // multiplier of 0.42 swept the tips through six degrees, which
                // is a shiver. Stated as the angle it means, it can be checked
                // against a bird: a duck's wingtip travels 35 to 45 degrees
                // either side of level.
                flapDegrees: 38,
                // ---- FULL TIP TO TIP, as a multiple of the body ------------
                // A mallard is 0.85 m across on a 0.55 m body, so 1.55 is the
                // real proportion and this is one of the few numbers here that
                // did NOT need exaggerating for the frame.
                //
                // It was being drawn at twice this. `wingGeometry` runs from
                // x = -1 to +1, so its scale is a HALF span, and handing it the
                // full one gave a span three times the body: QA saw wings that
                // were too long and they were, by exactly a factor of two. The
                // halving now lives in the drive, so this number means what its
                // name says and can be checked against a bird.
                wingSpan: 1.55,
                wingChord: 0.34,
                // The skein. Behind and to the side, in the direction of
                // travel, so three birds read as a formation rather than as
                // three birds that happen to be near each other.
                fileBehind: 1.9,
                fileSide: 1.25
            },

            butterflies: {
                count: 14, countMobile: 7, size: 0.3,
                // Wings are a white alpha mask, so these tint it. A brood of
                // one colour reads as a repeated prop rather than as insects,
                // and pure white read as scraps of paper over the grass.
                palette: [0xf2d97a, 0xe8a45c, 0xf0efe6, 0xc7d6ec, 0xdf8f6e],
                // The near foreground: between the camera (z = 22) and the
                // plot, low enough to be among the flowers.
                box: { x0: -11, x1: 11, y0: 1.1, y1: 3.2, z0: 2, z1: 19, rx: 5, ry: 0.9, rz: 4 }
            },
            fireflies: {
                // NOT BUILT AT THE MOMENT: `enabled.fireflies` is false. Kept
                // whole, and still measured by the guard, so the day they come
                // back they come back tuned rather than from scratch.
                count: 18, countMobile: 9, color: 0xd8ff5a,
                // ---- SIZED IN PIXELS, BECAUSE A FIREFLY IS A LIGHT -------
                // A light's apparent size is its GLOW and not its body, so
                // this is pixels of frame rather than centimetres of insect.
                // The first pass was a 7 cm sphere flown through a box whose
                // near edge is 5.4 m from the lens and whose far corner is
                // 28.7 m, which made the size on screen a function of where
                // the insect happened to be:
                //
                //     near edge, full blink   28.8 px
                //     near edge, dim          10.9 px
                //     middle of the box        9.3 px
                //     far corner               5.4 px
                //
                // A five-fold range across one box, and at the near end it
                // is bigger than an apple on a tree. QA caught it in the
                // second screenshot pass: three of them sat on the lawn as
                // flat lime octagons (the sphere was 5 by 4 segments, and
                // you could count the edges) and one hung in the night sky
                // above the horizon at about 35 px.
                //
                // Held constant instead, the way the water level in the
                // mulch beds is held: the scene hands `updateWildlife` the
                // same `pxPerRadian` it hands the garden, so this survives
                // both a resize and the portrait layout's wider lens.
                //
                // THIS IS THE WHOLE CARD, HALO INCLUDED, which is what makes
                // 12 the right number rather than 9. The glow fades to
                // nothing at the rim, so what reads as the insect is the
                // near-solid core at about 40 percent of this: 4.8 px of
                // light inside 12 px of glow. Calibrated against the one
                // firefly nobody complained about, the one in the MIDDLE of
                // the box, which was 9.3 px of flat green at full blink.
                // Raising this makes the halo wider, not the light brighter.
                sizePx: 12,
                // How much a brighter blink also swells. Deliberately small:
                // a light that flares does read as bigger, and anything past
                // this is the old bug arriving through the front door. The
                // blink is carried by BRIGHTNESS now, which is what a firefly
                // actually varies.
                bloom: 0.18,
                box: { x0: -12, x1: 12, y0: 0.9, y1: 3.4, z0: -6, z1: 18, rx: 6, ry: 1.1, rz: 5 }
            },
            birds: {
                count: 7, countMobile: 4, size: 1.5, color: 0x2b2f38,
                // High and far, against the sky rather than the trees.
                box: { x0: -55, x1: 55, y0: 34, y1: 62, z0: -120, z1: -30, rx: 34, ry: 5, rz: 26 }
            },
            bats: {
                count: 6, countMobile: 3, size: 0.85, color: 0x1d1c24,
                box: { x0: -20, x1: 20, y0: 9, y1: 19, z0: -26, z1: 12, rx: 13, ry: 3.4, rz: 10 }
            }
        },

        // ---- Undergrowth ----------------------------------------------------
        undergrowth: {
            // NINETY PERCENT OF THE SCRUB IS GONE, and this is the number that
            // did it rather than a deletion. They were solving M7-4's "the wall
            // looks dropped onto a lawn", and PRD Addendum B answers that with
            // a wood of individually legible trees instead. What is left is
            // enough to break the line where the wall meets the meadow.
            // Restoring them is this number and nothing else.
            bushes: 26,
            bushesMobile: 12,
            bushRadius: { min: 13.5, max: 30 },
            // WAY DOWN FROM 900. At that count they stopped reading as drifts
            // of flowers and became a rash of confetti across the whole meadow.
            // Worth noticing as a pattern: the fix for "these look wrong" is
            // not always more detail, sometimes it is fewer of them.
            flowers: 180,
            flowersMobile: 80,
            flowerRadius: { min: 13, max: 26 },
            // Wildflower colours, drawn from a seeded pick per plant.
            palette: [0xe8d05a, 0xd98ab0, 0xe6e4dd, 0xa88fd0, 0xe07a55]
        }
    },

    // ---- The weather --------------------------------------------------------
    weather: {
        // What each state does. `wind` and `rain` are 0 to 1 and everything
        // downstream reads them: branch sway, leaf flutter, fall rate,
        // precipitation drift, and how fast a tree drinks.
        states: {
            // THE CALM STATES CARRY A WORKING BREEZE. At 0.16 a sunny hour
            // moved a 10 m tree's tip about 5 px at the composed camera, and a
            // quarter of all weather sat at or below that, which is the "no
            // noticeable sway" QA found. The windy and stormy numbers are
            // unchanged: the problem was never the top of the range.
            //
            // THE WINDY STATE IS ABOUT WIND. It used to carry `rain: 0.12`, a
            // permanent drizzle on a state weighted 0.10 to 0.30 across the
            // seasons, and measured over 400 in-world years THAT ONE NUMBER WAS
            // 56 PERCENT OF ALL THE PRECIPITATION IN THE SCENE. Something fell
            // out of the sky 45 percent of the year, roughly double a temperate
            // climate, and it is why the weather read as wet enough to be worth
            // removing. At 0 the wet fraction is 19.7 percent and the grey skies
            // are untouched at 42.8, because the gloom was never the problem.
            //
            // Held in reserve if QA still reads it as wet: cutting the stormy
            // weights below by about a third reaches 15.0 percent. Four numbers,
            // and it costs storms, so try this one first.
            sunny: { gloom: 0.00, wind: 0.30, rain: 0.00 },
            cloudy: { gloom: 0.42, wind: 0.42, rain: 0.00 },
            windy: { gloom: 0.24, wind: 1.00, rain: 0.00 },
            stormy: { gloom: 0.88, wind: 0.72, rain: 1.00 }
        },

        // SUMMER IS DELIBERATELY THE SUNNIEST, which is what makes summer the
        // season the visitor has to show up for. Autumn is the windiest,
        // because wind through a canopy in full colour is the best thirty
        // seconds of the year.
        weights: {
            spring: { sunny: 0.35, cloudy: 0.30, windy: 0.20, stormy: 0.15 },
            summer: { sunny: 0.60, cloudy: 0.20, windy: 0.10, stormy: 0.10 },
            autumn: { sunny: 0.25, cloudy: 0.30, windy: 0.30, stormy: 0.15 },
            // WINTER DRAWS NO STORMS. Lightning only ever happens in the
            // stormy state, and thunder in a snowy midwinter was the M12-2
            // note. It costs the season nothing: winter's weather EVENT is the
            // scheduled snowfall, which is a calendar thing and needs no storm
            // behind it. The 0.15 goes to cloudy, where a winter sky belongs.
            //
            // This is not on its own a guarantee. A storm entered in late
            // autumn holds for a dwell of up to 45 seconds against a 60 second
            // winter, so `lightning.winterRate` below is what actually promises
            // a silent winter.
            winter: { sunny: 0.32, cloudy: 0.45, windy: 0.23, stormy: 0.00 }
        },

        // ---- Gusts --------------------------------------------------------
        // THE SWAY IS THE SUBJECT OF THIS SCENE, AND A STEADY OSCILLATION IS
        // NOT INTERESTING. Before this, wind strength was one number per
        // weather state, blended over 8 seconds and then held for the whole 20
        // to 45 second dwell, so the wood moved at a constant amplitude for
        // half a minute at a time. This is the envelope that makes it surge and
        // settle. See PRD Addendum B.2.
        //
        // Three sines at periods that do not divide, so the pattern never
        // audibly repeats. Measured over 400,000 samples at these values:
        //
        //   mean 0.98    range 0.50 to 1.60, a 3.2:1 swing
        //   p10 0.65     p50 0.96     p90 1.33
        //   55 percent of the time is spent below the old constant
        //   a surge past 1.25x arrives about every 12 seconds
        //
        // The mean sits at 0.98 ON PURPOSE: it means every wind number tuned
        // before gusts existed still means what it meant. The peak is held at
        // 1.6 for a reason too, since the bark shader's displacement is
        // proportional to wind and is NOT scaled by tree size, so a large
        // multiplier bends a 3 m maple further than a 3 m maple can bend.
        gust: {
            periods: [6.7, 15.3, 29.1],
            weights: [0.50, 0.32, 0.18],
            // Above 1 lengthens the lulls and sharpens the surges. Lulls are
            // what make a gust read as a gust.
            shape: 1.25,
            floor: 0.50,
            peak: 1.60,
            // Reduced motion damps the envelope toward steady rather than
            // removing it. The movement is the content here, so 0 would be
            // taking the scene away. See PRD Addendum B.2 and task M8-9.
            reducedDamp: 0.45
        },

        dwell: { min: 20, max: 45 },

        // ---- How long a forced clear spring lasts (M12-4) -------------------
        // IN HOURS RATHER THAN SECONDS, so it stays tied to the clock: change
        // `cycleSeconds` and this still means "from the start of spring until
        // just past sunrise" instead of quietly becoming a different fraction
        // of the season.
        //
        // Spring runs hour 3 to 9 and sunrise is at 6, so 3.5 hours holds a
        // clear sky from 3.00 to about 6.50 with the sunrise in the middle of
        // it. That is 35 of the season's 60 seconds, which leaves the second
        // half of spring rolling normally: this buys the sunrise, it does not
        // turn spring into a static season.
        springClearHours: 3.5,

        transitionSeconds: 8,
        // Reduced motion asks for less movement, not less weather. The states
        // still change, they simply stop arriving quickly.
        reducedTransitionSeconds: 20,
        // How fast the wind swings round, in radians per second.
        turnRate: 0.05,

        // ---- What the season chip is allowed to say -------------------------
        // "WINDY" IS A WIND SPEED HERE, NOT A STATE NAME. Since gusts arrived
        // the envelope runs 0.50 to 1.60, so cloudy at a full gust (0.42 x 1.60
        // = 0.67) is windier than windy in a lull (1.00 x 0.50 = 0.50), and a
        // chip reading the state name called the first one cloudy and the
        // second one windy. 0.55 is above every sunny hour (peak 0.48) and
        // above cloudy except in the top eighth of its gusts, so a calm state
        // reads as windy only when it genuinely is.
        windyAbove: 0.55,
        cloudyAbove: 0.35,

        // ---- What closes the sky (M11-1) ------------------------------------
        // How much cloud is implied by something actually falling, per unit of
        // fall rate. `overcastAt` takes the greater of this and `gloom`, because
        // THE WINTER SNOWFALL IS A CALENDAR EVENT and never moves gloom at all:
        // a still, clear-state blizzard reads gloom 0 and would otherwise keep
        // its stars, which is the frame garden-16 caught.
        //
        // 0.8 puts the calendar snowfall (pinned at 0.7 by `fallRates`) at 0.56,
        // comfortably past `sky.stars.overcastAbove`, while a light shower at
        // 0.15 lands at 0.12 and leaves a sun shower's sky open. Scaled rather
        // than a switch, so drizzle and a downpour are not the same lid.
        fallingOvercast: 0.8,

        // Rain or snow is decided by a smooth temperature rather than by the
        // name of the season, so an early spring storm can fall as sleet and
        // the change is a gradient instead of a switch on a calendar boundary.
        temperature: { coldest: -5, warmest: 27, snowBelow: 0.5, sleetBelow: 4 },

        precipitation: {
            // THESE NUMBERS HAVE NEVER BEEN SEEN. `RAIN_VERT` carried a
            // `vec2 += vec3` (M9-4 in the log), which is a GLSL type error, so
            // the rain program never compiled and the rain mesh never drew a
            // pixel in any weather at any hour. Every rain number below was
            // therefore tuned against nothing. They are a considered starting
            // point rather than a measured one, and this is the first place to
            // look when the first screenshot of working rain comes back.
            rainDrops: 4000,
            rainDropsMobile: 1400,
            snowFlakes: 1800,
            snowFlakesMobile: 600,
            // The box of weather that travels with the viewer.
            radius: 26,
            height: 22,
            rainSpeed: 26,
            snowSpeed: 2.4,
            rainColor: 0xa9c2d4,
            snowColor: 0xf2f7ff,

            // A STREAK READS AS RAIN BECAUSE OF ITS LENGTH AND ITS LEAN, not
            // its colour. 0.85 m at 26 m/s is about a 33 ms exposure, which is
            // shorter than any camera anybody associates with rain.
            rainLength: 1.6,
            // The lean has a FLOOR, because rain leaning only in proportion to
            // the wind falls vertically in a lull and vertical lines do not
            // read as rain at all. Base 0.28 is about 16 degrees off vertical
            // with no wind at all, and a full gust adds another 27.
            leanBase: 0.28,
            leanWind: 0.42,

            // Opacity is NOT linear in the rate. The windy state carries 0.12
            // deliberately, as light rain, and a linear curve draws light rain
            // as nothing: at the old `rain * 0.5` it was a 6 percent wash.
            // The power curve lifts the bottom of the range without touching
            // the top, so light rain looks like light rain.
            rainOpacityCurve: 0.55,
            rainOpacityPeak: 0.55,
            snowOpacityPeak: 0.85,

            // SLEET IS A MIXTURE, NOT BOTH AT ONCE. It used to hand the full
            // rate to the rain system AND the full rate to the snow system, so
            // it drew a downpour and a blizzard on top of each other, and a
            // 2.6 px round white point beats a 1 px translucent line every
            // time. Mostly wet with a scatter of white through it.
            sleetWet: 0.75,
            sleetWhite: 0.35,

            // The rate below which a system is not switched on. THE CHIP READS
            // THIS SAME NUMBER, so the words can never describe weather that
            // is not being drawn. See weatherWords.
            visibleRate: 0.02
        },

        lightning: {
            // Only in the stormy state, and capped. A varying rate needs an
            // ACCUMULATOR rather than a drawn gap, or the distribution quietly
            // goes wrong at exactly the moments it matters.
            strikesPerMinute: 14,
            maxFlashesPerSecond: 2.94,
            // Reduced motion keeps the storm and takes out the snap: a swell
            // rather than a flash. A storm with the electricity removed is a
            // worse scene, not a gentler one.
            reducedRate: 0.25,
            reducedPeak: 0.22,
            peak: 0.85,

            // ---- The flash is a RATIO, not an amount ------------------------
            // It used to ADD a fixed 1.6 to ambient and 1.2 to hemi, onto a
            // fill that runs about 4.3 to 1 across the day (see M1-5). So the
            // identical flash was a modest lift at noon and a white-out at
            // midnight, and since winter here IS midnight the worst case was
            // also a quarter of the year.
            //
            // These gains are solved so that the flash at STORMY NOON, the
            // hour it was originally tuned at, lifts the fill by exactly what
            // it lifted before: ambient 0.508 to 1.868 (3.68x) and hemi 0.673
            // to 1.693 (2.52x) at the 0.85 peak. Every darker hour now gets
            // the same RATIO instead of the same amount. At stormy midnight
            // under snow the old code lifted ambient 6.1x, and with no snow
            // down 9.2x.
            flashGain: { sky: 2.4, ambient: 3.15, hemi: 1.79 },

            // ---- Lightning tapers off with the sun --------------------------
            // Requested as "no lightning at night", which a floor of 0 gives
            // exactly. It is a TAPER instead, and the reason is worth keeping:
            // the seasons here are the sun's own hours, so night is all of
            // winter and the dark ends of autumn and spring. A hard cut makes
            // lightning a summer-afternoon event only and takes the storms out
            // of the season the specs call the windiest.
            //
            // At maxElevation 58 these thresholds put the full rate between
            // 06:48 and 17:12 and the floor between 18:24 and 05:36. At 0.12
            // the floor is 1.7 strikes a minute against a 20 to 45 second
            // dwell, so most night storms carry one flash or none, which is
            // distant weather rather than a strobe.
            nightRate: 0.12,
            nightBelowElevation: -6,
            dayAboveElevation: 12,

            // ---- Winter is silent, and it is a SEASON gate ------------------
            // "No lightning in winter" is a different request from "no
            // lightning at night" and it has a cleaner answer, because winter
            // IS a season and can simply be named. The elevation taper above
            // stays exactly as it is: it protects the night storms of autumn
            // and spring, which is what M9 chose it for.
            //
            // The weights already stop winter DRAWING a storm. This stops one
            // that crossed the boundary from flashing, which the weights
            // cannot. A rate reaching zero is invisible at the boundary because
            // strikes are discrete events rather than a ramp, so there is no
            // seam to see.
            winterRate: 0,
            attackSeconds: 0.04,
            decaySeconds: 0.42,
            // Strikes stay distant and above the horizon. Nothing in this
            // garden is ever struck.
            minDistance: 90,
            maxDistance: 220,
            minElevation: 8,
            maxElevation: 34,
            boltColor: 0xdce8ff,
            segments: 22,
            spread: 9
        }
    },

    // ---- The ground ---------------------------------------------------------
    terrain: {
        // Resolution of the plot mesh, by device tier. 96 puts a vertex every
        // 25 cm, which is fine enough that the relief reads as rolling ground
        // rather than as facets at this camera distance.
        segments: 96,
        segmentsMobile: 64,

        // ---- How much the plot rolls -----------------------------------------
        // 0 LEVELS THE NURSERY, which is where this sits now. The relief was
        // always deliberate (it damps to exactly zero at the boundary so the
        // 24 m plot and the flat surround meet with no seam), and it measured
        // -0.67 m to +0.86 m with a steepest slope of 17.7 degrees. What QA
        // pointed out is that a cultivated planting bed is a LEVELLED thing,
        // and the hills and valleys read as unworked ground rather than as a
        // nursery. Levelling also means no planting row is on a slope and
        // every mulch bed sits the same way on the same ground.
        //
        // A scale rather than a switch, so the rolling plot is one number
        // away. The seam holds at any value: at 0 it is 0 = 0, and otherwise
        // the edge damp is untouched. The meadow beyond the wall still rolls,
        // because that is `outerWavesAt` and a meadow is not cultivated.
        reliefScale: 0,

        // How far the meadow sits below the plot where they meet, in metres.
        //
        // THIS NUMBER AND `reliefScale` ARE COUPLED, and not noticing that cost
        // a long day of QA. The meadow is ONE 360 m plane covering the whole
        // world, the plot included, and `outerReliefAt` is zero inside the
        // plot, so there is an opaque green surface at -0.01 stretched right
        // across the nursery. That is correct where the two MEET, because the
        // edge damp puts the plot at exactly 0 there. It is wrong everywhere
        // the plot's interior dips BELOW it: at `reliefScale` 1 the relief ran
        // -0.67 to +0.86, so 55 of the 169 plantable cells sat under the
        // meadow, and the ground, the mulch beds and the bottoms of the trunks
        // standing on them were all hidden behind it. It reported as "the
        // mulch rings are missing in an L from the back left corner", which is
        // exactly the shape of the region where the relief goes negative.
        //
        // A levelled nursery makes the coupling moot: the plot sits at 0, a
        // centimetre proud of the meadow, everywhere. Raising `reliefScale`
        // again means giving the meadow a hole rather than a plane. There is a
        // test below that fails the moment the two disagree.
        meadowDrop: 0.01,

        // THE UNDULATION, as a sum of three plane waves. Sines because the
        // whole point is a function that is cheap, smooth, and above all
        // DETERMINISTIC: the same ground has to come back on every visit, and
        // a tree planted on a rise must still be on that rise tomorrow.
        // Amplitudes in metres, frequencies in radians per metre.
        relief: [
            { amp: 0.55, fx: 0.18, fz: 0.15, phase: 0.70 },
            { amp: 0.22, fx: 0.31, fz: -0.27, phase: 2.10 },
            { amp: 0.09, fx: 0.62, fz: 0.55, phase: 4.20 }
        ],

        // THE RELIEF FADES TO NOTHING AT THE PLOT EDGE, which is what lets the
        // plot meet the flat ground beyond it at exactly y = 0 with no seam to
        // hide and no crack to fall through. A rolling middle inside a level
        // border is also what a walled garden actually looks like, and it
        // means the outermost planting row is never on a slope.
        edgeFlatFrom: 8.5,

        // The world beyond the wall. Flat, dull, and mostly fog.
        surroundSize: 360,
        surroundColor: 0x55603c,

        // The dry-stone wall around the plot, as one instanced box per stone
        // so the whole boundary is a single draw call.
        wall: {
            height: 0.58,
            thickness: 0.44,
            stonesPerSide: 26,
            color: 0x93897a
        },

        // THE GRASS TURNS WITH THE YEAR TOO, not just the trees. Keyed by hour
        // exactly like the sky, so the same table is a season table.
        grassKeys: [
            { at: 0.0, color: 0x5d5a45 },   // winter, dormant and dun
            { at: 6.0, color: 0x6f9e4a },   // spring, new growth
            { at: 12.0, color: 0x4e7d38 },  // summer, deep
            { at: 18.0, color: 0x7d7a42 }   // autumn, going to straw
        ],

        snowColor: 0xeef4fb,
        // How coarse the patchiness is, in radians per metre. The melt breaks
        // up rather than fading evenly, which is both what a thaw does and
        // much better looking than a uniform dissolve.
        patchScale: 0.42,
        // How much the ground colour varies from place to place, so a 24 metre
        // lawn is not one flat swatch.
        mottle: 0.09,

        roughness: 0.93,
        snowRoughness: 0.68
    },

    // ---- The sky ------------------------------------------------------------
    // ONE KEYFRAME TABLE COVERS ALL FOUR SEASONS, and that falls out of the
    // calendar rather than being a shortcut. Because the seasons ARE the hours,
    // a table keyed by hour is already a table keyed by season: the 06:00 entry
    // is a spring dawn, the noon entry is high summer, the 18:00 entry is an
    // autumn sunset, and midnight is the deep of winter. A second table indexed
    // by season would be four more chances for the two to drift apart.
    //
    // COLOURS ARE sRGB AND THEY ARE BLENDED IN sRGB. Interpolating a deep blue
    // zenith and an orange horizon in linear space runs the midpoint through
    // mud, because a straight line in linear space is not a straight line in
    // perceptual space. The shader mixes first and converts to linear second,
    // and the CPU-side blend does the same, so the two always agree.
    //
    // `lum` is the linear multiplier applied AFTER the conversion, and it is
    // what actually makes noon bright and midnight dim. It is deliberately
    // allowed past 1: the scene tone maps, so a bright sky is meant to run into
    // the shoulder of the curve rather than clip flat.
    sky: {
        domeRadius: 320,

        // How fast the gradient climbs away from the horizon, as the exponent
        // on elevation. Real sky is pale at the horizon and saturated overhead,
        // because a horizontal line of sight runs through far more air, and
        // that is the opposite of what a linear ramp draws.
        gradientPower: 0.45,

        // The renderer's exposure. Held at 1 and adjusted per hour through
        // `lum` instead, so there is one brightness knob rather than two.
        exposure: 1.0,

        // THE NIGHT `lum` VALUES ARE NOT PHYSICAL AND THEY MUST NOT BE. A first
        // pass used honest ones, around 0.11 at midnight against 1.95 at noon,
        // and the result rendered #000002: after the tone curve there was
        // nothing left on screen at all. Winter in this garden is the middle of
        // the night, so a black night sky is not a moody choice, it is half the
        // year lost. These were solved backwards from the SHOWN luminance, and
        // the numbers that matter are those rather than these:
        //
        //     midnight zenith  #040c2f   5.0 %      noon zenith  #43a9dd  59.2 %
        //
        // A twelve to one contrast, which reads plainly as night while staying
        // legible. Change a `lum` here and check with shownColor(), never by
        // eye against the raw hex: the tone curve and the multiplier between
        // them can reverse the ordering of two colours.
        keys: [
            // Deep winter, and the darkest the scene ever goes. A clear night
            // sky is a deep blue, and reading it as black is the single easiest
            // way to make this scene look broken.
            { at: 0.0, zenith: 0x0d1734, horizon: 0x172344, lum: 1.85 },
            // Winter closes, spring opens. The first suggestion of light.
            { at: 3.0, zenith: 0x14224a, horizon: 0x2b3660, lum: 1.45 },
            // Pre-dawn. The horizon warms well before the sun clears it.
            { at: 4.5, zenith: 0x27406f, horizon: 0x8a6a80, lum: 1.06 },
            // Sunrise, the middle of spring.
            { at: 6.0, zenith: 0x4a76ad, horizon: 0xf0a878, lum: 0.95 },
            // Full spring morning.
            { at: 7.5, zenith: 0x5b90c6, horizon: 0xd8e2ea, lum: 1.45 },
            // Noon, the middle of summer. The zenith deepens toward noon, which
            // is why the shown luminance plateaus across the middle of the day
            // rather than peaking to a point: a real midday sky is more
            // saturated overhead, not merely brighter.
            { at: 12.0, zenith: 0x3f83cc, horizon: 0xb7d6ef, lum: 1.95 },
            // Summer closes, autumn opens.
            { at: 15.0, zenith: 0x5089c4, horizon: 0xd0d9de, lum: 1.70 },
            // The light goes long and warm.
            { at: 16.5, zenith: 0x608cba, horizon: 0xe3cfae, lum: 1.20 },
            // Sunset, the middle of autumn.
            { at: 18.0, zenith: 0x3d5c92, horizon: 0xe8965c, lum: 0.80 },
            // Dusk.
            { at: 19.5, zenith: 0x22315e, horizon: 0x7d5573, lum: 1.12 },
            // Autumn closes, winter opens. Wraps back to the midnight entry.
            { at: 21.0, zenith: 0x111c42, horizon: 0x1e2850, lum: 1.55 }
        ],

        // A SECOND AXIS THROUGH THE SAME KEYFRAMES, not a second set of them.
        // Writing eleven more keys for "the same hour but overcast" would be
        // eleven more chances for two tables to drift apart. Blending toward
        // one storm palette gives weather at any hour for the price of one
        // table, and it still works if the palette is ever retimed.
        storm: {
            zenith: 0x4a5058,
            horizon: 0x6b7076,
            // How far a full storm pulls the brightness down. Overcast is
            // dimmer AND flatter, so the sun loses more than the sky does.
            lumScale: 0.45,
            sunScale: 0.12,
            // Cloud scatters light into the shadows, so a storm actually
            // RAISES the fill even as it drops the key.
            ambientLift: 0.10,
            hemiLift: 0.14
        },

        sun: {
            // A REAL SUN IS HALF A DEGREE ACROSS, which is a smaller dot than
            // anyone pictures. This is about three times life size, chosen so
            // it reads as the sun rather than as a stuck pixel.
            angularDiameterDegrees: 1.4,
            limbSoftnessDegrees: 0.16,
            // Past the point where filmic tone mapping saturates it to white,
            // which is exactly what should happen.
            discStrength: 6.0,
            // Two halo terms, because the real thing has two: a wide bloom from
            // scattering through the whole atmosphere, and a tight aureole from
            // the air immediately around the sun. One term cannot be both.
            glowPower: 8.0,
            glowStrength: 0.30,
            aureoleRatio: 12.0,
            aureoleStrength: 0.50
        },

        moon: {
            // Larger and much softer than the sun, and it never saturates.
            angularDiameterDegrees: 1.7,
            limbSoftnessDegrees: 0.22,
            discStrength: 1.30,
            glowPower: 26.0,
            glowStrength: 0.16
        },

        // Shader stars rather than a Points cloud: one less draw call, one less
        // object to keep in step with the dome, and they cost a hash per pixel
        // only where the fade is above zero.
        stars: {
            density: 620.0,
            // Elevation in degrees below which stars are washed out by the
            // horizon haze, so they do not sit on top of the treeline.
            horizonFadeDegrees: 9.0,
            // The sun's elevation at which stars are completely gone. Civil
            // twilight, near enough.
            hiddenAboveElevation: -4.0,
            fullBelowElevation: -14.0,
            brightness: 1.15,

            // ---- What the cloud takes (M11-2) -------------------------------
            // The two above answer "is the sun down". These answer "can anything
            // be seen through the sky at all", and the two multiply. Read by
            // `starHidingAt`, and applied to the moon's disc and halo as well,
            // because a lid is a lid for everything behind it.
            //
            // STEEP ON PURPOSE. Cloudy sits at gloom 0.42 and stormy at 0.88, so
            // a linear fade would leave a cloudy night at 58 percent stars, and
            // cloudy is the most common non-clear state in the cycle. At 0.12
            // and 0.40: sunny keeps every star, windy (0.24) keeps about half,
            // which is a night of broken cloud and is worth having, and cloudy
            // and stormy keep none.
            clearBelow: 0.12,
            overcastAbove: 0.40
        },

        // THREE'S FOG RUNS AFTER TONE MAPPING AND AFTER THE sRGB ENCODE, so
        // `fog.color` is a SCREEN value rather than a scene colour. Set it from
        // a raw sky hex and the distance fades to a colour the sky never shows.
        // sky.js sets it from the tone-mapped, encoded horizon, and hands it to
        // THREE tagged as linear so the renderer does not convert it a second
        // time. Near is past the far edge of the plot, so nothing the visitor
        // planted is ever fogged.
        // ---- Clouds (M20-2) -------------------------------------------------
        // SPARSE WHEN CLEAR, HEAVY WHEN CLOUDY, and `cover` slides the
        // THRESHOLD rather than the opacity. At `clearAt` only the tops of the
        // noise field clear the bar, so a clear day gets a few small islands
        // with real sky between them; at `fullAt` most of the field does.
        // Fading the opacity instead would give a clear day a whole sky of
        // faint smears, which is not the same picture at all.
        //
        // The cover itself is `overcastAt`, the one number the season chip and
        // the sky already agree on, so the words "cloudy" and the thing
        // overhead cannot disagree.
        clouds: {
            // ---- THE CAMERA BARELY SEES ANY SKY, AND THAT SETS ALL OF THIS --
            // It pitches down 10.6 degrees with a 60 degree lens, so the frame
            // spans -40.6 to +19.4 in elevation: the visible sky is a band
            // about 19 degrees tall sitting on the horizon. Every number here
            // follows from that, and the first two attempts did not know it.
            //
            // ATTEMPT ONE projected onto a level sheet (xz divided by y) and
            // drew dozens of tiny fragments. That projection is right for a
            // sky you look UP into, where it makes cloud bunch and foreshorten
            // properly, and wrong for a band lying on the horizon: everything
            // in it is compressed into flat slivers.
            //
            // ATTEMPT TWO raised the clamp to reduce the squashing, which made
            // it worse. With little foreshortening a cloud is taller than the
            // 19 degree band, so it arrives as a slab with vertical walls
            // crossing the whole strip. **A CLOUD HAS TO BE SMALL ENOUGH TO FIT
            // IN THE BAND TO READ AS A CLOUD AT ALL.**
            //
            // What works is a gentle SEAMLESS projection, xz over (bias + y),
            // which foreshortens by only 1.6x across the visible band and so
            // keeps clouds round. It also has no wrap: an atan2 mapping puts a
            // seam due west, and the widest panned frame reaches 84.5 degrees
            // off north, which is close enough to find it.
            bias: 0.55,
            // ---- SCALE IS SET BY THE BAND INCLUDING THE TILT ---------------
            // Measured against 19 degrees of sky and then found wanting,
            // because the TILT was left out: `pan.maxTilt` is 18.3 degrees, so
            // the visible sky actually reaches 37.7 in landscape and 43.7 in
            // portrait. Over twice what was tuned for.
            //
            // At 4.5 the whole of that band held only three or four noise
            // features, so a cloudy sky arrived as one continental mass with no
            // sky in it. QA sent back a screenshot of exactly that. At 8 the
            // same band holds a dozen or so, which is a handful of distinct
            // rounded clouds on a clear day and a properly broken sky when it
            // is cloudy.
            scale: 8.0,
            // Three octaves, not four. The fourth adds fractal detail at the
            // edges, which is what made the first pass read as scattered scraps
            // rather than as fluffy masses.
            octaves: 3,
            persistence: 0.45,
            // ---- THRESHOLDS FROM THE FIELD'S OWN PERCENTILES ---------------
            // A normalised fbm does not span 0 to 1. Sampled over 9,000
            // directions across the VISIBLE band:
            //
            //     p20 0.145   p34 0.189   p50 0.242   p90 0.419   p98.5 0.549
            //
            // `clearAt` is the 98.5th, so a clear day is a few small rounded
            // puffs. `fullAt` is the 34th, giving about half the sky.
            // The 97th rather than the 98.5th. At the 98.5th a clear day was
            // one or two puffs, which is not "a few white fluffy clouds" so
            // much as an almost empty sky; 4 percent was too many. This is
            // about 2, which is several distinct clouds with plenty of blue.
            clearAt: 0.508,
            fullAt: 0.189,
            edge: 0.045,
            // ---- AND THEY MOVE ---------------------------------------------
            // The visible sky is about 11 noise cells wide, so this crosses the
            // frame in roughly five minutes and moves a cloud its own width in
            // about thirty seconds: weather, rather than a slideshow or a
            // conveyor. It was 0.0075, which is eight times slower and read as
            // a painted backdrop.
            drift: 0.035,
            // Clouds still stop short of the horizon, where the projection has
            // nothing left to give and distant cloud is lost in haze anyway.
            horizonFade: 0.14,
            // NOT PURE WHITE. A cloud is lit by the same sky it sits in, so
            // this is warmed toward the horizon colour low down, which is what
            // gives a sunset its underlit edge for free.
            // ---- HAPPY WHEN DRY, GLOOMY WHEN IT IS FALLING ----------------
            // The cover already rises when it rains, because `overcastAt` reads
            // what is actually falling. The COLOUR is a separate question and
            // has to be, or a bright dry overcast would be painted as a storm:
            // plenty of days are wall to wall cloud and still cheerful.
            //
            // So this is driven by the PRECIPITATION RATE and not by the cover.
            // Dry cloud is near white and takes the horizon's warmth low down,
            // which is what gives a sunset its underlit edge. Wet cloud goes to
            // a flat slate and mostly stops taking that warmth, because a
            // rain-bearing cloud is lit from above and thick enough not to glow
            // at its base.
            color: 0xf8faf8,
            stormColor: 0x646a72,
            // ---- AND THE WARMTH ONLY HAPPENS WHEN THE SUN IS LOW ----------
            // It exists to give a sunrise and a sunset their underlit edge. It
            // was applied at every hour, so a NOON cloud was mixed 40 percent
            // toward a pale blue horizon and came out 0xe3e7e9 rather than the
            // 0xeaeaea it should be: slightly blue, slightly dull, and not the
            // white QA asked for. Faded out above this elevation, midday
            // clouds are white and the dawn ones still catch the light.
            horizonWarmth: 0.4,
            warmthFadesAbove: 18,
            // How much of the warmth survives a downpour.
            stormWarmth: 0.25,
            // The rate at which cloud is fully grey. `weather.states.stormy`
            // carries rain 1.0, so this greys well before the worst of it and
            // a drizzle still darkens the sky a little.
            wetFull: 0.45,
            opacity: 0.94
        },

        fog: { near: 60, far: 260 },

        // ---- Lighting -------------------------------------------------------
        // The rig is two directional lights (sun and moon), a hemisphere fill,
        // and a small ambient floor. Intensities are for r160, where the legacy
        // lighting mode is gone and daylight wants numbers around 3.
        lighting: {
            sunPeak: 3.10,
            // Below this elevation the sun's colour warms toward sunColorLow,
            // which is what makes the golden hours golden.
            warmElevation: 14.0,
            sunColorHigh: 0xfff6e8,
            sunColorLow: 0xff9d4f,

            // A SUN SITTING EXACTLY ON THE HORIZON IS STILL DELIVERING LIGHT,
            // and a straight sine of its elevation says it delivers none. That
            // is not a rounding error, it is the whole of sunrise: the disc is
            // up, the shadows are at their longest and reddest, and the first
            // version of this rig rendered that moment with less light than
            // midnight. This lifts the falloff so the sun is worth about 0.48
            // as it clears the horizon, and still dies out a few degrees below
            // it rather than shining up through the ground.
            horizonLift: 0.08,

            // Kept deliberately modest. Moonlight is a KEY light here, not a
            // fill: it gives the winter garden shape, which is what makes a
            // snowy midnight legible, and pushing it higher only flattens the
            // scene while stealing the day's contrast.
            moonPeak: 0.22,
            moonColor: 0xa8c4ff,

            ambientDay: 0.42,
            ambientNight: 0.09,
            hemiDay: 0.55,
            hemiNight: 0.12,
            hemiSkyColor: 0xbcd8ee,
            hemiGroundColor: 0x4a5a34,

            // THE WINTER LIGHT FLOOR. Winter is the middle of the night in this
            // garden, so without these terms the best-looking event in the
            // scene, snow arriving and lying, would happen in the dark. These
            // do not brighten winter into day. They lift it to a moonlit night,
            // which is what a real snowy midnight looks like: blue, legible,
            // and quite bright underfoot.
            //
            // Peaked at midnight and zero at both equinox hours, so autumn and
            // spring are untouched. Tunable on purpose, because this is the
            // term most likely to move during QA.
            // Most of the winter lift is carried by the MOON, which is a
            // directional light and therefore gives the garden shape, rather
            // than by ambient, which only makes everything uniformly less
            // dark. An early pass had these at 0.085 and 0.13 and pushed
            // midnight brighter on the ground than sunrise was, which no
            // amount of correct sky could rescue.
            winterFloor: {
                moonBoost: 0.90,     // multiplied onto moonPeak at midwinter
                ambientBoost: 0.040,
                hemiBoost: 0.060
            },

            // Fresh snow throws a great deal of light back up. This is what
            // lifts the undersides of branches once the ground is white, and it
            // is the other half of why a snowy winter night reads.
            snowBounce: {
                ambient: 0.10,
                hemi: 0.18,
                // The hemisphere light's ground colour goes from soil to snow
                // as coverage rises, so the bounce is the right COLOUR too.
                groundColor: 0xdfe9f5
            },

            // Shadows. The sun moves slowly, so the map is refreshed a few
            // times a second rather than every frame, which removes a full
            // shadow pass from most frames for no visible difference.
            shadow: {
                mapSize: 2048,
                mapSizeMobile: 1024,
                refreshHz: 3,
                // The frustum is fitted to the plot plus the tallest tree.
                radius: 20,
                depth: 90,
                bias: -0.0012,
                normalBias: 0.02
            }
        }
    },

    // ---- Rendering quality --------------------------------------------------
    // MEASURED AGAINST THE DISPLAY RATHER THAN AGAINST 60. A fixed millisecond
    // budget calls a 30 Hz panel permanently slow and never notices a 120 Hz one
    // struggling, so the yardstick is the best frame this device has managed,
    // with an absolute floor underneath for a device that was never fast even
    // once. Ported wholesale from highwater, where it was tuned against a real
    // fill-rate cliff.
    quality: {
        minScale: 0.60,
        slowRatio: 1.30,
        // Close to 1 because a vsynced display reports its interval no matter
        // how much room is left, so the only way to find the ceiling is to
        // reach for it and come back down if it does not hold.
        fastRatio: 1.08,
        slowSeconds: 1 / 25,
        stepDown: 0.85,
        // Smaller than the step down, deliberately. Getting it wrong downward
        // costs a little sharpness and getting it wrong upward costs the frame
        // rate while somebody is planting.
        stepUp: 1.06,
        // CHANGING THE RATIO REALLOCATES THE DRAWING BUFFER, which is itself a
        // dropped frame, so this cannot be a per-frame decision.
        holdDownSeconds: 1.0,
        holdUpSeconds: 3.0,
        // Ignore the opening frames: shader compilation and the first attribute
        // upload both land there and neither says anything about the device.
        settleFrames: 60,
        ignoreAboveSeconds: 0.10,
        smoothing: 0.05,
        // Pixel-ratio ceilings by tier.
        maxPixelRatio: 2,
        maxPixelRatioMobile: 1.5
    },

    // Soft bot deterrent solved before the scene builds. The storage key is
    // shared across experiences so returning visitors' cached proofs stay valid
    // on the same serving domain.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // The one key this scene persists to. Versioned in the name, so a future
    // schema change is a new key rather than a guess at an old one. M3-5.
    // SCHEMA 2 REMAPS THE GRID. A saved tree stores `gx, gz`, which are cell
    // INDICES, so the moment the spacing changed every one of them meant a
    // different place: a tree at gx 5 was at 7.5 m and would have been read as
    // 15, outside the plot and dropped. Version 1 saves are migrated rather
    // than discarded, because the whole promise of this scene is that a garden
    // is still there when you come back.
    storage: { key: 'scenexp-garden-v1', schema: 2 },

    // ---- Outward-facing links -----------------------------------------------
    // Phase 5 hosting model: builder-funnel links are root-relative (the
    // marketing pages live at the serving domain's root), and anything that
    // names the serving domain is derived from location at runtime. This
    // experience has no featured business and honors nobody, so the Home button
    // goes to the serving site's root in the same tab.
    site: {
        home: {
            path: '/',
            title: 'Back to the main site'
        },

        share: {
            title: 'Fractal Garden',
            text: 'Plant a garden of fractal trees and watch it live through the years:'
        },

        builder: {
            contactPath: '/contact.html'
        }
    }
});
