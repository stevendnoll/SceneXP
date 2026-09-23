// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - every number in Tornado Alley.
 *
 * A TIMED STORY, the second after High Water: sixty seconds on the open
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
    story: {
        seconds: 60,
        fadeSeconds: 3,
        // Reported as reached-<name> the first time a watch gets there.
        // The PRD's arc; the cow and the rainbow arrive in M5 and M6.
        stages: [
            { at: 0, name: 'ordinary' },
            { at: 6, name: 'organizing' },
            { at: 16, name: 'wall-cloud' },
            { at: 22, name: 'touchdown' },
            { at: 26, name: 'mature' },
            { at: 32, name: 'pickup' },
            { at: 40, name: 'rope-out' },
            { at: 48, name: 'dissipating' },
            { at: 50, name: 'payoff' },
            { at: 54, name: 'rainbow' }
        ]
    },

    // The player's timings. High Water's, which Steve QA'd on 2026-09-23.
    controls: {
        idleSeconds: 3,
        stepSeconds: 5,
        pageSeconds: 15,
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
        wall: [[4, 0], [14, 1], [44, 1], [54, 0.25]],
        // How far down from the wall cloud the condensation funnel reaches.
        // Gone by 53, so the payoff at 50 plays under a clearing sky.
        extent: [[16, 0], [19, 0.12], [24, 1], [46, 1], [53, 0]],
        // The ground dust whirl comes BEFORE the funnel connects.
        dust: [[17, 0], [21, 0.35], [26, 1], [40, 0.9], [46, 0.35], [51, 0]],
        width: [[18, 0.3], [24, 0.6], [30, 1], [38, 1], [45, 0.2], [52, 0.17]],
        rope: [[37, 0], [45, 1]],
        breakup: [[46, 0], [53, 1]],
        inflow: [[5, 0], [16, 1], [42, 1], [50, 0]]
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
        barn: { x: 48, z: -470, width: 14, depth: 24, eave: 5, knee: 9, ridge: 12,
            wall: 0x9b2d20, roof: 0x45474c, trim: 0xefe9dc },
        silo: { x: 72, z: -486, radius: 3.2, height: 16, color: 0x9aa5ad, cap: 0x7d868d },
        // Far out on the left, past where the roped-out foot trails (about
        // -17 degrees). Everything else stands right of the funnel.
        windmill: { x: -215, z: -420, height: 14, rotor: 3.2, blades: 12,
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
        sway: { amount: 0.22, rate: 2.1 }
    }
});
