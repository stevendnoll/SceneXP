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

    // How many leaves, by device. A count from the address (?leaves=n on a
    // QA host) wins over both.
    leaves: {
        desktop: 24000,
        mobile: 12000,
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
        // NO INVISIBLE WALLS (Steve's QA, 2026-10-08: leaves stopped "at the
        // end of the row of hedges" on the sidewalk, and in the road a little
        // past the parked car). The ground ran from the hedge to the middle
        // of the neighbor's lawn and 12 m out, so its edges stood on the
        // sidewalk, in the street and on his lawn. Now it reaches well past
        // anywhere the blower can push a leaf (measured: about 9 m past where
        // the person may walk, so x -18.7, x 18.9 and z 18.2), past his side
        // fence and the sage house's lawn, and into the far lane. Only real
        // things stop a leaf: the hedge, the fences, the houses.
        bounds: { minX: -26, maxX: 28, minZ: -6, maxZ: 22 },
        // Where the trees' crowns let their leaves fall (trees.js): the ground
        // as it was, so the maple over the hedge drops none into the side
        // yard behind it.
        fallArea: { minX: -10, maxX: 18, minZ: -6, maxZ: 12 },
        // Our lawn, where the leaves fall and where the score is counted.
        lawn: { minX: -10, maxX: 10, minZ: -6, maxZ: 7 },
        // The neighbor's lawn, past the picket fence.
        neighbor: { minX: 10.1, maxX: 18, minZ: -6, maxZ: 7 },
        sidewalk: { minZ: 7.4, maxZ: 9 },
        // The double yellow line's middle, this far out from the curb's side
        // of the sidewalk (house.js buildStreet). Steve's QA, 2026-10-08: at
        // 4.2 "the car parked along the curb would block traffic". The parked
        // car's far side is 2.4 m out, and a passing car 1.85 m wide wants
        // half a meter either side of it, so the lane runs to 5.3 m.
        centerLine: 5.4,
        // How far back the hedge down our left side is drawn (M6 QA), along
        // the property line past the backs of the houses.
        hedgeBack: -15,
        // The hedge's shape (Steve's QA, 2026-10-08: "very sharp 90 degree
        // corners", "a green rectangle"): a clipped boxwood `width` across
        // at the foot, `taper` narrower each side at the top, its shoulders
        // rounded at `shoulder`, its ends rounded off over `round`. Its
        // clumps stand out up to `bump` + `fine`, `clump` to the meter, and
        // its lawn face stands `inset` behind the sim's wall, so no clump
        // hides a leaf banked against it (hedge.js). Rings `spacing` apart,
        // and the leafy grain repeats every `texture` meters.
        // The side gate between the houses (yard.js sideGate, Steve's QA,
        // 2026-10-08: "just looks like a white rectangle"): `height` to its
        // top rail, posts `post` square, boards `board` wide with `gap`
        // between and `thick` deep, a band of `lattice` under the top rail,
        // `lift` off the ground, and `back` behind the neighbor's face.
        gate: { height: 1.8, post: 0.1, board: 0.13, gap: 0.014, thick: 0.022, rail: 0.06, lattice: 0.32, lift: 0.05, back: 0.02 },
        // His striped lawn runs to his side fence (yard.js groundRects),
        // clear of his inflatable ghost's arms.
        // A shrub in the gap between our house and the hedge (yard.js),
        // its front just behind the line the leaves bank against.
        cornerShrub: { x: -9.5, z: -6.8, r: 0.55, tall: 1.6 },
        // A leaf rake leaning on our house's bare left end, left of the first
        // window, its fan of tines on the tarp (house.js buildRake): the
        // handle's top `top` meters up the wall at `x`, its tines reaching
        // `reach` meters out from the wall, `width` across.
        rake: { x: -8.3, top: 1.45, reach: 1.15, width: 0.56, tines: 15, handle: 0xc8a878, steel: 0x8a8d90 },
        // His side fence stands at maxX (yard.js hisSideFence), boxwoods in
        // its front corner.
        neighborYard: {
            maxX: 24.9,
            boxwoods: [{ x: 24.35, z: 6.55, r: 0.42 }, { x: 24.4, z: 5.7, r: 0.36 }, { x: 23.65, z: 6.75, r: 0.32 }]
        },
        // LEAVES RESTING WHERE THE BLOWER NEVER REACHES (Steve's QA,
        // 2026-10-08: "a few more resting leaves to the houses' roofs"):
        // how many on each roof's front slope (`slope` for the houses down
        // the block), on our porch's roof and along the hedge's top, laid
        // `lift` off the surface, their colors `weathered` a little darker
        // than the lawn's. Decoration only, never in the sim (rooftops.js).
        resting: {
            counts: { ours: 380, neighbor: 300, slope: 160, porch: 60, hedge: 90 },
            seed: 6151, lift: 0.012, weathered: 0.85
        },
        hedgeShape: {
            width: 0.78, taper: 0.06, shoulder: 0.2, round: 0.38, inset: 0.07,
            bump: 0.045, fine: 0.015, clump: 2.4, spacing: 0.12, texture: 0.55, seed: 41
        },
        // The rest of the block (M6 QA): lawn under everything, well past
        // both neighbors and back behind the houses, so no view the camera
        // can take shows the sky through the ground, even on a 32:9 screen.
        // Back to -70 since the backdrop (2026-10-08): the view's top looks
        // some 45 m back, past the next street's houses.
        block: { minX: -120, maxX: 140, minZ: -70 },
        // A tarp to blow the leaves onto, IN THE BACK-LEFT CORNER, against
        // the house and the hedge (moved there at M1, 2026-10-06). Out on the
        // open lawn it caught almost nothing: leaves stop wherever the air
        // gives out, so they blew across it and on past. With two walls
        // behind it they bank up on it, and a bot sweeping toward the corner
        // piled 3,500 leaves 1.3 meters high in a minute.
        // It runs right up to both walls: leaves banked against the house
        // or the hedge on it are on it (they rest within a centimeter of the
        // wall, and a tarp edge 5 cm short missed them all).
        tarp: { minX: -10, maxX: -5, minZ: -6, maxZ: -1.5 },
        walls: [
            // The picket fence between the two yards.
            { axis: 'x', at: 10, from: -6, to: 7.2, height: 0.95 },
            // The house and the neighbor's house, across the back.
            { axis: 'z', at: -6, from: -10, to: 18, height: 5 },
            // A tall hedge down the left side, from the house to its end at
            // the sidewalk. It `stops` a leaf however high it flies (a leaf
            // over 1.8 m is still stopped, up to 40 m): the side yard behind
            // it (backyard.js) is drawn, not simulated, as it was when the
            // sim's ground ended here.
            { axis: 'x', at: -10, from: -6, to: 7.4, height: 1.8, stops: 40 },
            // His white picket along his far side, at neighborYard.maxX
            // (`drawn` by yard.js hisSideFence, with its gate and boxwoods).
            { axis: 'x', at: 24.9, from: -6, to: 7.2, height: 0.95, drawn: 'hisSideFence' }
        ],
        // `door` is our front door's middle, in x (house.js).
        // `setBack` (M6 QA): how far behind the line the leaves rest against
        // (lawn.minZ, the sim's wall) each house is drawn, so nothing on its
        // face stands in front of them. Our stone base is 12 cm proud of the
        // wall, and a leaf is up to 17 cm across, so a leaf banked against
        // the house lay inside the stone (Steve: "the exterior facade of the
        // houses overlap with some of the leaves on the ground"). His
        // window mullions stand as proud. The strip between is a gravel drip
        // edge along ours and a mulch bed along his.
        house: { minX: -9, maxX: 9, depth: 8, wall: 3.2, ridge: 6.2, door: -0.5, setBack: 0.28 },
        neighborHouse: { minX: 11.5, maxX: 22, depth: 8, wall: 3.2, ridge: 6, setBack: 0.28 },
        // Down the block (M6 QA): a sage house past the hedge and a warm
        // gray one past the neighbor's, set back a little, each with its
        // garage on the far side from us (`garage` -1 left, 1 right). The
        // left one stands clear of the maple in its side yard.
        street: [
            {
                name: 'left', minX: -31.5, maxX: -19.5, front: -7.2, depth: 9, wall: 3, ridge: 5.8, garage: -1,
                siding: 0xa3ae98, lap: 0x86917c, roof: 0x4a4d52, door: 0x7a2e2a, garageDoor: 0xf2efe8
            },
            {
                name: 'right', minX: 25.5, maxX: 37.5, front: -6.8, depth: 9, wall: 3.1, ridge: 6.1, garage: 1,
                siding: 0xbdb7ad, lap: 0x9f998f, roof: 0x3c3f44, door: 0x2c3e35, garageDoor: 0xf2efe8
            }
        ],
        // SOLID THINGS ON THE GROUND (M5): boxes a leaf bumps into below
        // `height` and the person walks round. A `platform` is one a leaf can
        // land on and lie on top of (sim.floorGrid). The trees' trunks and
        // the pumpkins are added to these from `trees` and `pumpkins` below.
        // house.js draws the porch, the posts and the car from these, so what
        // is drawn and what is solid can never disagree. Edges sit on the
        // 10 cm grid, where the sim's walls go.
        boxes: [
            // Our porch, and the step down from it. A pushed leaf climbs the
            // step and then the porch a stair at a time.
            { name: 'porch', minX: -2.4, maxX: 1.4, minZ: -6, maxZ: -4.1, height: 0.28, platform: true },
            { name: 'step', minX: -1.7, maxX: 0.7, minZ: -4.1, maxZ: -3.6, height: 0.14, platform: true },
            // The black steel posts that hold up the porch roof.
            { name: 'post', minX: -2.3, maxX: -2.2, minZ: -4.4, maxZ: -4.3, height: 2.8 },
            { name: 'post', minX: 1.2, maxX: 1.3, minZ: -4.4, maxZ: -4.3, height: 2.8 },
            // The neighbor's front step, under his door (yard.js).
            { name: 'step', minX: 14.1, maxX: 16.1, minZ: -6, maxZ: -5.1, height: 0.18, platform: true },
            // The mailbox post, at the end of our walk.
            { name: 'mailbox', minX: 0.2, maxX: 0.4, minZ: 7.1, maxZ: 7.3, height: 1.1 },
            // A car parked at the curb: its body to the hood's height, and
            // the cabin on top, both platforms, so a leaf blown into the
            // street can come to rest on the hood or the roof.
            { name: 'car', minX: -6.2, maxX: -1.8, minZ: 9.6, maxZ: 11.4, height: 0.85, platform: true },
            { name: 'cabin', minX: -5.1, maxX: -2.8, minZ: 9.7, maxZ: 11.3, height: 1.42, platform: true }
        ],
        // Pumpkins on the porch and its step: where each sits, how big, and
        // what it sits on (`y`). Solid, and a leaf can land on one.
        pumpkins: [
            { x: -1.8, z: -4.6, y: 0.28, r: 0.24, color: 0xe0701f },
            { x: -1.35, z: -4.35, y: 0.28, r: 0.17, color: 0xd9832a },
            { x: 0.85, z: -4.55, y: 0.28, r: 0.2, color: 0xefe3c4 },
            { x: 0.4, z: -3.85, y: 0.14, r: 0.14, color: 0xe0701f }
        ],
        // THE TREES (M5): the garden's fractal trees (shared parts), in full
        // autumn color, placed where their crowns never hide the lawn from
        // the camera (it looks from the street, so nothing stands in front).
        // Each holds `hanging` of the yard's leaves up in its crown, dropped
        // a few at a time (see trees.js).
        // `hanging` is how many leaves its crown holds (only the part of the
        // crown over `fallArea` can drop any, so the tree past the neighbor's
        // yard holds none).
        trees: [
            // Our sugar maple, in the back right corner by the house.
            { species: 'sugar-maple', x: 6.6, z: -3.4, height: 10, seed: 1101, trunk: 0.22, crown: { y: 5.5, radius: 2.8 }, hanging: 70 },
            // The one on the other side of the hedge, overhanging our lawn.
            { species: 'sugar-maple', x: -11.4, z: 0.5, height: 11, seed: 2207, trunk: 0.24, crown: { y: 6, radius: 3.2 }, hanging: 50 },
            // Past the neighbor's yard.
            { species: 'quaking-aspen', x: 20.2, z: 1.5, height: 9, seed: 3313, trunk: 0.18, crown: { y: 5, radius: 2.4 }, hanging: 0 },
            // Down the block, behind the houses, their crowns over the roofs.
            { species: 'bur-oak', x: -3.5, z: -17, height: 12, seed: 4409, trunk: 0.3, crown: { y: 7, radius: 3.6 }, hanging: 0 },
            { species: 'sugar-maple', x: 5.5, z: -18.5, height: 12, seed: 5501, trunk: 0.26, crown: { y: 7, radius: 3.4 }, hanging: 0 },
            { species: 'paper-birch', x: 16, z: -16.5, height: 11, seed: 6607, trunk: 0.18, crown: { y: 6, radius: 2.6 }, hanging: 0 },
            { species: 'sugar-maple', x: -17.5, z: -8, height: 11, seed: 7703, trunk: 0.24, crown: { y: 6, radius: 3.2 }, hanging: 0 },
            // A Japanese maple behind the houses, framed by the gap between
            // them (gap.js): too wide for the gap itself (about 3.6 m).
            { species: 'japanese-maple', x: 10.25, z: -16.4, height: 4, seed: 9907, trunk: 0.14, crown: { y: 3, radius: 1.8 }, hanging: 0 },
            // A blue spruce in the side yard behind our hedge (backyard.js).
            { species: 'blue-spruce', x: -18.6, z: -1.6, height: 7, seed: 8801, trunk: 0.2, crown: { y: 3.6, radius: 1.8 }, hanging: 0 },
            // A tall pine in the sage house's back yard, over the green
            // shed's fence (backdrop.js, 2026-10-08).
            { species: 'scots-pine', x: -14.6, z: -20.1, height: 13, seed: 9311, trunk: 0.28, crown: { y: 9, radius: 2.6 }, hanging: 0 }
        ],
        // THE REST OF THE NEIGHBORHOOD (backdrop.js, Steve's QA, 2026-10-08:
        // behind the green shed and fence "the area still looks too empty",
        // and "make the rest of the environment feel as real and life-like
        // as possible"). The next street's houses, their backs to us, one a
        // `lot` from `from` to `to`, `backZ` give or take `jitter`; a board
        // fence along the back lot line at `fence.z` and between their lots;
        // utility poles along it with wires; a swing set and a trampoline in
        // the sage house's back yard; and a treeline in the fog.
        backdrop: {
            houses: {
                seed: 4421, lot: 15, from: -60, to: 75, minX: -70, maxX: 90, width: [9.5, 12], backZ: -29.5, jitter: 1.3,
                sidings: [0xd9d4c7, 0x8a9aa5, 0xb7a68c, 0x7f8b76, 0xe8e6e0, 0x9c5b45, 0xa8a29a],
                roofs: [0x3c3f44, 0x4a4d52, 0x5a4a3e, 0x2e3033],
                deck: 0x8a6a4c, door: 0x3a4a5a
            },
            fence: { z: -21, height: 1.8, panel: 2.4, color: 0x8f7458 },
            poles: {
                z: -21.6, xs: [-52, -16, 20, 56], height: 10.5, arm: 2.4, cable: 7.2, sag: 0.7, transformer: 1,
                wood: 0x5e4a3a, insulator: 0x8fa3a0, can: 0x8a8d8f, wire: 0x2a2b2d
            },
            swingSet: { x: -12.6, z: -17.2, turn: 0.25, width: 2.6, height: 2.3, frame: 0x3f6b4a, seat: 0x2a2b2d },
            trampoline: { x: -16.9, z: -18.2, r: 1.6, pad: 0x2f6aa6 },
            treeline: {
                seed: 5813, count: 260, near: -42, far: -56, minX: -100, maxX: 120, size: [3, 5.5], trunk: 0.8, evergreens: 0.3,
                greens: [0x2f4a2a, 0x3a5530, 0x29402a],
                autumn: [0xb5532a, 0xc9782e, 0xd49a3a, 0x9c3b25, 0xa8742f, 0x7d6a33]
            }
        },
        // BETWEEN THE HOUSES (Steve's M6 QA: "more environment details to the
        // area between the main house and the neighbor's house"), behind the
        // side gate (gap.js). From the street only what stands above about
        // 2.5 m shows over the gate, so: an arbor over the gate climbing with
        // autumn ivy, cafe lights strung across between the eaves, and on
        // the neighbor's side wall (which faces us) a little shuttered
        // window, a downspout and ivy.
        gap: {
            arbor: { depth: 0.6, height: 2.45, post: 0.09, color: 0xf4f1ea },
            ivy: [0x9c2b25, 0xc8501f, 0xb87a2a, 0x6e2a1e, 0x4f6b2a],
            lights: { rows: [-6.7, -7.6, -8.5], y: 3.0, sag: 0.25, bulb: 0xffcf7a },
            sideWindow: { z: -9.2, y: 2.25, w: 0.7, h: 0.8 },
            downspout: 0xf4f1ea
        },
        // BEHIND OUR HEDGE (Steve's M6 QA: "more environment details to the
        // back left of the scene behind the row of hedges"): the sage house's
        // side yard, between the hedge and its garage, all of it behind the
        // hedge, which no leaf gets over (`stops`). A garden shed, a privacy fence along the back, raised
        // beds and a pumpkin patch, a fire pit with two Adirondack chairs, a
        // birdbath, a wheelbarrow of leaves, stepping stones (backyard.js).
        // Packed into the 4 m or so behind the hedge that a wide screen shows
        // when the visitor walks over to it (tests/leaves-backyard).
        backyard: {
            shed: { x: -13.7, z: -10.6, w: 2.6, d: 2.0, wall: 2.1, ridge: 2.8, siding: 0x6f8a7a, roof: 0x3c3f44, door: 0x3f4f46 },
            // The back fence runs to the hedge.
            fence: { z: -13.6, from: -19.4, to: -10.92, height: 1.8, color: 0x9a7b5c },
            beds: [{ x: -12.8, z: -2.8, w: 2.2, d: 0.9 }, { x: -12.8, z: -1.1, w: 2.2, d: 0.9 }],
            patch: { x: -13.3, z: -4.9, w: 2.2, d: 1.3 },
            firePit: { x: -13.2, z: -7.6, r: 0.5 },
            chairs: [{ x: -14.5, z: -7.0, turn: 2.0 }, { x: -11.9, z: -6.9, turn: -2.0 }],
            birdbath: { x: -12.3, z: 3.6 },
            wheelbarrow: { x: -11.85, z: 2.0, turn: 0.7 },
            stones: { from: { x: -18.6, z: -6.2 }, to: { x: -14.2, z: -9.4 }, count: 6 },
            look: { cedar: 0x8a5a3a, soil: 0x3b2a1e, vine: 0x3f6a2a, stone: 0x8e8a82, chair: 0xf2efe8, iron: 0x2a2b2d, ember: 0xff7a2a, wood: 0x6b4f33 }
        },
        // How fast the crowns let their leaves go, per tree per second, and
        // how often an empty crown takes a leaf back from the street.
        // At 0.9 a second a tree and about three seconds down from the crown,
        // three or four are in the air at any moment.
        // NO REFILL (Steve's M6 QA, 2026-10-07: "I can never get to 100%").
        // Taking leaves back from the street kept the trees dropping onto a
        // cleared lawn forever. Without it each crown lets go of what it
        // holds (the sugar maple's 70 last about 78 seconds, the first half
        // of a three minute round) and then is done, so a lawn can be
        // finished and stay that way.
        fall: { rate: 0.9, refill: 0 }
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
        // A slow leaf (under this speed) that other leaves come to rest
        // around stays where it is rather than being lifted onto them.
        settleSpeed: 0.45,
        // A leaf in the blower's air can be pushed up a pile face this many
        // times steeper than the angle of repose (see sim.js).
        pushClimb: 3,
        // The longest step the integrator takes. A slow frame takes several.
        maxStep: 1 / 90,
        // How hard a wall stops a leaf (0 dead, 1 bouncing).
        wallBounce: 0.15,
        // A leaf driven into a wall by air faster than `air` m/s is lifted at
        // `share` of the speed it hit with: the air goes up the wall and
        // takes it along (see sim.js).
        wallLift: { air: 2.5, share: 0.8 },
        // A body landing in a pile pushes a gust of air up through it (see
        // burst in sim.js): it lasts `life` seconds, fades over `height`
        // meters above the pile, and leans outward `spread` per meter from
        // the middle.
        gust: { life: 1, height: 2, spread: 0.6 }
    },

    // THE PILES. The surface over each `cell` meter square is the top of the
    // sleeping leaves that cover it. See sim.js.
    pile: {
        cell: 0.1,
        // How much a leaf adds on top of whatever it lands on. Tuned so the
        // first scatter's drifts match the carpet Steve approved at M0 (the
        // 90th percentile of resting leaves 5.5 cm up, the 99th 10 cm, made
        // by the old volume model with `loft` 0.012): 4.3 cm and 8.4 cm.
        thick: 0.014,
        // How many cells around its own a leaf covers. 0, its own cell only:
        // at 1 every leaf rode on top of any leaf within 20 cm and the lawn
        // stacked five times deeper than the approved carpet. Neighbors at
        // the same height are kept apart by each leaf's fixed `lift`.
        reach: 0,
        // Up to this much more than 2 mm each leaf rests above the surface,
        // fixed per leaf (see sim.js `lift`).
        lift: 0.004,
        // A leaf only feels the wind while it lies within this many leaves'
        // thickness of the surface, so a pile is blown away from the top
        // down.
        shieldLeaves: 2.5,
        // The steepest slope a pile keeps. A moving leaf cannot climb a step
        // steeper than this from one cell to the next, so a drift builds out
        // from a wall at this slope as its leaves arrive.
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

    // THE NEIGHBOR (M2). He is inside until enough of our leaves land on his
    // lawn, then he comes out through his front door, walks to the fence,
    // blows them back over it, stands with his arms folded watching us for
    // a moment, and goes back in. Each visit comes sooner and lasts longer,
    // and from the third he brings a bigger blower. Lists are by visit, the
    // last entry holding for every visit after.
    //
    // A visitor aiming at the fence from 4 m sends about 1,500 leaves over
    // in five seconds (measured), so these are small numbers on purpose.
    neighbor: {
        door: { x: 15.1, z: -6 },
        doorSeconds: 0.7,
        walkSpeed: 1.4,
        // He blows facing our yard along two lines (see neighbor.js): first
        // `behind` meters beyond the farthest of our leaves on his lawn
        // (between lineMin and lineMax), then `nearLine`, close enough to
        // the fence that his air lands just short of it and lifts the leaves
        // over. `line` stands in for the farthest leaf when there is none.
        line: 13.6,
        nearLine: 12.6,
        behind: 1.2,
        lineMin: 12.2,
        lineMax: 17.9,
        // Brisk: a visit lasts until his lawn is clear, so he does not dawdle.
        sweepSpeed: 1.6,
        zMin: -4.8,
        zMax: 6.4,
        visitAt: [60, 40, 25],
        // A visit lasts until no more than `clearLeft` of our leaves are on
        // his lawn (he replans his sweep from where they are each time
        // round), or until a whole pass cleared less than `progress` of
        // them. `visitMax` seconds of blowing is only a backstop.
        clearLeft: 12,
        progress: 0.1,
        visitMax: 90,
        watchSeconds: [3, 4, 5],
        cooldown: [8, 6, 4],
        bigFrom: 2,
        // His blowers, as changes to ours (config.blower).
        blower: { speed: 26 },
        // The big one's air carries farther and lifts longer: four seconds of
        // it sent back 63% of a lawn of 3,500 leaves, where a merely faster
        // blower (speed 38, range 9) sent back 9%.
        bigBlower: { speed: 45, spread: 0.36, wallSpread: 0.7, range: 12, wallDecay: 4, updraftLength: 5 },
        look: { shirt: 0x3f5f7a, pants: 0xb5a58a, skin: 0xc68a5e, hair: 0x9a9a9a, blower: 0x3d7a3a, bigBlower: 0xc0392b, door: 0x24476b }
    },

    // THE FINALE (M3): the dive into the tarp's pile once the round is
    // counted. See finale.js. Seconds and meters. KEPT TO ABOUT SEVEN
    // SECONDS, since it stands between the clock and the end card. A tap or
    // a key skips it.
    finale: {
        // Where the dive goes (finale.js diveTarget): the tarp's middle,
        // drawn `toPile` of the way toward the pile's peak, never nearer its
        // sides than `inset` (meters: back is the house, left the hedge and
        // the rake). Steve's QA, 2026-10-08: "keep the dive centered in the
        // middle of the tarp".
        target: { toPile: 0.35, inset: { left: 1.3, right: 0.7, back: 1.65, front: 0.8 } },
        // The pile's peak must be this tall to land in it. Below it, the
        // dive finds the lawn. A minute of steady work toward the corner
        // built about 0.6 m in the bot runs.
        diveHeight: 0.35,
        // Setting the blower down, then the walk to the run-up spot (at
        // `walkSpeed`, but never shorter than `minWalk` or longer than
        // `maxWalk`, so someone far away jogs over).
        pause: 0.3,
        walkSpeed: 3,
        minWalk: 0.6,
        maxWalk: 2,
        // The run-up: from `runUp` meters out, the leap at `takeoff` meters,
        // landing with the hips `landOut` short of the peak.
        runUp: 3.4,
        takeoff: 1.1,
        landOut: 0.5,
        // How far the body reaches past the hips, lying: the hands overhead
        // ahead (measured 0.92 m, plus a hand), and the feet behind.
        reachFront: 1.05,
        reachBack: 1.0,
        runTime: 0.9,
        airTime: 0.75,
        // How high the leap rises above a straight line, plus half the pile.
        arc: 0.7,
        // How far into a good pile the body sinks.
        sink: 0.3,
        // After landing they lie still a moment, then roll part way over to
        // look at the camera (`roll` radians), and stay there: Steve's M3 QA
        // ("we don't need the character to stand back up"). 2.2 turns the
        // face toward the camera from every run-up measured (0.9 to 1.0 of
        // the way, 0.41 for a run straight away from it, where the camera is
        // behind the feet and onto the back is the best a body can do).
        lieTime: 0.6,
        flopLie: 0.9,
        rollTime: 0.9,
        hold: 0.6,
        roll: 2.2,
        // The burst where they land: leaves within `burstRadius` go up at up
        // to `burstSpeed` m/s, and a flop throws `flopBurst` as much.
        // Measured with 600 leaves in a 0.36 m pile: they go up to about 2 m
        // and rain down for about 2.3 seconds.
        burstRadius: 1.8,
        burstSpeed: 9,
        flopBurst: 0.3,
        // Reduced motion keeps the camera where it is and throws this much.
        reducedBurst: 0.4,
        // The camera comes in to this many meters across around the pile.
        span: 9
    },

    // THE FINDS (M6): things lost under the leaves (finds.js). Each round
    // hides every one at a fresh spot in its `areas` where the leaves cover
    // it, and it is found once enough of it shows. Nothing points at them:
    // a visitor finds one by clearing the lawn over it. Sizes are meters,
    // a little larger than life so each reads at a few pixels on a phone.
    finds: {
        // Found once this share of its footprint can be seen, and only ever
        // hidden where no more than `hidden` of it shows.
        seen: 0.6,
        hidden: 0.1,
        // A resting leaf hides the ground within this share of its size of
        // its middle: its outline fills 0.55 of its square, about a disc
        // of 0.42.
        leafReach: 0.42,
        // Kept this far from each other and from anything solid.
        apart: 1.2,
        clear: 0.35,
        // Never where the first blow from where the person starts (facing
        // the house) clears the lawn: its air wakes leaves out to about
        // 1.8 m either side for some 6 m. A find there would turn up in the
        // opening second, before anybody went looking.
        avoid: [{ minX: -0.2, maxX: 4.2, minZ: -2.5, maxZ: 7 }],
        // Uncovered, it rises out of the lawn over this many seconds, and
        // its name shows under the HUD for `toastSeconds`.
        rise: 0.3,
        toastSeconds: 3.5,
        // `r` is the footprint's radius, `name` how the end card lists it,
        // and `areas` where it may be hidden. `halloween` ones are only out
        // during Halloween week.
        list: [
            {
                id: 'keys', r: 0.12, name: 'a set of car keys',
                toast: 'You found a set of car keys. Somebody will be relieved.',
                areas: [{ minX: -2.6, maxX: 2.2, minZ: -3.2, maxZ: 2.5 }]
            },
            {
                id: 'gnome', r: 0.25, name: 'a garden gnome',
                toast: 'You found a garden gnome, napping under the leaves.',
                areas: [{ minX: 2.2, maxX: 8.6, minZ: -5.6, maxZ: -4.4 }, { minX: -9.6, maxX: -8.6, minZ: 0, maxZ: 6 }]
            },
            {
                id: 'ball', r: 0.07, name: "a dog's tennis ball",
                toast: "You found a dog's tennis ball. Good find.",
                areas: [{ minX: -4, maxX: 8, minZ: -1, maxZ: 5 }]
            },
            {
                id: 'bill', r: 0.13, name: 'a $20 bill',
                toast: 'You found a $20 bill! Finders keepers.',
                areas: [{ minX: -9, maxX: 9.4, minZ: -1, maxZ: 6.5 }]
            },
            {
                id: 'hand', r: 0.14, name: 'a plastic skeleton hand', halloween: true,
                toast: 'You found a plastic skeleton hand. Somebody started Halloween early.',
                areas: [{ minX: -9.6, maxX: -6, minZ: 0, maxZ: 6.2 }, { minX: 2, maxX: 8.6, minZ: -5.6, maxZ: -4.6 }]
            }
        ]
    },

    // HALLOWEEN (M6, halloween.js and decorations.js): the decorations and
    // the trick-or-treaters from October 1st through November 1st, and in
    // Halloween week (October 24 to 31, by the visitor's own calendar) the
    // porch pumpkins carved and lit and a plastic skeleton hand under the
    // leaves. Kind spooky, never scary. `?halloween=1` on a QA host.
    halloween: {
        // October (months count from 0), the 24th to the 31st. The
        // decorations are up all month and through November 1st
        // (decorations.js).
        month: 9,
        firstDay: 24,
        lastDay: 31,
        decorUntil: { month: 10, day: 1 },
        decor: {
            black: 0x1c1d1f,
            beak: 0x3a3b3d,
            // Our porch's lights, warm orange, and the neighbor's, orange
            // and purple.
            bulb: 0xffa53d,
            purple: 0x9b5fd0,
            sag: 0.13,
            bulbEvery: 0.3,
            // Paper bats up our wall, a cobweb this wide in the porch's
            // corner.
            bats: 15,
            web: 0.7,
            webColor: 0xeeece6,
            // Crows on our ridge, each turned its own way (0 faces the
            // street).
            crows: [{ x: 2.4, turn: 0.35 }, { x: 3.15, turn: -0.5 }, { x: -6.2, turn: 0.15 }],
            // The neighbor's ghost, hung from his eave by his windows.
            sheet: 0xf4f3ee,
            ghost: { x: 14.32, tall: 0.62, string: 0.25 },
            // His inflatable jack-o-lantern and his foam graveyard, past where
            // he blows (neighbor.lineMax), each standing on a box the sim
            // knows (decorations.js theirDecorBoxes), so no leaf blows
            // through them.
            orange: 0xe9781f,
            stem: 0x4f6b2a,
            ink: 0x1d140a,
            inflatable: { x: 20.2, z: -3.4, r: 1.05, turn: -0.45 },
            foam: 0x9d9c96,
            // More (Steve's M6 QA): silhouettes in two of our windows (by
            // their index in house.js OUR_WINDOWS), lamp lit behind.
            windows: [{ index: 0, kind: 'witch' }, { index: 1, kind: 'cat' }],
            lamp: 0xffc46b,
            lampEdge: 0xd9792a,
            moon: 0xfff1c7,
            // A skeleton on a hay bale in his graveyard, a giant spider on
            // his roof (`along` its front slope, eave to ridge), and a witch
            // who flew into the maple over the hedge, `out` from its middle.
            bone: 0xeee8d8,
            straw: 0xd2b46a,
            twine: 0x8a6a3a,
            eyes: 0xd9531e,
            stocking: 0x6a3a9a,
            skeleton: { x: 21.9, z: 5.6, turn: -0.45 },
            roofSpider: { x: 13.9, along: 0.42, turn: 0.35 },
            // Where along our hedge the witch dove into it.
            witch: { z: 2.6 },
            // Third round (Steve's M6 QA, "could we please add more"): a giant
            // inflatable ghost beside his pumpkin, lights spiraling up our
            // porch posts, a scarecrow at the sage house and little ghosts
            // along the gray house's eave. (A flock of bats circling over his
            // roof was taken out at Steve's QA, 2026-10-09: too early in the
            // day for bats.)
            ghostInflatable: { x: 23.5, z: -0.6, tall: 2.3, turn: -0.35 },
            postLights: { turns: 6, bulbs: 26, r: 0.075 },
            scarecrow: { x: -21.2, z: -4.6, turn: 0.5, shirt: 0x8c3b2a, pants: 0x3f5670, burlap: 0xc9a76a, hat: 0xd8bb6f },
            streetGhosts: [-3.6, -1.4, 0.8],
            // OUR YARD (Steve's M6 QA: "add more Halloween decorations to the
            // main user's yard - instead of focusing on the surrounding
            // yards"). These stand on our lawn, so each is a box the sim
            // knows (decorations.js yardDecorBoxes): the leaves bank against
            // them, the person walks round them, and so does the dive. Black
            // lanterns lining the walk, a stack of pumpkins either side of
            // the porch step, witch hats floating under our maple with a
            // candle under each, and the mailbox wrapped as a mummy. (A
            // cauldron of candy by the sidewalk was built and taken out at
            // Steve's QA, 2026-10-07.)
            lanterns: { xs: [-1.35, 0.35], zs: [0.6, 2.9, 5.2], size: 0.2, height: 0.55, glow: 0xffb04a },
            towers: [{ x: -1.95, z: -3.35 }, { x: 0.95, z: -3.35 }],
            towerPumpkins: [{ r: 0.28, color: 0xefe8d8 }, { r: 0.2, color: 0xe0701f }, { r: 0.13, color: 0x26262a }],
            hats: [{ x: 5.4, y: 3.25, z: -2.5 }, { x: 7.7, y: 3.55, z: -2.9 }, { x: 6.5, y: 2.95, z: -4.5 }],
            hatString: 1.3,
            mummy: 0xece6d6,
            // A masked figure standing still in the neighbor's left window
            // (Steve's M6 QA: "something that looks like Jason or Michael
            // Meyers"). Kept generic on purpose: a blank pale mask and dark
            // coveralls, the genre, not either film's character (both are
            // trademarked). He is there for `seen` seconds, then the room is
            // empty for `gone`, then he is back.
            watcher: { window: 0, seen: 16, gone: 6, room: 0x161b21, roomLight: 0x2a3440, coveralls: 0x2b3038, mask: 0xe9e4d8, hair: 0x2a2420 },
            // A clown in our far right window (Steve's M6 QA: "a monster or
            // something... a witch, scary clown, or another skull"): a dim
            // lamp lit room, and a clown who slides in from the window's
            // edge, peeks for `stay` seconds and slides away again, gone for
            // `hidden`. Generic, not any film's clown.
            // Darker since Steve's QA ("too bright and takes away from the
            // Halloween aesthetic"): a dim room, a dingy face, dark reds, a
            // sinister grin, and the whole of him in shadow (`shade`).
            clown: {
                window: 3, hidden: 7, slide: 1.1, stay: 5, shade: 0.45,
                room: 0x0b0908, roomLight: 0x2b1b12, face: 0xb9b19e, nose: 0x7a1410, hair: 0x6e2612,
                suit: 0x231a2c, dots: 0x5a4e30, hat: 0x1d3a30, socket: 0x0a0808, pupil: 0xd8d2b8
            },
            // Skeletons (Steve's M6 QA: "Maybe a skeleton or two (or three)?"):
            // one breaking out of the lawn by the front left corner, one still
            // raking leaves on the right (the rake ahead of it, toward the
            // street), and one peeking over our hedge from the side yard.
            // The first two stand on boxes the sim knows (`box`, around their
            // middles), the third behind the hedge.
            skeletons: {
                riser: { x: -7.8, z: 5.6, turn: 0.5, box: { x: 0.35, z: 0.35, height: 0.9 } },
                raker: { x: 7.9, z: 4.9, box: { x: 0.3, minZ: -0.22, maxZ: 0.88, height: 1.72 } },
                peeker: { z: 5.2 }
            },
            soil: 0x4a3626,
            // Pumpkins by each door down the street.
            streetPumpkins: [
                { dx: -1.0, dz: 0.5, r: 0.22, color: 0xe0701f },
                { dx: 1.0, dz: 0.45, r: 0.18, color: 0xd9832a },
                { dx: 1.3, dz: 0.78, r: 0.13, color: 0xefe3c4 }
            ],
            // OUR GRAVES (Steve's QA, 2026-10-08: "in front of the windows on
            // the right... a couple of tombstones and grave plots"): three
            // slate stones before the window right of the porch (the one
            // without the clown), each with its mound of earth toward the
            // street. A good step out from the house, with gaps between, so
            // the person can walk behind them and blow out the drift there.
            // Each stone is a wall the leaves meet, each mound a low
            // platform they can lie on (decorations.js yardDecorBoxes).
            ourGraves: {
                stone: 0x77766f,
                // Each plot a long low mound of earth (Steve: "extend the
                // grave plots. Right now they're just circles").
                mound: { w: 0.56, d: 1.7, height: 0.12 },
                list: [
                    { kind: 'round', x: 2.45, z: -4.25, tilt: 0.05, turn: 0.08 },
                    { kind: 'cross', x: 3.25, z: -4.3, tilt: -0.07, turn: -0.05 },
                    { kind: 'square', x: 4.05, z: -4.22, tilt: 0.03, turn: 0.12 }
                ]
            },
            graves: [
                { kind: 'round', x: 18.9, z: 3.1, tilt: 0.07, turn: -0.2 },
                { kind: 'cross', x: 20.1, z: 4.2, tilt: -0.1, turn: 0.1 },
                { kind: 'square', x: 21.4, z: 3.3, tilt: 0.04, turn: -0.35, lean: -0.08 },
                { kind: 'round', x: 19.5, z: 5.5, tilt: -0.06, turn: 0.15 }
            ]
        },
        // The pumpkins (by their index in yard.pumpkins) that are carved.
        carved: [0, 1, 3],
        glow: 0xffb53a,
        // Trick-or-treaters: a pair every so often, along the sidewalk,
        // pausing at the end of our walk to look at the house, whenever the
        // decorations are up (Steve's M6 QA).
        first: [3, 6],
        every: [8, 14],
        // THE GROUPS (Steve's M6 QA: "maybe a few more trick-or-treaters?"):
        // a little ghost and a little witch, and a little pumpkin and a
        // little vampire with a parent behind them. EACH WALKS ITS OWN HALF
        // OF THE SIDEWALK (`z`, the middle of its lane; the sidewalk runs
        // 7.4 to 9), so both can be out at once and pass side by side. They
        // used to take turns, and the second came too late (Steve's QA).
        // `lanes` is each one's place across the lane, `drift` how far a
        // gust can push the group within it, `first` when it first comes.
        groups: [
            { kinds: ['ghost', 'witch'], z: 7.82, lanes: [-0.12, 0.16], drift: { min: -0.14, max: 0.05 }, first: [3, 6] },
            { kinds: ['pumpkin', 'vampire', 'parent'], z: 8.55, lanes: [-0.1, 0.18, 0.04], drift: { min: -0.05, max: 0.06 }, first: [8, 12] }
        ],
        // How far apart they walk, one behind the other.
        spacing: 0.85,
        speed: 1.15,
        // They come and go just past the edge of the view (at the sidewalk,
        // close to the camera, it is only about 14 m across).
        fromX: -17,
        toX: 18,
        z: 8.25,
        pause: 1.6,
        // They wait for a person standing in their way.
        room: 0.8,
        scale: 0.62,
        // BLOWN AT (Steve's M6 QA: "It would be cool if they reacted to
        // being blown by the leaf blower"): air faster than `blownAir` m/s
        // at `blowHeight` (a child's middle) staggers them along with it for
        // `blownTime` seconds, at up to `push` m/s, their backs to it, and
        // then they hurry off the way it sent them, `hurry` times as fast.
        blowHeight: 0.5,
        blownAir: 1.6,
        blownFull: 5,
        blownTime: 0.9,
        push: 1.4,
        // Running off: a run, not a brisk walk.
        hurry: 2.4,
        // Once blown, the air has to drop below this share of `blownAir`
        // before they recover (so the edge of a blower's reach does not flick
        // them in and out of it), and they turn at most this fast.
        keepAir: 0.6,
        turnRate: 5,
        // How far off the middle of its lane a gust can push a group with no
        // lane of its own.
        drift: { min: -0.3, max: 0.3 },
        // KICKING THE LEAVES (Steve's M6 QA: "If there are leaves on the
        // sidewalk when a trick-or-treater walks by, could we have the
        // trick-or-treater kick the leaves back into the yard?"): every
        // `every` meters each one walks, a foot comes down `ahead` of them,
        // and if leaves lie within `radius` of it, a short flick of air
        // (`air`, as changes to our blower, for `time` seconds) sends them
        // toward the lawn, a little forward.
        kick: {
            every: 0.7, ahead: 0.18, radius: 0.35, time: 0.35, forward: 0.35,
            air: {
                reach: 0, height: 0.14, side: 0, pitch: 0.35, speed: 9, core: 0.3, width: 0.1, spread: 0.35,
                wallDecay: 0.8, wallSpread: 0.6, wallDepth: 0.3, wallThicken: 0.4, updraft: 1.1, updraftLength: 0.6,
                range: 2.2, turbulence: 0.4
            }
        }
    },

    // THE TOUCH JOYSTICK (stick.js, Steve's QA, 2026-10-08): the thumb
    // travels `radius` pixels to the rim. Inside `dead` of it nothing,
    // inside `turn` a turn in place to aim, and past that a walk from
    // `crawl` of full pace to full pace at the rim.
    touch: { stick: { radius: 45, dead: 0.12, turn: 0.38, crawl: 0.25 } },

    // THE SOUND (M6, sound.js): a whoosh while the blower runs, made with
    // Web Audio from noise. ON BY DEFAULT on a computer since Steve's M6 QA
    // (2026-10-07, "Let's have the sound on by default"; it was off at
    // first), starting with the visitor's first click or key, as browsers
    // require, and OFF TO START on a phone or a tablet since his QA of
    // 2026-10-08 (main.js). The button or M turns it on and off. Nothing is
    // remembered.
    sound: {
        startOn: true,
        // HOW LOUD, all told (Steve's QA, 2026-10-08: fine at a quarter of
        // the system's volume, "anything over 50% and it gets LOUD", on a
        // phone and a computer alike). 8 dB under the 0.22 and 0.11 it had:
        // the blower measures about -30.5 LUFS on a computer (it was
        // -22.5, music is mastered near -14), and a phone, whose small
        // speaker is loudest where the whoosh is, plays 6 dB under that.
        // tests/leaves-sound holds it under a loudness ceiling. And the
        // limiter on the way out: above `threshold` dB, `ratio` to one,
        // over a `knee` dB bend.
        master: 0.088,
        masterMobile: 0.044,
        limiter: { threshold: -12, knee: 6, ratio: 8, attack: 0.003, release: 0.25 },
        // The air: noise through a lowpass that spools up from `idleHz` to
        // `fullHz` when the blower starts, and a band for its body.
        idleHz: 450,
        fullHz: 1700,
        bodyHz: 650,
        bodyQ: 0.8,
        airQ: 0.6,
        bodyGain: 0.6,
        // How fast it spools up and down (time constants, seconds).
        attack: 0.07,
        release: 0.18,
        // HELD, IT SETTLES (Steve's QA, 2026-10-08): each blow starts at full
        // strength, and after `after` seconds of steady blowing eases back to
        // `level` (-4 dB) over `tau`, so a long blow is not a wall of noise.
        settle: { after: 1.2, level: 0.63, tau: 0.9 },
        spool: 0.12,
        // A slow wander in the air's pitch, so it breathes.
        wobble: { hz: 0.7, depth: 0.08 },
        // The neighbor's blower, a little quieter, from where he stands, but
        // only so far to one side: hard right on a laptop is one small
        // speaker, and at 0.45 he went unheard (Steve's M6 QA, "I didn't hear
        // the blowing sound while the neighbor was outside blowing").
        neighbor: 0.8,
        big: 1.25,
        pan: 0.45,
        // Scheduled this far ahead of the audio clock.
        ahead: 0.03,
        // The dive's landing (M6 QA): a falling thump from hz[0] to hz[1], a
        // body band in the low mids (a phone plays little below 500 Hz), and
        // the leaves' crackle, gone in `decay` seconds.
        thud: { level: 0.9, hz: [120, 45], decay: 0.32, bodyHz: 520, bodyQ: 0.9, leafHz: 2400 },
        // Every last leaf off the lawn: G5, B5, D6 and G6 struck `gap`
        // seconds apart, each ringing out over `decay`.
        chime: { level: 0.55, notes: [784, 988, 1175, 1568], gap: 0.12, decay: 1.2 },
        // A clear lawn's fanfare: C, E, G and C rising `gap` apart, a C major
        // chord `hold` after them, and for one inside the time a shimmer of
        // high notes over it.
        fanfare: {
            level: 0.5, gap: 0.11, hold: 0.08, decay: 1.4,
            rise: [523, 659, 784, 1047], chord: [1047, 1319, 1568], shimmer: [2093, 2637, 3136, 2637, 3136, 4186]
        }
    },

    // THE PILE ON THE RESULTS CARD (trophy.js, Steve's QA, 2026-10-08: "a
    // rotating 3D view of a pile of leaves, and the pile's size is dynamic
    // based on how the user did"). The heap's radius is `radius` times the
    // cleared share to the `grow` (never under `least`), so small results
    // look small, its sides at `slope` degrees, `max` leaves at full size
    // (`min` at the least), `leafScale` times the yard's leaf. They rain
    // down `drop` meters, each taking `fall` seconds, over `rain` seconds,
    // and it turns `spin` radians a second. `view` frames the biggest heap.
    trophy: {
        // Bigger leaves and fewer (Steve's QA, 2026-10-08: "blurry, and
        // almost like a large pile of poop"), so each reads at card size, on
        // a heap `lumps` uneven, `spill` of them blown onto the lawn.
        radius: 0.85, slope: 33, grow: 0.7, least: 0.03, max: 800, min: 12, leafScale: 1.9, lumps: 0.16, spill: 0.12, seed: 7121,
        rain: 1.3, fall: 0.5, drop: 1.4, spin: 0.35, fov: 30,
        // A clear lawn inside the time: `count` golden glints drifting down
        // `fall` m/s from `height`.
        glints: { count: 46, height: 1.7, fall: 0.22, size: 0.05, color: 0xffd76a },
        view: { above: 0.3, back: 1.05, up: 0.42 }
    },

    // THE CELEBRATION (Steve's QA, 2026-10-08: "Should we add a celebration
    // if a user clears 100% of the yard? ... we should show it even if there
    // is no time limit"). In a round the dive is the celebration. In free
    // play (celebrate.js), for `seconds`: the blower set down, both arms up
    // and `hops` hops `hop` meters high, facing the street, the view easing
    // in to `span` meters across on them and the clean lawn, a chime and a
    // line on screen. Never the neighbor.
    // BIGGER since Steve's next QA ("Could we increase the
    // celebration/animation"): `hops` hops, a whole spin from `spin.from`
    // over `spin.time`, the view swinging `orbit` radians round and back,
    // `confetti` (confetti.js: leaves thrown up at `speed` m/s, `up` radians
    // above level, slowed by `drag`, swinging `swing` m/s, gone over their
    // last `fadeAbove` meters, `size` times a yard leaf), and the banner up
    // for `banner` seconds. `timed`: a clear lawn inside the time, `beat`
    // seconds of it before the dive (`reducedBeat` under reduced motion),
    // `confetti` leaves, `gold` of them gold.
    cheer: {
        seconds: 4.4, span: 14, hops: 3, hopTime: 0.4, hop: 0.22, spin: { from: 1.3, time: 0.9 }, orbit: 0.55, banner: 3.4,
        confetti: {
            count: 300, max: 560, speed: [8, 14], up: [0.7, 1.35], gravity: 9.8, drag: 6, swing: 0.5, fadeAbove: 0.6,
            size: 1.5, seed: 9091, goldColor: [1.0, 0.6, 0.1]
        },
        timed: { beat: 2.6, reducedBeat: 1.2, confetti: 520, gold: 0.35 }
    },

    // THE ROUND (M1). The clock starts with the first blow, not when the
    // welcome card closes, so nobody loses time reading. When it runs out the
    // blower stops, the result is counted, and the dive begins (round.js).
    // The clock turns the accent color for the last `hurry` seconds, and the
    // cleared share on the HUD is counted `tallyHz` times a second (counting
    // walks every leaf).
    // Five minutes since Steve's QA (2026-10-08): a minute was "way too
    // hard", three still a stretch, and "The goal is for the user to
    // finish, not for it to be super challenging. If they want to speed run
    // they can always try to beat their best score" (best.js). A clear lawn
    // ends the round early (round.js).
    round: {
        seconds: 300,
        hurry: 10,
        tallyHz: 4,
        // The finale (M3) runs between the clock and the end card, and never
        // holds the card up longer than this.
        finale: true,
        finaleMax: 14
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
        // However wide the screen, the bottom of the frame reaches this far
        // toward the street (the sidewalk, the curb and the parked car, as
        // a 4:3 screen shows them). Steve's QA, 2026-10-08: a wide screen
        // had lost the street and most of the sidewalk.
        frontZ: 10.6,
        // The visitor's zoom: the wheel or a trackpad pinch, + and - (0 to
        // reset), or a pinch on a phone. 1 is the usual view and `max` the
        // closest, but never narrower than `minSpan` meters across, which
        // keeps `reach` on screen either side of the person, nor nearer than
        // `minDistance`, which keeps all of them on a very wide screen. A
        // wheel notch or a key press is one `step`.
        zoom: { min: 0.8, max: 3, minSpan: 8.5, minDistance: 8, step: 1.25, wheel: 0.0015, pinchWheel: 0.01 },
        follow: 2.5,
        // The ground this far either side of the person, at their depth,
        // stays on screen: the blower's standoff (2.4) and a meter more, so
        // a pointer can always aim past the hedge or the fence and walk
        // them all the way to it (Steve's M6 QA).
        reach: 3.4,
        // With the neighbor out, the view widens (up to `maxSpan` meters) to
        // keep him and the visitor in frame, with this much ground to spare
        // beyond each.
        includeMargin: 2.2,
        maxSpan: 30
    },

    look: {
        background: 0xbcd3e6,
        fog: { color: 0xc9d6df, near: 30, far: 90 },
        lawn: 0x5d7f3a,
        lawnDark: 0x46652b,
        // His lawn deeper and healthier than ours (Steve's QA, 2026-10-08),
        // mowed in stripes a meter wide (how strongly), and the rest of the
        // block's lawns as his once were.
        neighborLawn: 0x4a7a2e,
        neighborLawnDark: 0x386224,
        stripes: 0.07,
        blockLawn: 0x6a8f3f,
        sidewalk: 0xb9b4aa,
        sidewalkJoint: 0x8f8a80,
        street: 0x45474a,
        tarp: 0x2f6aa6,
        // The sky (M5): deeper blue overhead, paling to a warm haze at the
        // horizon, drawn behind everything.
        sky: { top: 0x6f9fd3, horizon: 0xe4e2d8 },
        // Clouds in it (M6 QA), on a sky picture 512 by 256: how many, how
        // high (pixels from the top; the haze starts about 115), how big,
        // how white, and how fast they drift (the picture's widths a
        // second).
        clouds: { count: 9, top: 22, bottom: 92, size: [16, 30], alpha: 0.85, seed: 7, drift: 0.003 },
        // Our house (house.js): white board and batten, black frames, stone.
        siding: 0xf2efe8,
        trim: 0xffffff,
        frame: 0x1c1d1f,
        glass: 0x3a4a56,
        stone: 0x8f8a82,
        roofModern: 0x2e3033,
        porch: 0xc9c4ba,
        aluminum: 0xc4c7cb,
        wreath: 0x9a4a22,
        walk: 0xc2bdb3,
        // Our mailbox's cedar post and its red flag (M6 QA).
        cedar: 0x8a6748,
        flag: 0xb3261e,
        // The beds along the house fronts (M6 QA).
        gravel: 0x5d5e5f,
        mulch: 0x5a4030,
        // The neighbor's: butter yellow lap siding, white trim, navy shutters
        // to go with his navy door, a brick chimney.
        neighborSiding: 0xe3d3a1,
        neighborLap: 0xc4b483,
        neighborRoof: 0x6e6458,
        shutter: 0x24476b,
        brick: 0x8c4a3a,
        // The street (M5).
        curb: 0xcfcac0,
        centerLine: 0xe2b83a,
        car: 0x9aa1a8,
        carGlass: 0x26303a,
        tire: 0x1d1e20,
        fence: 0xf4f1ea,
        hedge: 0x2f4a26,
        // The hedge in its hollows and at its foot, and its sunlit top.
        hedgeShade: 0x1b2c16,
        hedgeSun: 0x617f36,
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
