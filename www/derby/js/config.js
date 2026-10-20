// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - every number in Derby Day (www/derby).
 *
 * M0, THE PHYSICS BENCH (2026-10-19). Derby Day starts as a question rather
 * than a scene: does a car's build decide its race in honest proportion,
 * with the nine neighbors' cars finishing in the order their builds deserve?
 * So this first build is only the kit, the rules, the track, the physics and
 * the field, run under Node by scripts/derby-field.mjs. The hall comes in M1.
 *
 * UNITS. Everything here is SI (meters, kilograms, seconds) except where a
 * key says otherwise. The derby's own numbers are written in inches and
 * ounces, because that is how a rule sheet or a kit says them, and multiplied
 * by IN and OZ on the spot so the original figure stays readable.
 *
 * EVERY FIGURE MARKED "verify" is from memory of real kits and tracks, to
 * check against a real kit and published derby tests before release (PRD,
 * The kit). None of them changes the shape of the model, only its tuning.
 *
 * NOTHING HERE IS COMPUTED WITH Math.sin, cos, pow or exp. The race must run
 * the same on every device (PRD, Determinism), and only + - * / and sqrt are
 * exact in every JavaScript engine. Slopes are given as sines.
 */

/** One inch and one ounce, in meters and kilograms. */
export const IN = 0.0254;
export const OZ = 0.028349523125;

/** A side profile station, in inches: [x from the nose, bottom, top, width].
 *  Bottom and top are above the block's own bottom face. */
const st = (x, bottom, top, width) => Object.freeze([x * IN, bottom * IN, top * IN, width * IN]);

export const DERBY_CONFIG = Object.freeze({
    // Solved once per visit and cached in sessionStorage by the shared boot
    // part; the same key every scene uses, so one solve covers the site.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    /** The kit, as it comes in the box (verify). */
    kit: Object.freeze({
        length: 7 * IN,
        width: 1.75 * IN,
        height: 1.25 * IN,
        /** Soft pine, kg per cubic meter (verify: kit blocks run 350 to 450). */
        woodDensity: 400,
        /** The axle slots, measured from the nose. Wheelbase 4.375 in. */
        frontAxle: 1.75 * IN,
        rearAxle: 6.125 * IN,
        /** How far the axles sit above the block's bottom face. */
        axleHeight: 0.2 * IN,
        wheel: Object.freeze({
            radius: 0.59 * IN,
            mass: 2.6e-3,
            /** I = k m r squared. A plastic wheel's mass sits at its rim. */
            inertiaK: 0.55,
            thickness: 0.38 * IN
        }),
        axle: Object.freeze({ radius: 0.0435 * IN, mass: 0.9e-3 }),
        /** Paint and clear coat, spread over the body. */
        paintMass: 1.5e-3
    }),

    /** The weights a builder drops in. Tungsten goes in drilled pockets
     *  (the wood they replace comes out); zinc strips stick on. */
    weights: Object.freeze({
        cylinder: Object.freeze({ label: 'Tungsten cylinder', mass: 0.25 * OZ, density: 19250, pocket: true }),
        cube: Object.freeze({ label: 'Tungsten cube', mass: 0.2 * OZ, density: 19250, pocket: true }),
        strip: Object.freeze({ label: 'Zinc strip', mass: 0.1 * OZ, density: 7140, pocket: false }),
        // The last few hundredths, pressed in by hand: its mass is the
        // piece's own (`mass` on the weight), up to `mass` here.
        putty: Object.freeze({ label: 'Tungsten putty', mass: 0.1 * OZ, density: 11000, pocket: false })
    }),

    /** The two rule sheets (PRD, Two classes). Outlaw drops the sheet but
     *  keeps what the track itself demands. Every limit is checked on the
     *  rounded figure the scale or the gauge would show. */
    rules: Object.freeze({
        standard: Object.freeze({
            label: 'Standard',
            maxMass: 5 * OZ,
            maxLength: 7 * IN,
            maxWidth: 2.75 * IN,
            minWheelGap: 1.75 * IN,
            minClearance: 0.375 * IN
        }),
        outlaw: Object.freeze({
            label: 'Outlaw',
            // The sim's sane ceiling, not a rule: past this a car is a brick
            // on wheels and the plastic would not hold it.
            maxMass: 16 * OZ,
            maxLength: 7 * IN,
            // The lane between its guide rails.
            maxWidth: 2.75 * IN,
            // Clears the lane's center guide strip.
            minWheelGap: 1.75 * IN,
            minClearance: 0.3 * IN
        })
    }),

    /**
     * The track (verify against a real 42 ft aluminum track). Measured along
     * the track from the start pin, where every car's nose rests, to the
     * finish line. Three parts: a straight slope, a transition whose slope
     * eases to flat, and the flat run. In the transition the SINE of the
     * slope falls linearly with distance, which keeps the whole profile
     * exact in plain arithmetic (no trig) and its height a quadratic.
     */
    track: Object.freeze({
        /** Sine of the slope (about 26.7 degrees). */
        slopeSine: 0.45,
        /** From the start pin to where the transition begins. */
        slopeLength: 1.511,
        transitionLength: 2.4,
        /** Start pin to finish line, 40 ft. */
        courseLength: 12.192,
        lanes: 4
    }),

    /**
     * Each lane's quiet defect (PRD, The heats): a hair more rolling
     * resistance, worth one to three thousandths of a second. Rotation
     * cancels it, and the results say so. Lane 4 runs slowest.
     */
    laneDefects: Object.freeze([0.00004, 0.00012, 0.0, 0.0003]),

    physics: Object.freeze({
        g: 9.80665,
        airDensity: 1.204,
        /** Fixed timestep. The frame rate never touches the sim. */
        dt: 0.0005,
        /** A car slower than this has stopped. */
        maxSeconds: 10,

        /**
         * Axle friction, a coefficient on the load each wheel carries, acting
         * at the axle (so scaled by axle radius over wheel radius). A nail as
         * it comes from the kit has a burr under its head and crimp marks
         * along its shaft. Each tune-up multiplies it, polish by less each
         * grit (verify against published axle tests).
         */
        axleFriction: Object.freeze({
            stock: 0.3,
            deburred: 0.8,
            /** 400, 800, 1200 and 2000 grit, then polishing compound. */
            polish: Object.freeze([0.85, 0.88, 0.92, 0.95, 0.97]),
            graphite: 0.45
        }),

        /** Plastic wheels on aluminum, a coefficient on the load. */
        rollingResistance: 0.0025,

        /**
         * Wheel hubs rubbing the body and treads brushing the guide rail, a
         * FORCE in newtons, not a share of the load: it comes from the car
         * wandering side to side, which its weight does not set. That is one
         * reason a heavy car is faster (Mann, Gibbs and Sah, "Dynamics of a
         * gravity car race", Mechanical Sciences 3, 2012, measured heavier
         * cars faster). Alignment brings it down.
         */
        sideRub: Object.freeze({ misaligned: 0.009, aligned: 0.005 }),

        /**
         * Too far back is a real mistake, though a mild one: Mann et al. saw
         * cars with their weight at the extremes wobble, and still win on
         * balance. With the center of mass closer than `safe` in front of the
         * rear axle, the front goes light through the transition and the car
         * hunts from rail to rail: the side rub grows with the square of how
         * far inside `safe` it is, to `extra` newtons at the axle itself.
         * Behind the axle, the front lifts clear (`wheelie`).
         */
        wobble: Object.freeze({ safe: 0.75 * IN, extra: 0.024, wheelie: 0.04 }),

        /**
         * Drag coefficient from the body's shape: blunt at both ends is a
         * block, a fine nose and tail is a teardrop. Sanding rounds every
         * edge and takes off up to `sanding` of what is left. Kept the
         * smallest lever on purpose: Mann et al.'s sensitivity analysis found
         * race time least sensitive to the car's cross section.
         */
        drag: Object.freeze({
            teardrop: 0.4,
            block: 0.52,
            noseWeight: 0.7,
            /** Where the nose and tail are read, as a fraction of the length. */
            noseAt: 0.08,
            tailAt: 0.92,
            sanding: 0.1,
            /** The exposed wheels, all four together. */
            wheelArea: 0.0004,
            wheelCd: 0.9
        }),

        /** Slices a profile is integrated over, for volume and balance. */
        slices: 140
    }),

    /**
     * The starting designs (PRD, Time to first race), as side profiles. Each
     * is the stations along the car from nose to tail, in inches, linearly
     * joined: [x from the nose, bottom, top, width]. A full block is 1.25 in
     * tall and 1.75 in wide.
     */
    designs: Object.freeze({
        block: Object.freeze({ label: 'Block', stations: Object.freeze([st(0, 0, 1.25, 1.75), st(7, 0, 1.25, 1.75)]) }),
        wedge: Object.freeze({
            label: 'Wedge',
            stations: Object.freeze([st(0, 0, 0.25, 1.75), st(6.25, 0, 1.0, 1.75), st(7, 0, 1.0, 1.75)])
        }),
        thinWedge: Object.freeze({
            label: 'Thin Wedge',
            stations: Object.freeze([st(0, 0, 0.15, 1.75), st(6.5, 0, 0.6, 1.75), st(7, 0, 0.6, 1.75)])
        }),
        bullet: Object.freeze({
            label: 'Bullet',
            stations: Object.freeze([
                st(0, 0.15, 0.35, 0.9), st(0.8, 0, 0.7, 1.5), st(1.5, 0, 0.85, 1.75), st(6.0, 0, 0.9, 1.75), st(7, 0.1, 0.7, 1.75)
            ])
        }),
        classic: Object.freeze({
            label: 'Classic',
            stations: Object.freeze([
                st(0, 0, 0.5, 1.75), st(1.5, 0, 0.65, 1.75), st(3.0, 0, 1.1, 1.75), st(4.5, 0, 1.1, 1.75), st(5.5, 0, 0.75, 1.75), st(7, 0, 0.75, 1.75)
            ])
        }),
        lowRider: Object.freeze({
            label: 'Low Rider',
            stations: Object.freeze([st(0, 0, 0.3, 1.75), st(1.5, 0, 0.5, 1.75), st(7, 0, 0.5, 1.75)])
        }),
        loaf: Object.freeze({
            label: 'Loaf',
            stations: Object.freeze([
                st(0, 0, 0.7, 1.75), st(0.8, 0, 1.15, 1.75), st(6.2, 0, 1.15, 1.75), st(7, 0, 0.7, 1.75)
            ])
        }),
        hotDog: Object.freeze({
            label: 'Hot Dog',
            // A bun with the sausage poking out of both ends, blunt and tall.
            stations: Object.freeze([
                st(0, 0.3, 1.05, 0.8), st(0.5, 0, 1.25, 1.75), st(6.5, 0, 1.25, 1.75), st(7, 0.3, 1.05, 0.8)
            ])
        })
    }),

    /** A car's tune-ups as it comes from the box. */
    stockTune: Object.freeze({ deburr: false, polish: 0, graphite: false, align: false, sand: 0 }),

    /**
     * The neighbors' nine cars (PRD, The neighbors' cars), slowest first.
     * Built in the workshop's own model and timed by the same sim, so their
     * order is an output of the physics, and tests/derby-sim.test.mjs holds
     * it. `ballast` is what Auto-weigh is asked for: a weight in ounces and a
     * balance point in inches in front of the rear axle. Names are
     * placeholders.
     */
    field: Object.freeze([
        { id: 'brick', name: 'The Brick', design: 'block', ballast: null,
            tune: { deburr: false, polish: 0, graphite: false, align: false, sand: 0 } },
        { id: 'hotdog', name: 'Hot Dog', design: 'hotDog', ballast: { mass: 4.5, balance: 3.4 },
            tune: { deburr: false, polish: 0, graphite: true, align: false, sand: 0 } },
        { id: 'loaf', name: 'Rainbow Loaf', design: 'loaf', ballast: { mass: 4.4, balance: 2.4 },
            tune: { deburr: true, polish: 0, graphite: true, align: false, sand: 0.5 } },
        { id: 'streak', name: 'Blue Streak', design: 'wedge', ballast: { mass: 4.8, balance: 2.0 },
            tune: { deburr: true, polish: 1, graphite: true, align: false, sand: 0 } },
        { id: 'tiger', name: 'Tiger Tail', design: 'lowRider', ballast: { mass: 5.0, balance: 2.0 },
            tune: { deburr: true, polish: 0, graphite: true, align: false, sand: 0 } },
        { id: 'comet', name: 'The Comet', design: 'bullet', ballast: { mass: 5.0, balance: 1.8 },
            tune: { deburr: true, polish: 2, graphite: true, align: false, sand: 0.5 } },
        { id: 'owl', name: 'Night Owl', design: 'thinWedge', ballast: { mass: 5.0, balance: 1.25 },
            tune: { deburr: true, polish: 3, graphite: true, align: false, sand: 0.5 } },
        { id: 'arrow', name: 'Silver Arrow', design: 'wedge', ballast: { mass: 5.0, balance: 1.0 },
            tune: { deburr: true, polish: 4, graphite: true, align: true, sand: 0.5 } },
        { id: 'phantom', name: 'The Phantom', design: 'thinWedge', ballast: { mass: 5.0, balance: 0.875 },
            tune: { deburr: true, polish: 5, graphite: true, align: true, sand: 1 } }
    ]),

    /** Who each division faces, by field index (PRD, Check-in). The Outlaw
     *  exhibition (D4) faces the Hard division's three, the fastest. */
    divisions: Object.freeze({
        easy: Object.freeze([0, 1, 2]),
        medium: Object.freeze([3, 4, 5]),
        hard: Object.freeze([6, 7, 8]),
        outlaw: Object.freeze([6, 7, 8])
    }),

    /** Each neighbor's paint, by field id (M1, graybox). */
    fieldColors: Object.freeze({
        brick: 0x9a4b34, hotdog: 0xd9a441, loaf: 0xe2607a, streak: 0x2f6fd6, tiger: 0xe8852b,
        comet: 0x2fb38a, owl: 0x5b4588, arrow: 0xb8bcc4, phantom: 0x26262c
    }),

    // ---- M3: the quick build ----------------------------------------------
    //
    // M1's four preset cars stood in for the workshop until it opened. They
    // are gone: the visitor's cars are now their own, built on the bench and
    // kept in the garage (garage.js).

    /**
     * The workbench (M3, PRD The workshop). A first-time visitor finds a car
     * already on it, legal and sensible, so a race is two taps away (PRD,
     * Time to first race).
     */
    bench: Object.freeze({
        /** The starting designs offered, in this order (PRD, Time to first
         *  race). The others in `designs` are the neighbors'. */
        designs: Object.freeze(['wedge', 'bullet', 'classic', 'lowRider', 'block']),
        /** The garage's size (D6). */
        cars: 4,
        /** A new car's paint, by palette id, the first car's first. */
        newColors: Object.freeze(['blue', 'red', 'yellow', 'green']),
        /**
         * Auto-weigh tops a car up to its sheet's limit with the balance
         * point this far in front of the rear axle, in inches: inside the
         * sweet spot the model found on its own (M0, 0.75 to 0.875 in).
         */
        autoBalance: 0.875,
        /**
         * The pockets a builder can drill (PRD, Weights), in inches from the
         * nose, none within 0.3 in of an axle slot. A pocket is a row of
         * `diameter` holes across the body, `wall` of wood between them (a
         * full 1.75 in block takes three). Tungsten stacks in each hole, a
         * piece taking `depth` of it, above `floor` of wood left under it.
         * An Outlaw car may stack `proud` higher than the body's top. Zinc
         * strips stick on underneath, `strips` a spot.
         */
        pockets: Object.freeze({
            at: Object.freeze([0.5, 1.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.6]),
            depth: Object.freeze({ cylinder: 0.2, cube: 0.25 }),
            floor: 0.1,
            proud: 1.0,
            strips: 2,
            diameter: 0.375,
            wall: 0.125
        })
    }),

    /** Paint (M3, PRD Paint and decals): the palette, named as a car's name
     *  says it ("Blue Wedge"), and the three finishes. */
    paint: Object.freeze({
        colors: Object.freeze([
            Object.freeze({ id: 'red', label: 'Red', color: 0xd63c3c }),
            Object.freeze({ id: 'orange', label: 'Orange', color: 0xee7a2a }),
            Object.freeze({ id: 'yellow', label: 'Yellow', color: 0xf2c230 }),
            Object.freeze({ id: 'green', label: 'Green', color: 0x39b54a }),
            Object.freeze({ id: 'teal', label: 'Teal', color: 0x1fa3a0 }),
            Object.freeze({ id: 'blue', label: 'Blue', color: 0x3a7be8 }),
            Object.freeze({ id: 'purple', label: 'Purple', color: 0x7a4fd0 }),
            Object.freeze({ id: 'pink', label: 'Pink', color: 0xe8609c }),
            Object.freeze({ id: 'white', label: 'White', color: 0xf2f2ee }),
            Object.freeze({ id: 'black', label: 'Black', color: 0x232326 })
        ]),
        finishes: Object.freeze({
            gloss: Object.freeze({ label: 'Gloss', roughness: 0.2, metalness: 0.05, env: 0.9 }),
            metallic: Object.freeze({ label: 'Metallic', roughness: 0.3, metalness: 0.8, env: 1.2 }),
            matte: Object.freeze({ label: 'Matte', roughness: 0.85, metalness: 0, env: 0 })
        }),
        /** The stripe down the top, a share of the body's width. */
        stripeWidth: 0.3
    }),

    // ---- M1: the hall and the race on screen --------------------------------

    site: Object.freeze({ home: Object.freeze({ path: '/' }) }),

    render: Object.freeze({ maxPixelRatio: 2, mobilePixelRatio: 1.5, exposure: 1.05, shadows: true, mobileShadows: false }),

    /**
     * The track as drawn (M1). The sim's track is a line. This is the
     * aluminum around it: four lanes side by side, a guide strip down the
     * middle of each that the wheels straddle, and a braking run past the
     * finish. Heights are above the hall floor.
     */
    track3d: Object.freeze({
        lanePitch: 0.095,
        edge: 0.02,
        thickness: 0.012,
        strip: Object.freeze({ width: 1.625 * IN, height: 0.25 * IN }),
        /** The flat run's surface above the floor. */
        floorGap: 0.08,
        /** Track behind the start pin, for the cars' tails. */
        behind: 0.6,
        /** Past the finish line, where the cars run out and stop. */
        braking: 2.2,
        /** Every this many meters, a cross section. */
        step: 0.02
    }),

    /** The race's pace on screen (M1), in seconds. */
    timing: Object.freeze({
        staging: 1.8,
        /** The gate drops this long before the cars roll. */
        gate: 0.25,
        /** After the last car crosses, before the times show. */
        settle: 0.5,
        /** The times on the board, before the next heat. */
        times: 2.6,
        /** A finish this close gets a slow replay (PRD, The heats). */
        closeGap: 0.02,
        replayRate: 0.25,
        /** The replay starts this long before the first car crosses. */
        replayLead: 0.35,
        replayTail: 0.12,
        /** Past the line, a car runs out over this many meters. */
        runOut: 1.6,
        /** Samples a run is recorded at, a second apart. */
        record: 1 / 120
    }),

    camera: Object.freeze({
        fov: 45,
        near: 0.02,
        far: 120,
        /** When the leader is this close to the line, the finish camera. */
        finishFrom: 3.2,
        /** Half the width a shot must hold: the four lanes and a margin. */
        holdHalfWidth: 0.26,
        follow: 6
    }),

    /**
     * The workbench on screen (M3, graybox): a table in its own small room
     * beyond the hall's start wall, the car on a turntable, the camera close
     * on it. The panel covers part of the screen (a bottom sheet on a phone,
     * a side panel on a computer), so the car is framed in the part left
     * clear. A miniature, so warm and colorful, not the white rooms.
     */
    workbench: Object.freeze({
        at: Object.freeze({ x: -12, z: 0 }),
        /** The table top, above the floor. */
        top: 0.9,
        /** What the camera must hold: the turntable and the car on it. */
        holdRadius: 0.15,
        /** How much of the clear part of the screen it fills. */
        fill: 0.8,
        /** From the car toward the camera, and the nearest it comes. */
        dir: Object.freeze([0.25, 0.42, 1]),
        minDistance: 0.32,
        /** The turntable's turn, radians a second (none under reduced motion). */
        spin: 0.3,
        /** Wider than this, the panel sits at the side (CSS keeps the same). */
        sideFrom: 900,
        look: Object.freeze({
            room: 0xf0e2cc,
            floor: 0xc79a62,
            table: 0xe2b77c,
            pegboard: 0xd9b88a,
            turntable: 0x3d4a5c,
            scale: 0xe8e4dc,
            light: 0xffe2b8
        })
    }),

    /**
     * The share clip (M2, PRD The share): 9:16, the car on its own, its best
     * heat with a slow finish, the board, and the end card, about thirteen
     * seconds. Recorded live from a second renderer, never uploaded.
     */
    clip: Object.freeze({
        width: 1080,
        height: 1920,
        mobileWidth: 720,
        mobileHeight: 1280,
        fps: 30,
        bitrate: 8000000,
        mobileBitrate: 5000000,
        carSeconds: 2.2,
        stagingSeconds: 0.45,
        /** The run, until this long after the visitor's car crosses. */
        runTail: 0.5,
        /** The slow finish: this long either side of the crossing, at `slowRate`. */
        slowLead: 0.4,
        slowTail: 0.15,
        slowRate: 0.3,
        /** A rival this close is kept in the slow finish too. */
        rivalWithin: 0.05,
        boardSeconds: 3.8,
        endSeconds: 1.6,
        orbit: Object.freeze({ radius: 0.42, height: 0.12, from: 0.25, sweep: 1.1 }),
        still: Object.freeze({ width: 1080, height: 1350 }),
        url: 'scenexp.com/derby'
    }),

    /**
     * The sound (M2): every sound made with Web Audio from noise and tones,
     * no files. Muted by default (D2), a phone a little quieter than a
     * computer, a limiter on the way out.
     */
    sound: Object.freeze({
        master: 0.5,
        masterMobile: 0.4,
        /** The clip's sound, whatever the speakers are set to. */
        record: 0.6,
        /** Changes are scheduled this far ahead of the audio clock. */
        ahead: 0.01,
        limiter: Object.freeze({ threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 }),
        /** Wheels on aluminum: a band of noise, louder the faster the field. */
        roll: Object.freeze({ gain: 0.26, hz: 900, q: 0.8, top: 3200 }),
        gate: Object.freeze({ gain: 0.5, clickHz: 2400, thunkHz: 150, seconds: 0.14 }),
        beep: Object.freeze({ gain: 0.16, hz: 1568, seconds: 0.09 }),
        cheer: Object.freeze({ gain: 0.34, hz: 1300, q: 0.6, attack: 0.25, decay: 2.4, clapHz: 7 })
    }),

    look: Object.freeze({
        background: 0x2b2420,
        fog: Object.freeze({ color: 0x2b2420, near: 14, far: 60 }),
        floor: 0xb98a55,
        wall: 0xe9dfcf,
        aluminum: 0xc7ccd3,
        strip: 0x8e949c,
        bleachers: 0x6f7f96,
        wheel: 0x1d1d1f,
        gate: 0xd9c43a
    })
});
