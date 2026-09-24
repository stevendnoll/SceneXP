// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - every number in Tornado Alley.
 *
 * A TIMED STORY, the second after High Water: thirty seconds on the open
 * prairie, from a calm evening through a tornado's whole life to a clearing
 * sky. The plan is specs/twister/PRD.md (git-ignored, Steve's copy).
 *
 * WHERE THIS STANDS (M1, 2026-09-23). The page, the player and the funnel are
 * real. The funnel is technique A from the M0 spike, stacked shells, which
 * Steve chose over a raymarched volume after QA round 1. Everything around it
 * (the sky, the storm base, the wall cloud, the prairie, the debris) is the
 * spike's stand-in, kept only so the funnel is judged against the right kind
 * of backdrop, and is replaced in M2 (sky and supercell) and M3 (ground and
 * farm). There is no cow yet (M6) and no lightning (M5).
 *
 * COLOURS ARE DISPLAY VALUES. Every shader writes its colour straight to the
 * screen with no tone mapping and no sRGB encode, so a number here is what
 * appears. That was the spike's choice and it holds for now. Whether the
 * scene keeps it or moves to High Water's ACES pipeline is decided in M2,
 * before any colour is tuned for real.
 *
 * COORDINATES. Metres. The camera stands at the origin looking down -z
 * (east), so +x is to the right (south) and +z is behind the camera (west,
 * where the low sun is).
 */

export const TORNADO_CONFIG = Object.freeze({
    // Solved once per visit and cached in sessionStorage by the shared boot
    // part; the same key every scene uses, so one solve covers the site.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // The story, read by the shared player (shared/js/player-1.0.0.js).
    // THIRTY SECONDS, SINCE QA ON 2026-09-23 ("the scene feels too long").
    // It was sixty. The retime cut the waiting rather than speeding the
    // whole minute up evenly: the tornado is down by 5.5 s, the cow circles
    // for seven seconds rather than twenty, the rope-out lost two seconds,
    // and the beats themselves (touchdown, the rope, the landing) kept the
    // time they need.
    story: {
        seconds: 30,
        fadeSeconds: 3,
        // Reported as reached-<name> the first time a watch gets there.
        // The PRD's arc; the cow and the rainbow arrive in M5 and M6.
        stages: [
            { at: 0, name: 'ordinary' },
            { at: 1, name: 'organizing' },
            { at: 2, name: 'wall-cloud' },
            { at: 4.5, name: 'touchdown' },
            { at: 7, name: 'mature' },
            { at: 8, name: 'pickup' },
            { at: 15, name: 'rope-out' },
            { at: 21, name: 'dissipating' },
            { at: 23, name: 'payoff' },
            { at: 24.5, name: 'rainbow' }
        ]
    },

    // The player's timings. High Water's, which Steve QA'd on 2026-09-23.
    controls: {
        idleSeconds: 3,
        // A tenth of the story an arrow press, a quarter a page.
        stepSeconds: 3,
        pageSeconds: 8,
        endGuardSeconds: 0.25,
        flashHoldSeconds: 1,
        seekReportSeconds: 0.8
    },

    camera: {
        height: 1.6,
        fovDegrees: 42,          // vertical
        pitchDegrees: 10,
        near: 1,
        far: 40000
    },

    // A phone draws at most this many device pixels per CSS pixel.
    render: {
        maxPixelRatio: 2,
        mobilePixelRatio: 1.5
    },

    // Where the storm is. `distance` is from the camera to the point under
    // the wall cloud, which is where the funnel's top is anchored.
    storm: {
        distance: 1800,
        trackX: 0,
        baseHeight: 900,         // cloud base above the ground
        baseRadius: 6500,        // the dark rain-free base, a disc
        baseOffsetZ: -2600,      // the base sits mostly east of the funnel
        wallRadius: 430,
        wallDrop: 150            // how far the wall cloud lowers at full strength
    },

    // Low sun behind the camera and a little to the right. A unit vector
    // pointing TOWARD the sun.
    sun: { x: 0.30, y: 0.16, z: 0.94 },

    // The life cycle as keyframes [seconds, value], smoothstepped between.
    lifecycle: {
        // FORMS EARLY, ON PURPOSE (QA 2026-09-23: "it takes too long to
        // appear"). The wall cloud is down by 2.5 s, the funnel reaches down
        // from 2 s and touches down by 5.5, and it is a mature cone by 8.
        // Rope-out from 14.5 to 20, and gone by 23.5, the moment the
        // rainbow starts to come out, so the two beats never overlap.
        // The wall cloud stays full size until the funnel is gone (23.5), then
        // lifts and draws in to nothing by 24.5 as the rainbow comes out. It
        // used to hang on, lowered, to the end, and hid the bow (QA
        // 2026-09-23, tornado-5).
        wall: [[0.3, 0], [2.5, 1], [20, 1], [23.5, 0.5], [24.5, 0]],
        // How far down from the wall cloud the condensation funnel reaches.
        // Gone by 23.5, so the payoff plays under a clearing sky.
        extent: [[2, 0], [3, 0.12], [5.5, 1], [20.5, 1], [23.5, 0]],
        // The ground dust whirl comes BEFORE the funnel connects.
        dust: [[2.5, 0], [4, 0.35], [6.5, 1], [17, 0.9], [20.5, 0.35], [23.5, 0]],
        width: [[3, 0.3], [5.5, 0.6], [8, 1], [15, 1], [20, 0.2], [24, 0.17]],
        rope: [[14.5, 0], [20, 1]],
        breakup: [[20.5, 0], [23.5, 1]],
        inflow: [[0.5, 0], [3.5, 1], [19, 1], [24, 0]]
    },

    funnel: {
        trunkRadius: 90,         // radius at mid height when mature
        coneBase: 0.30,          // ground radius as a fraction of the trunk
        flareRadius: 170,        // extra radius where it meets the wall cloud
        flareStart: 0.70,        // fraction of height the flare begins at
        leanBase: 30,            // metres the ground point trails when mature
        leanRope: 650,           // extra trail at full rope-out
        // Direction the ground point trails in, degrees from screen-left
        // toward the horizon. The spike measured that a portrait phone loses
        // the roped-out base at 20; the M3 composition decides this for good.
        leanAzimuthDegrees: 20,
        snakeBase: 12,
        snakeRope: 120,
        snakeWaves: 1.2,
        snakeRate: 0.35,         // radians per second
        // Differential rotation SHEARS the texture without limit (the gap
        // times the seconds is the radians of twist), so the gap stays small.
        spinBottom: 0.95,
        spinTop: 0.55,
        twist: 5.0,
        updraft: 38,             // metres per second the texture climbs
        verticalScale: 70,       // metres per noise cell vertically
        noiseK: 2.2
    },

    // Technique A: nested translucent tubes. Innermost first. `wisp` 0 is a
    // solid body, 1 is torn cloud.
    shells: {
        rings: 96,
        segments: 48,
        layers: [
            { scale: 0.80, opacity: 0.95, wisp: 0.15, spin: 1.00, seed: 0.0 },
            { scale: 1.00, opacity: 0.70, wisp: 0.55, spin: 1.15, seed: 11.3 },
            { scale: 1.22, opacity: 0.38, wisp: 0.85, spin: 1.35, seed: 27.9 },
            { scale: 1.50, opacity: 0.18, wisp: 1.00, spin: 1.60, seed: 43.1 }
        ],
        // Layers drawn on a phone. The fourth is the faintest and costs as
        // much as the first. Unmeasured on a phone as yet (M7).
        mobileCount: 3,
        dustLayers: [
            { scale: 0.75, opacity: 0.55, wisp: 0.60, spin: 1.8, seed: 5.5 },
            { scale: 1.00, opacity: 0.35, wisp: 0.90, spin: 2.3, seed: 19.2 }
        ]
    },

    dust: {
        radius: 190,
        height: 170
    },

    debris: {
        count: 260,
        minSize: 2.5,
        maxSize: 8,
        maxHeight: 420,
        periodMin: 5,
        periodMax: 11
    },

    colors: {
        horizon: [0.82, 0.76, 0.62],
        skyLow: [0.54, 0.56, 0.58],
        zenith: [0.30, 0.33, 0.38],
        baseCore: [0.17, 0.19, 0.23],
        baseOuter: [0.33, 0.35, 0.39],
        wall: [0.16, 0.18, 0.22],
        haze: [0.64, 0.63, 0.60],
        wheat: [0.80, 0.63, 0.31],
        pasture: [0.44, 0.49, 0.25],
        groundShade: [0.30, 0.30, 0.27],
        condLit: [0.80, 0.80, 0.80],
        condShade: [0.36, 0.38, 0.44],
        dustLit: [0.62, 0.50, 0.38],
        dustShade: [0.29, 0.25, 0.21],
        debris: [0.17, 0.14, 0.11]
    },

    visibility: 12000,           // haze e-folding distance, metres

    // ---- The props (added 2026-09-23, on the approved M1 look) ------------
    //
    // A LANDSCAPE SCREEN SEES ABOUT 34 DEGREES EITHER SIDE OF CENTER AND A
    // PORTRAIT PHONE ABOUT 10 (the fov is vertical), so everything below is
    // placed by its bearing, atan(x / -z), as much as by its distance. The
    // farm sits where a phone still sees the house and the barn, and nothing
    // may stand over the funnel's ground contact. THE LEFT OF THE FUNNEL IS
    // KEPT CLEAR: as it ropes out, the tornado's foot sweeps from about -1 to
    // -17 degrees, so anything standing there would be crossed. The props
    // test caught the house there at 38.5 s. tests/tornado-props.test.mjs
    // holds all of it. At 1.6 m eye height anything flat beyond about 60 m is a
    // sliver, which is why the pond is close.

    // Light for the lit props (the fractal trees, the flowers, the farm). The
    // sky, the storm and the funnel light themselves and ignore these.
    lights: {
        sun: { color: 0xffdcb4, intensity: 2.6 },
        sky: { color: 0x9aa6b5, ground: 0x7a6040, intensity: 1.0 }
    },

    // The tornado's wind, as the trees, the flowers, the pond and the
    // windmill feel it (wind.js). An inflow toward the tornado that builds
    // with the storm, and a vortex that is strong only close in. Magnitudes
    // are on the garden's scale, where a storm is 0.72.
    wind: {
        ambient: { x: 0.08, z: 0.02 },   // a breath of evening air, always
        // Stronger than the garden's storm (0.72): all of the props are more
        // than 1.3 km from the funnel, where the vortex term is small, so the
        // inflow carries the drama.
        inflow: 1.1,                     // at lifecycle.inflow 1
        vortex: 2.4,                     // at the tornado's edge, full strength
        vortexRadius: 450,               // metres; it falls off as 1 / (1 + (d/r)^2)
        inward: 0.5,                     // the vortex's pull toward the funnel
        swirl: 0.9,                      // and its spin around it
        max: 2.4,
        // How far the trees bend steadily with the wind, on top of the swing
        // (fractaltree's view.lean). 0 is the garden's behavior.
        treeLean: 1.3
    },

    farm: {
        house: { x: 22, z: -430, width: 12, depth: 8, eave: 5.5, ridge: 8.5,
            wall: 0xe9e4d8, roof: 0x3b3d42, trim: 0x2a2b2e },
        barn: { x: 55, z: -470, width: 14, depth: 24, eave: 5, knee: 9, ridge: 12,
            wall: 0x9b2d20, roof: 0x45474c, trim: 0xefe9dc },
        silo: { x: 80, z: -486, radius: 3.2, height: 16, color: 0x9aa5ad, cap: 0x7d868d },
        // In the farmyard between the house and the barn, where a portrait
        // phone sees it standing above the rooftops. It was far out on the
        // left, clear of the roped-out foot's trail, where only a very wide
        // screen showed it (QA 2026-09-23); the barn and silo moved a few
        // metres right to make room for it here.
        windmill: { x: 33, z: -415, height: 14, rotor: 3.2, blades: 12,
            color: 0xb8bcc0, spin: 2.4 }   // radians per second per unit of wind
    },

    fence: {
        z: -95,
        from: -420,
        to: 420,
        spacing: 5,
        postHeight: 1.3,
        wires: [0.45, 0.8, 1.15],
        post: 0x6d5f4f,
        wire: 0x3f3f3f
    },

    pond: {
        x: -18, z: -34,
        radiusX: 26, radiusZ: 12,
        body: [0.12, 0.14, 0.13],
        shore: [0.33, 0.29, 0.21],
        rippleScale: 0.9,
        ripple: 0.05,          // calm
        rippleWind: 0.10       // added per unit of wind
    },

    // Fractal trees from the shared part, by species id. `height` scales
    // the species' own height. The near trees frame the pond and the right of
    // the picture. THE WINDBREAK STANDS RIGHT OF THE FARM, behind the barn and
    // the silo, and not to its left, where the roped-out tornado's ground
    // contact trails (to about -17 degrees): the rope-out is the best shot in
    // the scene and a row of trees would have cut off its foot.
    trees: [
        { species: 'bur-oak', x: 30, z: -70, seed: 11, height: 1.0 },
        { species: 'quaking-aspen', x: -26, z: -58, seed: 23, height: 0.9 },
        { species: 'quaking-aspen', x: -33, z: -63, seed: 29, height: 1.0 },
        // THE FARMYARD OAK, the one tree every screen sees (QA 2026-09-23: on a
        // small phone in portrait none of the others were in frame). It stands
        // just left of the farmhouse, in the one gap near the middle that is
        // free: right of the funnel's foot (which ends about 0.15 degrees
        // right of center while it is down), left of the house (from 2.1), and
        // far enough out that it hides nothing. About 1.2 degrees right of
        // center, 12.6 m tall, so a little taller than the house on screen.
        { species: 'bur-oak', x: 8.8, z: -440, seed: 71, height: 1.4 },
        { species: 'bur-oak', x: 105, z: -458, seed: 41, height: 1.0 },
        { species: 'scots-pine', x: 118, z: -464, seed: 43, height: 1.1 },
        { species: 'quaking-aspen', x: 131, z: -457, seed: 47, height: 1.05 },
        { species: 'sugar-maple', x: 144, z: -462, seed: 53, height: 1.0 },
        { species: 'scots-pine', x: 157, z: -459, seed: 59, height: 1.1 },
        { species: 'quaking-aspen', x: 170, z: -465, seed: 61, height: 0.95 },
        { species: 'bur-oak', x: 183, z: -460, seed: 67, height: 1.0 }
    ],

    // Wildflowers from the shared part, in the foreground.
    meadow: {
        count: 900,
        mobileCount: 450,
        near: 6,               // no closer than this, metres ahead
        far: 30,
        halfAngleDegrees: 36,  // just wider than a landscape frame
        size: { min: 0.26, max: 0.46 },
        seed: 0x7A11,
        // Prairie flowers: purple coneflower, black-eyed Susan, white
        // yarrow, blue flax, Indian blanket.
        palette: [0xb05fa8, 0xf2b92a, 0xf1efe6, 0x6f86d6, 0xd8552b],
        // How far a flower's head moves in the wind, as a fraction of its
        // height per unit of wind (about 1.2 in the storm's inflow). Doubled
        // after QA 2026-09-23 asked for more sway.
        sway: { amount: 0.45, rate: 2.4 }
    },

    // ---- The payoff: the cow (cow.js) ----------------------------------------
    //
    // Lifted out of the dust at the tornado's foot, carried round the edge of
    // the debris, flung toward the camera as the tornado ropes out, and set
    // down on all four feet among the herd in the pasture, who look up. It
    // came down in the foreground flowers at first, and QA (2026-09-23) found
    // the low-poly rig reads well at a distance and not up close, so it
    // lands with the others. Every pose is a function of the story second, so a seek
    // finds the cow exactly where an untouched watch has it.
    //
    // CARTOON PHYSICS, ON PURPOSE. It crosses about 1.8 km in eight seconds,
    // far faster than anything real. At that range it reads as a speck
    // sailing over, and the joke is the slow, gentle descent at the end.
    cow: {
        pickupAt: 8,              // rises out of the dust, once the tornado is mature
        flingAt: 16,              // leaves the debris as the tornado ropes out
        landAt: 24,               // four feet on the ground
        lookAt: 24.8,             // turns its head to the camera
        orbit: {
            radiusScale: 1.15,    // times the dust cloud's radius
            height: 260,          // metres, once it is up
            rise: 3,              // seconds to get there
            rate: 0.9             // radians per second round the funnel
        },
        // ONE FLIGHT FROM THE DEBRIS TO THE GROUND, a cubic curve through
        // these two control points (x, y, z in metres), slowing the whole way
        // and stopping only as its hooves touch. It used to stop dead in the
        // air over the herd and then sink (QA 2026-09-23: "doesn't look quite
        // right"), which nothing in a flight explains. The second point sits
        // above and behind the landing spot, so the last of it comes down at
        // a slant rather than dropping plumb. tests/tornado-cow holds the path
        // inside the frame, above the ground, and never still until it lands.
        cruise: [[-150, 330, -1100], [22, 90, -270]],
        // How hard it brakes: speed falls as (1 - progress)^(brake - 1), so
        // above 1 it slows all the way down and arrives gently.
        brake: 1.8,
        // Counted back from landAt, in seconds: when it rights itself, and
        // when its legs come in under it.
        uprightFrom: 3.2,
        uprightBy: 1.5,
        legsFrom: 1.5,
        legsBy: 0.2,
        // In the middle of the herd, inside a portrait phone's frame, turned a
        // little toward the camera so its head can come round to look.
        landing: { x: 27, z: -192, yaw: -0.45, clear: 2.2 },
        tumbleRate: 2.2,          // radians per second while it is in the air
        // A real cow 1.8 km away is one pixel. While it is far off it is held
        // to this many pixels long in a 900 pixel tall frame, and it is its
        // true size again long before it lands, so the change never shows.
        minPixels: 7,
        chewRate: 3.2,
        neckLimit: 1.3,           // radians the head may turn
        // Four grazing in the pasture, heads down, who look up as the flying
        // one lands among them. Right of the funnel, like everything, and
        // close enough to the middle that a phone sees most of the herd.
        pasture: [
            { x: 17, z: -178, yaw: 0.6 },
            { x: 33, z: -207, yaw: 2.4 },
            { x: 41, z: -184, yaw: -1.1 },
            { x: 50, z: -216, yaw: 1.3 }
        ],
        lookUpAt: 24.3,           // the pasture cows look up, a beat apart
        // The ending card's punch line (Steve's call, 2026-09-23), which the
        // page also carries as its default. A surprise has its own.
        line: 'The storm has moved on. The cow is fine.'
    },

    // ---- Replay surprises (payloads.js) --------------------------------------
    //
    // THE FIRST WATCH IS ALWAYS THE COW: it is the headline. Each replay
    // after it draws something else the tornado picked up, all four once in a
    // shuffled order and then any payload but the last, so "what did you
    // get?" is a question visitors can ask each other. Nothing is stored:
    // a fresh visit starts with the cow again.
    //
    // They ride the cow's clock (pickupAt, flingAt, landAt) and its orbit,
    // then fly their own last curve. THEY LAND CLOSE, 20 to 45 m out and
    // left of center, where the cow cannot (its rig shows its polygons up
    // close): a surprise has to be read in a glance, and these are simple
    // shapes that hold up. Left of center keeps them off the farm and the
    // herd (right of it), and inside a portrait phone's 10 degrees. Each one
    // comes down at 10 to 12 m/s and thumps in, where the cow drifts down,
    // and then does its one thing (tests/tornado-payloads holds all of it).
    //
    //   landing   { x, z, yaw }: yaw is added to the heading that turns the
    //             payload's front (+z) to the camera
    //   cruise    the flight's two control points, as config.cow.cruise
    //   length    its longest side, for the size floor while it is far off
    //   line      the ending card's punch line, in place of the cow's
    payloads: {
        flamingo: {
            // A plastic lawn flamingo, spiked upright among the flowers, where
            // it twangs on its wire legs until it is still.
            landing: { x: -2, z: -24, yaw: 0.3 },     // side on, as it is posed
            cruise: [[-150, 330, -1100], [-10, 40, -120]],
            brake: 1.3,
            length: 1.0,
            sink: 0.12,                       // metres its legs go in
            wobble: { amount: 0.32, rate: 9, decay: 0.9 },
            line: 'The storm has moved on. The flamingo is fine, and has found a new lawn.'
        },
        outhouse: {
            // Lands with a thump, door banging in the flight, then the door
            // creaks open on nobody at all.
            // On the pond's far shore: at 45 m its front corner stood 20 cm
            // inside the water's outline, so it is 1.5 m further back.
            landing: { x: -4.5, z: -46.5, yaw: 0.4 },
            cruise: [[-150, 330, -1100], [-12, 40, -160]],
            brake: 1.3,
            length: 2.3,
            hop: { height: 0.25, seconds: 0.35 },
            wobble: { amount: 0.1, rate: 10, decay: 0.5 },
            door: { opensAt: 1.1, seconds: 1.6, open: 1.9 },
            line: 'The storm has moved on. The outhouse is fine, and nobody was inside.'
        },
        trampoline: {
            // Spins flat through the air like a flying disc, then lands and
            // bounces, each hop lower, until it settles. PAST THE POND: at 38 m
            // it came down in the middle of it (QA 2026-09-23), which is 52 m
            // across and reaches almost to straight ahead, so it flies over
            // the water and bounces on the far side.
            landing: { x: -3.5, z: -57, yaw: 0 },
            cruise: [[-150, 330, -1100], [-12, 45, -175]],
            brake: 1.3,
            length: 3.7,
            spin: 7,                          // radians per second in the air
            bounce: { speed: 5.5, restitution: 0.5, stop: 0.6 },
            line: 'The storm has moved on. The trampoline is fine, and seems to have enjoyed itself.'
        },
        mailbox: {
            // Spiked in on its post among the flowers, a stiff wobble, and
            // then its flag goes up.
            landing: { x: -1.6, z: -20, yaw: -0.25 },  // side on, flag toward us
            cruise: [[-150, 330, -1100], [-8, 35, -110]],
            brake: 1.3,
            length: 1.25,
            sink: 0.18,
            wobble: { amount: 0.22, rate: 12, decay: 0.6 },
            flag: { upAt: 1.3, seconds: 0.35 },
            line: 'The storm has moved on. The mailbox is fine, and it seems you have mail.'
        },
        // The contact shadow under each: strongest on the ground, gone by
        // `height` metres up.
        shadow: { opacity: 0.4, height: 10 }
    },

    // ---- The last payoff: the rainbow (rainbow.js) -------------------------
    //
    // A circle round the point opposite the sun: the first bow at about 42
    // degrees, red outside, and a fainter second at about 51 with its colors
    // the other way round. It comes out as the rope breaks up, so the cow
    // lands under it, and it is still there as the picture fades.
    rainbow: {
        // THE POINT'S ELEVATION, in degrees. Opposite the real sun it would
        // be 9 below the horizon and the crown would sit just above the
        // frame; at 14 the crown lands about 28 degrees up, inside it, and the
        // right leg meets the horizon about 22 degrees right of center. Its
        // bearing always comes from `sun`.
        centerElevation: -14,
        primary: { inner: 40.6, outer: 42.4, strength: 0.55 },
        secondary: { inner: 50.4, outer: 53.4, strength: 0.22 },
        glow: 0.06,               // the brighter sky inside the first bow
        dark: 0.05,               // Alexander's darker band between the two
        distance: 8000,           // metres: out in the rain, behind everything
        amount: [[23.5, 0], [25.5, 1]]
    },

    // ---- Lightning (shared/js/lightning-1.0.0.js) ----------------------------
    //
    // HIGH WATER'S LIGHTNING, promoted to a shared part so this scene has the
    // same streaks, and set in High Water's own shape (see TORNADO_LIGHTNING
    // below). Every number that is not about this scene's size or timing is
    // High Water's tuned value, and its reasons are in
    // www/highwater/js/config.js.
    //
    // THE FLASH RATE IS CAPPED FOR PHOTOSENSITIVE VIEWERS, and not only under
    // reduced motion: no flash is ever closer than minGapSeconds to the last,
    // which holds every second of the story under three flashes (WCAG 2.3.1).
    // The welcome card says there is lightning. tests/tornado-lightning holds
    // the cap.
    lightning: {
        // Strikes per second over the story: none until the storm has
        // organized, busiest while the tornado is down, and none by the time
        // the rainbow comes out.
        rate: [
            { at: 0, value: 0 }, { at: 2.5, value: 0 }, { at: 4, value: 0.25 },
            { at: 10, value: 0.45 }, { at: 18, value: 0.45 }, { at: 21, value: 0.2 },
            { at: 23, value: 0 }
        ],
        minGapSeconds: 0.34,
        strokeChance: 0.3,
        strokeGapSeconds: 0.4,
        secondStrokePower: 0.78,
        attackSeconds: 0.035,
        decaySeconds: 0.28,
        azimuthDegrees: 46,
        boltAzimuthDegrees: 30,
        boltFrameMarginDegrees: 3.5,
        boltFrameMinFraction: 0.4,
        // Most flashes show their channel: the streaks are the point.
        boltChance: [
            { at: 3, value: 0.7 }, { at: 8, value: 0.9 }, { at: 20, value: 0.9 }, { at: 23, value: 0.5 }
        ],
        // ALWAYS BEHIND THE TORNADO (1800 m), in the storm's rain, so the
        // funnel is always in front of a bolt, which is the order they are
        // drawn in.
        farMetres: 6000,
        nearMetres: 2600,
        approach: [
            { at: 3, value: 0.2 }, { at: 15, value: 0.65 }, { at: 23, value: 0.4 }
        ],
        approachSpread: 0.3,
        referenceMetres: 2600,
        // How much a flash lights the sky and the storm base (world.js), and
        // the farm, trees and cows (a light).
        skyGain: 1.1,
        lightIntensity: 3.0,
        lightColor: 0xcfe0ff,
        flashColor: [0.74, 0.82, 1.0],
        flashSpread: 3,
        reduced: { gain: 0.26, strokeChance: 0, attackSeconds: 0.18, decaySeconds: 0.55 },
        bolt: {
            // From the storm base to the ground. The jitter scales with the
            // height (High Water's bolts were 420 m tall, these 900); the width
            // is an angle, so it is High Water's exactly.
            baseHeightMetres: 900,
            iterations: 6,
            jitterMetres: 64,
            jitterDecay: 0.52,
            branchFrom: 1,
            branchTo: 3,
            branchChance: 0.3,
            branchGenerations: 2,
            branchLength: 0.55,
            branchSpreadDegrees: 42,
            branchThin: 0.55,
            branchDim: 0.52,
            branchJitterDecay: 0.7,
            maxSegments: 512,
            widthRadians: 0.0045,
            intensity: 2.2,
            coreColor: 0xffffff,
            glowColor: 0x6f8cff
        }
    }
});

/**
 * The lightning's settings in the shape the shared part reads (High Water's):
 * the story's length under `storm.seconds`, the lightning under
 * `storm.lightning`, and the lens under `camera.fov`.
 */
export const TORNADO_LIGHTNING = Object.freeze({
    storm: Object.freeze({ seconds: TORNADO_CONFIG.story.seconds, lightning: TORNADO_CONFIG.lightning }),
    camera: Object.freeze({ fov: TORNADO_CONFIG.camera.fovDegrees })
});
