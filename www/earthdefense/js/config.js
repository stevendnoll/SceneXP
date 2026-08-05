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
