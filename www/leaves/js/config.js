// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - every number in the leaf lab (www/leaves).
 *
 * M0, THE LEAF LAB (2026-10-06). The leaf blower scene starts as a question
 * rather than a scene: how many leaves can a phone hold, blow and pile up at
 * a smooth frame rate, and does blowing them feel good? So this first build
 * is a front yard buried in leaves, a leaf blower that follows the pointer,
 * and a readout. The yard, the neighbor and the game come once the numbers
 * are in.
 *
 * HOW THE LEAVES WORK (sim.js). Every leaf is simulated on the CPU, but a leaf
 * lying still costs nothing: it sleeps in a heightfield until the blower's
 * air reaches it, and only the leaves in the air or sliding along the ground
 * are stepped. Sleeping leaves stack, so a pile is a real pile that keeps
 * its slope, and a leaf buried under others is shielded from the wind until
 * the ones above it have gone.
 *
 * COORDINATES. Meters. The house is at the back (-z), the street at the front
 * (+z), the neighbor's yard to the right (+x) past a low picket fence, and the
 * camera stands out in the street looking back at the house.
 */

export const LEAVES_CONFIG = Object.freeze({
    // Solved once per visit and cached in sessionStorage by the shared boot
    // part; the same key every scene uses, so one solve covers the site.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    site: {
        home: { path: '/' }
    },

    // How many leaves, by device, and what the lab's buttons offer. A count
    // from the lab (?leaves=n on a QA host) wins over both.
    leaves: {
        desktop: 24000,
        mobile: 12000,
        labCounts: [6000, 12000, 24000, 36000, 48000],
        minCount: 500,
        maxCount: 96000,
        seed: 1031,
        // THE YARD SHOULD LOOK BURIED WHATEVER THE COUNT, so a leaf's size is
        // solved from the count: the leaves' total area is `coverage` times
        // the lawn's. Fewer leaves are bigger leaves. `fill` is how much of
        // its square a leaf's outline covers.
        coverage: 1.5,
        fill: 0.55,
        minSize: 0.11,
        maxSize: 0.28,
        // Each leaf varies around that size by up to this fraction either way.
        sizeJitter: 0.25,
        // How much of the yard's leaf fall lies in drifts along the fences and
        // the house, rather than spread evenly.
        driftShare: 0.3,
        driftWidth: 1.4
    },

    // The world, in meters. The sim's grid covers `bounds`; the walls are
    // thin and axis-aligned, and a leaf above a wall's height sails over it.
    yard: {
        bounds: { minX: -10, maxX: 18, minZ: -6, maxZ: 12 },
        // Our lawn, where the leaves fall and where the score is counted.
        lawn: { minX: -10, maxX: 10, minZ: -6, maxZ: 7 },
        // The neighbor's lawn, past the picket fence.
        neighbor: { minX: 10.1, maxX: 18, minZ: -6, maxZ: 7 },
        sidewalk: { minZ: 7.4, maxZ: 9 },
        // A tarp on the lawn to blow the leaves onto.
        tarp: { minX: -8, maxX: -4.6, minZ: 2.6, maxZ: 5.8 },
        walls: [
            // The picket fence between the two yards.
            { axis: 'x', at: 10, from: -6, to: 7.2, height: 0.95 },
            // The house and the neighbor's house, across the back.
            { axis: 'z', at: -6, from: -10, to: 18, height: 5 },
            // A tall hedge down the left side.
            { axis: 'x', at: -10, from: -6, to: 12, height: 1.8 }
        ],
        house: { minX: -9, maxX: 9, depth: 8, wall: 3.2, ridge: 6.2 },
        neighborHouse: { minX: 11.5, maxX: 22, depth: 8, wall: 3.2, ridge: 6 }
    },

    // THE SIM, in SI units. See sim.js for how each one is used.
    physics: {
        gravity: 9.8,
        // Quadratic drag, per meter: a leaf falls at sqrt(gravity / drag),
        // about 1.6 m/s, the speed real leaves flutter down at.
        drag: 3.8,
        dragJitter: 0.3,
        // The side-to-side swing of a falling leaf.
        flutter: { accel: 3.2, minHz: 1.6, maxHz: 3.2, swing: 0.55 },
        // A leaf lying on the ground feels this share of the air, and the
        // ground's friction takes this much speed off it every second.
        groundDrag: 0.55,
        friction: 5.2,
        // A resting leaf moves when the air over it is faster than this, give
        // or take `wakeJitter` of it, so a jet's edge is ragged.
        wakeSpeed: 1.9,
        wakeJitter: 0.35,
        // Leaves skittering along in air faster than `liftSpeed` hop up into
        // it now and then, at `hopRate` hops a second at twice that speed.
        liftSpeed: 3.2,
        hopRate: 2.4,
        hop: { min: 1.2, max: 3.6 },
        // Some leaves cartwheel end over end when they skid faster than this.
        cartwheelSpeed: 1.4,
        cartwheelShare: 0.45,
        // A leaf that has been this slow for this long goes back to sleep.
        sleepSpeed: 0.14,
        sleepSeconds: 0.25,
        // The longest step the integrator takes. A slow frame takes several.
        maxStep: 1 / 90,
        // How hard a wall stops a leaf (0 dead, 1 bouncing).
        wallBounce: 0.15
    },

    // THE PILES. Resting leaves deposit their volume into a heightfield of
    // `cell` meter squares, spread over the 3 by 3 cells around them.
    pile: {
        cell: 0.1,
        // How deep a layer of loosely fallen leaves is, per leaf.
        loft: 0.012,
        // A leaf only feels the wind while it lies within this many leaves'
        // depth of the surface, so a pile is blown away from the top down.
        // In leaves rather than meters, because a leaf's depth in the pile
        // follows its size, and the size follows the count.
        shieldLeaves: 2.5,
        // The steepest slope a pile keeps. A leaf landing on a steeper one
        // slides down until it finds a place it can stay.
        reposeDegrees: 40,
        // The spatial buckets resting leaves are filed in, for finding the
        // ones the blower reaches.
        bucket: 0.5
    },

    // THE BLOWER: a jet from the nozzle that hits the ground and spreads
    // along it. Speeds in m/s.
    blower: {
        // The nozzle's tip, relative to the person holding it: ahead, up, and
        // out to their right, where the blower hangs.
        reach: 0.95,
        height: 0.34,
        side: 0.14,
        // How far below level the nozzle points, in radians.
        pitch: 0.3,
        // The air leaves the nozzle at `speed` and slows as 1 / distance past
        // `core` meters.
        speed: 30,
        core: 0.35,
        // The jet's half-width at the nozzle and how fast it widens. WIDER
        // THAN A REAL BLOWER'S, on purpose: a real one clears a strip a foot
        // or two wide, which is accurate and no fun to watch.
        width: 0.08,
        spread: 0.3,
        // Along the ground past where the jet lands: the air slows as
        // 1 / (1 + s / wallDecay), spreads at `wallSpread` per meter, and is
        // `wallDepth` deep where it lands, thickening by `wallThicken` per
        // meter as it goes.
        wallDecay: 2,
        wallSpread: 0.55,
        wallDepth: 0.6,
        wallThicken: 1.0,
        // Where the jet lands the air kicks upward, this share of its speed,
        // fading over `updraftLength` meters, which is what throws leaves up
        // into the air rather than only skidding them along.
        updraft: 1.0,
        updraftLength: 2.5,
        range: 7,
        turbulence: 0.35,
        // The person walks toward the pointer at `walkSpeed` and stops
        // `standoff` meters short of it, turning at `turnRate` rad/s.
        walkSpeed: 2.4,
        standoff: 2.4,
        turnRate: 7,
        // Where the person starts.
        start: { x: 2, z: 5.2 },
        // Keyboard aiming: how far ahead of the person the aim point sits.
        keyAim: 3
    },

    camera: {
        fovDegrees: 42,
        near: 0.3,
        far: 200,
        // The view looks from the street at the yard's center, from this
        // high and this far back on a landscape screen.
        target: { x: 0, y: 0, z: 0.5 },
        height: 9.5,
        back: 15.5,
        // On a narrow screen the camera comes in close and follows the
        // blower instead of showing the whole yard. `span` is the width of
        // ground the view is fitted to.
        wideSpan: 23,
        narrowSpan: 11,
        follow: 2.5
    },

    look: {
        background: 0xbcd3e6,
        fog: { color: 0xc9d6df, near: 30, far: 90 },
        lawn: 0x5d7f3a,
        lawnDark: 0x46652b,
        neighborLawn: 0x6a8f3f,
        sidewalk: 0xb9b4aa,
        street: 0x45474a,
        tarp: 0x2f6aa6,
        siding: 0xf2efe8,
        trim: 0xffffff,
        roof: 0x4a4d52,
        door: 0x7a2f2a,
        window: 0x2d3a46,
        neighborSiding: 0xd9d4c4,
        fence: 0xf4f1ea,
        hedge: 0x2f4a26,
        blower: 0xe0661f,
        // The leaves' palette, by kind. Display colors (sRGB).
        palettes: {
            maple: [0xb3261e, 0xc8321f, 0xd84a22, 0xe0662a, 0xe8892b, 0xf0a032],
            oak: [0x8a5a2b, 0x9c6430, 0x6e4a25, 0xa0703a, 0x7d4b26],
            birch: [0xe9c046, 0xd8b23a, 0xf0c95a, 0xcfa634, 0xb7b04a],
            elm: [0xd9a43a, 0xc68f2e, 0xe0b04c, 0xa98a3c]
        },
        // How often each kind falls in this yard.
        kinds: { maple: 0.42, oak: 0.22, birch: 0.2, elm: 0.16 },
        // How much each leaf's color wanders from its palette entry.
        colorJitter: 0.08,
        // A leaf's underside is paler and duller.
        underside: 0.72,
        // How cupped a leaf is, as a share of its size.
        curl: { min: 0.06, max: 0.22 }
    },

    lights: {
        sun: { color: 0xffe2b8, intensity: 2.6, from: { x: -14, y: 18, z: 12 } },
        sky: { color: 0xcfe0f0, ground: 0x6b5a3a, intensity: 1.15 },
        exposure: 1
    },

    shadows: {
        enabled: true,
        mapSize: { desktop: 2048, mobile: 1024 },
        // The leaves' shadows are redrawn this often while any leaf moves.
        hz: 30,
        bias: -0.0004,
        normalBias: 0.02
    },

    render: {
        maxPixelRatio: 2,
        mobilePixelRatio: 1.5
    }
});
