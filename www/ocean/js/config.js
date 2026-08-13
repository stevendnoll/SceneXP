// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * config.js - The Ocean experience configuration.
 *
 * One plain object holding every per-experience knob, following the same
 * pattern as the other experiences: final literal values, deep frozen, nothing
 * mutated at runtime.
 *
 * THIS EXPERIENCE HAS NO HONOREE, like Earth Defense before it. It exists to
 * find out whether a scene with no controls at all can hold someone's
 * attention, which is a question worth answering on its own.
 *
 * IT IS THE FIRST AMBIENT SCENE. The three interaction models in
 * CONTRIBUTING.md all hand the visitor something to do, even the Mandelbrot
 * dive, which offers play, direction, speed, and reset. This one hands over
 * nothing. Past the welcome screen there is a sea, a sky, and a mute button,
 * and the sea never resolves and never repeats exactly. That constraint is the
 * design rather than a gap in it, so anything added here has to earn its place
 * against it.
 *
 * THE CAMERA NEVER MOVES. It sits about a metre above wet sand, level with the
 * horizon, and holds that frame for as long as the tab is open. No bob, no
 * drift, no sway. A fixed horizon is the strongest protection against motion
 * sickness there is, and it means every visitor can stay as long as they like.
 * The consequence is that ALL of the motion has to come from the water, which
 * is why the sets and the tide below are not decoration.
 *
 * THE SOUND, THE BEACH, AND THE WATER ARE REAL. The sky and the day cycle are
 * still to come, and the sand section is written but only half consumed. Their
 * sections are sketched here so the shape of the finished config is visible
 * while it is still cheap to change.
 *
 * THE MOST IMPORTANT NUMBER IN THE FILE IS `beach.slope`. Nothing decides where
 * waves break: they break where their height passes a fraction of the local
 * depth, so the slope sets the depth and the depth sets the break line. If the
 * surf is in the wrong place, that is the number to move, and everything else
 * follows it.
 */

function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((name) => {
        const value = obj[name];
        if (value && typeof value === 'object') deepFreeze(value);
    });
    return Object.freeze(obj);
}

export const OCEAN_CONFIG = deepFreeze({
    // ---- Sound (audio.js) ---------------------------------------------------
    //
    // EVERY SOUND IS SYNTHESIZED. No audio file ships with this experience.
    // A recording of surf would be the easy path and it is the wrong one here:
    // a loop of real surf is recognizably a loop within about two passes, which
    // is fatal in a scene built to be left running. Noise through filters never
    // repeats, costs nothing to download, and needs no CSP exception.
    //
    // A PHONE SPEAKER IS THE HARD CASE and it decides the whole mix. A phone
    // reproduces very little below roughly 500 Hz, so the deep rumble of surf,
    // which is most of its power in the real world, is a sound only someone on
    // real speakers will hear. What survives a phone is the HISS: the foam
    // sheet running up the sand, up around 2 kHz. That is also, conveniently,
    // the part people actually identify as a beach. So the wash carries the
    // scene and the rumble is a bonus for anyone on headphones.
    audio: {
        masterGain: 0.5,
        // The sea arrives rather than switching on. Long enough to feel like a
        // fade in from nothing, short enough that nobody wonders if it works.
        fadeInSeconds: 2.5,
        fadeOutSeconds: 0.6,

        // ---- The bed: three continuous layers under everything -------------
        // Filtered loops of one shared noise buffer. On their own they are a
        // flat shhhh, which is exactly what they should be: the bed is the
        // room, and the breaks below are the events in it.
        bed: {
            // The body of the sea. Mostly felt rather than heard, and mostly
            // absent on a phone (see above).
            swellHz: 190,
            swellGain: 0.16,
            // The middle distance: water working beyond the break line.
            washHz: 620,
            washQ: 0.7,
            washGain: 0.10,
            // Wind over open water. Rises and falls on a slow cycle of its own,
            // which is most of what keeps the bed from sounding like a hiss
            // generator left switched on.
            windHz: 2200,
            windGain: 0.035,
            windPeriodSeconds: 47
        },

        // ---- One breaking wave: crash, then wash, then drag ----------------
        // THE THREE STAGE SHAPE IS THE WHOLE TRICK. A single noise burst reads
        // as static. The same noise split into a collapse, a long run up, and a
        // retreat reads unmistakably as a wave, because that is the order the
        // ear expects and the gaps between them are what give the scene its
        // pulse. Timings are in seconds from the start of the break.
        breaks: {
            // The collapse. Broadband, hit hard, and the filter falls fast:
            // a bright crack that turns into a thud, which is what a wave
            // toppling actually sounds like.
            crashAt: 0,
            crashSeconds: 0.75,
            crashFromHz: 3200,
            crashToHz: 260,
            crashGain: 0.34,

            // The foam sheet racing up the sand. THE LONGEST AND MOST
            // IMPORTANT of the three, and the one that survives a phone
            // speaker. It swells in rather than starting at full, because the
            // sheet takes a moment to spread.
            washAt: 0.22,
            washSeconds: 3.4,
            washAttack: 0.85,
            washFromHz: 2600,
            washToHz: 1500,
            washQ: 0.55,
            washGain: 0.30,

            // Water pulling back over wet sand. Quiet, lower, and easy to miss
            // on purpose: it is the sound of the beach being empty again, and
            // it sets up the silence before the next one.
            dragAt: 2.1,
            dragSeconds: 1.7,
            dragFromHz: 640,
            dragToHz: 360,
            dragGain: 0.12,

            // Bigger waves are brighter as well as louder, so strength moves
            // the filters too rather than just the gain. Without this a large
            // wave is a small wave with the volume up, which fools nobody.
            brightnessRange: 0.45
        },

        // ---- Which wave breaks when ----------------------------------------
        // Until the water simulation exists, the audio schedules its own waves
        // so the beach can be heard. Once the water lands it drives `playBreak`
        // directly from the visual break and this scheduler switches off, which
        // is the point of keeping the two separable: the crash you hear will be
        // the wave you watched, not a timer that happens to run alongside it.
        schedule: {
            minGapSeconds: 4.5,
            maxGapSeconds: 9.5,
            // SETS ARE REAL AND THEY MATTER HERE. Waves arrive in groups of a
            // few large ones followed by a lull, and that pattern is what makes
            // watching the sea feel like anticipation rather than wallpaper.
            // Two periods that do not divide evenly multiply into a rhythm that
            // takes minutes to come back around, borrowed from the river in
            // www/dad, which uses the same trick at a much faster tempo.
            setPeriodSeconds: 61,
            setSubPeriodSeconds: 23,
            setDepth: 0.42,
            baseStrength: 0.55,
            // Small inners between the big ones, so the beach is never truly
            // silent and the breaks overlap the way real ones do.
            innerChance: 0.45,
            innerStrength: 0.3,
            // How wide across the front the breaks are placed. Large waves are
            // pulled toward the centre, since those are the ones in front of
            // the camera.
            spread: 0.75
        }
    },

    // ---- The camera ---------------------------------------------------------
    // Sat on the wet sand at the top of the run up, looking straight out to sea.
    // It never moves. Metres, and -Z is out to sea, so distance from shore is
    // (shoreZ - z) and gets larger the further out you look.
    camera: {
        height: 1.15,
        z: 8,
        fov: 62,
        // Dead level. A pitch of even a degree or two puts the horizon off
        // centre and starts the frame feeling like a shot from something that
        // might move, which is the opposite of what this scene promises.
        pitch: 0
    },

    // ---- The beach ----------------------------------------------------------
    // The seabed profile is the most important set of numbers in the scene. It
    // decides where waves feel the bottom, where they steepen, and where they
    // break, because every one of those follows from the local depth rather
    // than from a timer. Move the slope and the whole break line moves with it.
    beach: {
        shoreZ: 6,          // the still-water line, in front of the camera
        // THIS ONE NUMBER PLACES THE SURF. Nothing in water.js decides where
        // waves break: they break where their height passes 0.78 of the local
        // depth, so the slope decides the depth and the depth decides the line.
        // A 0.62 metre swell needs about 1.6 metres of water to stand up in,
        // and 1.6 metres at 1:12 lands the break a little under 20 metres out,
        // which is the shot we chose.
        //
        // It is steep for a beach, and deliberately. A gentle 1:33 shore is a
        // DISSIPATIVE beach: the same swell breaks 55 metres out and spills
        // slowly the whole way in, which is a lovely thing to stand in and a
        // terrible thing to photograph from the sand, because the surf is a
        // white line near the horizon. Steep beaches give a SHOREBREAK, waves
        // that stand up late and collapse close in, which is the one that fills
        // a frame. Raise this and the surf comes to meet the camera; lower it
        // and the surf retreats toward the horizon.
        slope: 0.072,       // metres of depth per metre out to sea, about 1:14
        // Deep enough that the longest component is genuinely in deep water out
        // there rather than already half shoaled. At 6.5 metres a 62 metre swell
        // is feeling the bottom before it is anywhere near the camera, so it
        // arrives pre-flattened and has almost nothing left to do on the way in.
        maxDepth: 11,       // past here the profile flattens into deep water
        nearZ: 14,          // the plane starts behind the camera
        farZ: -420,         // and runs to the horizon
        nearHalfWidth: 26,  // a trapezoid rather than a rectangle, so vertices
        farHalfWidth: 300   // are spent where the camera can actually see them
    },

    // ---- The water (water.js) -----------------------------------------------
    water: {
        // Grid resolution. Rows are packed toward the camera on a power curve,
        // because a fixed camera means the near water is on screen at a hundred
        // times the size of the far water and deserves the vertices.
        rows: 190,
        cols: 150,
        rowBias: 2.35,      // higher packs more rows into the near field
        // Half of the above on a phone. Checked once at startup rather than
        // watched, since the camera never moves and neither does the framing.
        mobileScale: 0.55,

        // FOUR GERSTNER WAVES, NOT ONE. A single sine is instantly readable as
        // a sine. Four at wavelengths that do not divide evenly into each other
        // never quite repeat, which is most of what separates a sea from a
        // corrugated roof. Steepness is the Gerstner Q: it sharpens crests and
        // flattens troughs, and it is the reason this looks like water rather
        // than a bedsheet.
        //
        // Direction is in XZ and gets bent toward straight-on as the water
        // shallows, which is real: waves refract to arrive parallel to the
        // beach. It also means the break line lands square to the camera
        // however the swell is angled out at sea.
        waves: [
            { length: 62, amplitude: 0.62, steepness: 0.82, speed: 1.00, dirX: 0.16 },
            { length: 41, amplitude: 0.38, steepness: 0.74, speed: 1.12, dirX: -0.28 },
            { length: 23, amplitude: 0.19, steepness: 0.62, speed: 1.26, dirX: 0.42 },
            { length: 13, amplitude: 0.09, steepness: 0.48, speed: 1.40, dirX: -0.55 }
        ],

        // Shoaling and breaking. A wave feels the bottom at approximately half
        // its wavelength, grows as the depth drops, and breaks when its height
        // passes roughly 0.78 of the depth it is standing in. That ratio is the
        // McCowan criterion and it is doing real work here: it is why the break
        // line sits where it does without anybody placing it.
        breakRatio: 0.78,
        breakSoftness: 0.30,   // how abruptly the collapse happens
        shoalGain: 0.90,       // how much a wave grows as it shallows
        leanGain: 1.35,        // extra Gerstner Q approaching the break, the
                               // forward-cusping crest that reads as pitching

        // Foam. THE PART THAT SELLS IT, more than the wave shape does.
        foamBreakThreshold: 0.34,
        foamCrestThreshold: 0.62,
        foamPersistence: 0.55,  // how far shoreward whitewater survives
        foamNoiseScale: 0.85,
        foamDriftSpeed: 0.35,

        // THE FOAM HAS TO COME AND GO, which is a separate problem from where it
        // appears. Depth alone says the whole inner zone is breaking, and it is,
        // so foam driven by depth alone paints a permanent white carpet from the
        // break line to the sand. Real whitewater arrives with a wave, runs up,
        // and drains away, and the few seconds of clear water before the next
        // one is what makes the arrival feel like an event.
        //
        // So the depth answer is multiplied by a pulse that travels with the
        // crest of the longest wave. `foamLag` is how far behind the crest the
        // sheet sits, in radians, and `foamTrail` is how tightly the pulse is
        // drawn in: higher is a narrower band and more clear water between.
        foamLag: 2.2,
        foamTrail: 2.5,

        // Colour. Deep water is not blue so much as dark and slightly green,
        // and the shallow edge picks up the sand under it. Both are lit by the
        // scene, so these read as the water's own tint rather than its final
        // colour.
        deepColor: 0x0d3a4a,
        shallowColor: 0x2f7f86,
        foamColor: 0xeaf4f6,
        opacityNear: 0.82,      // thin water over sand shows the sand

        // The tide moves the whole waterline slowly up and down the beach. A
        // full cycle is deliberately longer than the day cycle so the two never
        // line up into a pattern anyone can hear coming.
        tideRange: 0.55,
        tidePeriodSeconds: 560,

        // SETS, THE VISUAL HALF. The audio schedule above already groups its
        // breaks into sets. This is the same idea applied to the water: a slow
        // envelope on each wave component's amplitude, so a run of large waves
        // breaks further out and the whole break line moves seaward for half a
        // minute before easing back. Different periods from the audio's 61 and
        // 23, because the two are about to be wired together and matching
        // periods would beat against each other in a way nobody chose.
        setPeriodSeconds: 74,
        setSubPeriodSeconds: 29,
        setDepth: 0.45,

        // How often the per-row profile is rebuilt on the CPU, in hertz. The
        // profile only changes as the tide and the set envelope move, both of
        // which are measured in minutes, so this can be far below frame rate.
        // Everything that changes at wave speed happens on the GPU.
        profileHz: 6,
        // Shallowest water the maths is allowed to see. Local wavelength goes
        // to zero at the waterline and the wave number to infinity with it, so
        // the profile stops just short of the edge.
        minDepth: 0.12
    },

    // ---- The sand -----------------------------------------------------------
    sand: {
        color: 0xbda882,
        wetColor: 0x6b5b45,
        // Sand stays dark for a few seconds after the sheet retreats, then
        // dries back. Nearly free to compute and it is the detail that makes
        // people say the water looks real, which is a strange thing to be true
        // of the sand.
        dryingSeconds: 7
    },

    // ---- Still to come ------------------------------------------------------
    // sky:    the four minute day cycle, weighted toward dawn and sunset
    // cycle:  entry point per visit, biased to land just before golden light
});

/** The bed and break levels for a given sea state, 0 calm to 1 stormy.
 *
 *  One function rather than a table, so the weather cycle can move the sea
 *  continuously instead of stepping between named conditions. Kept here beside
 *  the numbers it scales rather than in audio.js, because it is a tuning
 *  decision and this file is where tuning lives. */
export function seaStateLevels(intensity = 0.5, config = OCEAN_CONFIG) {
    const t = Math.max(0, Math.min(1, intensity));
    const { schedule } = config.audio;
    return {
        // A rough sea is not just louder, it is busier: the gaps close up.
        gapScale: 1 - 0.35 * t,
        strength: schedule.baseStrength + (1 - schedule.baseStrength) * t,
        bedScale: 0.75 + 0.5 * t
    };
}
