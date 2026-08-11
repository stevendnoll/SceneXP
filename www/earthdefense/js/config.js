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
 * THIS EXPERIENCE HAS NO HONOREE, AND THAT IS THE DECISION. Every other one on
 * SceneXP honors a person or a business, because someone real is behind each of
 * them. Earth Defense is a game, built for the joy of flying through space.
 *
 * Three dedications were written and discarded before that landed, and the
 * pattern in the failures is the useful part. First the first generation of
 * designers and developers, deliberately unnamed, which honored everyone and so
 * honored nobody in particular. Then Nintendo and Sony, which was worse: a
 * corporation is a bad recipient for a dedication, every other one here is
 * aimed at someone who could in principle be moved by it, and that one read as
 * a legal notice. Then the three consoles themselves, which was warmer and
 * still not right. All three were searching for a recipient this experience
 * does not have. Saying so is more honest than manufacturing one.
 *
 * The world is Earth orbit: a
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
//
// IT IS 10,000 UNITS FURTHER OUT THAN THE FLEET'S DEEPEST START, and that gap
// is the one number holding the opening shot together. Mars used to sit at
// exactly the trailing group's 200,000, which put those four raiders BESIDE the
// planet rather than in front of it: 15,570 units off its centre, four and a
// half Mars radii, and a full 3.4 degrees to the right of it on the spawn
// frame. The opening shot could not be staged on them, because no camera close
// enough to resolve a 220 unit hull can hold a planet 15,570 units off to the
// side in the same frame, let alone on a portrait phone's 16.7 degree half
// field. So the shot invented a formation in front of Mars instead, the fleet
// stood somewhere else, and the wedge a visitor watched form up was not where
// the hostile diamonds appeared a second later.
//
// Moving Mars back rather than pulling the fleet in is what keeps this free:
// arrival times are start distance over cruise speed, so the fleet's whole
// balance is untouched, and Mars is decoration that nobody ever flies to. The
// disc at spawn goes from 1.94 degrees across to 1.81, which is under a tenth
// of a degree and beneath noticing.
const MARS_DISTANCE = 210000;

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

        // DARK, NOT BLACK (M1 gate). 0.16 was calibrated as "vacuum has no
        // fill", which is true of vacuum and wrong for this scene: it put the
        // unlit hemisphere at roughly 3 to 6 values out of 255, so Earth's
        // night side and the whole Moon at close range read as holes cut in the
        // starfield rather than as places. The Moon is the worse of the two,
        // because a visitor flies TO it and arrives at a black disc.
        //
        // This lifts everything unlit off the floor, and it is what the
        // installations on the Moon's night side are lit by. The planets get
        // most of their rescue from `nightGlow` on the body specs below, which
        // shows their own geography rather than a flat wash. Deliberately still
        // low: the terminator is the best line in the scene and fill is what
        // flattens it. The day side barely moves, since 0.28 of ambient against
        // 1.35 of key light is under a fifth of the lit value.
        ambient: { intensity: 0.28, color: 0x4a5a7a },

        starCount: 6000,
        starRadius: 450000,
        starSize: 1400,
        maxPixelRatio: 2
    },

    // ---- Reduced effects --------------------------------------------------
    //
    // What the settings panel's "Reduced effects" checkbox actually does, and
    // what `prefers-reduced-motion` turns on by itself (PRD 12). Both routes
    // land on the same three numbers, so there is one description of what a
    // quieter frame looks like rather than two that can drift apart.
    //
    // These are DRAW RANGES, not pool sizes. The starfield and the burst pools
    // are built once at full size and then partly drawn, which is what lets the
    // checkbox take effect on the frame it is ticked instead of on the next
    // reload. The cost of the unused vertices is a little memory and nothing
    // per frame.
    reducedFx: {
        // A third of the sky. Still unmistakably a starfield, and the biggest
        // single saving available on a phone: 6,000 points are 6,000 alpha
        // blended quads over the whole frame every time.
        starCount: 2000,
        // A third of a destruction burst. Fewer, not smaller: a burst that
        // thinned to nothing would stop reading as an explosion.
        burstParticles: 8,
        maxPixelRatio: 1.5
    },

    // ---- The three bodies (bodies-1.0.0) ----------------------------------
    //
    // TWO TEXTURE PATHS PER BODY, and world.js picks one at build time. WebP is
    // the one we expect to serve: the three maps come to 235 KB against 287 KB
    // of JPEG and 2.2 MB of the 2k originals they were resized from, which was
    // the single largest performance win available (PRD 12). The JPEG is a real
    // fallback rather than a formality, because a texture that fails to load is
    // a black planet rather than a slightly worse one.
    //
    // All three are 1024x512. The budget allows 700 KB and this spends 235, so
    // there is room to take Earth back to 2048 if its close-ups read soft. That
    // would cost about 95 KB of download and, more to the point, four times the
    // texture memory on the phones that are the target (PRD G5).
    bodies: [
        {
            id: 'earth',
            radius: 6371,
            // Earth fills the lower third of the opening frame, so its limb is
            // the most scrutinised curve in the experience: 128 segments, where
            // 64 would show visible faceting along the horizon.
            segments: 128,
            texture: 'assets/earth_daymap_1k.webp',
            textureFallback: 'assets/earth_daymap_1k.jpg',
            position: [0, 0, 0],
            // One rotation per hour. Deliberately slow: Earth's installations
            // are anchored to its surface, so a faster spin would carry a
            // structure that is under attack around to the far side where the
            // visitor can neither see it nor defend it. At this rate a
            // twelve-minute run moves a structure about 72 degrees, which keeps
            // every one of them reachable. Verified at M3.
            rotationPeriod: 3600,
            atmosphere: { scale: 1.025, color: 0x6aa9ff, intensity: 1.15, power: 2.6 },

            // THE NIGHT SIDE, read as geography rather than as a wash.
            //
            // Ambient alone can only raise the unlit hemisphere to a flat grey,
            // which trades one wrong reading (a hole) for another (a smudge).
            // This is applied in world.js as an EMISSIVE TINTED BY THE BODY'S
            // OWN COLOUR MAP, so the dark side shows continents and ocean at a
            // few percent, the way a night side actually reads.
            //
            // WHY THE COLOUR IS SO BRIGHT FOR SO DARK A RESULT: an emissive map
            // MULTIPLIES, and the daymap's own albedo is only about 3 to 15
            // percent in linear terms, so this value is most of two stops above
            // what lands on screen. #5c74a0 against a mid-albedo pixel comes out
            // near rgb(26, 33, 45): unmistakably dark, clearly not black, and
            // cool enough to read as reflected light rather than as a lit
            // planet. Raise it and Earth starts to look self-illuminated.
            //
            // It adds to the LIT side too, since emissive ignores lighting, but
            // at under five percent of the day side's value that is beneath
            // notice. Set to 0 or delete the key to switch it off.
            nightGlow: 0x5c74a0
        },
        {
            id: 'moon',
            radius: 1737,
            segments: 64,
            texture: 'assets/moon_1k.webp',
            textureFallback: 'assets/moon_1k.jpg',

            // Dimmer and warmer than Earth's, for two reasons. The Moon is a
            // darker body to begin with (its map averages far less albedo than
            // the daymap, so the same value would read brighter against it than
            // the arithmetic suggests), and its night side is lit by EARTHSHINE
            // in the fiction, which is the blue-white of a planet rather than
            // the neutral of a sky. The visitor arrives here, so this is the
            // one that has to be right: before this, a screenshot pass caught
            // the Moon at 6,136 km as a near-total black circle with one lit
            // edge, at the end of a sixteen second flight made to reach it.
            nightGlow: 0x44536e,
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
            texture: 'assets/mars_1k.webp',
            textureFallback: 'assets/mars_1k.jpg',
            // At 210,000 units Mars is about 1.8 degrees across, roughly three
            // and a half times the apparent size of the real Moon in our sky. A
            // clear disc with visible colour, still unmistakably far away.
            //
            // This is no longer purely a composition choice. See MARS_DISTANCE
            // above: the 10,000 units between the fleet's deepest start and this
            // is what lets the opening shot be staged on the real raiders.
            position: [0, 0, -MARS_DISTANCE],
            rotationPeriod: 900,
            // NO `nightGlow` HERE, deliberately. Mars is never approached, so
            // it is only ever a 1.8 degree disc that the key light already
            // catches almost square on. There is no night side to rescue, and a
            // glow at that size would only make the whole disc read as slightly
            // self-lit, which would cost it the one thing it has to do: sit
            // there looking far away.
            nightGlow: 0
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
        // THIS IS SET BY THE DODGE, not by how far a gun ought to shoot.
        //
        // It was 8,000, a little under Earth's diameter, chosen when the only
        // question was "far enough to reach across a fight, short enough that
        // nothing is picked off from the other side of the world". Both halves
        // of that were satisfied and the number was still wrong, because it was
        // answering the wrong question.
        //
        // The break-off moves a raider a fixed LATERAL distance, so how big that
        // looks from the cockpit falls off with range. Measured against the six
        // degree cone and a four hit point kill (1.00s at four shots a second),
        // the time for a dodging raider to leave the cone is:
        //
        //     800 units  0.60s      3,000 units  1.02s
        //   1,500 units  0.77s      5,000 units  1.27s
        //   2,500 units  0.93s      8,000 units  1.60s
        //
        // The crossover is about 2,900. Inside it the raider escapes and has to
        // be chased. Outside it the raider dies mid-weave no matter what it
        // does, and at 8,000 it never even tries, because `fleet.evade` only
        // arms at 3,000. So five eighths of the old envelope was a zone where
        // raiders could not defend themselves, and that is where most kills were
        // happening: the fight was easy because it was being fought in the one
        // place the opponent had been switched off.
        //
        // Matching the range to the evade gate deletes that zone. You can shoot
        // exactly as far as they can dodge, so every kill is contested and the
        // approach becomes part of the fight rather than a formality. Two things
        // follow on purpose. The raiders' own `playerFireRange` is 4,200, so they
        // now out-reach the visitor and the run-in costs something. And a raider
        // at 3,000 is roughly three times the apparent size it was at 8,000,
        // which is the difference between the shield sphere reading as a shield
        // and reading as a pixel.
        //
        // IF THIS OVERSHOOTS, raise it rather than reaching for hit points. Every
        // unit above 3,000 hands back a slice of the free-kill zone.
        range: 3000,

        // WHAT COUNTS AS A TARGET. M4 shipped this as ['friendly'] because the
        // fleet did not exist yet and the gate ("fly at a structure and shoot
        // it") needed something in the world to shoot at, so the seven
        // installations stood in as a firing range for exactly one milestone.
        // M5 retired that: the raiders are here, and you never shoot your own.
        //
        // It stays data rather than code so the rule is one word, and so the
        // targeting module never learns what a Martian is. Setting it back to
        // ['friendly'] turns the game into a firing range again, which is
        // occasionally a useful thing to be able to do while tuning.
        allegiance: ['hostile']
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
    // EVERY PROPORTION HERE IS A NUMBER RATHER THAN A LINE OF CODE, which is
    // the point of this block. The canopy is judged by eye against screenshots
    // at three aspect ratios and is expected to take several passes, so a pass
    // should be editing these and reloading, not editing geometry. Anything
    // that can be set to 0 to switch a piece off says so.
    //
    // All of them are FRACTIONS of the frame, never absolute units, because the
    // frame's half-height is fixed by the vertical field of view while its
    // half-width moves with the aspect ratio. A portrait phone and a wide
    // desktop then get the same silhouette rather than the same shape stretched.
    cockpit: {
        frameColor: 0x14181f,
        strutColor: 0x2a323d,
        glowColor: 0xff9a5c,
        // THE EDGE IS WHAT MAKES THE CANOPY EXIST. A near-black frame against
        // near-black space has no silhouette at all: the first round of
        // screenshots showed the dash reading as nothing but the warm strip
        // floating above it, because the slab underneath was the same value as
        // the sky. A thin lit edge along the top of the dash is what a real
        // canopy is read by at night, and it costs one more bar.
        edgeColor: 0x46525f,

        // The dash, as a fraction of the full frame height. A twelfth reads as
        // a cockpit and leaves Earth's limb (about a third of the way up in the
        // opening frame) nowhere near it.
        dashFraction: 0.12,
        dashLipFraction: 0.055,   // the lit edge, as a fraction of the dash

        // The console rising toward the side windows: a short bar at each end
        // of the dash, tilted up and outward. This is most of what makes the
        // bottom edge read as a moulded thing rather than as a black stripe.
        // 0 removes them.
        //
        // The first pass had these at 0.6 of the half-width and 0.32 radians,
        // which put a 400 pixel slab across each bottom corner and read as a
        // mistake rather than as a console. Short and shallow is the whole
        // idea: they break the straight bottom edge and nothing more.
        dashFlareAngle: 0.22,     // radians of tilt
        dashFlareLength: 0.3,     // as a fraction of the half-width
        dashFlareOffset: 0.86,    // where along the half-width it is centred

        // The brow along the top edge. Thin on purpose: it closes the frame
        // vertically, which is what "brackets the view" in PRD 7 asks for,
        // without any of the crowding a full surround would bring. 0 removes it
        // and returns the canopy to its M4 draft silhouette.
        browFraction: 0.055,

        // The warm indicator strip along the dash. NARROW AND BRIGHT rather
        // than wide and dim: at 1.5 of the half-width and 0.55 opacity it read
        // as a brown plank laid across the bottom of the screen, which is the
        // single worst thing in the first round of screenshots.
        glowWidth: 0.5,           // as a fraction of the half-width
        glowOpacity: 0.85,

        // Slimmer and further outboard than the first pass (0.055 and 0.28),
        // which put a pair of heavy wedges across the top corners.
        strutTopInset: 0.18,
        strutWidth: 0.038,        // as a fraction of the half-width
        strutRise: 1.1,           // as a fraction of the half-height

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

    // ---- The Martian fleet (fleet.js) -------------------------------------
    //
    // THE WHOLE FLEET EXISTS AT SPAWN. There is no spawner and no wave
    // appearing from nowhere, because that always reads as cheap. Twelve ships
    // are strung out in depth along the approach vector from the first frame,
    // and they arrive in groups because they started strung out. The opening
    // frame therefore carries a line of hostile lights trailing back toward
    // Mars, which is both honest about what is renderable at 200,000 units and
    // a better image than resolved hulls would be.
    //
    // ARRIVAL TIMES ARE START DISTANCE OVER CRUISE SPEED, and nothing else, so
    // they can be read straight off this block: 28,000 / 1,200 is about 23
    // seconds, 110,000 is about 92, and 200,000 is about 167.
    fleet: {
        total: 12,

        // FOUR SHOTS, NOT ONE, and this reverses PRD 6.3's table along with the
        // "no shields" non-goal in 2.2. It is a playtest finding beating a
        // pre-playtest decision: at one hit point the game was too easy, and
        // the reason turned out to be structural rather than a matter of
        // degree. There is no fire button, so the guns fire whatever sits in
        // the six degree cone: lining a raider up and killing it were the SAME
        // ACT, and the whole fight was an aiming exercise with no second beat.
        //
        // WHAT THIS BUYS IS THE BREAK-OFF, which was built at M5 and has never
        // once been seen. `evade` below triggers on the visitor being close and
        // nearly lined up, and weaves a raider about ten degrees off its line,
        // comfortably outside the six degree gun cone. At one hit point the
        // frame that produced a lock also produced a corpse, so a dodge could
        // never happen. At four, a kill takes a full second of held lock at
        // four shots a second, which is long enough for a raider to notice, to
        // break, and to have to be chased back into the cone. That is PRD 6.3's
        // own "satisfaction of a chase" finally existing.
        //
        // THIS IS THE FIRST NUMBER TO TUNE if the swing turns out too far. The
        // added trigger time is only about nine seconds across all twelve
        // raiders; the real cost is one evade per kill, so the honest range is
        // more like thirty to sixty seconds against a run the fleet wins in
        // 107. Three is the next stop down.
        hitPoints: 4,
        cruiseSpeed: 1200,     // comfortably slower than the player's 4,000

        // THE APPROACH LINE IS TILTED OFF THE MARS AXIS, but only just, and it
        // used to be tilted seven times harder for a reason that no longer
        // exists. Mars sat at exactly the trailing group's start distance, so
        // an untilted line buried four raiders in the planet, and 0.06 by 0.05
        // was the cheapest way out. What it bought in clearance it paid for in
        // composition: 15,570 units of sideways offset put the deepest group
        // BESIDE Mars rather than in front of it, 3.4 degrees to the right of
        // the disc on the spawn frame, and nowhere the opening shot could be
        // staged. See MARS_DISTANCE, which now carries that clearance instead.
        //
        // WHAT THE TILT IS STILL FOR is the lean. At 200,000 units this is
        // 1,600 across and 1,200 up, which puts the trailing group's centre
        // 0.82 degrees off Mars's centre against its 0.91 degree disc radius:
        // two of the four raiders sit on the disc and two just clear of the
        // limb, so the group reads as standing AT Mars rather than pasted flat
        // on it. The intro suite asserts this against the opening shot, so
        // retuning it fails loudly rather than quietly sliding the wedge off
        // the raiders it is supposed to be standing in for.
        approach: { azimuth: 0.008, elevation: 0.006 },

        // Per-ship scatter around the group's start point, so a group reads as
        // a formation rather than as a queue. Deterministic (a hash of the
        // ship index, not Math.random), so the opening frame is the same every
        // visit and the arrival times stay testable.
        spread: { lateral: 2400, vertical: 1600, depth: 3200 },

        turnRate: 0.55,        // radians/second: about a 2,200 unit turn radius
        standoff: 1200,        // how far off a structure an attacker holds

        // LOITERING IS RELATIVE TO THE TARGET, NOT TO SPACE. An attacker flies
        // formation with its installation, so it borrows that installation's
        // whole velocity and this fraction of cruise is what it spends on the
        // circle itself. 0.35 of 1,200 is 420 units a second around a 1,200 unit
        // circle, which is 0.35 radians a second and comfortably inside the 0.55
        // turn rate, so the lap is one the ship can actually fly.
        //
        // AN EARLIER VERSION PROJECTED THE BORROWED VELOCITY ONTO THE NOSE and
        // added only that, on the reasoning that a ship has one speed and it
        // points forward. True of the engine, false of the manoeuvre. On half of
        // every lunar lap the projection is negative, the raider was floored at
        // a fraction of cruise, and it shed hundreds of units a second until it
        // was adrift: measured at a gap swinging between 734 and 23,538 units,
        // inside its own firing radius under half the time, landing one shot per
        // twenty seconds instead of one per twelve and its first at t=90s. The
        // Earth-or-Moon triage in PRD 4.4 was not a hard choice, it was not a
        // choice at all, because the Moon was very nearly unattackable.
        attackSpeedFactor: 0.35,
        // THE CEILING ON A RAIDER'S TOTAL SPEED THROUGH SPACE, as a multiple of
        // cruise, borrowed velocity included. Nothing in the game reaches it:
        // the Moon's 838 plus the 420 unit circle is 1,258, cruise is 1,200, and
        // the evade sprint is 1,620. It exists so that a body given a speed no
        // raider should be able to match leaves its attackers behind honestly,
        // rather than quietly making them faster than the visitor's own 4,000.
        attackSpeedCap: 1.5,

        // TWO RADII, AND THEY ARE A HYSTERESIS BAND. Both are multiples of
        // standoff. Inside `attackRadius` a raider stops flying at its
        // installation and starts circling it. Inside the wider `holdRadius` its
        // twelve second clock runs. Outside that the clock is held at full, so a
        // long approach still banks no opening shot.
        //
        // WHY THEY DIFFER, since one number is obviously tidier and was tried. A
        // raider settles a little OUTSIDE whichever radius slows it down, so
        // whatever this is set to is roughly where the formation ends up. Tight
        // keeps the attackers in close. The clock then has to tolerate the edge
        // being crossed and recrossed, which beside a moving installation
        // happens on alternate frames, and that is what the gap between the two
        // buys. Setting them equal put the whole formation out on the clock's
        // own edge and the Moon went straight back to never being fired on.
        attackRadius: 1.15,
        holdRadius: 1.8,

        // THE PLANETS ARE SOLID FOR RAIDERS TOO. Measured with none of this in
        // place: ten of the twelve went below the surface of Earth on one run
        // and the worst reached 6,282 units inside a body with a radius of
        // 6,371. The steering was a straight line to an aim point and nothing
        // in fleet.js had ever been told the planets were there.
        //
        // `rise` is how high above a beacon a transit leg ends, in multiples of
        // standoff. One standoff puts the end of the approach exactly where the
        // attack circle already is, so a raider arrives level with its station
        // instead of diving at a point on the ground and overshooting through
        // it. That alone was worth 129 to 288 units on the near side, where
        // nothing was in the way.
        //
        // `clearance` is the daylight the steering tries to keep, and it is
        // generous on purpose: a raider turns at 0.55 radians a second, which
        // is a 2,200 unit radius at cruise, so a shell it only notices late is
        // a shell it cannot turn out of.
        //
        // `floor` is the hard stop applied after the move, the same guarantee
        // the visitor's ship gets. Deliberately much tighter than the
        // clearance, because it is a backstop rather than a plan: if it is
        // doing visible work every frame then the steering above it is wrong.
        avoid: { rise: 1.0, clearance: 900, floor: 250 },

        // FORMATION SLOTS. Every attacker on a given installation used to
        // compute the identical aim point, so four raiders converged to within
        // eight units of each other and drew as ONE light, ONE hull, and ONE HUD
        // pip. The counter said twelve and the screen showed three.
        //
        // Each ship now circles its installation at its OWN height and on its
        // own shell, in the sky above it rather than on a sphere through it:
        // half of a full sphere around a lunar installation is inside the Moon.
        //
        // A station is a bearing that LEADS the raider rather than a fixed post.
        // A ship with a turn rate and no brakes cannot sit on a post, it
        // overshoots and loops back, and one was measured swinging between 465
        // and 3,161 units of an installation it was meant to be holding station
        // on, which took it out of its own firing radius twice a lap.
        slotLead: 0.55,        // radians of bearing the station sits ahead of
                               // the raider. Bigger circles harder, smaller
                               // drifts outward. This is the shape knob.
        slotLatitude: 0.8,     // how far up toward straight overhead the
                               // highest circle sits, as a fraction of a
                               // quarter turn
        slotDepth: 0.12,       // per-ship variation in standoff, as a fraction
                               // of it, so no two ships share a shell
        // Beyond this the hull is hidden and only the running light and the
        // HUD pip remain. A 220 unit hull at 15,000 units is about ten pixels,
        // which is the point below which geometry stops paying for itself.
        lodResolveDistance: 15000,

        hullLength: 220,
        hullWidth: 150,
        hullColor: 0x7a5a4e,
        lightColor: 0xff6a4a,
        // In PIXELS: the running light never attenuates, so a raider at 200,000
        // units is the same size as one at 2,000. Slightly larger than the
        // first pass because the dot is now a soft round sprite rather than a
        // hard square, and a soft edge reads smaller than it measures.
        lightSize: 7,
        effectRadius: 170,     // how big a raider's destruction burst reads

        // WHAT A RAIDER DOES TO AN INSTALLATION, and the first number to tune
        // if the game turns out to be harder than the brief allows (PRD 4.5:
        // the visitor should win on a first honest attempt most of the time).
        //
        // Twelve seconds a shot means one raider needs 36 seconds to flatten a
        // three point installation and a pair needs 18. The trip to the Moon
        // is about 16 seconds each way, so an alert raised the moment an
        // attacker arrives leaves real time to answer it. Faster than this and
        // the Moon becomes indefensible; much slower and nothing is ever at
        // stake.
        fireInterval: 12,
        fireDamage: 1,
        beamLife: 0.45,
        beamColor: 0xff7a52,

        // Fire on the player, LIGHTLY (PRD D3). Per-ship cadence plus a
        // fleet-wide gap, so twelve raiders in one place cannot stack into a
        // wall of fire. At M5 a hit is announced and nothing more; the life it
        // costs is wired at M6 with the rest of the game state.
        playerFireInterval: 5,
        playerFireGap: 1.4,
        playerFireRange: 4200,
        playerDamage: 1,

        // BREAKING OFF. The PRD's trigger is "the player is close and holding
        // a lock". That was unreachable while a raider had ONE hit point, since
        // the frame producing a lock also produced a corpse, so this was built
        // against the wider threat cone instead: close and NEARLY lined up, so
        // the dodge happens while the shot is still being set up.
        //
        // At four hit points the PRD's own trigger is reachable again, and this
        // is deliberately NOT being moved back to it. Breaking on "nearly lined
        // up" starts the dodge while the visitor is still settling the cone,
        // which is a raider that saw it coming. Breaking on the lock itself
        // would only ever fire after the first shot had already landed, which
        // is a raider that noticed late. The first is the better opponent, and
        // it is now doing the job it was written for rather than standing in.
        //
        // THE TRIGGER DISTANCE IS THE REAL NUMBER HERE, and it is not arbitrary.
        // A dodge moves a raider a fixed lateral distance, so the angle it buys
        // shrinks with range, and past about 2,900 units a raider cannot leave
        // the six degree cone before a 1.00s kill lands. 3,000 is that crossover
        // rounded off: the boundary between a dodge that works and a dodge that
        // is theatre. `targeting.range` is now matched to it for that reason, so
        // if this moves, that has to move with it or a free-kill zone reopens
        // between the two.
        //
        // The weave has to be shallow enough that the visitor does not simply
        // lose the ship (PRD 6.3: "the satisfaction of a chase without making
        // the player miss"), and it is, but NOT because of `weaveOffset`.
        //
        // WEAVEOFFSET IS VERY NEARLY A DEAD KNOB and the comment here used to
        // claim otherwise, that 180 units swung a raider ten degrees where an
        // earlier 420 swung it twenty-four. Measured, it does no such thing. The
        // aim point is rebuilt from the ship's CURRENT heading every frame, so a
        // held offset is an integrator rather than a target: the ship turns until
        // the sine reverses, and how fast it turns is capped by its own turn
        // rate, not by the offset. Lock-break time at 2,500 units:
        //
        //     offset  20   1.067s
        //     offset  60   0.933s
        //     offset 180   0.933s   <- shipped
        //     offset 420   0.933s
        //     offset 700   0.933s
        //
        // Anything past about 60 saturates and is the same dodge. 180 is kept
        // because it is comfortably inside the flat region, but tuning the SHAPE
        // of the break-off means `duration` and `weaveRate`, and tuning its
        // REACH means `triggerDistance`. This one does nothing either way.
        evade: {
            triggerDistance: 3000,
            threatCone: 0.35,    // 20 degrees, wider than the 6 degree gun cone
            duration: 1.8,
            cooldown: 7,         // rate limited, or a raider is never killable
            speedFactor: 1.35,
            weaveRate: 2.4,
            weaveOffset: 180
        },

        // THE SHIELD, which is what makes four hit points legible.
        //
        // A raider that soaks three shots and says nothing is indistinguishable
        // from a raider being missed, and the visitor's honest reading of that
        // is that the guns are broken. The sphere is not decoration: it is the
        // only per-raider damage readout in the experience, and it has to fire
        // on every absorbed hit for that reason.
        //
        // STRENGTH IS CARRIED BY OPACITY, NOT BY HUE. A full shield lights up
        // hard and the last point barely flickers, so the flash getting weaker
        // IS the progress bar, and it is monotonic and learnable without a
        // legend. Colour was the obvious alternative and every ramp collided
        // with something already spoken for in this scene: blue is the
        // installations and the nav rings, orange and red are the raiders, the
        // beams, the alert banner and the hull wash. One colour and a varying
        // strength collides with nothing and needs no colour vision at all.
        //
        // NOT SUPPRESSED UNDER REDUCED EFFECTS, on the same reasoning the
        // hull-hit wash is not: it carries information rather than atmosphere.
        // It is also one small additive sphere that is only ever drawn in the
        // frames just after a hit, so there is nothing here worth reclaiming.
        shield: {
            // As a multiple of hull length, so the bubble grows with the ship
            // rather than needing its own absolute number. Just clear of a 220
            // unit hull with its wings.
            radiusFactor: 0.95,
            life: 0.38,            // seconds to fade from the peak to nothing
            // A cyan-white that reads as energy rather than as either side's
            // colour. See the note above about why nothing here is a ramp.
            color: 0x9fe8ff,
            // Peak opacity with the shield full, and with one point left.
            peakOpacity: 0.55,
            minOpacity: 0.18,
            // A ten segment sphere is about 180 triangles and is drawn at a few
            // dozen pixels. Anything finer is spent on nothing.
            segments: 10
        },

        // How long an installation stays flagged as under attack after the
        // last shot landed on it. Long enough to fly toward, short enough that
        // the banner is not permanently lit.
        alertLife: 10,

        // GROUP TARGETING IS WHAT MAKES THE STRATEGY EXIST (PRD 4.4). The
        // choice between Earth and the Moon only costs something if the Moon
        // is under threat early and stays under threat, so the weights lean
        // lunar in the first two groups. Weights are counts within the group:
        // { earth: 2, moon: 2 } sends two ships to each.
        groups: [
            { count: 4, startDistance: 28000, weight: { earth: 2, moon: 2 } },
            { count: 4, startDistance: 110000, weight: { earth: 1, moon: 3 } },
            { count: 4, startDistance: 200000, weight: { earth: 3, moon: 1 } }
        ]
    },

    // ---- Sound (audio.js) -------------------------------------------------
    //
    // Every sound is SYNTHESIZED, so this block is the whole of it: no files,
    // no download, no CSP exception, and nothing that can fail to load halfway
    // through a run.
    //
    // NOTHING IS CARRIED BY SOUND ALONE (PRD 8.5). Each cue duplicates
    // something already on screen and already in the live region, so a muted
    // visitor and a deaf visitor lose nothing at all. That is a rule about what
    // may be added here later, not only a description of what is here now.
    audio: {
        // Quiet by default. This plays over whatever the visitor already has
        // on, and a game that arrives loud is a game that gets muted.
        masterGain: 0.16,

        // THE ENGINE IS A LOW HUM, and it is three sine waves. Two earlier
        // versions are worth remembering. A sawtooth pair buzzed like an insect
        // on a phone: a saw carries every harmonic, a phone speaker plays almost
        // nothing under 500 Hz, so the hardware deleted the body and kept the
        // buzz. A bed of filtered noise fixed the buzz and introduced a worse
        // problem, which is that noise sweeping under a band pass sounds like
        // air rushing past a hull, and this ship is in space. A sine has one
        // partial and no hiss, so neither failure is reachable from here. The
        // long version is the comment on `buildEngine` in audio.js.
        //
        // The gain still opens from near silence, so a ship holding station in
        // orbit is a quiet hum rather than a running one.
        engineGain: 0.45,
        engineGlide: 0.35,

        // LEVEL CARRIES THE THROTTLE. The pitch moves about a fifth across the
        // range, enough to feel like effort, and no further: a sine climbing an
        // octave stops sounding like an engine and starts sounding like a siren.
        engineIdleHz: 90,
        engineFullHz: 140,

        // `engineDetune` is the whole character of the sound. The second voice
        // sits a little over half a percent sharp of the first, so the two drift
        // in and out of phase and the hum swells about twice a second. At 1.0 it
        // is a test tone. Much past 1.02 it is two notes.
        //
        // Tuning by ear: for a heavier ship lower `engineIdleHz` and
        // `engineFullHz` together. `engineOctaveGain` is the only knob that
        // changes much on a handset, since the fundamental is below what a
        // phone speaker can move.
        engineDetune: 1.006,
        engineHumGain: 0.55,
        engineBeatGain: 0.44,
        engineOctaveGain: 0.28,

        // The guns fire four times a second for as long as a target is held, so
        // this cue is deliberately dry and unremarkable. Anything with
        // character becomes unbearable inside ten seconds.
        fireGain: 0.30,
        fireHz: 220,

        hitGain: 0.34,
        destroyGain: 0.45,
        alertGain: 0.38,
        lockGain: 0.22,

        // Per cue kind. Without it a destruction landing on the same frame as
        // three hits turns the mix to gravel.
        minGapSeconds: 0.05
    },

    // ---- HUD (hud.js) -----------------------------------------------------
    hud: {
        // Live direction and distance to the two places worth going. Read
        // fresh every frame: the Moon is moving, and a cached bearing is what
        // makes an interception feel broken (PRD 5.2).
        navPoints: [
            { id: 'earth', label: 'Earth' },
            { id: 'moon', label: 'Moon' }
        ],
        // How far in from the screen edge an off-screen chevron sits, in CSS
        // pixels. Clear of a phone's rounded corners and of the notch.
        chevronInset: 52
    },

    // A soft boundary, not a wall. Nothing is out at Mars to find, so a
    // visitor who points that way and holds the throttle down gets a long look
    // and then a polite nudge home. Forward authority fades across the last
    // 15,000 units; turning and the trip back stay at full power throughout.
    perimeter: { radius: 120000, fade: 15000 },

    // YOU CANNOT FLY INTO A PLANET. This is a hard floor, applied to the
    // position every frame, so a visitor who points at Earth and holds the
    // throttle down slides to a halt 400 units above the surface and skims it.
    //
    // That is a deliberate departure from PRD 6.4, which lists flying into a
    // planet as one of the two ways to lose a life. Settled at the M6 gate:
    // the planets are the best thing in the experience and the first thing
    // anyone does is fly at one to see how big it really is. Punishing that
    // teaches a visitor not to look, which is the opposite of the whole point.
    // Enemy fire is the only way to lose a ship. The floor is the same polite
    // nudge it has been since M2, not a consequence.
    altitudeFloor: 400,

    // ---- The visitor's own survival (PRD 6.4) -----------------------------
    player: {
        lives: 3,

        // HOW MUCH FIRE A LIFE ABSORBS. PRD 6.4 says a life goes to SUSTAINED
        // enemy fire, not to a single unlucky shot, and the fleet is already
        // rate limited to about one incoming shot every 1.4 seconds across all
        // twelve raiders. Four is therefore several seconds of standing still
        // in the middle of a group, which is the only way to spend one.
        hullPoints: 4,

        // Grace after a respawn, so a visitor is not killed again by whatever
        // they respawned next to before they have their bearings.
        respawnInvulnerable: 2,

        // How long the wreck hangs before the ship is put back, and the length
        // of the replay that now fills it. ONE NUMBER FOR BOTH, so the camera
        // cannot still be orbiting a cloud the ship has already been put back
        // into. Up from 1.4, which was as long as an empty pause is worth and
        // is not long enough to watch anything.
        respawnDelay: 2.2
    },

    // ---- The destruction replays (replay.js) -------------------------------
    //
    // TWO SHOTS, AND THEY DIFFER IN WHAT THEY TAKE FROM THE VISITOR. The ship
    // shot takes the camera, which costs nothing because the flight model is
    // already frozen for the wreck. The installation shot takes nothing at all:
    // it is a window in the corner, drawn from a second camera while the
    // visitor keeps flying, because an installation falls at a moment they did
    // nothing wrong and can be under fire.
    //
    // THE DISTANCES ARE SET BY THE BURST, not by taste. A burst throws its
    // particles at `weapons.burstSpeed` for `weapons.burstLife`, which is 900
    // for 0.9 seconds, so the cloud reaches between 284 and 810 units. A camera
    // any closer than that is INSIDE the explosion rather than watching it, and
    // the world camera's near plane of 100 would be eating the near half of the
    // cloud as well. Both shots therefore open outside the slow half and pull
    // back past the fast half.
    replay: {
        // The visitor's own ship. Starts behind, which is continuous with the
        // view they just lost, and swings about 49 degrees.
        shipSeconds: 2.2,
        shipStartDistance: 420,
        shipEndDistance: 900,
        shipRise: 0.3,          // radians above the level, so there is a sky
        shipSwing: 0.85,
        // `spawnDestruction`'s radius scales the PARTICLE SIZE rather than how
        // far they fly, which is worth knowing before tuning it: 520 against
        // the 200 unit base is a burst of chunks two and a half times the size
        // of a raider's, in the same volume.
        shipBurstRadius: 520,

        // An installation, in the corner window. Further out than the ship
        // shot, because a structure is anchored to a planet and the shot wants
        // the ground under it in frame.
        insetSeconds: 2.6,
        insetStartDistance: 700,
        insetEndDistance: 1200,
        insetRise: 0.3,
        insetSwing: 0.55,
        insetFov: 55,
        insetNear: 10,          // a close-up, so it can afford a nearer plane
        insetFar: 500000,
        // Installations had NO burst at all until this: a destroyed one swapped
        // to a wreck material and tilted, which is a fine wreck and not an
        // explosion. Larger than a raider's 170, since a building is not a ship.
        structureBurstRadius: 420,

        // ONE BURST IS OVER BEFORE THE SHOT IS. It lives 0.9 seconds and the
        // shots run 2.2 and 2.6, so a single detonation would leave the camera
        // pulling back off an empty patch of space for more than half the time
        // it is on screen. These are secondary detonations around the wreck:
        // `at` is seconds into the shot, `scale` multiplies the burst size, and
        // `offset` is how far from the centre they go off.
        //
        // The directions are FIXED rather than random, like the fleet's
        // formation scatter, so a death looks the same every time it is
        // watched and the whole sequence stays assertable.
        aftershocks: [
            { at: 0.55, scale: 0.65, offset: 190 },
            { at: 1.15, scale: 0.45, offset: 330 }
        ]
    },

    // ---- How a run opens (intro.js) ---------------------------------------
    //
    // THE OPENING FRAME USED TO ARRIVE WITHOUT ITS FIRST HALF. A visitor landed
    // on the welcome overlay already sitting 8,500 units over Earth, with a line
    // of hostile lights trailing away toward a small red disc, and nothing on
    // the page had told them what that line was. This is the missing story: the
    // same fleet, at Mars, closing up into formation, and then the camera runs
    // the approach line back to Earth ahead of them.
    //
    // IT IS THE REAL FLEET'S OWN START LINE, and that is the correction this
    // block is currently carrying. The shot used to hang an invented formation
    // in front of Mars, because that framed well, and the actual raiders stood
    // 3.4 degrees to the right of the disc where nobody had staged anything. So
    // a visitor watched a wedge close up dead centre on Mars, the camera pulled
    // back, and the hostile diamonds lit up a couple of Mars diameters to the
    // right of where the wedge had just been. Nothing was wrong in either half;
    // they were simply not the same fleet. The squadron here now forms up ON the
    // trailing group's start point, `range` in front of it down its own flight
    // line, so the last frame of the shot puts the wedge where the diamonds are
    // about to appear, to within a third of a degree.
    //
    // IT ARRIVES, IT DOES NOT CUT. The last frame of this shot IS the spawn
    // frame. The path ends at `spawnPosition(config)` looking 1,000 units down
    // -Z, which is `placeCameraAtSpawn` word for word, so the welcome overlay
    // comes up over a view that is already the one the visitor is about to fly
    // from. That is the same trick the wreck ending plays at the other end of a
    // run, and it works here for the same reason.
    //
    // THE CAMERA NEVER TURNS AROUND, and the geometry below is arranged so that
    // it does not have to. This was the one real design trap in the shot, and
    // the first draft fell in it: the obvious staging is to stand between Mars
    // and Earth looking back at Mars, which then needs a 180 degree whip to run
    // at Earth, thrown at a visitor who has been on the page for four hundred
    // milliseconds. But the spawn camera LOOKS DOWN THE APPROACH LINE, and so
    // does this one. The shot starts just ahead of the fleet's start point,
    // already facing back along the line the raiders are flying, and then simply
    // retreats down it. One long pull-back with 15 degrees of settle in it. Mars
    // shrinks from a 27 degree disc to the 1.8 degree one the spawn frame has,
    // the formation shrinks with it into the line of lights the spawn frame has
    // always shown, and Earth's limb rises into the bottom of the frame on the
    // last beat. The opening frame is not cut to, it is assembled.
    //
    // MARS IS NOT AN INPUT TO ANY OF IT, which is worth saying because it used
    // to be all of it. The camera is placed from the fleet's own start point and
    // heading; Mars is simply 10,000 units behind that point and fills the
    // frame, which is a property MARS_DISTANCE owns and the intro suite checks.
    //
    // THE PATH IS CHECKED AGAINST THE PLANETS IN TESTS, not by eye. It only ever
    // moves away from Mars, it passes about 880 units above Earth's surface as
    // it settles over the pole, and it clears the Moon by about 14,000.
    // `tests/earthdefense-intro.test.mjs` samples the whole path against all
    // three bodies and fails if `clearance` is broken, because a plausible
    // looking retune of any number in this block could quietly put the camera
    // inside a planet.
    //
    // NO STARS STREAK, written down so nobody goes looking for the bug.
    // `space-1.0.0` parents the starfield to the camera every frame, on purpose,
    // so the sky is at infinity for a scene 200,000 units across. The pull-back
    // therefore reads entirely through Mars receding and Earth arriving, which
    // is honest at this scale: real stars would not streak here either.
    // Detaching the field would buy streaks and cost a visible snap when the
    // normal loop re-centres it on arrival.
    //
    // IT IS SILENT, and that is the browser's ruling rather than ours. This
    // plays before the visitor has clicked anything, so there is no gesture and
    // `initAudio` has deliberately not built a context yet.
    intro: {
        // Once per page load. A restart returns to the briefing and does NOT
        // replay this: the story has been told, and a second telling is a toll.
        seconds: 5.2,
        // How the 5.2 divides, and they partition it exactly. The form-up owns
        // the larger share and the pull-back gets the rest.
        //
        // THIS IS THE FIRST NUMBER TO TUNE. Steve chose five seconds against a
        // timeline that had been drawn for eight, so the form-up is the beat
        // that paid for the difference. If the squadron looks like it is
        // hurrying, this is why, and `seconds` and `formSeconds` move together.
        formSeconds: 3.1,
        runSeconds: 2.1,
        // The turn leads the move, so the camera is already facing where it is
        // going rather than being dragged round after it has set off.
        lookLead: 0.35,

        // ---- The camera -----------------------------------------------------
        //
        // THE CAMERA STANDS ON THE FLEET'S OWN FLIGHT LINE, `range` ahead of the
        // trailing group's start point, facing back down it. That single
        // sentence is the whole staging, and every number under it is a small
        // adjustment to it rather than a placement of its own. There is no
        // "which way round Mars" any more: the fleet's start point and heading
        // decide where the camera goes, and Mars is behind it because
        // MARS_DISTANCE puts it there.
        //
        // BEING ON THE LINE IS NOT A TASTE DECISION, IT IS THE COMPOSITION. A
        // formation has depth (four ranks of `slot.depth`, plus up to
        // `scatter.depth` of it before the ships close up), and depth seen from
        // off-axis projects sideways across the frame. An early draft stood 32
        // degrees off and the finished V was a sheared diagonal smeared over 20
        // degrees with its two columns bunched at opposite ends. A later one
        // stood on the Mars-to-fleet line instead, which is only 12 degrees off,
        // and still pulled the two columns 93 percent out of balance. On the
        // flight line itself the pairs land symmetrically either side of the
        // leader, and the only shear left is the 2.2 degrees of `swing`.
        //
        // Mars's angular RADIUS at the opening is asin(3390 / 14,560) = 13.5
        // degrees against a 35 degree half frame, so the disc covers about 38
        // percent of the frame height and eight of the nine raiders are
        // silhouetted on it. Against the 1.8 degrees it has in the spawn frame,
        // that is unmistakably a close-up.
        //
        // How far ahead of the fleet's start point the camera stands. Also a
        // CLEARANCE BUDGET: the squadron's deepest ship opens a further
        // `slot.depth * 4 + scatter.depth` back toward the planet, and measured,
        // the nearest any raider comes to Mars's surface over the whole form-up
        // is 1,878. Lengthening this without shortening those parks raiders
        // inside Mars.
        range: 4600,
        // How far the camera is lifted off the flight line, in radians, so the
        // shot looks DOWN on the formation rather than meeting it edge on. At
        // 0.26 that is 15 degrees, which is enough to open the V out and to put
        // the disc under it. It costs nothing in symmetry, because a lift is
        // vertical and the shear that matters is horizontal: it moves the
        // squadron's depth into screen-Y, where the wedge is laid out to have
        // some anyway.
        elevation: 0.26,
        // How far the camera drifts round the formation over the shot, so the
        // opening is a held shot with a little life in it rather than a
        // photograph. SMALL, because this is the one thing here that IS
        // horizontal: at the end of the form-up it has reached 2.2 degrees off
        // the flight line, which is the whole of the 0.11 shear the intro suite
        // measures against a bound of 0.2. It orbits the FORMATION now rather
        // than Mars, so it no longer walks the squadron out of the frame the way
        // it did when this had to be kept under 0.06 for that reason instead.
        swing: 0.06,
        // How close the path may come to any body's SURFACE, in units. The
        // assertion, not the result. Measured: Earth 882, Mars 11,000, Moon
        // 14,000.
        clearance: 600,

        // ---- The squadron ---------------------------------------------------
        //
        // IN THE REAL FLEET'S PLACE, BUT NOT THE REAL FLEET, and the difference
        // between those two is the one thing in this block worth being careful
        // with. The squadron forms up ON the trailing group's start point and
        // ship zero lands exactly on it, so the last frame of the shot stands
        // nine hulls where four raiders are about to be marked. But it is not
        // those raiders. The twelve are already built and already standing on
        // their start line, and those positions are load bearing: arrival times
        // are read straight off them and the init suite asserts the opening
        // frame against them. Flying them to Mars and putting them back with
        // `resetFleet` would mean a visible snap on the exact frame the camera
        // is watching them on. So the intro owns nine throwaway hulls, built
        // through `createRaiderMesh` from fleet.js's own shared geometry so a
        // raider keeps one definition, and the real fleet is simply hidden for
        // five seconds. At arrival the throwaways are 200,000 units behind the
        // camera and smaller than a pixel, so disposing them is invisible.
        ships: 9,
        reducedShips: 5,
        // The wedge, in the formation's own axes. Ship zero is the apex and
        // every ship after it is one of a pair, so nine ships is a leader and
        // four ranks.
        //
        // THE WHOLE SQUADRON IS SET BY A PORTRAIT PHONE, like the Moon's orbit
        // phase above it. Three.js field of view is vertical, so a 9:21 phone
        // sees only about 16.7 degrees either side of the nose, and the measured
        // worst case across the entire form-up is 8.9. That was 15.4 while the
        // camera stood off the flight line to frame Mars; standing on the line
        // handed most of the budget back, and the intro suite still asserts the
        // 16.7 because widening the wedge or scattering it further sideways can
        // spend it again.
        slot: { lateral: 230, depth: 320, vertical: 85 },
        // Where each ship starts before it closes up, in the same axes.
        //
        // WEIGHTED HEAVILY INTO DEPTH, and `depth` is always applied BEHIND the
        // formation. Ships strung out along the line of flight converging
        // forward is what reads as forming up; a ship that started in front
        // would have to reverse into its slot. Depth is also the cheap axis
        // here: the camera stands on that line, so a ship scattered along it
        // moves toward the middle of the frame rather than toward its edge,
        // which is why this can be 2,400 while `lateral` is 380.
        //
        // IT IS BOUNDED BY MARS. `depth` runs backwards from a formation that is
        // now only 10,000 units in front of the planet, so this plus
        // `slot.depth * 4` is what stands between the deepest opening raider and
        // the surface. At 2,400 that raider opens 1,878 units clear of it.
        // Deterministic, from `hashUnit`, exactly like the real fleet's scatter.
        scatter: { lateral: 380, vertical: 520, depth: 2400 },
        // How far off its final heading a ship starts pointing, 0 to 1. Enough
        // that the noses visibly come round, short of ships flying backwards.
        headingScatter: 0.9,
        // The fraction of the form-up any one ship spends moving; the rest is
        // its stagger. Nine ships easing over the same three seconds reads as a
        // swarm settling. Nine arriving in sequence reads as a formation being
        // made, and the last one lands exactly as the form-up ends.
        shipTravel: 0.55,
        // The formation is under way for the whole shot, so it never settles
        // into a photograph. 320 units a second closes about 1,000 of the 4,600
        // over the form-up, which is a quarter again in apparent size: plainly
        // an approach, and nowhere near swallowing the frame.
        //
        // IT IS RUN BACKWARDS FROM THE ARRIVAL, not forwards from the opening.
        // The formation STARTS `driftSpeed * seconds` behind the trailing
        // group's start point so that it ENDS on it, because the frame that has
        // to be exact is the last one: that is where the wedge hands over to the
        // hostile markers. Raising this therefore moves the opening back toward
        // Mars rather than moving the arrival forward, which is the direction
        // `scatter.depth`'s clearance budget is measured in.
        driftSpeed: 320
    },

    // ---- How a run ends (finale.js) ---------------------------------------
    //
    // THE CARD IS NOT THE ENDING, it is the receipt. A run that has been flown
    // for six or eight minutes deserves a shot before the numbers, and the end
    // of a run is the one moment where taking the camera costs the visitor
    // nothing: there is no ship left to fly and no decision left to take away.
    // That is exactly the argument the installation replay lost, which is why
    // that one is a corner window and these are not.
    //
    // THE FRAMING IS SOLVED, NOT TASTED. The world camera is 70 degrees, so a
    // subject at distance d fills `atan(r / d) / 35 degrees` of the half frame.
    // Earth's 6,371 at 15,000 is 23 degrees against 35, which is 66 percent of
    // the half height, so the globe covers about two thirds of the frame and
    // leaves sky above the limb for the shells to bloom in. Closer than about
    // 12,000 and the limb runs off both edges and the shot stops reading as a
    // planet.
    //
    // A SPARK IS SIZED IN WORLD UNITS. At 15,000 units one unit is 900 / (2 *
    // 15000 * tan 35) = 0.043 pixels on a 900 pixel frame, so the 220 unit
    // points below are about 9 pixels each and a shell that throws them 990
    // units is roughly 85 pixels across: a tenth of the globe beside it, which
    // is a firework rather than a smudge or a second explosion.
    //
    // THE HEIGHTS ARE NOT PHYSICAL and are not meant to be. A shell that rises
    // 670 units above the surface has climbed 670 km, which is nonsense as
    // pyrotechnics and is the only way a launch is legible from a camera far
    // enough back to see the planet it is launched from. The whole scene is
    // already at that scale: a raider is hundreds of units across.
    finale: {
        // HOW LONG THE RUN'S LAST EXPLOSION GETS TO ITSELF, before any of the
        // three shots is allowed to take the camera.
        //
        // A RUN ENDS ON A DESTRUCTION, ALWAYS: the last raider, the last
        // installation, or the visitor's own ship. Every one of those spawns a
        // `weapons.burstLife` cloud at the moment the state machine flips, and
        // the two losses already had somewhere for it to play, because a
        // destruction replay stands between them and the ending: 2.2 seconds
        // over the wreck, 2.6 in the corner window. The WIN had nothing. The
        // fireworks opened on the same frame as the kill, 15,000 units away
        // over Earth, and the explosion the whole run was aimed at was thrown
        // away in the cut. Steve reported it as the ending feeling disjointed,
        // which is exactly what it was: a cut over an unfinished action.
        //
        // MATCHED TO `weapons.burstLife`, so the cloud finishes rather than
        // nearly finishing. The intro suite's opposite number in the main suite
        // asserts the two agree, so shortening the burst does not silently
        // leave a beat of dead air and lengthening it does not silently go back
        // to cutting away early.
        //
        // IT IS A MINIMUM, NOT AN ADDITION. The clock starts when the run ends
        // and runs alongside whatever else is happening, so the two losses are
        // untouched: their replays are twice as long and were always going to
        // outlast it. This only ever bites on the win.
        beat: 0.9,

        // One pool for all three shots, since only one ever runs. Sized for
        // the win, which is the busiest: four shells in the air at 34 sparks
        // plus their launch trails is a little over 200 live at a peak, and
        // the headroom covers the overlap when the cadence tightens.
        flarePool: 520,
        // The reduced-effects draw range, in the same spirit as the starfield
        // and the burst pools: built once at full size, partly used. Reduced
        // MOTION skips the finale entirely, so this is only reached by a
        // visitor who ticked the box for frame rate rather than for comfort.
        reducedPool: 180,

        // Fireworks over the hemisphere the installations are on. The camera
        // pulls back a sixth over the shot, which is what says a camera is
        // there rather than a picture being played.
        won: {
            seconds: 5.6,
            startDistance: 15000,
            endDistance: 17500,
            rise: 0.12,         // radians above the sites, so the limb is under them
            swing: 0.20,        // about 11 degrees of orbit, a drift not a sweep
            // A shell every 0.42 seconds from four sites in turn, so each site
            // gets a second and a half to clear before its next one.
            shellEvery: 0.42,
            riseSeconds: 0.8,
            liftSpeed: 1200,    // straight up from the surface
            liftTrail: 5,       // points in the climbing streak
            gravity: 900,       // pulls the climb over and the sparks down
            sparks: 34,
            sparkSpeed: 900,
            sparkLife: 1.6,
            sparkDrag: 0.5,
            size: 220,
            // Warm, cold, warm, cold. Four colours cycling against four sites
            // would give every site the same colour every time, so the list is
            // deliberately a different length from the site list.
            colours: [0xfff2cf, 0x9fd4ff, 0xffc48a, 0xd6b4ff, 0xbdffd0],
            wash: 'finale-won'
        },

        // The same vantage, the opposite content. No launches, no bloom: four
        // slow fires where the installations were, and a red wash. The shot is
        // shorter than the win on purpose, because there is nothing to wait
        // for and holding on it would read as a stall rather than as grief.
        lostLine: {
            seconds: 4.4,
            startDistance: 15000,
            endDistance: 16200,
            rise: 0.12,
            swing: 0.14,
            shellEvery: 0.5,
            riseSeconds: 0,     // no climb: an ember starts where the fire is
            liftSpeed: 0,
            liftTrail: 0,
            gravity: 40,        // barely any, so the smoke hangs
            sparks: 14,
            sparkSpeed: 150,
            sparkLife: 2.6,
            sparkDrag: 0.9,     // heavy, so they stall close to the ground
            size: 300,
            colours: [0xff5a2a, 0xc2331a, 0xff7a3c, 0x8a2b18],
            wash: 'finale-lost'
        },

        // The visitor's own wreck, continuing straight out of the replay that
        // was already orbiting it. NO CUT: the replay ends at
        // `replay.shipEndDistance` and this opens there, so the two are one
        // move. Cold, slow, and it keeps going long after the debris stops
        // being anything.
        lostShip: {
            seconds: 3.8,
            startDistance: 900, // replay.shipEndDistance, deliberately equal
            endDistance: 4200,
            rise: 0.3,          // replay.shipRise, for the same reason
            swing: 0.5,
            shellEvery: 0.85,
            riseSeconds: 0,
            liftSpeed: 0,
            liftTrail: 0,
            gravity: 0,         // it is a vacuum and there is nothing to fall to
            sparks: 10,
            sparkSpeed: 120,
            sparkLife: 3.2,
            sparkDrag: 0.15,
            size: 190,
            colours: [0x9fb6d8, 0x6d8099, 0xc8d6e8],
            wash: 'finale-lost'
        }
    },

    // ---- Boot and site ----------------------------------------------------
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    site: {
        // THE ONE EXPERIENCE WITH NO HONOREE. The key stays so this file is
        // still a working template for the next one, and so the directory card
        // has a line to print, but the value is what this is FOR rather than
        // who it is for. See the note at the top of this file for the three
        // dedications that were written and discarded before that landed.
        honoree: {
            label: null,
            line: 'Built for the joy of flying through space'
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
        muted: 'scenexp.earthdefense.muted',
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
