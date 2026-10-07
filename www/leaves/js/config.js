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
        // The rest of the block (M6 QA): lawn under everything, well past
        // both neighbors and back behind the houses, so no view the camera
        // can take shows the sky through the ground.
        block: { minX: -50, maxX: 70, minZ: -20 },
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
            // A tall hedge down the left side.
            { axis: 'x', at: -10, from: -6, to: 12, height: 1.8 }
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
        // crown over the sim's ground can drop any, so the tree past the
        // neighbor's yard holds none).
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
            // A blue spruce in the side yard behind our hedge (backyard.js).
            { species: 'blue-spruce', x: -18.6, z: -1.6, height: 7, seed: 8801, trunk: 0.2, crown: { y: 3.6, radius: 1.8 }, hanging: 0 }
        ],
        // BEHIND OUR HEDGE (Steve's M6 QA: "more environment details to the
        // back left of the scene behind the row of hedges"): the sage house's
        // side yard, between the hedge and its garage, all of it past the
        // sim's ground. A garden shed, a privacy fence along the back, raised
        // beds and a pumpkin patch, a fire pit with two Adirondack chairs, a
        // birdbath, a wheelbarrow of leaves, stepping stones (backyard.js).
        // Packed into the 4 m or so behind the hedge that a wide screen shows
        // when the visitor walks over to it (tests/leaves-backyard).
        backyard: {
            shed: { x: -13.7, z: -10.6, w: 2.6, d: 2.0, wall: 2.1, ridge: 2.8, siding: 0x6f8a7a, roof: 0x3c3f44, door: 0x3f4f46 },
            fence: { z: -13.6, from: -19.4, to: -9.25, height: 1.8, color: 0x9a7b5c },
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
        // holds (the sugar maple's 70 last about 78 seconds, longer than a
        // round) and then is done, so a lawn can be finished.
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

    // HALLOWEEN WEEK (M6, halloween.js): from October 24 to 31 by the
    // visitor's own calendar, the porch pumpkins are carved and lit, a
    // plastic skeleton hand is under the leaves, and trick-or-treaters walk
    // the sidewalk. Kind spooky, never scary. `?halloween=1` on a QA host.
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
            ghost: { x: 12.35, tall: 0.62, string: 0.25 },
            // His inflatable jack-o-lantern and his foam graveyard, both past
            // the sim's ground (x beyond yard.bounds.maxX), so no leaf ever
            // blows through them.
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
            // Third round (Steve's M6 QA, "could we please add more"): a flock
            // of bats circling over the neighbor's roof, a giant inflatable
            // ghost beside his pumpkin, lights spiraling up our porch posts, a
            // scarecrow at the sage house and little ghosts along the gray
            // house's eave.
            flock: { x: 15.4, y: 7.7, z: -9.4, r: 1.5, bats: 6, speed: 0.8 },
            ghostInflatable: { x: 23.5, z: -0.6, tall: 2.3, turn: -0.35 },
            postLights: { turns: 6, bulbs: 26, r: 0.075 },
            scarecrow: { x: -21.2, z: -4.6, turn: 0.5, shirt: 0x8c3b2a, pants: 0x3f5670, burlap: 0xc9a76a, hat: 0xd8bb6f },
            streetGhosts: [-3.6, -1.4, 0.8],
            // OUR YARD (Steve's M6 QA: "add more Halloween decorations to the
            // main user's yard - instead of focusing on the surrounding
            // yards"). These stand on our lawn, so each is a box the sim
            // knows (decorations.js yardDecorBoxes): the leaves bank against
            // them, the person walks round them, and so does the dive. A
            // cauldron of candy where our walk meets the sidewalk (the
            // trick-or-treaters stop at it and reach in), black lanterns
            // lining the walk, a stack of pumpkins either side of the porch
            // step, witch hats floating under our maple with a candle under
            // each, and the mailbox wrapped as a mummy.
            cauldron: { x: -1.65, z: 7.6, r: 0.24, height: 0.62, candy: [0xe0701f, 0x7a2fbf, 0xf4f1ea, 0x3d7a3a] },
            lanterns: { xs: [-1.35, 0.35], zs: [0.6, 2.9, 5.2], size: 0.2, height: 0.55, glow: 0xffb04a },
            towers: [{ x: -1.95, z: -3.35 }, { x: 0.95, z: -3.35 }],
            towerPumpkins: [{ r: 0.28, color: 0xefe8d8 }, { r: 0.2, color: 0xe0701f }, { r: 0.13, color: 0x26262a }],
            hats: [{ x: 5.4, y: 3.25, z: -2.5 }, { x: 7.7, y: 3.55, z: -2.9 }, { x: 6.5, y: 2.95, z: -4.5 }],
            hatString: 1.3,
            mummy: 0xece6d6,
            // Pumpkins by each door down the street.
            streetPumpkins: [
                { dx: -1.0, dz: 0.5, r: 0.22, color: 0xe0701f },
                { dx: 1.0, dz: 0.45, r: 0.18, color: 0xd9832a },
                { dx: 1.3, dz: 0.78, r: 0.13, color: 0xefe3c4 }
            ],
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
        // pausing at the end of our walk to look at the house.
        first: [3, 6],
        every: [14, 24],
        speed: 1.15,
        fromX: -24,
        toX: 26,
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
        blownTime: 1.1,
        push: 1.4,
        hurry: 2,
        // Once blown, the air has to drop below this share of `blownAir`
        // before they recover (so the edge of a blower's reach does not flick
        // them in and out of it), and they turn at most this fast.
        keepAir: 0.6,
        turnRate: 5,
        // How far off the middle of the sidewalk a gust can push them.
        drift: { min: -0.55, max: 0.3 }
    },

    // THE SOUND (M6, sound.js): a whoosh while the blower runs, made with
    // Web Audio from noise. ON BY DEFAULT since Steve's M6 QA (2026-10-07,
    // "Let's have the sound on by default"; it was off at first), starting
    // with the visitor's first click, tap or key, as browsers require. The
    // button or M turns it off. Nothing is remembered.
    sound: {
        startOn: true,
        master: 0.22,
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
        spool: 0.12,
        // A slow wander in the air's pitch, so it breathes.
        wobble: { hz: 0.7, depth: 0.08 },
        // The neighbor's blower, quieter, from where he stands.
        neighbor: 0.45,
        big: 1.3,
        // Scheduled this far ahead of the audio clock.
        ahead: 0.03
    },

    // THE ROUND (M1). The clock starts with the first blow, not when the
    // welcome card closes, so nobody loses time reading. When it runs out the
    // blower stops, the result is counted, and the dive begins (round.js).
    // The clock turns the accent color for the last `hurry` seconds, and the
    // cleared share on the HUD is counted `tallyHz` times a second (counting
    // walks every leaf).
    round: {
        seconds: 60,
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
        neighborLawn: 0x6a8f3f,
        sidewalk: 0xb9b4aa,
        sidewalkJoint: 0x8f8a80,
        street: 0x45474a,
        tarp: 0x2f6aa6,
        // The sky (M5): deeper blue overhead, paling to a warm haze at the
        // horizon, drawn behind everything.
        sky: { top: 0x6f9fd3, horizon: 0xe4e2d8 },
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
