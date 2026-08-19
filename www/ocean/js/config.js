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
 * THE SOUND, THE BEACH, THE WATER, AND THE SKY ARE REAL. The sand section is
 * written but only half consumed, and it is the last placeholder left.
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
        // 8, AND 11.6 WAS TRIED AND PUT THE EYE UNDER THE SAND. It was moved
        // back to bring the swash into frame, it shipped, and the screenshots
        // came back with the bottom fifth of the picture blank. The arithmetic
        // that priced the move was wrong in one specific way, and it is worth
        // writing down because it will look like a good idea again:
        //
        // `height` IS MEASURED FROM STILL WATER, NOT FROM THE SAND, and the
        // beach above the waterline rises on the same 1:4.5 that places the
        // surf. So every metre backward lifts the ground under the camera by
        // 22 centimetres. At z = 8 the bed is 0.44 m up and the eye clears it
        // by 0.71. At z = 11.6 the bed is 1.232 m up and the eye, still at
        // 1.15, is BELOW IT. Nothing in the scene then sits lower than 11.6
        // degrees under the horizon, the frame reaches 20, and the bottom 170
        // pixels of an 810 pixel frame have no geometry in them at all. They
        // render as bare sky dome, which is what the smooth untextured band
        // along the bottom of the 2026-08-19 screenshots is.
        //
        // The move was priced against a flat ground plane at y = 0. That plane
        // is real seaward of the waterline and imaginary shoreward of it.
        //
        // SO STANDING BACK IS NOT A FREE LEVER ON THIS BEACH. It costs surf,
        // because the break line is anchored to the shore rather than to the
        // camera, and tallest wave in an 810 pixel frame goes 165px at z 8,
        // 146 at 9.5, 127 at 11.6, 110 at 14. And past about z 9.7 it also
        // costs the ground under the visitor's feet unless `height` rises with
        // it, which is a second decision about whether they are standing or
        // sitting and changes the horizon's place in the frame.
        //
        // Steve's call after seeing it: stay at 8 and keep the full focus on
        // the water. The swash is not worth the beach it would take to show.
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
        // The near edge, well BEHIND the eye, which is the property that matters
        // and not the number. It means the sheet passes under the camera rather
        // than ending in front of it, so there is geometry at every angle the
        // frame reaches and no gap along the bottom. Anything that moves the
        // camera back past this has to move this with it, and `camera.z` carries
        // the version of that mistake that shipped.
        //
        // 16, NOT 10.5, AND THE ARC IS WHY. The waterline for a given water
        // level sits at `shoreZ + level / slope`, so a rising sea walks it
        // shoreward at four and a half metres per metre of surge on this beach.
        // At 10.5 the sheet ran out at a surge of 0.99 m. The tsunami needs
        // 1.55, which puts the waterline at z 13.0, and a sheet ending at 10.5
        // would have let the sea climb off the end of the beach three seconds
        // before it reached the camera. 16 carries 2.2 m of surge with the run
        // up on top of it, which is the whole arc with room to spare.
        //
        // It costs eight rows out of 260, which are the flat near strip and were
        // always below the frame. Nothing else moves: `rowNear` and
        // `widthPerMetre` follow `camera.fov`, not this.
        nearZ: 16,
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
        // How far shoreward whitewater survives, as `4 + 40 * this` metres.
        //
        // THIS HAS TO BE MEASURED AGAINST THE SURF ZONE, not chosen in the
        // abstract, and 0.55 was a decay length of 26 metres across a surf zone
        // 7 metres wide. Foam made at the break arrived at the sand at 86 per
        // cent of full strength, so there was no fade at all and the near field
        // was one flat white from the break line to the beach. It was tuned on
        // a 1:8 beach with a much wider zone and quietly stopped meaning
        // anything when the beach went to 1:4.5.
        //
        // 0.04 is six metres, which is the width of the zone it has to cross, so
        // whitewater is down to about a third of itself by the time it reaches
        // the sand. Measured peak to nearest: x1.2 before, x2.0 now.
        foamPersistence: 0.04,
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
        //
        // THESE NUMBERS ARE SETTLED AND THE SCREENSHOTS THAT LOOK WASHED ARE NOT
        // A FAULT. Twice now a pale near field in a screenshot has been read as
        // a foam bug, and the second time it was not one. Running the shader's
        // own foam terms on the CPU from the real profile shows the band doing
        // exactly what it should: arriving at the break line, travelling
        // shoreward at about 2 metres per second, and leaving clear water
        // behind it. Share of the visible sea under foam above 0.5, over four
        // minutes: median 0.1 per cent, ninetieth percentile 37, peak 58. No
        // sample anywhere reaches 0.9, which is where the shader would mix the
        // noise out, so the whitewater is never the flat sheet earlier rounds
        // were chasing. A frame caught at the peak is a frame of a wave landing.
        //
        // MEASURE THE FIELD, DO NOT READ THE PIXELS. Brightness in a screenshot
        // cannot tell foam from lit shallow water from a sky reflection, and it
        // has now produced a wrong diagnosis twice.
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

    // ---- The sand (sand.js) -------------------------------------------------
    //
    // THE SAND'S JOB IS TO SHOW WHERE THE WATER HAS BEEN. A beach photographed
    // between waves is not a flat tan surface, it is a dark wet band with a
    // ragged upper edge, drying unevenly back to pale. That band is the record
    // of the last few waves, and it is the reason a still frame of a beach
    // still reads as moving. It is also the cheapest thing in the scene: one
    // number per row, updated a dozen times a second.
    //
    // AND FROM THIS CAMERA YOU CANNOT SEE THE SWASH. That is measured, it was
    // tested by moving the camera, and the answer came back that the move costs
    // more than the swash is worth. Distances from the eye at z = 8:
    //
    //     bottom edge of the frame meets the sea   3.16m out, z = 4.84
    //     waterline, high tide                     z = 7.25   not in frame
    //     waterline, mean tide                     z = 6.00   not in frame
    //     waterline, low tide                      z = 4.75   just in frame
    //     top of the run up                        z = 8.40   BEHIND the eye
    //
    // A level 40 degree lens at 1.15 metres sees the sea no nearer than 3.16
    // metres, and the water's edge is two metres away. So the beach at the
    // visitor's feet, the swash running up it, and the wet band it leaves are
    // all off the bottom of the picture, and the sand is only ever seen as the
    // SEABED through shallow water, at about a sixth of the pixel.
    //
    // STANDING BACK TO SEE IT DOES NOT WORK, and the reason is not the one that
    // looks obvious. `camera.z` 11.6 was tried, shipped, and screenshotted, and
    // it left the bottom 170 pixels of the frame empty, because the beach rises
    // on the same slope that places the surf and it came up past the eye. The
    // full account is under `camera.z`. Tilting down does not reach it either,
    // since the top of the run up is behind the eye at any workable distance.
    //
    // SO THE SWASH IS BUILT, CORRECT, TESTED, AND DELIBERATELY NOT VISIBLE. It
    // costs nothing per frame, it drives the wetness that the seabed shows in
    // the shallows at low tide, and it is ready if the camera ever earns its
    // way back. Everything else below is doing visible work on that seabed: the
    // grain and the ripples are what stop the shallows being a flat olive wash,
    // and the wet mirror is what makes them look like a beach under water.
    sand: {
        color: 0xbda882,
        wetColor: 0x6b5b45,
        // Sand stays dark for a few seconds after the sheet retreats, then
        // dries back. Nearly free to compute and it is the detail that makes
        // people say the water looks real, which is a strange thing to be true
        // of the sand.
        dryingSeconds: 7,

        // ---- The swash: how far up the beach each wave reaches -------------
        //
        // THE SHAPE IS BALLISTIC AND IT IS NOT A GUESS. A sheet of water thrown
        // up a plane beach decelerates under the downslope component of
        // gravity, so its position is a parabola in time: x = u0 t - a t^2 / 2,
        // with a = g sin(beta) cos(beta). On this beach that is 2.06 m/s^2, and
        // the whole shape follows from the run up distance alone: u0 is
        // sqrt(2 a X) and the sheet is up and back in 2 u0 / a. So one number
        // below sets both how far the water comes and how long it takes, and
        // they cannot disagree.
        //
        // THE RUN UP IS SET BY WHERE THE CAMERA SITS, NOT BY THE WAVE, and that
        // is a departure worth stating. The physical answer for a 1.7 metre
        // breaker is the Iribarren number: at this slope and this swell it comes
        // out around 1.3, giving 2.2 metres of vertical run up, which on a 1:4.5
        // beach is TEN METRES horizontally. The camera sits two metres shoreward
        // of the still water line, so a real swash would run eight metres past
        // it and the visitor would be knee deep with the lens under water.
        //
        // The scene's geometry is compressed and this is where the bill comes
        // due: the surf zone is ten metres wide here because the break line was
        // placed for the composition, where a real one on this swell would be
        // several times that. So the run up is scaled to the beach we built.
        // 2.4 metres puts the biggest sets at the camera's feet, which is
        // exactly what `camera` claims the viewer is sitting at the top of, and
        // leaves the ordinary ones stopping a metre short.
        swash: {
            maxRunUp: 2.4,      // metres past the still water line, biggest sets
            minRunUp: 0.6,      // ... and the smallest inners
            // The bore takes time to cross the surf zone, so the sheet arrives
            // after the crash rather than with it. Measured at 2.4 m/s in the
            // foam field, which is where this number comes from rather than
            // from taste.
            boreSpeed: 2.4,
            // More than this on the beach at once and the older ones are
            // dropped. Four covers a set arriving on top of its own backwash.
            maxActive: 4
        },

        // ---- What it looks like up close -----------------------------------
        // Grain, in cycles per metre, so about a hand's width across. It fades
        // out with distance for the same reason the foam's fine octaves do:
        // detail finer than the pixel it lands on does not read as detail, it
        // reads as a shimmer.
        grainScale: 7.0,
        grainStrength: 0.13,
        grainFadeMetres: 20,
        // Ripples run PARALLEL TO THE WATERLINE, which is what makes them read
        // as a beach rather than as noise, and they only appear on sand that is
        // wet, because dry sand does not hold them.
        rippleScale: 2.6,
        rippleStrength: 0.10,

        // WET SAND IS NOT ONLY DARKER, IT IS A MIRROR, and the mirror is most of
        // the effect. A film of water over sand reflects the sky at a grazing
        // angle exactly as the sea does, which is why a beach at sunset has a
        // band of sky lying on it between waves. It runs through the same
        // `oceanSkyColor` and the same Fresnel as the water, so the two can
        // never disagree about what is overhead.
        dryRoughness: 0.95,
        wetRoughness: 0.22,
        // Wet sand is a thin film over a rough bed rather than a deep body of
        // water, so it never reaches the sea's own reflectance.
        wetReflect: 0.70,

        // How often the wet band is rebuilt on the CPU, in hertz. It is one
        // number per row and the fastest thing in it is a swash lasting a
        // couple of seconds, so this is far below frame rate on purpose.
        profileHz: 12
    },

    // ---- The sky (sky.js) ---------------------------------------------------
    //
    // THE SKY IS THE WATER'S LIGHT SOURCE, NOT ITS BACKDROP, and that is the
    // whole reason this section is shaped the way it is. Water is close to a
    // mirror, so almost everything the eye reads as the colour of the sea is
    // the sky bouncing off it. Before this section existed the sea reflected
    // nothing at all, because a MeshStandardMaterial with no environment has no
    // specular except the punctual sun, so the only bright thing on the water
    // was the sun's own lobe and every other pixel fell back to `deepColor`.
    //
    // Measured off specs/ocean/ocean-1.png and ocean-4.png: sky (132, 173, 197)
    // against sea (0, 11, 20) in the band eight to thirty two pixels under the
    // horizon. That band is between 0.4 and 1.6 degrees below the eye, so the
    // view ray meets the water at 88 to 90 degrees off the normal, and Schlick
    // with n = 1.33 puts the reflectance there between 0.87 and 0.97. It should
    // have been within a few percent of the sky. It was at a tenth of it, which
    // is why the horizon read as a hard black seam.
    //
    // So `sky.keys` below is consumed twice over: once to draw the dome, and
    // once inside the water's own shader as the thing it reflects. One set of
    // numbers, two consumers, which is the only way the two can agree.
    sky: {
        // Comfortably inside camera.far (900) and centred on the eye rather
        // than on the origin. The camera sits 1.15 metres up, and a dome
        // centred at the world origin would put its equator 1.15 metres below
        // the eye, which at this radius is a degree and a half of error on the
        // one line in the frame the eye actually rests on.
        domeRadius: 700,

        // How fast the gradient climbs away from the horizon, as the exponent
        // on the elevation. REAL SKY IS PALE AT THE HORIZON AND SATURATED
        // OVERHEAD, because a horizontal line of sight runs through far more
        // air, and that is the opposite of what a linear ramp draws. 0.45 puts
        // the mix about seventy percent of the way to the zenith colour by
        // thirty degrees up, which is roughly where the real transition sits.
        gradientPower: 0.45,

        sun: {
            // A REAL SUN IS HALF A DEGREE ACROSS and that is a smaller dot than
            // anyone pictures: 0.53 degrees in a forty degree frame is eleven
            // pixels. Photographs of sunsets look otherwise because a long lens
            // magnifies the sun and not the horizon behind it, and because the
            // eye remembers the glare rather than the disc. 1.2 degrees is a
            // deliberate departure, about twice life size, chosen so the sun
            // reads as the sun rather than as a stuck pixel. Raise it and it
            // starts to look like a planet.
            angularDiameterDegrees: 1.2,
            // Degrees of soft edge on the limb. Enough to stop the disc
            // crawling with aliasing as it drifts, and small enough that it is
            // still a disc.
            limbSoftnessDegrees: 0.14,
            // How much brighter than the sky the disc is. Past the point where
            // filmic tone mapping saturates it to white, which is exactly what
            // should happen, but not so far past that the warm fringe at sunset
            // is lost too.
            discStrength: 7.0,
            // The halo. Two terms, because the real thing has two: a wide bloom
            // out to twenty five degrees or so, from scattering through the
            // whole depth of the atmosphere, and a tight aureole a few degrees
            // across from the air immediately around the sun. One term cannot
            // be both. The exponent is on the cosine of the angle, so 8 puts
            // the wide bloom's half brightness at about 25 degrees and the
            // aureole, which runs at twelve times the exponent, at about 7.
            glowPower: 8.0,
            glowStrength: 0.30,
            aureoleRatio: 12.0,
            aureoleStrength: 0.55
        },

        // HIGH THIN CLOUD, AND IT EARNS ITS PLACE AT THE TWO GOLDEN HOURS.
        // Cirrus underlit by a sun near the horizon is most of what makes a
        // sunset look like a sunset, and a clean gradient cannot do it at any
        // exposure. The cost is honest: it is a second moving element in the
        // half of the frame that is meant to be still, so it drifts slowly
        // enough to be noticed having moved rather than noticed moving.
        cloud: {
            // The sheet is sampled by projecting the view direction onto a
            // plane at this height, which is what gives cloud its perspective:
            // features converge and compress toward the horizon on their own,
            // with no distance term anywhere. Height and scale only ever appear
            // multiplied together, so one of them is redundant and this one is
            // pinned at 1 to say so.
            height: 1.0,
            scale: 0.9,
            // CIRRUS IS STRETCHED, not blobby. Compressing the sample along the
            // horizon axis draws features that are wide and thin, which is the
            // difference between high cloud and cotton wool.
            stretch: 0.35,
            // Threshold and ramp on two octaves of value noise. Noise averages
            // about a half, so a coverage above that leaves clear sky between
            // the streaks, which is what thin cloud is.
            coverage: 0.52,
            softness: 0.30,
            // WHERE THE CLOUD STOPS, and it has to stop. The projection divides
            // by the elevation, so it runs away to infinity at the horizon and
            // the noise there is finer than a pixel: detail smaller than the
            // pixel it lands on does not read as detail, it reads as a shimmer
            // in a part of the frame that is supposed to be perfectly still.
            // Below nine degrees there is no cloud at all.
            horizonFadeFrom: 0.015,
            horizonFadeTo: 0.16,
            // Projected units per second. Slow on purpose: at this rate a
            // streak crosses the visible band in something over a minute.
            driftSpeed: 0.010,
            // How far toward the sun's own colour the underside of a cloud goes
            // when it is between the eye and a low sun. This is the sunset.
            sunlitMix: 0.55
        },

        // ---- The day, as a list of looks ------------------------------------
        //
        // `at` is the position in the cycle, 0 to 1, and it WRAPS: past the last
        // entry the interpolation runs back round to the first. There is no
        // duplicate keyframe at 1.0 and there should not be one.
        //
        // THE SPACING IS THE "UNEQUAL PHASES" DECISION. Phase is not linear in
        // solar time. Night gets eleven percent of the wall clock and the two
        // golden hours between them get well over half, because the point of a
        // day cycle in a scene with nothing to do is the light, and midday light
        // on water is the least interesting light there is.
        //
        // `azimuth` is degrees from straight out to sea, positive to the right,
        // and IT IS A CHEAT worth stating plainly. A real sun rises behind a
        // west facing beach and sets in front of it, so a real day gives you one
        // golden hour on the water and one with the sun at your back. This one
        // swings from 22 degrees left at sunrise to 22 degrees right at sunset,
        // which is a beach that quietly rotates through the day. Nothing in the
        // frame can contradict it: the horizon is featureless, the camera never
        // moves, and the waves refract to arrive straight on however they are
        // angled out at sea. It buys two golden hours instead of one.
        //
        // 22 degrees rather than 30 because the glint path is the composition.
        // The horizontal field of view is about 61 degrees, so the frame runs
        // to a little over 30 degrees either side, and a sun at 30 would put
        // its path against the edge of the picture.
        //
        // `exposure` drives the renderer's tone mapping directly. It is the
        // cheapest lever in the file: it is what stops night from being a black
        // rectangle and midday from being a white one.
        keys: [
            {
                at: 0.00, name: 'night',
                elevation: -12, azimuth: -24,
                sunColor: 0xff9a5a, sunIntensity: 0.0,
                zenith: 0x05080f, horizon: 0x0d1626,
                hemiSky: 0x1a2740, hemiGround: 0x0a0d14, hemiIntensity: 0.30,
                cloudColor: 0x1a2233, cloudOpacity: 0.35,
                exposure: 1.45
            },
            {
                at: 0.06, name: 'first light',
                elevation: -4, azimuth: -23,
                sunColor: 0xff9a5a, sunIntensity: 0.0,
                zenith: 0x101f3a, horizon: 0x35405c,
                hemiSky: 0x2c3d5e, hemiGround: 0x1a1a20, hemiIntensity: 0.55,
                cloudColor: 0x3a4258, cloudOpacity: 0.50,
                exposure: 1.30
            },
            {
                at: 0.12, name: 'sunrise',
                elevation: 0, azimuth: -22,
                sunColor: 0xff8843, sunIntensity: 1.60,
                zenith: 0x2a4a72, horizon: 0xd98a5a,
                hemiSky: 0x6f89ad, hemiGround: 0x4a3a2c, hemiIntensity: 0.75,
                cloudColor: 0xffb98a, cloudOpacity: 0.62,
                exposure: 1.15
            },
            {
                at: 0.20, name: 'golden morning',
                elevation: 8, azimuth: -19,
                sunColor: 0xffc189, sunIntensity: 2.60,
                zenith: 0x3e6f9e, horizon: 0xf0b98a,
                hemiSky: 0x93b3cf, hemiGround: 0x6b5b45, hemiIntensity: 1.00,
                cloudColor: 0xffd9b8, cloudOpacity: 0.55,
                exposure: 1.05
            },
            {
                at: 0.32, name: 'morning',
                elevation: 25, azimuth: -13,
                sunColor: 0xfff0d8, sunIntensity: 3.00,
                zenith: 0x4d86c0, horizon: 0xafcadd,
                hemiSky: 0xb4d0e4, hemiGround: 0x6b5b45, hemiIntensity: 1.10,
                cloudColor: 0xf4f7fa, cloudOpacity: 0.45,
                exposure: 1.00
            },
            {
                at: 0.46, name: 'midday',
                elevation: 58, azimuth: -3,
                sunColor: 0xfffaf0, sunIntensity: 3.30,
                zenith: 0x3f7ec4, horizon: 0xc4dced,
                hemiSky: 0xc3dcec, hemiGround: 0x6b5b45, hemiIntensity: 1.20,
                cloudColor: 0xffffff, cloudOpacity: 0.40,
                exposure: 0.95
            },
            {
                at: 0.60, name: 'afternoon',
                elevation: 32, azimuth: 10,
                sunColor: 0xfff2dc, sunIntensity: 3.00,
                zenith: 0x4a84c2, horizon: 0xb9d2e4,
                hemiSky: 0xb8d3e6, hemiGround: 0x6b5b45, hemiIntensity: 1.10,
                cloudColor: 0xfaf9f6, cloudOpacity: 0.44,
                exposure: 1.00
            },
            {
                at: 0.72, name: 'late afternoon',
                elevation: 14, azimuth: 16,
                sunColor: 0xffd9a5, sunIntensity: 2.70,
                zenith: 0x4477ae, horizon: 0xdcc7ae,
                hemiSky: 0xa9c1d6, hemiGround: 0x6b5b45, hemiIntensity: 1.00,
                cloudColor: 0xffe6c8, cloudOpacity: 0.52,
                exposure: 1.05
            },
            {
                at: 0.82, name: 'golden evening',
                elevation: 6, azimuth: 20,
                sunColor: 0xffab5e, sunIntensity: 2.40,
                zenith: 0x2f5f92, horizon: 0xf2a86a,
                hemiSky: 0x8ea9c4, hemiGround: 0x5e4c38, hemiIntensity: 0.90,
                cloudColor: 0xffc48f, cloudOpacity: 0.60,
                exposure: 1.10
            },
            {
                at: 0.90, name: 'sunset',
                elevation: 0, azimuth: 22,
                sunColor: 0xff6a2e, sunIntensity: 1.50,
                zenith: 0x1f3f6a, horizon: 0xe4703f,
                hemiSky: 0x63799a, hemiGround: 0x40352a, hemiIntensity: 0.70,
                cloudColor: 0xff9152, cloudOpacity: 0.66,
                exposure: 1.15
            },
            {
                at: 0.95, name: 'dusk',
                elevation: -5, azimuth: 24,
                sunColor: 0xd4643c, sunIntensity: 0.15,
                zenith: 0x122a4c, horizon: 0x6d4a5c,
                hemiSky: 0x3a4c6e, hemiGround: 0x1e1e26, hemiIntensity: 0.50,
                cloudColor: 0x5c4258, cloudOpacity: 0.55,
                exposure: 1.30
            }
        ]
    },

    // ---- The arc (storm.js) -------------------------------------------------
    //
    // THREE MINUTES, WITH AN ENDING. Agreed with Steve on 2026-08-19, and it is
    // the number every other number here hangs off. The scene opens as an
    // ordinary bright day, the swell builds until the sea is frightening, the
    // water starts coming over the camera, the sea withdraws, a tsunami
    // arrives, and the page fades to black.
    //
    // THE SEA IS THE ONLY THING THAT CHANGES. The sun is held (see `cycle`), the
    // camera never moves (see `camera`), and there is nothing to click. That is
    // deliberate: with one signal in the frame, a visitor reads every change as
    // meaning something, which is exactly the effect a horror scene wants and
    // exactly the effect a busy one destroys.
    storm: {
        seconds: 180,
        // Start times, not ranges, so two stages can never overlap or leave a
        // gap. The last one runs to `seconds`. Names are for the audio bed and
        // the debug label rather than for anything visual, since every visible
        // quantity below interpolates straight through the boundaries.
        stages: [
            { from: 0,   name: 'ordinary' },   // the sea as it has always been
            { from: 35,  name: 'turning' },    // the swell starts to build
            { from: 90,  name: 'storm' },      // faces near vertical, first engulfment
            { from: 130, name: 'drawback' },   // the sea goes the wrong way
            { from: 150, name: 'tsunami' }
        ],
        // ---- The swell ------------------------------------------------------
        //
        // A MULTIPLE OF THE CALM SPECTRUM in `water.waves`, and THE CEILING HERE
        // IS PHYSICS RATHER THAN TASTE. The Gerstner displacement folds the mesh
        // through itself when the Jacobian of the horizontal displacement
        // reaches zero, and the sea is measurably close to that. Swept on the
        // CPU over ninety seconds of sea, 810 pixel frame:
        //
        //   swell  lean  face  foldMargin  deepCrest  px@200m  tallestBreaker
        //    1.0   3.20   32d     0.391      0.67m      3.8px       95px
        //    1.5   3.20   39d     0.307      1.01m      5.7px       97px
        //    2.0   3.20   54d     0.215      1.37m      7.7px       99px
        //    2.5   3.20   70d     0.125      1.74m      9.8px      101px
        //    2.5   1.20   31d     0.524      1.74m      9.8px      101px
        //    3.0   1.20   35d     0.477      2.11m     11.9px      102px
        //
        // READ THE LAST COLUMN FIRST. The breaking wave in front of the camera
        // does not get bigger. 95 pixels to 102 across a sea three times the
        // size, because a wave breaks at 0.78 of the local depth and the depth
        // is the slope times the distance, so the distance cancels and only
        // `beach.slope` survives. Anyone arriving here to make the surf larger
        // should read that column and then go and read `beach.slope`.
        //
        // THE COLUMN THAT DOES MOVE IS `deepCrest`, AND IT IS THE WHOLE POINT.
        // Deep water swell is not depth limited, so the background is free. At
        // 2.0 the crests clear eye level (1.15 m) and stay above it out to 412
        // metres, which means THE SWELL STARTS HIDING THE HORIZON. That is the
        // strongest big sea cue there is and this scene had never once done it.
        // The break line marching seaward from 12 m to 19 m is the second one.
        //
        // 2.6 at the peak keeps a fold margin of about 0.1 with the lean pulled
        // down, which is the same margin the calm sea has always run at.
        swell: [
            { at: 0,   value: 1.00 },
            { at: 35,  value: 1.05 },   // barely, and only so it is already moving
            { at: 90,  value: 2.00 },   // the horizon starts going
            { at: 130, value: 2.40 },
            { at: 150, value: 2.20 },   // the drawback takes the sea down with it
            { at: 168, value: 2.60 }    // and the tsunami brings it back
        ],
        // Crest cusping, and it comes DOWN as the swell goes up. Not a look
        // decision: amplitude times wave number times this is what drives the
        // Jacobian to zero. Holding 3.2 to a 2.4 swell leaves a margin of about
        // 0.13, which a set arriving on a high tide could cross, and the far
        // side of that line is a mesh visibly passing through itself.
        //
        // The cost is real and it is in the `face` column above: at 2.5 the
        // difference between lean 3.2 and 1.2 is a wave face of 70 degrees
        // against one of 31. So the storm trades some of its pitch for its size,
        // and it is worth it, because size is the thing being asked for.
        lean: [
            { at: 0,   value: 3.20 },
            { at: 90,  value: 2.60 },
            { at: 130, value: 1.60 },
            { at: 180, value: 1.20 }
        ],
        // ---- The surge ------------------------------------------------------
        //
        // Metres the still water level stands above its mean, added to the tide
        // rather than replacing it. THE NEGATIVE NUMBERS ARE THE BEST PART.
        //
        // A drawback is what a tsunami does before it arrives, and everybody
        // watching already knows what it means, which is why twenty seconds of a
        // sea going the wrong way is worth more than any amount of water coming
        // the right way. It is also nearly free: the waterline walks down the
        // beach on its own, because `waterlineZ` is already the shore position
        // for a given water level, and the sand under the shallows becomes the
        // subject of the frame for the first time.
        //
        // THE PEAK IS SET BY `camera.height` (1.15), which is the level at which
        // the water covers the eye. 1.55 clears it by 0.4 so the tsunami is over
        // the camera rather than lapping at it. See `engulfWashMetres`.
        //
        // AND ONLY THE TSUNAMI ENGULFS ANYTHING, WHICH IS NOT WHAT WAS ASKED
        // FOR. Steve asked for waves that sometimes crash over the visitor
        // through the storm, and this table does not deliver it. Walking the arc
        // shows why, and it is not a matter of turning the surge up:
        //
        //   surge 0.55 puts the waterline at z 8.5, just past the camera at 8,
        //   in 0.11 m of water. The depth cap then limits the wave standing in
        //   that water to about 4 cm, because `breakRatio` x depth is the whole
        //   point of the sea model. So the camera stands in a puddle.
        //
        // What actually knocks a person over at a beach is the BORE, the broken
        // whitewater running shoreward, and a bore is not depth limited the way
        // an unbroken wave is. sand.js already tracks bores as swash events with
        // a run up and a timing, but not with a THICKNESS, and thickness is the
        // missing quantity. Until that exists, a steady surge high enough to
        // engulf would leave the camera permanently submerged, which is worse
        // than not doing it. Flagged to Steve rather than faked.
        surge: [
            { at: 0,   value: 0.00 },
            { at: 90,  value: 0.15 },
            { at: 118, value: 0.55 },   // ankle deep at the camera, no more
            { at: 130, value: 0.30 },
            { at: 145, value: -0.90 },  // drawback, and the beach is bare
            { at: 152, value: -0.90 },
            { at: 172, value: 1.55 },   // the tsunami, well over the eye
            { at: 180, value: 1.55 }
        ],
        // How far either side of eye level the white-out ramps, in metres. A
        // hard switch at exactly eye level would flicker every time a crest
        // passed, since the surface is never still.
        engulfWashMetres: 0.35,
        // The closing fade, in seconds off the end. Long enough to read as an
        // ending rather than as a page crashing, short enough that nobody is
        // left watching a grey rectangle.
        fadeSeconds: 8
    },

    // ---- The cycle ----------------------------------------------------------
    //
    // THERE IS NO CYCLE ANY MORE. THE SUN IS HELD, AND MIDDAY IS A CHOICE.
    //
    // The scene is no longer an endless calm sea. The plan is an arc: an
    // ordinary bright day that turns, a swell that builds until the sea is
    // frightening, and a tsunami at the end of it. Given that, a moving sun is
    // not a feature, it is a competing signal. Two things in the frame cannot
    // both be the thing that is changing, and the one that has to be changing
    // is the water.
    //
    // MIDDAY IS THE RIGHT LIGHT FOR THAT, and not as a fallback. A high sun at
    // 40 to 58 degrees puts no glitter path on the water and no warmth in the
    // sky, so the sea is its own colour and the scene reads as ordinary, which
    // is the whole setup. Dusk would announce the ending in the first second.
    // It is also the only light in which a wall of water rising out of the fog
    // at 400 metres is legible rather than a silhouette against a blaze.
    //
    // A HELD SUN IS NOT A STILL SKY. The cloud sheet still drifts at
    // `sky.cloud.driftSpeed`, the tide still moves on 560 seconds, the wave
    // sets still beat out over minutes, and the sea state is about to become the
    // scene's real clock. Nothing here was carrying the scene.
    //
    // WHAT WAS HERE BEFORE, so nobody re-derives it. A four minute cycle was
    // measured and rejected: over half a turn that is 0.75 degrees per second,
    // and at 20.2 pixels per degree the sun crossed the frame at FIFTEEN PIXELS
    // PER SECOND, which is a timelapse rather than a day. It was replaced with a
    // 2510 second cycle at 1.35 pixels per second, sixteen times real time, and
    // that worked. It is being removed because the scene changed under it, not
    // because it was wrong. If the arc is ever abandoned, the number to restore
    // is 2510 and the reason it is not a neat multiple of the tide, the visual
    // set period, or the audio set period is so that nothing beats against it.
    cycle: {
        // ZERO MEANS HELD, not "infinitely fast". `advancePhase` reads it that
        // way on purpose, so the sun stays exactly where the visit started it
        // and `oceanSetPhase` still works for a screenshot pass.
        seconds: 0,
        // ONE WINDOW, AND IT IS STILL DRAWN FRESH EVERY VISIT. Steve asked for
        // the time of day to stop moving, not for every visitor to get the
        // identical frame, so this keeps the draw and narrows it to the part of
        // the day that stays bright.
        //
        // 0.38 to 0.56 puts the sun between 39 and 58 degrees up and swings the
        // azimuth from 8.7 degrees left of centre to 6.3 right, so the highlight
        // on the water sits somewhere different each visit while the mood does
        // not change at all. Exposure only moves between 0.95 and 0.99 across
        // the whole band, which is the measure of how little is at stake here.
        //
        // The eleven keyframes above are DELIBERATELY KEPT even though nine of
        // them are now unreachable. They cost nothing, since only the two either
        // side of the phase are ever read, and they are the only record of what
        // this sky looked like at every hour. `oceanSetPhase` reaches all of
        // them, which is how the scene gets QA'd at dusk without shipping dusk.
        entry: [
            { from: 0.38, to: 0.56, weight: 1 }
        ]
    }
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
