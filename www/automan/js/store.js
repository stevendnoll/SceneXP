// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - John Walker, The Auto Man Construction
 *
 * Builds the eleventh SceneXP micro-environment, and the fourth passive
 * one: the corner of a car dealership showroom given over to a sales
 * desk. John Walker, "The Auto Man," sits on the buyer's side of that
 * desk with his customer, pointing at the deal sheet and making her case
 * to the dealer across from them, while she nods along. Behind the
 * dealer a wide glass wall looks out on the lot, and every so often a car
 * rolls past.
 *
 * The camera never moves in this experience, so the whole room is
 * composed for one fixed viewpoint at the open right-hand corner of the
 * desk (see AUTOMAN_CONFIG.camera): John and his customer in the near
 * left in three-quarter view, the dealer across from them, the lot
 * filling the space behind his shoulder, and the deal sheet at the
 * optical centre where John's finger lands. The scene provides all the
 * motion via updateShowroom(deltaTime).
 *
 * The shared day/night cycle is disabled so the sky holds at noon
 * (main.js still runs the cycle's per-frame pass for the fixed-time sky
 * paint and the shadow-map refresh), and the interior carries the shared
 * lighting rig plus one faux daylight shaft angled in through the glass.
 *
 * It was briefly enabled on 2026-09-02 and taken out again the same day.
 * If it is ever wanted back, three things in here assume a fixed noon and
 * will need to follow the sun: the cloud bank uses an unlit material and
 * would hold daylight white at midnight, the daylight shaft below is a
 * constant and would be a sunbeam at midnight, and the lot's light poles
 * have no lamps to turn on. Follow the sun's HEIGHT rather than the shared
 * getNightFactor(), which is flat through the whole of the day band.
 *
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's.
 *
 * FLOOR PLAN (viewed from above, the glass wall and the lot at the top,
 * the camera at the open right-hand corner of the desk). The back
 * elevation is glazed floor to ceiling apart from a slim pier at each
 * corner.
 *
 *   +=============== glass wall / the lot beyond ===============+
 *   |  [key board]          (DEALER)          [ sales board ]   |
 *   |                 +-----------------+                       |
 *   |  [plant]        |[scrn][keys][ms] |                       |
 *   |                 | [PAPERS]  [car] |                       |
 *   |                 +-----------------+                       |
 *   |             (JOHN)          (CUSTOMER)                    |
 *   |  [ vending ]                               [ CAMERA ]     |
 *   |  [ coffee bar ]                                           |
 *   |  [ plant ]                                                |
 *   |         [ chairs ]  [ brochures ]                         |
 *   +--------------- front wall (behind the camera) ------------+
 *
 * BUILD STATUS: milestone M15, the fifth screenshot QA round. The room is
 * furnished, everything in it answers a tap, and the interaction layer is
 * in. What remains is the accessibility pass at M9 and the assets,
 * directory entry, and Jest suite at M10. See specs/automan/TASKS.md.
 *
 * A note for whoever polishes this next: this scene is composed for ONE
 * fixed eye, and the floor plan above is a convenience, not the truth.
 * Four of the first QA round's eight findings were things the plan view
 * cannot express, so anything moved here should be re-run through
 * specs/automan/verify-composition.mjs before it is believed.
 *
 * And a note on the checks themselves, from the third round: two of them
 * passed while the thing they guarded was plainly wrong on screen, because
 * each measured the right property in the wrong PLACE. The stripe check
 * compared a car against the far end of a leaning line, and the frame
 * check compared raw bearings against a range straddling +/-180, which is
 * where this room's window points. A check that agrees with a screenshot
 * is worth more than a check that agrees with its own arithmetic.
 *
 * The fifth round's note is shorter: THE STUB CANNOT MEASURE ANYTHING.
 * Its meshes have no vertices, so a bounding box under it is always empty
 * and a panel that is inside out, misplaced, or the wrong size looks
 * exactly like one that is not. The lot's new SUV turned out to be 2.14m
 * wide rather than the 1.98m of its bodywork, because its wheels stand
 * outboard of the paint, and the only way to find that out was to run the
 * real three.js in a scratch script and read the box. Anything with an
 * extruded or bevelled panel should be measured that way once.
 *
 * The fourth round's note is about the DESK, which has now had three
 * shapes. Each one solved the problem it was given and introduced the
 * next: two inset blades cleared John's feet and read as a slab, a
 * pedestal read as a desk and pointed its drawers at the customer. It is
 * a plain four-leg table now, which has no front to face the wrong way.
 * The general form: when a fix keeps producing a new fault, the thing to
 * question is the shape, not the placement.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, getWorldGroup, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { AUTOMAN_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import {
    createTallPlant, createSnakePlant, createLoungeChair, createVendingMachine
} from '../../shared/js/furniture-1.0.0.min.js';
import { createBackgroundScenery } from '../../shared/js/scenery-1.0.0.min.js';
import { createWall, createWallSegment } from '../../shared/js/structures-1.0.0.min.js';
import { createCeilingLights } from '../../shared/js/lighting-1.0.0.min.js';

// Re-exports: main.js keeps importing these from store.min.js (stable import
// block); the implementations live in the shared parts library.
export { updateBackgroundAnimations } from '../../shared/js/scenery-1.0.0.min.js';
export { updateInteriorAmbientLight } from '../../shared/js/lighting-1.0.0.min.js';

// World mesh group (the static showroom plus everything in it)
let showroomGroup = null;

// Visitors who ask for reduced motion get a perfectly still showroom:
// John holds his pointing pose, his customer holds hers, one car sits
// parked in the lot, and the clock holds the arrival time. Matches the
// reduced-motion handling across the site.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around the deal sheet on the desk, seen from the
// fixed camera at the desk's open right-hand corner. All meters. room
// mirrors AUTOMAN_CONFIG.building (the shared lighting rig reads that
// copy).
//
// PROVISIONAL: these are the starting composition from the PRD, not
// measured values. The desk and the sheet get fixed at M3 because the arm
// solve depends on them, and the whole frame is measured in portrait at
// M4 before anything else is polished.
const LAYOUT = {
    room: { minX: -3.8, maxX: 3.8, minZ: -4.4, maxZ: 3.0, height: 3.05, wallT: 0.15 },

    // The glass wall: a floor-to-ceiling curtain wall taking almost the
    // whole back elevation, which is what a real showroom does and what
    // makes this room a dealership rather than an office. It is the
    // largest element in the frame after the people.
    //
    // No sill and no head band: the glazing runs from a low aluminium
    // base rail at the floor to a head channel under the ceiling, divided
    // into bays by vertical mullions with one horizontal transom across.
    // Only two slim piers of solid wall survive, one at each corner.
    //
    // M2 NOTE: because the glass reaches the floor, the visitor sees the
    // lot's ground meeting the showroom floor. The lot needs a threshold
    // (a kerb or a shadow gap at the base rail) or the two planes will
    // z-fight along the whole elevation.
    glass: {
        x: 0.0,
        width: 6.8,        // leaves a 0.4 pier at each corner of a 7.6 wall
        baseRail: 0.12,    // the aluminium kick at floor level
        headRail: 0.14,    // the head channel under the ceiling
        transomY: 2.15,    // one horizontal division, for scale
        mullion: 0.07,     // face width of every vertical and the transom
        bays: 4
    },

    // The sales desk. Its top height and the sheet's position anchor
    // John's pointing pose, so both are fixed here and the arm solve at
    // M4 works from them rather than the other way round.
    // A PLAIN FOUR-LEG TABLE, which is the third shape this desk has had.
    //
    // It began as two thin blades inset from each end (round two, to clear
    // John's feet), which read as a slab hanging under the top. Round
    // three made it a single-pedestal desk, and the drawers ended up
    // facing the CUSTOMER, because the only end with room for a pedestal
    // is the end nearest her. A table has no front, so it cannot face the
    // wrong way, and it is what Steve asked for after seeing both.
    //
    // The legs are inset 0.10 from the corners, and that number is
    // measured rather than styled: John sits at the west end with his
    // shoes under the top, and every seated figure's legs are re-checked
    // against these four posts in specs/automan/verify-pose.mjs. There is
    // no modesty panel now, so the visitor sees under the desk, which is
    // what a table looks like.
    desk: { x: -0.45, z: -2.25, w: 1.90, d: 1.00, topY: 0.75, legInset: 0.10, legW: 0.07 },

    // The deal sheet, and the whole reason the camera is where it is.
    // Solved rather than placed: it is the point on the desk top NEAREST
    // THE CENTRE that is still inside John's seated reach. His shoulder
    // sits 0.2125 off his spine, the shared rig's arm gives 0.63 from
    // shoulder to fingertip, and a forward lean buys another 0.22, so the
    // budget is 0.85m. This spot is 0.82m from his LEFT shoulder, which
    // is therefore the arm that points (task T4.3).
    dealSheet: { x: -0.93, z: -2.18 },

    // The dealer's monitor, offset from the desk centre. It lives in the
    // LAYOUT rather than inline in the builder because WHERE IT STANDS is
    // a sight-line constraint (see createDeskItems), and a constraint
    // that is only checkable from outside has to be readable from
    // outside. specs/automan/verify-composition.mjs projects this box
    // against the dealer's and John's every run.
    // It is SMALLER and TURNED now, and both are consequences of showing
    // something on it. A screen the visitor can read has to face partway
    // toward the camera, and a panel turned that far runs across the desk
    // rather than along it: at 0.52 wide it hung 15cm off the back edge.
    // At 0.30 it fits, and it still clears the nearest face by about 6% of
    // the frame width, which is what the old blank 0.52 managed.
    //
    // rotY is NOT stored. It is solved at build time by screenAim() from
    // the dealer's seat and the camera's eye, so the screen keeps serving
    // both if anything moves. See createDeskItems.
    deskScreen: { dx: -0.58, dz: -0.34, w: 0.30, h: 0.20, midY: 0.22 },

    // The dealer's keyboard and mouse, squarely in front of him. They live
    // beside the screen rather than under it because the screen is parked
    // off to the west for the sight-line reason above, and a dealer types
    // in front of himself whatever his monitor is doing. Offsets from the
    // desk centre, like deskScreen. Kept here so verify-composition can
    // check they stay on the desk, clear of the screen's foot, and clear
    // of where the dealer's own hands land.
    // THE KEYBOARD IS PLACED FROM THE DEALER, not from the desk: `reach`
    // metres straight out along his own facing, squared to him, which is
    // the rule sunnyvalejenn uses to get BOTH of a figure's hands onto the
    // keys instead of one drifting onto the desk beside it.
    //
    // The mouse is in his frame too, and it has to satisfy two things at
    // once: on HIS right (he is right handed) and to the LEFT of the
    // keyboard as the visitor sees it. Those are different directions
    // here, and only a forward offset reconciles them: his right axis
    // reads very slightly screen-left, his forward axis reads strongly
    // screen-left, so a mouse a little forward of the keys lands on the
    // correct side of both.
    // boardH and keyH are not decoration: they are what makes the surface
    // a hand actually meets computable. The dealer's hands were solved
    // against the DESK TOP, 22mm below the keys, and spent a QA round
    // inside the keyboard because of it.
    deskKeyboard: { reach: 0.62, w: 0.40, d: 0.14, boardH: 0.016, keyH: 0.006 },
    deskMouse: { right: 0.34, fwd: 0.15 },

    // CORNER SEATING (decision D8). John sits at the desk's WEST END, not
    // beside his customer on the near side, and that is load-bearing:
    // from the end he faces EAST across the desk toward the dealer, which
    // is roughly back toward the camera, so his face reads. Seated square
    // on the near side he would be a back of head, and he and his
    // customer would land on the same sight line 1 degree apart. They
    // still sit 1.37m apart, which reads as two people who arrived
    // together.
    //
    // Yaws are not stored: each figure is aimed at build time with
    // faceToward(), so moving a seat keeps its sight line honest without
    // a second set of numbers to update.
    john: { x: -1.85, z: -2.35 },
    customer: { x: -1.10, z: -1.20 },
    dealer: { x: -0.45, z: -3.15 },
    chairSeatTop: 0.47,

    // THE WEST WALL is where the showroom's own fixtures live, and that
    // is not decoration: it is the only wall the visitor can actually
    // reach. From the fixed camera the frame covers bearings -158 to -79
    // degrees, and the pan row adds 35.5 either side, which opens the
    // south and south-west and leaves the EAST wall unreachable at any
    // pan. So nothing worth seeing is ever placed east of the desk.
    //
    // Running north to south along the wall at x -3.65, facing +X.
    clock: { x: -3.70, y: 2.05, z: -0.20, rotY: Math.PI / 2, r: 0.17 },
    keyBoard: { x: -3.66, y: 1.50, z: -3.40 },
    salesBoard: { x: -3.66, y: 1.60, z: -1.90, w: 1.40, h: 0.90 },
    // Centred between the vending machine and the plant, which is a
    // measurement rather than a look: the bar is 1.34 long, the machine's
    // near face is at z 1.55 and the plant's at -0.40, so the only z that
    // leaves the same gap on both sides is (1.55 + -0.40) / 2. At its old
    // 0.70 the gaps were 0.18 and 0.43 and it read as jammed against the
    // machine.
    coffeeBar: { x: -3.35, z: 0.575 },
    vending: { x: -3.35, z: 2.00 },

    // THE WAITING AREA, along the rear wall, reachable by a pan toward the
    // south.
    //
    // The camera looks DIAGONALLY across this corner, so the rear wall is
    // seen at a glancing angle and west means further away: anything at
    // the west end of the wall sits behind everything east of it. The row
    // used to stand out in the room at z 1.70, where it hid two thirds of
    // the vending machine, half the brochure rack and most of the plant.
    // Measured, not eyeballed: 67%, 0% and 17% of them survived to the
    // eye. Against the wall at z 2.60 the machine comes back to 96%.
    //
    // Only ONE slot east of the row is inside the landscape frame, so the
    // brochure rack takes it (it is the prop worth reading) and the snake
    // plant moved to the west wall between the coffee bar and the sales
    // board, where it is seen instead of guessed at.
    waitingChairs: { xs: [-2.60, -1.88, -1.16], z: 2.60 },
    brochureRack: { x: -0.52, z: 2.74 },
    // (No waste basket. It moved three times in three QA rounds, from the
    //  middle of the room to the desk's near face to its east corner, and
    //  never once looked like it belonged there. A bin this near the lens
    //  is a large dark cylinder in the foreground of a scene whose subject
    //  is a conversation, so the fourth round removed it rather than move
    //  it a fourth time.)
    plants: [
        { x: -3.15, z: -3.90, kind: 'tall' },
        { x: -3.45, z: -0.60, kind: 'snake' }
    ],

    // The ceiling fixtures: two runs of two, one over the desk and one
    // over the waiting area. The shared rig gives each a point light, and
    // those do not cast shadows, so four is affordable on a phone.
    ceilingLights: { xs: [-1.9, 1.5], zs: [-2.9, 0.3] },

    // THE LOT, beyond the glass.
    //
    // Placement here is measured, not composed by eye, because the corner
    // camera looks DIAGONALLY out through the wall and the visible slice
    // of the lot is nowhere near centred on it. Rays from the eye through
    // the glass edges fan out sharply to the west, and the portrait
    // camera (a much narrower cone, dollied back) sees a strict subset of
    // the landscape view, shifted further west again. The usable span at
    // each row depth, in metres of world x:
    //
    //     depth    landscape 16:9      portrait 9:19.5
    //     -7.4     -7.7 ..  -0.3       -7.7 ..  -3.8
    //    -11.0    -12.9 ..  -1.7      -13.0 ..  -7.1
    //    -17.5    -22.3 ..  -4.3      -22.4 .. -12.9
    //    -24.0    -31.6 ..  -6.9      -31.8 .. -18.8
    //
    // So every row runs from its portrait limit in the west out to its
    // landscape limit in the east, which puts cars in frame on a phone
    // AND fills the wider desktop view. Cars centred on x = 0 would sit
    // almost entirely outside a portrait frame.
    //
    // RE-MEASURED AT M3, and it mattered: the composition solve moved the
    // camera and narrowed the landscape FOV to 50, which shifted every
    // span. The rows as first written at M2 would have left a portrait
    // visitor looking at an empty lot. Recompute these whenever the
    // camera, the lookAt point, the FOV, or the glass width moves.
    lot: {
        groundY: -0.14,        // the asphalt, a kerb below the concrete walk
        // THE WALK. A raised concrete sidewalk runs the whole frontage,
        // level to within 6cm of the showroom slab and a kerb above the
        // lot, which is what a real dealership entrance does.
        //
        // It also closes a hole. The walk's plane was built 3.55m deep
        // when it needed to be 8.0 (the old expression added the kerb gap
        // instead of measuring from the far edge), so it stopped 0.63m
        // INSIDE the building and the ground between the glass and the
        // asphalt was simply missing. The visitor saw the sky background
        // straight through the floor: the "sky blue band" under the
        // window in the second QA round.
        walkY: -0.06,
        kerbZ: -4.45,          // the threshold step at the building line
        apronFarZ: -6.0,       // where the walk ends and the kerb drops
        driveLaneZ: -7.4,      // where the passing car crosses (M6)
        asphaltFarZ: -29,
        grassFarZ: -62,
        minX: -70,
        maxX: 25,
        stallAngle: 0.52,      // ~30 degrees off square, standard angled parking
        stallDepth: 5.4,
        // ONE stall size for the whole lot, because a parking bay is a
        // parking bay. The pitch is measured ALONG the row, so the width
        // a car actually gets is pitch * cos(stallAngle): at the old 2.6
        // that was 2.26m for a body 1.86m wide, about 20cm a side, and
        // every car looked parked on its own line. 3.15 gives 2.73m, a
        // standard nine-foot bay, and 44cm a side.
        //
        // The rows still had their cars ON the paint even so, because the
        // stripe texture starts a bay exactly where the loop starts a car.
        // The cars are the composed thing, so the PAINT moves: the stripe
        // texture carries a half-pitch offset and the cars sit mid-bay.
        // from and to are bay centres, and (to - from) has to stay a whole
        // number of pitches or the tiled stripes break at the row's end.
        stallPitch: 3.15,
        // Which bays of the near row hold an SUV rather than a sedan,
        // counting from the row's west end. Two of five: enough that the
        // row stops reading as one car repeated, few enough that the
        // extra meshes stay in the noise. Only tier 1 uses this, because
        // the difference is invisible past it.
        suvBays: [1, 3],
        // Three rows, receding, each cheaper to draw than the last. Row
        // ends run east past the frame now (the last row-one car sits at
        // x 0.0, off the composed view but reachable with a pan), so the
        // row never visibly stops inside the window.
        rows: [
            { z: -11.0, tier: 1, from: -12.6, to: 0.0 },
            { z: -17.5, tier: 2, from: -22.05, to: 0.0 },
            { z: -24.0, tier: 3, from: -31.5, to: -3.15 }
        ],
        poles: [{ x: -11.0, z: -14.5 }, { x: -21.0, z: -21.0 }],
        // The pennant string has to cross the WHOLE window and show NO
        // ends: a post in shot is a place where the flags stopped.
        //
        // The visible span at this depth is x -9.4 to 4.3 with the pan row
        // allowed for. It was measured as -9.4 to 2.5 in round two, and
        // that was wrong: the measuring tool compared raw atan2 bearings
        // against a range straddling +/-180, which is exactly where the
        // lot sits, so it truncated the frame at due north and declared a
        // post at 3.5 to be off-screen while it stood in the middle of the
        // glass. The string now runs well past both edges and there are no
        // posts at all. The span stays a whole number of 4.0m texture
        // tiles (20.0) or the last flag is cut in half at the seam.
        pennants: { fromX: -12.5, toX: 7.5, z: -8.6, y: 3.6 },
        // THE CLOUDS, and the reason they are here rather than left to the
        // shared scenery part. That part hangs its clouds at y 45 to 75
        // and 80 to 150m out, which is 26 degrees up: fine over an open
        // world, invisible from inside a room. The window's own opening
        // only passes elevations 0 to 19.5 degrees, and the treeline
        // fills everything under about 8, so a cloud has to sit in a band
        // 10 degrees tall to be seen at all. These are placed in it.
        //
        // Distance matters as much as height: the shared fog runs 40 to
        // 200m (120m on a phone), so a cloud past about 90m is fog. Each
        // drifts east and wraps, and the whole bank holds still under
        // prefers-reduced-motion.
        // Eleven, not five. Five left the sky empty for long stretches:
        // they were placed by hand across a band the measuring tool had
        // truncated (the bearing wrap, see pennants above), so half of
        // them sat outside the window's real reach. Laid across the
        // measured band instead, at bearings -190 to -130 and elevations
        // 10.5 to 17 degrees, this bank keeps between 5 and 10 clouds in
        // the landscape frame at any moment of the drift.
        clouds: [
            { x: 15.3, y: 17.9, z: -73.2, scale: 1.20, drift: 0.17 },
            { x: 6.5, y: 18.1, z: -58.2, scale: 0.85, drift: 0.24 },
            { x: -0.5, y: 17.4, z: -86.2, scale: 1.35, drift: 0.13 },
            { x: -6.1, y: 16.9, z: -61.7, scale: 0.90, drift: 0.22 },
            { x: -16.4, y: 25.3, z: -76.0, scale: 1.10, drift: 0.16 },
            { x: -16.0, y: 12.4, z: -51.0, scale: 0.75, drift: 0.27 },
            { x: -33.4, y: 23.4, z: -74.0, scale: 1.25, drift: 0.14 },
            { x: -29.3, y: 14.2, z: -51.2, scale: 0.85, drift: 0.23 },
            { x: -41.8, y: 22.8, z: -57.0, scale: 1.05, drift: 0.18 },
            { x: -36.4, y: 14.4, z: -40.6, scale: 0.80, drift: 0.26 },
            { x: -58.8, y: 17.0, z: -51.7, scale: 1.15, drift: 0.15 }
        ],
        cloudTravel: 46.0      // metres east before a cloud wraps west again
    }
};

// -------------------------------------------------------------------------
// WHO'S WHO
// -------------------------------------------------------------------------
// John: clean-shaven head, a light blue button-down dress shirt, dark
// trousers, a medium to slightly broad build. Keyed to the flyer in
// specs/automan/image0.png. A stylized low-poly portrait rather than a
// likeness, the same standard the rest of the site holds. Used from M4.
//
// He is also the biggest figure in the room, at SCALE 1.10. That is a
// composition decision as much as a likeness one: he sits furthest from
// the lens of the three, so perspective was quietly shrinking the one
// person the whole page is about. See JOHN_SCALE below, which the pose
// arithmetic depends on.
const JOHN_LOOK = {
    skinTone: 0xe8c09a,
    bald: true,
    dressShirt: true,
    // The flyer's shirt, as it has to be MIXED rather than as it is
    // sampled. A light blue picked straight off the artwork (0xb2cbf0)
    // came back off the renderer as white: the showroom's own lighting
    // has a lot of headroom, and a pale tint spends all of it. This is
    // several steps deeper than the source so the result reads blue.
    shirtColor: 0x6f9fd4,
    pantsColor: 0x2f3540,
    eyeColor: 0x3d5a72,
    handScale: 1.4
};

// The shared rig's default hands are two thirds the size a hand reads at
// on a figure this close to the lens, which leaves every gesture in the
// scene ending in a point rather than a hand. All three of the cast get
// the same enlargement, matching the other SceneXP scenes that put people
// near the camera.
const HAND_SCALE = 1.4;

// The showroom palette. Bright and slightly cool on purpose: showrooms
// are lit by their glass. The flyer's navy and gold do the accenting.
//
// PROVISIONAL: the navy and gold are working values derived from
// specs/automan/image0.png, whose raw pixel values read darker than the
// artwork displays. Confirm against the displayed flyer before these are
// treated as settled (task T10.2 territory). The shirt blue has already
// been through that loop once and is no longer the sampled value: see
// JOHN_LOOK.
const PALETTE = {
    navy: 0x12294a,
    signalBlue: 0x0d5bc4,
    gold: 0xf0a51e,
    // John's shirt blue lives on JOHN_LOOK, not here. It was in both
    // places and only one of them was ever read, which is how a colour
    // gets fixed in the copy nobody renders.
    floorGrey: 0xd8d5d0,
    // The interior walls. A soft cool grey rather than white, because
    // white walls plus a white ceiling plus a bright floor plus a wall of
    // daylight left the room glaring, with nothing for the cast to read
    // against. Applied as a TINT over the near-white paint texture, so
    // this one constant moves every wall in the room and the mottle in
    // the texture stays relative to it.
    wallGrey: 0xbcc0c2,
    trimWhite: 0xf8f6f1,
    ceiling: 0xe6e8e9,
    asphalt: 0x3c3b3a,
    leafGreen: 0x3f7d43,
    leafDeep: 0x2d5a27,
    potWhite: 0xe9e6de,
    deskWood: 0x8a6a4a
};

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Painted wall with a hint of roller texture, so the big bright planes
 *  don't read as one flat sheet. */
function createWallPaintTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2f1ee';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ['#eeedea', '#f6f5f2', '#e9e8e4'][i % 3];
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, 16 + Math.random() * 28, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** The showroom floor: large-format polished porcelain, the surface every
 *  dealership puts under its cars. One canvas holds a 2 by 2 block of
 *  tiles, so the repeat below lands them at roughly 1.2 metres each. The
 *  mottling is deliberately soft and the grout lines are barely darker
 *  than the tile, because the floor's job is to bounce light and stay out
 *  of the way, not to draw the eye off the desk. */
function createShowroomFloorTexture() {
    const S = 512;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d8d5d0';
    ctx.fillRect(0, 0, S, S);

    // Soft cloudy mottling, the way polished porcelain reads under
    // overhead light. Large and low-contrast on purpose.
    for (let i = 0; i < 90; i++) {
        ctx.fillStyle = ['#dedbd6', '#d2cfc9', '#e3e0db'][i % 3];
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, 30 + Math.random() * 70, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A faint diagonal polish streak, which is what actually says
    // "polished" rather than "matte" at a glance.
    for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 6 + Math.random() * 14;
        const y = Math.random() * S;
        ctx.beginPath();
        ctx.moveTo(-40, y);
        ctx.lineTo(S + 40, y - 90 - Math.random() * 60);
        ctx.stroke();
    }

    // Grout: one cross, so the canvas is a 2 by 2 block of tiles.
    ctx.strokeStyle = 'rgba(150, 146, 140, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
    ctx.stroke();
    // and the edges, so tiles meet cleanly across the repeat seam
    ctx.strokeRect(0, 0, S, S);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Lot asphalt: dark, slightly blotchy, with a little coarse aggregate
 *  speckle and one seam. Tiled hard over a big plane, so it stays low
 *  contrast to avoid reading as a pattern. */
function createAsphaltTexture() {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3c3b3a';
    ctx.fillRect(0, 0, S, S);

    // Broad tonal patches, the way resurfaced asphalt weathers
    for (let i = 0; i < 26; i++) {
        ctx.fillStyle = ['#403f3e', '#383736', '#454342'][i % 3];
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, 20 + Math.random() * 45, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Aggregate speckle
    for (let i = 0; i < 2600; i++) {
        const g = 40 + Math.floor(Math.random() * 45);
        ctx.fillStyle = `rgb(${g},${g - 1},${g - 2})`;
        ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Where the concrete walk outside the glass begins and ends, in world z.
 *
 *  Pulled out of the builder for the same reason stallStripeRun was: the
 *  number that was wrong here was an EXPRESSION, not a constant, so a
 *  check reading LAYOUT would have agreed with the bug. It ran the walk
 *  2.0 + (kerbZ - apronFarZ) = 3.55m deep when the span from its back edge
 *  to its front edge is 8.0, which stopped the concrete 0.63m INSIDE the
 *  building and left the ground between the glass and the asphalt missing
 *  altogether. The visitor saw the sky background through the hole and
 *  reported a "sky blue band" under the window.
 *
 *  nearZ runs back under the showroom on purpose, so no camera move can
 *  ever open a seam at the base rail. */
function walkSpan(lot) {
    const nearZ = 2.0;
    return { nearZ, farZ: lot.apronFarZ, depth: nearZ - lot.apronFarZ,
             centerZ: (nearZ + lot.apronFarZ) / 2 };
}

/** The walk outside the glass: poured concrete in slabs, with a control
 *  joint at every edge and a little tonal drift between panels, so the
 *  band between the showroom and the lot reads as a sidewalk rather than
 *  as a grey plane. One canvas is one slab, tiled. */
function createSidewalkTexture() {
    const S = 128;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c3c0b9';
    ctx.fillRect(0, 0, S, S);

    // Broad tonal patches: concrete never pours evenly
    for (let i = 0; i < 14; i++) {
        ctx.fillStyle = ['#c7c4bd', '#bebbb4', '#c9c6c0'][i % 3];
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, 12 + Math.random() * 26, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fine aggregate, well under the tonal patches so it never sparkles
    for (let i = 0; i < 900; i++) {
        const g = 175 + Math.floor(Math.random() * 26);
        ctx.fillStyle = `rgb(${g},${g - 2},${g - 7})`;
        ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
    }

    // The control joints, on two edges only: drawing all four would double
    // every line where the tiles meet and the walk would read as tiling.
    ctx.strokeStyle = '#a6a39c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0.5, 0); ctx.lineTo(0.5, S);
    ctx.moveTo(0, 0.5); ctx.lineTo(S, 0.5);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** How far, and WHICH WAY, one painted stall stripe travels in world x
 *  between its near end and the far end of the stall. Signed metres.
 *
 *  Pulled out of the texture because the sign is the whole question and
 *  it is not checkable once it has been drawn onto a canvas. A car parked
 *  in the row carries rotation.y = angle, so its long axis runs along
 *  (sin angle, cos angle): heading away from the showroom, into -Z, its x
 *  FALLS. The paint has to fall with it. It did not, until QA looked out
 *  of the window and found every car parked across its own bay. */
function stallStripeRun(depth, angle) {
    return -depth * Math.tan(angle);
}

/** The stripe texture's u offset that parks a car in the MIDDLE of its bay
 *  instead of on a line, in tile widths.
 *
 *  This is the round-two fix, done properly. That round set the offset to
 *  half a bay, reasoning that a stripe BEGINS where the loop puts a car.
 *  It does, at the stripe's near end. But a stripe leans: over the stall's
 *  depth it travels `run` metres in x, so at the row's mid-depth, which is
 *  exactly where the car stands, it has already moved half of that. Half a
 *  bay and half a run very nearly cancel, and the cars came back parked
 *  along the paint rather than beside it.
 *
 *  The check that passed this compared the car against the stripe's near
 *  END, which is a metre and a half from where the car actually is. Solve
 *  for x at v = 0.5 and the answer falls out:
 *
 *      planeWest + (k - offset) * pitch + run / 2  =  carX + pitch / 2
 *
 *  with planeWest = from - pitch and carX = from + i * pitch. */
function stallStripeOffset(pitch, depth, angle) {
    const want = 0.5 + stallStripeRun(depth, angle) / (2 * pitch);
    return want - Math.floor(want);
}

/** One row of angled stall stripes, as a cutout texture laid just above
 *  the asphalt. The canvas covers exactly one stall pitch across and the
 *  full stall depth down, so repeating it along U walks the stripes down
 *  the row.
 *
 *  The line is drawn several times at multiples of the canvas width so it
 *  survives the wrap: a single stroke would simply be clipped at the edge
 *  and the pattern would break at every tile seam.
 *
 *  WHICH WAY THE STRIPE LEANS is not a free choice, and getting it wrong
 *  parks every car across its own bay. The stripe plane is laid flat with
 *  rotation.x = -PI/2, which sends the canvas TOP (v = 1) to world -Z, out
 *  into the lot, and the canvas RIGHT (u = 1) to world +X. A car in the
 *  row carries rotation.y = angle, so its long axis points along
 *  (sin angle, cos angle): going away from the showroom, x DECREASES.
 *  The stripe therefore has to travel LEFT across the canvas as it climbs
 *  from bottom to top, which is where the minus below comes from. It was
 *  a plus until QA caught the cars and the paint disagreeing. */
function createStallStripeTexture(pitch, depth, angle) {
    const W = 256, H = 256;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Signed metres of world x the stripe covers between its near end and
    // its far end, one stall deep.
    const runMetres = stallStripeRun(depth, angle);
    const runPx = (runMetres / pitch) * W;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#e8e6dd';
    ctx.lineWidth = Math.max(4, (0.12 / pitch) * W);
    ctx.lineCap = 'butt';
    for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(k * W, H);
        ctx.lineTo(k * W + runPx, 0);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** The deal sheet: a dealership four square, which is the page every one
 *  of these conversations actually happens over. Trade, price, down
 *  payment, monthly, one box each, and the whole trick of it is moving a
 *  number out of the box you are watching into one you are not.
 *
 *  Deliberately carries NO prices. Marks and struck-through scribbles
 *  read as a worked page at a glance and at a lean, and nothing on it
 *  could ever be mistaken for a real offer. */
function drawDealSheet() {
    const W = 320, H = 440;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(0, 0, W, H);

    // Header band in the brand navy
    ctx.fillStyle = '#12294a';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = '#f0a51e';
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillText('WORKSHEET', 16, 31);

    // The four square itself
    const bx = 20, by = 70, bw = W - 40, bh = 250;
    ctx.strokeStyle = '#2a3340';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2, by); ctx.lineTo(bx + bw / 2, by + bh);
    ctx.moveTo(bx, by + bh / 2); ctx.lineTo(bx + bw, by + bh / 2);
    ctx.stroke();

    ctx.fillStyle = '#39414d';
    ctx.font = 'bold 15px system-ui, sans-serif';
    const labels = ['TRADE', 'PRICE', 'DOWN', 'MONTHLY'];
    labels.forEach((label, i) => {
        const cx = bx + (i % 2) * (bw / 2) + 12;
        const cy = by + Math.floor(i / 2) * (bh / 2) + 22;
        ctx.fillText(label, cx, cy);
    });

    // Pen work: a couple of struck-through figures per box, as marks
    // rather than numbers, plus a circled one in the trade box.
    ctx.strokeStyle = '#1d3f7a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const scribble = (cx, cy, n) => {
        for (let i = 0; i < n; i++) {
            const y = cy + i * 22;
            ctx.beginPath();
            ctx.moveTo(cx, y);
            ctx.lineTo(cx + 52 + ((i * 17) % 23), y);
            ctx.stroke();
            if (i < n - 1) {   // struck through, the way a countered number is
                ctx.beginPath();
                ctx.moveTo(cx - 4, y - 4);
                ctx.lineTo(cx + 62, y + 5);
                ctx.stroke();
            }
        }
    };
    scribble(bx + 16, by + 52, 3);
    scribble(bx + bw / 2 + 16, by + 52, 3);
    scribble(bx + 16, by + bh / 2 + 52, 2);
    scribble(bx + bw / 2 + 16, by + bh / 2 + 52, 3);

    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(bx + 52, by + 96, 46, 17, 0.06, 0, Math.PI * 2);
    ctx.stroke();

    // The products line under the square, the other half of the deal
    ctx.fillStyle = '#39414d';
    ctx.font = '13px system-ui, sans-serif';
    ['WARRANTY', 'TIRE & WHEEL', 'GAP'].forEach((t, i) => {
        const y = by + bh + 34 + i * 26;
        ctx.fillText(t, bx + 30, y);
        ctx.strokeStyle = '#2a3340';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 6, y - 12, 15, 15);
    });

    return new THREE.CanvasTexture(canvas);
}

/** What is on the dealer's screen: the car, and the numbers beside it.
 *
 *  Deliberately unreadable, and that is not laziness. The panel is 0.30m
 *  wide and about 4.5m from the eye, so the whole screen is roughly 60
 *  pixels across: anything that reads as words at that size would be one
 *  grey smear, and anything that DID resolve would be a price, which this
 *  scene never shows (same rule as the deal sheet). A car in outline and
 *  a column of ruled lines is exactly as much as the eye can take in, and
 *  it is honest about what a dealer has up: the vehicle, and its figures. */
function drawDealerScreen() {
    const W = 256, H = 170;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#16283c';
    ctx.fillRect(0, 0, W, H);
    // a header bar in the brand navy, with a gold rule under it
    ctx.fillStyle = '#0e1c2c';
    ctx.fillRect(0, 0, W, 22);
    ctx.fillStyle = '#f0a51e';
    ctx.fillRect(0, 22, W, 2);
    ctx.fillStyle = '#7f97ad';
    ctx.fillRect(10, 8, 62, 6);
    ctx.fillRect(W - 34, 8, 24, 6);

    // The car, in outline: a three-box side elevation with wheels.
    ctx.strokeStyle = '#cfe0ef';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    const bx = 16, by = 58, bw = 128, bh = 34;
    ctx.beginPath();
    ctx.moveTo(bx, by + bh);
    ctx.lineTo(bx + 4, by + 12);
    ctx.lineTo(bx + 34, by + 8);
    ctx.lineTo(bx + 52, by - 16);
    ctx.lineTo(bx + 92, by - 16);
    ctx.lineTo(bx + 104, by + 8);
    ctx.lineTo(bx + bw - 4, by + 14);
    ctx.lineTo(bx + bw, by + bh);
    ctx.closePath();
    ctx.stroke();
    // glazing
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 56, by + 4);
    ctx.lineTo(bx + 66, by - 11);
    ctx.lineTo(bx + 88, by - 11);
    ctx.lineTo(bx + 96, by + 4);
    ctx.closePath();
    ctx.stroke();
    // wheels
    ctx.lineWidth = 2.5;
    for (const wx of [bx + 30, bx + 100]) {
        ctx.beginPath();
        ctx.arc(wx, by + bh, 11, 0, Math.PI * 2);
        ctx.stroke();
    }

    // The figures beside it, as ruled lines. Four rows, because a deal
    // sheet has four boxes and this is the same conversation.
    ctx.fillStyle = '#8fa8bd';
    for (let i = 0; i < 5; i++) {
        const y = 40 + i * 20;
        ctx.fillRect(164, y, 34 + ((i * 13) % 26), 5);
        ctx.fillStyle = '#f0a51e';
        ctx.fillRect(224, y, 18 - ((i * 7) % 9), 5);
        ctx.fillStyle = '#8fa8bd';
    }
    ctx.strokeStyle = '#2c4762';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(156, 30); ctx.lineTo(156, H - 12);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

/** A pennant string as one cutout strip: triangular flags hanging from a
 *  cord, alternating through the brand colors. Cheaper than geometry and
 *  perfectly legible at the distance it hangs. */
function createPennantTexture() {
    const W = 512, H = 96;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // The cord
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, W, 4);

    const colors = ['#f0a51e', '#12294a', '#e8e6dd', '#0d5bc4'];
    const n = 16;
    const step = W / n;
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = colors[i % colors.length];
        const x = i * step;
        ctx.beginPath();
        ctx.moveTo(x + 2, 3);
        ctx.lineTo(x + step - 2, 3);
        ctx.lineTo(x + step / 2, H - 8);
        ctx.closePath();
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// ============================================
// SHARED MATERIALS
// ============================================
const whiteTrim = new THREE.MeshStandardMaterial({ color: PALETTE.trimWhite, roughness: 0.7, metalness: 0.0 });
const matteBlack = new THREE.MeshStandardMaterial({ color: 0x1c1b1f, roughness: 0.7, metalness: 0.1 });
const brushedMetal = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.7 });
const leafMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.leafGreen, roughness: 0.65, metalness: 0.0, side: THREE.DoubleSide
});

// ============================================
// ANIMATION REGISTRIES (filled during build, driven by updateShowroom)
// ============================================
let wallClock = null;    // { hour, minute, second } hand pivots on the wall clock
let cast = null;         // { john, customer, dealer }, each { group, waist, neck, arms, yaw, seat }

// ============================================
// INITIALIZE THE SHOWROOM WORLD
// ============================================
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group (added to the scene).
    showroomGroup = initWorld(AUTOMAN_CONFIG);

    createShowroom();         // floor, ceiling, walls, baseboards, the corner piers
    createLot();              // the apron, the asphalt, the parked rows, the backdrop
    createCurtainWall();      // the floor-to-ceiling glazing across the back
    createDealerDesk();       // the sales desk itself
    createDeskItems();        // the deal sheet, the pages, the screen, the die-cast
    createDeskChairs();       // three chairs, aimed the way their sitters are
    createFixtures();         // the sales board, key board, coffee bar, waiting area
    createCast();             // John, his customer, and the dealer
    createWallClock();        // real local time, on the west wall
    createShowroomLighting(); // the shared rig, reskinned as recessed panels
    createDaylightShaft();    // the faux daylight washing in through the glass

    // Background scenery: the drifting clouds the glass wall frames.
    createBackgroundScenery();

    return showroomGroup;
}

// ============================================
// THE ROOM SHELL
// ============================================
/** Floor, ceiling, the three solid walls, their baseboards, and the two
 *  slim piers that flank the curtain wall. The glazing itself is
 *  createCurtainWall below. */
function createShowroom() {
    const room = new THREE.Group();
    room.name = 'showroom';

    const R = LAYOUT.room;
    const G = LAYOUT.glass;
    const { height, wallT } = R;
    const width = R.maxX - R.minX;
    const depth = R.maxZ - R.minZ;
    const cx = (R.minX + R.maxX) / 2;
    const cz = (R.minZ + R.maxZ) / 2;

    // --- Floor: large-format polished porcelain. One canvas tile covers
    // a 2 by 2 block, so a repeat of about 3.2 by 3.1 over a 7.6 by 7.4
    // room lands the tiles near 1.2 metres, which is the size a showroom
    // actually uses. ---
    const floorTexture = createShowroomFloorTexture();
    floorTexture.repeat.set(3.2, 3.1);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshStandardMaterial({
            map: floorTexture, color: PALETTE.floorGrey, roughness: 0.28, metalness: 0.06
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    floor.name = 'floor';
    room.add(floor);

    // --- Ceiling: a thin slab rather than a plane so it reliably casts
    // shadow and the frozen noon sun cannot blast through the roof. ---
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + wallT * 2, 0.12, depth + wallT * 2),
        new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.9, metalness: 0.0 })
    );
    ceiling.position.set(cx, height + 0.06, cz);
    ceiling.castShadow = true;
    room.add(ceiling);

    // The paint texture is deliberately near-white: PALETTE.wallGrey does
    // the colouring, so the roller mottle keeps its relative strength at
    // any wall tone and there is exactly one number to turn.
    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createWallPaintTexture(), color: PALETTE.wallGrey,
        roughness: 0.85, metalness: 0.0
    });

    // --- East and west walls: single slabs the full depth of the room
    // (the shared builders attach themselves to the world group). ---
    createWall(depth, height, wallT, R.minX, height / 2, cz, Math.PI / 2, wallMaterial, 'westWall');
    createWall(depth, height, wallT, R.maxX, height / 2, cz, Math.PI / 2, wallMaterial, 'eastWall');

    // --- Front wall (behind the camera): solid. The pan row cannot turn
    // far enough to see it. ---
    createWallSegment(width, height, wallT, cx, height / 2, R.maxZ, wallMaterial, 'frontWall');

    // --- North (back) wall: only the two corner piers survive. The rest
    // of the elevation is glass, floor to ceiling. ---
    const nz = R.minZ;
    const gLeft = G.x - G.width / 2;
    const gRight = G.x + G.width / 2;
    [
        { from: R.minX, to: gLeft, name: 'northPierWest' },
        { from: gRight, to: R.maxX, name: 'northPierEast' }
    ].forEach((p) => {
        createWallSegment(p.to - p.from, height, wallT, (p.from + p.to) / 2, height / 2, nz, wallMaterial, p.name);
    });

    // --- Baseboards: white molding along the floor, on the three solid
    // walls only. The curtain wall has an aluminium base rail instead, so
    // the north run stops at the piers. ---
    const baseH = 0.1;
    const baseD = 0.045;
    const baseLip = 0.04;
    const innerE = R.maxX - wallT / 2;
    const innerW = R.minX + wallT / 2;
    const innerN = nz + wallT / 2;
    const innerS = R.maxZ - wallT / 2;
    const addBaseboard = (name, alongX, at, from, to) => {
        const geom = alongX
            ? new THREE.BoxGeometry(to - from, baseH, baseD)
            : new THREE.BoxGeometry(baseD, baseH, to - from);
        const board = new THREE.Mesh(geom, whiteTrim);
        board.position.set(alongX ? (from + to) / 2 : at, baseH / 2, alongX ? at : (from + to) / 2);
        board.name = name;
        room.add(board);
    };
    addBaseboard('baseSouth', true, innerS - baseLip, innerW, innerE);
    addBaseboard('baseWest', false, innerW + baseLip, innerN + baseLip, innerS - baseLip - baseD);
    addBaseboard('baseEast', false, innerE - baseLip, innerN + baseLip, innerS - baseLip - baseD);
    addBaseboard('basePierWest', true, innerN + baseLip, innerW, gLeft);
    addBaseboard('basePierEast', true, innerN + baseLip, gRight, innerE);

    showroomGroup.add(room);
}

/** The curtain wall: floor-to-ceiling glazing across almost the whole
 *  back elevation, the way a real showroom is built and the single
 *  biggest reason this room reads as a dealership.
 *
 *  An aluminium base rail at the floor, a head channel under the ceiling,
 *  vertical mullions dividing the run into bays, and one horizontal
 *  transom across for scale. Everything is measured off LAYOUT.glass so
 *  the bays stay even if the wall is resized.
 *
 *  The whole assembly is one registered prop, so a tap anywhere on the
 *  glass or its frame tells the story of the lot beyond it.
 *
 *  On the composition: a bright wall behind a seated figure risks
 *  silhouetting him, which would be a real problem for the dealer. It
 *  works here because the camera looks slightly DOWN at the desk, so most
 *  of the glass behind his head shows mid-tone asphalt and parked cars
 *  rather than open sky. Worth re-checking at M4 once he is actually in
 *  the chair, and again at M2 when the lot's tones are set. */
function createCurtainWall() {
    const R = LAYOUT.room;
    const G = LAYOUT.glass;
    const wall = new THREE.Group();
    wall.name = 'curtainWall';

    const nz = R.minZ;
    const innerN = nz + R.wallT / 2;      // the wall's room-side face
    const glassTop = R.height - G.headRail;
    const glassBottom = G.baseRail;

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x9aa1a8, roughness: 0.4, metalness: 0.65
    });
    // Low opacity on purpose: this much glass at a higher value would
    // wash the lot out, and the lot is the whole point of the wall.
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6f2, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide
    });

    // Base rail and head channel, running the full width.
    const rail = (h, y, name) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(G.width, h, 0.1), frameMaterial);
        bar.position.set(G.x, y, innerN);
        bar.name = name;
        wall.add(bar);
    };
    rail(G.baseRail, G.baseRail / 2, 'baseRail');
    rail(G.headRail, R.height - G.headRail / 2, 'headRail');

    // Mullions: one at each jamb and one between every pair of bays, so
    // bays + 1 verticals share the run with the glass.
    const paneW = (G.width - G.mullion * (G.bays + 1)) / G.bays;
    const step = paneW + G.mullion;
    const firstMullionX = G.x - G.width / 2 + G.mullion / 2;
    const mullionH = glassTop - glassBottom;
    for (let i = 0; i <= G.bays; i++) {
        const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(G.mullion, mullionH, 0.09), frameMaterial
        );
        mullion.position.set(firstMullionX + i * step, glassBottom + mullionH / 2, innerN);
        mullion.name = `mullion_${i}`;
        wall.add(mullion);
    }

    // One transom across, and the glass panes above and below it.
    const transom = new THREE.Mesh(
        new THREE.BoxGeometry(G.width, G.mullion, 0.09), frameMaterial
    );
    transom.position.set(G.x, G.transomY, innerN);
    transom.name = 'transom';
    wall.add(transom);

    const lights = [
        { from: glassBottom, to: G.transomY - G.mullion / 2, tag: 'lower' },
        { from: G.transomY + G.mullion / 2, to: glassTop, tag: 'upper' }
    ];
    for (let bay = 0; bay < G.bays; bay++) {
        const cxBay = firstMullionX + G.mullion / 2 + paneW / 2 + bay * step;
        lights.forEach((band) => {
            const h = band.to - band.from;
            if (h <= 0) return;
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneW, h), glassMaterial);
            pane.position.set(cxBay, band.from + h / 2, nz);
            pane.name = `pane_${band.tag}_${bay}`;
            wall.add(pane);
        });
    }

    showroomGroup.add(registerOutdoorProp(wall, 'window'));
}

// ============================================
// THE LOT (seen through the curtain wall)
// ============================================
// Everything out here is scenery. Nothing in the lot is registered as a
// prop, so a tap anywhere through the glass resolves to the curtain wall
// itself, which is exactly right: its story IS the lot.
//
// Three tiers of car, cheaper the further away they sit. Geometries and
// materials are built once and shared across all 21 cars, so the row
// count costs draw calls rather than memory.

const CAR_COLORS = [0xdfe2e5, 0x9aa0a6, 0x1f2226, 0x1d3c66, 0x8c2130, 0x4a5a3f];

/** The widest thing parked on the lot, across its body, including any
 *  cladding proud of the paint. The bay has to hold it, and the bay check
 *  reads this rather than a number somebody typed twice: the SUV arrived
 *  0.15m wider than the sedan the bays were sized for. */
function widestVehicle() {
    const sedan = 1.86;                 // the tier-1 car's skirt
    return Math.max(sedan, suvWidth());
}

let _carGeo = null;
let _carMats = null;

function carGeometries() {
    if (_carGeo) return _carGeo;
    _carGeo = {
        body: new THREE.BoxGeometry(1.82, 0.58, 4.40),
        cabin: new THREE.BoxGeometry(1.66, 0.52, 2.20),
        glassBand: new THREE.BoxGeometry(1.70, 0.30, 2.10),
        wheel: new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10),
        skirt: new THREE.BoxGeometry(1.86, 0.30, 4.20),
        lamp: new THREE.BoxGeometry(0.34, 0.12, 0.06),
        slab: new THREE.BoxGeometry(1.84, 1.04, 4.40),
        slabGlass: new THREE.BoxGeometry(1.86, 0.32, 2.30)
    };
    return _carGeo;
}

function carMaterials() {
    if (_carMats) return _carMats;
    _carMats = {
        bodies: CAR_COLORS.map((c) => new THREE.MeshStandardMaterial({
            color: c, roughness: 0.35, metalness: 0.45
        })),
        glass: new THREE.MeshStandardMaterial({
            color: 0x1a2530, roughness: 0.15, metalness: 0.5
        }),
        lampFront: new THREE.MeshStandardMaterial({
            color: 0xf2f0e6, roughness: 0.25, metalness: 0.2
        }),
        lampRear: new THREE.MeshStandardMaterial({
            color: 0x8e1f24, roughness: 0.35, metalness: 0.2
        }),
        // The SUV's own three. Its paint comes from the same bodies array
        // as every other car, so an SUV takes its turn in the row's colour
        // rotation instead of standing out as the odd one.
        suvTrim: new THREE.MeshStandardMaterial({
            color: 0x26282c, roughness: 0.6, metalness: 0.2
        }),
        tire: new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.9 }),
        rim: new THREE.MeshStandardMaterial({
            color: 0xd2d5da, roughness: 0.35, metalness: 0.3
        }),
        chrome: new THREE.MeshStandardMaterial({
            color: 0xc9ccd2, roughness: 0.3, metalness: 0.4
        }),
        suvHead: new THREE.MeshStandardMaterial({
            color: 0xeef4ff, roughness: 0.25, metalness: 0.2,
            emissive: 0x334455, emissiveIntensity: 0.4
        })
    };
    return _carMats;
}

/** A rounded-rectangle THREE.Shape from (x0,y0) to (x1,y1), corner radius
 *  r. Borrowed from www/interstate, where it gives its parked SUV soft
 *  panel corners instead of boxy ones. */
function roundedRectShape(x0, y0, x1, y1, r) {
    const shape = new THREE.Shape();
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x1 - r, y0);
    shape.quadraticCurveTo(x1, y0, x1, y0 + r);
    shape.lineTo(x1, y1 - r);
    shape.quadraticCurveTo(x1, y1, x1 - r, y1);
    shape.lineTo(x0 + r, y1);
    shape.quadraticCurveTo(x0, y1, x0, y1 - r);
    shape.lineTo(x0, y0 + r);
    shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    return shape;
}

// The SUV's geometry, built ONCE and shared by every SUV on the lot.
//
// This matters more here than it does in www/interstate, which builds one
// SUV and stops. Extruded, bevelled panels are the expensive part of that
// model, and a lot has rows of cars: building them per vehicle would pay
// the cost as many times as there are SUVs. Sharing means an extra SUV in
// the row costs draw calls and nothing else, exactly like the sedans.
const SUV = {
    length: 5.0, width: 1.98, wheelR: 0.38, wheelW: 0.28,
    // How far the tyre sits inside the body's flank. The original parks on
    // a street and wears torus wheel arches over wheels that stand 12cm
    // proud; those arches are the first thing to go at eleven metres, and
    // without them a proud wheel is just a wheel sticking out. Tucking the
    // track in also matters for a reason a street has and a lot does not:
    // the widest point of the vehicle has to fit inside a painted bay.
    trackInset: 0.08,
    sill: 0.42, beltline: 1.18, glassH: 0.50, glassW: 1.66
};

/** The SUV's true width, which is NOT SUV.width: the widest point is the
 *  alloy hub face, a centimetre proud of the tyre, and the tyres sit
 *  outboard of the paint. Measured against real three.js geometry (the
 *  test stub's meshes have no vertices, so a bounding box under it is
 *  always empty) and derived here so the bay check reads one number. */
function suvWidth() {
    return 2 * (SUV.width / 2 - SUV.trackInset + 0.01 + (SUV.wheelW + 0.02) / 2);
}
let _suvGeo = null;

/** Extrude a side profile across the vehicle's width. The profile is
 *  authored in (local Z, world Y) and a -90 degree turn maps its X axis
 *  onto Z and its depth onto the width, which is the trick that lets a
 *  windscreen be raked and a liftgate be upright. */
function suvPanel(shape, bevel, panelW) {
    const depth = panelW - 2 * bevel;
    return {
        geometry: new THREE.ExtrudeGeometry(shape, {
            depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
            bevelSegments: 2, curveSegments: 8
        }),
        offsetX: depth / 2
    };
}

function suvGeometries() {
    if (_suvGeo) return _suvGeo;
    const S = SUV;
    const fZ = S.length / 2, rZ = -S.length / 2;
    const roofY = S.beltline + S.glassH;

    // The greenhouse profile is the one piece that says which way the
    // vehicle is pointed: a raked screen at the front, an upright liftgate
    // almost at the tail.
    const glass = new THREE.Shape();
    glass.moveTo(-2.14, 0);
    glass.lineTo(1.24, 0);
    glass.quadraticCurveTo(1.02, S.glassH, 0.52, S.glassH);
    glass.lineTo(-2.02, S.glassH);
    glass.quadraticCurveTo(-2.2, S.glassH, -2.2, S.glassH - 0.14);
    glass.lineTo(-2.14, 0);

    _suvGeo = {
        body: suvPanel(roundedRectShape(rZ + 0.06, S.sill + 0.02, fZ + 0.06, S.beltline, 0.24), 0.06, S.width),
        // proud of the paint by 1.5cm so the two curved surfaces never
        // share a plane: flush panels z-fight into a speckled band
        clad: suvPanel(roundedRectShape(rZ + 0.02, S.sill - 0.02, fZ + 0.02, S.sill + 0.16, 0.14), 0.05, S.width + 0.03),
        roof: suvPanel(roundedRectShape(-2.24, roofY, 0.55, roofY + 0.13, 0.10), 0.04, S.glassW + 0.06),
        glass: new THREE.ExtrudeGeometry(glass, { depth: S.glassW, bevelEnabled: false, curveSegments: 8 }),
        rail: new THREE.BoxGeometry(0.06, 0.05, 2.5),
        tire: new THREE.CylinderGeometry(S.wheelR, S.wheelR, S.wheelW, 14),
        hub: new THREE.CylinderGeometry(S.wheelR * 0.55, S.wheelR * 0.55, S.wheelW + 0.02, 10),
        grille: new THREE.BoxGeometry(S.width * 0.58, 0.42, 0.06),
        grilleBar: new THREE.BoxGeometry(S.width * 0.58, 0.05, 0.09),
        lamp: new THREE.BoxGeometry(0.34, 0.11, 0.06),
        tailBar: new THREE.BoxGeometry(S.width * 0.86, 0.13, 0.05)
    };
    return _suvGeo;
}

/** A parked SUV: the same shape www/interstate parks outside its window,
 *  cut down to what survives eleven metres and a pane of glass.
 *
 *  A lot of identical three-box sedans reads as wallpaper, and a real
 *  dealership's front row is mostly the tall things. This is the variety,
 *  so only SOME of the near row are SUVs and the rest stay sedans.
 *
 *  What was kept from the original: extruded panels with bevelled edges
 *  (the whole reason it looks polished rather than folded out of boxes), a
 *  raked windscreen against an upright liftgate, roof rails, alloy hubs, a
 *  grille with a chrome bar, and a full-width tail bar. What was dropped:
 *  the torus wheel arches, the mirrors, the B-pillars and the spoiler, all
 *  of which are under a pixel from the showroom and each of which is a
 *  draw call. 17 meshes against the tier-1 sedan's 11.
 *
 *  Local forward +Z and origin on the ground between the wheels, the same
 *  contract createParkedCar keeps, so the row builder can place either. */
function createLotSUV(bodyMaterial) {
    const g = suvGeometries();
    const m = carMaterials();
    const S = SUV;
    const suv = new THREE.Group();
    suv.userData.bodyMeshes = [];

    const panel = (part, material) => {
        const mesh = new THREE.Mesh(part.geometry, material);
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.x = part.offsetX;     // recentre after the turn
        return mesh;
    };
    const body = panel(g.body, bodyMaterial);
    suv.add(body);
    suv.userData.bodyMeshes.push(body);
    suv.add(panel(g.clad, m.suvTrim));

    const greenhouse = new THREE.Mesh(g.glass, m.glass);
    greenhouse.rotation.y = -Math.PI / 2;
    greenhouse.position.set(S.glassW / 2, S.beltline, 0);
    suv.add(greenhouse);

    const roof = panel(g.roof, bodyMaterial);
    suv.add(roof);
    suv.userData.bodyMeshes.push(roof);
    [-1, 1].forEach((s) => {
        const rail = new THREE.Mesh(g.rail, m.suvTrim);
        rail.position.set(s * (S.glassW / 2 - 0.12), S.beltline + S.glassH + 0.17, -0.75);
        suv.add(rail);
    });

    suv.userData.wheels = [];
    [[1, 1.62], [1, -1.62], [-1, 1.62], [-1, -1.62]].forEach(([sx, wz]) => {
        const track = S.width / 2 - S.trackInset;
        const tire = new THREE.Mesh(g.tire, m.tire);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(sx * track, S.wheelR, wz);
        suv.add(tire);
        suv.userData.wheels.push(tire);
        // The alloy face sits a centimetre proud of the sidewall, which is
        // what makes a wheel read as a wheel rather than a black disc.
        const hub = new THREE.Mesh(g.hub, m.rim);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(sx * (track + 0.01), S.wheelR, wz);
        suv.add(hub);
    });

    // The nose and tail furniture goes against the body's BEVELLED
    // extents, not its nominal ones. An extrusion's bevel pushes the
    // outline out by bevelSize at each end, so the paint reaches
    // length/2 + 0.12 at the front: a grille placed at the nominal nose is
    // buried inside its own bumper. Measured against real geometry.
    const nose = S.length / 2 + 0.12, tailZ = -S.length / 2;
    const grille = new THREE.Mesh(g.grille, m.suvTrim);
    grille.position.set(0, S.sill + 0.42, nose - 0.02);
    suv.add(grille);
    const bar = new THREE.Mesh(g.grilleBar, m.chrome);
    bar.position.set(0, S.sill + 0.50, nose - 0.01);
    suv.add(bar);
    [-1, 1].forEach((sx) => {
        const lamp = new THREE.Mesh(g.lamp, m.suvHead);
        lamp.position.set(sx * (S.width * 0.33), S.beltline - 0.14, nose - 0.03);
        suv.add(lamp);
    });
    const tail = new THREE.Mesh(g.tailBar, m.lampRear);
    tail.position.set(0, S.beltline - 0.18, tailZ - 0.01);
    suv.add(tail);

    return suv;
}

/** One parked car, local forward +Z, origin between the wheels on the
 *  ground. `tier` trades detail for distance:
 *
 *    1  near row: body, cabin, glazing, four wheels, lamps  (11 meshes)
 *       (and some bays of the near row hold createLotSUV instead)
 *    2  middle:   body, cabin, glazing, a dark skirt         (4 meshes)
 *    3  far row:  one slab and a glazing band                (2 meshes)
 *
 *  Nothing out here casts or receives shadow. The only shadow-casting
 *  light in the scene is the daylight shaft aimed INTO the room, so lot
 *  shadows would cost fill rate and buy nothing. */
function createParkedCar(tier, bodyMaterial) {
    const g = carGeometries();
    const m = carMaterials();
    const car = new THREE.Group();

    // Painted panels are collected so a car can be recoloured later
    // without guessing which meshes carry the body material.
    car.userData.bodyMeshes = [];

    if (tier === 3) {
        const slab = new THREE.Mesh(g.slab, bodyMaterial);
        slab.position.y = 0.52;
        car.add(slab);
        car.userData.bodyMeshes.push(slab);
        const band = new THREE.Mesh(g.slabGlass, m.glass);
        band.position.set(0, 0.90, -0.20);
        car.add(band);
        return car;
    }

    const body = new THREE.Mesh(g.body, bodyMaterial);
    body.position.y = 0.58;
    car.add(body);
    car.userData.bodyMeshes.push(body);

    const cabin = new THREE.Mesh(g.cabin, bodyMaterial);
    cabin.position.set(0, 1.10, -0.20);
    car.add(cabin);
    car.userData.bodyMeshes.push(cabin);

    const band = new THREE.Mesh(g.glassBand, m.glass);
    band.position.set(0, 1.14, -0.20);
    car.add(band);

    if (tier === 2) {
        const skirt = new THREE.Mesh(g.skirt, m.glass);
        skirt.position.y = 0.24;
        car.add(skirt);
        return car;
    }

    // The wheels are collected onto the group, because the car that
    // crosses the lot needs to turn them and a parked one does not.
    car.userData.wheels = [];
    [-1, 1].forEach((sx) => {
        [-1, 1].forEach((sz) => {
            const wheel = new THREE.Mesh(g.wheel, matteBlack);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(sx * 0.86, 0.33, sz * 1.42);
            car.add(wheel);
            car.userData.wheels.push(wheel);
        });
        const head = new THREE.Mesh(g.lamp, m.lampFront);
        head.position.set(sx * 0.56, 0.70, 2.21);
        car.add(head);
        const tail = new THREE.Mesh(g.lamp, m.lampRear);
        tail.position.set(sx * 0.56, 0.72, -2.21);
        car.add(tail);
    });

    return car;
}

// ---- The car that crosses the lot ---------------------------------------
// The same little state machine the sunnyvalejenn fence birds run, which
// is where the shape came from: wait, cross, wait again, with the group
// hidden the whole time it is waiting so an off-screen car costs nothing.
//
// It crosses the drive lane between the glass and the first parked row,
// so it passes behind the dealer's shoulder. The lane is only about 7.4m
// wide in frame, so a crawl rather than a drive: at 2.8 m/s (roughly 6
// mph, which is what anyone actually does on a dealership lot) it stays
// in view for about 2.6 seconds, long enough to notice and too short to
// become the subject.
const PASS_SPEED = 2.8;
const PASS_FROM = -17.0;
const PASS_TO = 6.0;
const PASS_GAP = [9, 22];       // seconds of empty lane between crossings
const WHEEL_R = 0.33;           // matches carGeometries().wheel

/** How far a passing car's wheel turns in one frame, as a delta on the
 *  wheel's rotation.x. Signed, in the WHEEL'S OWN frame.
 *
 *  It takes the direction of travel and ignores it, and that is the whole
 *  point of it being a function. The car is turned to face whichever way
 *  it is going (rotation.y = +/- PI/2), so in its own frame it always
 *  drives forward, and its wheels always turn the same way. Multiplying
 *  the spin by the direction, which is what this used to do inline, is
 *  correct for exactly one of the two crossings and backwards for the
 *  other: eastbound cars rolled along with their wheels spinning the wrong
 *  way for two QA rounds before anybody caught it.
 *
 *  The sign comes from rolling without slipping, not from taste. The wheel
 *  sits with its axle on local X (rotation.z = PI/2 lays the cylinder
 *  down), so a point at the bottom of it, (0, -r, 0), moves to z = -r
 *  sin(theta) as theta grows: the contact patch travels BACKWARDS while
 *  the car goes forwards, which is what rolling is. Hence a positive
 *  delta. specs/automan/verify-composition.mjs checks the contact patch
 *  is standing still, in both directions, rather than checking this sign.
 */
function passingWheelDelta(deltaTime, dir) {
    return (PASS_SPEED / WHEEL_R) * deltaTime;
}

let passingCar = null;

function createPassingCar(lot) {
    const L = LAYOUT.lot;
    const materials = carMaterials();

    if (_reducedMotion.matches) {
        // Reduced motion: no crossing at all. One car simply sits in the
        // lane, in frame, so the composition still reads as a working lot.
        const parked = createParkedCar(1, materials.bodies[3]);
        parked.position.set(-4.5, L.groundY, L.driveLaneZ);
        parked.rotation.y = Math.PI / 2;
        lot.add(parked);
        return;
    }

    const car = createParkedCar(1, materials.bodies[0]);
    car.visible = false;
    car.position.set(PASS_FROM, L.groundY, L.driveLaneZ);
    lot.add(car);
    passingCar = {
        group: car,
        wheels: car.userData.wheels || [],
        bodyMeshes: car.userData.bodyMeshes || [],
        state: 'waiting',
        timer: 4 + Math.random() * 6,     // the first one comes along early
        dir: 1,
        pass: 0
    };
}

/** Advance the crossing. Direction alternates and the colour changes on
 *  every pass, so the same car never appears to drive round in circles. */
function updatePassingCar(deltaTime) {
    const p = passingCar;
    if (!p) return;

    if (p.state === 'waiting') {
        p.timer -= deltaTime;
        if (p.timer > 0) return;
        const materials = carMaterials();
        p.dir = p.pass % 2 === 0 ? 1 : -1;
        p.pass += 1;
        // Recolour by swapping the shared body material, which costs
        // nothing: the geometry and every material already exist.
        const body = materials.bodies[p.pass % materials.bodies.length];
        p.bodyMeshes.forEach((mesh) => { mesh.material = body; });
        p.group.position.x = p.dir > 0 ? PASS_FROM : PASS_TO;
        p.group.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.group.visible = true;
        p.state = 'driving';
        return;
    }

    // Driving: roll along the lane, and turn the wheels at the rate the
    // ground speed actually implies rather than a rate that looks about
    // right.
    //
    // The spin goes on rotation.X, which looks wrong and is not. The
    // wheel is a cylinder whose axis starts along local Y, and
    // rotation.z = PI/2 lays that axis down onto X. Under three.js Euler
    // XYZ the z term is applied to the vector first, so the axle ends up
    // along the parent's X and rotation.x is the spin. Putting it on
    // rotation.y would swivel the wheel like a turntable instead.
    p.group.position.x += p.dir * PASS_SPEED * deltaTime;
    const spin = passingWheelDelta(deltaTime, p.dir);
    p.wheels.forEach((wheel) => { wheel.rotation.x += spin; });

    const done = p.dir > 0 ? p.group.position.x >= PASS_TO : p.group.position.x <= PASS_FROM;
    if (done) {
        p.state = 'waiting';
        p.group.visible = false;
        p.timer = PASS_GAP[0] + Math.random() * (PASS_GAP[1] - PASS_GAP[0]);
    }
}

/** The whole lot: the apron and its kerb, the asphalt, the painted stall
 *  rows, the parked cars, two light poles, a pennant string, and the
 *  grass and distant backdrop that keep the horizon from reading as an
 *  empty edge. */
function createLot() {
    const L = LAYOUT.lot;
    const lot = new THREE.Group();
    lot.name = 'lot';

    const width = L.maxX - L.minX;
    const cxLot = (L.minX + L.maxX) / 2;

    // --- The walk, its threshold, and its kerb. The glazing runs to the
    // floor, so the ground outside is in plain view and the two planes
    // must not simply meet: the walk sits a step below the showroom slab,
    // a kerb above the asphalt, and it extends back UNDER the showroom so
    // there can never be a gap at the seam whatever the camera does.
    // (Decision D7's follow-on.)
    //
    // Its span comes from walkSpan(), which the check outside reads too,
    // because the arithmetic here was wrong once and left a hole the
    // visitor saw the sky through. ---
    const W = walkSpan(L);
    const walkTexture = createSidewalkTexture();
    walkTexture.repeat.set(width / 1.35, W.depth / 1.35);
    const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(width, W.depth),
        new THREE.MeshStandardMaterial({ map: walkTexture, roughness: 0.88, metalness: 0.0 })
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(cxLot, L.walkY, W.centerZ);
    walk.name = 'sidewalk';
    lot.add(walk);

    // The threshold at the building line: the step down out of the door.
    const threshold = new THREE.Mesh(
        new THREE.BoxGeometry(width, -L.walkY, 0.10),
        new THREE.MeshStandardMaterial({ color: 0xaeaba4, roughness: 0.9, metalness: 0.0 })
    );
    threshold.position.set(cxLot, L.walkY / 2, L.kerbZ);
    lot.add(threshold);

    // The kerb at the far edge, where the walk drops to the asphalt. Its
    // top is held 3mm BELOW the walk on purpose: at exactly walkY the two
    // faces are coplanar over the whole frontage and z-fight the length of
    // the lot.
    const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(width, L.walkY - L.groundY, 0.16),
        new THREE.MeshStandardMaterial({ color: 0xb5b2ab, roughness: 0.9, metalness: 0.0 })
    );
    kerb.position.set(cxLot, (L.walkY + L.groundY) / 2 - 0.003, L.apronFarZ + 0.08);
    kerb.name = 'kerb';
    lot.add(kerb);

    // --- The asphalt ---
    const asphaltTexture = createAsphaltTexture();
    asphaltTexture.repeat.set(width / 6, (L.apronFarZ - L.asphaltFarZ) / 6);
    const asphalt = new THREE.Mesh(
        new THREE.PlaneGeometry(width, L.apronFarZ - L.asphaltFarZ),
        new THREE.MeshStandardMaterial({ map: asphaltTexture, roughness: 0.92, metalness: 0.0 })
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(cxLot, L.groundY - 0.005, (L.apronFarZ + L.asphaltFarZ) / 2);
    lot.add(asphalt);

    // --- Grass beyond the asphalt, out to the horizon ---
    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(width + 60, L.asphaltFarZ - L.grassFarZ),
        new THREE.MeshStandardMaterial({ color: 0x5f8a4c, roughness: 0.95, metalness: 0.0 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(cxLot, L.groundY - 0.01, (L.asphaltFarZ + L.grassFarZ) / 2);
    lot.add(grass);

    // --- The stall rows, and the cars in them ---
    const materials = carMaterials();
    let colorTick = 0;
    const pitch = L.stallPitch;
    L.rows.forEach((row, rowIndex) => {
        const length = (row.to - row.from) + pitch * 2;
        const centerX = (row.from + row.to) / 2;

        // Painted stripes: one cutout plane per row, a hair above the
        // asphalt. alphaTest rather than transparency, so it still writes
        // depth and never sorts oddly against the cars.
        //
        // The offset is what parks the cars BETWEEN the lines instead of
        // on them, and it accounts for the stripe's own lean at the depth
        // the car stands at. See stallStripeOffset.
        const stripeTexture = createStallStripeTexture(pitch, L.stallDepth, L.stallAngle);
        stripeTexture.repeat.set(length / pitch, 1);
        stripeTexture.offset.set(stallStripeOffset(pitch, L.stallDepth, L.stallAngle), 0);
        const stripes = new THREE.Mesh(
            new THREE.PlaneGeometry(length, L.stallDepth),
            new THREE.MeshStandardMaterial({
                map: stripeTexture, transparent: false, alphaTest: 0.5,
                roughness: 0.9, metalness: 0.0
            })
        );
        stripes.rotation.x = -Math.PI / 2;
        stripes.position.set(centerX, L.groundY + 0.006, row.z);
        stripes.name = `stallRow_${rowIndex}`;
        lot.add(stripes);

        let bay = 0;
        for (let x = row.from; x <= row.to + 1e-6; x += pitch) {
            const bodyMaterial = materials.bodies[colorTick++ % materials.bodies.length];
            // SOME of the near row are SUVs, and the rest stay sedans.
            // A row of identical three-box cars reads as wallpaper, and a
            // real front row is mostly the tall things, but the polished
            // model costs 15 meshes against a sedan's 11, so it goes only
            // where the detail survives: the near row, and not all of it.
            // L.suvBays names which, so the mix is a decision in LAYOUT
            // rather than an accident of a modulus.
            const isSUV = row.tier === 1 && L.suvBays.includes(bay);
            const car = isSUV ? createLotSUV(bodyMaterial) : createParkedCar(row.tier, bodyMaterial);
            bay += 1;
            // Angled parking: every car in a row sits at the same angle,
            // with a degree or two of scatter so the row does not read as
            // a stamped pattern.
            car.rotation.y = L.stallAngle + (((colorTick * 37) % 11) - 5) * 0.004;
            car.position.set(x, L.groundY, row.z + (((colorTick * 53) % 7) - 3) * 0.05);
            lot.add(car);
        }
    });

    // --- Light poles ---
    L.poles.forEach((p, i) => {
        const pole = new THREE.Group();
        pole.name = `lightPole_${i}`;
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.12, 6.2, 8), brushedMetal
        );
        mast.position.y = 3.1;
        pole.add(mast);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.42), matteBlack);
        head.position.set(0.42, 6.15, 0);
        pole.add(head);
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.26, 0.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x9c9993, roughness: 0.9 })
        );
        base.position.y = 0.2;
        pole.add(base);
        pole.position.set(p.x, L.groundY, p.z);
        lot.add(pole);
    });

    // --- The pennant string across the frontage ---
    const P = L.pennants;
    const span = P.toX - P.fromX;
    const pennantTexture = createPennantTexture();
    pennantTexture.repeat.set(span / 4.0, 1);
    const pennants = new THREE.Mesh(
        new THREE.PlaneGeometry(span, 0.62),
        new THREE.MeshStandardMaterial({
            map: pennantTexture, transparent: false, alphaTest: 0.5,
            roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide
        })
    );
    pennants.position.set((P.fromX + P.toX) / 2, P.y, P.z);
    pennants.name = 'pennants';
    lot.add(pennants);
    // No posts. The string used to carry one at each end, and the east one
    // stood in the middle of the glass with the flags ending against it.
    // A dealership's frontage has poles every twenty metres, so the honest
    // reading of an unbroken line of flags is that its poles are outside
    // the window, which is what this now is.

    // --- The backdrop: a treeline and a couple of low commercial blocks,
    // so the far edge of the lot resolves into something rather than
    // running out at a bare horizon. Deliberately simple and unlit by
    // anything but the ambient rig. ---
    const canopy = new THREE.MeshStandardMaterial({ color: 0x33562f, roughness: 0.95 });
    for (let i = 0; i < 14; i++) {
        const x = -58 + i * 5.0 + ((i * 29) % 7) * 0.4;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(2.6, 7, 5), canopy);
        blob.scale.set(1, 0.85 + ((i * 13) % 5) * 0.06, 1);
        blob.position.set(x, L.groundY + 2.4, -37 - ((i * 17) % 5) * 1.4);
        lot.add(blob);
    }
    const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xb4ab9d, roughness: 0.9 });
    [
        { x: -44, w: 16, h: 5.0, z: -45 },
        { x: -20, w: 22, h: 4.2, z: -47 },
        { x: 4, w: 14, h: 5.6, z: -44 }
    ].forEach((b, i) => {
        const block = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, 10), blockMaterial);
        block.position.set(b.x, L.groundY + b.h / 2, b.z);
        block.name = `backdropBlock_${i}`;
        lot.add(block);
    });

    // --- The clouds the window frames ---
    createCloudBank(lot);

    // The car that crosses the lane between the glass and the first row.
    createPassingCar(lot);

    showroomGroup.add(lot);
}

// ---- The clouds -----------------------------------------------------------
// Built here rather than taken from the shared scenery part, for the
// reason in LAYOUT.lot.clouds: that part's clouds hang 26 degrees up and
// the window only passes the first 19.5, so from inside this room there
// has never been anything in the sky at all. These sit in the band the
// glass actually shows.
//
// One geometry and one material across the whole bank, so five clouds cost
// five draw calls and nothing else. The puffs are scaled per mesh rather
// than built per size.
let cloudBank = [];

const CLOUD_PUFFS = [
    { x: 0.0, y: 0.0, z: 0.0, r: 4.0 },
    { x: 3.2, y: 0.4, z: -0.6, r: 3.2 },
    { x: -3.4, y: 0.2, z: 0.5, r: 3.0 },
    { x: 1.4, y: 1.5, z: 0.2, r: 2.6 },
    { x: -1.7, y: 1.1, z: -0.3, r: 2.4 }
];

function createCloudBank(lot) {
    cloudBank = [];
    const L = LAYOUT.lot;
    if (!L.clouds || !L.clouds.length) return;

    const geometry = new THREE.SphereGeometry(1, 8, 6);
    // Basic rather than standard: a cloud is not lit by a showroom, and
    // the shared fog does the whole job of putting it in the distance.
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.92
    });

    L.clouds.forEach((c, i) => {
        const cloud = new THREE.Group();
        cloud.name = `cloud_${i}`;
        // A small cloud gets four puffs rather than five: at this distance
        // the fifth is under a pixel wide and costs a draw call anyway.
        CLOUD_PUFFS.slice(0, c.scale >= 1.0 ? 5 : 4).forEach((puff) => {
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(puff.x * c.scale, puff.y * c.scale, puff.z * c.scale);
            sphere.scale.set(puff.r * c.scale, puff.r * c.scale * 0.62, puff.r * c.scale);
            cloud.add(sphere);
        });
        cloud.position.set(c.x, c.y, c.z);
        lot.add(cloud);
        cloudBank.push({ group: cloud, startX: c.x, drift: c.drift });
    });
}

/** Drift the bank east, wrapping each cloud back to where it started. The
 *  travel is one constant for the whole bank, so no cloud can wander out
 *  of the band the window shows. */
function updateClouds(deltaTime) {
    const travel = LAYOUT.lot.cloudTravel;
    cloudBank.forEach((c) => {
        let x = c.group.position.x + c.drift * deltaTime;
        if (x > c.startX + travel) x -= travel;
        c.group.position.x = x;
    });
}

// ============================================
// THE SALES DESK
// ============================================
/** The desk itself: a plain rectangular table on four legs. Its top
 *  height is the anchor for John's pointing pose, so it is fixed in
 *  LAYOUT rather than tuned here. */
function createDealerDesk() {
    const D = LAYOUT.desk;
    const desk = new THREE.Group();
    desk.name = 'salesDesk';

    const wood = new THREE.MeshStandardMaterial({
        color: PALETTE.deskWood, roughness: 0.5, metalness: 0.03
    });
    const darkWood = new THREE.MeshStandardMaterial({
        color: 0x6d5238, roughness: 0.55, metalness: 0.03
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(D.w, 0.055, D.d), wood);
    top.position.y = D.topY - 0.0275;
    top.castShadow = true;
    top.receiveShadow = true;
    desk.add(top);

    // FOUR LEGS, one at each corner, inset 0.10.
    //
    // A table has no front, which is the point: the pedestal desk this
    // replaced put its drawers on the only end that had room for them, the
    // end nearest the customer, so it read as facing the wrong way. The
    // inset is measured, not styled. John sits at the west end with his
    // shoes under the top, so every leg is checked against every seated
    // figure's own legs in specs/automan/verify-pose.mjs.
    //
    // (Everything below is in the desk group's own coordinates: the group
    //  itself is placed at D.x, D.z at the end of this function.)
    [-1, 1].forEach((sx) => {
        [-1, 1].forEach((sz) => {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(D.legW, D.topY - 0.055, D.legW), darkWood
            );
            leg.position.set(sx * (D.w / 2 - D.legInset), (D.topY - 0.055) / 2,
                             sz * (D.d / 2 - D.legInset));
            leg.castShadow = true;
            desk.add(leg);
        });
    });

    // A rail joining each pair of legs along the ends, which is what stops
    // a four-leg table reading as a top on stilts. It runs along the ENDS
    // only: a rail across the back would be through John's knees.
    [-1, 1].forEach((sx) => {
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(D.legW * 0.7, 0.05, D.d - D.legInset * 2 - D.legW), darkWood
        );
        rail.position.set(sx * (D.w / 2 - D.legInset), D.topY - 0.20, 0);
        desk.add(rail);
    });

    // A slim brand rail along the near edge, the one place the gold
    // appears in the room's furniture.
    const rail = new THREE.Mesh(
        new THREE.BoxGeometry(D.w, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.45, metalness: 0.55 })
    );
    rail.position.set(0, D.topY - 0.065, D.d / 2 - 0.006);
    desk.add(rail);

    desk.position.set(D.x, 0, D.z);
    showroomGroup.add(registerOutdoorProp(desk, 'desk'));
}

/** Everything ON the desk: the deal sheet John points at, the loose pages
 *  around it, the dealer's screen turned away from the visitor, a
 *  calculator, a pen, and the little die-cast on the near corner.
 *
 *  The sheet, the screen, and the model car are their own registered
 *  props, so each answers a tap with its own story. The desk under them
 *  answers for the rest. */
function createDeskItems() {
    const D = LAYOUT.desk;
    const S = LAYOUT.dealSheet;
    const paperWhite = new THREE.MeshStandardMaterial({
        color: 0xf7f5ef, roughness: 0.9, metalness: 0.0
    });

    // ---- The deal sheet, face up, turned a little toward John ----
    const sheetGroup = new THREE.Group();
    sheetGroup.name = 'dealSheet';
    const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.41),
        new THREE.MeshStandardMaterial({ map: drawDealSheet(), roughness: 0.85, metalness: 0.0 })
    );
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = 0.002;
    sheetGroup.add(sheet);
    // A backing card so the page has thickness from a low angle
    const backing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.003, 0.41), paperWhite);
    sheetGroup.add(backing);
    sheetGroup.position.set(S.x, D.topY + 0.003, S.z);
    sheetGroup.rotation.y = -0.22;
    showroomGroup.add(registerOutdoorProp(sheetGroup, 'papers'));

    // ---- Loose supporting pages, fanned beside it ----
    // WEST of the sheet, on John's side. Fanned east they sat exactly
    // where the dealer's mouse has to go, and the papers are the movable
    // ones: his hands are not.
    const loose = new THREE.Group();
    loose.name = 'loosePages';
    [
        { x: -0.24, z: 0.13, r: 0.42 },
        { x: -0.20, z: -0.15, r: -0.28 },
        { x: -0.34, z: -0.01, r: 0.12 }
    ].forEach((p, i) => {
        const page = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.002, 0.29), paperWhite);
        page.position.set(S.x + p.x, D.topY + 0.002 + i * 0.002, S.z + p.z);
        page.rotation.y = p.r;
        loose.add(page);
    });
    showroomGroup.add(loose);

    // ---- The dealer's screen ----
    // WHERE IT SITS is a composition constraint, not a taste one. It
    // started at the desk's east end and stood squarely in front of the
    // dealer, hiding most of him: the camera looks almost straight down
    // the line from the visitor to his chair, so anything on the desk east
    // of centre lands on top of him. Moving it further east is no help
    // either, because his silhouette runs to the edge of the desk in
    // portrait. So it lives at the desk's WEST back corner.
    //
    // WHICH WAY IT FACES is solved, not stored. It used to face the dealer
    // alone and show the visitor a blank black back, and a blank black
    // rectangle is not a screen, it is an absence. screenAim() turns it
    // midway between his eye and the camera's, about 38 degrees off each,
    // so the same panel serves the man using it and the visitor watching.
    // That is also what a dealer does when the numbers are worth showing.
    const SC = LAYOUT.deskScreen;
    const screenAt = { x: D.x + SC.dx, z: D.z + SC.dz };
    const screen = new THREE.Group();
    screen.name = 'dealerScreen';
    const panel = new THREE.Mesh(new THREE.BoxGeometry(SC.w, SC.h, 0.022), matteBlack);
    panel.position.y = SC.midY;
    screen.add(panel);
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(SC.w - 0.024, SC.h - 0.024),
        new THREE.MeshStandardMaterial({
            map: drawDealerScreen(), roughness: 0.3, metalness: 0.1
        })
    );
    face.position.set(0, SC.midY, -0.013);
    face.rotation.y = Math.PI;
    screen.add(face);
    // The stand goes BEHIND the panel. At z 0 its 36mm of diameter stuck
    // out through both sides of a 22mm panel, and the QA note for that was
    // "the monitor's stand seems to be showing through its screen."
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 8), brushedMetal);
    neck.position.set(0, 0.075, 0.028);
    screen.add(neck);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.11), brushedMetal);
    foot.position.set(0, 0.02, 0.02);
    screen.add(foot);
    screen.position.set(screenAt.x, D.topY, screenAt.z);
    screen.rotation.y = screenAim(screenAt, LAYOUT.dealer, AUTOMAN_CONFIG.camera.position);
    showroomGroup.add(registerOutdoorProp(screen, 'computer'));

    // ---- The dealer's keyboard and mouse ----
    // Placed from HIM, not from the desk: straight out along his own
    // facing at K.reach, squared to him. That is sunnyvalejenn's rule and
    // it is what gets BOTH his hands onto the keys rather than one
    // drifting onto the desk beside it. It is also what makes the
    // handedness legible: he sits 23 degrees off the desk's axis, so a
    // keyboard lying square to the desk reads as an object somebody left
    // there, and "to the right of the keyboard" stops meaning "on his
    // right".
    const dealerFacing = dealerYaw();
    const dealerRight = { x: Math.cos(dealerFacing), z: -Math.sin(dealerFacing) };
    const dealerFwd = { x: Math.sin(dealerFacing), z: Math.cos(dealerFacing) };
    const kbAt = keyboardAt();

    const K = LAYOUT.deskKeyboard;
    const kit = new THREE.Group();
    kit.name = 'deskKeyboard';
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(K.w, K.boardH, K.d),
        new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.65, metalness: 0.1 })
    );
    board.position.y = K.boardH / 2;
    kit.add(board);
    // The keys as three banded strips rather than a hundred little boxes:
    // at this distance a keyboard is a dark slab with a lighter grain.
    const keyMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4f57, roughness: 0.8, metalness: 0.0
    });
    for (let r = 0; r < 3; r++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(K.w - 0.05, K.keyH, 0.022), keyMaterial);
        strip.position.set(0, K.boardH + K.keyH / 2, -0.035 + r * 0.032);
        kit.add(strip);
    }
    const space = new THREE.Mesh(new THREE.BoxGeometry(K.w * 0.45, K.keyH, 0.018), keyMaterial);
    space.position.set(0, K.boardH + K.keyH / 2, 0.046);
    kit.add(space);
    kit.position.set(kbAt.x, D.topY, kbAt.z);
    kit.rotation.y = dealerFacing;
    showroomGroup.add(registerOutdoorProp(kit, 'deskkeyboard'));

    const M = LAYOUT.deskMouse;
    const mouse = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 10, 6),
        new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.1 })
    );
    mouse.scale.set(0.72, 0.42, 1.0);
    mouse.position.set(
        kbAt.x + dealerRight.x * M.right + dealerFwd.x * M.fwd,
        D.topY + 0.016,
        kbAt.z + dealerRight.z * M.right + dealerFwd.z * M.fwd
    );
    mouse.rotation.y = dealerFacing;
    mouse.name = 'deskMouse';
    showroomGroup.add(mouse);

    // ---- Calculator and pen, on the dealer's side of the page ----
    // The calculator sits west of the screen now. It used to stand where
    // the keyboard does, which is the spot a keyboard has the better
    // claim to.
    const deskKit = new THREE.Group();
    deskKit.name = 'deskKit';
    const calc = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.012, 0.16), matteBlack);
    calc.position.set(D.x - 0.80, D.topY + 0.006, D.z - 0.10);
    calc.rotation.y = 0.3;
    deskKit.add(calc);
    const calcFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.075, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x9fb8a4, roughness: 0.4 })
    );
    calcFace.rotation.x = -Math.PI / 2;
    calcFace.position.set(D.x - 0.785, D.topY + 0.013, D.z - 0.145);
    calcFace.rotation.z = 0.3;
    deskKit.add(calcFace);
    const pen = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6),
        new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.4, metalness: 0.3 })
    );
    pen.rotation.set(Math.PI / 2, 0, 0.9);
    pen.position.set(S.x + 0.13, D.topY + 0.008, S.z + 0.24);
    deskKit.add(pen);
    showroomGroup.add(deskKit);

    // ---- The die-cast on the near corner. It reuses the lot's own car
    // geometry at 1/22 scale, so the little model costs no new memory at
    // all and is recognisably the same shape as the cars outside. ----
    const model = new THREE.Group();
    model.name = 'modelCar';
    const die = createParkedCar(1, new THREE.MeshStandardMaterial({
        color: PALETTE.gold, roughness: 0.3, metalness: 0.7
    }));
    die.scale.setScalar(0.045);
    die.rotation.y = -0.6;
    die.position.y = 0.012;
    model.add(die);
    const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.012, 0.09),
        new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.2 })
    );
    plinth.position.y = 0.006;
    plinth.rotation.y = -0.6;
    model.add(plinth);
    model.position.set(D.x + D.w / 2 - 0.20, D.topY, D.z + D.d / 2 - 0.16);
    showroomGroup.add(registerOutdoorProp(model, 'modelcar'));
}

/** The three chairs. Each is aimed the same way its occupant will be at
 *  M4, from the same faceToward() call, so a chair can never end up
 *  pointing somewhere its sitter is not. */
function createDeskChairs() {
    const mid = {
        x: (LAYOUT.john.x + LAYOUT.customer.x) / 2,
        z: (LAYOUT.john.z + LAYOUT.customer.z) / 2
    };
    [
        { seat: LAYOUT.john, target: LAYOUT.dealer, kind: 'john' },
        { seat: LAYOUT.customer, target: LAYOUT.dealer, kind: 'customer' },
        // The dealer's chair follows his TURNED yaw, not the pair: he has
        // swung round to his keyboard and the chair went with him.
        { seat: LAYOUT.dealer, target: mid, kind: 'dealer', yaw: dealerYaw() }
    ].forEach(({ seat, target, kind, yaw: fixed }) => {
        const yaw = fixed !== undefined ? fixed : faceToward(seat, target);
        // Nudge the chair a few centimetres back from the sitter, so the
        // backrest sits behind them rather than through them.
        const chair = createDeskChair(
            seat.x - Math.sin(yaw) * 0.04, seat.z - Math.cos(yaw) * 0.04, yaw, kind
        );
        showroomGroup.add(chair);
    });
}

// ============================================
// SEATING (the shared rig stands; this teaches it to sit)
// ============================================
// Used from M4. The three figures at this desk are all seated.
/** The shared createPerson rig builds each leg as one rigid group hinged
 *  at the hip (y 0.75, untagged; arms carry userData.isArm). To sit a
 *  figure down, wrap everything from the knee down (knee sphere, shin,
 *  shoe, and any shoe add-ons) in a new subgroup pivoted at the knee,
 *  swing the thigh forward at the hip, and drop the shin back toward the
 *  floor. Same treatment the karaoke booth and Jenn's office use. */
function poseSeated(person, opts = {}) {
    const hipBend = opts.hipBend !== undefined ? opts.hipBend : -1.42;
    const kneeBend = opts.kneeBend !== undefined ? opts.kneeBend : 1.18;
    // Knees apart. This is not decoration: it is what lets a figure put a
    // hand on their own knee without the arm running through their chest.
    // The rig's shoulder sits at x 0.2125 and its thighs at 0.095, so an
    // arm rolled inward far enough to reach a lap goes INSIDE a torso that
    // is 0.19 half-wide. Splaying moves the knee out to meet the hand
    // instead. Euler order is XYZ, so rotation.z is applied inside the hip
    // bend, which swings the knee outward rather than twisting the leg.
    const splay = opts.splay || 0;
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        const lower = new THREE.Group();
        lower.position.set(0, -0.375, 0);    // the knee sits at half leg length
        const movers = group.children.filter((part) => part.position.y <= -0.37);
        movers.forEach((part) => {
            group.remove(part);
            part.position.y += 0.375;
            lower.add(part);
        });
        group.add(lower);
        group.rotation.x = hipBend;
        if (splay) group.rotation.z = (group.position.x < 0 ? -1 : 1) * splay;
        lower.rotation.x = kneeBend;
    });
}

/** Drop a rig figure onto a seat: hips land just above the cushion, with
 *  the bend coming from poseSeated. scaleY is the figure's y scale. */
function seatHeightY(seatTop, scaleY) {
    return seatTop + 0.05 - 0.75 * scaleY;
}

// The shared rig's joints, in its own local coordinates. Everything the
// three helpers below depend on comes from people-1.0.0.js: legs 0.75,
// torso 0.55, arms hung at the shoulder 0.05 below the torso top.
const HIP_Y = 0.75;                 // top of the legs, base of the torso
const NECK_Y = 1.32 - HIP_Y;        // neck base, in waist-pivot coordinates

/** The shared rig has NO head or neck pivot: the head, eyes, pupils,
 *  nose, ears and hair are all direct children of the person, each
 *  carrying an absolute height, and the hair is a group sitting at y 0
 *  whose own children carry the absolute heights. So a nod needs one
 *  built, and this builds it.
 *
 *  Everything at or above the neck base moves into a pivot there, plus
 *  the hair group by reference, since its own y says nothing about where
 *  it renders. Run this AFTER addWaist, on the waist pivot. */
function addNeck(waist, hair) {
    const pivot = new THREE.Group();
    pivot.position.set(0, NECK_Y, 0);
    const movers = waist.children.filter(
        (child) => child === hair || child.position.y >= NECK_Y + 0.01
    );
    movers.forEach((child) => {
        waist.remove(child);
        child.position.y -= NECK_Y;
        pivot.add(child);
    });
    waist.add(pivot);
    return pivot;
}

/** A waist, for leaning in. The rig cannot lean: its torso is a plain
 *  mesh among the person's children, so rotating it alone would leave
 *  the arms and head behind in mid air.
 *
 *  This wraps EVERYTHING except the two leg groups into a pivot at the
 *  hip, so rotating it tips the whole upper body and carries the arms and
 *  head with it. That is what lets John reach the deal sheet at all: from
 *  his chair the page is 0.85m from his shoulder and the rig's arm is
 *  only 0.61m, so without a lean he would be pointing at thin air.
 *
 *  Run AFTER poseSeated, which needs the leg groups still at hip height
 *  to find them. Returns the pivot. */
function addWaist(person) {
    const pivot = new THREE.Group();
    pivot.position.set(0, HIP_Y, 0);
    const isLeg = (child) => child.isGroup && !child.userData.isArm &&
        Math.abs(child.position.y - HIP_Y) < 0.02;
    const movers = person.children.filter((child) => !isLeg(child));
    movers.forEach((child) => {
        person.remove(child);
        child.position.y -= HIP_Y;
        pivot.add(child);
    });
    person.add(pivot);
    return pivot;
}

/** The hair group, found before anything is rearranged: it is the only
 *  direct child that is a Group, is not an arm, and sits at y 0. A bald
 *  figure simply has none. */
function findHairGroup(person) {
    return person.children.find((child) =>
        child.isGroup && !child.userData.isArm && Math.abs(child.position.y) < 1e-6) || null;
}

/** Give a tagged arm a working elbow: wrap the forearm and hand (the
 *  parts below the elbow sphere at half arm length) into a pivot group
 *  at the joint. The sphere itself stays with the upper arm as the joint
 *  ball. Returns the pivot.
 *
 *  This is what makes John's point read as a point rather than as
 *  sleepwalking: the shared rig's arm is one rigid group hinged at the
 *  shoulder, which cannot put a fingertip on a specific spot on a desk. */
function addElbow(arm) {
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.275, 0);
    const movers = arm.children.filter((part) => part.position.y < -0.28);
    movers.forEach((part) => {
        arm.remove(part);
        part.position.y += 0.275;
        pivot.add(part);
    });
    arm.add(pivot);
    return pivot;
}

/** Yaw that aims a figure standing at `from` toward the point `to`, so a
 *  moved chair keeps its sight line without a second number to update. */
function faceToward(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

/** The dealer's body yaw. He squares up to the pair, then turns DEALER_TURN
 *  away from John toward his own keyboard, which is what a man typing up
 *  an offer while he listens actually does. Everything that has to agree
 *  with where he is pointed (his chair, his keyboard, his hands, the aim of
 *  his screen) reads it from here rather than repeating the arithmetic. */
function dealerYaw() {
    return faceToward(LAYOUT.dealer, {
        x: (LAYOUT.john.x + LAYOUT.customer.x) / 2,
        z: (LAYOUT.john.z + LAYOUT.customer.z) / 2
    }) + DEALER_TURN;
}

/** Where the dealer's keyboard sits: straight out along his own facing, so
 *  both his hands reach the keys. sunnyvalejenn's rule, and the reason her
 *  typing pose reads. */
/** Where the dealer's head has to point to look at his own screen, as
 *  offsets from his body yaw and from his resting neck pitch.
 *
 *  Derived rather than stored, because it depends on three things that
 *  have each moved during QA: where he sits, where the screen ended up
 *  after the sight-line solve, and how far he turned toward his keyboard.
 *
 *  The YAW barely moves: from his chair the screen sits about 23 degrees
 *  to his left and John about 37, so looking from one to the other is a
 *  14 degree turn and would hardly read on its own. The PITCH is what
 *  makes it legible. The screen's middle is 0.97 off the floor and his
 *  eyes are around 1.2, so his head drops about 18 degrees to work and
 *  comes back up to answer, which is what "looking up at John" looks
 *  like. Both are returned so the neck can move on both axes at once. */
function dealerScreenGaze() {
    const yaw = dealerYaw();
    const eyeY = seatHeightY(LAYOUT.chairSeatTop, 1) + 0.75 + 0.55 + 0.08 + 0.12 + 0.02;
    const at = {
        x: LAYOUT.desk.x + LAYOUT.deskScreen.dx,
        y: LAYOUT.desk.topY + LAYOUT.deskScreen.midY,
        z: LAYOUT.desk.z + LAYOUT.deskScreen.dz
    };
    const dx = at.x - LAYOUT.dealer.x, dz = at.z - LAYOUT.dealer.z;
    // Level with John is the resting pitch, so the drop is measured from
    // there rather than from the horizon.
    return {
        neckY: normalizeAngle(Math.atan2(dx, dz) - yaw),
        pitch: Math.atan2(eyeY - at.y, Math.hypot(dx, dz))
    };
}

/** How high above the desk top the surface a fingertip meets actually is.
 *  The board, plus the keys standing on it. Read by the builder and by
 *  specs/automan/verify-pose.mjs, so a hand solved onto it is solved onto
 *  the thing it touches rather than onto the wood underneath. */
function keyTopY() {
    return LAYOUT.desk.topY + LAYOUT.deskKeyboard.boardH + LAYOUT.deskKeyboard.keyH;
}

function keyboardAt() {
    const yaw = dealerYaw();
    return { x: LAYOUT.dealer.x + Math.sin(yaw) * LAYOUT.deskKeyboard.reach,
             z: LAYOUT.dealer.z + Math.cos(yaw) * LAYOUT.deskKeyboard.reach };
}

/** Which way the dealer's screen faces: midway between his own eye and the
 *  visitor's, so the same panel serves the man using it and the person
 *  watching. Solved rather than stored, because it depends on three things
 *  that have each moved during QA.
 *
 *  Returned as a group rotation.y: the face plane's normal points -z in
 *  the screen group's own space, hence the half turn. */
function screenAim(at, dealer, eye) {
    const toDealer = Math.atan2(dealer.x - at.x, dealer.z - at.z);
    const toEye = Math.atan2(eye.x - at.x, eye.z - at.z);
    let sweep = toEye - toDealer;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    return (toDealer + sweep / 2) - Math.PI;
}

// ============================================
// THE SHOWROOM'S OWN FIXTURES
// ============================================
/** The sales board: the month's numbers in marker, where everyone can
 *  see them. No figures, only names and tallies, because a number here
 *  would read as a claim about a real dealership. */
function drawSalesBoard(W, H) {
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f7f7f5';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#0d5bc4';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(30, 74); ctx.lineTo(W - 30, 74);
    ctx.stroke();
    ctx.fillStyle = '#12294a';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText('THIS MONTH', 30, 58);

    // Names and tally marks. Marker blue, a little uneven, the way a
    // board that gets updated every morning actually looks.
    const rows = ['ALVAREZ', 'BRENNAN', 'OKAFOR', 'PARK', 'WHITFIELD'];
    ctx.font = '30px system-ui, sans-serif';
    rows.forEach((name, i) => {
        const y = 130 + i * 54;
        ctx.fillStyle = '#39414d';
        ctx.fillText(name, 34, y);
        ctx.strokeStyle = '#1d3f7a';
        ctx.lineWidth = 4;
        const tallies = 3 + ((i * 5) % 7);
        for (let k = 0; k < tallies; k++) {
            const gx = 300 + Math.floor(k / 5) * 62 + (k % 5) * 11;
            if (k % 5 === 4) {           // the diagonal that closes a five
                ctx.beginPath();
                ctx.moveTo(gx - 46, y - 22); ctx.lineTo(gx + 4, y + 2);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(gx, y - 22); ctx.lineTo(gx + 2, y + 2);
                ctx.stroke();
            }
        }
    });

    ctx.strokeStyle = '#f0a51e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(30, H - 46); ctx.lineTo(W - 30, H - 46);
    ctx.stroke();
    ctx.fillStyle = '#8a6a1e';
    ctx.font = 'italic 26px system-ui, sans-serif';
    ctx.fillText('TARGET', 30, H - 14);

    return new THREE.CanvasTexture(canvas);
}

function createSalesBoard() {
    const B = LAYOUT.salesBoard;
    const board = new THREE.Group();
    board.name = 'salesBoard';

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, B.h + 0.08, B.w + 0.08), brushedMetal
    );
    board.add(frame);
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(B.w, B.h),
        new THREE.MeshStandardMaterial({ map: drawSalesBoard(768, 512), roughness: 0.5 })
    );
    face.rotation.y = Math.PI / 2;
    face.position.x = 0.028;
    board.add(face);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.5), brushedMetal);
    tray.position.set(0.04, -B.h / 2 - 0.05, 0);
    board.add(tray);

    board.position.set(B.x, B.y, B.z);
    showroomGroup.add(registerOutdoorProp(board, 'salesboard'));
}

/** The key board: every key on the lot, tagged and hung. */
function createKeyBoard() {
    const K = LAYOUT.keyBoard;
    const group = new THREE.Group();
    group.name = 'keyBoard';

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.86, 0.66),
        new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 0.85 })
    );
    group.add(panel);

    const hookMaterial = brushedMetal;
    const tagColors = [0xf0a51e, 0xdfe2e5, 0x0d5bc4, 0x8c2130];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 7; col++) {
            const z = -0.27 + col * 0.09;
            const y = 0.32 - row * 0.20;
            const hook = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), hookMaterial);
            hook.position.set(0.03, y, z);
            group.add(hook);
            // Skip a few, so the board reads as a working one rather than
            // a full set nobody has touched.
            if ((row * 7 + col) % 9 === 3) continue;
            const tag = new THREE.Mesh(
                new THREE.BoxGeometry(0.006, 0.075, 0.042),
                new THREE.MeshStandardMaterial({
                    color: tagColors[(row + col) % tagColors.length], roughness: 0.7
                })
            );
            tag.position.set(0.042, y - 0.05, z);
            group.add(tag);
        }
    }

    group.position.set(K.x, K.y, K.z);
    showroomGroup.add(registerOutdoorProp(group, 'keyboard_keys'));
}

/** The coffee bar: free coffee, tiny cups, and a pot that has been on
 *  since morning. */
function createCoffeeBar() {
    const C = LAYOUT.coffeeBar;
    const bar = new THREE.Group();
    bar.name = 'coffeeBar';

    const counterTop = 0.92;
    const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, counterTop - 0.06, 1.30),
        new THREE.MeshStandardMaterial({ color: 0x5c6069, roughness: 0.6, metalness: 0.1 })
    );
    cabinet.position.y = (counterTop - 0.06) / 2;
    cabinet.castShadow = true;
    bar.add(cabinet);
    const top = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.06, 1.34),
        new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.35, metalness: 0.2 })
    );
    top.position.y = counterTop - 0.03;
    bar.add(top);

    // The machine, its pot, and a short stack of cups
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.30), matteBlack);
    machine.position.set(0.02, counterTop + 0.17, -0.34);
    bar.add(machine);
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.085, 0.17, 12),
        new THREE.MeshStandardMaterial({
            color: 0x3a2318, roughness: 0.25, metalness: 0.1,
            transparent: true, opacity: 0.85
        })
    );
    pot.position.set(0.02, counterTop + 0.085, -0.06);
    bar.add(pot);
    for (let i = 0; i < 5; i++) {
        const cup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.028, 0.07, 10),
            new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 })
        );
        cup.position.set(0.02, counterTop + 0.035 + i * 0.055, 0.22);
        bar.add(cup);
    }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), brushedMetal);
    tray.position.set(0.02, counterTop + 0.01, 0.48);
    bar.add(tray);

    bar.position.set(C.x, 0, C.z);
    showroomGroup.add(registerOutdoorProp(bar, 'coffeebar'));
}

/** The waiting chairs: where you sit while somebody takes your keys away
 *  to appraise your trade. */
function createWaitingArea() {
    const W = LAYOUT.waitingChairs;
    const row = new THREE.Group();
    row.name = 'waitingChairs';
    W.xs.forEach((x) => {
        const chair = createLoungeChair();
        chair.position.set(x, 0, W.z);
        chair.rotation.y = Math.PI;      // turned to face the desk
        row.add(chair);
    });
    showroomGroup.add(registerOutdoorProp(row, 'chairs'));
}

/** The brochure rack: glossy photographs and generous adjectives. */
function createBrochureRack() {
    const R = LAYOUT.brochureRack;
    const rack = new THREE.Group();
    rack.name = 'brochureRack';

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.30, 0.05), brushedMetal);
    post.position.y = 0.65;
    rack.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.30), matteBlack);
    foot.position.y = 0.015;
    rack.add(foot);

    const covers = [0x1d3c66, 0x8c2130, 0x2f6f4a, 0xdfe2e5];
    for (let tier = 0; tier < 3; tier++) {
        const shelfY = 0.42 + tier * 0.34;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.10), brushedMetal);
        shelf.position.set(0, shelfY, 0.05);
        rack.add(shelf);
        for (let i = 0; i < 2; i++) {
            const leaflet = new THREE.Mesh(
                new THREE.BoxGeometry(0.20, 0.26, 0.012),
                new THREE.MeshStandardMaterial({
                    color: covers[(tier * 2 + i) % covers.length], roughness: 0.4, metalness: 0.05
                })
            );
            leaflet.position.set(-0.12 + i * 0.24, shelfY + 0.12, 0.075);
            leaflet.rotation.x = -0.16;
            rack.add(leaflet);
        }
    }

    rack.position.set(R.x, 0, R.z);
    rack.rotation.y = Math.PI;
    showroomGroup.add(registerOutdoorProp(rack, 'brochures'));
}

// (There is no product menu on this desk any more. It was a little tent
//  card listing warranty, tire and wheel, and GAP, and from the fixed
//  camera it read as an upside-down V of white card beside the model car:
//  too small at this distance to be the thing it was, and the only prop in
//  the room a visitor had to be told about. Its story went with it. The
//  same point is made by the deal sheet's own products line, which is
//  printed on the page John is pointing at.)

/** The green residents, from the shared furniture part rather than hand
 *  built: one tall plant softening the corner by the glass, and a snake
 *  plant by the waiting chairs. */
function createShowroomPlants() {
    LAYOUT.plants.forEach((p, i) => {
        const plant = p.kind === 'tall' ? createTallPlant() : createSnakePlant();
        plant.position.set(p.x, 0, p.z);
        plant.rotation.y = i * 1.1;
        showroomGroup.add(registerOutdoorProp(plant, 'plant'));
    });
}

/** The vending machine, the unofficial clock of every dealership. Shared
 *  furniture part, turned to face the room. */
function createVending() {
    const V = LAYOUT.vending;
    const machine = createVendingMachine();
    machine.position.set(V.x, 0, V.z);
    machine.rotation.y = Math.PI / 2;
    showroomGroup.add(registerOutdoorProp(machine, 'vending'));
}

/** Everything the showroom itself carries, as opposed to the desk. */
function createFixtures() {
    createSalesBoard();
    createKeyBoard();
    createCoffeeBar();
    createWaitingArea();
    createBrochureRack();
    createShowroomPlants();
    createVending();
}

// ============================================
// THE CAST
// ============================================
// THE POSE ARITHMETIC, so the next person to move the desk knows what to
// redo. Every angle below was SOLVED against the real transform chain,
// not eyeballed. The chain, outermost first:
//
//   person   position (x, seatY, z), rotation.y = yaw, scale s
//     waist  pivot at local y 0.75, rotation.x = lean       (addWaist)
//       arm  at (side*0.2125, 0.50, 0) from the waist pivot,
//            rotation.x = shoulder, rotation.z as given
//         elbow  at (0, -0.275, 0), rotation.x = bend       (addElbow)
//           hand at (0, -0.295, 0), fingertip 0.045 beyond
//
// The scale multiplies every local offset in that chain, and seatHeightY
// drops the figure to match, so a figure's size is part of the solve
// rather than something applied afterwards.
//
// Seated at scale 1, John's shoulder sits at y 1.02 and the deal sheet is
// 0.85m away, while the rig's whole arm reaches 0.61m. He therefore
// CANNOT touch the page sitting upright, which is why addWaist exists,
// and originally it took a 0.395 radian lean (22.6 degrees) to get him
// there. Making him 10% bigger bought most of that hunch back: at scale
// 1.10 a 0.300 lean (17.2 degrees) lands his hand 10mm above the desk
// top and 9.9cm from the centre of the page, which is better placed than
// the deeper lean managed, with the elbow at 0.831 clearing the desk.
//
// Three traps in solving this, all hit on the way here:
//
//  - Aim at the PAPER, not at a comfortable height above it. An earlier
//    solve targeted 35mm up and read as a hover rather than a touch. At
//    this camera distance 35mm is about ten pixels of daylight under his
//    hand, and the whole gesture stops landing.
//  - The arm has four degrees of freedom for a three-dimensional target,
//    so there is a family of answers and the cheapest is a ramrod
//    STRAIGHT arm (elbow -0.01). It hits the mark and looks like a
//    mannequin, and it leaves the tap nowhere to travel. The solve is
//    shaped to prefer a natural bend near -0.72.
//  - Weight the HEIGHT far above the sideways placement. The page is 30
//    by 41cm, so 10cm off its centre is still squarely on it, while 10cm
//    of air under the fingertip is a different gesture entirely. A solve
//    that scores one 3D distance trades the height away every time.
//
// If the desk, the sheet, any seat, or John's scale moves, re-solve
// rather than nudging by eye. specs/automan/verify-pose.mjs re-checks all
// of it.
// THE BODY IS IN THE WAY, and it took a third QA round to say so. The
// shoulder sits at x 0.2125, the torso is 0.38 wide by 0.22 deep, and the
// thighs are at 0.095: any arm rolled inward far enough to reach a lap
// runs down INSIDE the chest. Both resting arms did.
//
// Two things fix it together. The legs SPLAY, which brings the knee out
// to x 0.195 to meet the hand rather than the hand going in to meet the
// knee (see poseSeated), and the solve now carries the torso as an
// obstacle: every sampled point of the upper arm and forearm has to stay
// outside a box of half-width 0.2125 and half-depth 0.1325, which is the
// rig's own flush-arm position, with 5mm of margin. Anything further in
// than a naturally hanging arm is the fault.
const LEG_SPLAY = 0.27;
const JOHN_SCALE = 1.10;
const JOHN_POINT_ARM = { shoulder: -0.850, rotZ: -0.587, elbow: -0.720 };
// His right side faces AWAY from the desk (he sits at its west end), so
// this arm used to reach across his own chest to get a hand onto the desk
// top, which is exactly how it read. It rests on his thigh now.
const JOHN_REST_ARM = { shoulder: 0.008, rotZ: 0.046, elbow: -1.369 };
const JOHN_LEAN = 0.300;
// The lean tips his head down with the rest of him, so the neck takes
// most of it back and leaves him looking level at the dealer rather than
// at his own knees. It holds the same 0.095 residual pitch the deeper
// lean did, so his eyeline did not move when he grew.
const JOHN_NECK_X = -0.205;

// The customer: upright, hands resting ON her thighs. Slightly under life
// size, which reads as a different person rather than the same figure
// twice, and named here because seatFigure has to drop her to match.
//
// "In the lap" is not a height, it is a SURFACE, and that distinction cost
// this pose a QA round. The first solve put her hands at y 0.637, which is
// lap height by any reasonable test and which the pose check passed, but
// her thighs at that seat are only 0.605 at the top: her hands hung 3cm
// clear of them, in the air, and read exactly like that.
//
// The second solve landed the palms on the thigh and put her upper arms
// 106mm inside her own chest doing it, which cost a THIRD round. With the
// knees splayed her hands reach the leg with the arms hanging almost
// straight (roll -0.046, against 0.297 before): the elbow now sits at
// x 0.225, outside the torso, and the palms rest 90% of the way along the
// thigh, at the knee. Solved against the leg AND the body together, which
// is the only way this pose is solvable at all.
const CUSTOMER_SCALE = { x: 0.96, y: 0.97, z: 0.96 };
const CUSTOMER_REST_ARM = { shoulder: -0.254, roll: -0.046, elbow: -0.734 };

// THE DEALER IS WORKING. He used to sit squared up to the pair with his
// forearms on the desk, which read as a man waiting. He now turns
// DEALER_TURN away from John toward his own keyboard and types up the
// offer while he listens, with his head still on John: that is the beat
// the scene wanted, and it is sunnyvalejenn's typing pose adapted to a
// figure who is turned.
//
// The turn is small on purpose. It is bounded at BOTH ends by things that
// break: turn him less and his keyboard will not fit in front of him
// without landing on the screen, turn him more and his own right hand
// stops reading as being to the LEFT of the keyboard from the camera,
// which is the whole of QA round four's item 3.
//
// The arms are solved to put both hands ON THE KEYS: not the hand's centre
// at a comfortable height, but the UNDERSIDE OF THE HAND resting on the
// surface a fingertip meets, 11cm either side of the keyboard's centre,
// with the torso carried as an obstacle the way round three taught.
//
// Both halves of that were wrong for a round. The pose put the hand's
// centre 35mm above the DESK, which sounds like clearance and is not: the
// keys stand 22mm up, and the hand is an ellipsoid reaching 29mm below its
// own centre, so the hand rested 15mm INSIDE the keyboard. The check
// agreed with it, because it measured the same point against the same
// wrong surface.
const DEALER_TURN = 0.24;
const DEALER_TYPE_ARM = { shoulder: -1.044, roll: 0.217, elbow: -0.810 };
const DEALER_LEAN = 0.296;
// The lean tips his head with the rest of him, so the neck's rest angle
// carries the offset: 0.296 of lean less 0.276 of neck leaves the same
// 0.02 of downward pitch the old light lean did. dealerTargets works from
// this rather than from a literal, so the two can never drift apart.
const DEALER_NECK_REST = -0.276;
// The typing bob, at the elbow, the way real typing does (and the way
// Jenn's does).
//
// THE RESTING POSE IS THE LOWEST THE HANDS EVER GET, and every animated
// term has to respect that or the hands go through the keys. The bob only
// folds the forearm further, which lifts. The chair shift used to ADD
// lean, which tips the torso forward and drove the hands 47mm into the
// keyboard at the bottom of its cycle: that was the "sometimes" in the QA
// note, because the shift runs on its own eleven-second clock. It leans
// him BACK now, which lifts as well, and reads as a man easing off the
// keys for a moment rather than pressing into them.
const DEALER_TYPE_BOB = 0.055;
const DEALER_SHIFT = 0.05;      // radians of ease-back at the top of the cycle

/** Build one seated figure and rig it: seat, waist, neck, elbows. Returns
 *  everything the animation pass needs, so updateShowroom never has to go
 *  hunting through the scene graph. */
function seatFigure(person, seat, target, kind, poseOpts) {
    const yaw = faceToward(seat, target);
    const hair = findHairGroup(person);

    poseSeated(person, poseOpts);
    // The figure's own scale, not 1: the rig scales about the person
    // origin at the hips, so a figure who is not exactly life size sits
    // above or below the cushion unless the drop scales with them. Set
    // person.scale BEFORE calling this.
    person.position.set(seat.x, seatHeightY(LAYOUT.chairSeatTop, person.scale.y), seat.z);
    person.rotation.y = yaw;

    const waist = addWaist(person);
    const neck = addNeck(waist, hair);
    const arms = waist.children
        .filter((child) => child.isGroup && child.userData.isArm)
        .map((arm) => ({ arm, elbow: addElbow(arm), side: arm.position.x < 0 ? -1 : 1 }));

    showroomGroup.add(registerOutdoorProp(person, kind));
    return { group: person, waist, neck, arms, yaw, seat };
}

/** John Walker, mid-point. Clean-shaven head and a light blue button-down
 *  from the flyer, seated at the desk's west end, leaning in with a
 *  finger on the deal sheet and his eyes on the dealer. */
function createJohn() {
    const john = createPerson({
        role: 'customer', x: 0, z: 0, rotationY: 0,
        bald: true,
        dressShirt: true,
        shirtColor: JOHN_LOOK.shirtColor,
        pantsColor: JOHN_LOOK.pantsColor,
        skinTone: JOHN_LOOK.skinTone,
        eyeColor: JOHN_LOOK.eyeColor,
        handScale: JOHN_LOOK.handScale
    });
    john.scale.setScalar(JOHN_SCALE);

    const rig = seatFigure(john, LAYOUT.john, LAYOUT.dealer, 'john', { splay: LEG_SPLAY });
    rig.waist.rotation.x = JOHN_LEAN;
    rig.neck.rotation.x = JOHN_NECK_X;

    // The arm on the -x side is the one solved onto the page.
    rig.arms.forEach((entry) => {
        const pose = entry.side < 0 ? JOHN_POINT_ARM : JOHN_REST_ARM;
        entry.arm.rotation.x = pose.shoulder;
        entry.arm.rotation.z = pose.rotZ;
        entry.elbow.rotation.x = pose.elbow;
        entry.role = entry.side < 0 ? 'point' : 'rest';
    });
    return rig;
}

/** The customer: John's client, seated on the near side, watching the
 *  dealer and nodding along. Neutral clothing on purpose, so she never
 *  competes with the navy and gold. */
function createCustomer() {
    const customer = createPerson({
        role: 'customer', x: 0, z: 0, rotationY: 0,
        hairStyle: 'long',
        shirtColor: 0x77707e,
        pantsColor: 0x2f3540,
        skinTone: 0xd9a97f,
        hairColor: 0x3a2a1e,
        eyeColor: 0x3b2a1c,
        handScale: HAND_SCALE
    });
    customer.scale.set(CUSTOMER_SCALE.x, CUSTOMER_SCALE.y, CUSTOMER_SCALE.z);

    const rig = seatFigure(customer, LAYOUT.customer, LAYOUT.dealer, 'customer', { splay: LEG_SPLAY });
    rig.arms.forEach((entry) => {
        entry.arm.rotation.x = CUSTOMER_REST_ARM.shoulder;
        entry.arm.rotation.z = -entry.side * CUSTOMER_REST_ARM.roll;
        entry.elbow.rotation.x = CUSTOMER_REST_ARM.elbow;
    });
    return rig;
}

/** The dealer: a professional doing his job across a desk from another
 *  professional. Suit and tie, forearms on the desk, listening. He is
 *  deliberately not a villain (PRD decision D6): the scene's case is
 *  "bring somebody who knows", not "dealers are crooks". */
function createDealer() {
    const dealer = createPerson({
        role: 'shopkeeper', x: 0, z: 0, rotationY: 0,
        hasSuit: true,
        tieColor: 0x7d2733,
        shirtColor: 0x2c3038,
        pantsColor: 0x23262c,
        skinTone: 0xe3b891,
        hairColor: 0x2e2a26,
        eyeColor: 0x33261a,
        handScale: HAND_SCALE
    });

    const mid = {
        x: (LAYOUT.john.x + LAYOUT.customer.x) / 2,
        z: (LAYOUT.john.z + LAYOUT.customer.z) / 2
    };
    const rig = seatFigure(dealer, LAYOUT.dealer, mid, 'dealer');
    // seatFigure aims him at the pair; DEALER_TURN takes him the rest of
    // the way round to his keyboard. rig.yaw carries the final angle, so
    // the animation's sway works from the turned figure.
    rig.yaw = dealerYaw();
    rig.group.rotation.y = rig.yaw;
    rig.waist.rotation.x = DEALER_LEAN;
    // His body is on his work, but his attention is on John, so the head
    // turns the rest of the way back.
    rig.neck.rotation.y = faceToward(LAYOUT.dealer, LAYOUT.john) - rig.yaw;
    rig.neck.rotation.x = DEALER_NECK_REST;
    rig.arms.forEach((entry) => {
        entry.arm.rotation.x = DEALER_TYPE_ARM.shoulder;
        entry.arm.rotation.z = -entry.side * DEALER_TYPE_ARM.roll;
        entry.elbow.rotation.x = DEALER_TYPE_ARM.elbow;
        entry.phase = entry.side < 0 ? 0 : 2.1;
    });
    return rig;
}

/** All three, and the registry the animation pass drives.
 *
 *  Each gets its own clock with a different period, and a different head
 *  start, so the three of them never fall into step. Three figures moving
 *  in unison reads as machinery, which is the one thing this scene cannot
 *  afford: the whole point is that these are people having a conversation. */
function createCast() {
    cast = {
        john: createJohn(),
        customer: createCustomer(),
        dealer: createDealer()
    };
    cast.john.anim = { mode: 'making', modeT: 0, dur: 8.5, glanceTo: -0.85 };
    cast.customer.anim = {
        mode: 'listening', modeT: 0, dur: 4.7,
        glanceTo: normalizeAngle(faceToward(LAYOUT.customer, LAYOUT.john) - cast.customer.yaw)
    };
    cast.dealer.anim = {
        // He starts on his work, so the first thing the visitor sees him
        // do is stop and look up.
        mode: 'typing', modeT: 0, dur: 5.0, shiftT: 5.0, typing: 1,
        headBase: cast.dealer.neck.rotation.y,
        readTo: normalizeAngle(faceToward(LAYOUT.dealer, LAYOUT.dealSheet) - cast.dealer.yaw),
        screenGaze: dealerScreenGaze()
    };
}

/** Wrap an angle into [-pi, pi], so a head turn always takes the short
 *  way round instead of spinning most of a full circle. */
function normalizeAngle(a) {
    let x = a;
    while (x > Math.PI) x -= Math.PI * 2;
    while (x < -Math.PI) x += Math.PI * 2;
    return x;
}

/** Frame-rate independent ease toward a target. */
function approach(current, target, rate, deltaTime) {
    return current + (target - current) * Math.min(1, rate * deltaTime);
}

// ============================================
// SEATING FURNITURE
// ============================================
/** One task chair on a five-star base. Used from M3, which places three:
 *  the dealer's, and two on the customer side of the desk. */
function createDeskChair(x, z, yaw, kind) {
    const chair = new THREE.Group();
    chair.name = `chair_${kind}`;

    // Five-star base with casters
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.035), brushedMetal);
        arm.position.set(Math.cos(a) * 0.12, 0.035, Math.sin(a) * 0.12);
        arm.rotation.y = -a;
        chair.add(arm);
        const caster = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matteBlack);
        caster.position.set(Math.cos(a) * 0.22, 0.025, Math.sin(a) * 0.22);
        chair.add(caster);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), brushedMetal);
    post.position.y = 0.2;
    chair.add(post);

    // Seat and backrest in a dark contract-furniture weave
    const weave = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.85, metalness: 0.0 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.42), weave);
    seat.position.y = LAYOUT.chairSeatTop - 0.035;
    seat.castShadow = true;
    chair.add(seat);
    // The sitter faces local +z, so the backrest lives on the -z side,
    // leaning slightly away from them.
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), weave);
    back.position.set(0, LAYOUT.chairSeatTop + 0.3, -0.2);
    back.rotation.x = -0.08;
    back.castShadow = true;
    chair.add(back);

    chair.position.set(x, 0, z);
    chair.rotation.y = yaw;
    return chair;
}

/** A tiny succulent in a white pot, for the desk corner. Used from M3. */
function createSucculent(x, y, z) {
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.028, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: PALETTE.potWhite, roughness: 0.7 })
    );
    pot.position.y = 0.025;
    plant.add(pot);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 5), leafMaterial);
        leaf.position.set(Math.cos(a) * 0.016, 0.065, Math.sin(a) * 0.016);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        plant.add(leaf);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 5), leafMaterial);
    crown.position.y = 0.075;
    plant.add(crown);
    plant.position.set(x, y, z);
    return plant;
}

// ============================================
// THE WALL CLOCK
// ============================================
/** An analog wall clock in the brand colors, hung on the west wall ahead
 *  and to the left of the camera. It keeps the visitor's REAL local time:
 *  the hands are set once here at build (so under prefers-reduced-motion
 *  the clock simply holds the arrival time) and then every frame by
 *  updateShowroom, with a smooth gliding second hand.
 *
 *  Jenn's version hangs on her back wall facing the camera; this room's
 *  back wall is glass, so the clock takes a side wall and carries a yaw. */
function createWallClock() {
    const C = LAYOUT.clock;
    const clock = new THREE.Group();
    clock.name = 'wallClock';

    const rimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.5, metalness: 0.1 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.5, metalness: 0.1 });
    const secondMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5, metalness: 0.15 });

    // Rim and face: two coins, the white face a touch deeper so it sits
    // proud of the navy ring.
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, 0.04, 28), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    clock.add(rim);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(C.r - 0.022, C.r - 0.022, 0.044, 28), whiteTrim);
    face.rotation.x = Math.PI / 2;
    clock.add(face);

    // Hour markers: majors at 12, 3, 6, and 9, minors between.
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        const tick = new THREE.Mesh(
            new THREE.BoxGeometry(major ? 0.016 : 0.008, major ? 0.032 : 0.018, 0.004),
            handMaterial
        );
        tick.position.set(Math.sin(a) * (C.r - 0.042), Math.cos(a) * (C.r - 0.042), 0.024);
        tick.rotation.z = -a;
        clock.add(tick);
    }

    // Hands pivot at the center, each blade reaching up past a short
    // tail, stacked a hair apart so they never z-fight.
    const makeHand = (len, w, material, z) => {
        const hand = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), material);
        blade.position.y = len / 2 - 0.018;
        hand.add(blade);
        hand.position.z = z;
        clock.add(hand);
        return hand;
    };
    wallClock = {
        hour: makeHand(0.082, 0.014, handMaterial, 0.026),
        minute: makeHand(0.122, 0.009, handMaterial, 0.03),
        second: makeHand(0.128, 0.0035, secondMaterial, 0.034)
    };
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), handMaterial);
    cap.position.z = 0.034;
    clock.add(cap);

    clock.position.set(C.x, C.y, C.z);
    clock.rotation.y = C.rotY;
    showroomGroup.add(registerOutdoorProp(clock, 'clock'));
    setClockHands();
}

/** Point the hands at the real local time. Negative z rotation is
 *  clockwise for a visitor facing the wall, and the seconds glide. */
function setClockHands() {
    if (!wallClock) return;
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    const turn = -Math.PI * 2;
    wallClock.second.rotation.z = (s / 60) * turn;
    wallClock.minute.rotation.z = (m / 60) * turn;
    wallClock.hour.rotation.z = (h / 12) * turn;
}

// ============================================
// LIGHTING
// ============================================
/** The shared interior rig, wearing recessed panels instead of its own
 *  fixtures. The rig hangs a rectangular troffer 0.2 below the ceiling,
 *  which suits a warehouse or a bar but not a showroom, so each built
 *  fixture has its meshes hidden (the point light and the dimmer
 *  plumbing stay live) and a flush recessed panel is added in their
 *  place, lifted back up to the ceiling plane.
 *
 *  All experience code: the frozen shared 1.0.0 parts stay untouched.
 *  Same arrangement Jenn's office uses for its flush mount, one room over
 *  in the catalog. */
function createShowroomLighting() {
    const C = LAYOUT.ceilingLights;
    createCeilingLights({ xs: C.xs, zs: C.zs });

    const bezelMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e6e2, roughness: 0.5, metalness: 0.2
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbf8f2, emissive: 0xfff6e8, emissiveIntensity: 0.75,
        roughness: 0.35, metalness: 0.0
    });

    const world = getWorldGroup();
    for (let row = 1; row <= C.zs.length; row++) {
        for (let col = 1; col <= C.xs.length; col++) {
            const rigFixture = world.getObjectByName(`ceilingLight_${row}_${col}`);
            if (!rigFixture) continue;
            rigFixture.traverse((child) => { if (child.isMesh) child.visible = false; });

            const panel = new THREE.Group();
            panel.name = 'recessedPanel';
            const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.04, 0.72), bezelMaterial);
            bezel.position.y = -0.02;
            panel.add(bezel);
            const lens = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.6), panelMaterial);
            lens.position.y = -0.035;
            panel.add(lens);
            // The rig hangs its group 0.2 below the ceiling; a recessed
            // panel sits IN the ceiling, so lift it back flush.
            panel.position.y = 0.2;
            rigFixture.add(panel);
        }
    }
}

/** The faux daylight: the frozen noon sun sits straight overhead, which
 *  no north-facing glass ever catches, so a warm spot outside the wall
 *  throws a pool of light across the showroom floor. With the glazing now
 *  running floor to ceiling there is far more aperture than Jenn's
 *  window had, so this is wider and flatter than hers: a broad wash that
 *  reaches the desk rather than a narrow shaft. The mullions and the
 *  piers cast shadows, so the pool arrives with the wall's own rhythm in
 *  it. */
function createDaylightShaft() {
    const G = LAYOUT.glass;
    const sun = new THREE.SpotLight(0xfff4e2, 1.35, 26, 0.72, 0.55, 1.0);
    sun.position.set(G.x + 0.6, 4.6, LAYOUT.room.minZ - 4.0);
    sun.target.position.set(G.x - 0.8, 0, -0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);   // the mullion shadows need the resolution
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 22;
    sun.shadow.bias = -0.0005;
    showroomGroup.add(sun);
    showroomGroup.add(sun.target);
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let _t = 0;    // showroom clock, seconds

// John's two-tap burst: how often he makes the point again, how long the
// burst lasts, and how far the finger lifts.
const TAP_EVERY = 3.2;
const TAP_BURST = 0.9;
const TAP_LIFT = 0.085;      // radians off the solved elbow bend

/** John: making his customer's case. The point is the resting state, not
 *  a gesture he breaks into, because that is what the scene is about. The
 *  finger taps the page a couple of times to land a sentence, his head
 *  moves a little as he talks, and now and then he turns to check his
 *  customer is with him.
 *
 *  The tap only ever LIFTS. The pointing pose was solved to put the
 *  fingertip on the paper, so any tap that could go the other way would
 *  drive his hand through the desk. */
function updateJohn(rig, deltaTime) {
    const a = rig.anim;
    a.modeT += deltaTime;

    if (a.mode === 'making' && a.modeT >= a.dur) {
        a.mode = 'glancing';
        a.modeT = 0;
    } else if (a.mode === 'glancing' && a.modeT >= 1.7) {
        a.mode = 'making';
        a.modeT = 0;
        a.dur = 7.5 + Math.random() * 4.5;
    }

    const target = johnTargets(a.mode, a.modeT, _t, a.glanceTo);
    const point = rig.arms.find((entry) => entry.role === 'point');
    if (point) point.elbow.rotation.x = JOHN_POINT_ARM.elbow - target.lift;
    rig.neck.rotation.x = approach(rig.neck.rotation.x, target.neckX, 6, deltaTime);
    rig.neck.rotation.y = approach(rig.neck.rotation.y, target.neckY, 7, deltaTime);
}

/** John's per-frame targets, as a pure function of his state.
 *
 *  Pulled out so it can be tested without a scene graph: the Three test
 *  stub is a proxy that absorbs every assignment and reads back as zero,
 *  so an animation written straight onto rig objects cannot be checked at
 *  all. Here the numbers are just numbers.
 *
 *  `lift` is always >= 0 by construction, which is the property that
 *  keeps his hand out of the desk: the pose puts it on the paper, so the
 *  tap has nowhere to go but up. */
function johnTargets(mode, modeT, t, glanceTo) {
    if (mode === 'making') {
        const phase = modeT % TAP_EVERY;
        const lift = phase < TAP_BURST
            ? Math.abs(Math.sin(phase * Math.PI / (TAP_BURST / 2))) * TAP_LIFT
            : 0;
        return {
            lift,
            neckX: JOHN_NECK_X + Math.sin(t * 1.3) * 0.03,
            neckY: Math.sin(t * 0.9) * 0.055
        };
    }
    // The glance out and back on one envelope, so nothing snaps. His hand
    // stays on the page: he looks at his customer, he does not stop
    // making the point.
    const envelope = Math.sin(Math.PI * Math.min(1, modeT / 1.7));
    return {
        lift: 0,
        neckX: JOHN_NECK_X + 0.05 * envelope,
        neckY: glanceTo * envelope
    };
}

/** The customer: watching the dealer, and agreeing. She NODS, which is
 *  agreement. A shaken head would read as the opposite and quietly
 *  undercut the whole scene (PRD decision D5).
 *
 *  Bursts of two or three nods with real pauses between them, because a
 *  metronome nod reads as a broken machine rather than a person. */
function updateCustomer(rig, deltaTime) {
    const a = rig.anim;
    a.modeT += deltaTime;

    if (a.mode === 'listening' && a.modeT >= a.dur) {
        a.mode = Math.random() < 0.3 ? 'glancing' : 'nodding';
        a.modeT = 0;
        a.nods = 2 + Math.floor(Math.random() * 2);
    } else if (a.mode === 'nodding' && a.modeT >= a.nods * 0.62) {
        a.mode = 'listening';
        a.modeT = 0;
        a.dur = 3.6 + Math.random() * 4.0;
    } else if (a.mode === 'glancing' && a.modeT >= 1.9) {
        a.mode = 'listening';
        a.modeT = 0;
        a.dur = 4.2 + Math.random() * 4.0;
    }

    const target = customerTargets(a.mode, a.modeT, _t, a.glanceTo);
    rig.neck.rotation.x = approach(rig.neck.rotation.x, target.neckX, 9, deltaTime);
    rig.neck.rotation.y = approach(rig.neck.rotation.y, target.neckY, 7, deltaTime);
}

/** The customer's per-frame targets, pure so they can be tested.
 *
 *  The nod lives entirely on neckX (pitch). neckY (yaw) only ever moves
 *  during a deliberate glance at John. That separation is the mechanical
 *  guarantee behind decision D5: she can nod, and she can look at John,
 *  but there is no path through this function that shakes her head. */
function customerTargets(mode, modeT, t, glanceTo) {
    let nod = 0;
    let turn = 0;
    if (mode === 'nodding') {
        // (1 - cos) rides from neutral down and back, so the chin dips
        // and returns rather than rocking above the neutral line.
        nod = (1 - Math.cos((modeT / 0.62) * Math.PI * 2)) / 2 * 0.30;
    } else if (mode === 'glancing') {
        turn = glanceTo * 0.8 * Math.sin(Math.PI * Math.min(1, modeT / 1.9));
    }
    // A little idle drift, so she is never perfectly still.
    return { neckX: nod + Math.sin(t * 0.55 + 1.4) * 0.022, neckY: turn };
}

/** The dealer: listening. His head is on John, he nods now and then, he
 *  glances down at the page when John taps it, and every so often he
 *  shifts in the chair. Never dejected and never smug (decision D6): he
 *  is a professional hearing out another professional. */
function updateDealer(rig, deltaTime) {
    const a = rig.anim;
    a.modeT += deltaTime;
    a.shiftT -= deltaTime;

    // He types, then stops and looks up. 'listening' is the hub: from it
    // he either answers with a nod, glances at the page, or goes back to
    // work, and from typing there is only one way out, which is up.
    if (a.mode === 'typing' && a.modeT >= a.dur) {
        a.mode = 'listening';
        a.modeT = 0;
        a.dur = 2.8 + Math.random() * 3.4;
    } else if (a.mode === 'listening' && a.modeT >= a.dur) {
        const roll = Math.random();
        a.mode = roll < 0.26 ? 'reading' : roll < 0.52 ? 'nodding' : 'typing';
        a.modeT = 0;
        if (a.mode === 'typing') a.dur = 4.5 + Math.random() * 4.5;
    } else if (a.mode === 'nodding' && a.modeT >= 1.35) {
        a.mode = 'listening';
        a.modeT = 0;
        a.dur = 2.6 + Math.random() * 3.2;
    } else if (a.mode === 'reading' && a.modeT >= 2.1) {
        a.mode = 'listening';
        a.modeT = 0;
        a.dur = 3.0 + Math.random() * 3.4;
    }

    const target = dealerTargets(a.mode, a.modeT, a.headBase, a.readTo, a.screenGaze);
    rig.neck.rotation.x = approach(rig.neck.rotation.x, target.neckX, 7, deltaTime);
    rig.neck.rotation.y = approach(rig.neck.rotation.y, target.neckY, 6, deltaTime);

    // Typing, and only while he IS typing. The bob eases in and out
    // rather than switching, so the hands settle onto the keys instead of
    // stopping mid-stroke. Easing an AMOUNT and multiplying keeps the
    // invariant intact: the bob is still never negative, so no phase of
    // this can put a hand through the keyboard.
    a.typing = approach(a.typing, a.mode === 'typing' ? 1 : 0, 5, deltaTime);
    rig.arms.forEach((entry) => {
        entry.elbow.rotation.x =
            DEALER_TYPE_ARM.elbow - typeBob(_t, entry.phase || 0) * a.typing;
    });

    // A shift in the chair, on its own slow clock so it never lines up
    // with the nods.
    if (a.shiftT <= 0) a.shiftT = 11 + Math.random() * 9;
    rig.waist.rotation.x = approach(rig.waist.rotation.x, dealerLeanAt(a.shiftT), 3, deltaTime);
    rig.group.rotation.y = approach(
        rig.group.rotation.y, rig.yaw + dealerShift(a.shiftT) * 0.6, 3, deltaTime);
}

/** The dealer's shift in the chair, at a point in its own slow cycle.
 *  Never negative, and read by both the lean and the sway so they cannot
 *  drift apart. */
function dealerShift(shiftT) {
    return Math.max(0, Math.sin((1 - shiftT / 11) * Math.PI * 2)) * DEALER_SHIFT;
}

/** His waist angle at that point, which is the whole reason the shift is a
 *  function rather than a line inside updateDealer.
 *
 *  MINUS, not plus. His hands rest ON the keys, so the resting pose is the
 *  lowest they are allowed to be, and a shift that ADDS lean tips his
 *  torso forward and drives them through the keyboard: 47mm at the bottom
 *  of the cycle, which is what QA saw as hands that "occasionally" pass
 *  through. Easing BACK lifts them, and specs/automan/verify-pose.mjs
 *  sweeps this function across a full cycle to prove nothing dips. */
function dealerLeanAt(shiftT) {
    return DEALER_LEAN - dealerShift(shiftT);
}

/** How far the dealer's forearm is folded past its resting angle, at time
 *  t. NEVER NEGATIVE, which is the whole safety property: the pose rests
 *  his hands 35mm above the keys and this only ever lifts them further,
 *  so no phase of it can put a hand through the desk. Pure, so the check
 *  can sweep it. */
function typeBob(t, phase) {
    return Math.max(0, Math.sin(t * 7.4 + phase)) * DEALER_TYPE_BOB;
}

/** The dealer's per-frame targets, pure so they can be tested. His head
 *  rests on John, dips for a nod, and turns down to the page when he
 *  reads it. */
function dealerTargets(mode, modeT, headBase, readTo, screenGaze) {
    // Head down and across to his own screen while he works. Everything
    // else in his repertoire has his head on John, so this is the one
    // state the "looking up" reads against.
    if (mode === 'typing' && screenGaze) {
        return {
            neckX: DEALER_NECK_REST + screenGaze.pitch,
            neckY: screenGaze.neckY
        };
    }
    if (mode === 'nodding') {
        return {
            neckX: DEALER_NECK_REST + (1 - Math.cos((modeT / 0.65) * Math.PI * 2)) / 2 * 0.19,
            neckY: headBase
        };
    }
    if (mode === 'reading') {
        const envelope = Math.sin(Math.PI * Math.min(1, modeT / 2.1));
        return {
            neckX: DEALER_NECK_REST + 0.34 * envelope,
            neckY: headBase + (readTo - headBase) * envelope
        };
    }
    return { neckX: DEALER_NECK_REST, neckY: headBase };
}

/**
 * Advance the showroom one frame: John making the point, his customer
 * nodding along, the dealer listening, and the wall clock keeping the
 * visitor's real local time. Everything holds still under
 * prefers-reduced-motion, which is why the whole pass returns early
 * rather than slowing down. Driven by main.js's loop (which also runs the
 * shared day/night pass, frozen at noon, for the sky and the shadow-map
 * refresh, plus the drifting clouds).
 */
export function updateShowroom(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The wall clock keeps the visitor's real local time
    setClockHands();

    if (cast) {
        updateJohn(cast.john, deltaTime);
        updateCustomer(cast.customer, deltaTime);
        updateDealer(cast.dealer, deltaTime);
    }

    // A car crosses the lot every so often, behind the dealer's shoulder,
    // and the clouds cross the window rather more slowly than that
    updatePassingCar(deltaTime);
    updateClouds(deltaTime);
}

/** The root showroom group (exposed for tests and future passes). */
export function getShowroomGroup() {
    return showroomGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    LAYOUT, PALETTE, JOHN_LOOK, HAND_SCALE,
    JOHN_SCALE, JOHN_POINT_ARM, JOHN_REST_ARM, JOHN_LEAN, JOHN_NECK_X,
    CUSTOMER_SCALE, CUSTOMER_REST_ARM, DEALER_LEAN,
    DEALER_TURN, DEALER_TYPE_ARM, DEALER_NECK_REST, DEALER_TYPE_BOB, DEALER_SHIFT,
    keyTopY, dealerShift, dealerLeanAt, dealerScreenGaze,
    dealerYaw, keyboardAt, screenAim, typeBob, drawDealerScreen,
    HIP_Y, NECK_Y, TAP_LIFT, TAP_EVERY, TAP_BURST,
    seatHeightY, faceToward, normalizeAngle, approach, stallStripeRun, stallStripeOffset, walkSpan,
    LEG_SPLAY,
    CLOUD_PUFFS, getCloudBank: () => cloudBank,
    johnTargets, customerTargets, dealerTargets,
    PASS_SPEED, PASS_FROM, PASS_TO, PASS_GAP, WHEEL_R, passingWheelDelta,
    SUV, widestVehicle, suvWidth, createLotSUV, suvGeometries,
    getPassingCar: () => passingCar,
    poseSeated, addElbow, addWaist, addNeck, findHairGroup,
    createDeskChair, createSucculent,
    getCast: () => cast
};
