// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Earth Defense experience configuration.
 *
 * One plain object holding every per-experience knob. main.js imports this and
 * passes slices into the shared parts: initSpace(canvas, CONFIG),
 * initBodies(...), and later initFlight(CONFIG.flight) and friends.
 *
 * These are final literal values: nothing mutates this object at runtime
 * (deepFreeze below enforces that). Every number the design expects to tune in
 * playtest lives here and nowhere else.
 *
 * A game honoring the first generation of video game designers and developers,
 * honored as a group and deliberately unnamed. The world is Earth orbit: a
 * massive Earth below, the Moon on its eight-minute lap, Mars a ruddy disc
 * ahead, and a Martian fleet already on its way in.
 *
 * SCALE. One world unit is one kilometre. Body radii are near true scale so the
 * planets feel real; the distances between them are compressed hard so the
 * world is traversable. That means the HUD can print honest km and km/s while
 * the Moon sits at ten Earth radii instead of sixty.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

// Mars sits on the -Z axis, so -Z is "outward" and the whole scene is built
// around that one convention: the fleet arrives along it, the player spawns
// looking down it, and the defended face of Earth is the one turned toward it.
const MARS_DISTANCE = 200000;

export const EARTHDEFENSE_CONFIG = deepFreeze({
    rootName: 'orbit',

    // ---- Renderer, cameras, lights, stars (space-1.0.0) --------------------
    space: {
        // The two-camera split. The world camera's near plane is 100 units,
        // which is only affordable because the cockpit is drawn by the overlay
        // camera after a depth clear rather than sharing this range.
        worldCamera: { fov: 70, near: 100, far: 500000 },
        overlayCamera: { fov: 70, near: 0.1, far: 100 },

        // A stand-in for a sun that is never rendered, so the direction is
        // chosen for the composition rather than for astronomy: up and behind
        // the spawn point, which lights the face of Earth the visitor can see
        // and leaves the Moon in a gibbous phase (prettier than a full disc).
        keyLight: { direction: [0.4, 0.7, 1.0], intensity: 1.35, color: 0xfff4e8 },
        ambient: { intensity: 0.16, color: 0x4a5a7a },

        starCount: 6000,
        starRadius: 450000,
        starSize: 1400,
        maxPixelRatio: 2
    },

    // ---- The three bodies (bodies-1.0.0) ----------------------------------
    bodies: [
        {
            id: 'earth',
            radius: 6371,
            // Earth fills the lower third of the opening frame, so its limb is
            // the most scrutinised curve in the experience: 128 segments, where
            // 64 would show visible faceting along the horizon.
            segments: 128,
            texture: 'assets/earth_daymap_2k.jpg',
            position: [0, 0, 0],
            // One rotation per hour. Deliberately slow: Earth's installations
            // are anchored to its surface, so a faster spin would carry a
            // structure that is under attack around to the far side where the
            // visitor can neither see it nor defend it. At this rate a
            // twelve-minute run moves a structure about 72 degrees, which keeps
            // every one of them reachable. Verified at M3.
            rotationPeriod: 3600,
            atmosphere: { scale: 1.025, color: 0x6aa9ff, intensity: 1.15, power: 2.6 }
        },
        {
            id: 'moon',
            radius: 1737,
            segments: 64,
            texture: 'assets/moon_2k.jpg',
            orbit: {
                parent: 'earth',
                // Ten Earth radii, not the true sixty. Close enough to read as
                // a real destination and a short hop (about sixteen seconds at
                // full throttle), and close enough that Earth and the Moon can
                // be framed together.
                radius: 64000,
                // Eight minutes a lap, longer than a typical run, so the sky
                // visibly changes over one game without anyone being lapped.
                period: 480,
                // Phase and inclination are not free. They are solved
                // backwards from where the Moon has to appear in the opening
                // frame, and the binding constraint is a PORTRAIT PHONE.
                //
                // Three.js field of view is vertical, so Earth's limb and Mars
                // hold their positions at every aspect ratio. Horizontal field
                // does not: at 70 degrees vertical, a 9:19.5 phone sees only
                // about 17.9 degrees either side of the nose, and a 9:21 phone
                // about 16.7. Anything further out simply is not there for the
                // visitors we expect most of.
                //
                // These values put the Moon 10.8 degrees right of the nose and
                // 7.0 degrees above it. With its own 1.5 degree radius that
                // places the far edge at 12.3 degrees, inside the narrowest
                // portrait frame with room to spare, while staying 19 degrees
                // clear of Earth's disc and 14 degrees off Mars so nothing
                // crowds anything. Locked by tests/earthdefense-init.test.mjs.
                phase: -1.3734,
                inclination: -0.2495,
                // The same face always toward Earth, which is what keeps the
                // lunar installations pointed at home for the whole game.
                tidalLock: true
            }
        },
        {
            id: 'mars',
            radius: 3390,
            segments: 64,
            texture: 'assets/mars_2k.jpg',
            // Nobody travels here, so this distance is purely a composition
            // choice: how big a disc do we want ahead. At 200,000 units Mars is
            // about 1.9 degrees across, roughly four times the apparent size of
            // the real Moon in our sky. A clear disc with visible colour, still
            // unmistakably far away.
            position: [0, 0, -MARS_DISTANCE],
            rotationPeriod: 900
        }
    ],

    // ---- Spawn ------------------------------------------------------------
    //
    // The opening frame is the pitch for the whole game, so this is the most
    // load-bearing block in the file.
    //
    // The player sits `distance` from Earth's centre, on a line `axisAngle`
    // away from the +Z axis (the anti-Mars direction), tilted toward +Y:
    //
    //     position = distance · (0, sin(axisAngle), cos(axisAngle))
    //
    // and looks straight down -Z at Mars, with no pitch at all.
    //
    // Why 60 degrees. From 8,500 units Earth's angular RADIUS is 48.6 degrees,
    // so its near limb sits (60 - 48.6) = 11.4 degrees below the nose. Against
    // a 70 degree vertical field that puts the horizon a third of the way up
    // from the bottom edge, with Mars near the centre and the sky above it
    // clear. Sitting directly over the pole instead would put Earth's limb 41
    // degrees down, off the bottom of the frame, and recovering it would mean
    // pitching the nose down far enough to push Mars up into the top corner.
    // The 60 degree offset buys the whole composition and costs no pitch.
    //
    // These are starting values, verified by eye at the M1 gate, not results.
    spawn: {
        distance: 8500,
        axisAngle: 1.0472,   // 60 degrees, from +Z toward +Y
        yaw: 0,              // 0 looks down -Z, straight at Mars
        pitch: 0
    },

    // ---- Installations ----------------------------------------------------
    //
    // Seven friendly installations: four on Earth, three on the Moon. Each
    // takes three hits. These are the whole objective, so where they sit is a
    // design decision rather than decoration.
    //
    // A NOTE ON SCALE, said plainly rather than hidden. At 160 units these are
    // 160 km tall, which is absurd. It is deliberate: anything built to real
    // scale on a 6,371 unit Earth would be smaller than one pixel from orbit
    // and the objective would be invisible. The silhouettes are drawn to read
    // as installations rather than as cities, so the break is stylised instead
    // of looking like a mistake.
    //
    // WHERE THEY SIT. From 8,500 units a sphere only shows a cap of 41.5
    // degrees around the point directly beneath the player, which at spawn is
    // 60 N, 90 W. Every Earth site is inside that cap, so all four are on
    // screen from the first frame, and every one is on land so the textures
    // read correctly. Earlier drafts of the PRD called for the Mars-facing
    // hemisphere; that face is 150 degrees away and permanently behind the
    // planet at spawn, so it was the wrong side to defend.
    //
    // The Moon's three sit near its Earth-facing point (0 lat, 90 lon in this
    // convention), which tidal locking keeps pointed at home all game.
    structures: {
        hitPoints: 3,
        height: 160,
        beaconColor: 0x7fd4ff,
        hostileBeaconColor: 0xff7043,
        earth: [
            { id: 'earth-north', label: 'Northwatch', lat: 55, lon: -115 },
            { id: 'earth-west', label: 'Cold Harbour', lat: 60, lon: -150 },
            { id: 'earth-east', label: 'Longreach', lat: 64, lon: -22 },
            { id: 'earth-south', label: 'Tidewater', lat: 40, lon: -75 }
        ],
        moon: [
            { id: 'moon-north', label: 'Highstep', lat: 20, lon: 75 },
            { id: 'moon-south', label: 'Quiet Sea', lat: -25, lon: 105 },
            { id: 'moon-east', label: 'Farside Gate', lat: 5, lon: 120 }
        ]
    },

    // ---- Flight (flight-1.0.0) --------------------------------------------
    flight: {
        // One kilometre per unit, so 4,000 units/s is 4,000 km/s and the HUD
        // can print it honestly. Fast enough to reach the Moon in about
        // sixteen seconds, slow enough that Earth still takes three to cross.
        maxForward: 4000,
        // Reverse is deliberately a quarter of forward. A ship that backs up
        // as fast as it flies feels weightless and makes reverse the answer to
        // everything.
        maxReverse: 1000,
        accelTime: 6,
        decelTime: 4,

        turnRate: 1.3,          // radians/second at full deflection
        pitchClamp: 1.48,       // 85 degrees, so nobody can invert
        mouseSensitivity: 0.0022,
        lookSensitivity: 1.0,   // the settings cog drives this
        invertPitch: false,
        // Throttle fraction per second while a key or stick is held. At 0.8 a
        // full sweep from stop to maximum takes a bit over a second, which
        // reads as a lever being pushed rather than a switch being flipped.
        throttleRate: 0.8,
        gamepadDeadzone: 0.15,
        lookJoystickRadius: 55,
        doubleTapMs: 320
    },

    // ---- Targeting (targeting-1.0.0) --------------------------------------
    //
    // There is no fire button. These four numbers ARE the weapon: the ship
    // shoots whatever satisfies all of them and stops the instant nothing does.
    targeting: {
        // Six degrees. Wide enough that lining a raider up is a normal amount
        // of flying rather than threading a needle, narrow enough that the lock
        // still feels like something the visitor did. If M4's gate says
        // automatic fire feels passive, this is the first number to open up.
        coneRadians: 0.10472,
        // Eight thousand units, a little under Earth's diameter. Far enough to
        // reach across a fight, short enough that nothing is picked off from
        // the other side of the world.
        range: 8000,

        // WHAT COUNTS AS A TARGET, and the one line in this file that is
        // temporary. From M5 the Martian fleet arrives and this becomes
        // ['hostile'], which is the real game: you never shoot your own
        // installations. Until then the fleet does not exist, and the M4 gate
        // ("fly at a structure and shoot it") needs something in the world to
        // shoot at, so the seven friendlies stand in as a firing range.
        //
        // FLIP THIS TO ['hostile'] AT M5. It is data rather than code exactly
        // so that the flip is one word and the targeting module never learns
        // what a Martian is.
        allegiance: ['friendly']
    },

    // ---- Weapons (weapons-1.0.0) ------------------------------------------
    weapons: {
        shotsPerSecond: 4,
        damagePerShot: 1,
        // A frame long enough to earn more than four shots is a frame that
        // stalled, and the right response is to drop the backlog rather than
        // empty it into whatever is centred when the tab comes back.
        maxShotsPerFrame: 4,

        // The tracer is COSMETIC. The hit is resolved the moment it is fired
        // (PRD 6.2), so these numbers change how the shot reads and nothing
        // about what it does. At 30,000 units/s a tracer crosses a typical
        // 3,000 unit engagement in a tenth of a second: fast enough to read as
        // a weapon rather than a thrown stone, slow enough to see leave.
        tracerSpeed: 30000,
        tracerLife: 0.35,
        tracerLength: 900,
        tracerColor: 0xffd9a0,

        flashLife: 0.18,
        flashColor: 0xfff0c4,
        flashScale: 1.8,

        burstLife: 0.9,
        burstColor: 0xffa657,
        burstParticles: 24,
        burstSpeed: 900,
        burstSize: 90,
        effectRadius: 200
    },

    // ---- Cockpit (cockpit.js) ---------------------------------------------
    //
    // M4 DRAFT VALUES. The canopy needs judging by eye at three aspect ratios
    // and is expected to take several passes before M7.
    cockpit: {
        frameColor: 0x14181f,
        strutColor: 0x2a323d,
        glowColor: 0xff9a5c,
        dashFraction: 0.12,
        strutTopInset: 0.28,

        // WHERE THE GUNS SIT, in world units ahead of and below the eye.
        //
        // These are absurd as ship dimensions (84 units is 84 km) and that is
        // forced rather than chosen. The world camera's near plane is 100
        // units, so a muzzle at any believable offset would sit behind it and
        // the tracer would only become visible a hundred units out, arriving
        // from nowhere in the middle of the frame. Pushing the guns to 300
        // units ahead puts them in front of the near plane, so a tracer is
        // visible from the moment it leaves.
        //
        // The offsets are then set as fractions of that forward distance so
        // they land where the eye expects: 84/300 is 15.6 degrees out, which
        // stays inside even a 9:21 portrait phone's 16.7 degree half-field, and
        // 66/300 is 12.4 degrees down, just above the dash. Tracers therefore
        // enter from the lower corners and converge, which is the whole trick
        // (PRD 7): it sells a ship without modelling one.
        muzzle: { lateral: 84, drop: 66, forward: 300 }
    },

    // A soft boundary, not a wall. Nothing is out at Mars to find, so a
    // visitor who points that way and holds the throttle down gets a long look
    // and then a polite nudge home. Forward authority fades across the last
    // 15,000 units; turning and the trip back stay at full power throughout.
    perimeter: { radius: 120000, fade: 15000 },

    // Keeps the ship out of the planets until real collision arrives at M3.
    // A few hundred kilometres of standoff, which at this scale reads as
    // skimming the atmosphere rather than as hitting an invisible wall.
    altitudeFloor: 400,

    // ---- Boot and site ----------------------------------------------------
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    site: {
        honoree: {
            label: 'the first generation of video game designers and developers'
        },
        home: {
            path: '/',
            title: 'Back to the main site'
        }
    },

    // ---- Persisted settings -----------------------------------------------
    storage: {
        sensitivity: 'scenexp.earthdefense.sensitivity',
        invertPitch: 'scenexp.earthdefense.invert',
        reducedFx: 'scenexp.earthdefense.reducedfx',
        bestTime: 'scenexp.earthdefense.best'
    }
});

/** The spawn position in world units, derived from the spawn block above.
 *  Exported rather than hard-coded so the two stay in step when the M1 gate
 *  moves the numbers. */
export function spawnPosition(config = EARTHDEFENSE_CONFIG) {
    const { distance, axisAngle } = config.spawn;
    return {
        x: 0,
        y: distance * Math.sin(axisAngle),
        z: distance * Math.cos(axisAngle)
    };
}
