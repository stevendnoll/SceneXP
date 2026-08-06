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
        hitPoints: 1,          // one shot, one raider (PRD 6.3)
        cruiseSpeed: 1200,     // comfortably slower than the player's 4,000

        // THE APPROACH LINE IS TILTED OFF THE MARS AXIS ON PURPOSE. Mars sits
        // exactly at (0, 0, -200,000) and the trailing group starts 200,000
        // units out, so an untilted line would place four ships inside the
        // planet. A few hundredths of a radian is enough: at that range this
        // puts the fleet about 4 degrees off Mars's centre, just outside its
        // 1.9 degree disc, so the line still reads as coming FROM Mars while
        // no raider is ever buried in it.
        approach: { azimuth: 0.06, elevation: 0.05 },

        // Per-ship scatter around the group's start point, so a group reads as
        // a formation rather than as a queue. Deterministic (a hash of the
        // ship index, not Math.random), so the opening frame is the same every
        // visit and the arrival times stay testable.
        spread: { lateral: 2400, vertical: 1600, depth: 3200 },

        turnRate: 0.55,        // radians/second: about a 2,200 unit turn radius
        standoff: 1200,        // how far off a structure an attacker holds
        attackSpeedFactor: 0.35,
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
        // a lock", which cannot happen: a raider has one hit point, so the
        // frame that produces a lock also produces a corpse. The trigger that
        // preserves the intent is being close and NEARLY lined up, so the
        // dodge happens while the shot is still being set up.
        //
        // The weave has to be shallow enough that the visitor does not simply
        // lose the ship (PRD 6.3: "the satisfaction of a chase without making
        // the player miss"). 180 units of lateral aim offset moves a raider
        // about ten degrees off the line it would otherwise have flown, which
        // is more than the six degree gun cone (so the lock really does break)
        // and well under the twenty degree threat cone (so the ship is still
        // right there when the visitor looks for it). The first draft used 420
        // and swung it twenty-four degrees, which is a raider getting away
        // rather than a raider dodging.
        evade: {
            triggerDistance: 3000,
            threatCone: 0.35,    // 20 degrees, wider than the 6 degree gun cone
            duration: 1.8,
            cooldown: 7,         // rate limited, or a raider is never killable
            speedFactor: 1.35,
            weaveRate: 2.4,
            weaveOffset: 180
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

        // The engine: a low sawtooth with a sine an octave under it. It opens
        // from silence with the throttle, so a ship holding station in orbit is
        // genuinely silent rather than idling.
        engineGain: 0.5,
        engineIdleHz: 46,
        engineFullHz: 128,
        engineGlide: 0.35,

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

        // How long the wreck hangs before the ship is put back. Long enough to
        // register what happened, short enough not to be a punishment.
        respawnDelay: 1.4
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
