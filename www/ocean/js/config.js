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
        // 48 DEGREES, NOT 62. A wide lens exaggerates whatever is nearest, and
        // what is nearest here is the two or three metres of water at the
        // camera's feet, which the depth limit keeps almost flat by
        // construction. At 62 degrees that near water took nearly two thirds of
        // the picture and the surf was left a strip forty pixels tall under the
        // horizon. Narrowing to roughly a fifty millimetre lens spends the
        // frame on the part of the sea that is doing something. It costs sky,
        // which the day cycle will want back, so this is the number to revisit
        // when the sky is real rather than a flat colour.
        //
        // 40 NOW, AND THIS IS WHY SURF PHOTOGRAPHS LOOK THE WAY THEY DO. After
        // the beach slope, the swell height, and the spectrum had all been
        // measured out, the lens was the only lever left on apparent size, and
        // it is the strongest one. Tallest wave in an 829 pixel frame: 139px at
        // 48 degrees, 153 at 44, 170 at 40, 191 at 36, 216 at 32. Nothing about
        // the sea changes. Narrowing also walks the bottom edge of the frame
        // out from 2.6 metres to 3.2, which quietly deletes the nearest strip
        // of water, and that strip is the one the depth cap keeps almost flat,
        // so it never had a wave shape in it to lose.
        //
        // 40 degrees is about a 33mm lens. Steve chose it from the table over
        // the longer options, which start to read as a photograph of surf
        // rather than as standing on a beach.
        //
        // TWO NUMBERS IN `beach` FOLLOW THIS ONE and were recomputed with it:
        // `widthPerMetre` and `rowNear`.
        fov: 40,
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
        // A one metre swell needs about 1.3 metres of water to stand up in, and
        // 1.3 metres at 1:8 lands the break ten metres beyond the water's edge.
        //
        // A BREAKING WAVE ALWAYS LOOKS THE SAME SIZE ON A GIVEN BEACH, and that
        // is the argument for this number being 0.13. The wave breaks where its
        // height passes 0.78 of the depth, the depth at distance D is slope x D,
        // so the wave is 0.78 x slope x D tall and subtends 0.78 x slope from
        // the camera. The distance cancels. Nothing else in the scene can make
        // the surf bigger in the frame: not the camera height, which only slides
        // it up and down, and not the swell, which just moves the break line out
        // until the wave is the same apparent size again. Only the slope.
        //
        // At 1:14 the surf stood 39 pixels tall under the horizon and the scene
        // read as a mirror with a glare on it (specs/ocean-5.png, ocean-6.png).
        // 1:8 is a steep sandy beach, which is the SHOREBREAK end of the range:
        // waves stand up late and collapse close in, which is the one that fills
        // a frame. A gentle 1:33 shore is DISSIPATIVE, lovely to stand in and
        // terrible to photograph, because the surf is a white line near the
        // horizon. Raise this and the surf comes to meet the camera.
        //
        // 1:8 was still not enough, and the paragraph above is why the obvious
        // answer did not work. Asked for bigger waves a second time, the swell
        // was swept from x1.0 to x1.6 and the tallest crest in the frame went
        // from 38 pixels to 43: a sixty per cent bigger sea bought five pixels,
        // because it broke at 20 metres instead of 13 and the distance ate the
        // rest. The slope swept over the same range went 38, 41, 53, 65, 71.
        // Measured over a minute of sea, the tallest crest in an 836 pixel frame:
        //
        //     as it shipped              38px   break 2.5-13.6m   relief 0.79m
        //     swell x1.4 alone           41px   break 2.5-18.1m   relief 1.08m
        //     slope 0.22 alone           ~60px  break 2.5- 9.0m   relief 0.72m
        //     swell x1.4 + slope 0.22    65px   break 2.5-11.9m   relief 1.03m
        //
        // The pairing is the point. The steeper beach is what makes the wave
        // big in the picture, and the bigger swell is what stops the steeper
        // beach from dragging the break line into the camera's lap: on its own
        // 0.22 puts the surf at nine metres, and a metre of swell on top of it
        // pushes the line back out to twelve, which is about where it was.
        //
        // 1:4.5 is steeper than a sandy beach really gets. It is a shingle bank
        // or a pocket beach, and it is a deliberate choice: this is the profile
        // that plunges rather than spills, and plunging is what a person means
        // when they picture surf.
        slope: 0.22,        // metres of depth per metre out to sea, about 1:4.5
        // Deep enough that the longest component is genuinely in deep water out
        // there rather than already half shoaled. At 6.5 metres a 62 metre swell
        // is feeling the bottom before it is anywhere near the camera, so it
        // arrives pre-flattened and has almost nothing left to do on the way in.
        maxDepth: 11,       // past here the profile flattens into deep water

        // THE SHEET IS MEASURED FROM THE CAMERA, NOT FROM ITSELF. Every number
        // below is a distance in front of the eye, because a fixed camera makes
        // the mapping from metres to pixels a known quantity and there is no
        // reason to guess at it. The first draft measured everything along the
        // sheet instead and put a fifth of the grid behind the viewer.
        nearZ: 10.5,        // the near edge, a little behind the camera so the
                            // waterline still has sheet under it at high tide
        farZ: -404,         // out to where the fog has finished the job
        // Where the packed part of the row curve begins, in metres in front of
        // the camera. The bottom edge of the frame meets still water about two
        // metres out (camera height over the tangent of half the vertical field
        // of view), so anything nearer than this is off the bottom of the
        // screen and wants a flat handful of rows rather than the curve.
        // FOLLOWS camera.fov: it is camera.height / tan(fov / 2), held at about
        // 85 percent of that so the curve starts just inside the frame edge
        // rather than exactly on it. 2.2 at 48 degrees, 2.7 at 40.
        rowNear: 2.7,
        nearRows: 8,
        // The sheet is the camera's own footprint. Half its width grows by this
        // much per metre of distance. Columns then sit on radial lines from the
        // eye and every one of them is the same number of pixels wide, all the
        // way to the horizon. The old fixed trapezoid was three and a half
        // times too wide at the break line, which spent most of its columns off
        // the sides of the screen and left the surf a metre and a half between
        // samples.
        //
        // The number is the tangent of half the HORIZONTAL field of view, and
        // the field of view is set vertically, so it has to be sized for the
        // widest screen anyone might be on. It covers a little past 21:9 at the
        // camera's field of view, which is as wide as monitors get. A 16:9
        // viewer does pay for that: roughly a third of the columns land off the
        // sides. That is the cheaper mistake, since the other one puts sky in
        // the corners of an ultrawide. THIS NUMBER FOLLOWS camera.fov: narrow
        // the lens and it must come down with it, or the sheet is wider than
        // the frustum again and the columns go back to being wasted. It is
        // 2.58 x tan(fov / 2), so 1.15 at 48 degrees and 0.94 at 40.
        widthPerMetre: 0.94,
        // Only so the rows level with the eye still have some width. Kept small
        // on purpose: it is a constant added to a term that grows with
        // distance, so it is negligible out at the horizon and dominates in the
        // first few metres, where it buys nothing but wasted columns. At 3 it
        // doubled the column spacing across the whole foreground.
        baseHalfWidth: 0.8
    },

    // ---- The water (water.js) -----------------------------------------------
    water: {
        // Grid resolution. Rows are packed toward the camera on a power curve,
        // because a fixed camera means the near water is on screen at a hundred
        // times the size of the far water and deserves the vertices.
        rows: 260,
        cols: 200,
        rowBias: 2.40,      // higher packs more rows into the near field
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
        // AMPLITUDES ARE PER COMPONENT AND THEY ADD UP, which is easy to forget
        // when reading down the column. These four sum to half a metre, so the
        // swell is a metre from trough to crest, and that ONE METRE is the
        // number that decides everything downstream: the sea breaks where its
        // total height passes 0.78 of the depth, so a one metre swell needs
        // about 1.3 metres of water and lands the surf fifteen to twenty metres
        // out on this slope. Raise any one of these and the whole break line
        // moves seaward. They were four times this to begin with, back when the
        // depth limit was wrongly applied to each component on its own, and the
        // sea it produced was two and a half metres tall and breaking 45 metres
        // away, which is a different beach entirely.
        //
        // THE WAVELENGTHS DECIDE HOW MANY WAVES ARE IN THE PICTURE, and that
        // turned out to matter more than how tall they are. The camera can see
        // about forty metres of usable water before perspective crushes the
        // rest into a strip under the horizon. When nearly all the height sat
        // on a 62 metre swell, that swell compressed to roughly 22 metres by
        // the time it broke, and barely one and a half crests fitted in the
        // whole shot. At any moment there was one long bulge, and a good part
        // of the time the entire visible sea sat on the flank of a single wave:
        // measured over a minute, the worst instant had 19cm of relief across
        // forty metres of ocean, which is a mirror.
        //
        // SWELL AND CHOP, WITH THE HEIGHT SPLIT BETWEEN THEM, rather than one
        // spectrum shortened. The two jobs turn out to be different jobs:
        //
        //   - The long wave decides WHERE the sea breaks and is the only one
        //     that shoals usefully. Shoaling at the break depth falls off fast
        //     with wavelength (x1.21 at 62 metres, x1.09 at 38, x1.02 at 26),
        //     because the break depth is fixed by the wave HEIGHT and a short
        //     wave has barely begun to feel the bottom by the time it gets
        //     there. Shorten everything and waves arrive the size they left at.
        //   - The short waves decide what the near field LOOKS like. Face angle
        //     goes as amplitude times wave number, so at a given height a short
        //     wave has a steeper face, and several of them fit in the frame.
        //
        // So the primary keeps its length and gives up a third of its height to
        // a 17 metre chop, which is what a real beach has on it anyway.
        //
        // THAT SPLIT WAS TOO FAR, AND IT COST THE SEA ITS SHOALING. The two
        // paragraphs above are both true and together they hide a third fact:
        // the shoaling coefficient does not just fall off with wavelength, it
        // goes BELOW ONE. A wave in intermediate depth shrinks slightly before
        // it grows, and only recovers in the last couple of metres. Measured
        // component by component, from 8 metres of water to the break depth:
        //
        //     58 metre swell    x0.90 -> x1.08     grows a fifth
        //     17.5 metre chop   x0.99 -> x0.91     SHRINKS a tenth
        //     8 metre chop      x1.00 -> x0.93     shrinks
        //
        // With most of the height on the 17.5 metre chop those cancelled almost
        // exactly, and the height-weighted total came out at x1.02 from the far
        // edge of the domain to the break. The sea did not stand up. It arrived
        // the size it left at, so the only thing shaping the picture was
        // perspective, and perspective always makes the nearest thing the
        // biggest thing. Steve caught it from a screenshot: the waves looked
        // biggest right in front of the camera, which is not what an ocean does.
        //
        // So the height goes back onto the wavelengths that can actually shoal,
        // and the chop is trimmed to what it is for, which is texture. The
        // weighted shoaling is x1.10 and the tallest wave in the frame moved
        // from 8 metres out, in the shallows, to the break line itself. The
        // total height is unchanged, so the break line has not moved.
        //
        // The lengths avoid simple ratios on purpose: 5.5 would have been
        // exactly half of 11 and those two would have locked into a repeating
        // pattern, which is the corrugated roof this list exists to avoid.
        waves: [
            { length: 58, amplitude: 0.430, steepness: 0.82, speed: 1.00, dirX: 0.16 },
            { length: 26, amplitude: 0.170, steepness: 0.74, speed: 1.12, dirX: -0.28 },
            { length: 11, amplitude: 0.075, steepness: 0.62, speed: 1.26, dirX: 0.42 },
            { length: 5, amplitude: 0.035, steepness: 0.48, speed: 1.40, dirX: -0.55 }
        ],

        // Shoaling and breaking. A wave feels the bottom at approximately half
        // its wavelength, grows as the depth drops, and breaks when its height
        // passes roughly 0.78 of the depth it is standing in. That ratio is the
        // McCowan criterion and it is doing real work here: it is why the break
        // line sits where it does without anybody placing it.
        breakRatio: 0.78,
        breakSoftness: 0.30,   // how abruptly the collapse happens
        // How much a wave grows as it shallows, as a multiple of the physical
        // Green's law answer. One is the truth and this is deliberately past it.
        //
        // The truth is disappointing on its own: a swell grows about a fifth on
        // the way in and breaks, and most of what the eye reads as a wave
        // STANDING UP is not the height at all, it is the wavelength collapsing
        // to a third of what it was. A fifth of growth spread over forty metres
        // is not an event, and the scene needs the break to be an event.
        //
        // At 2.5 the sea two thirds of the way out is noticeably flatter than
        // the sea at the break, which is the crescendo the real thing has and
        // the linear version does not. Pushed to 4 it is stronger still and the
        // far water starts to look dead, which is the cost: this dial trades the
        // horizon for the break line. It only works at all because the height
        // sits on wavelengths that shoal. On the old spectrum it did nothing
        // whatsoever, and five minutes were spent finding that out.
        shoalGain: 2.50,
        // Extra Gerstner Q approaching the break: the cusping crest that reads
        // as pitching. It was 1.35, which is barely a fifth of the way to the
        // point where a trochoid actually develops a peak, so the crests were
        // still round. The ceiling is not a matter of taste: past a certain
        // lean the surface turns inside out and the mesh folds through itself.
        // The exact test is the Jacobian of the horizontal displacement, which
        // hits zero at the fold. Swept over a full tide and both set cycles it
        // bottomed out at 0.42 at 2.5, 0.34 at 3.0, and 0.26 at 3.5, and 3.0
        // was chosen for keeping a third of the margin in hand while taking the
        // steepest face in the surf from 11 degrees to 31.
        //
        // Then the swell went up by 1.4 and the same margin had to be bought
        // back, because the Jacobian is driven by amplitude times wave number
        // times Q and only the last of those is a free parameter. At 2.6 the
        // floor was 0.35, which is the margin 3.0 used to hold at the old
        // height.
        //
        // Moving the height onto longer waves handed some of it straight back,
        // for the same reason: a 58 metre wave has a third the wave number of a
        // 17.5 metre one carrying the same amplitude. At the current spectrum
        // the floor is 0.48 at 2.6, 0.40 at 3.2, 0.31 at 3.8 and 0.23 at 4.4.
        // 3.2 buys back the steeper face at the margin the scene has always run.
        leanGain: 3.20,

        // WHY A SINE IS NOT A WAVE, and the fix for it.
        //
        // A breaking wave in shallow water is not steep in the way a deep water
        // wave is steep. Run the numbers: a four second wave breaking in 1.5
        // metres of water is 1.2 metres tall over a 15 metre wavelength, so its
        // face is about nine degrees. That is what the linear sum of four sines
        // was drawing, and nine degrees is not a face, it is a gradient. The
        // scene had no visible wave shape at all and read as a lit floor.
        //
        // Real shoaling waves look steep because they stop being sinusoidal.
        // The crest sharpens and rises, the trough flattens and fills in, and
        // eventually the face goes vertical. None of that is available to a sum
        // of sines, so it has to be put in on purpose: a second harmonic in
        // phase with each component, which is exactly second order Stokes
        // theory and exactly the shape a cnoidal wave has.
        //
        // The Stokes ratio diverges as the water shallows, which is theory's own
        // way of saying it has stopped applying, so THE CLAMP IS PART OF THE
        // MODEL rather than a safety rail. A quarter is also the largest value
        // that keeps one trough per wave: past it the trough splits into two
        // humps with a bump between them, which looks like a rendering fault.
        //
        // A pleasant consequence: the crest now stands about 0.62 of the wave
        // height above the still water line instead of exactly half, which is
        // what real waves do and what makes them look like they are rearing up
        // rather than merely going up and down.
        crestSharpen: 0.25,    // ceiling on the second harmonic, as a fraction
                               // of each component's own amplitude

        // Foam. THE PART THAT SELLS IT, more than the wave shape does.
        foamBreakThreshold: 0.34,
        // Whitecaps: how close to its own maximum the surface has to come before
        // it goes white, out in open water where nothing is breaking.
        //
        // THIS NUMBER DEPENDS ON HOW MANY COMPONENTS THERE ARE, which is not
        // obvious and is worth stating. The signal is the surface height over
        // the SUM of the amplitudes, so it can only approach one when the
        // components happen to agree, and four comparable components agree far
        // less often than one dominant one does. Moving the height onto the
        // swell doubled the whitecapping without anybody touching this line:
        // measured on water that is not breaking, 5% of samples went white
        // before and 10% after, all the way out to the horizon. 0.70 puts it
        // back to about 6%, which is where it was when Steve last approved it.
        foamCrestThreshold: 0.70,
        foamPersistence: 0.55,  // how far shoreward whitewater survives
        // Cycles per metre of the COARSEST foam octave, so about half a metre
        // across. The shader adds two finer octaves on top and fades them out
        // with distance, which is why this one number is not the whole grain:
        // see the note beside the fade in water.js. It was 0.85 to begin with,
        // a metre and a bit, and at two metres from the eye that is a third of
        // the screen in one blob. Foam has to be smaller than the thing it is
        // sitting on or it stops reading as texture.
        foamNoiseScale: 2.2,
        foamDriftSpeed: 0.35,

        // THE FOAM HAS TO COME AND GO, which is a separate problem from where it
        // appears. Depth alone says the whole inner zone is breaking, and it is,
        // so foam driven by depth alone paints a permanent white carpet from the
        // break line to the sand. It does not travel and it does not arrive, so
        // none of it reads as a wave. Real whitewater comes in with one, runs
        // up, and drains away, and the few seconds of clear water before the
        // next one is what makes the arrival feel like an event.
        //
        // So both depth-driven foam terms are multiplied by a pulse that travels
        // with the crest of the longest wave, and there are TWO of them. The
        // tight one is the wave that is breaking right now. The broad one sits
        // further back again and is the sheet it leaves behind, which is why the
        // foam fades out over a few seconds instead of switching off with the
        // crest that made it.
        //
        // Lags are in radians behind the crest. Trails are how tightly each
        // pulse is drawn in: higher is a narrower band and more clear water
        // between.
        //
        // THE PARAGRAPH ABOVE WAS RIGHT AND THE SHEET'S NUMBER WAS WRONG, and
        // it took four screenshots to see it because the fault it produced is
        // the exact fault the paragraph exists to prevent. The sheet's trail was
        // 0.8, chosen deliberately below one for a long soft tail. An exponent
        // below one BROADENS a raised cosine rather than tightening it, so the
        // sheet pulse sat high for most of every cycle. On its own that is only
        // a soft tail, as intended. Multiplied by `foamBed`, which is pinned at
        // exactly 1 across the whole surf zone, it is a constant, and a constant
        // is a carpet.
        //
        // `foamBed` is pinned because it is `max(breaking, carried * decay)` and
        // `breaking` is 1 at every row inside the break line, so the decay is
        // topped straight back up at the next row and never gets to happen. The
        // sheet pulse was the only thing standing between that and a permanent
        // wash, and it was not narrow enough to do it.
        //
        // Measured over three minutes across the near field, mean foam swung
        // between 0.11 and 0.51: never clean, never white, always milk. At 2.4
        // the floor is 0.04 and the peak is untouched at 0.50, so the water
        // between waves goes back to being water. Higher buys almost nothing:
        // 3.2 gets the floor to 0.03 and costs brightness.
        foamLag: 2.2,
        foamTrail: 2.5,
        foamSheetLag: 1.1,
        foamSheetTrail: 2.40,

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
