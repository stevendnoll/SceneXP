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
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's.
 *
 * FLOOR PLAN (viewed from above, the glass wall and the lot at the top,
 * the camera at the open right-hand corner of the desk). The back
 * elevation is glazed floor to ceiling apart from a slim pier at each
 * corner.
 *
 *   +=============== glass wall / the lot beyond ===============+
 *   |  [key board]           (DEALER)         [ sales board ]   |
 *   |                    +--------------+                       |
 *   |  [plant]           | [ PAPERS ]   |          [ plant ]    |
 *   |                    | [model car]  |                       |
 *   |                    +--------------+                       |
 *   |             (JOHN)          (CUSTOMER)                    |
 *   |                                            [ CAMERA ]     |
 *   |  [ coffee bar ]  [ basket ]  [ chairs ] [ vending ]       |
 *   |  [ brochures ]                                            |
 *   +--------------- front wall (behind the camera) ------------+
 *
 * BUILD STATUS: milestone M3. The room, the lot, and the desk are all
 * real, and the three chairs are placed and aimed. The chairs are still
 * empty: the cast arrives at M4. See specs/automan/TASKS.md.
 */

import { getScene } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, getWorldGroup, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { AUTOMAN_CONFIG } from './config.min.js';
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
    desk: { x: -0.45, z: -2.25, w: 1.90, d: 1.00, topY: 0.75 },

    // The deal sheet, and the whole reason the camera is where it is.
    // Solved rather than placed: it is the point on the desk top NEAREST
    // THE CENTRE that is still inside John's seated reach. His shoulder
    // sits 0.2125 off his spine, the shared rig's arm gives 0.63 from
    // shoulder to fingertip, and a forward lean buys another 0.22, so the
    // budget is 0.85m. This spot is 0.82m from his LEFT shoulder, which
    // is therefore the arm that points (task T4.3).
    dealSheet: { x: -0.93, z: -2.18 },

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

    // The wall clock. Jenn's hangs on her back wall, but this room's back
    // wall is glass, so it goes on the west wall ahead and to the left of
    // the camera, facing +X.
    clock: { x: -3.70, y: 2.05, z: -1.60, rotY: Math.PI / 2, r: 0.17 },

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
        groundY: -0.14,        // the apron sits a kerb below the showroom slab
        kerbZ: -4.45,
        apronFarZ: -6.0,       // the concrete walkway right outside the glass
        driveLaneZ: -7.4,      // where the passing car crosses (M6)
        asphaltFarZ: -29,
        grassFarZ: -62,
        minX: -70,
        maxX: 25,
        stallAngle: 0.52,      // ~30 degrees off square, standard angled parking
        stallDepth: 5.4,
        // Three rows, receding, each cheaper to draw than the last.
        rows: [
            { z: -11.0, tier: 1, from: -12.6, to: -2.2, pitch: 2.6 },
            { z: -17.5, tier: 2, from: -22.0, to: -4.6, pitch: 2.9 },
            { z: -24.0, tier: 3, from: -31.5, to: -7.0, pitch: 3.5 }
        ],
        poles: [{ x: -11.0, z: -14.5 }, { x: -21.0, z: -21.0 }],
        pennants: { fromX: -15.0, toX: 1.0, z: -8.6, y: 3.6 }
    }
};

// -------------------------------------------------------------------------
// WHO'S WHO
// -------------------------------------------------------------------------
// John: clean-shaven head, a light blue button-down dress shirt, dark
// trousers, a medium to slightly broad build. Keyed to the flyer in
// specs/automan/image0.png. A stylized low-poly portrait rather than a
// likeness, the same standard the rest of the site holds. Used from M4.
const JOHN_LOOK = {
    skinTone: 0xe8c09a,
    bald: true,
    dressShirt: true,
    shirtColor: 0xb2cbf0,     // the flyer's light blue
    pantsColor: 0x2f3540,
    eyeColor: 0x3d5a72
};

// The showroom palette. Bright and slightly cool on purpose: showrooms
// are lit by their glass. The flyer's navy and gold do the accenting.
//
// PROVISIONAL: the navy, blue, and gold are working values derived from
// specs/automan/image0.png, whose raw pixel values read darker than the
// artwork displays. Confirm against the displayed flyer before these are
// treated as settled (task T10.2 territory).
const PALETTE = {
    navy: 0x12294a,
    signalBlue: 0x0d5bc4,
    gold: 0xf0a51e,
    shirtBlue: 0xb2cbf0,
    floorGrey: 0xd8d5d0,
    wallWhite: 0xf2f1ee,
    trimWhite: 0xf8f6f1,
    ceiling: 0xfbfaf8,
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

/** One row of angled stall stripes, as a cutout texture laid just above
 *  the asphalt. The canvas covers exactly one stall pitch across and the
 *  full stall depth down, so repeating it along U walks the stripes down
 *  the row.
 *
 *  The line is drawn several times at multiples of the canvas width so it
 *  survives the wrap: a single stroke would simply be clipped at the edge
 *  and the pattern would break at every tile seam. */
function createStallStripeTexture(pitch, depth, angle) {
    const W = 256, H = 256;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // How far the stripe travels across, in pixels, over the full depth.
    const runMetres = depth * Math.tan(angle);
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
    createDeskChairs();       // three chairs, aimed the way their sitters will be
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

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createWallPaintTexture(), roughness: 0.85, metalness: 0.0
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
        })
    };
    return _carMats;
}

/** One parked car, local forward +Z, origin between the wheels on the
 *  ground. `tier` trades detail for distance:
 *
 *    1  near row: body, cabin, glazing, four wheels, lamps  (11 meshes)
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

    if (tier === 3) {
        const slab = new THREE.Mesh(g.slab, bodyMaterial);
        slab.position.y = 0.52;
        car.add(slab);
        const band = new THREE.Mesh(g.slabGlass, m.glass);
        band.position.set(0, 0.90, -0.20);
        car.add(band);
        return car;
    }

    const body = new THREE.Mesh(g.body, bodyMaterial);
    body.position.y = 0.58;
    car.add(body);

    const cabin = new THREE.Mesh(g.cabin, bodyMaterial);
    cabin.position.set(0, 1.10, -0.20);
    car.add(cabin);

    const band = new THREE.Mesh(g.glassBand, m.glass);
    band.position.set(0, 1.14, -0.20);
    car.add(band);

    if (tier === 2) {
        const skirt = new THREE.Mesh(g.skirt, m.glass);
        skirt.position.y = 0.24;
        car.add(skirt);
        return car;
    }

    [-1, 1].forEach((sx) => {
        [-1, 1].forEach((sz) => {
            const wheel = new THREE.Mesh(g.wheel, matteBlack);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(sx * 0.86, 0.33, sz * 1.42);
            car.add(wheel);
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

    // --- The apron and its kerb. The glazing runs to the floor, so the
    // ground outside is in plain view and the two planes must not simply
    // meet: the lot sits a kerb lower, and the ground extends back UNDER
    // the showroom so there can never be a gap at the seam whatever the
    // camera does. (Decision D7's follow-on.) ---
    const apron = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 2.0 + (L.kerbZ - L.apronFarZ)),
        new THREE.MeshStandardMaterial({ color: 0xbdbab4, roughness: 0.85, metalness: 0.0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(cxLot, L.groundY, (2.0 + L.apronFarZ) / 2);
    lot.add(apron);

    const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(width, -L.groundY, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xa9a6a0, roughness: 0.9, metalness: 0.0 })
    );
    kerb.position.set(cxLot, L.groundY / 2, L.kerbZ);
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
    L.rows.forEach((row, rowIndex) => {
        const length = (row.to - row.from) + row.pitch * 2;
        const centerX = (row.from + row.to) / 2;

        // Painted stripes: one cutout plane per row, a hair above the
        // asphalt. alphaTest rather than transparency, so it still writes
        // depth and never sorts oddly against the cars.
        const stripeTexture = createStallStripeTexture(row.pitch, L.stallDepth, L.stallAngle);
        stripeTexture.repeat.set(length / row.pitch, 1);
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

        for (let x = row.from; x <= row.to + 1e-6; x += row.pitch) {
            const bodyMaterial = materials.bodies[colorTick++ % materials.bodies.length];
            const car = createParkedCar(row.tier, bodyMaterial);
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

    [P.fromX, P.toX].forEach((x, i) => {
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.07, P.y + 0.3, 6), brushedMetal
        );
        post.position.set(x, L.groundY + (P.y + 0.3) / 2, P.z);
        post.name = `pennantPost_${i}`;
        lot.add(post);
    });

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

    showroomGroup.add(lot);
}

// ============================================
// THE SALES DESK
// ============================================
/** The desk itself: a pedestal desk with a modesty panel on the dealer's
 *  side. Its top height is the anchor for John's pointing pose, so it is
 *  fixed in LAYOUT rather than tuned here. */
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

    // Pedestals at each end, and the modesty panel closing the dealer's
    // side so the visitor never sees straight through the desk.
    [-1, 1].forEach((s) => {
        const pedestal = new THREE.Mesh(
            new THREE.BoxGeometry(0.09, D.topY - 0.06, D.d - 0.10), darkWood
        );
        pedestal.position.set(s * (D.w / 2 - 0.08), (D.topY - 0.06) / 2, 0);
        pedestal.castShadow = true;
        desk.add(pedestal);
    });
    const modesty = new THREE.Mesh(
        new THREE.BoxGeometry(D.w - 0.22, D.topY - 0.28, 0.04), darkWood
    );
    modesty.position.set(0, (D.topY - 0.28) / 2 + 0.16, -(D.d / 2 - 0.09));
    desk.add(modesty);

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
    const loose = new THREE.Group();
    loose.name = 'loosePages';
    [
        { x: 0.30, z: 0.14, r: 0.42 },
        { x: 0.24, z: -0.16, r: -0.28 },
        { x: 0.46, z: -0.02, r: 0.12 }
    ].forEach((p, i) => {
        const page = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.002, 0.29), paperWhite);
        page.position.set(S.x + p.x, D.topY + 0.002 + i * 0.002, S.z + p.z);
        page.rotation.y = p.r;
        loose.add(page);
    });
    showroomGroup.add(loose);

    // ---- The dealer's screen, turned away from the visitor ----
    // It faces the dealer at -z, so from the camera it is a blank back,
    // which is exactly the point: everything on it is knowable, and none
    // of it is being shown to the customer.
    const screen = new THREE.Group();
    screen.name = 'dealerScreen';
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.022), matteBlack);
    panel.position.y = 0.30;
    screen.add(panel);
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.25, metalness: 0.2 })
    );
    face.position.set(0, 0.30, -0.013);
    face.rotation.y = Math.PI;
    screen.add(face);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), brushedMetal);
    neck.position.y = 0.09;
    screen.add(neck);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.014, 0.13), brushedMetal);
    foot.position.y = 0.02;
    screen.add(foot);
    screen.position.set(D.x + 0.42, D.topY, D.z - 0.30);
    screen.rotation.y = 0.18;
    showroomGroup.add(registerOutdoorProp(screen, 'computer'));

    // ---- Calculator and pen, on the dealer's side of the page ----
    const deskKit = new THREE.Group();
    deskKit.name = 'deskKit';
    const calc = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.012, 0.16), matteBlack);
    calc.position.set(D.x - 0.05, D.topY + 0.006, D.z - 0.24);
    calc.rotation.y = 0.3;
    deskKit.add(calc);
    const calcFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.075, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x9fb8a4, roughness: 0.4 })
    );
    calcFace.rotation.x = -Math.PI / 2;
    calcFace.position.set(D.x - 0.05 + 0.015, D.topY + 0.013, D.z - 0.285);
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
        { seat: LAYOUT.dealer, target: mid, kind: 'dealer' }
    ].forEach(({ seat, target, kind }) => {
        const yaw = faceToward(seat, target);
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
        lower.rotation.x = kneeBend;
    });
}

/** Drop a rig figure onto a seat: hips land just above the cushion, with
 *  the bend coming from poseSeated. scaleY is the figure's y scale. */
function seatHeightY(seatTop, scaleY) {
    return seatTop + 0.05 - 0.75 * scaleY;
}

/** Give a tagged arm a working elbow: wrap the forearm and hand (the
 *  parts below the elbow sphere at half arm length) into a pivot group
 *  at the joint. The sphere itself stays with the upper arm as the joint
 *  ball. Returns the pivot.
 *
 *  This is what makes John's point read as a point rather than as
 *  sleepwalking: the shared rig's arm is one rigid group hinged at the
 *  shoulder, which cannot put a fingertip on a specific spot on a desk.
 *  Used from M4. */
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

/**
 * Advance the showroom one frame. At M0 that is only the wall clock:
 * John's point and glance, his customer's nod, the dealer's listening,
 * and the car crossing the lot all arrive at M5 and M6. Everything holds
 * still under prefers-reduced-motion. Driven by main.js's loop (which
 * also runs the shared day/night pass, frozen at noon, for the sky and
 * the shadow-map refresh, plus the drifting clouds).
 */
export function updateShowroom(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The wall clock keeps the visitor's real local time
    setClockHands();
}

/** The root showroom group (exposed for tests and future passes). */
export function getShowroomGroup() {
    return showroomGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = {
    LAYOUT, PALETTE, JOHN_LOOK,
    seatHeightY, faceToward,
    poseSeated, addElbow, createDeskChair, createSucculent
};
