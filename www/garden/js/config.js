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
        // Trees snap to this grid, which is what stops a garden becoming one
        // solid mass of overlapping geometry.
        gridSpacing: 1.5,
        // Capacity, by device tier. The plant modal says so plainly when the
        // plot is full and offers to remove a tree instead.
        maxTrees: 16,
        maxTreesMobile: 10,
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
                maxTilt: 0.32
            },
            zoom: {
                speed: 18,
                // Generous outward, because that is what frames a large tree
                // planted close to the camera.
                maxIn: 26,
                maxOut: 16
            }
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
        // How many levels of branching carry leaves, counted in from the tips.
        leafLevels: 3,
        // What a newly planted sapling looks like: a fraction of mature size,
        // and proportionally MORE slender rather than less, because that is
        // what a young tree is.
        saplingScale: 0.14,
        saplingThickness: 0.55
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

        moisture: {
            // A full tank lasts exactly one thirst window, so a diligent
            // visitor waters each tree about once a year and a slightly late
            // one is never punished for it.
            windowsPerFill: 1,
            // How fast rain fills a tree, in tank-fractions per second of
            // steady rain. A full storm refills a tree completely.
            rainFill: 0.05,
            // The thirst marker appears below this.
            thirstyBelow: 0.25
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
            openHalfWidth: 15,
            openSpread: 0.30,

            // How far out the wood is drawn at all.
            outerRadius: 125
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
            spacing: 5.2,
            spacingMobile: 7.4,
            jitter: 0.42,
            minHeight: 9,
            maxHeight: 18,
            // How much of the wood keeps its needles through winter.
            evergreenShare: 0.42,
            // THE CANOPY IS THINNED BY RAISING alphaTest, NOT by swapping
            // meshes. The texture is drawn with opaque branches and softer
            // leaves, so lifting the threshold erodes the leaves first and
            // leaves the branch structure behind. One material, one draw call,
            // no transparency sorting, and a deciduous wood that genuinely
            // goes bare in winter.
            leafyAlphaTest: 0.34,
            bareAlphaTest: 0.82,
            textureSize: 128
        },

        // ---- The near treeline ----------------------------------------------
        // Real fractal trees at reduced recursion, close enough that their
        // silhouette is what the eye reads. These carry the join: without
        // them the impostor wood starts abruptly.
        nearTreeline: {
            count: 16,
            countMobile: 9,
            minRadius: 17,
            maxRadius: 38,
            depthReduction: 2,
            minScale: 0.75,
            maxScale: 1.25
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
            x: -4,
            z: -34,
            halfWidth: 15,
            halfDepth: 10,
            // How far the ground is dug out, and how much of that is filled.
            // Less than full, so there is a band of damp shore.
            depth: 1.9,
            fill: 0.45,
            // Still water, so the ripples are small and slow.
            rippleScale: 0.9,
            rippleSpeed: 0.28,
            rippleHeight: 0.035,
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
                { distance: 340, height: 112, roughness: 0.42, haze: 0.72, segments: 150 },
                { distance: 285, height: 74, roughness: 0.55, haze: 0.5, segments: 130 }
            ],
            // Half-angle of the arc they span, in degrees, centred on north.
            spreadDegrees: 62,
            rockColor: 0x4a5566
        },

        // ---- The path and the gate ------------------------------------------
        // The cheapest thing out here and the one that does the most for the
        // brief: a path implies somewhere else, and somebody who comes here.
        // That is most of the difference between a place that is secret and a
        // place that is merely empty.
        path: {
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
            butterflies: {
                count: 14, countMobile: 7, size: 0.3,
                // The near foreground: between the camera (z = 22) and the
                // plot, low enough to be among the flowers.
                box: { x0: -11, x1: 11, y0: 1.1, y1: 3.2, z0: 2, z1: 19, rx: 5, ry: 0.9, rz: 4 }
            },
            fireflies: {
                count: 18, countMobile: 9, size: 0.07, color: 0xd8ff5a,
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
            bushes: 260,
            bushesMobile: 120,
            bushRadius: { min: 13.5, max: 30 },
            flowers: 900,
            flowersMobile: 380,
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
            sunny: { gloom: 0.00, wind: 0.16, rain: 0.00 },
            cloudy: { gloom: 0.42, wind: 0.30, rain: 0.00 },
            windy: { gloom: 0.24, wind: 1.00, rain: 0.12 },
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
            winter: { sunny: 0.30, cloudy: 0.35, windy: 0.20, stormy: 0.15 }
        },

        dwell: { min: 20, max: 45 },
        transitionSeconds: 8,
        // Reduced motion asks for less movement, not less weather. The states
        // still change, they simply stop arriving quickly.
        reducedTransitionSeconds: 20,
        // How fast the wind swings round, in radians per second.
        turnRate: 0.05,

        // Rain or snow is decided by a smooth temperature rather than by the
        // name of the season, so an early spring storm can fall as sleet and
        // the change is a gradient instead of a switch on a calendar boundary.
        temperature: { coldest: -5, warmest: 27, snowBelow: 0.5, sleetBelow: 4 },

        precipitation: {
            rainDrops: 2400,
            rainDropsMobile: 800,
            snowFlakes: 1800,
            snowFlakesMobile: 600,
            // The box of weather that travels with the viewer.
            radius: 26,
            height: 22,
            rainSpeed: 26,
            snowSpeed: 2.4,
            rainColor: 0xa9c2d4,
            snowColor: 0xf2f7ff
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
            brightness: 1.15
        },

        // THREE'S FOG RUNS AFTER TONE MAPPING AND AFTER THE sRGB ENCODE, so
        // `fog.color` is a SCREEN value rather than a scene colour. Set it from
        // a raw sky hex and the distance fades to a colour the sky never shows.
        // sky.js sets it from the tone-mapped, encoded horizon, and hands it to
        // THREE tagged as linear so the renderer does not convert it a second
        // time. Near is past the far edge of the plot, so nothing the visitor
        // planted is ever fogged.
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
    storage: { key: 'scenexp-garden-v1', schema: 1 },

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
