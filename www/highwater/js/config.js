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
    // ---- The anonymous visit counter ---------------------------------------
    //
    // A tiny proof of work, solved once per visit and cached in sessionStorage,
    // whose hash tags the site's own usage pings. It is a soft bot deterrent
    // rather than an identifier: there are no accounts, no cookies, and no
    // third party anything on this domain, and the hash is what lets one
    // visitor's two pings be counted as one visit instead of two.
    //
    // THE STORAGE KEY IS SHARED ON PURPOSE and is not a copy and paste slip.
    // Every experience uses 'gallery-pow', so a visitor who walks the trail and
    // then comes here solves the puzzle once for the whole site rather than
    // once per world.
    proofOfWork: { prefix: '11', storageKey: 'gallery-pow' },

    // ---- Sound: DELIBERATELY NONE ------------------------------------------
    //
    // THE OCEAN SCENE IS SILENT, and that is a decision rather than a gap.
    // A full procedural surf synthesiser was built and wired: a bed of filtered
    // noise, three stage breaks driven straight off `consumeBreaks()`, and
    // continuous voices for the lull, the drawback, and the tsunami. It was
    // removed on 2026-08-19 at Steve's request after three rounds of listening
    // QA. Recover it from git if it is ever wanted: `www/ocean/js/audio.js`
    // and `tests/ocean-audio.test.mjs`, under the folder's old name.
    //
    // WHAT WENT WRONG IS WORTH KNOWING, because two of the three faults were
    // real and measurable and the third was never found:
    //   - The crash was scheduled at `ctx.currentTime`, which is already in the
    //     past when the audio thread reads it, so the 15 ms attack was skipped
    //     and each wave began at full amplitude. A click, once per wave.
    //   - Break events were detected at the break line about fourteen metres
    //     out. The eye watches the FRAME, which is the near water, so the sound
    //     ran a measured 2.15 seconds ahead of the picture going white.
    //   - A tapping that survived both fixes and was never located. The next
    //     step would have been rendering the graph offline and reading the
    //     waveform rather than reasoning about it.
    //
    // The visual scene never depended on any of this. `consumeBreaks()` stays,
    // because sand.js drives the swash and the wet band from the same queue.

    // ---- Keeping the frame rate ---------------------------------------------
    //
    // THE SCENE GETS TWICE AS EXPENSIVE AT THE EXACT MOMENT IT MATTERS MOST, and
    // that is inherent rather than a bug. Measured across the arc, the share of
    // the frame filled by water:
    //
    //     ordinary  50%      t=74  63%
    //     storm     60%      t=76  74%
    //     lull      53%      t=78  100%, and 252 rows above the horizon
    //
    // The water's fragment shader is the most expensive thing here: it evaluates
    // the whole sky function per pixel for the Fresnel reflection, then foam
    // noise, then Three's standard lighting. Normally it runs on half the frame
    // and the cheap sky dome covers the rest. From t=78 the wall fills the frame
    // and it runs on all of it. The CPU is flat throughout, measured at 0.10 to
    // 0.14 ms a frame from the first second to the last, so none of this is the
    // simulation.
    //
    // SO THE ANSWER IS FEWER PIXELS, NOT LESS SEA. On a Retina display a
    // 1920x1080 window renders 3840x2160, which is 8.3 million pixels of that
    // shader. Dropping the ratio from 2 to 1.5 removes 44 per cent of the work
    // and costs almost nothing to look at, because what is on screen at that
    // point is a smooth wall of water behind fog.
    //
    // MEASURED AGAINST THE DISPLAY RATHER THAN AGAINST 60. A fixed millisecond
    // budget calls a 30 Hz panel permanently slow and never notices a 120 Hz one
    // struggling. So the yardstick is the best frame this device has managed,
    // which is a fair estimate of its refresh interval, with an absolute floor
    // underneath for the case where it was never fast even once.
    quality: {
        minScale: 0.60,
        // Slow if a frame takes this much longer than the best one seen.
        slowRatio: 1.30,
        // Fast enough to try for more only when there is real headroom. Close to
        // 1 because a vsynced display reports its interval no matter how much
        // room is left, so the only way to find the ceiling is to reach for it
        // and come back down if it does not hold.
        fastRatio: 1.08,
        // The backstop, in seconds, for a device that was never fast even once.
        slowSeconds: 1 / 25,
        stepDown: 0.85,
        // Smaller than the step down, deliberately. Getting it wrong downward
        // costs a little sharpness and getting it wrong upward costs the frame
        // rate at the climax, so the two are not symmetrical.
        stepUp: 1.06,
        // CHANGING THE RATIO REALLOCATES THE DRAWING BUFFER, which is itself a
        // dropped frame, so this cannot be a per-frame decision. Longer before
        // reaching back up than before backing off.
        holdDownSeconds: 1.0,
        holdUpSeconds: 3.0,
        // Ignore the opening frames: shader compilation and the first attribute
        // upload both land there and neither says anything about the device.
        settleFrames: 60,
        // A frame longer than this is a tab coming back or the machine sleeping,
        // not a slow frame, and must not drag the measurement down with it.
        ignoreAboveSeconds: 0.10,
        // How quickly the running estimate follows. Slow enough that the profile
        // rebuild, which lands six times a second and takes about 1.4 ms, cannot
        // move it on its own.
        smoothing: 0.05
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
        // 24, NOT 10.5, AND IT MOVED TWICE FOR TWO DIFFERENT REASONS. The
        // waterline for a given water level sits at `shoreZ + level / slope`, so
        // a rising sea walks it shoreward at four and a half metres per metre of
        // surge on this beach.
        //
        //   10.5 ran out at a surge of 0.99 m, and the tsunami needs 1.55, so
        //        the sea climbed off the end of the beach before reaching the
        //        camera. Moved to 16.
        //   16   ran out once the swash got a bore behind it. Run up is now
        //        derived from bore depth at 9.53 metres per metre, so the
        //        tsunami's bore runs the best part of ten metres past a
        //        waterline already at z 14.2.
        //   24   ran out again when the bore ceiling went up to clear the tide
        //        at low water. Measured furthest reach over the whole arc: 23.6.
        //   28   ran out a fourth time when the tsunami front was made to GROW
        //        as it approached. A 4.80 m rise puts the waterline at 29.4 all
        //        on its own, and the bore behind it runs another 9.4.
        //   44   ran out a FIFTH time when the wall was sized to occupy the
        //        lower sky. Nine metres of rise floods to z 47 before the bore.
        //   64   ran out a SIXTH time on 2026-08-21 when Steve asked for the
        //        wall to be more massive. 13 m of rise floods to z 68 and the
        //        bore runs another 9.4 past that. THE TEST CAUGHT THIS ONE
        //        rather than a person, which is what it was written for, and it
        //        caught it in the same minute the height changed.
        //   88   ran out a SEVENTH time an hour later, when he asked for taller
        //        again. 17 m of rise floods to z 86, and the bore behind it is
        //        longer too now that the swell peak has gone up, at 10.5 m.
        //
        // 110 carries the lot with thirteen metres in hand. The pattern is obvious in
        // hindsight and worth stating plainly: EVERY CHANGE THAT MAKES THE WATER
        // MORE DANGEROUS MAKES IT TRAVEL FURTHER, and the sheet is what it
        // travels on. The first three were found by hand. The test now walks the
        // arc with the front's rise and the bore included so the fifth is not.
        //
        // AND IT WORKS THE OTHER WAY TOO, which is worth knowing before reaching
        // for `tsunami.riseNear`: this number is the real ceiling on how tall the
        // wall is allowed to be, and `riseFar` is capped by `riseNear` in turn.
        // Wanting a bigger wall means moving this first.
        //
        // It stays free. The extra rows land in the flat near strip behind the
        // camera, which has always been below the bottom of the frame.
        //
        // It costs nothing visible. The extra rows land in the flat near strip
        // behind the camera, which has always been below the bottom of the
        // frame, and `rowNear` and `widthPerMetre` follow `camera.fov` rather
        // than this.
        nearZ: 110,
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
        // passes some fraction of the depth it is standing in. That ratio is why
        // the break line sits where it does without anybody placing it.
        //
        // 1.20, AND 0.78 WAS THE WRONG NUMBER FOR THIS BEACH. 0.78 is McCowan's
        // solitary wave limit over a FLAT bottom, and `beach.slope` here is 0.22,
        // which is 1 in 4.5, or a twelve degree face. That is a steep beach, and
        // on a steep beach the breaker index runs far higher: the wave surges up
        // the slope and plunges rather than spilling, and measured indices of
        // 1.0 to 1.2 are ordinary there. So this is MORE physical than what it
        // replaces, not less, which was a pleasant surprise.
        //
        // IT IS ALSO THE ONLY LEVER ON THE HEIGHT OF A BREAKING WAVE, and that
        // is the thing worth knowing before touching any of this. Measured with
        // the CPU port of the vertex shader over t=30..57, sweeping the swell
        // alone and changing nothing else:
        //
        //     swell   tallest wave in frame   deep water crest
        //     2.40           95 px                 1.80 m
        //     2.76          100                    2.09
        //     3.12          103                    2.39
        //     4.80          110                    3.86
        //
        // A DOUBLED SWELL BUYS FIFTEEN PIXELS. The height of a breaking wave is
        // 0.78 (now 1.20) times the depth it breaks in, and a bigger swell
        // simply breaks further out, where it is taller AND further away, and the
        // two cancel almost exactly in angular terms. The background swell is not
        // depth limited and does grow, which is the second column. Steve asked
        // for taller waves and the swell curve on its own could not have given
        // him any. This could:
        //
        //     break   swell   minJacobian  tallest  face angle
        //      0.78    2.40        0.390      95 px     30 deg    <- was
        //      0.95    2.40        0.312     118        36
        //      1.10    2.40        0.242     139        49
        //      1.20    2.40        0.216     154        62
        //      1.20    2.76        0.156     161        62        <- is
        //      1.35    2.76        0.099     184        83        too tight
        //      1.50    2.76        0.040     205        90        too tight
        //
        // The last column is the surprise and it is worth reading twice. The
        // crest face gets STEEPER as the cap comes up, from 30 degrees to 62,
        // with `storm.lean` completely untouched. A taller wave is a steeper
        // wave, because the face is height over horizontal separation and the
        // lean only controls the second of those. The sea did not trade its
        // pitch for its size here; it got both.
        //
        // The fold margin is what is paid instead: 0.390 down to 0.156. That is
        // above the 0.1 this file has treated as the floor and below the third
        // of a margin the lean note wants held, so 1.35 was measured, looked at,
        // and left alone. It is the next stop if the sea is ever wanted bigger
        // again, and it wants the swell peak brought back down to pay for it.
        // ---- How glossy the surface is -------------------------------------
        //
        // THE SUN'S GLINT PATH IS A SPECULAR LOBE AND THIS IS ITS WIDTH. Three's
        // directional light on a surface this smooth puts a very tight highlight
        // wherever a wave facet happens to line up with the sun, and that
        // scatter of highlights smeared along the swell IS the glint path. It is
        // the best thing in the frame on the bright afternoon the scene opens
        // on, and it is why this is 0.08 rather than anything sensible for
        // water.
        //
        // AND IT WAS STILL THERE UNDER THE STORM, WHICH IS THE BUG. By the time
        // the shelf cloud has closed over, the sky's own sun disc is gated out
        // by `1.0 - cloud * 0.85` in `oceanSkyColor` and nothing in the frame
        // shows a sun at all. The light did not get the message: a
        // DirectionalLight at 34 per cent of midday was still throwing a hard
        // white highlight off a sun the visitor cannot see. Steve reported it
        // four separate times as the sea being blown out under the storm, and
        // every time the suspicion was the lightning or the sky, because that is
        // where the brightness was expected to come from.
        //
        // CUTTING THE LIGHT DOES NOT FIX IT, and that is worth writing down
        // before somebody tries. GGX's D term goes as 1/roughness^4, so at 0.08
        // the peak is four orders of magnitude over saturation and the intensity
        // is a nearly inert knob. Measured on the storm sky, peak screen value
        // of the specular alone:
        //
        //     sunIntensityScale   0.34 -> 255      0.020 -> 252
        //                         0.20 -> 255      0.005 -> 235
        //                         0.10 -> 255      0.001 -> 160
        //
        // Seven times less light and it is still pure white. Same family of
        // mistake as `storm.lightning.skyGain`: see the note there.
        //
        // ROUGHNESS IS THE LEVER. Same measurement, sweeping this instead:
        //
        //     roughness   clear sky   full gloom
        //       0.08        255          255
        //       0.18        254          249
        //       0.25        246          227
        //       0.35        215          155
        //       0.50        125           60
        //       0.65         58           22
        //
        // And it is the physical answer as well as the effective one. Microfacet
        // roughness models the surface structure BELOW the size of a mesh cell,
        // which on this sea is every ripple under about half a metre. A calm
        // afternoon has almost none of that and is close to a mirror. A sea
        // under a storm is covered in it. Cox and Munk measured the mean square
        // slope of the sea surface rising roughly linearly with wind speed,
        // about eight fold from a light breeze to a gale, so a storm surface
        // being several times rougher than a calm one is the direction the
        // physics points even if the exact mapping to a GGX alpha is not one
        // this file should pretend to.
        //
        // 0.52 puts the storm peak around 55, which against a sea body of 40 to
        // 70 is a sheen rather than a highlight. The glint path does not dim, it
        // stops existing, which is what an overcast sky does to it. The sea does
        // not go dull: the mirror that gives it its colour and its shape is the
        // Fresnel sky term in `FRAGMENT_REFLECT`, which is applied after the
        // lighting and does not read this at all.
        //
        // Walked by `gloom` in `updateWater`, so the glint fades out over the
        // same forty seconds the cloud takes to close.
        roughness: 0.08,
        stormRoughness: 0.52,
        breakRatio: 1.20,
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
        //
        // THIS NUMBER IS ONLY THE FIRST FRAME. `storm.lean` overrides it from
        // the sea state every single frame (see `updateWater`, `sea.lean`), so
        // the value that any rendered frame actually uses comes from that curve
        // and this one is just where the uniform starts. It is held equal to
        // `storm.lean`'s first keyframe so the two cannot disagree.
        //
        // WORTH SAYING LOUDLY BECAUSE IT INVALIDATES A MEASUREMENT. Sweeping the
        // fold against THIS number on 2026-08-21 produced a table describing a
        // sea the scene never draws: it said the shipped margin was 0.112 and
        // the surf face was 59 degrees, when with the real curve they are 0.390
        // and 30 degrees. The 30 matches the "31 degrees" recorded further up
        // this file, which is what caught it. Anything sweeping the fold has to
        // read `leanAt(t)`.
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

        // ---- When the sound of a wave is reported --------------------------
        // `detectBreaks` fires a crash when the whitewater at the break line
        // PEAKS, measured off the same phasor the shader brightens the foam
        // with, so what is heard and what is seen are one number read twice.
        // Steve's "the crashing sounds don't line up with the visual waves" was
        // the old per-component counter, which ran on two rhythms at once.
        //
        // A floor under the spacing. The chop rides over the swell, so the foam
        // genuinely brightens two or three times within one arriving wave and
        // those are worth hearing, but the phasor also jitters where components
        // beat and that jitter is a rattle. Long enough to swallow the jitter,
        // short enough to leave the real double peaks alone.
        // WHERE THE SURF IS LISTENED AT, in metres in front of the camera, and
        // this is the number that finally lined the sound up with the picture.
        // Detection used to sit at the break line about fourteen metres out,
        // which is where a wave STARTS breaking. The eye watches the frame, and
        // the frame is the near water: screen area goes as 1/d squared, so four
        // metres is worth twelve times fourteen. Measured against the moment the
        // picture actually goes white, the old position was 2.15 SECONDS EARLY.
        //
        //     4 m  0.13 s median offset      10 m  1.62 s
        //     5 m  0.28 s                    12 m  1.97 s
        //     6 m  0.63 s                    14 m  2.55 s  (the old break line)
        breakListenMetres: 4.0,
        breakRefractorySeconds: 0.8,
        // Below this the components are cancelling rather than stacking, which
        // is a lull. The least quiet moment of a sea doing nothing is not a
        // wave breaking and should not be given a crash.
        breakMinProjection: 0.18,

        // Colour. Deep water is not blue so much as dark and slightly green,
        // and the shallow edge picks up the sand under it. Both are lit by the
        // scene, so these read as the water's own tint rather than its final
        // colour.
        deepColor: 0x0d3a4a,
        shallowColor: 0x2f7f86,
        foamColor: 0xeaf4f6,
        // ---- What the sea is made of once the sky closes over ---------------
        //
        // THE BODY COLOUR HAS TO GO GREY WITH THE SKY, and leaving it out was a
        // reported bug: the sea read as darker than the sky above it and as a
        // different colour, in a way that looked like two materials rather than
        // one scene. The cause is where the pixel comes from. Near the horizon
        // Fresnel is close to one, so the water IS the sky and matches it for
        // free. Everywhere else Fresnel is a few percent, so the pixel is almost
        // entirely body colour lit by the lights, and a dark teal tuned for a
        // blue afternoon under a grey lid is exactly a mismatch.
        //
        // Greyer and slightly LIGHTER, which is the counterintuitive half. An
        // overcast sea is not a dark sea, it is a colourless one: the light
        // arriving is white rather than blue, so the water stops being able to
        // be blue, and the whole dome is bright rather than just the sun.
        // Blended by the arc's gloom, so the two can never be out of step.
        //
        // LIFTED FOR THE SAME REASON `sky.storm` WAS. These are albedos rather
        // than rendered colours, so they are not inverted through ACES directly,
        // but they are multiplied by light that has been dimmed and then tone
        // mapped, and the first pass wrote them by eye at (36,52,60) and
        // (80,102,108) against a day palette of (13,58,74) and (47,127,134).
        // Less saturated and no brighter is not a grey sea, it is a dark one.
        stormDeepColor: 0x3f5058,
        stormShallowColor: 0x7c9298,
        opacityNear: 0.82,      // thin water over sand shows the sand

        // The tide moves the whole waterline slowly up and down the beach. A
        // full cycle is deliberately longer than the day cycle so the two never
        // line up into a pattern anyone can hear coming.
        tideRange: 0.55,
        tidePeriodSeconds: 560,

        // SETS. Real waves arrive in groups of a few large ones followed by a
        // lull, and that pattern is what makes watching the sea feel like
        // anticipation rather than wallpaper. A slow envelope on each wave
        // component's amplitude, so a run of large waves breaks further out and
        // the whole break line moves seaward for half a minute before easing
        // back. The two periods do not divide evenly, so the rhythm takes
        // minutes to come back around and nobody hears the pattern repeat.
        setPeriodSeconds: 74,
        setSubPeriodSeconds: 29,
        setDepth: 0.45,

        // How often the per-row profile is rebuilt on the CPU, in hertz.
        //
        // THIS WAS 6, AND THE COMMENT DEFENDING IT IS THE BUG. It read: "the
        // profile only changes as the tide and the set envelope move, both of
        // which are measured in minutes, so this can be far below frame rate."
        // Every word of that was true of the ambient sea it was written for. The
        // storm arc broke it on 2026-08-19 and nobody came back here. The surge,
        // the tsunami front, and the swell all move in SECONDS now, and all
        // three arrive through this function, so at 6 Hz they were being
        // redrawn ten times a second slower than the sea around them.
        //
        // Steve reported it as the scene lagging during the surge and the water
        // "receding from the beach" lagging too. Neither was a frame rate. They
        // are the same stutter seen twice, and it was measured in pixels of jump
        // per update rather than in frames:
        //
        //                    waterline      the wall at t=78
        //     6 Hz             21 px            217 px
        //     20 Hz           6.4 px             65 px
        //     30 Hz           4.3 px             43 px
        //     60 Hz           2.1 px             22 px
        //
        // AND THE COST IS AFFORDABLE, measured through a rebuild of the whole
        // drawback: 7.7 ms of CPU per second of scene at 6 Hz, 23 at 20, 35 at
        // 30, 70 at 60. The worst single rebuild is 1.3 ms at every rate, so
        // raising this makes the cost more EVEN as well as larger: at 6 Hz one
        // frame in ten pays 1.8 ms and the rest pay nothing.
        //
        // 20 is a first step rather than a final answer. The ceiling is not the
        // CPU, it is the upload: `refreshAttributes` writes five vec4s per
        // vertex, which is 3.97 MB, and 79 MB/s at this rate. Every value in it
        // is per ROW and duplicated across all 200 columns, so the real
        // information is 20 KB. Fixing THAT is what would allow 60 Hz, and it is
        // the long-standing "attribute broadcast" note. Use `oceanProfileHz(n)`
        // in the console to find the number this machine likes before changing
        // it here.
        profileHz: 20,
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
        // THE RUN UP USED TO BE SET BY WHERE THE CAMERA SITS AND IT IS NOT ANY
        // MORE, which is worth stating because the old reasoning was sound and
        // the scene outgrew it. It ran: the physical answer for a 1.7 metre
        // breaker is the Iribarren number, which at this slope and swell comes
        // out around 1.3, giving 2.2 metres of vertical run up and TEN METRES
        // horizontally on a 1:4.5 beach. The camera sits two metres shoreward of
        // the still water line, so a real swash would run eight metres past it
        // and the visitor would be knee deep with the lens under water. That was
        // written as a problem to be avoided, and the run up was scaled down to
        // the compressed geometry to avoid it.
        //
        // A VISITOR KNEE DEEP WITH THE LENS UNDER WATER IS NOW THE GOAL. So the
        // scaling is gone and the run up comes out of the bore depth below,
        // which is the honest direction for it to come from anyway. What the old
        // note got right is that this beach is compressed: the surf zone is ten
        // metres wide where a real one on this swell would be several times
        // that. The consequence lands on `beach.nearZ` rather than here, because
        // a swash that runs further needs sheet under it, and that is a length
        // of mesh rather than a compromise on the water.
        swash: {
            // ---- The bore ---------------------------------------------------
            //
            // HOW DEEP THE WATER IS WHEN IT ARRIVES, and it replaced a pair of
            // run up distances because a distance cannot answer the question
            // the scene actually needed. Steve asked for waves that sometimes
            // break over the visitor, and the old numbers said how FAR the
            // water came without ever saying how MUCH of it there was, so a
            // swash could be configured to run ten metres and still be a
            // millimetre thick.
            //
            // RUN UP IS NOW DERIVED FROM THESE. Ritter's dam break solution
            // gives the front of a released body of water of depth d a speed of
            // 2 sqrt(g d), and a sheet leaving at that speed and decelerating
            // under `swashDecel` stops after u0^2 / 2a, so X = 2 g d0 / a. On
            // this beach that is 9.53 metres of run up per metre of bore, and
            // the two can no longer disagree.
            //
            //   0.07 m of bore -> 0.67 m of run up   (the old minRunUp was 0.6)
            //   0.30 m of bore -> 2.86 m of run up   (the old maxRunUp was 2.4)
            //
            // So the calm beach is almost exactly where it was, which is the
            // point: this is a better description of the same sea, not a
            // different one.
            //
            // SCALED BY THE SWELL AT THE MOMENT OF BREAKING, which is what makes
            // the storm dangerous. A bigger swell breaks in deeper water, so the
            // breaker feeding the bore is genuinely bigger even though it does
            // not LOOK bigger from the beach (see `beach.slope`). At the storm
            // peak a 0.9 strength set gives a 0.63 m bore, and 0.63 m of water
            // on top of a surge that has already put the sea past the camera is
            // over the visitor's head. Ordinary sets at 0.55 strength give
            // 0.39 m and wash past at chest height without covering the lens,
            // which is the "sometimes" that was asked for.
            //
            // 0.38 AND NOT 0.30, BECAUSE OF THE TIDE. The tide swings the water
            // level a quarter of a metre either way on its own clock, the arc is
            // two minutes, and a visit lands on a roughly random part of that
            // swing. At 0.30 the storm bore cleared the eye at mean and high
            // water and missed entirely at low, so a third of visitors would
            // have been promised waves breaking over them and got none. Raising
            // the BORE rather than the surge is the fix that works: raising the
            // surge instead would have put high water above eye level all by
            // itself and left those visitors under a permanent white-out.
            minBoreDepth: 0.07,
            maxBoreDepth: 0.38,
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

        // ---- The storm base --------------------------------------------------
        //
        // A SECOND SHEET, LOWER DOWN, AND IT EXISTS BECAUSE THE STORM SKY HAD NO
        // VARIANCE IN IT. Measured across the sky band of the QA screenshots,
        // 1st to 99th percentile of luminance:
        //
        //     ocean-2  clear        mean 182,194,208   spread 29
        //     ocean-8  peak storm   mean 191,196,201   spread 13
        //
        // Read the second row twice. Through the whole storm the sky does not
        // get DARKER, it gets very slightly brighter, and its contrast falls by
        // more than half. That is `sky.storm` below working exactly as written:
        // its only two levers are a flat grey palette and `cloudCoverage`
        // dropping to 0.18, and at that threshold most of the noise saturates,
        // so the sheet converges on a single tone. Turning the gloom up harder
        // arrives at featureless sooner. A threatening sky is a HIGH CONTRAST
        // sky, so the missing quantity was never brightness.
        //
        // WHAT THIS DRAWS is the underside of a cumulonimbus, specifically the
        // shelf cloud (an arcus) on the leading edge of an advancing gust front.
        // It is the right cloud for this camera: it comes in over the horizon,
        // it is dark underneath, and the bright strip of sky left between its
        // base and the sea is the whole look. `storm.shelfFadeFrom` is what
        // keeps that strip, and the strip narrowing as the gloom rises is the
        // light being squeezed out.
        //
        // IT IS A DENSITY LAYER, NOT A COVERAGE ONE, AND BUILDING IT THE OTHER
        // WAY WAS THE FIRST MISTAKE HERE. Modelled like the cirrus sheet above,
        // where the noise threshold decides PRESENCE, the base opened up into
        // clear sky whenever the drift carried a low patch across the frame:
        // swept over the drift, the contrast measured anywhere from 43 to 93 and
        // the sky periodically lost its storm altogether. A real overcast base
        // has no gaps in it, only thick parts and thin parts, so `coverage` here
        // is set low enough to be near total and all of the variation comes from
        // `depth` shading between `light` and `dark`. Swept again over the same
        // drift the contrast holds at 92 and the bright strip holds at 145.
        //
        // THE VISIBLE SKY IS 20 DEGREES TALL. `camera.fov` is 40 and the camera
        // is dead level, so a view ray leaving the top of the frame has a dir.y
        // of about 0.34 and everything in this block has to live inside that.
        // Numbers that read like a whole hemisphere are out of frame.
        shelf: {
            // A LOWER PLANE THAN THE SHEET ABOVE, which is the whole of what
            // makes it read as a lower cloud. Same projection, and half the
            // divisor means features twice the size that converge toward the
            // horizon twice as fast. `cloud.scale` is 0.9 for the cirrus.
            scale: 0.42,
            // Barely stretched. Cirrus runs at 0.35, which draws features three
            // times wider than they are deep, and a storm base has bulk rather
            // than streaks.
            stretch: 0.75,
            // PRESENCE, and it is deliberately almost total. See above: this is
            // the number that must NOT behave like `cloud.coverage`. Noise
            // averages about a half, so a threshold this low leaves the base
            // solid nearly everywhere and opens only the occasional ragged rent
            // where the lid behind shows through.
            coverage: 0.14,
            softness: 0.16,
            // THICKNESS, and this is where all the contrast comes from. The ramp
            // is centred on the noise's own mean rather than on the coverage
            // threshold, so it uses the full swing of the noise symmetrically
            // and the base has as much thick as thin in it. A mild control: 0.12
            // and 0.22 measure within a level of each other, because the warp
            // below already spreads the distribution wide.
            depth: 0.16,
            // THE WARP IS WHAT MAKES IT CONVECTION. Offsetting the sample point
            // by a second, coarser noise lookup before the octaves are taken
            // bends straight features into billows and curls. Two extra fetches,
            // and it is the difference between a cloud and a gradient. This is
            // the one term in the sky that says the air is moving vertically.
            warp: 1.15,
            // WHERE THE BASE STOPS, AND IT STOPS WELL ABOVE THE HORIZON. The
            // cirrus sheet has to reach the horizon under a storm, for the
            // reason in `storm.cloudFadeTo`. This one is the opposite: the gap
            // between the base and the sea is the bright strip, and the strip is
            // what makes the dark read as dark. These are the CLEAR SKY ends of
            // the ramp, which the gloom walks down to `storm.shelfFadeFrom` and
            // `storm.shelfFadeTo`. At 0.22 the base is confined to the top third
            // of the frame, which is a storm still out at sea.
            horizonFadeFrom: 0.22,
            horizonFadeTo: 0.40,
            // Faster than the sheet above it, because it is lower: the same wind
            // crosses more degrees per second the closer the cloud is.
            driftRatio: 1.8,
            // PIPELINE INPUTS, NOT SCREEN COLOURS. Solved backwards through
            // srgbToLinear -> exposure -> ACES -> the sRGB encode, jointly across
            // the three channels because ACES mixes them and a per channel solve
            // overshoots by about twelve levels. See the note in `sky.storm`,
            // which is where that lesson was paid for and where the arithmetic
            // it records is still missing its last step.
            //
            //     light  write (115,120,130) -> shows (124,130,142)
            //     dark   write ( 65, 68, 76) -> shows ( 53, 56, 66)
            light: 0x737882,
            dark: 0x41444c
        },

        // ---- The lightning flash, as the sky sees it -------------------------
        //
        // WHEN and HOW OFTEN live in `storm.lightning`, because they are the
        // story. These two are the look, and they live here because the flash is
        // a term in the sky's own program and the sea reflects it by
        // construction. See `oceanSkyColor`.
        flash: {
            // Slightly blue of white. A return stroke runs at around thirty
            // thousand kelvin, so the light really is blue, and a warm flash
            // reads as an explosion rather than as lightning.
            color: 0xbcd2ff,
            // The exponent on the cosine to the strike. 3.0 puts the half
            // brightness point about 40 degrees off, which is wide: a flash
            // inside a cloud deck lights a large part of it rather than
            // spotlighting one patch, and a tight falloff looks like a searchlight.
            spread: 3.0
        },

        // ---- How far you can see ---------------------------------------------
        //
        // Haze rather than a hard edge, and its colour is the sky's own horizon,
        // so the far water and the sky it fades into can never disagree. The far
        // rows are a few pixels tall and fog is what turns them into a horizon
        // instead of a seam. These lived in sky.js as literals until the tsunami
        // needed them to move.
        //
        // 400 METRES WAS ERASING THE TSUNAMI, and it took three rounds of
        // looking at the water to find it, because every one of those rounds
        // assumed the problem was the wall. Measured, the wall's visibility
        // against the fog as it approached:
        //
        //     403m   100% fog    invisible
        //     309m    71%
        //     214m    40%
        //     120m    10%
        //      72m     0%
        //
        // So a wall two hundred metres out was more than half painted in the
        // exact colour of the sky behind it, and at first appearance it was
        // literally not there. Steve read that as the wall not rising in the
        // distance and asked whether it was a Three limitation. It was a config
        // number.
        //
        // `clearFar` is where the far edge goes once the tsunami is coming. It
        // is safe to open the distance up now in a way it would not have been
        // before sky.js existed: Fresnel at a grazing angle is about 0.95, so
        // the far water is already reflecting almost exactly the sky above it
        // and needs far less fog to sit down against the horizon. And once the
        // wall is up it hides the sheet's own far edge behind itself.
        fog: {
            near: 90,
            far: 400,
            clearFar: 1000
        },

        // ---- The storm sky ---------------------------------------------------
        //
        // ONE PALETTE, NOT ELEVEN MORE KEYFRAMES. The day below has eleven hours
        // in it and the arc builds a storm through whichever one the visit drew.
        // Writing an overcast twin for each would be eleven more chances for two
        // lists to drift apart, so `applyGloom` blends the hour toward this
        // single set instead. That also means it keeps working if the held sun
        // is ever moved back onto a cycle.
        //
        // THE SUN STAYS EXACTLY WHERE IT IS. Only what it delivers goes. An
        // overcast sky is not a sunset and not a night: the sun is still up
        // there, you simply cannot see it, so the light goes flat and grey
        // rather than going dark or going warm. Moving the sun to sell a storm
        // would put the water's specular lobe somewhere the time of day does not
        // agree with, and the sea would read as the wrong hour rather than as
        // the wrong weather.
        storm: {
            // Two thirds of the sun's punch gone, which is roughly what a thick
            // overcast costs. Cutting both equally is the classic mistake and it
            // reads as dusk rather than as weather.
            sunIntensityScale: 0.34,
            // AND THE FILL DOES NOT DROP AT ALL, which looks like a mistake and
            // is the physics. A clear sky delivers ambient from a deep blue dome
            // plus a small bright sun. An overcast one delivers it from a dome
            // that is uniformly bright white, and the total is comparable or
            // higher: it is why a grey day still hurts to look up at. This was
            // 0.85, and the sea came out darker than the sky above it, which
            // was reported twice before the cause was found.
            hemiIntensityScale: 1.00,
            // THESE ARE PIPELINE INPUTS, NOT SCREEN COLOURS, AND WRITING THEM
            // AS SCREEN COLOURS IS THE BUG THAT TOOK THREE ROUNDS TO FIND. Every
            // colour here goes srgbToLinear -> exposure -> ACES -> sRGB before
            // anybody sees it, and ACES crushes mid tones hard. Measured on the
            // values this section used to hold:
            //
            //     cloudColor  written (76,82,92)    showed as ( 18, 22, 30)
            //     zenith      written (57,64,74)    showed as (  7, 10, 15)
            //     horizon     written (106,113,122) showed as ( 48, 56, 67)
            //
            // So the "grey lid" was rendering at about (19,23,31), which is
            // black, and the sea reflecting it came out black next to the parts
            // of the sky near the sun that were not. That is the dark grey
            // reflection that kept being reported and kept surviving fixes
            // aimed at the water, because the water was innocent.
            //
            // The day keyframes below never had this problem because they were
            // tuned by looking at screenshots, so they are already compensated:
            // midday horizon is written (196,220,237) and shows as (164,180,190).
            // These were written by eye against no screenshot at all.
            //
            // AND THEN THE SOLVE ITSELF WAS WRONG, WHICH TOOK A FOURTH ROUND TO
            // FIND. The fix above worked the pipeline backwards as srgbToLinear
            // -> exposure -> ACES and stopped there, but there is one more stage:
            // `<colorspace_fragment>` encodes the tone mapped result back to sRGB
            // on its way to the screen, because `renderer.outputColorSpace` is
            // sRGB. Leaving that stage out understates the result by about
            // forty seven levels, so every colour here was solved to a target it
            // then sailed straight past. What the old values actually rendered:
            //
            //     cloudColor  write (179,190,201) -> aimed (145,154,164) -> SHOWED (192,198,204)
            //     horizon     write (172,181,194) -> aimed (136,145,157) -> SHOWED (187,192,200)
            //     zenith      write (157,159,174) -> aimed (117,119,136) -> SHOWED (173,175,186)
            //
            // Confirmed against the QA screenshots rather than argued: the sky
            // band of ocean-8.png, at full gloom, measures (191,196,201) against
            // the (192,198,204) predicted for the old cloudColor. The storm sky
            // was a whole stage of the pipeline brighter than its author meant.
            //
            // These are the same targets, re-solved with the encode included and
            // jointly across the three channels, because ACES mixes them and a
            // per channel solve overshoots by about twelve levels:
            //
            //     cloudColor  write (130,139,149) -> shows (144,154,164)
            //     horizon     write (123,132,143) -> shows (136,146,157)
            //     zenith      write (110,112,126) -> shows (117,120,136)
            //
            // A thick overcast is still BRIGHT and the argument above still
            // stands. It is uncomfortable to look up at, and the bright strip
            // this leaves along the horizon is exactly what `sky.shelf` needs to
            // sit its dark base against. What it is not is the SAME brightness
            // as the clear sky it replaced, which is what was shipping.
            //
            // ONLY THE THREE SKY COLOURS MOVE. `hemiSky` and `hemiGround` are
            // light intensities that reach the screen through the sand and the
            // sea rather than as colours of their own, they were tuned by looking
            // at the water, and the note above records that dropping the fill was
            // reported as a bug twice. They stay exactly where they are.
            zenith: 0x6e707e,
            horizon: 0x7b848f,
            hemiSky: 0xa8b0bb,
            hemiGround: 0x6a6459,
            cloudColor: 0x828b95,
            cloudOpacity: 0.94,
            // COVERAGE IS A THRESHOLD ON NOISE, so lowering it does not darken
            // the clouds that are there, it makes there be more of them. 0.52
            // leaves clear sky between high streaks. 0.18 is a lid. That is the
            // difference between a bright day with cloud on it and a sky that
            // has closed over, and it is the single most effective number here.
            cloudCoverage: 0.18,
            // WHERE THE CLOUD STOPS, AND THIS ONE IS A BUG FIX RATHER THAN A
            // LOOK. The clear sky fades its cloud out below nine degrees, for
            // the good reason in `cloud.horizonFadeTo`: the projection divides
            // by elevation, so near the horizon the noise gets finer than a
            // pixel and reads as a shimmer.
            //
            // The water then showed the storm before the sky did. A reflection
            // off flat water at a grazing angle leaves at the same grazing
            // angle, so it samples the band that has no cloud in it, while a
            // reflection off a tilted WAVE FACE points steeply up into cloud
            // that is already black. The sea came out in grey swatches on the
            // wave faces against clear sky between them, none of it matching the
            // dome overhead, and it started happening long before the sky looked
            // like anything at all.
            //
            // A real overcast covers the sky down to the horizon, so the lid
            // has to as well. Only the TO edge moves: the FROM edge is what
            // clamps the projection divisor, and lowering that is what would
            // bring the shimmer back.
            cloudFadeTo: 0.03,
            // Up, not down. Tone mapping is what keeps a grey sky looking like
            // weather rather than like an underexposed photograph, and a storm
            // sky is genuinely bright even while it is dark in colour.
            // Back down to 1.0 now the palette carries the brightness itself.
            // 1.12 was compensating for colours that were too dark, which is a
            // second dial doing the first dial's job, and it lifted the sun's
            // halo and the foam along with the sky.
            // HOW MUCH OF THE SUN SURVIVES, applied to the halo, the aureole,
            // the disc, and the sunlit undersides of the cloud. THREE OF THOSE
            // FOUR WERE NOT BEING TOUCHED AT ALL: the halo and aureole were
            // scaled only by twilight, and the disc and the cloud's sunlit mix
            // were set once when the sky was built and never updated. So under a
            // thick overcast the sky still carried a full sun, and the sea, which
            // reflects the sky by construction, carried it too. Steve saw it on
            // the tsunami: a bright reflective wall where a dark one is far more
            // threatening.
            //
            // 0.04 rather than 0 because a real overcast is not perfectly even.
            // There is usually a slightly brighter patch where the sun is, and
            // taking it to nothing makes the sky look painted.
            sunGlowScale: 0.04,
            exposure: 1.00,

            // ---- The storm base, and how fast the whole sky moves ------------
            //
            // How much of `sky.shelf` is there at full gloom. Not quite 1, so a
            // little of the lid behind it survives in the thinnest parts and the
            // base has something to be in front of.
            shelfOpacity: 0.92,
            // WHERE THE BASE STOPS, walked down from `shelf.horizonFadeFrom` as
            // the gloom rises. That descent IS the storm arriving: the bright
            // strip along the horizon starts as most of the frame and is squeezed
            // down to a band a few degrees tall. At full gloom the base covers
            // everything above about 7.5 degrees and the strip below it is the
            // only light left in the sky.
            shelfFadeFrom: 0.045,
            shelfFadeTo: 0.13,
            // HOW MUCH FASTER THE SKY MOVES UNDER A STORM. `cloud.driftSpeed` is
            // deliberately slow enough to be noticed having moved rather than
            // noticed moving, which is right for an ordinary afternoon and wrong
            // for a gust front: outflow cloud moves visibly, and a sky that
            // ACCELERATES is a threat cue that costs one uniform. At 6x the base
            // crosses about half a degree a second, so a feature takes some forty
            // seconds to cross the frame. Plainly moving, and not a timelapse.
            //
            // CAREFUL: this makes the drift a rate rather than a position, so
            // `updateSky` has to INTEGRATE it. Multiplying an elapsed time by a
            // speed that changes would jump the clouds backwards every time the
            // speed rose. See the note there.
            driftSpeedScale: 6.0
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
    // TWO MINUTES, WITH AN ENDING. Steve tried three and it dragged, which is
    // the right way round to find that out. Every time below moved with it, and
    // NOT PROPORTIONALLY: the opening lost the most because it is the part with
    // least happening, and the drawback lost the least because it needs a real
    // number of seconds on the clock to be read as wrong rather than as a lull.
    //
    //     stage      3 min    2 min
    //     ordinary    0-35     0-20    establishing, and it does not need long
    //     turning    35-90    20-55
    //     storm      90-130   55-85    the white-outs happen in here
    //     drawback  130-150   85-100   15s, down from 20, and no shorter
    //     tsunami   150-180  100-120
    //
    // The scene opens as an ordinary bright day, the swell builds until the sea
    // is frightening, the sky closes over, the water starts coming over the
    // camera, the sea withdraws, a tsunami arrives, and the page fades to black.
    //
    // THE SEA IS THE ONLY THING THAT CHANGES. The sun is held (see `cycle`), the
    // camera never moves (see `camera`), and there is nothing to click. That is
    // deliberate: with one signal in the frame, a visitor reads every change as
    // meaning something, which is exactly the effect a horror scene wants and
    // exactly the effect a busy one destroys.
    storm: {
        seconds: 90,
        // Start times, not ranges, so two stages can never overlap or leave a
        // gap. The last one runs to `seconds`. Names are for the debug label
        // rather than for anything visual, since every visible quantity below
        // interpolates straight through the boundaries.
        stages: [
            { from: 0,   name: 'ordinary' },   // the sea as it has always been
            { from: 12,  name: 'turning' },    // the swell starts to build
            { from: 34,  name: 'storm' },      // faces near vertical, first engulfment
            // THE LULL IS STEVE'S AND IT IS THE BEST NOTE OF THE THREE. The
            // drawback used to begin straight off the storm's peak, so a set was
            // always mid flight when the sea started leaving, and the visitor
            // watched a large wave approach and then quietly dissolve on its way
            // in. It read as the scene losing its place rather than as the sea
            // doing something.
            //
            // A real drawback is preceded by exactly this: the sea stops. Six
            // seconds of a flat, silent ocean after ninety seconds of building
            // storm is the loudest thing in the arc, and it costs one keyframe.
            { from: 52,  name: 'lull' },       // the sea stops, and that is worse
            { from: 60,  name: 'drawback' },   // then it goes the wrong way
            { from: 76,  name: 'tsunami' }
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
        //
        // RAISED ABOUT FIFTEEN PER CENT ON 2026-08-21, AND IT IS THE SMALL HALF
        // OF THAT CHANGE. Steve asked for taller, more threatening waves. This
        // curve cannot deliver a taller BREAKING wave at any value, because the
        // breaker is depth limited and a bigger swell just breaks further out:
        // see the table on `water.breakRatio`, which is where that height
        // actually came from. What this curve does control is the background,
        // which is not depth limited, and a bigger background is what keeps the
        // horizon hidden further out. The first two keyframes are deliberately
        // NOT raised, so the ordinary afternoon the scene opens on is exactly
        // the one it always opened on. Measured, no crest clears the eye at all
        // before t=12 either way.
        swell: [
            { at: 0,   value: 1.00 },
            { at: 12,  value: 1.05 },   // barely, and only so it is already moving
            { at: 34,  value: 2.05 },   // the horizon starts going
            { at: 54,  value: 2.76 },   // the peak of the storm
            // THE SEA STOPS. Down past calm, to a third of the sea the scene
            // opened with, in six seconds. Nothing else in the arc moves this
            // fast and nothing else should: every other curve here is a weather
            // system and this one is the bottom dropping out.
            { at: 58,  value: 0.30 },
            { at: 66,  value: 0.28 },   // and stays there while the water leaves
            // THE PEAK LANDS WITH THE FRONT, NOT AFTER IT. This used to reach
            // 2.60 at t=116, which is a second after the fade has started, so
            // the biggest sea in the whole scene happened behind the blackout.
            // Steve's words: it ends just as the waves get good.
            { at: 76,  value: 2.00 },
            { at: 80,  value: 2.90 },
            { at: 90,  value: 2.90 }
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
            { at: 34,  value: 2.60 },
            { at: 52,  value: 1.60 },
            { at: 90,  value: 1.20 }
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
        // THE TAIL IS TIMED SO THE TSUNAMI IS SEEN BEFORE IT ARRIVES. The first
        // version ramped from the drawback straight to the peak over twenty two
        // seconds, and walking it showed the white-out saturating at t = 165,
        // seven seconds before the fade even starts. The visitor would have
        // waited three minutes and then watched the ending through a blank white
        // rectangle. The bore is what does it: the surge alone is only halfway
        // up at that point, and half a metre of bore on top of it is enough.
        //
        // So the level is held low while the sea comes back, which gives about
        // twenty seconds of an enormous visible swell with the break line
        // marching in, and only crosses the eye at the very end.
        surge: [
            { at: 0,   value: 0.00 },
            { at: 34,  value: 0.15 },
            // A PLATEAU AND NOT A PEAK, and the difference is how many waves get
            // to hit you. Whether a bore covers the eye depends on the sea being
            // already high when it arrives, so the number of white-outs in the
            // storm is set by how long this sits up rather than by how high it
            // gets. A single peak at 74 gave exactly one hit in the whole storm,
            // because only one break happened to land on it.
            { at: 42,  value: 0.55 },   // ankle deep at the camera, no more
            { at: 52,  value: 0.55 },
            // Back to an ordinary water level for the lull, so the sea is flat
            // AND normal. A lull on a raised sea would still look like weather.
            { at: 57,  value: 0.05 },
            { at: 60,  value: 0.00 },   // the sea is flat AND at its own level
            { at: 66,  value: -0.90 },  // drawback, and the beach is bare
            // THE RECOVERY HAS TO TRAVEL WITH THE FRONT. It used to lag it, so
            // when the front arrived carrying 1.70 m the water at the camera
            // came out below the eye: the tsunami reached the visitor and did
            // not cover them, because the sea underneath it was still drawn
            // back. The drawback ends when the thing that caused it arrives.
            { at: 74,  value: -0.85 },
            { at: 79,  value: 0.10 },
            { at: 83,  value: 0.30 },
            { at: 90,  value: 0.35 }
        ],
        // How far either side of eye level the white-out ramps, in metres. A
        // hard switch at exactly eye level would flicker every time a crest
        // passed, since the surface is never still.
        // ---- How far you can see, over the arc -------------------------------
        //
        // 0 is the fog the scene runs on and 1 is `sky.fog.clearFar`. It opens
        // during the LULL, before the wall exists, which is both the useful
        // order and the eerie one: the sea goes quiet, the haze lifts, and the
        // thing you can now see all the way to the horizon is the thing that is
        // coming. Opening it later would mean the wall appeared and the air
        // cleared at the same moment, which reads as a trick.
        clarity: [
            { at: 0,  value: 0.00 },
            { at: 52, value: 0.00 },   // the lull begins
            { at: 60, value: 0.75 },
            { at: 66, value: 1.00 }
        ],

        // ---- The calm sweeping in ------------------------------------------
        //
        // THE SEA CANNOT GO FLAT ALL AT ONCE, and dropping the swell curve does
        // exactly that: amplitude is a function of the row and the current
        // swell, with no memory of waves already in flight, so every wave in the
        // scene shrinks at the same instant. What it looks like is the large one
        // you are watching melting ten metres short of the break. Reported
        // twice, the second time after a fix that had only slowed it down.
        //
        // So the calm TRAVELS. The storm stops making waves out at sea, the
        // boundary sweeps in, and the last waves it made keep coming and break
        // properly while the water behind them is already flat. The sea empties
        // from the horizon inward, which is both what happens and a far better
        // picture than a sea that deflates.
        //
        // It starts at 170 m rather than at the fog limit because past that a
        // crest is three or four pixels and the swell curve dropping on its own
        // out there is invisible. 200 m over ten seconds is 20 m/s, faster than
        // the waves themselves, but the 50 m blend means any given wave takes
        // two and a half seconds to give up rather than one frame.
        lull: {
            startAt: 52,
            endAt: 62,
            fromZ: -170,
            toZ: 30,
            width: 50
        },
        engulfWashMetres: 0.35,
        // How long the white-out takes to run off the lens once the water has
        // dropped back below the eye, in seconds. INSTANT ON, GRADUAL OFF: a
        // wave hitting you is sudden and draining is not, so `washEnvelope` is
        // deliberately asymmetric. Released LINEARLY so it reaches exactly zero,
        // where an exponential would leave a percent of white on the screen for
        // the rest of the scene, which is most of the bug this was added for.
        washReleaseSeconds: 0.9,
        // And how long it takes to arrive. FAST IS NOT INSTANT. The first
        // version had no attack at all: the target was taken straight whenever
        // it was rising, so the screen went from clear to full white in a single
        // frame. Sixteen milliseconds is not how water arrives, it is how a
        // camera flash goes off, and it was reported as exactly that. The lens
        // model makes it worse, because a bore is at full thickness the instant
        // it reaches you, so the signal underneath really is a step and
        // something has to turn it into a wave. A fifth of a second is about how
        // long a wall of whitewater takes to cover a face.
        washAttackSeconds: 0.22,
        // ---- The sky closing over -------------------------------------------
        //
        // 0 is the day the visit drew and 1 is the overcast lid in `sky.storm`.
        // Runs AHEAD of the swell on purpose: weather arrives before the sea it
        // makes does, because a swell has to travel and a cloud front does not,
        // so the sky going grey is the first sign anything is wrong. That is
        // also the most useful thing it can do dramatically, since it is the
        // only cue the visitor gets before the water starts behaving badly.
        //
        // It does NOT clear for the tsunami. There is a version of this scene
        // where the sun comes back out for the ending and it is a better film
        // and a worse beach: weather does not politely leave before a wave
        // arrives, and the sea being lit by a sky that has given up is the
        // whole look of the last thirty seconds.
        // The keys are placed so the gloom LEADS the swell at every second of
        // the arc, not just at the ends, and there is a test that walks it and
        // compares how far each has travelled toward its own finish. An earlier
        // version flattened between 45 and 80 while the swell was climbing
        // hardest, so for about ten seconds in the middle the sea was outrunning
        // the weather that was supposed to be causing it.
        // IT STARTS MOVING AT ONCE, which is Steve's call and the right one. It
        // used to sit near zero for the first fourteen seconds so the scene
        // could open as an unambiguously ordinary day, and the effect was that
        // the sea started building while the sky was still innocent, so the
        // weather looked like a consequence of the surf rather than its cause.
        //
        // Dark cloud is the only warning the visitor gets and it costs nothing
        // to give it early. The first frame is still clean, which is all the
        // "ordinary bright day" opening actually needs: what sells the turn is
        // the CHANGE, and a change is easier to notice while you are still
        // looking at the thing it starts from.
        gloom: [
            { at: 0,   value: 0.00 },   // the first frame, and only the first
            { at: 4,   value: 0.12 },
            { at: 14,  value: 0.42 },
            { at: 32,  value: 0.75 },
            { at: 54,  value: 0.94 },
            { at: 74,  value: 1.00 }    // fully closed before the tsunami lands
        ],
        // ---- The lightning ---------------------------------------------------
        //
        // READ THE RATE LIMIT FIRST. Everything else here is taste and this one
        // is not. A real strike is three or four return strokes about fifty
        // milliseconds apart, which is twenty flashes a second, and twenty hertz
        // is in the middle of the band most likely to provoke a seizure in a
        // photosensitive viewer. WCAG 2.3.1 asks for no more than three general
        // flashes in a second, and a flash that covers the whole sky and most of
        // the sea is a general flash by any reading.
        //
        // So the flicker is not reproduced, and the limit is on by DEFAULT
        // rather than behind the reduced motion query. Putting the safe version
        // behind a setting only protects the people who already found the
        // setting. `minGapSeconds` is enforced flash to flash rather than strike
        // to strike, which is what makes the ceiling hold across the boundary
        // between one strike and the next as well as inside a double.
        //
        // A double flash a third of a second apart is still unmistakably
        // lightning. A real strike with one distinct second stroke looks exactly
        // like this, which is the happy part: the safe version is also a version
        // that happens in nature.
        lightning: {
            // Strikes per second, over the arc. Nothing at all until the sky has
            // closed over, because a bolt out of a bright sky is a different
            // kind of scene, and because the first sign of trouble should stay
            // the cloud. By the tsunami it is nearly one a second, which with
            // the gap below is as busy as this is ever allowed to get.
            // TRIMMED BY ABOUT A FIFTH ON 2026-08-20, together with a raised
            // `boltChance`, so that the count of flashes WITH NO CHANNEL IN THEM
            // came down by roughly a third while the number of visible bolts
            // stayed where it was. See `boltChance` for the reasoning: the two
            // numbers move together and neither means much alone.
            //
            // AND TRIMMED AGAIN, MUCH HARDER, ON 2026-08-21. Steve watched the
            // whole arc repeatedly and reported that the stretch from the
            // midpoint to the tsunami was disorienting, and that the worst of it
            // was just before the sea starts to recede. He is right and the
            // profile said so plainly: the busiest ten seconds in the entire
            // ninety were 60-70s at 7.65 flashes, which is a flash every 1.3
            // seconds for ten seconds straight. That is not a storm building,
            // that is a strobe. Measured over 600 runs of the arc:
            //
            //                  flashes            channels     flash only
            //                before  after      before  after   before after
            //     40-50s       4.17   2.93        1.38   1.34     2.80  1.59
            //     50-60s       5.74   3.62        1.94   1.71     3.80  1.91
            //     60-70s       7.65   4.20        2.62   1.93     5.03  2.27
            //     70-80s       7.63   4.51        1.59   1.35     6.04  3.15
            //     80-90s       5.75   4.30        0.78   0.71     4.97  3.58
            //     40-90s      30.94  19.56       8.31   7.04     22.64 12.50
            //                        -37%              -15%            -45%
            //
            // THE POINT OF THE TABLE IS THE THIRD PAIR. Well over a third of the
            // light events are gone, but the channels gave up only a sixth of
            // theirs, because the rate came down and `boltChance` went up to
            // meet it. What actually took the cut is the flash with nothing in
            // it, which is down by nearly half. Steve likes the streaks and was
            // troubled by the flashing, so that is the split the numbers were
            // aimed at.
            //
            // Note the last two rows, which are not a mistake. The flash only
            // count now PEAKS over the tsunami rather than before it. That is
            // the same compositional call `boltChance` records: once the wall is
            // coming, a bare flash lights the face of it and helps, while a
            // channel beside it splits the frame and competes.
            rate: [
                { at: 0,  value: 0.00 },
                { at: 22, value: 0.00 },   // the sky closes first, alone
                { at: 30, value: 0.11 },   // the first distant flashes
                // THE CLIMB STOPS AT THE MIDPOINT. Up to here the storm is still
                // introducing itself and the rate is where it always was. After
                // here it goes almost flat, and the storm goes on building
                // through the cloud, the swell, and the light instead. A rate
                // that keeps climbing to the end has nowhere to put the tsunami.
                { at: 46, value: 0.24 },
                // THE ELECTRICAL PEAK LANDS IN THE DRAWBACK, NOT IN THE TSUNAMI,
                // and that is still the shape here, just a far gentler one. The
                // drawback is the twenty seconds where the sea has gone quiet
                // and nothing is happening yet, which is exactly when the scene
                // needs something to carry the tension. The tsunami does not: it
                // arrives with the largest object in the arc and it wants the
                // frame.
                { at: 60, value: 0.30 },
                { at: 70, value: 0.36 },   // the loudest the sky ever gets
                { at: 80, value: 0.33 },   // and it backs off for the wall
                { at: 90, value: 0.30 }
            ],
            // THE CEILING. 0.34 seconds between any two flashes is 2.94 a
            // second. Anyone lowering this should check `flashesPerSecondCeiling`
            // stays under three, and there is a test that walks the whole arc and
            // asserts no pair of flashes ever lands closer than this.
            minGapSeconds: 0.34,
            // How often a strike has a second return stroke, and how far behind.
            // The gap is over the minimum on purpose, so the pair reads as two
            // events rather than as a stutter.
            //
            // THE CHEAPEST FLASH TO REMOVE IS THE SECOND ONE, and that is why
            // this moved from 0.42 to 0.30 on 2026-08-21 rather than the rate
            // taking the whole cut. A second stroke is a whole extra screen wide
            // flash that adds NO new channel, no new position, and no new
            // information: the eye has already been to that part of the sky. So
            // per unit of disorientation removed it is the least costly thing in
            // this section, and roughly a quarter of the trim came from here.
            strokeChance: 0.30,
            strokeGapSeconds: 0.40,
            // The second stroke is not brighter than the first. See the note on
            // `flashLevelAt` for why they are combined with a max.
            secondStrokePower: 0.78,
            // The envelope. Fast up, slow down, and the decay reaches exactly
            // zero rather than trailing off forever.
            attackSeconds: 0.035,
            decaySeconds: 0.28,
            // WHERE THEY ARE. Wider than the frame, which is about 30 degrees
            // either side at this field of view, so some strikes are off screen
            // and show only as a flash. That is most of what a real storm does.
            azimuthDegrees: 46,
            // A channel is only drawn inside this, and then only sometimes.
            boltAzimuthDegrees: 30,
            // THERE ARE TWO KINDS OF FLASH WITH NO CHANNEL AND ONLY ONE OF THEM
            // IS WORTH HAVING. A strike outside `boltAzimuthDegrees` is off the
            // side of the frame, and a flash from somewhere you cannot see is
            // both realistic and useful: it says the storm is bigger than the
            // view. A strike INSIDE the frame that then fails this roll is the
            // other kind, and it is the weaker one, because the eye goes to
            // where the light came from and finds nothing there.
            //
            // A CURVE RATHER THAN A NUMBER, AND THE FALL AT THE END IS THE POINT.
            // Steve watched the finished storm and said there were far too many
            // channels once the tsunami was on its way in. He is right, and the
            // reason is compositional rather than meteorological: a channel is
            // the second largest bright object this scene can draw, and putting
            // one next to the largest one splits the frame. The wall should be
            // the only thing to look at while it arrives.
            //
            // The FLASH rate is deliberately not cut in step with this. A flash
            // with no channel in it lights the wall from the side and throws a
            // glint path down the face of it, which is help rather than
            // competition, so the sky goes on flashing while the channels thin
            // out. Measured over 300 runs of the arc, per ten second bin:
            //
            //                    channels          flash only
            //                  before  after     before  after
            //     60-70s         2.55   2.57       2.51   2.57
            //     70-80s         3.39   1.68       3.45   3.64
            //     80-90s         3.28   0.61       3.31   3.38
            //     last 20s       6.67   2.29  -66%
            //
            // Read the right hand pair as carefully as the left. The flashes are
            // UNCHANGED, so the sky over the tsunami is lit exactly as often as
            // it was and only the channels have gone.
            //
            // Steve asked for at least half and said maybe more. This is the
            // "maybe more" end, because in the frame the difference between two
            // channels and three is larger than the numbers suggest: at one
            // every nine seconds they read as separate events, and at one every
            // three they read as a texture. After the wall lands most visits now
            // see no channel at all, which is the intended reading.
            //
            // RAISED AGAIN ON 2026-08-21 TO ABSORB THE SECOND RATE CUT. With a
            // third of the strikes gone, holding this at 0.75 would have taken a
            // third of the channels with them, and the channels are the part
            // Steve singled out as worth keeping. 0.94 through the middle of the
            // arc is close to the ceiling this can reach: a strike outside
            // `boltAzimuthDegrees` never draws one, and that is 30 of the 46
            // degrees the strikes are spread over, so the most any setting here
            // can deliver is 0.652 channels per strike.
            //
            // What that buys is a middle stretch where nearly every flash you
            // see INSIDE the frame has something in it to look at. The flashes
            // with no channel have not gone away, they are now almost entirely
            // the ones from off the side of the view, which is the kind worth
            // having: it says the storm is wider than the window.
            boltChance: [
                { at: 30, value: 0.75 },
                { at: 46, value: 0.94 },
                { at: 70, value: 0.94 },
                { at: 78, value: 0.36 },
                { at: 90, value: 0.32 }
            ],
            // HOW FAR OUT, walked from the far end of the range to the near end
            // by `approach`, so the storm closes in rather than just getting
            // busier. The spread is what stops them all landing at one distance.
            farMetres: 900,
            nearMetres: 210,
            approach: [
                { at: 30, value: 0.12 },
                { at: 60, value: 0.45 },
                { at: 76, value: 0.72 },
                { at: 90, value: 0.88 }
            ],
            approachSpread: 0.30,
            // Distance dimming. Inverse rather than inverse square, because the
            // flash lights a cloud deck that reaches most of the way to the
            // strike rather than lighting a point. Anything closer than this is
            // at full brightness.
            referenceMetres: 320,
            // How hard the flash drives the sky's own colour, and the sea's
            // reflection of it, which is one number because they are one term.
            //
            // THIS NUMBER IS NOT LINEAR IN WHAT YOU SEE AND IT IS NOT CLOSE.
            // The flash is added in LINEAR light and then goes through exposure,
            // ACES, and the sRGB encode, and at the old 2.4 it was so far into
            // the top of that curve that most of the useful range of this knob
            // did nothing at all. Measured on the storm sky at full gloom, at the
            // peak of a flash directly ahead, over the upper sky band:
            //
            //     skyGain   mean   peak   share of the sky at 230+
            //     2.4        241    246          92.4%
            //     2.0        238    244          90.9%
            //     1.6        234    241          88.3%
            //     1.3        230    237          79.2%
            //     1.1        226    233          47.9%
            //     0.9        220    229           0.0%
            //     0.75       214    223           0.0%
            //
            // At 2.4 the sky was 92 per cent WHITE at every peak. Steve asked
            // for a slight reduction, and the honest answer was that a slight
            // change to this number is invisible: 2.4 to 2.0 moves the blown out
            // share by a point and a half.
            //
            // 1.1 is where the picture actually changes. The peak is still 233,
            // so it still reads as lightning and still lights the whole sky, but
            // the blown out share halves and the sky keeps its own colour at the
            // edges of the frame instead of clipping to paper white everywhere
            // at once. If it wants to come down further, 0.9 is the next stop
            // and is the point at which nothing in the frame clips at all.
            //
            // What that means for the strikes the arc actually produces, since
            // `reach` dims them by distance and the second stroke runs at 0.78:
            //
            //                        old 2.4              new 1.1
            //                     mean peak blown     mean peak blown
            //     900m  first      219  227    0%      188  199    0%
            //     600m  first      230  237   78%      205  215    0%
            //     400m  first      238  243   91%      220  228    0%
            //     293m  first      241  246   92%      226  233   48%
            //     293m  second     237  243   90%      219  227    0%
            //
            // WHICH IS THE SHAPE THAT WAS WANTED. Only the nearest first stroke
            // still whites out any of the frame, and it is meant to. Every other
            // flash in the arc has stopped clipping, so distance is legible in
            // the light again: a far strike now reads as a far strike instead of
            // as the same sheet of white the near one produces.
            //
            // A SIDE EFFECT WORTH KNOWING: the channels read BETTER after this,
            // not worse. A bolt is additive over the sky behind it, and a sky
            // already sitting at 244 has nothing left to add to.
            //
            // IT DOES NOT TOUCH THE CHANNEL. `bolt.intensity` and
            // `lightIntensity` are multiplied off `flash` before this is applied,
            // so the streaks and the glint path on the water are exactly as
            // bright as they were. That separation is the reason the three are
            // three numbers.
            skyGain: 1.1,
            // The light it throws directly on the water. Separate from the sky
            // term because this one makes a glint path and that one does not.
            lightIntensity: 4.2,
            lightColor: 0xcfe0ff,
            // THE REDUCED MOTION SKY. Not "no lightning": a storm with the
            // electricity taken out is a worse scene, and the setting asks for
            // less motion rather than for less story. One stroke, a quarter of
            // the amplitude, and an attack five times slower, which turns a snap
            // into a swell. The channel still draws, and still branches.
            reduced: {
                gain: 0.26,
                strokeChance: 0,
                attackSeconds: 0.18,
                decaySeconds: 0.55
            },

            // ---- The channel ------------------------------------------------
            //
            // MIDPOINT DISPLACEMENT, which is the classic fractal for this and
            // is the right one. One segment from the cloud base to the water,
            // split at the middle, middle shoved sideways, repeat with half the
            // shove. Six passes gives sixty four segments in the trunk and takes
            // the displacement from thirty metres to under one, which is what
            // produces the look: large scale wander, small scale jitter, the
            // same statistics at every zoom.
            bolt: {
                // THE CLOUD BASE IS USUALLY OUT OF FRAME AND THAT IS CORRECT.
                // The frame stops 20 degrees up, so at 400 metres out a base
                // this high sits at 45 degrees and only the bottom third of the
                // channel is visible. That is what lightning looks like from
                // underneath, and the missing top is most of why it reads as
                // enormous.
                baseHeightMetres: 420,
                iterations: 6,
                jitterMetres: 30,
                jitterDecay: 0.52,
                // BRANCHING ONLY IN THE MIDDLE PASSES. On the first pass it
                // gives two trunks and no main channel. On the last it gives
                // fuzz, because the children are too short for any remaining
                // pass to develop them and come out as straight whiskers.
                branchFrom: 1,
                branchTo: 3,
                branchChance: 0.30,
                branchGenerations: 2,
                branchLength: 0.55,
                branchSpreadDegrees: 42,
                // Children are thinner, dimmer, and less crooked than the trunk,
                // which is what keeps the trunk reading as the trunk.
                branchThin: 0.55,
                branchDim: 0.52,
                branchJitterDecay: 0.7,
                // A HARD STOP. Branching compounds: each pass doubles the set
                // and then adds to it, so an unlucky seed grows faster than the
                // doubling alone. Better a slightly plainer bolt than a frame
                // that allocates for a second. Sized so the buffers are 512 * 6
                // vertices, which is nothing next to the water's sheet.
                maxSegments: 512,
                // WIDTH IS ANGULAR, NOT METRIC, and that is a departure from
                // perspective made on purpose. A real channel is centimetres
                // across, so a true width at 400 metres is far under a pixel and
                // the bolt vanishes. This holds it at a constant size on screen,
                // which is also what a photograph of lightning shows, because
                // what is being photographed is the glow and not the channel.
                //
                // THE ARITHMETIC, since this is the number most likely to want
                // tuning by eye. The vertical field of view is 40 degrees, so a
                // 1080 line frame is 0.037 degrees per pixel. This is the HALF
                // width, so the channel is twice it: 0.0045 radians is 0.26
                // degrees each side, giving about 14 pixels overall with a core
                // of three or four. Halve it for a hairline, double it for
                // something closer to a special effect.
                //
                // Distance is NOT a cue here and does not need to be. A near
                // strike still reads as nearer, because the channel's wander is
                // in metres and a hundred metres of lateral wander subtends four
                // times the angle at 210 metres that it does at 900.
                widthRadians: 0.0045,
                intensity: 2.2,
                coreColor: 0xffffff,
                glowColor: 0x6f8cff
            }
        },

        // The closing fade, in seconds off the end. Long enough to read as an
        // ending rather than as a page crashing, short enough that nobody is
        // left watching a grey rectangle.
        // ---- The tsunami itself ---------------------------------------------
        //
        // A STEP THAT TRAVELS, AND UNTIL THIS EXISTED THERE WAS NOTHING TO SEE
        // COMING. The surge above raises the water level everywhere at once,
        // which is what a surge is and is not what anybody pictures when they
        // hear tsunami: the ocean inflating in place has no object in it, no
        // arrival, and nothing to watch. Steve watched it and said he could not
        // see it approaching, which was the correct reading of what was there.
        //
        // So the front is a place. Water seaward of it stands `rise` metres
        // higher, water shoreward of it is at whatever the arc otherwise says,
        // and it sweeps from the fog limit to the beach. That buys three things
        // and all three are the point: a line that closes on the shore, deeper
        // water behind it so the swell back there stands taller than the swell
        // in front of it, and an actual arrival.
        tsunami: {
            // Starts at the fog's far edge rather than at the sheet's, because
            // anything past 400 m is fog and would simply fade in rather than
            // arrive. Ends past the camera, so it does not stop in frame.
            fromZ: -395,
            toZ: 30,
            // Out of the drawback and into the ending. 320 metres in 22 seconds
            // is 15 m/s, which is far slower than the real thing in deep water
            // and the right speed for a scene: fast enough to feel wrong, slow
            // enough that the last ten seconds are watchable.
            // TIMED SO THE HIT LANDS BEFORE THE FADE, not during it. Once the
            // level step was fixed the front stopped raising the water early and
            // the eye was not covered until t=118, four seconds into a fade that
            // starts at 114, so the payoff arrived on a half black screen. It
            // crosses the camera at about t=112 now, which leaves the white-out,
            // its clearing, and a second of standing under the thing before the
            // black starts.
            // APPEARS EXACTLY AS THE WATER STARTS TO GO. Steve asked for a wall
            // visible in the distance while the sea recedes, and 88 is the second
            // the surge turns negative, so the two are the same beat: the water
            // leaves, and the reason it is leaving comes out of the fog behind it.
            // STARTS THE SECOND THE WATER DOES. Steve asked for the swell to
            // begin forming as soon as the sea starts to go, and it already did:
            // what was missing was being able to SEE it, which was the fog. Now
            // that the air opens during the lull, the two are one beat.
            startAt: 60,
            arriveAt: 80,
            // THE FRONT CARRIES THE WATER NOW, NOT THE SURGE. The surge used to
            // ramp to 1.55 at the end and the front added its own rise on top,
            // which is two systems raising the same sea and a level of 3 m if
            // they ever fully overlapped. The surge now returns to about zero
            // and this is what covers the eye, which is also the honest shape:
            // the water arrives BECAUSE the front arrives.
            // ---- IT GROWS AND IT STEEPENS ON THE WAY IN ----------------------
            //
            // A CONSTANT RISE ARRIVES THE SAME SIZE IT LEFT, which is not what a
            // tsunami does and not what makes one frightening. In deep water it
            // is a long low hump; as the bottom comes up it shoals, so the same
            // water piles into less depth and the front steepens into a wall.
            // Green's law is doing this for the ordinary swell already. It
            // cannot do it here, because the rise is a step in the water LEVEL
            // rather than a wave, so it is put in by hand along the front's own
            // progress.
            //
            // The measured payoff, crest above the eye at 20.2 px per degree:
            //
            //     338m away   2.96 m over the eye     10 px
            //     208m        3.91                    22 px
            //      76m        4.88                    74 px
            //      28m        5.23                   214 px
            //       8m        5.37                   686 px
            //
            // THE LAST LINE IS THE POINT AND IT IS WHY NO CAMERA TILT IS NEEDED.
            // The frame holds 405 px above the horizon, so the wall runs out of
            // frame before it arrives, and a thing too big for the picture reads
            // as bigger than a thing that fits in it. Steve asked whether the
            // perspective could be tilted to sell the scale. It can be, and this
            // is better: it costs no camera motion, which keeps the no-bob
            // promise, and it is what the water actually does.
            // 2.40 rather than 1.70 at the far end. The wall is supposed to be
            // already frightening when it comes out of the fog and then to grow,
            // rather than to start as a ripple and become frightening later.
            // 4.5 TO 9.0, AND THE SIZE IS CHOSEN IN PIXELS RATHER THAN METRES.
            // Physical accuracy and the picture pull opposite ways here and it
            // is worth saying so plainly. A real tsunami in deep water is a low
            // hump under a metre tall and completely invisible; the towering
            // wall everyone pictures is a shallow water phenomenon a few hundred
            // metres offshore at most. Sized honestly it would be nothing until
            // it was already on top of the visitor, which is exactly the note
            // this is answering.
            //
            // So it is sized to occupy the lower sky at the distance it is being
            // watched from, and it still GROWS on the way in, which is the part
            // that is genuinely physical. Measured, height above the eye in pixels:
            //
            //     403m   15px      162m   56px
            //     312m   22px      121m   80px
            //     206m   41px       47m  229px
            //
            // Nine metres at the shore is a large tsunami and not an absurd one.
            //
            // 12.0 AND 17.0, RAISED TWICE ON 2026-08-21. The reasoning below is
            // from the first pass at 9.0/13.0 and is unchanged; Steve looked at
            // that and asked for taller again, so the same levers were pushed
            // further and `beach.nearZ` went 88 -> 110 to carry it. The table
            // below is the FIRST pass. Where it stands now, same measurement:
            //
            //     342m  63 px  12%      137m  179 px  33%
            //     263m  83     15%       84m  308     57%
            //     197m 118     22%       31m  778    100%
            //
            // Which is about 2.6 times the wall that shipped before 2026-08-21,
            // and it fills the frame at t=76 rather than t=78. `swellBehind`
            // also went 2.9 -> 4.5 in this pass, once the fold behind the front
            // had actually been measured rather than guessed at: see the note
            // there. The eye is still covered at t=78.1.
            //
            // 9.0 AND 13.0 EARLIER THE SAME DAY, AFTER MEASURING THE APPROACH
            // ACTUALLY LOOKED LIKE. Steve said the wall was visible and
            // threatening but wanted it more massive, and the profile agreed
            // with him in a specific way that neither of the tables above shows:
            // for the eight seconds from t=63 to t=70 the wall occupied between
            // FIVE AND TWELVE PER CENT of the sky, and almost all of its growth
            // in that stretch came from the distance closing rather than from
            // the wall getting bigger. It was a band on the horizon for most of
            // the time it was being watched.
            //
            // Measured with `buildProfile` run headless, so the depth cap, the
            // shoaling, the set envelope and the crest harmonic are all in it
            // rather than `rise` and `swellBehind` being added up by hand. That
            // matters: the swell behind the front contributes only 1.5 to 2.0 m
            // of crest, not the 2.9 the note below reads as. Height of the
            // tallest thing in the frame, above the eye, at 27 px/degree, and
            // the share of the 540 px of sky the frame holds:
            //
            //             before          after
            //     342m     24 px   4%     44 px   8%
            //     263m     32      6%     58     11%
            //     197m     48      9%     83     15%
            //     137m     78     14%    126     23%
            //      84m    142     26%    219     40%
            //      31m    409     76%    584    100%
            //
            // About 80 per cent taller the whole way in, and it now fills the
            // frame at t=76 rather than t=78, so there are two more seconds of
            // standing under something too big for the picture.
            //
            // THE ENDING IS UNCHANGED. The water still covers the eye at t=78.1
            // against 78.2 before, because the front reaches the camera at the
            // same moment either way and it was already far over the eye when it
            // got there.
            //
            // WHY THE STEP AND NOT `swellBehind`. Both work, and per unit
            // swellBehind is the stronger knob: 2.9 to 9.0 takes the crest from
            // 1.66 m to 5.69 and never comes near the depth cap, which is about
            // 7 m in the deep water behind the front. It was not used because it
            // is the one that costs STEEPNESS. The mesh folds when the Gerstner
            // horizontal displacement passes through itself, that ceiling has
            // never been measured for this part of the arc, and the note below is
            // explicit that the water back there should stay a smooth wall
            // rather than a mile of whitewater. A level step carries no
            // steepness at all, so it is free of both concerns. If more height
            // is ever wanted than the beach can carry, swellBehind is where to
            // go next, and the Jacobian has to be swept first.
            //
            // `riseNear` IS CAPPED BY THE BEACH AND NOT BY TASTE, which is the
            // constraint that decided these two numbers. See `beach.nearZ`: the
            // waterline walks shoreward at four and a half metres per metre of
            // water, so 13 m of rise floods to z 77 and the sheet has to reach
            // past it. And `riseFar` is then capped by `riseNear`, since a front
            // that starts taller than it ends would shrink on the way in. The
            // approach is what Steve asked about, `riseFar` is what drives it,
            // and it is reached through the near end. That is not obvious and it
            // is why the sheet had to move again.
            //
            // THIRTEEN METRES IS STILL A REAL NUMBER. Tohoku in 2011 ran up past
            // fifteen along much of the coast it hit. The honest part of this
            // block was always the paragraph above about deep water, and that has
            // not changed: the far end is a picture, the near end is not.
            riseFar: 12.00,
            riseNear: 17.00,
            // How abrupt the step is. Wide enough that it never falls between
            // two rows of the grid and strobes as it crosses them, tight enough
            // to read as an edge rather than as a slope.
            // AND THE FACE STEEPENS AS IT NARROWS. Half width in metres, so the
            // face angle is atan(rise / 2 * width): 3 degrees out at the fog
            // limit and 14 by the time it arrives. A step that stayed 26 m wide
            // while its rise tripled would read as a ramp rather than a wall.
            //
            // It cannot narrow indefinitely. Far out the rows are 20 m apart, so
            // a narrow front would fall between two of them and strobe as it
            // crossed the grid; near the camera they are under a metre apart and
            // 8 m is many rows. So the wide end is a grid constraint and the
            // narrow end is the look, which is a happy way round.
            frontWidthFar: 26,
            frontWidthNear: 8,
            // THE WHITE LINE IS WHAT MAKES IT VISIBLE AT DISTANCE. A 1.55 m step
            // subtends about four pixels at the fog limit and the sea out there
            // is already the colour of the sky, so the level change alone
            // arrives without having been seen. The front of a real bore is
            // broken water and it is white, and white against a grey sea reads
            // at any distance.
            frontFoam: 0.85,
            // ---- The sea behind the front -----------------------------------
            //
            // WHAT TURNS A STEP INTO A WALL. The level step on its own is a few
            // pixels tall at three hundred metres, so the front arrived without
            // ever having been seen: correct, travelling, and invisible.
            //
            // The sea is a different SIZE on the two sides of it. Ahead of the
            // front the water has just been pulled out and has nothing driving
            // it, so it lies flat at the drawback's 0.28. Behind it is the
            // disturbed body the front is made of. At 2.9 the crests back there
            // stand about 2.9 m above still water against an eye at 1.15, so THE
            // SWELL RISES ABOVE THE HORIZON LINE and the ridge is drawn against
            // the sky rather than against the sea.
            //
            // Deep water is what makes it safe. Out past the shoaling the depth
            // is `maxDepth` plus the front's own rise, so the depth cap is near
            // ten metres of amplitude and nothing back there breaks. It stays a
            // smooth wall rather than a mile of whitewater.
            //
            // 4.50 SINCE 2026-08-21, AND THE FOLD WAS MEASURED THIS TIME. This
            // was left at 2.90 in the morning's pass with a note saying it was
            // the stronger knob but that the mesh fold behind the front had never
            // been checked. It has now, with the CPU port of the vertex shader
            // run over t=70..82:
            //
            //     swellBehind 2.9   Jacobian margin 0.63
            //                 4.5                   0.50
            //                 6.0                   0.34
            //
            // So the caution was worth taking and the answer is that there is
            // plenty of room. 4.5 adds about a metre and a third of crest on top
            // of the step and keeps two thirds of the margin. Note the crest it
            // actually produces is 3.3 m and not 4.5: this is a SWELL SCALE on
            // the same footing as `storm.swell`, not a height in metres, and
            // reading it as metres overstates the wall by half.
            swellBehind: 4.50
        },
        fadeSeconds: 6
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
    // is 2510, and the reason it is not a neat multiple of the tide or the set
    // period is so that nothing beats against either of them.
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
