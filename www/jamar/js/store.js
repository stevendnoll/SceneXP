// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * store.js - The Karaoke Night Bar Construction
 *
 * Builds the eighth SceneXP micro-environment, and the second passive one:
 * karaoke night at the corner bar, in honor of Jamar, the builder's best
 * friend, for his birthday. Jamar has the corner stage and the microphone.
 * The lyrics screen on the wall is rolling, the PA speakers are keeping
 * the beat, and Steve and Mike have the booth beside the stage with a
 * round of drinks. A bartender polishes glasses behind the bar, two
 * regulars sway at a high-top, the disco ball turns, and the neon hums.
 *
 * The camera never moves in this experience, so the whole room is
 * composed for one fixed viewpoint (see JAMAR_CONFIG.camera): the stage
 * in the back-left corner, the booth beside it, the bar along the right
 * wall, and the open floor between. The scene provides all the motion
 * via updateBar(deltaTime).
 *
 * The bar is windowless on purpose (the best karaoke bars are), so the
 * shared sky is never seen, the day/night cycle is off, and the room
 * carries its own lighting: a dimmed house rig, warm pendants, the stage
 * wash, the neon, and the lyrics screen's glow.
 *
 * The module keeps the store.js name and its initStore export so the
 * conductor in main.js reads like every other experience's.
 *
 * FLOOR PLAN (viewed from above, the camera at the bottom looking up).
 * The camera is aimed at Jamar, so the frame swings left: the bar along
 * the right wall sits just off-camera, heard in the ambience more than
 * seen, the way the room behind you is at a real show.
 *
 *   +--------------- back wall (brick) ---------------+
 *   | [TV]  [banner over stage]      [neon]           |
 *   |(disco ball, high in the corner)                 |
 *   | (spk)   JAMAR   (spk)  [booth: Steve + Mike]    |
 *   |  [stage platform]  [console]                    |
 *   |                                          bar    |
 *   | [high-top: two regulars]                 with   |
 *   |  [dartboard + jukebox, left wall]        stools |
 *   |          (camera, aimed at Jamar)      bartender|
 *   +-------------------------------------------------+
 */

import { getScene, getRenderer } from '../../shared/js/scene-1.0.0.min.js';
import { initWorld, registerOutdoorProp } from '../../shared/js/world-1.0.0.min.js';
import { JAMAR_CONFIG } from './config.min.js';
import { createPerson } from '../../shared/js/people-1.0.0.min.js';

// World mesh group (the static room plus everything in it)
let barGroup = null;

// Visitors who ask for reduced motion get a perfectly still bar: everyone
// holds their pose, the disco ball parks, and the lyrics screen shows one
// steady frame. Matches the reduced-motion handling across the site.
const _reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

// ============================================
// LAYOUT
// ============================================
// Everything is composed around the corner stage at the back-left, with
// the fixed camera on the positive-Z side looking in. All meters.
const LAYOUT = {
    room: { minX: -4.75, maxX: 4.75, minZ: -4.55, maxZ: 4.25, height: 3.15 },
    stage: { x: -2.6, z: -3.2, w: 2.5, d: 1.9, h: 0.12 },
    jamar: { x: -2.7, z: -3.0, yaw: 0.42 },
    tv: { x: -1.55, y: 2.1, z: -4.51 },
    banner: { x: -2.5, y: 2.82, z: -4.53 },
    neon: { x: 1.15, y: 2.45, z: -4.53 },
    speakers: [
        { x: -4.25, z: -3.5, base: 0, yaw: 0.55 },     // floor, left of the stage
        { x: -1.7, z: -3.75, base: 0.12, yaw: -0.3 }   // on the stage's right edge
    ],
    micStand: { x: -3.3, z: -2.75 },
    console: { x: -1.05, z: -2.05, yaw: -0.5 },
    booth: {
        centerX: 1.15, width: 2.5,
        benchZ: -4.03, seatTop: 0.46,
        tableZ: -3.31, tableTop: 0.74
    },
    seats: {
        steve: { x: 0.55, yaw: -0.42 },
        mike: { x: 1.72, yaw: -0.3 }
    },
    // The bar runs along the right wall. With the camera aimed at Jamar
    // it sits just off-frame, but it stays fully built: the ambience
    // clinks come from somewhere, and future passes may look its way.
    bar: { frontX: 3.2, depth: 0.55, minZ: -2.3, maxZ: 1.3, topY: 1.02 },
    hightop: { x: -2.9, z: -1.0 },
    // Tucked into the back-left corner over stage left: out over the open
    // floor it hung right in the sightline from the camera to the banner.
    discoBall: { x: -4.0, y: 2.6, z: -3.6 },
    // Front stretch of the left wall: the posters hold the back stretch,
    // the jukebox stands at -0.3, and the board hangs past its front edge
    // (jukebox spans z -0.7..0.1) so nothing sits directly above the arch.
    dartboard: { x: -4.72, y: 1.62, z: 0.55 },
    // Facing into the room from the left wall, dartboard to its front
    jukebox: { x: -4.46, z: -0.3, yaw: Math.PI / 2 }
};

// -------------------------------------------------------------------------
// WHO'S WHO (appearance blocks, kept together so they're easy to adjust)
// -------------------------------------------------------------------------
// Jamar: a light blue button-down, blue jeans, brown loafers, a beard,
// and slightly bushy salt and pepper hair. A stylized low-poly portrait
// rather than a likeness.
const JAMAR_LOOK = {
    skinTone: 0x8d5a3b,
    hairColor: 0x443e36,      // one even graying tone: distinct silver tufts read wrong at this scale
    hairStyle: 'buzz',        // the shared cap, given top volume in createJamar
    beardColor: 0x181109,
    shirtColor: 0x8fb8e0,     // light blue button-down
    pantsColor: 0x3b5f8a,     // blue jeans
    loaferColor: 0x6b4a2f,    // brown loafers
    eyeColor: 0x1d130c
};

// Steve, exactly as he appears in the www/steve experience: black tee,
// blue jeans, tan skin, short dark brown hair, gray New Balance sneakers.
const STEVE_LOOK = {
    shirtColor: 0x1d1e21,
    pantsColor: 0x35567e,
    skinTone: 0xd7a678,
    hairColor: 0x2e2013,
    hairStyle: 'short',
    handScale: 1.4
};

// Mike, styled after the Seed to Seed host: stocky build, brick-red work
// shirt worn with the sleeves down, graying reddish hair with a darker
// crown, a trimmed beard a shade grayer still, and blue eyes.
const MIKE_LOOK = {
    shirtColor: 0x7a2f2a,
    pantsColor: 0x4f5666,
    skinTone: 0xf0c8a0,
    hairColor: 0xa98a72,
    hairTopColor: 0x84695a,
    beardColor: 0xa8917f,
    eyeColor: 0x3f6fae
};

// The bar palette. Warm, dim, and a little loud, like the room.
const PALETTE = {
    floorWood: 0x4a3626,
    wallPlum: 0x3a2a33,
    wainscot: 0x2e2019,
    ceiling: 0x171419,
    brick: 0x6b3a30,
    counterWood: 0x2f2118,
    vinyl: 0x8c2430,
    brass: 0xc9a35c,
    stageDark: 0x1b181d,
    chrome: 0x9aa0a6,
    neonPink: 0xff4fa3,
    stageMagenta: 0xe23fa0,
    stageBlue: 0x3f6fe2,
    spotWhite: 0xfff3e0,
    bulbWarm: 0xffd9a0
};

// The shared tempo the speaker cones pulse to. About 105 bpm, a
// comfortable singalong pace. (Still exported: tests and any future
// audio pass can key off it.)
export const BEAT_HZ = 1.75;

// ============================================
// TEXTURES (procedural, canvas-based)
// ============================================
function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** Dark walnut floor planks with soft grain and staggered board ends. */
function createFloorTexture() {
    const canvas = makeCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    const tones = ['#4a3626', '#503a28', '#443122', '#57402d'];
    const plankH = 64;
    for (let p = 0; p < 8; p++) {
        ctx.fillStyle = tones[p % 4];
        ctx.fillRect(0, p * plankH, 512, plankH);

        // Grain lines
        for (let g = 0; g < 7; g++) {
            ctx.strokeStyle = g % 2 ? 'rgba(30, 20, 12, 0.4)' : 'rgba(96, 72, 50, 0.35)';
            ctx.lineWidth = 1 + Math.random();
            const y = p * plankH + 6 + Math.random() * (plankH - 12);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(170, y + Math.random() * 5 - 2.5, 340, y + Math.random() * 5 - 2.5, 512, y + Math.random() * 4 - 2);
            ctx.stroke();
        }

        // Board gap and a staggered end seam
        ctx.fillStyle = 'rgba(12, 8, 5, 0.9)';
        ctx.fillRect(0, p * plankH + plankH - 2, 512, 2);
        const seamX = ((p * 197) % 448) + 32;
        ctx.fillRect(seamX, p * plankH, 2, plankH);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** The stage wall's brick: staggered courses in warm reds with mortar. */
function createBrickTexture() {
    const canvas = makeCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3c2b26';    // mortar
    ctx.fillRect(0, 0, 512, 512);

    const bw = 64, bh = 30, gap = 4;
    const reds = ['#6b3a30', '#75443a', '#5f342c', '#7c4a3c', '#68382f'];
    for (let row = 0; row < 17; row++) {
        const offset = (row % 2) * (bw / 2);
        for (let col = -1; col < 9; col++) {
            ctx.fillStyle = reds[Math.floor(Math.random() * reds.length)];
            ctx.fillRect(col * bw + offset + gap / 2, row * bh + gap / 2, bw - gap, bh - gap);
            // A little surface speckle
            for (let s = 0; s < 5; s++) {
                ctx.fillStyle = Math.random() < 0.5 ? 'rgba(30, 16, 12, 0.25)' : 'rgba(150, 100, 80, 0.2)';
                ctx.fillRect(
                    col * bw + offset + gap + Math.random() * (bw - gap * 2),
                    row * bh + gap + Math.random() * (bh - gap * 2),
                    2 + Math.random() * 3, 2 + Math.random() * 2
                );
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Rich counter wood: near-black walnut with a low sheen grain. */
function createCounterTexture() {
    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2f2118';
    ctx.fillRect(0, 0, 256, 256);
    for (let g = 0; g < 26; g++) {
        ctx.strokeStyle = g % 2 ? 'rgba(18, 12, 8, 0.5)' : 'rgba(92, 66, 44, 0.3)';
        ctx.lineWidth = 1 + Math.random() * 1.5;
        const y = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(90, y + Math.random() * 8 - 4, 170, y + Math.random() * 8 - 4, 256, y + Math.random() * 6 - 3);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// ============================================
// SHARED MATERIALS
// ============================================
const chromeMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.chrome, roughness: 0.3, metalness: 0.8 });
const matteBlack = new THREE.MeshStandardMaterial({ color: 0x1c1b1f, roughness: 0.7, metalness: 0.1 });
const brassMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.35, metalness: 0.85 });
const vinylMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.vinyl, roughness: 0.55, metalness: 0.0 });
const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8e4ea, roughness: 0.1, metalness: 0.0,
    transparent: true, opacity: 0.35, depthWrite: false
});
const beerMaterial = new THREE.MeshStandardMaterial({
    color: 0xd88f1e, roughness: 0.2, metalness: 0.0,
    transparent: true, opacity: 0.85
});
const foamMaterial = new THREE.MeshStandardMaterial({ color: 0xf6efdc, roughness: 0.8, metalness: 0.0 });

// ============================================
// ANIMATION REGISTRIES (filled during build, driven by updateBar)
// ============================================
let jamarRig = null;        // { group, micArm, freeArm }
let boothFriends = [];      // { group, baseYaw, glassArm, glass, restRx, phase }
let bartenderRig = null;    // { group, polishArm, phase }
let patrons = [];           // { group, baseYaw, glassArm, glass, restRx, phase }
let speakerCones = [];      // cone meshes that thump with the beat
let discoBallGroup = null;
let stageSpots = [];        // { light, phase }
let stringLightMats = [];   // shared bulb materials, twinkled in place
let neonRig = null;         // { mats, light, flicker }
let tv = null;              // { canvas, ctx, texture, drawTimer, lineIndex, lineTime, sweep }

// ============================================
// THE SONG ON THE SCREEN
// ============================================
// Tonight's song, per Steve: MacArthur Park, the Donna Summer version.
// The title and artist are shown for real, but the rolling lines are
// ORIGINAL text written in the song's spirit. Actual lyrics are
// copyrighted (Jimmy Webb, 1968) and never go on the screen: this site
// is live and the repo will be public, so nothing licensed, ever.
let nowPlaying = {
    singer: 'JAMAR',
    title: 'MacArthur Park  •  Donna Summer',
    lines: [
        'The cake never made it in out of the rain',
        'But nobody came here tonight for the cake',
        'The strings swell up and the room sings on',
        'One more chorus before the dawn'
    ],
    secondsPerLine: 4.2
};

/** Swap the song on the lyrics screen (the interactions pass drives this).
 *  Accepts { singer, title, lines, secondsPerLine } and redraws at once. */
export function setNowPlaying(song) {
    if (!song || !Array.isArray(song.lines) || !song.lines.length) return;
    nowPlaying = Object.assign({}, nowPlaying, song);
    if (tv) {
        tv.lineIndex = 0;
        tv.lineTime = 0;
        drawTvFrame(0);
    }
}

/**
 * Initialize the bar world
 */
export function initStore() {
    const scene = getScene();
    if (!scene) {
        return;
    }

    // The shared world context owns the root group (added to the scene).
    barGroup = initWorld(JAMAR_CONFIG);

    tuneHouseLights();       // dim the shared rig to bar levels
    createRoom();            // floor, walls, wainscot, ceiling
    createStage();           // the corner platform with its glowing edge
    createTv();              // the wall-mounted lyrics screen
    createSpeakers();        // two PA speakers keeping the beat
    createMicStand();        // the spare stand Jamar abandoned
    createConsole();         // the karaoke machine, queue loaded
    createBooth();           // the birthday booth: bench, table, drinks
    createBoothFriends();    // Steve and Mike, seated with a round
    createJamar();           // the man of the hour, mic in hand
    createBarCounter();      // the bar, stools, taps, and foot rail
    createBackBar();         // shelves of glowing bottles
    createBartender();       // polishing a glass, enjoying the show
    createHighTop();         // the tall table by the open floor
    createPatrons();         // two regulars swaying beside it
    createDecor();           // neon, banner, disco ball, darts, jukebox, posters, string lights
    createHouseLighting();   // pendants, stage wash, and the screen's glow

    // The lyrics screen shows a steady mid-song frame even before the
    // update loop runs (and forever, under prefers-reduced-motion).
    drawTvFrame(0.45);

    return barGroup;
}

// ============================================
// HOUSE LIGHT TUNING
// ============================================
/** The shared scene rig boots at noon brightness. This is a windowless
 *  bar, so nothing ever calls updateDayNightCycle to change it: set the
 *  house levels once, warm and low, and let the room's own fixtures
 *  (pendants, stage wash, neon) do the storytelling. */
function tuneHouseLights() {
    const scene = getScene();
    const ambient = scene.getObjectByName('ambientLight');
    if (ambient) {
        ambient.intensity = 0.2;
        ambient.color.setHex(0xffd9b3);
    }
    const hemi = scene.getObjectByName('hemiLight');
    if (hemi) {
        hemi.intensity = 0.22;
        hemi.color.setHex(0x6a4a56);
        if (hemi.groundColor) hemi.groundColor.setHex(0x241a14);
    }
    const dir = scene.getObjectByName('dirLight');
    if (dir) {
        dir.intensity = 0.22;
        dir.color.setHex(0xffc890);
        dir.position.set(1.5, 8, 2.5);
    }
}

// ============================================
// THE ROOM: FLOOR, WALLS, CEILING
// ============================================
function createRoom() {
    const R = LAYOUT.room;
    const width = R.maxX - R.minX;
    const depth = R.maxZ - R.minZ;
    const cx = (R.minX + R.maxX) / 2;
    const cz = (R.minZ + R.maxZ) / 2;

    // Floor: dark walnut planks
    const floorTexture = createFloorTexture();
    floorTexture.repeat.set(width / 2.4, depth / 2.4);
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(width + 1, 0.05, depth + 1),
        new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.75, metalness: 0.05 })
    );
    floor.position.set(cx, -0.025, cz);
    floor.receiveShadow = true;
    floor.name = 'floor';
    barGroup.add(floor);

    // Back wall: exposed brick, the stage's backdrop
    const brickTexture = createBrickTexture();
    brickTexture.repeat.set(width / 3.2, R.height / 3.2);
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.2, R.height, 0.12),
        new THREE.MeshStandardMaterial({ map: brickTexture, roughness: 0.9, metalness: 0.0 })
    );
    backWall.position.set(cx, R.height / 2, R.minZ - 0.06);
    backWall.receiveShadow = true;
    backWall.name = 'backWall';
    barGroup.add(backWall);

    // Side and front walls: deep plum paint over a wood wainscot
    const plum = new THREE.MeshStandardMaterial({ color: PALETTE.wallPlum, roughness: 0.9, metalness: 0.0 });
    const wainscot = new THREE.MeshStandardMaterial({ color: PALETTE.wainscot, roughness: 0.8, metalness: 0.0 });

    [[R.minX - 0.06, 0], [R.maxX + 0.06, 0]].forEach(([x], i) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, R.height, depth + 0.2), plum);
        wall.position.set(x, R.height / 2, cz);
        wall.receiveShadow = true;
        wall.name = i === 0 ? 'leftWall' : 'rightWall';
        barGroup.add(wall);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, depth + 0.2), wainscot);
        rail.position.set(x, 0.475, cz);
        barGroup.add(rail);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, depth + 0.2), wainscot);
        cap.position.set(x, 0.975, cz);
        barGroup.add(cap);
    });

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, R.height, 0.12), plum);
    frontWall.position.set(cx, R.height / 2, R.maxZ + 0.06);
    frontWall.name = 'frontWall';
    barGroup.add(frontWall);

    // Ceiling: dark, so the string lights and disco ball can own it
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(width + 1, 0.08, depth + 1),
        new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.95, metalness: 0.0 })
    );
    ceiling.position.set(cx, R.height + 0.04, cz);
    ceiling.name = 'ceiling';
    barGroup.add(ceiling);
}

// ============================================
// THE CORNER STAGE
// ============================================
function createStage() {
    const S = LAYOUT.stage;
    const stage = new THREE.Group();
    stage.name = 'stage';

    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(S.w, S.h, S.d),
        new THREE.MeshStandardMaterial({ color: PALETTE.stageDark, roughness: 0.85, metalness: 0.05 })
    );
    platform.position.set(S.x, S.h / 2, S.z);
    platform.castShadow = true;
    platform.receiveShadow = true;
    stage.add(platform);

    // A glowing edge strip along the front lip, the classic tiny-stage touch
    const strip = new THREE.Mesh(
        new THREE.BoxGeometry(S.w, 0.015, 0.015),
        new THREE.MeshBasicMaterial({ color: PALETTE.neonPink })
    );
    strip.position.set(S.x, S.h - 0.01, S.z + S.d / 2 + 0.005);
    stage.add(strip);

    // A little riser trim in brass along the front face
    const trim = new THREE.Mesh(new THREE.BoxGeometry(S.w, 0.02, 0.01), brassMaterial);
    trim.position.set(S.x, 0.02, S.z + S.d / 2 + 0.006);
    stage.add(trim);

    barGroup.add(registerOutdoorProp(stage, 'stage'));
}

// ============================================
// THE LYRICS SCREEN
// ============================================
function createTv() {
    const T = LAYOUT.tv;
    const tvGroup = new THREE.Group();
    tvGroup.name = 'lyricsScreen';

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.07), matteBlack);
    frame.position.set(T.x, T.y, T.z);
    tvGroup.add(frame);

    // The screen: a live canvas texture main.js's loop keeps rolling
    const canvas = makeCanvas(512, 288);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.58, 0.88),
        new THREE.MeshBasicMaterial({ map: texture })
    );
    screen.position.set(T.x, T.y, T.z + 0.042);
    tvGroup.add(screen);

    tv = { canvas, ctx, texture, drawTimer: 0, lineIndex: 0, lineTime: 0, sweep: 0.45 };

    barGroup.add(registerOutdoorProp(tvGroup, 'tv'));
}

/** Paint the current karaoke frame into any 2d context at any size:
 *  header, the active line with its highlight sweep, the next line on
 *  deck, and a little equalizer strip that keeps time. Composed in
 *  512x288 coordinates and scaled to the target, so the wall texture and
 *  main.js's full-size close-up view share one painter (the same
 *  arrangement as the interstate desk monitor). Canvas scaling is
 *  vector-based, so the text stays crisp at overlay sizes. */
export function drawTvTo(ctx, outW, outH) {
    if (!tv) return;
    const sweep = tv.sweep;
    ctx.setTransform(outW / 512, 0, 0, outH / 288, 0, 0);
    const W = 512, H = 288;   // the design space every target size scales from
    const lines = nowPlaying.lines;
    const line = lines[tv.lineIndex % lines.length];
    const next = lines[(tv.lineIndex + 1) % lines.length];

    // Every line of text shrinks to fit the frame: set the wanted font,
    // measure, and scale the size down just enough if the text would run
    // off the sides of the screen. TEXT_MAX leaves a margin each side.
    const TEXT_MAX = W - 32;
    const fitFont = (px, text, bold) => {
        const weight = bold ? 'bold ' : '';
        ctx.font = `${weight}${px}px Arial`;
        const w = ctx.measureText(text).width;
        if (w > TEXT_MAX) ctx.font = `${weight}${Math.floor(px * TEXT_MAX / w)}px Arial`;
    };

    // Background: deep club gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#151034');
    bg.addColorStop(1, '#2c1240');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header band
    const header = `♪  NOW SINGING: ${nowPlaying.singer}  ♪`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = '#f5c33b';
    fitFont(24, header, true);
    ctx.textAlign = 'center';
    ctx.fillText(header, W / 2, 36);
    ctx.fillStyle = '#8f86a8';
    fitFont(15, nowPlaying.title);
    ctx.fillText(nowPlaying.title, W / 2, 78);

    // The active line: gray base, then the pink sweep clipped over it
    fitFont(26, line, true);
    ctx.fillStyle = '#9a92b5';
    ctx.fillText(line, W / 2, 150);
    const lineWidth = ctx.measureText(line).width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - lineWidth / 2, 120, lineWidth * Math.max(0, Math.min(1, sweep)), 44);
    ctx.clip();
    ctx.fillStyle = '#ff5fa8';
    ctx.fillText(line, W / 2, 150);
    ctx.restore();

    // The next line, waiting its turn
    ctx.fillStyle = '#5e5680';
    fitFont(20, next);
    ctx.fillText(next, W / 2, 196);

    // Equalizer strip keeping time along the bottom
    const bars = 12, bw = 18, gapX = 12;
    const total = bars * bw + (bars - 1) * gapX;
    for (let i = 0; i < bars; i++) {
        const h = 10 + Math.abs(Math.sin(sweep * 6.28 * 2 + i * 1.7)) * 34;
        ctx.fillStyle = i % 2 ? '#ff5fa8' : '#7b62d8';
        ctx.fillRect(W / 2 - total / 2 + i * (bw + gapX), H - 24 - h, bw, h);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Advance the in-world screen to a new sweep position and repaint its
 *  texture. The sweep is kept on the tv state so drawTvTo (and the
 *  close-up overlay mirroring it) always paints the current moment. */
function drawTvFrame(sweep) {
    if (!tv) return;
    tv.sweep = Math.max(0, Math.min(1, sweep));
    drawTvTo(tv.ctx, tv.canvas.width, tv.canvas.height);
    tv.texture.needsUpdate = true;
}

// ============================================
// PA SPEAKERS
// ============================================
function createSpeaker() {
    const speaker = new THREE.Group();

    // Tripod stand
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 6), matteBlack);
    pole.position.y = 0.3;
    speaker.add(pole);
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), matteBlack);
        leg.position.set(Math.cos(a) * 0.14, 0.14, Math.sin(a) * 0.14);
        leg.rotation.z = Math.cos(a) * 0.62;
        leg.rotation.x = -Math.sin(a) * 0.62;
        speaker.add(leg);
    }

    // Cabinet
    const cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.72, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x232228, roughness: 0.8, metalness: 0.05 })
    );
    cab.position.y = 0.92;
    cab.castShadow = true;
    speaker.add(cab);

    // Woofer and tweeter on the front face (these thump with the beat)
    const woofer = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.055, 16), matteBlack);
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, 0.8, 0.205);
    speaker.add(woofer);
    const wooferRim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.012, 6, 18), chromeMaterial);
    wooferRim.position.set(0, 0.8, 0.205);
    speaker.add(wooferRim);
    const tweeter = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.03, 12), matteBlack);
    tweeter.rotation.x = Math.PI / 2;
    tweeter.position.set(0, 1.08, 0.205);
    speaker.add(tweeter);

    speakerCones.push(woofer, tweeter);
    return speaker;
}

function createSpeakers() {
    LAYOUT.speakers.forEach((spot, i) => {
        const speaker = createSpeaker();
        speaker.name = `speaker_${i}`;
        speaker.position.set(spot.x, spot.base, spot.z);
        speaker.rotation.y = spot.yaw;
        barGroup.add(registerOutdoorProp(speaker, 'speaker'));
    });
}

// ============================================
// MIC STAND (the spare: Jamar prefers the mic in his hand)
// ============================================
function createMicStand() {
    const M = LAYOUT.micStand;
    const stand = new THREE.Group();
    stand.name = 'micStand';

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 12), matteBlack);
    base.position.y = 0.015;
    stand.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), chromeMaterial);
    pole.position.y = 0.7;
    stand.add(pole);
    const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 6), matteBlack);
    clip.position.y = 1.4;
    clip.rotation.x = 0.5;
    stand.add(clip);

    stand.position.set(M.x, LAYOUT.stage.h, M.z);
    barGroup.add(registerOutdoorProp(stand, 'micstand'));
}

// ============================================
// THE KARAOKE CONSOLE
// ============================================
function createConsole() {
    const C = LAYOUT.console;
    const console3d = new THREE.Group();
    console3d.name = 'karaokeConsole';

    const cart = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.82, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.3 })
    );
    cart.position.y = 0.47;
    cart.castShadow = true;
    console3d.add(cart);

    // Casters
    [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]].forEach(([x, z]) => {
        const caster = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), matteBlack);
        caster.position.set(x, 0.04, z);
        console3d.add(caster);
    });

    // The slanted control panel with its little queue screen
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.34), matteBlack);
    panel.position.set(0, 0.91, 0.02);
    panel.rotation.x = -0.35;
    console3d.add(panel);

    const queueCanvas = makeCanvas(128, 64);
    const qctx = queueCanvas.getContext('2d');
    qctx.fillStyle = '#0c1e12';
    qctx.fillRect(0, 0, 128, 64);
    qctx.fillStyle = '#57e389';
    qctx.font = 'bold 13px monospace';
    qctx.fillText('KARAOKE  QUEUE', 8, 18);
    qctx.fillText('> JAMAR', 8, 38);
    qctx.fillStyle = '#2e7d4f';
    qctx.fillText('  JAMAR (again)', 8, 56);
    const queueScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.15),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(queueCanvas) })
    );
    queueScreen.position.set(-0.08, 0.945, 0.075);
    queueScreen.rotation.x = -(Math.PI / 2 - 0.35);    // lie flat on the slanted panel
    console3d.add(queueScreen);

    // Chunky friendly buttons
    const buttonColors = [0xd84a3f, 0xf5c33b, 0x57b0e3, 0x6fce7d];
    buttonColors.forEach((color, i) => {
        const button = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10),
            new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })
        );
        button.position.set(0.1 + (i % 2) * 0.07, 0.93 + Math.floor(i / 2) * -0.035, 0.1 + Math.floor(i / 2) * 0.09);
        button.rotation.x = -0.35;
        console3d.add(button);
    });

    // The appletini, parked on the cart's back corner between verses:
    // a martini glass of apple green with one cherry. Its own prop root,
    // nested inside the console so the cart carries it (taps resolve to
    // the NEAREST tagged ancestor, so the glass answers before the cart).
    const appletini = new THREE.Group();
    appletini.name = 'appletini';
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfe6ef, roughness: 0.06, metalness: 0.05,
        transparent: true, opacity: 0.28, side: THREE.DoubleSide
    });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.008, 12), glassMaterial);
    foot.position.y = 0.004;
    appletini.add(foot);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.085, 8), glassMaterial);
    stem.position.y = 0.05;
    appletini.add(stem);
    // The bowl: an open cone (DoubleSide shows its inside over the rim)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.006, 0.075, 14, 1, true), glassMaterial);
    bowl.position.y = 0.13;
    appletini.add(bowl);
    // The pour, apple green with a faint glow so it reads in the dim bar
    const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.005, 0.058, 12),
        new THREE.MeshStandardMaterial({
            color: 0x9adb43, roughness: 0.15, transparent: true, opacity: 0.85,
            emissive: 0x9adb43, emissiveIntensity: 0.22
        })
    );
    liquid.position.y = 0.126;
    appletini.add(liquid);
    // One red cherry, half afloat
    const cherry = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd0243c, roughness: 0.3 })
    );
    cherry.position.set(0.012, 0.152, 0.008);
    appletini.add(cherry);
    // A generous invisible tap target around the whole glass (the gavin
    // mantis-perch trick): opacity 0 renders nothing but still answers
    // the raycast, and stays visible=true so the tap filter keeps it.
    // Fingertips get a fist-sized target instead of a stem-sized one.
    const tapProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    tapProxy.position.y = 0.1;
    appletini.add(tapProxy);
    // Cart top, back strip, clear of the panel. Toward the cart's +x side
    // so the glass stands clear of the PA speaker behind it in the frame.
    appletini.position.set(0.06, 0.88, -0.17);
    console3d.add(registerOutdoorProp(appletini, 'appletini'));

    console3d.position.set(C.x, 0, C.z);
    console3d.rotation.y = C.yaw;
    barGroup.add(registerOutdoorProp(console3d, 'console'));

    // A fat cable running from the console to the stage, taped down the
    // way every bar tapes it down
    const cable = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
            new THREE.Vector3(C.x - 0.2, 0.02, C.z - 0.1),
            new THREE.Vector3(C.x - 0.7, 0.02, C.z - 0.5),
            new THREE.Vector3(LAYOUT.speakers[1].x + 0.3, 0.02, LAYOUT.speakers[1].z + 0.5),
            new THREE.Vector3(LAYOUT.speakers[1].x, 0.14, LAYOUT.speakers[1].z + 0.1)
        ]), 14, 0.014, 5),
        matteBlack
    );
    barGroup.add(cable);
}

// ============================================
// THE BIRTHDAY BOOTH
// ============================================
function createBooth() {
    const B = LAYOUT.booth;
    const booth = new THREE.Group();
    booth.name = 'booth';

    const counterTexture = createCounterTexture();
    const darkWood = new THREE.MeshStandardMaterial({ map: counterTexture, roughness: 0.5, metalness: 0.05 });

    // Bench: kick panel, seat cushion, tall tufted backrest, wood cap
    const kick = new THREE.Mesh(new THREE.BoxGeometry(B.width, 0.3, 0.6), matteBlack);
    kick.position.set(B.centerX, 0.15, B.benchZ);
    booth.add(kick);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(B.width, 0.16, 0.62), vinylMaterial);
    seat.position.set(B.centerX, B.seatTop - 0.08, B.benchZ);
    seat.castShadow = true;
    booth.add(seat);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(B.width, 1.0, 0.16), vinylMaterial);
    backrest.position.set(B.centerX, 0.96, B.benchZ - 0.33);
    backrest.castShadow = true;
    booth.add(backrest);

    // Tufting seams so the vinyl reads as a booth, not a box
    for (let i = 1; i < 5; i++) {
        const seam = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, 0.9, 0.02),
            new THREE.MeshStandardMaterial({ color: 0x6e1a24, roughness: 0.6 })
        );
        seam.position.set(B.centerX - B.width / 2 + (B.width / 5) * i, 0.95, B.benchZ - 0.24);
        booth.add(seam);
    }

    const cap = new THREE.Mesh(new THREE.BoxGeometry(B.width + 0.06, 0.05, 0.2), darkWood);
    cap.position.set(B.centerX, 1.48, B.benchZ - 0.33);
    booth.add(cap);

    // Table: dark wood top on a single pedestal
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.72), darkWood);
    top.position.set(B.centerX, B.tableTop - 0.03, B.tableZ);
    top.castShadow = true;
    top.receiveShadow = true;
    booth.add(top);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.68, 10), matteBlack);
    pedestal.position.set(B.centerX, 0.34, B.tableZ);
    booth.add(pedestal);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.035, 12), matteBlack);
    foot.position.set(B.centerX, 0.018, B.tableZ);
    booth.add(foot);

    barGroup.add(registerOutdoorProp(booth, 'booth'));

    // The round on the table: a pitcher, a spare glass, and pretzels
    const drinks = new THREE.Group();
    drinks.name = 'drinks';

    const pitcher = new THREE.Group();
    const pitcherBody = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.2, 12), glassMaterial);
    pitcherBody.position.y = 0.1;
    pitcher.add(pitcherBody);
    const pitcherBeer = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.056, 0.15, 12), beerMaterial);
    pitcherBeer.position.y = 0.08;
    pitcher.add(pitcherBeer);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 12, Math.PI), glassMaterial);
    handle.position.set(0.078, 0.1, 0);
    handle.rotation.z = -Math.PI / 2;
    pitcher.add(handle);
    pitcher.position.set(B.centerX + 0.35, B.tableTop, B.tableZ - 0.05);
    drinks.add(pitcher);

    const spare = createPintGlass();
    spare.position.set(B.centerX - 0.05, B.tableTop, B.tableZ + 0.18);
    drinks.add(spare);

    const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.055, 0.05, 12),
        new THREE.MeshStandardMaterial({ color: 0x8f2f2a, roughness: 0.5 })
    );
    bowl.position.set(B.centerX - 0.42, B.tableTop + 0.025, B.tableZ - 0.08);
    drinks.add(bowl);
    for (let i = 0; i < 7; i++) {
        const pretzel = new THREE.Mesh(
            new THREE.TorusGeometry(0.016, 0.007, 5, 8),
            new THREE.MeshStandardMaterial({ color: 0x9a6a35, roughness: 0.8 })
        );
        pretzel.position.set(
            B.centerX - 0.42 + (Math.random() - 0.5) * 0.08,
            B.tableTop + 0.055 + Math.random() * 0.012,
            B.tableZ - 0.08 + (Math.random() - 0.5) * 0.08
        );
        pretzel.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        drinks.add(pretzel);
    }

    barGroup.add(registerOutdoorProp(drinks, 'drinks'));
}

/** A pint glass with a proper head on it, origin at the base. */
function createPintGlass() {
    const glass = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.029, 0.15, 10), glassMaterial);
    body.position.y = 0.075;
    glass.add(body);
    const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.115, 10), beerMaterial);
    beer.position.y = 0.062;
    glass.add(beer);
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.022, 10), foamMaterial);
    foam.position.y = 0.132;
    glass.add(foam);
    return glass;
}

// ============================================
// SEATING (the shared rig stands; this teaches it to sit)
// ============================================
/** The shared createPerson rig builds each leg as one rigid group hinged
 *  at the hip (y 0.75, untagged; arms carry userData.isArm). To sit a
 *  figure down, wrap everything from the knee down (knee sphere, shin,
 *  shoe, and any shoe add-ons) in a new subgroup pivoted at the knee,
 *  swing the thigh forward at the hip, and drop the shin back toward the
 *  floor. Call AFTER any shoe styling so the styling rides along. */
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

/** Put a pint glass in a figure's hand: the glass parents to the tagged
 *  arm group so it rides every gesture, and updateBar counter-rotates it
 *  each frame so the beer stays level mid-toast. side is +1 or -1. */
function giveGlass(person, side) {
    let arm = null;
    person.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm &&
            Math.sign(group.position.x) === side) arm = group;
    });
    if (!arm) return { arm: null, glass: null };
    const glass = createPintGlass();
    // Anchor the glass at the HAND (y -0.57 in arm space, just in front
    // of the palm), not partway down the forearm, and sink the body so
    // the anchor lands about 40% up the glass. updateBar's counter-
    // rotation pivots about this origin, so the figure reads as gripping
    // the glass in its hand rather than balancing it on the forearm.
    glass.children.forEach((part) => { part.position.y -= 0.06; });
    glass.position.set(0, -0.57, 0.045);
    arm.add(glass);
    return { arm, glass };
}

// ============================================
// STEVE AND MIKE, IN THE BOOTH
// ============================================
/** Steve's gray New Balance runners, exactly as worn in the www/steve
 *  experience: recolor the rig's default shoes and badge each outer side
 *  with a small white N. Applied before poseSeated so the badges ride
 *  along with the lower leg. */
function applyGraySneakers(person) {
    const sneaker = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.7, metalness: 0.05 });
    const nBadge = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, metalness: 0.0 });
    person.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            if (part.isMesh && part.position.y < -0.7) {
                part.material = sneaker;
                const side = group.position.x > 0 ? 1 : -1;
                const badge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.02), nBadge);
                badge.position.set(side * 0.048, part.position.y + 0.005, part.position.z + 0.01);
                group.add(badge);
            }
        });
    });
}

/** Mike's trimmed beard, adapted from the Seed to Seed host: a jaw band,
 *  a modest chin pad, and a mustache, fitted to the rig's head. */
function createBeard(color) {
    const beard = new THREE.Group();
    beard.name = 'beard';
    const beardMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });

    const jaw = new THREE.Mesh(
        new THREE.SphereGeometry(0.124, 12, 8, Math.PI, Math.PI, Math.PI * 0.58, Math.PI * 0.3),
        beardMaterial
    );
    jaw.rotation.y = Math.PI;
    jaw.position.set(0, 1.5, 0.002);
    beard.add(jaw);

    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), beardMaterial);
    chin.position.set(0, 1.405, 0.08);
    chin.scale.set(1.2, 1.0, 0.8);
    beard.add(chin);

    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.018), beardMaterial);
    stache.position.set(0, 1.452, 0.114);
    beard.add(stache);

    return beard;
}

function createBoothFriends() {
    const B = LAYOUT.booth;

    // ---- Steve ----
    const steve = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: STEVE_LOOK.shirtColor,
        pantsColor: STEVE_LOOK.pantsColor,
        skinTone: STEVE_LOOK.skinTone,
        hairColor: STEVE_LOOK.hairColor,
        hairStyle: STEVE_LOOK.hairStyle,
        handScale: STEVE_LOOK.handScale
    });
    steve.scale.set(0.97, 1, 0.97);
    applyGraySneakers(steve);
    poseSeated(steve);
    const steveSeat = LAYOUT.seats.steve;
    steve.position.set(steveSeat.x, seatHeightY(B.seatTop, 1), B.benchZ + 0.05);
    steve.rotation.y = steveSeat.yaw;
    const steveGlass = giveGlass(steve, 1);      // right hand around his beer
    if (steveGlass.arm) steveGlass.arm.rotation.x = -1.2;   // hand-held glass rests at tabletop height
    // Left forearm resting toward the table
    steve.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm && group.position.x < 0) {
            group.rotation.x = -1.15;
            group.rotation.z = 0.2;
        }
    });
    barGroup.add(registerOutdoorProp(steve, 'steve'));
    boothFriends.push({
        group: steve, baseYaw: steveSeat.yaw,
        glassArm: steveGlass.arm, glass: steveGlass.glass,
        restRx: -1.2, phase: 0.6
    });

    // ---- Mike ----
    const mike = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: MIKE_LOOK.shirtColor,
        pantsColor: MIKE_LOOK.pantsColor,
        skinTone: MIKE_LOOK.skinTone,
        hairColor: MIKE_LOOK.hairColor,
        eyeColor: MIKE_LOOK.eyeColor,
        muscular: true,
        dressShirt: true
    });
    mike.scale.setScalar(1.08);
    // Big capable hands, sturdy boots, and the darker crown, the same way
    // the Seed to Seed host gets his: found by geometry and adjusted.
    mike.traverse((child) => {
        if (child.userData && child.userData.isPupil) {
            child.material.color.setHex(MIKE_LOOK.eyeColor);
            return;
        }
        if (!child.isMesh || !child.geometry) return;
        const params = child.geometry.parameters || {};
        if (child.geometry.type === 'SphereGeometry' && params.radius === 0.04 &&
            child.parent && child.parent.userData && child.parent.userData.isArm) {
            child.scale.multiplyScalar(1.55);
        } else if (child.geometry.type === 'BoxGeometry' && params.depth === 0.18) {
            child.scale.set(1.5, 1.2, 1.4);
        } else if (child.geometry.type === 'SphereGeometry' && params.thetaLength &&
            Math.abs(params.thetaLength - Math.PI * 0.45) < 0.01) {
            child.material = child.material.clone();
            child.material.color.setHex(MIKE_LOOK.hairTopColor);
        }
    });
    mike.add(createBeard(MIKE_LOOK.beardColor));
    poseSeated(mike);
    const mikeSeat = LAYOUT.seats.mike;
    mike.position.set(mikeSeat.x, seatHeightY(B.seatTop, 1.08), B.benchZ + 0.05);
    mike.rotation.y = mikeSeat.yaw;
    const mikeGlass = giveGlass(mike, -1);       // left hand, mid-toast half the night
    if (mikeGlass.arm) mikeGlass.arm.rotation.x = -1.2;   // hand-held glass rests at tabletop height
    mike.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm && group.position.x > 0) {
            group.rotation.x = -1.1;
            group.rotation.z = -0.25;
        }
    });
    barGroup.add(registerOutdoorProp(mike, 'mike'));
    boothFriends.push({
        group: mike, baseYaw: mikeSeat.yaw,
        glassArm: mikeGlass.arm, glass: mikeGlass.glass,
        restRx: -1.2, phase: 2.8
    });
}

// ============================================
// JAMAR, THE MAN OF THE HOUR
// ============================================
function createJamar() {
    const J = LAYOUT.jamar;

    const jamar = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: JAMAR_LOOK.shirtColor,
        pantsColor: JAMAR_LOOK.pantsColor,
        skinTone: JAMAR_LOOK.skinTone,
        hairColor: JAMAR_LOOK.hairColor,
        eyeColor: JAMAR_LOOK.eyeColor,
        hairStyle: JAMAR_LOOK.hairStyle,
        dressShirt: true
    });

    // Brown loafers, buffed to a low shine for stage night
    const loafer = new THREE.MeshStandardMaterial({ color: JAMAR_LOOK.loaferColor, roughness: 0.35, metalness: 0.05 });
    jamar.children.forEach((group) => {
        if (!group.isGroup || group.userData.isArm) return;
        if (Math.abs(group.position.y - 0.75) > 0.02) return;
        group.children.forEach((part) => {
            if (part.isMesh && part.position.y < -0.7) part.material = loafer;
        });
    });

    // Bushier graying hair, per Steve. The shared buzz cap is found by
    // geometry (the same trick Mike's crown uses) and stretched TALL, not
    // wide: the cap is nearly skull-sized, so swelling it outward drags
    // the hairline down over the brow. A vertical stretch plus a small
    // lift and front tuck keeps the forehead clear while the volume
    // gathers on top of his head.
    let cap = null;
    jamar.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const params = child.geometry.parameters || {};
        if (child.geometry.type === 'SphereGeometry' && params.thetaLength &&
            Math.abs(params.thetaLength - Math.PI * 0.52) < 0.01) cap = child;
    });
    if (cap) {
        cap.scale.set(1.02, 1.28, 1.02);
        cap.position.y += 0.006;
        cap.position.z -= 0.008;
    }

    // The beard (same fitted build Mike wears, in Jamar's color)
    jamar.add(createBeard(JAMAR_LOOK.beardColor));

    // The mic arm holds the microphone just below and in front of his
    // mouth. The shared rig has no elbow joint, so this arm gets one: the
    // forearm and hand wrap into a pivot group centered on the elbow
    // sphere (y -0.275), the same trick poseSeated uses for knees. Upper
    // arm hangs forward and in, forearm folds up toward the face, and the
    // mic parents to the pivot so every gesture carries it. The free arm
    // rests at his side.
    let micArm = null, freeArm = null;
    jamar.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm) {
            if (group.position.x > 0) micArm = group;
            else freeArm = group;
        }
    });
    if (micArm) {
        micArm.rotation.x = -0.6;
        micArm.rotation.z = -0.2;
        const elbowPivot = new THREE.Group();
        elbowPivot.position.y = -0.275;
        micArm.children.slice().forEach((part) => {
            if (part.isMesh && part.position.y < -0.4) {
                part.position.y += 0.275;
                elbowPivot.add(part);
            }
        });
        elbowPivot.rotation.x = -2.2;    // fold the forearm up toward the face
        elbowPivot.rotation.z = -0.45;   // and across, toward the centerline of his mouth
        micArm.add(elbowPivot);
        const mic = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.17, 8), matteBlack);
        mic.add(handle);
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.036, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.45, metalness: 0.6 })
        );
        head.position.y = 0.1;
        mic.add(head);
        mic.position.set(0, -0.295, 0.03);   // in the hand, at the end of the folded forearm
        mic.rotation.x = 2.35;   // head tipped up and back toward his mouth
        elbowPivot.add(mic);
    }
    if (freeArm) {
        freeArm.rotation.x = -0.25;
        freeArm.rotation.z = 0.12;
    }

    jamar.position.set(J.x, 0.055 + LAYOUT.stage.h, J.z);
    jamar.rotation.y = J.yaw;
    // The shared person builder only flags the head and torso for shadows
    // (castShadow on the Group itself is a no-op: only meshes cast). The
    // stage uplight throws his silhouette on the brick, so the whole man
    // casts: arms, legs, beard, mic and all.
    jamar.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
    });
    barGroup.add(registerOutdoorProp(jamar, 'jamar'));

    jamarRig = {
        group: jamar,
        micArm,
        freeArm
    };
}

// ============================================
// THE BAR COUNTER
// ============================================
function createBarCounter() {
    const B = LAYOUT.bar;    // along the right wall, front face toward the room (-x)
    const bar = new THREE.Group();
    bar.name = 'barCounter';

    const counterTexture = createCounterTexture();
    counterTexture.repeat.set(3, 1);
    const counterWood = new THREE.MeshStandardMaterial({ map: counterTexture, roughness: 0.35, metalness: 0.05 });
    const length = B.maxZ - B.minZ;
    const cz = (B.minZ + B.maxZ) / 2;

    // Counter top, overhanging its paneled front
    const top = new THREE.Mesh(new THREE.BoxGeometry(B.depth + 0.12, 0.07, length), counterWood);
    top.position.set(B.frontX + B.depth / 2, B.topY, cz);
    top.castShadow = true;
    top.receiveShadow = true;
    bar.add(top);

    const front = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, B.topY - 0.03, length),
        new THREE.MeshStandardMaterial({ color: PALETTE.wainscot, roughness: 0.75, metalness: 0.0 })
    );
    front.position.set(B.frontX + 0.03, (B.topY - 0.03) / 2, cz);
    bar.add(front);

    // Brass foot rail on little posts
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, length - 0.3, 8), brassMaterial);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(B.frontX - 0.12, 0.22, cz);
    bar.add(rail);
    [-1, 0, 1].forEach((k) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), brassMaterial);
        post.position.set(B.frontX - 0.12, 0.11, cz + k * (length / 2 - 0.4));
        bar.add(post);
    });

    // Beer taps on the counter: a brass tower with three tap handles
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.3, 10), brassMaterial);
    tower.position.set(B.frontX + 0.3, B.topY + 0.18, -0.9);
    bar.add(tower);
    [-0.09, 0, 0.09].forEach((dz, i) => {
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), chromeMaterial);
        spout.position.set(B.frontX + 0.24, B.topY + 0.26, -0.9 + dz);
        spout.rotation.z = 1.2;
        bar.add(spout);
        const tapHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.11, 0.025),
            new THREE.MeshStandardMaterial({ color: [0xd84a3f, 0x2f6e4f, 0x274b78][i], roughness: 0.5 })
        );
        tapHandle.position.set(B.frontX + 0.3, B.topY + 0.4, -0.9 + dz);
        tapHandle.rotation.x = dz * 1.6;
        bar.add(tapHandle);
    });

    // Stools along the front, waiting for the second set
    [-1.6, -0.4, 0.8].forEach((z, i) => {
        const stool = new THREE.Group();
        stool.name = `stool_${i}`;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), chromeMaterial);
        pole.position.y = 0.31;
        stool.add(pole);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.03, 12), chromeMaterial);
        foot.position.y = 0.015;
        stool.add(foot);
        const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12), vinylMaterial);
        cushion.position.y = 0.66;
        cushion.castShadow = true;
        stool.add(cushion);
        stool.position.set(B.frontX - 0.35, 0, z);
        bar.add(stool);
    });

    barGroup.add(registerOutdoorProp(bar, 'bar'));
}

// ============================================
// THE BACK BAR (shelves of glowing bottles)
// ============================================
function createBackBar() {
    const R = LAYOUT.room;
    const bottles = new THREE.Group();
    bottles.name = 'backBar';

    const shelfMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.wainscot, roughness: 0.7 });
    const bottleColors = [0xb3641e, 0x2e5e34, 0xbfd2d8, 0x2f5d8a, 0x7c2f36, 0x8a6d2f];
    const bodyGeometry = new THREE.CylinderGeometry(0.034, 0.036, 0.24, 8);
    const neckGeometry = new THREE.CylinderGeometry(0.011, 0.013, 0.09, 6);

    [1.5, 2.0].forEach((y, s) => {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 3.0), shelfMaterial);
        shelf.position.set(R.maxX - 0.18, y, -0.5);
        bottles.add(shelf);

        // Warm LED strip under the shelf lip, the classy back-bar glow
        const led = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.012, 2.9),
            new THREE.MeshBasicMaterial({ color: PALETTE.bulbWarm })
        );
        led.position.set(R.maxX - 0.28, y - 0.026, -0.5);
        bottles.add(led);

        for (let i = 0; i < 12; i++) {
            const color = bottleColors[(i + s * 3) % bottleColors.length];
            const material = new THREE.MeshStandardMaterial({
                color, roughness: 0.15, metalness: 0.0,
                transparent: true, opacity: 0.88,
                emissive: color, emissiveIntensity: 0.12
            });
            const bottle = new THREE.Group();
            const body = new THREE.Mesh(bodyGeometry, material);
            body.position.y = 0.12;
            bottle.add(body);
            const neck = new THREE.Mesh(neckGeometry, material);
            neck.position.y = 0.28;
            bottle.add(neck);
            bottle.position.set(
                R.maxX - 0.18 + (Math.random() - 0.5) * 0.05,
                y + 0.018,
                -1.85 + i * 0.245 + (Math.random() - 0.5) * 0.03
            );
            bottle.scale.setScalar(0.85 + Math.random() * 0.3);
            bottles.add(bottle);
        }
    });

    barGroup.add(registerOutdoorProp(bottles, 'bottles'));
}

// ============================================
// THE BARTENDER
// ============================================
function createBartender() {
    const bartender = createPerson({
        role: 'customer',
        x: 0, z: 0, rotationY: 0,
        shirtColor: 0xd8d3c8,
        pantsColor: 0x1f2126,
        skinTone: 0xc98e63,
        hairColor: 0x3a2a1c,
        hairStyle: 'short',
        hasApron: true,
        apronColor: 0x243447,
        dressShirt: true
    });

    // Bar towel over the shoulder, the universal badge of office
    const towel = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.02, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 })
    );
    towel.position.set(-0.14, 1.3, 0);
    towel.rotation.z = 0.15;
    bartender.add(towel);

    // Polishing pose: both hands up holding a glass and a cloth
    let polishArm = null;
    bartender.children.forEach((group) => {
        if (group.isGroup && group.userData.isArm) {
            group.rotation.x = -1.25;
            group.rotation.z = group.position.x > 0 ? -0.5 : 0.5;
            if (group.position.x > 0) {
                polishArm = group;
                const glass = createPintGlass();
                glass.position.set(0, -0.52, 0.02);
                glass.rotation.x = 1.25;    // held up, tilted into the cloth
                group.add(glass);
            }
        }
    });

    bartender.position.set(4.15, 0.055, -0.5);
    bartender.rotation.y = -Math.PI / 2;    // facing the room over the counter
    barGroup.add(registerOutdoorProp(bartender, 'bartender'));

    bartenderRig = { group: bartender, polishArm, baseYaw: -Math.PI / 2, phase: 1.2 };
}

// ============================================
// THE HIGH-TOP REGULARS
// ============================================
function createHighTop() {
    const H = LAYOUT.hightop;
    const hightop = new THREE.Group();
    hightop.name = 'hightop';

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.02, 8), matteBlack);
    pole.position.y = 0.51;
    hightop.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.035, 12), matteBlack);
    foot.position.y = 0.018;
    hightop.add(foot);
    const counterTexture = createCounterTexture();
    const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14),
        new THREE.MeshStandardMaterial({ map: counterTexture, roughness: 0.4 })
    );
    top.position.y = 1.05;
    top.castShadow = true;
    hightop.add(top);

    // Their round, parked mid-cheer
    [[-0.12, 0.08], [0.14, -0.06]].forEach(([dx, dz]) => {
        const glass = createPintGlass();
        glass.position.set(dx, 1.075, dz);
        hightop.add(glass);
    });

    hightop.position.set(H.x, 0, H.z);
    barGroup.add(registerOutdoorProp(hightop, 'hightop'));
}

function createPatrons() {
    const H = LAYOUT.hightop;

    // Two regulars, three-quarter turned toward the stage, mid-singalong.
    const configs = [
        {
            x: H.x - 0.5, z: H.z - 0.2, yaw: 2.55, phase: 0.9, glassSide: 1,
            look: {
                shirtColor: 0x2f7f78, pantsColor: 0x2a2230,
                skinTone: 0xe8b58a, hairColor: 0x3d2a1a,
                hairStyle: 'long', hasSkirt: true
            }
        },
        {
            x: H.x + 0.48, z: H.z + 0.28, yaw: -2.75, phase: 3.7, glassSide: -1,
            look: {
                shirtColor: 0xc7962e, pantsColor: 0x33415c,
                skinTone: 0x6e4426, hairColor: 0x14100c,
                hairStyle: 'buzz'
            }
        }
    ];

    configs.forEach((spot) => {
        const patron = createPerson(Object.assign({
            role: 'customer', x: 0, z: 0, rotationY: 0
        }, spot.look));
        patron.position.set(spot.x, 0.055, spot.z);
        patron.rotation.y = spot.yaw;
        const held = giveGlass(patron, spot.glassSide);
        if (held.arm) held.arm.rotation.x = -1.1;   // hand-held glass hovers at high-top height
        barGroup.add(registerOutdoorProp(patron, 'patrons'));
        patrons.push({
            group: patron, baseYaw: spot.yaw,
            glassArm: held.arm, glass: held.glass,
            restRx: -1.1, phase: spot.phase
        });
    });
}

// ============================================
// DECOR: NEON, BANNER, DISCO BALL, DARTS, POSTERS, STRING LIGHTS
// ============================================
function createNeonSign() {
    const N = LAYOUT.neon;
    const sign = new THREE.Group();
    sign.name = 'neonSign';

    const canvas = makeCanvas(512, 160);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 160);
    // Tube border
    ctx.strokeStyle = '#ff9fce';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ff4fa3';
    ctx.shadowBlur = 18;
    ctx.strokeRect(14, 14, 484, 132);
    // The words, glowing
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd7ea';
    ctx.shadowBlur = 24;
    ctx.fillText('KARAOKE', 256, 82);
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#9fdcff';
    ctx.shadowColor = '#3f9fe2';
    ctx.fillText('EVERY NIGHT', 256, 126);

    const material = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas), transparent: true
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), material);
    face.position.set(N.x, N.y, N.z + 0.02);
    sign.add(face);

    // A soft pink pool on the brick around it
    const light = new THREE.PointLight(PALETTE.neonPink, 0.7, 3.2);
    light.position.set(N.x, N.y, N.z + 0.35);
    sign.add(light);

    neonRig = { mats: [material], light, flicker: 0 };
    barGroup.add(registerOutdoorProp(sign, 'neon'));
}

function createBanner() {
    const B = LAYOUT.banner;
    const canvas = makeCanvas(1024, 128);
    const ctx = canvas.getContext('2d');
    // Festive paper banner over the stage
    ctx.fillStyle = '#2b3f8f';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#22337a';
    for (let i = 0; i < 16; i++) ctx.fillRect(i * 64, (i % 2) * 64, 64, 64);
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5c33b';
    ctx.fillText('HAPPY BIRTHDAY, JAMAR!', 512, 88);

    const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 0.34),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.85 })
    );
    banner.position.set(B.x, B.y, B.z + 0.02);
    banner.name = 'birthdayBanner';

    // Hung with visible string, slightly off level, like a real party
    banner.rotation.z = 0.02;
    const stringMaterial = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.9 });
    [-1.3, 1.3].forEach((dx) => {
        const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 4), stringMaterial);
        tie.position.set(B.x + dx, B.y + 0.26, B.z + 0.02);
        tie.rotation.z = -dx * 0.12;
        barGroup.add(tie);
    });

    barGroup.add(registerOutdoorProp(banner, 'banner'));
}

function createDiscoBall() {
    const D = LAYOUT.discoBall;
    const rig = new THREE.Group();
    rig.name = 'discoBall';

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, LAYOUT.room.height - D.y, 5), matteBlack);
    rod.position.set(D.x, (LAYOUT.room.height + D.y) / 2, D.z);
    rig.add(rod);

    discoBallGroup = new THREE.Group();
    const ball = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.19, 1),
        new THREE.MeshStandardMaterial({
            color: 0xcfd6e0, roughness: 0.18, metalness: 0.95, flatShading: true
        })
    );
    discoBallGroup.add(ball);
    discoBallGroup.position.set(D.x, D.y, D.z);
    rig.add(discoBallGroup);

    barGroup.add(registerOutdoorProp(rig, 'discoball'));
}

function createDartboard() {
    const D = LAYOUT.dartboard;
    const board = new THREE.Group();
    board.name = 'dartboard';

    const canvas = makeCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c1b1f';
    ctx.fillRect(0, 0, 256, 256);
    const cx = 128, cy = 128;
    for (let i = 0; i < 20; i++) {
        ctx.fillStyle = i % 2 ? '#20221f' : '#e6ddc8';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 118, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2);
        ctx.fill();
    }
    [[118, '#3f6e3f'], [112, null], [72, '#8f2f2a'], [66, null], [16, '#3f6e3f'], [8, '#8f2f2a']].forEach(([r, color]) => {
        if (!color) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    });

    const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.045, 20),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.85 })
    );
    face.rotation.z = -Math.PI / 2;    // face out from the left wall (+x)
    board.add(face);

    board.position.set(D.x, D.y, D.z);
    barGroup.add(registerOutdoorProp(board, 'dartboard'));
}

function createPosters() {
    const posters = new THREE.Group();
    posters.name = 'posters';
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x171419, roughness: 0.6 });

    const designs = [
        { title: 'OPEN MIC', sub: 'FRIDAYS 8PM', bg: '#233a5e', accent: '#f5c33b', z: -2.3 },
        { title: 'THE CORNER', sub: 'BOOTH TRIO  •  LIVE', bg: '#4a2340', accent: '#ff9fce', z: -1.35 }
    ];
    designs.forEach(({ title, sub, bg, accent, z }) => {
        const canvas = makeCanvas(128, 176);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 128, 176);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(8, 8, 112, 160);
        // Shrink-to-fit, same as the lyrics screen: the text scales down
        // just enough to stay inside the stroked border with a margin
        // (usable width between the border lines is about 104px).
        const fit = (px, text) => {
            ctx.font = `bold ${px}px Arial`;
            const w = ctx.measureText(text).width;
            if (w > 96) ctx.font = `bold ${Math.floor(px * 96 / w)}px Arial`;
        };
        ctx.fillStyle = accent;
        ctx.textAlign = 'center';
        fit(20, title);
        ctx.fillText(title, 64, 76);
        ctx.fillStyle = '#e9e2d2';
        fit(11, sub);
        ctx.fillText(sub, 64, 102);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.46), frameMaterial);
        frame.position.set(LAYOUT.room.minX + 0.03, 1.75, z);
        posters.add(frame);
        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.56),
            new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.9 })
        );
        art.position.set(LAYOUT.room.minX + 0.055, 1.75, z);
        art.rotation.y = Math.PI / 2;
        posters.add(art);
    });

    barGroup.add(registerOutdoorProp(posters, 'posters'));
}

function createStringLights() {
    const R = LAYOUT.room;
    const lights = new THREE.Group();
    lights.name = 'stringLights';

    // Three twinkle materials shared across the bulbs, phase-offset in
    // updateBar, so the whole room shimmers for the cost of three colors.
    stringLightMats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: PALETTE.bulbWarm }));
    const bulbGeometry = new THREE.SphereGeometry(0.02, 6, 5);
    const wireMaterial = new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.9 });

    // Two sagging runs: across the back wall and along the left wall
    const runs = [
        [
            new THREE.Vector3(R.minX + 0.3, R.height - 0.25, R.minZ + 0.12),
            new THREE.Vector3(-1.6, R.height - 0.62, R.minZ + 0.16),
            new THREE.Vector3(1.0, R.height - 0.45, R.minZ + 0.16),
            new THREE.Vector3(R.maxX - 0.3, R.height - 0.7, R.minZ + 0.12)
        ],
        [
            new THREE.Vector3(R.minX + 0.12, R.height - 0.3, R.minZ + 0.4),
            new THREE.Vector3(R.minX + 0.16, R.height - 0.7, -1.2),
            new THREE.Vector3(R.minX + 0.16, R.height - 0.45, 0.6),
            new THREE.Vector3(R.minX + 0.12, R.height - 0.75, 2.4)
        ]
    ];

    runs.forEach((points) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.005, 4), wireMaterial);
        lights.add(wire);
        const count = 16;
        for (let i = 0; i <= count; i++) {
            const bulb = new THREE.Mesh(bulbGeometry, stringLightMats[i % 3]);
            curve.getPoint(i / count, bulb.position);
            bulb.position.y -= 0.03;
            lights.add(bulb);
        }
    });

    barGroup.add(registerOutdoorProp(lights, 'stringlights'));
}

function createDecor() {
    createNeonSign();
    createBanner();
    createDiscoBall();
    createDartboard();
    createJukebox();
    createPosters();
    createStringLights();
}

/** A classic arched jukebox against the left wall, dartboard hanging
 *  just past its front edge. Tapping it opens main.js's song picker,
 *  which drives the lyrics screen through setNowPlaying. Built facing
 *  local +z, then turned to face into the room. */
function createJukebox() {
    const J = LAYOUT.jukebox;
    const juke = new THREE.Group();
    juke.name = 'jukebox';

    const cabinet = new THREE.MeshStandardMaterial({ color: 0x5c2e1f, roughness: 0.55, metalness: 0.08 });

    // Plinth, body, and the arched crown
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.48), matteBlack);
    plinth.position.y = 0.035;
    juke.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.88, 0.55), cabinet);
    body.position.y = 0.51;
    body.castShadow = true;
    juke.add(body);
    const arch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.55, 16, 1, false, Math.PI / 2, Math.PI),
        cabinet
    );
    arch.rotation.x = Math.PI / 2;   // axis along depth, flat side down
    arch.position.y = 0.95;
    juke.add(arch);

    // The lit glass: a warm half-disc window in the arch and the record
    // chamber below it, glowing like the bottle shelves
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a2417, emissive: 0xffc887, emissiveIntensity: 0.55, roughness: 0.4
    });
    const windowArch = new THREE.Mesh(new THREE.CircleGeometry(0.31, 16, 0, Math.PI), glowMaterial);
    windowArch.position.set(0, 0.95, 0.281);
    juke.add(windowArch);
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.02), glowMaterial);
    chamber.position.set(0, 0.8, 0.27);
    juke.add(chamber);
    // Three 45s waiting in the chamber
    [-0.16, 0, 0.16].forEach((x) => {
        const record = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 14), matteBlack);
        record.rotation.x = Math.PI / 2;
        record.position.set(x, 0.82, 0.285);
        juke.add(record);
    });

    // Neon tubes tracing the arch, pink outside blue inside, always lit
    const pinkTube = new THREE.Mesh(
        new THREE.TorusGeometry(0.355, 0.016, 8, 18, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0xff5fa8 })
    );
    pinkTube.position.set(0, 0.95, 0.28);
    juke.add(pinkTube);
    const blueTube = new THREE.Mesh(
        new THREE.TorusGeometry(0.305, 0.014, 8, 18, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x57b0e3 })
    );
    blueTube.position.set(0, 0.95, 0.28);
    juke.add(blueTube);

    // Glowing side pilasters
    const pilaster = new THREE.MeshStandardMaterial({
        color: 0x1c1a20, emissive: 0x57b0e3, emissiveIntensity: 0.5, roughness: 0.5
    });
    [-1, 1].forEach((side) => {
        const column = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 0.06), pilaster);
        column.position.set(side * 0.375, 0.52, 0.26);
        juke.add(column);
    });

    // Speaker grille with chrome bars
    const grille = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.34, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x241f26, roughness: 0.9 })
    );
    grille.position.set(0, 0.33, 0.278);
    juke.add(grille);
    [0.22, 0.33, 0.44].forEach((y) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.018, 0.03), chromeMaterial);
        bar.position.set(0, y, 0.28);
        juke.add(bar);
    });

    // Song-picker buttons, the same chunky friendly row the console wears
    [0xd84a3f, 0xf5c33b, 0x57b0e3, 0x6fce7d].forEach((color, i) => {
        const button = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10),
            new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })
        );
        button.rotation.x = Math.PI / 2;
        button.position.set(-0.12 + i * 0.08, 0.575, 0.285);
        juke.add(button);
    });

    juke.position.set(J.x, 0, J.z);
    juke.rotation.y = J.yaw;
    barGroup.add(registerOutdoorProp(juke, 'jukebox'));
}

// ============================================
// HOUSE LIGHTING (the room's own fixtures)
// ============================================
function createPendant(x, z, dropTo, intensity, distance) {
    const pendant = new THREE.Group();
    const H = LAYOUT.room.height;

    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - dropTo, 4), matteBlack);
    cord.position.set(x, (H + dropTo) / 2, z);
    pendant.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 12, 1, true), matteBlack);
    shade.position.set(x, dropTo + 0.05, z);
    pendant.add(shade);
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
    );
    bulb.position.set(x, dropTo, z);
    pendant.add(bulb);
    const light = new THREE.PointLight(PALETTE.bulbWarm, intensity, distance, 1.6);
    light.position.set(x, dropTo - 0.05, z);
    pendant.add(light);

    return pendant;
}

function createHouseLighting() {
    const B = LAYOUT.booth;
    const H = LAYOUT.hightop;

    // Warm pendants: one over the booth, one over the high-top, one over
    // the bar. Low and cozy.
    barGroup.add(createPendant(B.centerX, B.tableZ, 1.95, 0.95, 4.5));
    barGroup.add(createPendant(H.x, H.z, 2.0, 0.85, 4.2));
    barGroup.add(createPendant(LAYOUT.bar.frontX + 0.25, -0.5, 2.1, 0.8, 4.2));

    // The stage wash: a truss bar out in the room throwing magenta from
    // one side and blue from the other, crossed on Jamar.
    const S = LAYOUT.stage;
    const truss = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), matteBlack);
    truss.rotation.z = Math.PI / 2;
    truss.position.set(S.x + 0.3, 2.9, S.z + 1.35);
    barGroup.add(truss);

    [
        { color: PALETTE.stageMagenta, dx: -0.75, phase: 0 },
        { color: PALETTE.stageBlue, dx: 0.95, phase: Math.PI }
    ].forEach(({ color, dx, phase }) => {
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.14, 8), matteBlack);
        housing.position.set(S.x + 0.3 + dx, 2.85, S.z + 1.35);
        housing.rotation.x = 0.9;
        barGroup.add(housing);

        const spot = new THREE.SpotLight(color, 1.8, 9, 0.5, 0.6, 1.2);
        spot.position.set(S.x + 0.3 + dx, 2.85, S.z + 1.35);
        spot.target.position.set(LAYOUT.jamar.x, 1.1, LAYOUT.jamar.z);
        barGroup.add(spot);
        barGroup.add(spot.target);
        stageSpots.push({ light: spot, phase });
    });

    // The follow spot, done the small-bar way: a little PAR can on the
    // floor in front of the stage, throwing warm white up at Jamar. Held
    // steady (not in stageSpots) so while the magenta and blue trade the
    // lead around him, one constant light says who the star is. From the
    // floor the beam stays off the high-top regulars entirely, and it is
    // the room's one shadow-casting spot: bright enough that Jamar's
    // silhouette climbs the brick behind him (the shadow map refresh in
    // updateBar keeps the silhouette swaying with him).
    const J = LAYOUT.jamar;
    const canX = J.x + 0.25;              // a touch off-center, so the
    const canZ = S.z + S.d / 2 + 0.8;     // silhouette leans onto the brick
    const canBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 10), matteBlack);
    canBase.position.set(canX, 0.015, canZ);
    barGroup.add(canBase);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.16, 8), matteBlack);
    can.position.set(canX, 0.12, canZ);
    can.rotation.set(-0.9, 0, 0.16);      // tipped back and leaned to face him
    barGroup.add(can);

    const uplight = new THREE.SpotLight(PALETTE.spotWhite, 1.7, 8, 0.4, 0.45, 1.2);
    uplight.position.set(canX, 0.14, canZ);
    uplight.target.position.set(J.x, 1.35, J.z);
    uplight.castShadow = true;
    uplight.shadow.mapSize.set(512, 512);
    uplight.shadow.camera.near = 0.3;
    uplight.shadow.camera.far = 7;
    uplight.shadow.bias = -0.0005;
    barGroup.add(uplight);
    barGroup.add(uplight.target);

    // The lyrics screen spills a little cool light onto the stage
    const tvGlow = new THREE.PointLight(0x88aaff, 0.5, 3.0);
    tvGlow.position.set(LAYOUT.tv.x, LAYOUT.tv.y - 0.2, LAYOUT.tv.z + 0.6);
    barGroup.add(tvGlow);
}

// ============================================
// PER-FRAME UPDATE
// ============================================
let _t = 0;    // bar clock, seconds
let _shadowAccum = 0;    // seconds since the last shadow map refresh

/**
 * Advance the bar one frame: Jamar works the stage, the speakers thump,
 * the lyrics roll and sweep, Steve and Mike toast on their own clocks,
 * the bartender polishes, the regulars sway, the disco ball turns, the
 * string lights twinkle, and the neon holds its hum (mostly). Everything
 * holds still under prefers-reduced-motion. Driven by main.js's loop.
 */
export function updateBar(deltaTime) {
    if (_reducedMotion.matches) return;
    _t += deltaTime;

    // The shared renderer renders shadow maps on demand only (autoUpdate
    // is off), and this windowless bar never runs the day/night pass that
    // normally requests them. Refresh a few times per second (the shared
    // rig's cadence) so Jamar's sway carries into the silhouette the
    // stage uplight throws on the brick. Reduced-motion visitors return
    // above: their bar is still, so the init-time shadow render holds.
    _shadowAccum += deltaTime;
    if (_shadowAccum >= 0.33) {
        _shadowAccum = 0;
        getRenderer().shadowMap.needsUpdate = true;
    }

    const beat = Math.max(0, Math.sin(_t * Math.PI * 2 * BEAT_HZ));

    // ---- Jamar: sway back and forth, mic held to his mouth ----
    // No bouncing or arm-waving. He is a swayer, per Steve: an easy
    // side-to-side lean with a slow turn to take in the room, the free
    // arm loose at his side, the mic never leaving his mouth.
    if (jamarRig) {
        jamarRig.group.rotation.z = Math.sin(_t * 0.9) * 0.085;
        jamarRig.group.rotation.y = LAYOUT.jamar.yaw + Math.sin(_t * 0.33) * 0.12;
        if (jamarRig.freeArm) {
            jamarRig.freeArm.rotation.x = -0.25 + Math.sin(_t * 0.9) * 0.07;
            jamarRig.freeArm.rotation.z = 0.12 + Math.sin(_t * 0.9 + 0.6) * 0.05;
        }
        if (jamarRig.micArm) {
            // Subtle: the arm is bent at the elbow now, so a little shoulder
            // motion moves the mic plenty
            jamarRig.micArm.rotation.x = -0.6 + Math.sin(_t * 0.9) * 0.03;
        }
    }

    // ---- The booth: sway toward the stage, toast on offset clocks ----
    boothFriends.forEach((friend) => {
        friend.group.rotation.y = friend.baseYaw + Math.sin(_t * 0.5 + friend.phase) * 0.07;
        friend.group.rotation.z = Math.sin(_t * 0.8 + friend.phase * 1.7) * 0.02;
        if (friend.glassArm) {
            // A slow cycle: mostly resting, rising into a toast at the top
            const raise = Math.pow(Math.max(0, Math.sin(_t * 0.3 + friend.phase)), 3);
            friend.glassArm.rotation.x = friend.restRx - raise * 0.85;
            // The beer stays level no matter what the arm is doing
            if (friend.glass) friend.glass.rotation.x = -friend.glassArm.rotation.x;
        }
    });

    // ---- The bartender: polish, sway, enjoy the show ----
    if (bartenderRig) {
        bartenderRig.group.rotation.y = bartenderRig.baseYaw + Math.sin(_t * 0.4 + bartenderRig.phase) * 0.1;
        if (bartenderRig.polishArm) {
            bartenderRig.polishArm.rotation.z = -0.5 + Math.sin(_t * 3.1) * 0.09;
        }
    }

    // ---- The regulars at the high-top ----
    patrons.forEach((patron) => {
        patron.group.rotation.y = patron.baseYaw + Math.sin(_t * 0.45 + patron.phase) * 0.09;
        patron.group.rotation.z = Math.sin(_t * 1.6 + patron.phase) * 0.025;    // bouncier than the booth
        if (patron.glassArm) {
            const raise = Math.pow(Math.max(0, Math.sin(_t * 0.26 + patron.phase)), 3);
            patron.glassArm.rotation.x = patron.restRx - raise * 1.0;
            if (patron.glass) patron.glass.rotation.x = -patron.glassArm.rotation.x;
        }
    });

    // ---- Speakers: the cones thump with the beat ----
    const thump = 1 + beat * beat * beat * 0.18;
    speakerCones.forEach((cone) => {
        cone.scale.set(1, thump, 1);    // cones are rotated: local y faces the room
    });

    // ---- Disco ball: a slow, committed spin ----
    if (discoBallGroup) discoBallGroup.rotation.y += deltaTime * 0.5;

    // ---- Stage wash: magenta and blue trade the lead ----
    stageSpots.forEach(({ light, phase }) => {
        light.intensity = 1.5 + Math.sin(_t * 0.8 + phase) * 0.6;
    });

    // ---- String lights: three-phase twinkle ----
    stringLightMats.forEach((material, i) => {
        const w = 0.72 + 0.28 * Math.sin(_t * 2.1 + i * 2.1);
        material.color.setRGB(1.0 * w, 0.85 * w, 0.63 * w);
    });

    // ---- Neon: steady hum with the occasional honest flicker ----
    if (neonRig) {
        if (neonRig.flicker > 0) {
            neonRig.flicker -= deltaTime;
            const dip = 0.35 + Math.random() * 0.4;
            neonRig.mats.forEach((material) => { material.opacity = dip; });
            neonRig.light.intensity = 0.7 * dip;
        } else {
            neonRig.mats.forEach((material) => { material.opacity = 1; });
            neonRig.light.intensity = 0.7;
            if (Math.random() < deltaTime * 0.08) neonRig.flicker = 0.1 + Math.random() * 0.12;
        }
    }

    // ---- The lyrics screen: sweep the line, then roll to the next ----
    if (tv) {
        tv.lineTime += deltaTime;
        const spl = nowPlaying.secondsPerLine || 4.2;
        if (tv.lineTime >= spl) {
            tv.lineTime -= spl;
            tv.lineIndex = (tv.lineIndex + 1) % nowPlaying.lines.length;
        }
        tv.drawTimer += deltaTime;
        if (tv.drawTimer >= 0.12) {    // ~8 fps is plenty for a bar TV
            tv.drawTimer = 0;
            drawTvFrame(tv.lineTime / spl);
        }
    }
}

/** The root bar group (exposed for tests and future passes). */
export function getBarGroup() {
    return barGroup;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { LAYOUT, PALETTE, seatHeightY };
